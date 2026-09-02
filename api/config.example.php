<?php
/**
 * Copy this file to config.php and edit it. config.php is gitignored.
 *
 *   cp api/config.example.php api/config.php
 */

// ── Your servers ────────────────────────────────────────────────────────────
// This is the single source of truth. The frontend renders whatever it gets
// back from the API, so adding a server here is the only change needed.
const SERVERS = [
    ['id' => 'staging', 'label' => 'MRM STAGING Server'],
    ['id' => 'prod',    'label' => 'MRM PROD Server'],
];

// ── Shared team password ────────────────────────────────────────────────────
// Generate the hash with:  php tools/hash-password.php 'your-password-here'
// Never put the plain password in this file.
const TEAM_PASSWORD_HASH = '$2y$12$REPLACE.THIS.WITH.A.REAL.HASH.FROM.THE.TOOL.SCRIPT.xxxxxxxx';

// ── Where the JSON data file lives ──────────────────────────────────────────
// MUST be outside public_html so nobody can fetch it over HTTP.
// On cPanel, if this API sits at  /home/USER/public_html/api  then
// '/../../serverboard-data' resolves to  /home/USER/serverboard-data  — good.
// Set an absolute path instead if you prefer, e.g. '/home/USER/serverboard-data'.
const DATA_DIR = __DIR__ . '/../../serverboard-data';

// How many activity-log entries to keep.
const LOG_LIMIT = 25;
