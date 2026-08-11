<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Menyelaraskan teks balasan AI (markdown umum) ke format WhatsApp sebelum dikirim.
 * WA: tebal *kata* (satu asterisk), miring _kata_, tanpa # judul markdown.
 */
final class AiWhatsappReplyFormatHelper
{
    public static function systemPromptBlock(): string
    {
        return "--- FORMAT BALASAN WHATSAPP ---\n"
            . 'Jawaban akan dikirim ke WhatsApp. Jangan pakai markdown web: simbol # untuk judul, ** atau __ untuk tebal. '
            . 'Tebal: satu pasang asterisk (*tebal*). Miring: _miring_. Daftar: baris baru dengan • atau angka. '
            . 'Tanpa garis --- atau blok kode kecuali perlu monospace singkat.';
    }

    public static function format(string $text): string
    {
        $text = trim($text);
        if ($text === '') {
            return '';
        }

        $text = str_replace(["\r\n", "\r"], "\n", $text);

        // Blok kode ``` ... ``` → monospace WA (tiga backtick)
        $text = preg_replace_callback(
            '/```[\w-]*\n?([\s\S]*?)```/u',
            static function (array $m): string {
                $inner = trim($m[1]);

                return $inner === '' ? '' : '```' . $inner . '```';
            },
            $text
        ) ?? $text;

        // Inline `kode` → monospace WA
        $text = preg_replace('/`([^`\n]+)`/u', '```$1```', $text) ?? $text;

        // Judul markdown (# … ######)
        $text = preg_replace('/^#{1,6}\s+/mu', '', $text) ?? $text;

        // Tautan [label](url)
        $text = preg_replace('/\[([^\]]+)\]\(([^)]+)\)/u', '$1 ($2)', $text) ?? $text;

        // Tebal markdown → tebal WA (*satu* asterisk)
        $text = preg_replace('/\*\*\*([^*\n]+?)\*\*\*/u', '*$1*', $text) ?? $text;
        $text = preg_replace('/\*\*([^*\n]+?)\*\*/u', '*$1*', $text) ?? $text;
        $text = preg_replace('/__([^_\n]+?)__/u', '*$1*', $text) ?? $text;

        // Coret ~~teks~~ → ~teks~
        $text = preg_replace('/~~([^~\n]+?)~~/u', '~$1~', $text) ?? $text;

        // Garis pemisah markdown
        $text = preg_replace('/^[\*\-_]{3,}\s*$/mu', '', $text) ?? $text;

        // Sisa asterisk ganda (bukan format WA)
        $text = preg_replace('/\*{2,}/u', '*', $text) ?? $text;

        // Bullet markdown "- " / "* " di awal baris → bullet unicode
        $text = preg_replace('/^[\*\-]\s+/mu', '• ', $text) ?? $text;

        $text = preg_replace("/\n{3,}/u", "\n\n", $text) ?? $text;

        return trim($text);
    }
}
