<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Konteks publik biaya & item PSB untuk Chat AI — selaras items-by-kondisi / auto-assign (set aktif).
 */
final class AiPsbBiayaPendaftaranChatContextHelper
{
    private const MAX_BLOCK_CHARS = 11000;

    private const MAX_SETS_IN_CATALOG = 28;

    public static function tryBuildPsbBiayaPendaftaranContext(
        \PDO $db,
        string $lastUserMessage
    ): ?string {
        $trimmed = trim($lastUserMessage);
        if ($trimmed === '') {
            return null;
        }
        if (!self::messageSuggestsPsbBiayaTopic($trimmed)) {
            return null;
        }
        if (!PsbItemSetMatcherHelper::tableExists($db)) {
            return null;
        }

        try {
            return self::trimBlock(self::buildBlock($db, $trimmed));
        } catch (\Throwable $e) {
            error_log('AiPsbBiayaPendaftaranChatContextHelper: ' . $e->getMessage());

            return null;
        }
    }

    private static function messageSuggestsPsbBiayaTopic(string $text): bool
    {
        $t = mb_strtolower($text, 'UTF-8');

        if (preg_match(
            '/\b(biaya|harga|nominal|tagihan|iuran|ongkos|wajib\s+bayar|total\s+bayar|berapa\s+(biaya|harga|bayar)|'
            . 'rincian\s+biaya|daftar\s+biaya|item\s+(pendaftaran|psb|daftar)|syarat\s+daftar|'
            . 'biaya\s+(pendaftaran|psb|daftar|santri|murid)|pendaftaran\s+(berapa|biaya|harga|item))\b/iu',
            $t
        )) {
            return true;
        }

        if (preg_match('/pendaftar|pendaftaran|\bpsb\b|daftar\s+(santri|murid|baru)|registrasi\s+baru/i', $t)) {
            return (bool) preg_match(
                '/\b(biaya|harga|nominal|item|tagihan|bayar|wajib|berapa|rincian|simulasi)\b/iu',
                $t
            );
        }

        return (bool) preg_match(
            '/\b(santri\s+baru|murid\s+baru|mukim|diniyah|formal|gelombang)\b.*\b(biaya|harga|berapa)\b/iu',
            $t
        );
    }

    private static function buildBlock(\PDO $db, string $userMessage): string
    {
        $lines = [];
        $lines[] = '=== BIAYA & ITEM PENDAFTARAN PSB (sisipan server; publik; baca saja) ===';
        $lines[] = 'Sumber: item set aktif (is_active=1) dan penugasan item — logika sama POST/GET /api/pendaftaran/items-by-kondisi '
            . 'yang dipakai aplikasi daftar & halaman Pendaftaran eBeddien (Simulasi / auto-assign).';
        $lines[] = 'Nominal hanya dari daftar di bawah; jangan mengarang harga atau nama item.';

        $ta = TahunAjaranActiveHelper::resolveHijriyahKonteksForMasehiDate($db, date('Y-m-d'));
        $taRow = $ta['row'] ?? null;
        if (is_array($taRow) && ($taRow['tahun_ajaran'] ?? '') !== '') {
            $lines[] = 'Tahun ajaran hijriyah konteks (master, tanggal hari ini): ' . $taRow['tahun_ajaran']
                . ' (masehi ' . ($taRow['dari'] ?? '—') . ' s.d. ' . ($taRow['sampai'] ?? '—') . ').';
        }

        $sets = PsbItemSetMatcherHelper::fetchActiveSetsWithKondisiAndItems($db);
        if ($sets === []) {
            $lines[] = '';
            $lines[] = '(Belum ada item set PSB aktif di basis.)';
            $lines[] = 'Petunjuk: jelaskan bahwa rincian biaya belum dikonfigurasi; arahkan ke petugas pendaftaran atau portal daftar resmi.';

            return implode("\n", $lines);
        }

        $extracted = self::extractKondisiFromMessage($db, $userMessage);
        if ($extracted !== []) {
            $resolved = PsbItemSetMatcherHelper::resolveItemsForRegistrasiData($db, $extracted);
            $setNames = self::setNamesByIds($sets, $resolved['matching_set_ids']);
            $lines[] = '';
            $lines[] = '--- Simulasi dari petanyaan (kondisi terdeteksi; selaras items-by-kondisi) ---';
            foreach ($extracted as $fk => $fv) {
                $lines[] = '  · ' . $fk . ' = ' . $fv;
            }
            if ($setNames !== []) {
                $lines[] = 'Set yang cocok: ' . implode('; ', $setNames) . '.';
            } else {
                $lines[] = 'Set yang cocok: (tidak ada — periksa kombinasi kondisi atau lihat katalog di bawah).';
            }
            self::appendItemList($lines, $resolved['items'], $resolved['total_wajib']);
        }

        $lines[] = '';
        $lines[] = '--- Katalog item set aktif (maks. ' . min(\count($sets), self::MAX_SETS_IN_CATALOG) . ' set) ---';
        $lines[] = 'Setiap set berlaku bila SEMUA field kondisi di baris «Kondisi» cocok (AND); tiap field boleh salah satu nilai (OR).';
        $lines[] = 'Field status_murid ada di formulir tetapi tidak dipakai untuk menentukan set/item.';

        $n = 0;
        foreach ($sets as $set) {
            if ($n >= self::MAX_SETS_IN_CATALOG) {
                $lines[] = '(… set lain dipotong; minta pengguna menyebut status pendaftar / formal / diniyah / gender / gelombang.)';
                break;
            }
            $kondisi = $set['kondisi'] ?? [];
            $items = $set['items'] ?? [];
            if ($kondisi === []) {
                continue;
            }

            $lines[] = '';
            $lines[] = '▸ Set: ' . ($set['nama_set'] ?? '—') . ' (id ' . ($set['id'] ?? '?') . ')';
            $byField = [];
            foreach ($kondisi as $k) {
                $fn = (string) ($k['field_name'] ?? '');
                if ($fn === 'status_murid') {
                    continue;
                }
                $label = trim((string) ($k['field_label'] ?? $fn));
                $val = trim((string) ($k['value_label'] ?? $k['value'] ?? ''));
                if ($fn === '' || $val === '') {
                    continue;
                }
                if (!isset($byField[$fn])) {
                    $byField[$fn] = ['label' => $label, 'values' => []];
                }
                $byField[$fn]['values'][$val] = true;
            }
            $kondisiParts = [];
            foreach ($byField as $fn => $meta) {
                $vals = array_keys($meta['values']);
                $kondisiParts[] = ($meta['label'] !== '' ? $meta['label'] : $fn) . ': ' . implode(' | ', $vals);
            }
            $lines[] = '  Kondisi: ' . ($kondisiParts !== [] ? implode(' · ', $kondisiParts) : '—');

            $subtotal = 0;
            $itemLines = [];
            foreach ($items as $it) {
                $harga = (int) ($it['harga'] ?? 0);
                $subtotal += $harga;
                $nama = trim((string) ($it['nama_item'] ?? ''));
                $kat = trim((string) ($it['kategori'] ?? ''));
                $itemLines[] = '    - ' . ($nama !== '' ? $nama : 'Item') . ' — ' . self::formatRp($harga)
                    . ($kat !== '' ? ' [' . $kat . ']' : '');
            }
            if ($itemLines === []) {
                $lines[] = '  Item: (belum ada item di set ini)';
            } else {
                $lines[] = '  Item:';
                foreach ($itemLines as $il) {
                    $lines[] = $il;
                }
                $lines[] = '  Subtotal set: ' . self::formatRp($subtotal);
            }
            $n++;
        }

        $fieldGuide = self::buildKondisiFieldGuide($db);
        if ($fieldGuide !== '') {
            $lines[] = '';
            $lines[] = '--- Field kondisi (untuk menanyakan ke pengguna bila belum jelas) ---';
            $lines[] = $fieldGuide;
        }

        $lines[] = '';
        $lines[] = 'Petunjuk untuk asisten:';
        $lines[] = '(1) Jawab nominal dan daftar item hanya dari blok di atas; format rupiah konsisten (Rp …).';
        $lines[] = '(2) Bila pengguna belum menyebut kondisi lengkap, tanyakan field yang relevan (mis. status pendaftar, pilihan formal/diniyah, gender, gelombang) lalu gunakan set yang cocok.';
        $lines[] = '(3) Jika beberapa set bisa relevan, jelaskan per skenario; jangan menjumlahkan semua set sekaligus kecuali pengguna minta perbandingan eksplisit.';
        $lines[] = '(4) Informasi ini publik (siapa saja boleh tanya); jangan minta login untuk menjawab biaya umum PSB.';
        $lines[] = '(5) Untuk statistik/agregat pendaftar (bukan tarif resmi), gunakan blok analisis PSB terpisah bila tersedia pada akun staf.';
        $lines[] = '(6) Bila pengguna minta detail tagihan/riwayat bayar santri tertentu, arahkan ke Aplikasi wali MyBeddien: https://mybeddien.alutsmani.id';
        $lines[] = '(7) Akhiri dengan kategori [Pendaftaran] bila sesuai aturan sistem.';

        return implode("\n", $lines);
    }

    /**
     * @param list<array<string, mixed>> $sets
     * @param list<int> $ids
     * @return list<string>
     */
    private static function setNamesByIds(array $sets, array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        $map = [];
        foreach ($sets as $s) {
            $map[(int) ($s['id'] ?? 0)] = (string) ($s['nama_set'] ?? '');
        }
        $out = [];
        foreach ($ids as $id) {
            $name = $map[$id] ?? '';
            if ($name !== '') {
                $out[] = $name;
            }
        }

        return $out;
    }

    /**
     * @param list<array<string, mixed>> $items
     */
    private static function appendItemList(array &$lines, array $items, int $totalWajib): void
    {
        if ($items === []) {
            $lines[] = 'Item: (kosong — tidak ada item untuk kombinasi ini.)';
            $lines[] = 'Total wajib: Rp 0';

            return;
        }
        $lines[] = 'Item:';
        foreach ($items as $it) {
            $nama = trim((string) ($it['nama_item'] ?? ''));
            $harga = (int) ($it['harga'] ?? 0);
            $kat = trim((string) ($it['kategori'] ?? ''));
            $lines[] = '  - ' . ($nama !== '' ? $nama : 'Item') . ' — ' . self::formatRp($harga)
                . ($kat !== '' ? ' [' . $kat . ']' : '');
        }
        $lines[] = 'Total wajib (jumlah item): ' . self::formatRp($totalWajib);
    }

    /**
     * @return array<string, string>
     */
    private static function extractKondisiFromMessage(\PDO $db, string $message): array
    {
        $lower = mb_strtolower($message, 'UTF-8');
        $stmt = $db->query(
            'SELECT kf.field_name, kf.field_label, kv.value, kv.value_label
            FROM psb___kondisi_value kv
            INNER JOIN psb___kondisi_field kf ON kv.id_field = kf.id
            WHERE kf.is_active = 1 AND kv.is_active = 1
            ORDER BY CHAR_LENGTH(kv.value) DESC, CHAR_LENGTH(COALESCE(kv.value_label, "")) DESC'
        );
        if ($stmt === false) {
            return [];
        }
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $out = [];
        foreach ($rows as $row) {
            $field = (string) ($row['field_name'] ?? '');
            if ($field === '' || $field === 'status_murid' || isset($out[$field])) {
                continue;
            }
            $candidates = [];
            foreach (['value', 'value_label'] as $col) {
                $v = trim((string) ($row[$col] ?? ''));
                if (mb_strlen($v, 'UTF-8') >= 2) {
                    $candidates[] = mb_strtolower($v, 'UTF-8');
                }
            }
            foreach ($candidates as $needle) {
                if (mb_strpos($lower, $needle) !== false) {
                    $out[$field] = trim((string) ($row['value'] ?? ''));
                    break;
                }
            }
        }

        return $out;
    }

    private static function buildKondisiFieldGuide(\PDO $db): string
    {
        $stmt = $db->query(
            'SELECT kf.field_name, kf.field_label,
                GROUP_CONCAT(DISTINCT COALESCE(NULLIF(kv.value_label, ""), kv.value) ORDER BY kv.urutan SEPARATOR " | ") AS opts
            FROM psb___kondisi_field kf
            INNER JOIN psb___kondisi_value kv ON kv.id_field = kf.id
            WHERE kf.is_active = 1 AND kv.is_active = 1 AND kf.field_name <> "status_murid"
            GROUP BY kf.id, kf.field_name, kf.field_label
            ORDER BY kf.urutan ASC'
        );
        if ($stmt === false) {
            return '';
        }
        $parts = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
            $label = trim((string) ($row['field_label'] ?? $row['field_name'] ?? ''));
            $opts = trim((string) ($row['opts'] ?? ''));
            if ($label === '' || $opts === '') {
                continue;
            }
            $parts[] = $label . ': ' . $opts;
        }

        return implode("\n", $parts);
    }

    private static function formatRp(int $amount): string
    {
        return 'Rp ' . number_format($amount, 0, ',', '.');
    }

    private static function trimBlock(string $s): string
    {
        if (mb_strlen($s, 'UTF-8') <= self::MAX_BLOCK_CHARS) {
            return $s;
        }

        return mb_substr($s, 0, self::MAX_BLOCK_CHARS - 48, 'UTF-8')
            . "\n…(katalog biaya PSB dipotong; minta pengguna menyebut kondisi pendaftaran lebih spesifik).";
    }
}
