#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * Worker kirim WA massal Manage Data — dipanggil background oleh API setelah job dibuat.
 * Contoh: php scripts/manage_wa_bulk_worker.php 123
 */

$jobId = isset($argv[1]) ? (int) $argv[1] : 0;
if ($jobId <= 0) {
    fwrite(STDERR, "Usage: php manage_wa_bulk_worker.php <job_id>\n");
    exit(1);
}

require dirname(__DIR__) . '/vendor/autoload.php';

use App\Services\ManageWaBulkService;

set_time_limit(0);
ignore_user_abort(true);

try {
    ManageWaBulkService::processJob($jobId);
} catch (\Throwable $e) {
    error_log('manage_wa_bulk_worker: ' . $e->getMessage());
    exit(1);
}

exit(0);
