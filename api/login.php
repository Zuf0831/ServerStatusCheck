<?php
/**
 * POST /api/login.php  { name, password }
 *
 * One shared team password gates the whole board. The name is only an
 * identity label, but because it is stored in the session rather than sent
 * with each write, the activity log can't be forged by editing a request.
 */

declare(strict_types=1);
require __DIR__ . '/_bootstrap.php';

require_method('POST');

$body     = json_body();
$name     = clean_text($body['name'] ?? '', 40);
$password = is_string($body['password'] ?? null) ? $body['password'] : '';

if ($name === '') {
    json_out(['error' => 'Enter your name.'], 400);
}

if (!password_verify($password, TEAM_PASSWORD_HASH)) {
    usleep(400000); // blunt the speed of guessing
    json_out(['error' => 'Wrong team password.'], 401);
}

boot_session();
session_regenerate_id(true); // don't let a pre-set session id survive login
$_SESSION['authed'] = true;
$_SESSION['name']   = $name;

json_out(board_response(board_read(), $name));
