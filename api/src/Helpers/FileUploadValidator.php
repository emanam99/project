<?php

namespace App\Helpers;

use Psr\Http\Message\UploadedFileInterface;

/**
 * FileUploadValidator
 *
 * Helper validasi upload file yang mempertegas pertahanan terhadap MIME spoofing:
 * - Cek upload error code dari PHP.
 * - Cek ukuran maksimum (default per kategori).
 * - Whitelist ekstensi (case-insensitive).
 * - Cek MIME server-side via finfo (bukan dari client).
 * - Cek magic bytes dari header file.
 * - Tolak mismatch antara extension, MIME finfo, dan magic bytes.
 *
 * Hasil panggilan akan bertipe array dengan:
 * - success: bool
 * - message: string ramah-user
 * - extension: string (lowercase, tanpa titik) bila valid
 * - mime: string MIME hasil finfo bila valid
 * - size: int ukuran file bila valid
 *
 * Catatan keamanan:
 * - Tidak men-throw exception untuk hasil validasi normal; cukup return success=false agar
 *   controller bisa menyusun response 4xx dengan pesan yang sudah dinormalisasi.
 * - Untuk error infrastruktur (mis. ext finfo tidak tersedia), helper akan fallback ke
 *   pengecekan MIME via mime_content_type/magic bytes saja, bukan men-throw.
 */
final class FileUploadValidator
{
    /** Default 10 MB. */
    public const DEFAULT_MAX_SIZE = 10 * 1024 * 1024;

    /**
     * Pemetaan ekstensi yang diizinkan ke kandidat MIME yang valid serta magic bytes.
     * Magic bytes berbentuk array of [offset, signature_hex]; minimal salah satu match.
     */
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
            // RIFF....WEBP
            'magic' => [[0, '52494646']],
            'magic_extra' => [[8, '57454250']],
        ],
        'pdf' => [
            'mime' => ['application/pdf'],
            'magic' => [[0, '25504446']],
        ],
        // Office legacy (.doc/.xls): OLE Compound File magic
        'doc' => [
            'mime' => [
                'application/msword',
                'application/vnd.ms-office',
                'application/octet-stream',
                'application/x-tika-msoffice',
            ],
            'magic' => [[0, 'D0CF11E0A1B11AE1']],
        ],
        'xls' => [
            'mime' => [
                'application/vnd.ms-excel',
                'application/vnd.ms-office',
                'application/octet-stream',
                'application/x-tika-msoffice',
            ],
            'magic' => [[0, 'D0CF11E0A1B11AE1']],
        ],
        // Office OOXML (.docx/.xlsx): ZIP container signature
        'docx' => [
            'mime' => [
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/zip',
                'application/octet-stream',
            ],
            'magic' => [[0, '504B0304'], [0, '504B0506'], [0, '504B0708']],
        ],
        'xlsx' => [
            'mime' => [
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/zip',
                'application/octet-stream',
            ],
            'magic' => [[0, '504B0304'], [0, '504B0506'], [0, '504B0708']],
        ],
    ];

    /**
     * Validasi upload PSR-7.
     *
     * @param UploadedFileInterface $file
     * @param array<int,string>|null $allowedExtensions Whitelist ekstensi (lowercase, tanpa titik). Null = pakai semua yang dikenal.
     * @param int $maxSize Ukuran maksimum dalam bytes.
     * @return array{success:bool,message:string,extension?:string,mime?:string,size?:int}
     */
    public static function validate(
        UploadedFileInterface $file,
        ?array $allowedExtensions = null,
        int $maxSize = self::DEFAULT_MAX_SIZE
    ): array {
        $error = $file->getError();
        if ($error !== UPLOAD_ERR_OK) {
            return [
                'success' => false,
                'message' => self::uploadErrorToMessage($error),
            ];
        }

        $size = (int) $file->getSize();
        if ($maxSize > 0 && $size > $maxSize) {
            $maxMb = (int) max(1, round($maxSize / (1024 * 1024)));
            return [
                'success' => false,
                'message' => 'Ukuran file terlalu besar. Maksimal ' . $maxMb . 'MB',
            ];
        }

        $originalName = (string) ($file->getClientFilename() ?? '');
        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if ($extension === '' || !preg_match('/^[a-z0-9]+$/', $extension)) {
            return [
                'success' => false,
                'message' => 'Nama file tidak valid atau tidak memiliki ekstensi yang dikenali',
            ];
        }

        $whitelist = $allowedExtensions !== null
            ? array_map('strtolower', $allowedExtensions)
            : array_keys(self::SIGNATURES);
        if (!in_array($extension, $whitelist, true)) {
            return [
                'success' => false,
                'message' => 'Tipe file tidak diizinkan',
            ];
        }

        if (!isset(self::SIGNATURES[$extension])) {
            return [
                'success' => false,
                'message' => 'Tipe file tidak didukung',
            ];
        }

        $stream = $file->getStream();
        try {
            $stream->rewind();
        } catch (\Throwable $e) {
            // ignore; sebagian implementasi stream tidak rewindable, fallback ke read.
        }

        $headerBytes = '';
        try {
            // Baca cukup bytes untuk semua signature yang kita butuhkan (max RIFF/WEBP = 12 byte).
            $headerBytes = $stream->read(32);
        } catch (\Throwable $e) {
            // Jika gagal membaca stream, kita tetap coba via getStream()->getContents() dengan limit kecil.
            try {
                $stream->rewind();
                $contents = $stream->getContents();
                $headerBytes = substr((string) $contents, 0, 32);
            } catch (\Throwable $e2) {
                $headerBytes = '';
            }
        }

        try {
            $stream->rewind();
        } catch (\Throwable $e) {
            // not fatal; controller akan moveTo nanti.
        }

        if ($headerBytes === '' || strlen($headerBytes) < 4) {
            return [
                'success' => false,
                'message' => 'File tidak dapat diverifikasi (header tidak cukup)',
            ];
        }

        if (!self::matchesMagicBytes($extension, $headerBytes)) {
            return [
                'success' => false,
                'message' => 'Konten file tidak sesuai dengan ekstensi (tanda tangan biner tidak cocok)',
            ];
        }

        $detectedMime = self::detectMimeFromBytes($headerBytes);
        if ($detectedMime !== null && !self::isMimeAllowedForExt($extension, $detectedMime)) {
            return [
                'success' => false,
                'message' => 'Tipe MIME file tidak sesuai dengan ekstensi',
            ];
        }

        $clientMime = (string) ($file->getClientMediaType() ?? '');
        if ($clientMime !== '' && !self::isMimeAllowedForExt($extension, $clientMime) && $detectedMime === null) {
            // Hanya jadi sumber utama bila finfo tidak tersedia; tetap cocokkan terhadap whitelist ekstensi.
            return [
                'success' => false,
                'message' => 'Tipe MIME file tidak sesuai dengan ekstensi',
            ];
        }

        $finalMime = $detectedMime ?? ($clientMime !== '' ? $clientMime : self::SIGNATURES[$extension]['mime'][0]);

        return [
            'success' => true,
            'message' => 'OK',
            'extension' => $extension,
            'mime' => $finalMime,
            'size' => $size,
        ];
    }

    /**
     * Validasi tambahan setelah file dipindahkan ke disk (post-move integrity check).
     * Berguna untuk memastikan file di disk benar-benar matches header expectation.
     *
     * @return array{success:bool,message:string,mime?:string}
     */
    public static function validateMovedFile(string $absolutePath, string $expectedExtension): array
    {
        $expectedExtension = strtolower($expectedExtension);
        if (!is_file($absolutePath) || !is_readable($absolutePath)) {
            return [
                'success' => false,
                'message' => 'File hasil upload tidak ditemukan di server',
            ];
        }
        if (!isset(self::SIGNATURES[$expectedExtension])) {
            return [
                'success' => false,
                'message' => 'Tipe file tidak didukung',
            ];
        }

        $fp = @fopen($absolutePath, 'rb');
        $headerBytes = '';
        if ($fp !== false) {
            $headerBytes = (string) fread($fp, 32);
            fclose($fp);
        }
        if ($headerBytes === '' || !self::matchesMagicBytes($expectedExtension, $headerBytes)) {
            return [
                'success' => false,
                'message' => 'Konten file tidak sesuai dengan ekstensi setelah upload',
            ];
        }

        $mime = self::detectMimeFromFile($absolutePath) ?? self::detectMimeFromBytes($headerBytes);
        if ($mime !== null && !self::isMimeAllowedForExt($expectedExtension, $mime)) {
            return [
                'success' => false,
                'message' => 'Tipe MIME file tidak sesuai dengan ekstensi',
            ];
        }

        return [
            'success' => true,
            'message' => 'OK',
            'mime' => $mime ?? self::SIGNATURES[$expectedExtension]['mime'][0],
        ];
    }

    /**
     * Kembalikan ekstensi-ekstensi default yang didukung (lowercase, tanpa titik).
     * @return array<int,string>
     */
    public static function defaultAllowedExtensions(): array
    {
        return array_keys(self::SIGNATURES);
    }

    public static function uploadErrorToMessage(int $errorCode): string
    {
        switch ($errorCode) {
            case UPLOAD_ERR_INI_SIZE:
            case UPLOAD_ERR_FORM_SIZE:
                return 'File terlalu besar';
            case UPLOAD_ERR_PARTIAL:
                return 'File hanya ter-upload sebagian';
            case UPLOAD_ERR_NO_FILE:
                return 'Tidak ada file yang di-upload';
            case UPLOAD_ERR_NO_TMP_DIR:
                return 'Folder temporary tidak ditemukan di server';
            case UPLOAD_ERR_CANT_WRITE:
                return 'Gagal menulis file ke disk';
            case UPLOAD_ERR_EXTENSION:
                return 'Upload dihentikan oleh ekstensi server';
            default:
                return 'Terjadi kesalahan saat upload file';
        }
    }

    private static function matchesMagicBytes(string $extension, string $bytes): bool
    {
        $sig = self::SIGNATURES[$extension] ?? null;
        if ($sig === null) {
            return false;
        }
        $hex = strtoupper(bin2hex($bytes));
        $primary = false;
        foreach ($sig['magic'] as $entry) {
            $offsetBytes = (int) $entry[0];
            $offsetHex = $offsetBytes * 2;
            $needle = strtoupper((string) $entry[1]);
            if ($offsetHex + strlen($needle) <= strlen($hex)
                && substr($hex, $offsetHex, strlen($needle)) === $needle
            ) {
                $primary = true;
                break;
            }
        }
        if (!$primary) {
            return false;
        }
        if (isset($sig['magic_extra']) && is_array($sig['magic_extra'])) {
            foreach ($sig['magic_extra'] as $entry) {
                $offsetBytes = (int) $entry[0];
                $offsetHex = $offsetBytes * 2;
                $needle = strtoupper((string) $entry[1]);
                if ($offsetHex + strlen($needle) > strlen($hex)) {
                    return false;
                }
                if (substr($hex, $offsetHex, strlen($needle)) !== $needle) {
                    return false;
                }
            }
        }
        return true;
    }

    private static function isMimeAllowedForExt(string $extension, string $mime): bool
    {
        $sig = self::SIGNATURES[$extension] ?? null;
        if ($sig === null) {
            return false;
        }
        $mimeLower = strtolower(trim($mime));
        foreach ($sig['mime'] as $allowed) {
            if (strtolower($allowed) === $mimeLower) {
                return true;
            }
        }
        return false;
    }

    private static function detectMimeFromBytes(string $bytes): ?string
    {
        if ($bytes === '') {
            return null;
        }
        if (function_exists('finfo_buffer') && function_exists('finfo_open')) {
            $finfo = @finfo_open(FILEINFO_MIME_TYPE);
            if ($finfo !== false) {
                $detected = @finfo_buffer($finfo, $bytes);
                @finfo_close($finfo);
                if (is_string($detected) && $detected !== '') {
                    return strtolower($detected);
                }
            }
        }
        return null;
    }

    private static function detectMimeFromFile(string $path): ?string
    {
        if (function_exists('finfo_file') && function_exists('finfo_open')) {
            $finfo = @finfo_open(FILEINFO_MIME_TYPE);
            if ($finfo !== false) {
                $detected = @finfo_file($finfo, $path);
                @finfo_close($finfo);
                if (is_string($detected) && $detected !== '') {
                    return strtolower($detected);
                }
            }
        }
        if (function_exists('mime_content_type')) {
            $detected = @mime_content_type($path);
            if (is_string($detected) && $detected !== '') {
                return strtolower($detected);
            }
        }
        return null;
    }
}
