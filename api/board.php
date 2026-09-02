<?php
/** GET /api/board.php — current state of every server plus the activity log. */

declare(strict_types=1);
require __DIR__ . '/_bootstrap.php';

require_method('GET');
$me = require_user();

json_out(board_response(board_read(), $me));
