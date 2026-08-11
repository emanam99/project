<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Snapshot heuristik kualitas data santri untuk Chat AI / agen (baca saja).
 * Mendeteksi duplikat potensial, inkonsistensi registrasi PSB vs master santri, field kritis kosong.
 */
final class AiSantriQualityChatContextHelper
{
    private const MAX_BLOCK_CHARS = 7500;

    /** Batas baris santri yang diproses agar query tetap wajar di hosting kecil. */
    private const MAX_SANTRI_SCAN = 4500;

    private const MAX_GROUPS_PER_SECTION = 14;

    /**
     * @param array{role_keys: list<string>, codes: list<string>, items: list<array<string, mixed>>, app_key: string}|null $snapshot
     */
    public static function tryBuildSantriQualityContext(
        \PDO $db,
        array $userPayload,
        string $lastUserMessage,
        ?array $snapshot = null
    ): ?string {
        $trimmed = trim($lastUserMessage);
        if ($trimmed === '') {
            return null;
        }
        if (!self::messageSuggestsQualityAnalysis($trimmed)) {
            return null;
        }
        if ($snapshot === null) {
            $snapshot = AiChatUserCapabilityHelper::fetchEbeddienSnapshot($db, $userPayload);
        }
        if (!self::userMayRunQualityAnalysis($db, $userPayload, $snapshot['codes'] ?? [])) {
            return null;
        }

        try {
            return self::trimBlock(self::buildReport($db, $userPayload));
        } catch (\Throwable $e) {
            error_log('AiSantriQualityChatContextHelper: ' . $e->getMessage());

            return null;
        }
    }

    private static function messageSuggestsQualityAnalysis(string $text): bool
    {
        $t = mb_strtolower($text, 'UTF-8');

        return (bool) preg_match(
            '/analisis\s+(data\s+)?santri|audit\s+(data\s+)?santri|kualitas\s+data\s+santri|'
            . 'cek\s+data\s+santri|perbaikan\s+data\s+santri|pembersihan\s+data\s+santri|'
            . 'duplikat\s+santri|data\s+duplikat|santri\s+duplikat|'
            . 'rekonsiliasi\s+santri|inkonsisten|tidak\s+cocok|tidak\s+sesuai|'
            . 'tanggal\s+lahir\s+(tidak|beda|salah|ganda)|ttl\s+beda|'
            . 'padukan\s+data|merge\s+santri|gabung(?:kan)?\s+data\s+santri|'
            . 'saran\s+perbaikan.*santri|temuan\s+data\s+santri/i',
            $t
        );
    }

    /**
     * @param list<string> $codes
     */
    private static function userMayRunQualityAnalysis(\PDO $db, array $user, array $codes): bool
    {
        if (!empty($user['is_real_super_admin'])) {
            return true;
        }
        if (RoleHelper::tokenHasAnyRoleKey($user, ['super_admin'])) {
            return true;
        }
        if (RoleHelper::tokenHasPermissionFromRolePolicy($user, 'manage_santri')) {
            return true;
        }
        if (RoleHelper::tokenHasEbeddienFiturCode($db, $user, 'menu.santri')) {
            return true;
        }
        foreach ($codes as $c) {
            $c = (string) $c;
            if ($c === 'menu.santri' || str_starts_with($c, 'action.santri.')) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array{0: string, 1: list<mixed>} SQL tambahan untuk subquery / JOIN yang sudah punya alias s, rd, rf
     */
    private static function lembagaScopeFragment(array $userPayload): array
    {
        if (!empty($userPayload['is_real_super_admin'])) {
            return ['', []];
        }
        if (RoleHelper::tokenHasAnyRoleKey($userPayload, ['super_admin'])) {
            return ['', []];
        }
        if (!empty($userPayload['lembaga_scope_all'])) {
            return ['', []];
        }
        $ids = $userPayload['lembaga_ids'] ?? null;
        if (!is_array($ids) || $ids === []) {
            return ['', []];
        }
        $clean = [];
        foreach ($ids as $x) {
            $t = trim((string) $x);
            if ($t !== '') {
                $clean[$t] = true;
            }
        }
        $list = array_keys($clean);
        if ($list === []) {
            return ['', []];
        }
        $n = \count($list);
        $ph = implode(',', array_fill(0, $n, '?'));

        return [" AND (rd.lembaga_id IN ($ph) OR rf.lembaga_id IN ($ph)) ", $list];
    }

    private static function normalizeNama(string $nama): string
    {
        $s = mb_strtolower(trim($nama), 'UTF-8');
        $s = preg_replace('/[^\p{L}\p{N}\s]/u', '', $s) ?? '';
        $s = preg_replace('/\s+/u', ' ', $s) ?? '';

        return trim($s);
    }

    /**
     * @return ?string Y-m-d
     */
    private static function normalizeTanggal($v): ?string
    {
        if ($v === null || trim((string) $v) === '') {
            return null;
        }
        $ts = strtotime((string) $v);

        return $ts !== false ? date('Y-m-d', $ts) : null;
    }

    private static function normalizeNik(?string $nik): ?string
    {
        if ($nik === null || trim($nik) === '') {
            return null;
        }
        $d = preg_replace('/\D/', '', $nik);

        return \strlen($d) >= 8 ? $d : null;
    }

    private static function normalizePhone(?string $p): ?string
    {
        if ($p === null || trim($p) === '') {
            return null;
        }
        $digits = preg_replace('/\D/', '', $p);
        if ($digits === '') {
            return null;
        }
        if (\strlen($digits) >= 11 && str_starts_with($digits, '62')) {
            $digits = '0' . substr($digits, 2);
        }
        if (\strlen($digits) >= 10) {
            return substr($digits, -10);
        }

        return \strlen($digits) >= 9 ? $digits : null;
    }

    /**
     * @param array<int, list<array{id:int,nis:string,nama:string}>> $groups
     *
     * @return list<string>
     */
    private static function formatGroups(array $groups, int $max): array
    {
        $lines = [];
        $n = 0;
        foreach ($groups as $members) {
            if (\count($members) < 2) {
                continue;
            }
            if ($n >= $max) {
                break;
            }
            $parts = [];
            foreach ($members as $m) {
                $parts[] = 'id=' . $m['id'] . ' NIS=' . $m['nis'] . ' ' . $m['nama'];
            }
            $lines[] = '- ' . implode(' | ', $parts);
            $n++;
        }

        return $lines;
    }

    private static function buildReport(\PDO $db, array $userPayload): string
    {
        [$scopeSql, $scopeParams] = self::lembagaScopeFragment($userPayload);
        $scopedNote = $scopeSql !== '' ? 'Data dibatasi ke santri yang terikat rombel pada lembaga dalam lingkup akun Anda.' : 'Cakupan: seluruh santri yang dapat di-scan (super / tanpa filter lembaga).';

        $sql = 'SELECT s.id, s.nis, s.nama, s.nik, s.tanggal_lahir, s.no_telpon, s.no_wa_santri, s.gender, s.status_santri '
            . 'FROM santri s '
            . 'LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah '
            . 'LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal '
            . 'WHERE 1=1' . $scopeSql
            . ' ORDER BY s.id DESC LIMIT ' . (int) self::MAX_SANTRI_SCAN;

        $stmt = $db->prepare($sql);
        $stmt->execute($scopeParams);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $nRows = \count($rows);

        $byNik = [];
        $byNamaTgl = [];
        $byPhone = [];

        foreach ($rows as $row) {
            $id = (int) ($row['id'] ?? 0);
            $nis = (string) ($row['nis'] ?? '');
            $nama = (string) ($row['nama'] ?? '');
            $meta = ['id' => $id, 'nis' => $nis, 'nama' => $nama];

            $nk = self::normalizeNik(isset($row['nik']) ? (string) $row['nik'] : null);
            if ($nk !== null) {
                $byNik[$nk][] = $meta;
            }

            $nn = self::normalizeNama($nama);
            $tl = self::normalizeTanggal($row['tanggal_lahir'] ?? null);
            if ($nn !== '' && $tl !== null) {
                $byNamaTgl[$nn . '|' . $tl][] = $meta;
            }

            $ph = self::normalizePhone(isset($row['no_telpon']) ? (string) $row['no_telpon'] : null)
                ?? self::normalizePhone(isset($row['no_wa_santri']) ? (string) $row['no_wa_santri'] : null);
            if ($ph !== null) {
                $byPhone[$ph][] = $meta;
            }
        }

        $dupNik = [];
        foreach ($byNik as $members) {
            $ids = [];
            foreach ($members as $m) {
                $ids[$m['id']] = true;
            }
            if (\count($ids) >= 2) {
                $dupNik[] = $members;
            }
        }

        $dupNt = [];
        foreach ($byNamaTgl as $members) {
            $ids = [];
            foreach ($members as $m) {
                $ids[$m['id']] = true;
            }
            if (\count($ids) >= 2) {
                $dupNt[] = $members;
            }
        }

        $dupPh = [];
        foreach ($byPhone as $members) {
            $ids = [];
            foreach ($members as $m) {
                $ids[$m['id']] = true;
            }
            if (\count($ids) >= 2) {
                $dupPh[] = $members;
            }
        }

        $lines = [];
        $lines[] = '=== ANALISIS KUALITAS DATA SANTRI (otomatis server; baca saja) ===';
        $lines[] = $scopedNote;
        $lines[] = 'Baris santri dipindai (maks. ' . self::MAX_SANTRI_SCAN . '): ' . $nRows . '.';
        $lines[] = 'Ini bukti audit formal — selalu verifikasi manual sebelum menggabungkan atau menghapus data.';

        $lines[] = '';
        $lines[] = '[A] Duplikat potensial — NIK kanonik sama, id santri berbeda';
        $fn = self::formatGroups($dupNik, self::MAX_GROUPS_PER_SECTION);
        $lines[] = $fn === [] ? '(tidak terdeteksi dalam sampel)' : implode("\n", $fn);

        $lines[] = '';
        $lines[] = '[B] Duplikat potensial — nama normalisasi + tanggal lahir sama, id berbeda (mis. NIK berbeda atau salah entri)';
        $fn2 = self::formatGroups($dupNt, self::MAX_GROUPS_PER_SECTION);
        $lines[] = $fn2 === [] ? '(tidak terdeteksi dalam sampel)' : implode("\n", $fn2);

        $lines[] = '';
        $lines[] = '[C] Nomor HP/WA kanonik sama pada santri berbeda';
        $fn3 = self::formatGroups($dupPh, self::MAX_GROUPS_PER_SECTION);
        $lines[] = $fn3 === [] ? '(tidak terdeteksi dalam sampel)' : implode("\n", $fn3);

        $lines[] = '';
        $lines[] = '[D] Inkonsistensi registrasi PSB vs master santri (gender berbeda bila keduanya terisi)';
        $lines = array_merge($lines, self::fetchRegistrasiGenderMismatches($db, $scopeSql, $scopeParams));

        $lines[] = '';
        $lines[] = '[E] Field kritis kosong pada sampel terbaru (peringatan operasional)';
        $lines = array_merge($lines, self::summarizeMissingCritical($rows));

        $lines[] = '';
        $lines[] = '---';
        $lines[] = 'Petunjuk untuk asisten AI: ringkas temuan, urutkan menurut risiko (integritas data / duplikasi pembayaran / identitas), '
            . 'berikan saran perbaikan konkret (buka modul Santri, Padukan Data, PSB/Data Pendaftar, verifikasi dengan ortu), '
            . 'dan jangan menyebut nama tabel basis data kepada pengguna akhir.';

        return implode("\n", $lines);
    }

    /**
     * @param list<mixed> $scopeParams
     *
     * @return list<string>
     */
    private static function fetchRegistrasiGenderMismatches(\PDO $db, string $scopeSql, array $scopeParams): array
    {
        try {
            $chk = $db->query("SHOW TABLES LIKE 'psb___registrasi'");
            if ($chk === false || $chk->rowCount() === 0) {
                return ['(tabel registrasi PSB tidak ada — lewati)'];
            }
        } catch (\Throwable $e) {
            return ['(tidak dapat memeriksa registrasi)'];
        }

        $sql = 'SELECT r.id AS id_registrasi, r.id_santri, s.nis, s.nama, r.gender AS gender_reg, s.gender AS gender_santri '
            . 'FROM psb___registrasi r '
            . 'INNER JOIN santri s ON s.id = r.id_santri '
            . 'LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah '
            . 'LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal '
            . 'WHERE TRIM(COALESCE(r.gender, \'\')) <> \'\' AND TRIM(COALESCE(s.gender, \'\')) <> \'\' '
            . 'AND UPPER(LEFT(TRIM(r.gender), 1)) <> UPPER(LEFT(TRIM(s.gender), 1)) '
            . $scopeSql
            . ' ORDER BY r.id DESC LIMIT 24';

        try {
            $stmt = $db->prepare($sql);
            $stmt->execute($scopeParams);
            $mr = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            return ['(gagal membaca selisih gender registrasi)'];
        }
        if ($mr === []) {
            return ['(tidak ada selisih gender yang terdeteksi dalam sampel)'];
        }
        $out = [];
        foreach ($mr as $x) {
            $out[] = '- reg id=' . (int) ($x['id_registrasi'] ?? 0) . ', santri id=' . (int) ($x['id_santri'] ?? 0)
                . ', NIS ' . ($x['nis'] ?? '') . ', ' . ($x['nama'] ?? '')
                . ' | gender registrasi: ' . ($x['gender_reg'] ?? '')
                . ' | gender master santri: ' . ($x['gender_santri'] ?? '');
        }

        return $out;
    }

    /**
     * @param list<array<string, mixed>> $rows
     *
     * @return list<string>
     */
    private static function summarizeMissingCritical(array $rows): array
    {
        $noNikIds = [];
        $noTtlIds = [];
        foreach ($rows as $row) {
            $id = (int) ($row['id'] ?? 0);
            $nik = trim((string) ($row['nik'] ?? ''));
            $ttl = trim((string) ($row['tanggal_lahir'] ?? ''));
            if ($nik === '') {
                $noNikIds[] = $id;
            }
            if ($ttl === '') {
                $noTtlIds[] = $id;
            }
        }
        $nikCount = \count($noNikIds);
        $ttlCount = \count($noTtlIds);
        $noNikSample = array_slice(array_values(array_unique($noNikIds)), 0, 12);
        $noTtlSample = array_slice(array_values(array_unique($noTtlIds)), 0, 12);

        return [
            'Santri tanpa NIK dalam sampel: ' . $nikCount . ' baris. Contoh id: ' . ($noNikSample === [] ? '—' : implode(', ', $noNikSample)),
            'Santri tanpa tanggal lahir dalam sampel: ' . $ttlCount . ' baris. Contoh id: ' . ($noTtlSample === [] ? '—' : implode(', ', $noTtlSample)),
        ];
    }

    private static function trimBlock(string $s): string
    {
        if (mb_strlen($s, 'UTF-8') <= self::MAX_BLOCK_CHARS) {
            return $s;
        }

        return mb_substr($s, 0, self::MAX_BLOCK_CHARS - 40, 'UTF-8') . "\n…(analisis dipotong; minta pengguna menyempitkan lingkup atau hubungi admin).";
    }
}
