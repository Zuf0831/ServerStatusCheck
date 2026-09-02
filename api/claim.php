<?php
/**
 * POST /api/claim.php  { serverId, note?, expect: "available"|"takeover" }
 *
 * `expect` is what the UI believed the state to be when the button was drawn.
 * If reality has moved on since then we refuse with 409 and hand back the
 * fresh board, so nobody silently steals a server that someone else grabbed
 * in the last few seconds.
 */

declare(strict_types=1);
require __DIR__ . '/_bootstrap.php';

require_method('POST');
$me = require_user();

$body     = json_body();
$serverId = valid_server_id($body['serverId'] ?? null);
if ($serverId === null) {
    json_out(['error' => 'unknown server'], 400);
}

$note   = clean_text($body['note'] ?? '', 120);
$expect = ($body['expect'] ?? 'available') === 'takeover' ? 'takeover' : 'available';

$conflict = null;

$board = board_mutate(function (array $board) use ($serverId, $me, $note, $expect, &$conflict) {
    $row   = $board['servers'][$serverId];
    $inUse = $row['status'] === 'in-use';

    // Already yours: nothing to do, but let the note be updated.
    if ($inUse && $row['heldBy'] === $me) {
        if ($note !== '') {
            $board['servers'][$serverId]['note'] = $note;
        }
        return $board;
    }

    if ($expect === 'available' && $inUse) {
        $conflict = $row['heldBy'];
        return $board; // unchanged
    }

    $board['servers'][$serverId] = [
        'status' => 'in-use',
        'heldBy' => $me,
        'since'  => now_ms(),
        'note'   => $note,
    ];

    return push_log($board, $me, $inUse ? 'took over' : 'claimed', $serverId);
});

$payload = board_response($board, $me);

if ($conflict !== null) {
    $payload['error']  = 'conflict';
    $payload['message'] = $conflict . ' claimed it first.';
    json_out($payload, 409);
}

json_out($payload);
