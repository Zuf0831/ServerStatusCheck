<?php
/**
 * Shared bootstrap: config, session, JSON helpers, and the file-backed store.
 *
 * The store is a single JSON file. Correctness under concurrent writes comes
 * from two things working together:
 *
 *   1. An exclusive flock() held across the whole read-modify-write cycle, so
 *      two people clicking "Claim" at the same moment are serialised.
 *   2. Writing to a temp file and rename()-ing it over the target. rename() is
 *      atomic on Linux, so a reader never observes a half-written file and
 *      therefore needs no lock of its own.
 */

declare(strict_types=1);

if (!is_file(__DIR__ . '/config.php')) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Server not configured: api/config.php is missing.']);
    exit;
}
require __DIR__ . '/config.php';

// ── Session ─────────────────────────────────────────────────────────────────

function boot_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => $https,
    ]);
    session_name('SERVERBOARD');
    session_start();
}

function current_user(): ?string
{
    boot_session();
    $ok   = ($_SESSION['authed'] ?? false) === true;
    $name = $_SESSION['name'] ?? null;
    return ($ok && is_string($name) && $name !== '') ? $name : null;
}

function require_user(): string
{
    $name = current_user();
    if ($name === null) {
        json_out(['error' => 'unauthorized'], 401);
    }
    return $name;
}

// ── Request / response helpers ──────────────────────────────────────────────

function json_out(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function require_method(string $method): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== $method) {
        header('Allow: ' . $method);
        json_out(['error' => 'method not allowed'], 405);
    }
}

function json_body(): array
{
    $raw  = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/** Trim, collapse whitespace, strip control characters, and cap the length. */
function clean_text($value, int $max): string
{
    if (!is_string($value)) {
        return '';
    }
    $value = preg_replace('/[\x00-\x1F\x7F]/u', '', $value) ?? '';
    $value = preg_replace('/\s+/u', ' ', $value) ?? '';
    return mb_substr(trim($value), 0, $max);
}

// ── Store ───────────────────────────────────────────────────────────────────

function data_dir(): string
{
    return rtrim(DATA_DIR, '/\\');
}

function data_file(): string
{
    return data_dir() . '/board.json';
}

function ensure_data_dir(): string
{
    $dir = data_dir();
    if (!is_dir($dir) && !@mkdir($dir, 0770, true) && !is_dir($dir)) {
        json_out(['error' => 'Data directory could not be created: ' . $dir], 500);
    }
    if (!is_writable($dir)) {
        json_out(['error' => 'Data directory is not writable: ' . $dir], 500);
    }
    return $dir;
}

function board_default(): array
{
    return ['servers' => [], 'log' => []];
}

/**
 * Reconcile stored state against the SERVERS list in config, so editing that
 * list adds or drops rows without anyone touching the JSON file by hand.
 */
function board_merge_config(array $board): array
{
    $stored  = is_array($board['servers'] ?? null) ? $board['servers'] : [];
    $servers = [];

    foreach (SERVERS as $definition) {
        $id    = $definition['id'];
        $row   = is_array($stored[$id] ?? null) ? $stored[$id] : [];
        $inUse = ($row['status'] ?? 'available') === 'in-use';

        $servers[$id] = [
            'status' => $inUse ? 'in-use' : 'available',
            'heldBy' => $inUse && is_string($row['heldBy'] ?? null) ? $row['heldBy'] : null,
            'since'  => $inUse && is_numeric($row['since'] ?? null) ? (int) $row['since'] : null,
            'note'   => $inUse && is_string($row['note'] ?? null) ? $row['note'] : '',
        ];
    }

    $log = is_array($board['log'] ?? null) ? array_values($board['log']) : [];

    return ['servers' => $servers, 'log' => array_slice($log, 0, LOG_LIMIT)];
}

/** Lock-free read. Safe because every write lands via an atomic rename(). */
function board_read(): array
{
    $file = data_file();
    if (!is_file($file)) {
        return board_merge_config(board_default());
    }
    $raw = @file_get_contents($file);
    if ($raw === false || $raw === '') {
        return board_merge_config(board_default());
    }
    $data = json_decode($raw, true);
    return board_merge_config(is_array($data) ? $data : board_default());
}

function board_write(array $board): void
{
    ensure_data_dir();
    $file = data_file();
    $tmp  = $file . '.' . bin2hex(random_bytes(6)) . '.tmp';

    $json = json_encode($board, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        json_out(['error' => 'could not encode board'], 500);
    }
    if (@file_put_contents($tmp, $json) === false) {
        @unlink($tmp);
        json_out(['error' => 'could not write data file'], 500);
    }
    @chmod($tmp, 0660);
    // Atomic within the same filesystem: readers see old or new, never partial.
    if (!@rename($tmp, $file)) {
        @unlink($tmp);
        json_out(['error' => 'could not commit data file'], 500);
    }
}

/**
 * Run $mutator against the current board under an exclusive lock and persist
 * whatever it returns. This is the only supported way to change state.
 */
function board_mutate(callable $mutator): array
{
    $dir  = ensure_data_dir();
    $lock = @fopen($dir . '/.board.lock', 'c');
    if ($lock === false) {
        json_out(['error' => 'could not open lock file'], 500);
    }
    if (!flock($lock, LOCK_EX)) {
        fclose($lock);
        json_out(['error' => 'could not acquire lock'], 503);
    }

    try {
        $next = $mutator(board_read());
        board_write($next);
        return $next;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function server_label(string $serverId): string
{
    foreach (SERVERS as $definition) {
        if ($definition['id'] === $serverId) {
            return $definition['label'];
        }
    }
    return $serverId;
}

function push_log(array $board, string $user, string $action, string $serverId): array
{
    array_unshift($board['log'], [
        'ts'     => now_ms(),
        'user'   => $user,
        'action' => $action,
        'server' => server_label($serverId),
    ]);
    $board['log'] = array_slice($board['log'], 0, LOG_LIMIT);
    return $board;
}

function now_ms(): int
{
    return (int) round(microtime(true) * 1000);
}

function valid_server_id($id): ?string
{
    if (!is_string($id)) {
        return null;
    }
    foreach (SERVERS as $definition) {
        if ($definition['id'] === $id) {
            return $id;
        }
    }
    return null;
}

/** Shape the board for the client: servers as an ordered array, plus identity. */
function board_response(array $board, string $me): array
{
    $servers = [];
    foreach (SERVERS as $definition) {
        $id  = $definition['id'];
        $row = $board['servers'][$id];
        $servers[] = [
            'id'     => $id,
            'label'  => $definition['label'],
            'status' => $row['status'],
            'heldBy' => $row['heldBy'],
            'since'  => $row['since'],
            'note'   => $row['note'],
        ];
    }
    return ['me' => $me, 'servers' => $servers, 'log' => $board['log']];
}
