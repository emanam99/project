<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Ringkasan data santri + relasi (baca saja) untuk konteks Chat AI.
 * Gate selaras kode fitur role (role___fitur), sama sumbernya dengan /api/v2/me/fitur-menu.
 */
final class AiSantriChatContextHelper
{
    private const MAX_BLOCK_CHARS = 9000;

    private const MAX_SANTRI_ROWS = 3;

    /** Selaras DeepseekController — untuk gabung log utama + agen di ai___chat */
    private const MAIN_WEB_SESSION_ID = 'ebeddien-main';

    /**
     * @param array{role_keys: list<string>, codes: list<string>, items: list<array<string, mixed>>, app_key: string}|null $snapshot
     * @param int|null    $chatUsersId    users.id untuk membaca balasan asisten terakhir (pemilihan ordinal)
     * @param string|null $chatSessionId  session_id baris ai___chat (proxy = sesi DeepSeek klien)
     */
    public static function tryBuildSantriContext(
        \PDO $db,
        array $userPayload,
        string $lastUserMessage,
        ?array $snapshot = null,
        ?int $chatUsersId = null,
        ?string $chatSessionId = null
    ): ?string {
        $trimmed = trim($lastUserMessage);
        if ($trimmed === '') {
            return null;
        }
        if ($snapshot === null) {
            $snapshot = AiChatUserCapabilityHelper::fetchEbeddienSnapshot($db, $userPayload);
        }
        $codes = $snapshot['codes'] ?? [];
        if (!self::userMayReceiveSantriContext($db, $userPayload, $codes)) {
            return null;
        }

        $ids = self::resolveSantriIds($db, $trimmed);
        $disambigNote = '';
        $ord = self::parseSantriOrdinalIndex($trimmed);
        if (
            $ids === []
            && $ord !== null
            && $chatUsersId !== null
            && $chatUsersId > 0
            && $chatSessionId !== null
            && $chatSessionId !== ''
        ) {
            $resolved = self::tryResolveSantriIdsFromOrdinalInLastAssistant($db, $chatUsersId, $chatSessionId, $ord);
            if ($resolved !== []) {
                $ids = $resolved;
                $disambigNote = 'Pemetaan: pilihan pengguna merujuk santri urutan ke-' . ($ord + 1)
                    . ' dalam daftar NIS tujuh digit dari jawaban asisten terakhir pada log obrolan ini.';
            }
        }

        if ($ids === [] && !self::messageSuggestsSantri($trimmed)) {
            return null;
        }

        try {
            return self::buildContextBody($db, $userPayload, $trimmed, $codes, $ids, $disambigNote);
        } catch (\Throwable $e) {
            error_log('AiSantriChatContextHelper: ' . $e->getMessage());

            return null;
        }
    }

    /**
     * Indeks 0 = pertama / "yg 1", 1 = kedua, 2 = ketiga.
     */
    private static function parseSantriOrdinalIndex(string $text): ?int
    {
        $t = trim($text);
        if ($t === '' || mb_strlen($t, 'UTF-8') > 56) {
            return null;
        }
        $tl = mb_strtolower($t, 'UTF-8');

        if (preg_match('/^\s*(yg|yang)\s*([123])\s*\.?\s*$/u', $tl, $m)) {
            return (int) $m[2] - 1;
        }
        if (preg_match('/^\s*no\.?\s*([123])\s*\.?\s*$/u', $tl, $m)) {
            return (int) $m[1] - 1;
        }
        if (preg_match('/^\s*nomor\s*([123])\s*\.?\s*$/u', $tl, $m)) {
            return (int) $m[1] - 1;
        }
        if (preg_match('/^\s*pilihan\s*([123])\s*\.?\s*$/u', $tl, $m)) {
            return (int) $m[1] - 1;
        }
        if (!preg_match('/\d{7}/', $tl) && preg_match('/^\s*([123])\s*\.?\s*$/u', $tl, $m)) {
            return (int) $m[1] - 1;
        }
        if (preg_match('/yang\s+pertama\b/u', $t)) {
            return 0;
        }
        if (preg_match('/yang\s+kedua\b/u', $t)) {
            return 1;
        }
        if (preg_match('/yang\s+ketiga\b/u', $t)) {
            return 2;
        }
        if ($tl === 'pertama') {
            return 0;
        }
        if ($tl === 'kedua') {
            return 1;
        }
        if ($tl === 'ketiga') {
            return 2;
        }

        return null;
    }

    /**
     * @return list<int>
     */
    private static function tryResolveSantriIdsFromOrdinalInLastAssistant(
        \PDO $db,
        int $usersId,
        string $sessionId,
        int $zeroBasedIndex
    ): array {
        $reply = self::fetchLastAiResponseForUserSession($db, $usersId, $sessionId);
        if ($reply === null || trim($reply) === '') {
            return [];
        }
        $nHit = preg_match_all('/\b(\d{7})\b/', $reply, $m);
        if ($nHit === false || $nHit < 1) {
            return [];
        }
        $ordered = [];
        $seen = [];
        foreach ($m[1] as $nis) {
            $nis = (string) $nis;
            if (isset($seen[$nis])) {
                continue;
            }
            $seen[$nis] = true;
            $ordered[] = $nis;
        }
        if ($ordered === [] || !isset($ordered[$zeroBasedIndex])) {
            return [];
        }
        $rid = SantriHelper::resolveId($db, $ordered[$zeroBasedIndex]);

        return $rid !== null ? [$rid] : [];
    }

    private static function fetchLastAiResponseForUserSession(\PDO $db, int $usersId, string $sessionId): ?string
    {
        try {
            if ($sessionId === self::MAIN_WEB_SESSION_ID) {
                $stmt = $db->prepare(
                    'SELECT ai_response FROM ai___chat WHERE users_id = ? AND session_id IN (?, \'ebeddien-agent\') ORDER BY id DESC LIMIT 1'
                );
                $stmt->execute([$usersId, self::MAIN_WEB_SESSION_ID]);
            } else {
                $stmt = $db->prepare(
                    'SELECT ai_response FROM ai___chat WHERE users_id = ? AND session_id = ? ORDER BY id DESC LIMIT 1'
                );
                $stmt->execute([$usersId, $sessionId]);
            }
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            return isset($row['ai_response']) ? (string) $row['ai_response'] : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    private static function messageSuggestsSantri(string $text): bool
    {
        if ($text === '') {
            return false;
        }
        if (preg_match('/\d{7}/', $text)) {
            return true;
        }
        if (preg_match('/["\'][^"\'\n]{3,120}["\']/u', $text)) {
            return true;
        }

        return (bool) preg_match(
            '/\bsantri\b|\bnis\b|biodata|nama\s+lengkap|alamat\s*(ayah|ibu|wali)?|\bayah\b|\bibu\b|\bwali\b|'
            . 'rombel|kelas\s*diniyah|kelas\s*formal|domisili|\bkamar\b|asrama|boyong|\bijin\b|\bizin\b|perizinan|'
            . 'uwaba|spp|tunggakan|pembayaran\s*santri|tagihan\s*santri|syahriyyah/i',
            $text
        );
    }

    /**
     * @param list<string> $codes
     */
    private static function userMayReceiveSantriContext(\PDO $db, array $user, array $codes): bool
    {
        if (RoleHelper::tokenHasAnyRoleKey($user, ['super_admin'])) {
            return true;
        }
        if (RoleHelper::tokenHasPermissionFromRolePolicy($user, 'manage_santri')) {
            return true;
        }

        if ($codes !== []) {
            foreach ($codes as $c) {
                $c = (string) $c;
                if ($c === 'menu.santri' || str_starts_with($c, 'action.santri.')) {
                    return true;
                }
                if ($c === 'menu.rombel') {
                    return true;
                }
                if (str_starts_with($c, 'menu.domisili')) {
                    return true;
                }
                if (str_starts_with($c, 'menu.ijin') || str_contains($c, '.ijin.') || $c === 'menu.dashboard_ijin') {
                    return true;
                }
                if ($c === 'menu.uwaba' || $c === 'menu.tunggakan' || str_contains($c, 'pembayaran') || $c === 'menu.dashboard_pembayaran') {
                    return true;
                }
            }

            return false;
        }

        $menus = [
            'menu.santri',
            'menu.rombel',
            'menu.uwaba',
            'menu.tunggakan',
            'menu.domisili.daerah',
            'menu.domisili.kamar',
            'menu.domisili.status',
            'menu.ijin.data_ijin',
            'menu.ijin.data_boyong',
            'menu.dashboard_ijin',
            'menu.dashboard_pembayaran',
            'menu.pembayaran.manage_data',
        ];
        foreach ($menus as $mc) {
            if (RoleHelper::tokenHasEbeddienFiturCode($db, $user, $mc)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param list<string> $codes
     */
    private static function flagsFromCodes(array $codes): array
    {
        $fullBio = false;
        $rombel = false;
        $domisili = false;
        $ijinBoyong = false;
        $uwaba = false;

        foreach ($codes as $c) {
            $c = (string) $c;
            if ($c === 'menu.santri' || str_starts_with($c, 'action.santri.')) {
                $fullBio = true;
            }
            if ($c === 'menu.rombel') {
                $rombel = true;
            }
            if (str_starts_with($c, 'menu.domisili')) {
                $domisili = true;
            }
            if (str_starts_with($c, 'menu.ijin') || str_contains($c, '.ijin.') || $c === 'menu.dashboard_ijin') {
                $ijinBoyong = true;
            }
            if ($c === 'menu.uwaba' || $c === 'menu.tunggakan' || str_contains($c, 'pembayaran') || $c === 'menu.dashboard_pembayaran') {
                $uwaba = true;
            }
        }

        if ($fullBio) {
            $rombel = true;
            $domisili = true;
            $ijinBoyong = true;
        }

        return [
            'fullBio' => $fullBio,
            'rombel' => $rombel,
            'domisili' => $domisili,
            'ijinBoyong' => $ijinBoyong,
            'uwaba' => $uwaba,
        ];
    }

    /**
     * Bila snapshot `codes` kosong tetapi akses lolos lewat pengecekan menu di DB, turunkan flag per modul.
     *
     * @param array{fullBio: bool, rombel: bool, domisili: bool, ijinBoyong: bool, uwaba: bool} $flags
     *
     * @return array{fullBio: bool, rombel: bool, domisili: bool, ijinBoyong: bool, uwaba: bool}
     */
    private static function augmentFlagsFromDb(\PDO $db, array $user, array $flags): array
    {
        if (RoleHelper::tokenHasEbeddienFiturCode($db, $user, 'menu.santri')) {
            $flags['fullBio'] = true;
            $flags['rombel'] = true;
            $flags['domisili'] = true;
            $flags['ijinBoyong'] = true;
        }
        if (RoleHelper::tokenHasEbeddienFiturCode($db, $user, 'menu.rombel')) {
            $flags['rombel'] = true;
        }
        foreach (['menu.domisili.daerah', 'menu.domisili.kamar', 'menu.domisili.status'] as $c) {
            if (RoleHelper::tokenHasEbeddienFiturCode($db, $user, $c)) {
                $flags['domisili'] = true;
                break;
            }
        }
        foreach (['menu.ijin.data_ijin', 'menu.ijin.data_boyong', 'menu.dashboard_ijin'] as $c) {
            if (RoleHelper::tokenHasEbeddienFiturCode($db, $user, $c)) {
                $flags['ijinBoyong'] = true;
                break;
            }
        }
        foreach (['menu.uwaba', 'menu.tunggakan', 'menu.dashboard_pembayaran', 'menu.pembayaran.manage_data'] as $c) {
            if (RoleHelper::tokenHasEbeddienFiturCode($db, $user, $c)) {
                $flags['uwaba'] = true;
                break;
            }
        }

        return $flags;
    }

    /**
     * @param list<string> $codes
     * @param list<int>    $ids
     */
    private static function buildContextBody(
        \PDO $db,
        array $userPayload,
        string $message,
        array $codes,
        array $ids,
        string $disambigNote = ''
    ): string {
        $flags = self::flagsFromCodes($codes);
        if (RoleHelper::tokenHasAnyRoleKey($userPayload, ['super_admin']) || RoleHelper::tokenHasPermissionFromRolePolicy($userPayload, 'manage_santri')) {
            $flags['fullBio'] = true;
            $flags['rombel'] = true;
            $flags['domisili'] = true;
            $flags['ijinBoyong'] = true;
            $flags['uwaba'] = true;
        }
        if ($codes === []) {
            $flags = self::augmentFlagsFromDb($db, $userPayload, $flags);
        }

        $lines = [];
        $lines[] = 'Sumber: basis data internal (ringkas). Hanya untuk menjawab pertanyaan pengguna; jangan mengarang di luar ini.';
        $lines[] = 'Mengubah data santri tidak dilakukan lewat obrolan — arahkan ke halaman Santri / modul terkait atau gunakan agen dengan konfirmasi bila tersedia.';
        $lines[] = 'Bagian yang disertakan mengikuti izin menu/aksi role Anda (lihat blok HAK AKSES FITUR).';
        if ($disambigNote !== '') {
            $lines[] = $disambigNote;
        }

        if ($ids === []) {
            $lines[] = '';
            $lines[] = 'Pencarian: tidak ada NIS 7 digit atau nama dalam tanda kutip yang terdeteksi. Minta pengguna menyebutkan NIS (7 digit) atau nama tepat dalam kutipan "..." untuk menampilkan ringkasan.';

            return self::trimBlock(implode("\n", $lines));
        }

        $lines[] = '';
        $lines[] = 'Catatan privasi: data orang tua/wali dan alamat bersifat sensitif — jangan disebarluaskan di luar keperluan resmi lembaga.';

        $nShow = 0;
        foreach ($ids as $sid) {
            if ($nShow >= self::MAX_SANTRI_ROWS) {
                $lines[] = '';
                $lines[] = '…(dibatasi maks. ' . self::MAX_SANTRI_ROWS . ' santri per pesan)';

                break;
            }
            $chunk = self::formatOneSantri($db, $sid, $flags);
            if ($chunk !== '') {
                $lines[] = '';
                $lines[] = $chunk;
                $nShow++;
            }
        }

        return self::trimBlock(implode("\n", $lines));
    }

    /**
     * @return list<int>
     */
    private static function resolveSantriIds(\PDO $db, string $message): array
    {
        $ids = [];
        if (preg_match_all('/\b(\d{7})\b/', $message, $m)) {
            foreach ($m[1] as $nis) {
                $rid = SantriHelper::resolveId($db, $nis);
                if ($rid !== null) {
                    $ids[$rid] = true;
                }
            }
        }
        if (preg_match_all('/["\']([^"\'\n]{3,120})["\']/u', $message, $qm)) {
            foreach ($qm[1] as $rawName) {
                $name = trim((string) $rawName);
                $name = preg_replace('/[^\p{L}\p{N}\s.\'\-]/u', '', $name) ?? '';
                if ($name === '' || mb_strlen($name, 'UTF-8') < 3) {
                    continue;
                }
                $nameEsc = addcslashes($name, '%_\\');
                $stmt = $db->prepare('SELECT id FROM santri WHERE nama LIKE ? ORDER BY id ASC LIMIT 4');
                $stmt->execute(['%' . $nameEsc . '%']);
                while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                    $ids[(int) $row['id']] = true;
                }
            }
        }

        return array_keys($ids);
    }

    /**
     * @param array{fullBio: bool, rombel: bool, domisili: bool, ijinBoyong: bool, uwaba: bool} $flags
     */
    private static function formatOneSantri(\PDO $db, int $santriId, array $flags): string
    {
        $hasWaliCol = self::columnExists($db, 'santri', 'no_telpon_wali');
        $waliSql = $hasWaliCol ? ', s.no_telpon_wali' : '';

        $sql = 'SELECT s.id, s.nis, s.nama, COALESCE(s.status_santri, \'\') AS status_santri, s.gender, COALESCE(d.kategori, \'\') AS kategori, '
            . ($flags['fullBio']
                ? 's.nik, s.tempat_lahir, s.tanggal_lahir, s.ayah, s.ibu, s.wali, s.hubungan_wali, '
                . 's.dusun, s.rt, s.rw, s.desa, s.kecamatan, s.kabupaten, s.provinsi, s.kode_pos, '
                . 's.no_telpon, s.email, s.no_wa_santri' . $waliSql . ', '
                . 's.pekerjaan_ayah, s.pekerjaan_ibu, '
                : '')
            . 'rd.lembaga_id AS diniyah_lembaga, rd.kelas AS kelas_diniyah, rd.kel AS kel_diniyah, '
            . 'rf.lembaga_id AS formal_lembaga, rf.kelas AS kelas_formal, rf.kel AS kel_formal, '
            . 'd.daerah AS nama_daerah, dk.kamar AS nama_kamar, s.id_kamar '
            . 'FROM santri s '
            . 'LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah '
            . 'LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal '
            . 'LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar '
            . 'LEFT JOIN daerah d ON d.id = dk.id_daerah '
            . 'WHERE s.id = ? LIMIT 1';

        $stmt = $db->prepare($sql);
        $stmt->execute([$santriId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            return '';
        }

        $out = [];
        $out[] = '=== Santri id=' . (int) $row['id'] . ' | NIS ' . ($row['nis'] ?? '') . ' | ' . ($row['nama'] ?? '') . ' ===';
        $out[] = 'Status: ' . ($row['status_santri'] ?? '—') . ' | Gender: ' . ($row['gender'] ?? '—') . ' | Kategori: ' . ($row['kategori'] ?? '—');

        if ($flags['fullBio']) {
            $out[] = '';
            $out[] = '— Kontak & alamat tinggal —';
            $addr = array_filter([
                trim(implode(', ', array_filter([
                    $row['dusun'] ?? '',
                    isset($row['rt']) ? 'RT ' . $row['rt'] : '',
                    isset($row['rw']) ? 'RW ' . $row['rw'] : '',
                    $row['desa'] ?? '',
                    $row['kecamatan'] ?? '',
                    $row['kabupaten'] ?? '',
                    $row['provinsi'] ?? '',
                    $row['kode_pos'] ?? '',
                ], static fn ($x) => $x !== ''))),
            ]);
            $out[] = 'Alamat: ' . ($addr[0] ?? '—');
            $out[] = 'Telpon: ' . ($row['no_telpon'] ?? '—') . ' | Email: ' . ($row['email'] ?? '—') . ' | WA santri: ' . ($row['no_wa_santri'] ?? '—');
            if ($hasWaliCol && isset($row['no_telpon_wali'])) {
                $out[] = 'No. telpon wali (jika ada): ' . ($row['no_telpon_wali'] ?? '—');
            }
            $out[] = '';
            $out[] = '— Orang tua / wali —';
            $out[] = 'Ayah: ' . ($row['ayah'] ?? '—') . ($row['pekerjaan_ayah'] ? ' | Pekerjaan: ' . $row['pekerjaan_ayah'] : '');
            $out[] = 'Ibu: ' . ($row['ibu'] ?? '—') . ($row['pekerjaan_ibu'] ? ' | Pekerjaan: ' . $row['pekerjaan_ibu'] : '');
            $out[] = 'Wali (' . ($row['hubungan_wali'] ?? '?') . '): ' . ($row['wali'] ?? '—');
            $nik = $row['nik'] ?? '';
            $ttl = trim(($row['tempat_lahir'] ?? '') . ', ' . ($row['tanggal_lahir'] ?? ''));
            if ($nik !== '' || $ttl !== ', ') {
                $out[] = 'NIK: ' . ($nik !== '' ? $nik : '—') . ' | TTL: ' . ($ttl !== ', ' ? $ttl : '—');
            }
        }

        if ($flags['rombel']) {
            $out[] = '';
            $out[] = '— Rombel —';
            $out[] = 'Diniyah: lembaga ' . ($row['diniyah_lembaga'] ?? '—') . ', kelas ' . ($row['kelas_diniyah'] ?? '—') . ', kel ' . ($row['kel_diniyah'] ?? '—');
            $out[] = 'Formal: lembaga ' . ($row['formal_lembaga'] ?? '—') . ', kelas ' . ($row['kelas_formal'] ?? '—') . ', kel ' . ($row['kel_formal'] ?? '—');
        }

        if ($flags['domisili']) {
            $out[] = '';
            $out[] = '— Domisili —';
            $out[] = 'Daerah: ' . ($row['nama_daerah'] ?? '—') . ' | Kamar: ' . ($row['nama_kamar'] ?? '—') . ' (id_kamar ' . ($row['id_kamar'] ?? '—') . ')';
        }

        if ($flags['ijinBoyong']) {
            self::appendIjinBoyong($db, $santriId, $out);
        }

        if ($flags['uwaba']) {
            self::appendUwabaSummary($db, $santriId, $out);
        }

        return implode("\n", $out);
    }

    /**
     * @param list<string> $out
     */
    private static function appendIjinBoyong(\PDO $db, int $santriId, array &$out): void
    {
        try {
            $st = $db->prepare(
                'SELECT id, tahun_ajaran, alasan, dari_masehi, sampai_masehi, tanggal_kembali, tanggal_dibuat '
                . 'FROM santri___ijin WHERE id_santri = ? ORDER BY tanggal_dibuat DESC LIMIT 5'
            );
            $st->execute([$santriId]);
            $rows = $st->fetchAll(\PDO::FETCH_ASSOC);
            $out[] = '';
            $out[] = '— Ijin (5 terbaru) —';
            if ($rows === []) {
                $out[] = '(tidak ada catatan)';
            } else {
                foreach ($rows as $r) {
                    $out[] = '- TA ' . ($r['tahun_ajaran'] ?? '') . ': ' . ($r['alasan'] ?? '')
                        . ' | ' . ($r['dari_masehi'] ?? '?') . ' → ' . ($r['sampai_masehi'] ?? '?')
                        . ($r['tanggal_kembali'] ? ' | kembali ' . $r['tanggal_kembali'] : '');
                }
            }
        } catch (\Throwable $e) {
            $out[] = '';
            $out[] = '— Ijin — (tidak dapat dibaca)';
        }

        try {
            $st = $db->prepare(
                'SELECT id, tahun_hijriyah, tahun_masehi, tanggal_hijriyah, diniyah, formal, sudah_mengurusi, tanggal_dibuat '
                . 'FROM santri___boyong WHERE id_santri = ? ORDER BY tanggal_dibuat DESC LIMIT 5'
            );
            $st->execute([$santriId]);
            $rows = $st->fetchAll(\PDO::FETCH_ASSOC);
            $out[] = '';
            $out[] = '— Boyong (5 terbaru) —';
            if ($rows === []) {
                $out[] = '(tidak ada catatan)';
            } else {
                foreach ($rows as $r) {
                    $out[] = '- ' . ($r['tanggal_hijriyah'] ?? '') . ' H / ' . ($r['tahun_masehi'] ?? '') . ' M'
                        . ' | mengurus: ' . (($r['sudah_mengurusi'] ?? 0) ? 'ya' : 'belum')
                        . ' | diniyah: ' . ($r['diniyah'] ?? '—') . ' | formal: ' . ($r['formal'] ?? '—');
                }
            }
        } catch (\Throwable $e) {
            $out[] = '';
            $out[] = '— Boyong — (tidak dapat dibaca)';
        }
    }

    /**
     * @param list<string> $out
     */
    private static function appendUwabaSummary(\PDO $db, int $santriId, array &$out): void
    {
        try {
            $st = $db->prepare(
                'SELECT tahun_ajaran, COUNT(*) AS n_bulan, SUM(COALESCE(nominal,0)) AS sum_nom '
                . 'FROM uwaba WHERE id_santri = ? AND (is_disabled = 0 OR is_disabled IS NULL) '
                . 'GROUP BY tahun_ajaran ORDER BY tahun_ajaran DESC LIMIT 4'
            );
            $st->execute([$santriId]);
            $rows = $st->fetchAll(\PDO::FETCH_ASSOC);
            $out[] = '';
            $out[] = '— UWABA / syahriyyah (ringkas per tahun ajaran) —';
            if ($rows === []) {
                $out[] = '(belum ada baris uwaba aktif)';
            } else {
                foreach ($rows as $r) {
                    $out[] = '- ' . ($r['tahun_ajaran'] ?? '') . ': ' . (int) ($r['n_bulan'] ?? 0) . ' bulan terdaftar, Σ nominal baris ' . (int) ($r['sum_nom'] ?? 0);
                }
            }
        } catch (\Throwable $e) {
            $out[] = '';
            $out[] = '— UWABA — (tidak dapat dibaca)';
        }

        try {
            $st = $db->prepare(
                'SELECT masehi, nominal, via, admin FROM uwaba___bayar WHERE id_santri = ? ORDER BY masehi DESC LIMIT 6'
            );
            $st->execute([$santriId]);
            $rows = $st->fetchAll(\PDO::FETCH_ASSOC);
            $out[] = '';
            $out[] = '— Pembayaran UWABA terbaru —';
            if ($rows === []) {
                $out[] = '(belum ada pembayaran tercatat)';
            } else {
                foreach ($rows as $r) {
                    $out[] = '- ' . ($r['masehi'] ?? '') . ' | Rp ' . number_format((float) ($r['nominal'] ?? 0), 0, ',', '.')
                        . ' | ' . ($r['via'] ?? '') . ' | ' . ($r['admin'] ?? '');
                }
            }
        } catch (\Throwable $e) {
            /* ignore */
        }

        try {
            $st = $db->prepare(
                'SELECT COUNT(*) AS n, COALESCE(SUM(wajib),0) AS wajib FROM uwaba___tunggakan WHERE id_santri = ?'
            );
            $st->execute([$santriId]);
            $t = $st->fetch(\PDO::FETCH_ASSOC);
            if ($t && (int) ($t['n'] ?? 0) > 0) {
                $out[] = '';
                $out[] = '— Tunggakan (agregat) —';
                $out[] = 'Jumlah baris: ' . (int) $t['n'] . ' | Total wajib (Σ): Rp ' . number_format((float) ($t['wajib'] ?? 0), 0, ',', '.');
            }
        } catch (\Throwable $e) {
            /* ignore */
        }

        try {
            $st = $db->prepare(
                'SELECT COUNT(*) AS n, COALESCE(SUM(wajib),0) AS wajib FROM uwaba___khusus WHERE id_santri = ?'
            );
            $st->execute([$santriId]);
            $t = $st->fetch(\PDO::FETCH_ASSOC);
            if ($t && (int) ($t['n'] ?? 0) > 0) {
                $out[] = '';
                $out[] = '— Khusus (agregat) —';
                $out[] = 'Jumlah baris: ' . (int) $t['n'] . ' | Total wajib (Σ): Rp ' . number_format((float) ($t['wajib'] ?? 0), 0, ',', '.');
            }
        } catch (\Throwable $e) {
            /* ignore */
        }
    }

    private static function columnExists(\PDO $db, string $table, string $column): bool
    {
        try {
            $st = $db->prepare(
                'SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
            );
            $st->execute([$table, $column]);

            return (int) $st->fetchColumn() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function trimBlock(string $s): string
    {
        if (mb_strlen($s, 'UTF-8') <= self::MAX_BLOCK_CHARS) {
            return $s;
        }

        return mb_substr($s, 0, self::MAX_BLOCK_CHARS - 24, 'UTF-8') . "\n…(dipotong)";
    }
}
