<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Helper untuk resolve path file dengan aman (anti path traversal).
 *
 * Pola pemakaian:
 *   $real = PathSafetyHelper::resolveWithinBase($baseDir, $relativePath);
 *   if ($real === null) { return 404; }
 *   // gunakan $real (sudah pasti di dalam $baseDir, ada di disk, readable)
 */
final class PathSafetyHelper
{
    /**
     * Resolve $relativePath terhadap $baseDir. Mengembalikan absolute path
     * yang sudah pasti berada di bawah $baseDir, atau null jika tidak aman.
     *
     * Cek meliputi:
     *  - Hapus prefix dan trailing slash/backslash.
     *  - Tolak segmen ".." (path traversal).
     *  - Tolak path absolut yang menunjuk ke luar base (mis. /etc/passwd).
     *  - realpath($baseDir) harus prefix dari realpath($candidate).
     *  - File harus ada dan readable (opsional via $mustBeFile).
     *
     * @param string $baseDir       Folder dasar (boleh tanpa trailing separator).
     * @param string $relativePath  Path relatif dari DB / input.
     * @param bool   $mustBeFile    Jika true, hanya kembali jika is_file() + is_readable().
     */
    public static function resolveWithinBase(string $baseDir, string $relativePath, bool $mustBeFile = true): ?string
    {
        $baseDir = rtrim($baseDir, "/\\");
        if ($baseDir === '') {
            return null;
        }

        // Normalisasi separator + trim
        $normalized = str_replace(['\\', '/'], DIRECTORY_SEPARATOR, $relativePath);
        $normalized = trim($normalized, DIRECTORY_SEPARATOR);
        if ($normalized === '') {
            return null;
        }

        // Tolak path traversal lebih awal (sebelum disentuh realpath).
        foreach (explode(DIRECTORY_SEPARATOR, $normalized) as $segment) {
            if ($segment === '..' || $segment === '.') {
                return null;
            }
        }

        $candidate = $baseDir . DIRECTORY_SEPARATOR . $normalized;

        $realBase = realpath($baseDir);
        $realFile = realpath($candidate);
        if ($realBase === false || $realFile === false) {
            return null;
        }

        // Pastikan benar-benar di bawah base (cegah symlink jahat).
        $realBaseWithSep = $realBase . DIRECTORY_SEPARATOR;
        if (strncmp($realFile, $realBaseWithSep, strlen($realBaseWithSep)) !== 0
            && $realFile !== $realBase) {
            return null;
        }

        if ($mustBeFile && (!is_file($realFile) || !is_readable($realFile))) {
            return null;
        }

        return $realFile;
    }
}
