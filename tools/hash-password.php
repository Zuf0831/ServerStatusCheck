<?php
/**
 * Generate a bcrypt hash for the shared team password.
 *
 *   php tools/hash-password.php 'your-password-here'
 *
 * Paste the output into api/config.php as TEAM_PASSWORD_HASH.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("CLI only.\n");
}
$password = $argv[1] ?? null;
if ($password === null || $password === '') {
    fwrite(STDERR, "Usage: php tools/hash-password.php 'your-password-here'\n");
    exit(1);
}
if (strlen($password) < 8) {
    fwrite(STDERR, "Refusing: use at least 8 characters.\n");
    exit(1);
}
echo password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]), "\n";
