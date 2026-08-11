<?php

declare(strict_types=1);

namespace App\Helpers;

use App\Services\WhatsAppService;

/**
 * Konteks utas WhatsApp untuk AI: pesan masuk + keluar (notifikasi aplikasi, balasan AI, dll.)
 * dari tabel whatsapp — bukan hanya pasangan ai___chat.
 */
final class AiWhatsappThreadContextHelper
{
    public const MAX_THREAD_MESSAGES = 10;

    private const SKIP_ISI = ['(tanpa teks)', '[media]'];

    /** Kategori keluar yang berasal dari balasan AI instansi (tanpa label notifikasi). */
    private const AI_OUTBOUND_CATEGORIES = ['ai_whatsapp'];

    public static function waThreadContextSystemBlock(): string
    {
        return "--- KONTEKS UTAS WHATSAPP ---\n"
            . 'Riwayat di bawah adalah pesan WA nyata (keluar dari aplikasi/notifikasi dan masuk dari pengguna). '
            . 'Baris «Aplikasi» adalah pesan otomatis atau notifikasi resmi, bukan jawaban Anda sebelumnya. '
            . 'Jika pengguna membalas singkat (mis. Ya, Iya, OK, siap, tidak, lanjut) setelah pesan aplikasi, '
            . 'artikan sebagai respons terhadap notifikasi terakhir tersebut — jangan jawab «tidak mengerti» tanpa mencoba menautkan ke pesan aplikasi di atas.';
    }

    private static function whatsappTableReady(\PDO $db): bool
    {
        try {
            $st = $db->query("SHOW TABLES LIKE 'whatsapp'");

            return $st !== false && $st->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function normalizeMessageBody(string $text): string
    {
        $text = trim(preg_replace('/\s+/u', ' ', $text) ?? $text);
        if ($text === '' || in_array($text, self::SKIP_ISI, true)) {
            return '';
        }

        return $text;
    }

    /**
     * @return list<string>
     */
    private static function phoneLookupVariants(string $nomorTujuan): array
    {
        $raw = trim($nomorTujuan);
        $canon = WhatsAppService::formatPhoneNumber($nomorTujuan);
        $out = [];
        foreach ([$raw, $canon] as $n) {
            if ($n !== '' && !in_array($n, $out, true)) {
                $out[] = $n;
            }
        }
        if ($canon !== '' && strlen($canon) > 2 && str_starts_with($canon, '62')) {
            $local = '0' . substr($canon, 2);
            if (!in_array($local, $out, true)) {
                $out[] = $local;
            }
        }

        return $out;
    }

    /**
     * Ambil maks. N pesan WA terakhir (masuk + keluar), kronologis.
     *
     * @return list<array{role: string, content: string, arah: string, kategori: string}>
     */
    public static function fetchRecentThreadRows(
        \PDO $db,
        string $nomorTujuan,
        int $limit = self::MAX_THREAD_MESSAGES,
        ?string $excludeInboundMatching = null
    ): array {
        if ($nomorTujuan === '' || !self::whatsappTableReady($db)) {
            return [];
        }
        $variants = self::phoneLookupVariants($nomorTujuan);
        if ($variants === []) {
            return [];
        }
        $lim = max(1, min(20, $limit));
        $placeholders = implode(',', array_fill(0, count($variants), '?'));
        $hasArah = false;
        try {
            $hasArah = $db->query("SHOW COLUMNS FROM whatsapp LIKE 'arah'")->rowCount() > 0;
        } catch (\Throwable $e) {
            return [];
        }
        $sel = 'id, isi_pesan, kategori, created_at';
        if ($hasArah) {
            $sel .= ', arah';
        }
        $sql = "SELECT {$sel} FROM whatsapp WHERE nomor_tujuan IN ({$placeholders})"
            . " AND TRIM(COALESCE(isi_pesan, '')) <> ''"
            . ' ORDER BY COALESCE(created_at, FROM_UNIXTIME(0)) DESC, id DESC LIMIT ' . (int) $lim;
        try {
            $stmt = $db->prepare($sql);
            $stmt->execute($variants);
            $rows = array_reverse($stmt->fetchAll(\PDO::FETCH_ASSOC) ?: []);
        } catch (\Throwable $e) {
            error_log('AiWhatsappThreadContextHelper::fetchRecentThreadRows ' . $e->getMessage());

            return [];
        }

        $excludeNorm = $excludeInboundMatching !== null
            ? mb_strtolower(self::normalizeMessageBody($excludeInboundMatching))
            : '';
        $out = [];
        foreach ($rows as $row) {
            $body = self::normalizeMessageBody((string) ($row['isi_pesan'] ?? ''));
            if ($body === '') {
                continue;
            }
            $arah = $hasArah ? strtolower(trim((string) ($row['arah'] ?? ''))) : '';
            $isInbound = $arah === 'masuk';
            if ($isInbound && $excludeNorm !== '' && mb_strtolower($body) === $excludeNorm) {
                continue;
            }
            $kat = strtolower(trim((string) ($row['kategori'] ?? '')));
            if ($isInbound) {
                $out[] = ['role' => 'user', 'content' => $body, 'arah' => 'masuk', 'kategori' => $kat];
            } else {
                $isAi = in_array($kat, self::AI_OUTBOUND_CATEGORIES, true);
                $content = $isAi
                    ? $body
                    : '[Pesan aplikasi/notifikasi] ' . $body;
                $out[] = ['role' => 'assistant', 'content' => $content, 'arah' => 'keluar', 'kategori' => $kat];
            }
        }

        return $out;
    }

    /**
     * @return list<array{role: string, content: string}>
     */
    public static function fetchRecentThreadMessages(
        \PDO $db,
        string $nomorTujuan,
        int $limit = self::MAX_THREAD_MESSAGES,
        ?string $excludeInboundMatching = null
    ): array {
        $rows = self::fetchRecentThreadRows($db, $nomorTujuan, $limit, $excludeInboundMatching);
        $msgs = [];
        foreach ($rows as $r) {
            $msgs[] = ['role' => $r['role'], 'content' => $r['content']];
        }

        return $msgs;
    }

    /**
     * Blok teks untuk disisipkan sebelum pertanyaan saat ini (mode single user prompt).
     */
    public static function buildThreadHistoryTextBlock(
        \PDO $db,
        string $nomorTujuan,
        ?string $excludeInboundMatching = null,
        int $limit = self::MAX_THREAD_MESSAGES
    ): string {
        $rows = self::fetchRecentThreadRows($db, $nomorTujuan, $limit, $excludeInboundMatching);
        if ($rows === []) {
            return '';
        }
        $lines = ['[Riwayat WhatsApp terakhir (' . count($rows) . ' pesan; kronologis)]'];
        foreach ($rows as $r) {
            if ($r['role'] === 'user') {
                $lines[] = 'Pengguna: ' . $r['content'];
            } else {
                $lines[] = 'Aplikasi/Asisten: ' . $r['content'];
            }
        }

        return implode("\n\n", $lines);
    }
}
