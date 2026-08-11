<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Normalisasi lampiran multimodal untuk POST /deepseek/agent/turn.
 * Mendukung gambar + dokumen yang bisa dibaca Gemini.
 */
final class AiAgentImageInputHelper
{
    private const MAX_COUNT = 6;

    private const MAX_BYTES_DECODED = 6291456; // 6 MiB

    /** @var list<string> */
    private const ALLOWED_MIMES = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv',
        'text/plain',
    ];

    /**
     * @param mixed $images Body klien: array { mime_type, data } (base64)
     *
     * @return array{0: bool, 1: string, 2: list<array{mime_type: string, data: string}>}
     */
    public static function normalize($images): array
    {
        if ($images === null || $images === []) {
            return [true, '', []];
        }
        if (!is_array($images)) {
            return [false, 'attachments harus array of { mime_type, data }', []];
        }
        if (count($images) > self::MAX_COUNT) {
            return [false, 'Maksimal ' . (string) self::MAX_COUNT . ' lampiran per giliran agen.', []];
        }
        $out = [];
        foreach ($images as $imgRow) {
            if (!is_array($imgRow)) {
                return [false, 'Setiap lampiran harus object { mime_type, data }', []];
            }
            $mime = '';
            if (isset($imgRow['mime_type']) && is_string($imgRow['mime_type'])) {
                $mime = strtolower(trim($imgRow['mime_type']));
            } elseif (isset($imgRow['mimeType']) && is_string($imgRow['mimeType'])) {
                $mime = strtolower(trim($imgRow['mimeType']));
            }
            if (!in_array($mime, self::ALLOWED_MIMES, true)) {
                return [false, 'Mime lampiran tidak didukung (gambar, pdf, word, excel, csv, txt).', []];
            }
            $b64 = '';
            if (isset($imgRow['data']) && is_string($imgRow['data'])) {
                $b64 = trim($imgRow['data']);
            }
            if (preg_match('#^data:[^;]+;base64,#i', $b64)) {
                $b64 = trim(preg_replace('#^data:[^;]+;base64,#i', '', $b64));
            }
            $b64 = preg_replace('/\s+/', '', $b64);
            if ($b64 === '') {
                return [false, 'Data base64 lampiran kosong', []];
            }
            $decoded = base64_decode($b64, true);
            if ($decoded === false) {
                return [false, 'Data lampiran bukan base64 valid', []];
            }
            $len = strlen($decoded);
            if ($len < 32) {
                return [false, 'Berkas lampiran terlalu kecil atau rusak', []];
            }
            if ($len > self::MAX_BYTES_DECODED) {
                return [false, 'Satu lampiran terlalu besar (maks. 6 MB setelah decode).', []];
            }
            $out[] = ['mime_type' => $mime, 'data' => $b64];
        }

        return [true, '', $out];
    }
}
