<?php

namespace App\Helpers;

use Psr\Http\Message\UploadedFileInterface;

/**
 * Validasi upload file (gambar + PDF + Excel) — subset pola eBeddien FileUploadValidator.
 * Magic bytes + cek isi; Excel OOXML diverifikasi bukan sekadar ZIP sembarang.
 */
final class FileUploadValidator
{
    public const MAX_IMAGE_PDF = 10 * 1024 * 1024;
    public const MAX_EXCEL = 5 * 1024 * 1024;
    public const DEFAULT_MAX_SIZE = self::MAX_IMAGE_PDF;

    private const SIGNATURES = [
        'jpg' => [
            'mime' => ['image/jpeg', 'image/jpg', 'image/pjpeg'],
            'magic' => [[0, 'FFD8FF']],
        ],
        'jpeg' => [
            'mime' => ['image/jpeg', 'image/jpg', 'image/pjpeg'],
            'magic' => [[0, 'FFD8FF']],
        ],
        'png' => [
            'mime' => ['image/png'],
            'magic' => [[0, '89504E470D0A1A0A']],
        ],
        'gif' => [
            'mime' => ['image/gif'],
            'magic' => [[0, '474946383761'], [0, '474946383961']],
        ],
        'webp' => [
            'mime' => ['image/webp'],
            'magic' => [[0, '52494646']],
            'magic_extra' => [[8, '57454250']],
        ],
        'pdf' => [
            'mime' => ['application/pdf', 'application/octet-stream', 'application/x-pdf'],
            'magic' => [[0, '25504446']],
        ],
        // Legacy Excel / OLE Compound File
        'xls' => [
            'mime' => [
                'application/vnd.ms-excel',
                'application/vnd.ms-office',
                'application/octet-stream',
                'application/x-tika-msoffice',
            ],
            'magic' => [[0, 'D0CF11E0A1B11AE1']],
        ],
        // Excel OOXML = ZIP container
        'xlsx' => [
            'mime' => [
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/zip',
                'application/octet-stream',
            ],
            'magic' => [[0, '504B0304'], [0, '504B0506'], [0, '504B0708']],
        ],
    ];

    public static function maxSizeForExtension(string $ext): int
    {
        $ext = strtolower($ext);
        if ($ext === 'jpeg') {
            $ext = 'jpg';
        }
        return in_array($ext, ['xls', 'xlsx'], true) ? self::MAX_EXCEL : self::MAX_IMAGE_PDF;
    }

    /**
     * @param list<string> $allowedExtensions
     * @return array{success:bool,message:string,extension?:string,mime?:string,size?:int}
     */
    public static function validate(
        UploadedFileInterface $file,
        array $allowedExtensions,
        ?int $maxSize = null
    ): array {
        if ($file->getError() !== UPLOAD_ERR_OK) {
            return ['success' => false, 'message' => self::uploadErrorMessage($file->getError())];
        }

        $size = $file->getSize() ?? 0;
        if ($size <= 0) {
            return ['success' => false, 'message' => 'File kosong atau tidak valid'];
        }

        $original = (string) $file->getClientFilename();
        // Tolak nama ganda berbahaya: invoice.xlsx.php
        if (preg_match('/\.(php|phtml|phar|cgi|exe|js|html?|svg)(\.|$)/i', $original)) {
            return ['success' => false, 'message' => 'Nama file tidak diizinkan (mencurigakan)'];
        }

        $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
        $allowed = array_map('strtolower', $allowedExtensions);
        if ($ext === '' || !in_array($ext, $allowed, true)) {
            return [
                'success' => false,
                'message' => 'Tipe file tidak diizinkan. Gunakan gambar, PDF, atau Excel (.xls, .xlsx)',
            ];
        }
        if (!isset(self::SIGNATURES[$ext])) {
            return ['success' => false, 'message' => 'Ekstensi file tidak didukung'];
        }

        $limit = $maxSize ?? self::maxSizeForExtension($ext);
        if ($size > $limit) {
            $mb = round($limit / (1024 * 1024), 1);
            $label = in_array($ext, ['xls', 'xlsx'], true) ? 'Excel' : 'file';
            return ['success' => false, 'message' => "Ukuran {$label} terlalu besar. Maksimal {$mb} MB"];
        }

        $stream = $file->getStream();
        $stream->rewind();
        $head = $stream->read(64);
        $stream->rewind();

        if ($head === '' || $head === false) {
            return ['success' => false, 'message' => 'Gagal membaca isi file'];
        }

        if (!self::magicMatches($ext, $head)) {
            return ['success' => false, 'message' => 'Isi file tidak cocok dengan ekstensi (ditolak)'];
        }

        $mime = self::detectMimeFromBytes($head) ?? (string) $file->getClientMediaType();
        $allowedMimes = self::SIGNATURES[$ext]['mime'];

        return [
            'success' => true,
            'message' => 'OK',
            'extension' => $ext === 'jpeg' ? 'jpg' : $ext,
            'mime' => $mime !== '' ? $mime : ($allowedMimes[0] ?? 'application/octet-stream'),
            'size' => (int) $size,
        ];
    }

    /**
     * @return array{success:bool,message:string,mime?:string}
     */
    public static function validateMovedFile(string $path, string $extension): array
    {
        if (!is_file($path)) {
            return ['success' => false, 'message' => 'File tidak ditemukan setelah upload'];
        }
        $ext = strtolower($extension);
        if ($ext === 'jpeg') {
            $ext = 'jpg';
        }
        if (!isset(self::SIGNATURES[$ext])) {
            return ['success' => false, 'message' => 'Ekstensi tidak didukung'];
        }

        $fh = fopen($path, 'rb');
        if ($fh === false) {
            return ['success' => false, 'message' => 'Gagal membaca file tersimpan'];
        }
        $head = fread($fh, 64);
        // Baca cuplikan lebih besar untuk cek struktur Excel/ZIP
        $sample = $head . (fread($fh, 512 * 1024) ?: '');
        fclose($fh);
        if ($head === false || $head === '') {
            return ['success' => false, 'message' => 'File tersimpan kosong'];
        }
        if (!self::magicMatches($ext, $head)) {
            return ['success' => false, 'message' => 'Isi file tidak valid setelah disimpan'];
        }

        // Tolak polyglot PHP / script di awal
        if (preg_match('/<\?php|<\?=|<script\b/i', $head)) {
            return ['success' => false, 'message' => 'File mengandung konten berbahaya'];
        }

        if ($ext === 'xlsx') {
            $ooxml = self::validateXlsxContents($sample, $path);
            if (!$ooxml['success']) {
                return $ooxml;
            }
        }

        if ($ext === 'xls') {
            // OLE sudah dicek magic; tolak jika terlihat seperti teks/script
            if (preg_match('/^(%PDF|PK\x03\x04|<\?php)/', $head)) {
                return ['success' => false, 'message' => 'File Excel .xls tidak valid'];
            }
        }

        $mime = self::detectMimeFromPath($path) ?? (self::SIGNATURES[$ext]['mime'][0] ?? 'application/octet-stream');
        // Paksa MIME kanonik untuk Excel agar konsisten
        if ($ext === 'xlsx') {
            $mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        } elseif ($ext === 'xls') {
            $mime = 'application/vnd.ms-excel';
        }

        return ['success' => true, 'message' => 'OK', 'mime' => $mime];
    }

    /**
     * Pastikan ZIP benar-benar workbook Excel, bukan arsip berbahaya.
     * @return array{success:bool,message:string}
     */
    private static function validateXlsxContents(string $sample, string $path): array
    {
        // Marker OOXML khas spreadsheet
        $hasContentTypes = str_contains($sample, '[Content_Types].xml')
            || str_contains($sample, 'Content_Types');
        $hasWorkbook = str_contains($sample, 'xl/workbook')
            || str_contains($sample, 'xl\\workbook')
            || str_contains($sample, 'workbook.xml');

        if (!$hasContentTypes && !$hasWorkbook) {
            // Sample mungkin tidak mencakup entry — coba baca lebih besar
            $bigger = @file_get_contents($path, false, null, 0, 2 * 1024 * 1024);
            if (is_string($bigger)) {
                $sample = $bigger;
                $hasContentTypes = str_contains($sample, '[Content_Types].xml')
                    || str_contains($sample, 'Content_Types');
                $hasWorkbook = str_contains($sample, 'xl/workbook')
                    || str_contains($sample, 'workbook.xml');
            }
        }

        if (!$hasContentTypes || !$hasWorkbook) {
            return [
                'success' => false,
                'message' => 'File bukan Excel .xlsx yang valid (ditolak)',
            ];
        }

        // Tolak macro / executable tersembunyi di dalam ZIP (nama entry / path)
        $banned = [
            'vbaproject',
            'macroscripts',
            '.php',
            '.phtml',
            '.phar',
            '.exe',
            '.vbs',
            '.bat',
            '.cmd',
            '.ps1',
        ];
        $lower = strtolower($sample);
        foreach ($banned as $needle) {
            if (str_contains($lower, $needle)) {
                return [
                    'success' => false,
                    'message' => 'File Excel mengandung konten tidak diizinkan (ditolak)',
                ];
            }
        }

        return ['success' => true, 'message' => 'OK'];
    }

    private static function magicMatches(string $ext, string $head): bool
    {
        $spec = self::SIGNATURES[$ext] ?? null;
        if (!$spec) {
            return false;
        }
        $hex = strtoupper(bin2hex($head));
        $ok = false;
        foreach ($spec['magic'] as [$offset, $sig]) {
            $start = $offset * 2;
            if (substr($hex, $start, strlen($sig)) === strtoupper($sig)) {
                $ok = true;
                break;
            }
        }
        if (!$ok) {
            return false;
        }
        if (!empty($spec['magic_extra'])) {
            foreach ($spec['magic_extra'] as [$offset, $sig]) {
                $start = $offset * 2;
                if (substr($hex, $start, strlen($sig)) !== strtoupper($sig)) {
                    return false;
                }
            }
        }
        return true;
    }

    private static function detectMimeFromBytes(string $bytes): ?string
    {
        if (function_exists('finfo_open')) {
            $f = finfo_open(FILEINFO_MIME_TYPE);
            if ($f) {
                $mime = finfo_buffer($f, $bytes);
                finfo_close($f);
                return is_string($mime) ? $mime : null;
            }
        }
        return null;
    }

    private static function detectMimeFromPath(string $path): ?string
    {
        if (function_exists('finfo_open')) {
            $f = finfo_open(FILEINFO_MIME_TYPE);
            if ($f) {
                $mime = finfo_file($f, $path);
                finfo_close($f);
                return is_string($mime) ? $mime : null;
            }
        }
        if (function_exists('mime_content_type')) {
            $mime = @mime_content_type($path);
            return is_string($mime) ? $mime : null;
        }
        return null;
    }

    private static function uploadErrorMessage(int $code): string
    {
        return match ($code) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Ukuran file terlalu besar',
            UPLOAD_ERR_PARTIAL => 'File hanya ter-upload sebagian',
            UPLOAD_ERR_NO_FILE => 'Tidak ada file yang di-upload',
            UPLOAD_ERR_NO_TMP_DIR => 'Folder temporary tidak ditemukan',
            UPLOAD_ERR_CANT_WRITE => 'Gagal menulis file ke disk',
            UPLOAD_ERR_EXTENSION => 'Upload dihentikan oleh extension',
            default => 'Gagal meng-upload file',
        };
    }
}
