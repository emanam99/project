<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Gaya balasan asisten eBeddien: ringkas, ramah (emoji), pisah chat lanjutan.
 */
final class AiAssistantReplyStyleHelper
{
    /** Marker antar gelembung chat / pesan WA (jangan tampilkan mentah ke pengguna). */
    public const SPLIT_MARKER = "---EBEDDIEN_SPLIT---";

    /**
     * Instruksi untuk system prompt (web, WA, agen).
     */
    public static function replyStyleSystemBlock(): string
    {
        return "--- GAYA BALASAN (wajib) ---\n"
            . 'Utamakan jawaban RINGKAS, to the point, dan ramah — seperti chat WhatsApp dengan rekan kerja. '
            . 'Gunakan 1–3 emoji relevan secara wajar (tidak berlebihan). '
            . 'Jawab panjang/rinci HANYA bila pengguna meminta detail, penjelasan lengkap, daftar semua, atau analisis mendalam. '
            . 'Hindari paragraf panjang, pengulangan, dan pembukaan basa-basi berlebihan. '
            . 'Jika perlu menanyakan lanjutan (mis. «Ada lagi yang bisa dibantu?»), JANGAN gabung dalam satu balasan dengan isi utama: '
            . 'tulis jawaban inti dulu, lalu baris terpisah berisi tepat ' . self::SPLIT_MARKER . ', lalu pertanyaan lanjutan singkat (boleh emoji). '
            . 'Maksimal dua bagian (inti + lanjutan); jangan pakai marker lebih dari sekali. '
            . 'Label kategori [Nama Kategori] tetap di baris paling akhir SETELAH semua bagian (hanya sekali).';
    }

    /**
     * Hilangkan label kategori […] di akhir teks model.
     */
    public static function stripTrailingCategoryLabel(string $reply): string
    {
        $reply = trim($reply);
        if ($reply === '') {
            return '';
        }

        return preg_replace('/\n+\[[^\]]{1,80}\]\s*$/u', '', $reply) ?? $reply;
    }

    /**
     * @return list<string> Satu atau lebih cuplikan siap tampil/kirim (tanpa marker).
     */
    public static function splitForDelivery(string $text, bool $stripCategory = true): array
    {
        $text = trim($text);
        if ($text === '') {
            return [];
        }
        if ($stripCategory) {
            $text = self::stripTrailingCategoryLabel($text);
        }
        $marker = self::SPLIT_MARKER;
        if (strpos($text, $marker) === false) {
            $one = trim($text);

            return $one === '' ? [] : [$one];
        }
        $chunks = preg_split('/\s*' . preg_quote($marker, '/') . '\s*/u', $text) ?: [];
        $out = [];
        foreach ($chunks as $chunk) {
            $chunk = trim((string) $chunk);
            if ($chunk !== '') {
                $out[] = $chunk;
            }
        }

        return $out === [] ? [trim($text)] : $out;
    }

    /**
     * @return array{message: string, reply_parts: list<string>}
     */
    public static function packageForApiResponse(string $rawContent): array
    {
        $parts = self::splitForDelivery($rawContent, true);
        if ($parts === []) {
            return ['message' => '', 'reply_parts' => []];
        }

        return [
            'message' => $parts[0],
            'reply_parts' => $parts,
        ];
    }

    /**
     * Pecah teks balasan WA yang sudah diformat (berisi marker antar pesan).
     *
     * @return list<string>
     */
    public static function splitFormattedWhatsAppPayload(string $payload): array
    {
        $payload = trim($payload);
        if ($payload === '') {
            return [];
        }
        if (strpos($payload, self::SPLIT_MARKER) === false) {
            return [$payload];
        }

        return self::splitForDelivery($payload, false);
    }
}
