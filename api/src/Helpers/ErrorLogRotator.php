<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Rotasi api/error.log agar tidak membengkak tanpa batas di Hostinger.
 */
final class ErrorLogRotator
{
    private const MAX_BYTES = 15728640; // 15 MiB
    private const KEEP_TAIL_BYTES = 1048576; // 1 MiB terakhir setelah rotasi darurat

    public static function maybeRotate(string $logPath): void
    {
        if ($logPath === '' || !is_file($logPath)) {
            return;
        }
        $size = @filesize($logPath);
        if ($size === false || $size < self::MAX_BYTES) {
            return;
        }

        $rotated = $logPath . '.' . date('Ymd-His');
        // Rename penuh bila memungkinkan
        if (@rename($logPath, $rotated)) {
            @touch($logPath);
            @chmod($logPath, 0640);
            return;
        }

        // Fallback: potong, sisakan ekor
        $fh = @fopen($logPath, 'c+b');
        if ($fh === false) {
            return;
        }
        try {
            if (!flock($fh, LOCK_EX | LOCK_NB)) {
                return;
            }
            $start = max(0, $size - self::KEEP_TAIL_BYTES);
            fseek($fh, $start);
            $tail = stream_get_contents($fh) ?: '';
            ftruncate($fh, 0);
            rewind($fh);
            fwrite($fh, "[rotated " . date('c') . " previous_size={$size}]\n" . $tail);
            flock($fh, LOCK_UN);
        } finally {
            fclose($fh);
        }
    }
}
