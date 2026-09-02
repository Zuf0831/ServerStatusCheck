<?php
/**
 * POST /api/release.php  { serverId }
 *
 * Only the current holder may release. Anyone else has to use "take over",
 * which is logged as such — releasing someone else's hold would leave no
 * trace of who did it.
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

$conflict = null;

$board = board_mutate(function (array $board) use ($serverId, $me, &$conflict) {
    $row = $board['servers'][$serverId];

    if ($row['status'] !== 'in-use') {
        return $board; // already free; treat as success
    }
    if ($row['heldBy'] !== $me) {
        $conflict = $row['heldBy'];
        return $board;
    }

    $board['servers'][$serverId] = [
        'status' => 'available',
        'heldBy' => null,
        'since'  => null,
        'note'   => '',
    ];

    return push_log($board, $me, 'released', $serverId);
});

$payload = board_response($board, $me);

if ($conflict !== null) {
    $payload['error']   = 'conflict';
    $payload['message'] = 'That server is held by ' . $conflict . ' now.';
    json_out($payload, 409);
}

json_out($payload);
