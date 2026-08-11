<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Kompresi & (jika memungkinkan) konversi ke WebP untuk aset website publik.
 * Encode ke file temporer — di Windows/XAMPP output buffer + imagejpeg(..., null) sering kosong/gagal.
 *
 * Semua fungsi GD dipanggil dengan prefiks \ agar merujuk ke global namespace (bukan App\Helpers\…).
 */
final class WebsiteImageProcessor
{
    /** @return array{0: int, 1: int} max lebar/tinggi */
    public static function maxDimensions(string $context): array
    {
        return match ($context) {
            'berita_cover' => [1600, 1600],
            'berita_konten' => [1920, 1920],
            'galeri' => [2200, 2200],
            'banner' => [2800, 1200],
            'seo_og' => [1200, 630],
            'seo_favicon' => [512, 512],
            default => [1920, 1920],
        };
    }

    /**
     * @return array{binary: string, mime: string, ext: string}
     */
    public static function process(string $sourcePath, string $mime, string $context, int $webpQuality, int $jpegQuality): array
    {
        if (!\extension_loaded('gd')) {
            throw new \RuntimeException('Ekstensi PHP gd tidak aktif (aktifkan di php.ini).');
        }
        if (!\is_readable($sourcePath)) {
            throw new \RuntimeException('Berkas sumber tidak terbaca');
        }
        [$maxW, $maxH] = self::maxDimensions($context);

        $img = self::createImage($sourcePath, $mime);
        if ($img === false) {
            throw new \RuntimeException('Gagal membaca gambar (format tidak didukung atau berkas rusak)');
        }

        $srcW = \imagesx($img);
        $srcH = \imagesy($img);
        if ($srcW < 1 || $srcH < 1) {
            \imagedestroy($img);
            throw new \RuntimeException('Ukuran gambar tidak valid');
        }

        $ratio = \min($maxW / $srcW, $maxH / $srcH, 1.0);
        $dstW = \max(1, (int) \round($srcW * $ratio));
        $dstH = \max(1, (int) \round($srcH * $ratio));

        $dst = \imagecreatetruecolor($dstW, $dstH);
        if ($dst === false) {
            \imagedestroy($img);
            throw new \RuntimeException('Gagal membuat canvas');
        }

        \imagealphablending($dst, false);
        \imagesavealpha($dst, true);
        $transparent = \imagecolorallocatealpha($dst, 0, 0, 0, 127);
        \imagefilledrectangle($dst, 0, 0, $dstW, $dstH, $transparent);

        \imagealphablending($dst, true);
        \imagecopyresampled($dst, $img, 0, 0, 0, 0, $dstW, $dstH, $srcW, $srcH);
        \imagedestroy($img);

        $qWebp = \max(60, \min(100, $webpQuality));
        $qJpeg = \max(70, \min(95, $jpegQuality));

        $webpBin = self::encodeWebpToString($dst, $qWebp);
        if ($webpBin !== null) {
            \imagedestroy($dst);

            return ['binary' => $webpBin, 'mime' => 'image/webp', 'ext' => 'webp'];
        }

        $jpegBin = self::encodeJpegToString($dst, $qJpeg);
        \imagedestroy($dst);

        return ['binary' => $jpegBin, 'mime' => 'image/jpeg', 'ext' => 'jpg'];
    }

    /** @return resource|\GdImage|false */
    private static function createImage(string $path, string $mime)
    {
        $mime = \strtolower($mime);
        $img = match ($mime) {
            'image/jpeg', 'image/jpg' => @\imagecreatefromjpeg($path),
            'image/png' => @\imagecreatefrompng($path),
            'image/gif' => @\imagecreatefromgif($path),
            'image/webp' => \function_exists('imagecreatefromwebp') ? @\imagecreatefromwebp($path) : false,
            default => false,
        };
        if ($img !== false) {
            return $img;
        }

        if (!\function_exists('getimagesize')) {
            return false;
        }
        $info = @\getimagesize($path);
        if ($info === false || !isset($info[2])) {
            return false;
        }

        return match ((int) $info[2]) {
            \IMAGETYPE_JPEG => @\imagecreatefromjpeg($path),
            \IMAGETYPE_PNG => @\imagecreatefrompng($path),
            \IMAGETYPE_GIF => @\imagecreatefromgif($path),
            \IMAGETYPE_WEBP => \function_exists('imagecreatefromwebp') ? @\imagecreatefromwebp($path) : false,
            default => false,
        };
    }

    private static function encodeWebpToString($dst, int $quality): ?string
    {
        if (!\function_exists('imagewebp')) {
            return null;
        }
        $path = @\tempnam(\sys_get_temp_dir(), 'wstwebp_');
        if ($path === false) {
            return null;
        }
        try {
            if (!@\imagewebp($dst, $path, $quality)) {
                return null;
            }
            $raw = @\file_get_contents($path);

            return (\is_string($raw) && $raw !== '') ? $raw : null;
        } finally {
            @\unlink($path);
        }
    }

    /**
     * @param resource|\GdImage $dst
     */
    private static function encodeJpegToString($dst, int $quality): string
    {
        $path = @\tempnam(\sys_get_temp_dir(), 'wstjpg_');
        if ($path === false) {
            throw new \RuntimeException('Gagal membuat berkas sementara');
        }
        try {
            if (!@\imagejpeg($dst, $path, $quality)) {
                throw new \RuntimeException('Gagal mengompres JPEG (periksa dukungan GD jpeg)');
            }
            $raw = @\file_get_contents($path);
            if (!\is_string($raw) || $raw === '') {
                throw new \RuntimeException('Keluaran JPEG kosong');
            }

            return $raw;
        } finally {
            @\unlink($path);
        }
    }
}
