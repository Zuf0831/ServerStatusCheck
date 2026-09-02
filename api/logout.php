<?php
/**
 * POST /api/logout.php — drop the session.
 *
 * Deliberately does NOT release whatever the user was holding: signing out at
 * the end of the day shouldn't quietly mark a server free while it's still busy.
 */

declare(strict_types=1);
require __DIR__ . '/_bootstrap.php';

require_method('POST');
boot_session();

$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $p = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
}
session_destroy();

json_out(['ok' => true]);
