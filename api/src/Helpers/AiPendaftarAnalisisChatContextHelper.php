<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Ringkasan analisis pendaftar PSB untuk Chat AI (pembayaran, pola hari, duplikasi, sampel nama).
 */
final class AiPendaftarAnalisisChatContextHelper
{
    private const MAX_BLOCK_CHARS = 9000;

    private const MAX_POTENSI_GROUPS_IN_TEXT = 12;

    private const MAX_ANGGOTA_PER_GROUP = 6;

    /**
     * @param array{role_keys: list<string>, codes: list<string>, items: list<array<string, mixed>>, app_key: string}|null $snapshot
     */
    public static function tryBuildPendaftarAnalisisContext(
        \PDO $db,
        array $userPayload,
        string $lastUserMessage,
        ?array $snapshot = null
    ): ?string {
        $trimmed = trim($lastUserMessage);
        if ($trimmed === '') {
            return null;
        }
        if (!self::messageSuggestsPendaftarAnalysis($trimmed)) {
            return null;
        }
        if ($snapshot === null) {
            $snapshot = AiChatUserCapabilityHelper::fetchEbeddienSnapshot($db, $userPayload);
        }
        if (!self::userMayReceivePendaftarAnalisis($db, $userPayload, $snapshot['codes'] ?? [])) {
            return null;
        }
        if (!PendaftarAnalisisHelper::registrasiTableExists($db)) {
            return null;
        }

        try {
            $pair = self::resolveTahunAjaranPair($db, $userPayload, $trimmed);
            if ($pair === null) {
                return self::trimBlock(
                    "=== ANALISIS DATA PENDAFTAR (server) ===\n"
                    . "Tidak ada pasangan tahun ajaran (hijriyah + masehi) yang terdeteksi pada registrasi dalam lingkup akses Anda.\n"
                    . 'Sebutkan tahun ajaran secara eksplisit (mis. "1447/2026") atau pastikan sudah ada data PSB.'
                );
            }

            $payload = PendaftarAnalisisHelper::buildSnapshot(
                $db,
                $userPayload,
                $pair['hijriyah'],
                $pair['masehi'],
                true
            );

            return self::trimBlock(self::formatPayloadForPrompt($payload));
        } catch (\Throwable $e) {
            error_log('AiPendaftarAnalisisChatContextHelper: ' . $e->getMessage());

            return null;
        }
    }

    private static function messageSuggestsPendaftarAnalysis(string $text): bool
    {
        $t = mb_strtolower($text, 'UTF-8');
        if (!preg_match('/pendaftar|pendaftaran|\bpsb\b|registrasi\s+baru|data\s+psb|tahun\s+ajaran/i', $t)) {
            return false;
        }

        return (bool) preg_match(
            '/analisis|audit|statistik|ringkasan|insight|belum\s+bayar|lunas|kurang\s+bayar|'
            . 'pembayaran|keuangan|pendapatan|tagihan|duplikat|ganda|padukan|merge|'
            . 'hari\s+(paling|terbanyak|ramai|sibuk)|puncak\s+(pendaftar|daftar)|distribusi\s+hari|'
            . 'tren|saran\s+perbaikan|perbaikan\s+operasional/i',
            $t
        );
    }

    /**
     * @param list<string> $codes
     */
    private static function userMayReceivePendaftarAnalisis(\PDO $db, array $user, array $codes): bool
    {
        if (!empty($user['is_real_super_admin'])) {
            return true;
        }
        if (RoleHelper::tokenHasAnyRoleKey($user, ['super_admin'])) {
            return true;
        }
        if (RoleHelper::tokenCanQueryAnyPendaftaranSantri($user)) {
            return true;
        }
        foreach ($codes as $c) {
            $c = (string) $c;
            if ($c === 'menu.pendaftaran' || $c === 'menu.pendaftaran.data_pendaftar' || $c === 'menu.pendaftaran.analisis') {
                return true;
            }
            if (str_starts_with($c, 'action.pendaftaran.')) {
                return true;
            }
        }
        if (RoleHelper::tokenHasEbeddienFiturCode($db, $user, 'menu.pendaftaran')) {
            return true;
        }
        if (RoleHelper::tokenHasEbeddienFiturCode($db, $user, 'menu.pendaftaran.data_pendaftar')) {
            return true;
        }
        if (RoleHelper::tokenHasEbeddienFiturCode($db, $user, 'menu.pendaftaran.analisis')) {
            return true;
        }

        return RoleHelper::tokenMatchesAnyEbeddienFiturSelector($db, $user, ['PREFIX:action.pendaftaran.']);
    }

    /**
     * @return array{hijriyah: string, masehi: string}|null
     */
    private static function resolveTahunAjaranPair(\PDO $db, array $userPayload, string $message): ?array
    {
        $msg = trim($message);

        if (preg_match('/\b(14\d{2})\s*[/\-]\s*(20\d{2})\b/u', $msg, $m)) {
            return ['hijriyah' => $m[1], 'masehi' => $m[2]];
        }

        if (preg_match('/\b(20\d{2})\s*[/\-]\s*(14\d{2})\b/u', $msg, $m)) {
            return ['hijriyah' => $m[2], 'masehi' => $m[1]];
        }

        if (preg_match('/hijriyah\s*[:]?\s*(14\d{2}).{0,24}?masehi\s*[:]?\s*(20\d{2})/iu', $msg, $m)) {
            return ['hijriyah' => $m[1], 'masehi' => $m[2]];
        }

        if (preg_match('/masehi\s*[:]?\s*(20\d{2}).{0,24}?hijriyah\s*[:]?\s*(14\d{2})/iu', $msg, $m)) {
            return ['hijriyah' => $m[2], 'masehi' => $m[1]];
        }

        if (preg_match('/\btahun\s+masehi\s*[:]?\s*(20\d{2})\b/iu', $msg, $m)) {
            $dom = PendaftarAnalisisHelper::resolveDominantTahunAjaran($db, $userPayload);
            if ($dom !== null && $dom['masehi'] === $m[1]) {
                return $dom;
            }
            $guess = self::lookupHijriyahForMasehi($db, $userPayload, $m[1]);

            return $guess;
        }

        if (preg_match('/\btahun\s+hijriyah\s*[:]?\s*(14\d{2})\b/iu', $msg, $m)) {
            $guess = self::lookupMasehiForHijriyah($db, $userPayload, $m[1]);

            return $guess;
        }

        return PendaftarAnalisisHelper::resolveDominantTahunAjaran($db, $userPayload);
    }

    /**
     * @return array{hijriyah: string, masehi: string}|null
     */
    private static function lookupHijriyahForMasehi(\PDO $db, array $userPayload, string $masehi): ?array
    {
        $whereConditions = ['r.tahun_masehi = ?'];
        $params = [$masehi];

        $pidFilter = RoleHelper::getPengurusIdFromPayload($userPayload);
        $pf = RoleHelper::resolvePendaftarLembagaSqlFilter($userPayload, $pidFilter);
        if ($pf !== null) {
            if (!empty($pf['empty'])) {
                return null;
            }
            if (!empty($pf['clause']) && isset($pf['params']) && is_array($pf['params'])) {
                $whereConditions[] = $pf['clause'];
                foreach ($pf['params'] as $p) {
                    $params[] = $p;
                }
            }
        }

        $whereClause = 'WHERE ' . implode(' AND ', $whereConditions);
        $sql = "SELECT r.tahun_hijriyah AS th, COUNT(*) AS c FROM psb___registrasi r $whereClause
                GROUP BY r.tahun_hijriyah ORDER BY c DESC LIMIT 1";
        try {
            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            return null;
        }
        if ($row === false || $row === null) {
            return null;
        }
        $th = trim((string) ($row['th'] ?? ''));
        if ($th === '') {
            return null;
        }

        return ['hijriyah' => $th, 'masehi' => $masehi];
    }

    /**
     * @return array{hijriyah: string, masehi: string}|null
     */
    private static function lookupMasehiForHijriyah(\PDO $db, array $userPayload, string $hijriyah): ?array
    {
        $whereConditions = ['r.tahun_hijriyah = ?'];
        $params = [$hijriyah];

        $pidFilter = RoleHelper::getPengurusIdFromPayload($userPayload);
        $pf = RoleHelper::resolvePendaftarLembagaSqlFilter($userPayload, $pidFilter);
        if ($pf !== null) {
            if (!empty($pf['empty'])) {
                return null;
            }
            if (!empty($pf['clause']) && isset($pf['params']) && is_array($pf['params'])) {
                $whereConditions[] = $pf['clause'];
                foreach ($pf['params'] as $p) {
                    $params[] = $p;
                }
            }
        }

        $whereClause = 'WHERE ' . implode(' AND ', $whereConditions);
        $sql = "SELECT r.tahun_masehi AS tm, COUNT(*) AS c FROM psb___registrasi r $whereClause
                GROUP BY r.tahun_masehi ORDER BY c DESC LIMIT 1";
        try {
            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            return null;
        }
        if ($row === false || $row === null) {
            return null;
        }
        $tm = trim((string) ($row['tm'] ?? ''));
        if ($tm === '') {
            return null;
        }

        return ['hijriyah' => $hijriyah, 'masehi' => $tm];
    }

    /**
     * @param array<string, mixed> $payload Hasil PendaftarAnalisisHelper::buildSnapshot
     */
    private static function formatPayloadForPrompt(array $payload): string
    {
        $th = (string) ($payload['tahun_hijriyah'] ?? '');
        $tm = (string) ($payload['tahun_masehi'] ?? '');
        $ring = $payload['ringkasan_pembayaran'] ?? [];
        $dist = $payload['distribusi_hari_pendaftar'] ?? [];
        $potensi = $payload['potensi_duplikasi_orang_sama'] ?? [];
        $rganda = $payload['registrasi_ganda_per_santri'] ?? [];
        $samples = $payload['detail_samples'] ?? [];
        $belum = $samples['belum_bayar'] ?? [];
        $kurang = $samples['kurang_bayar'] ?? [];

        $lines = [];
        $lines[] = '=== ANALISIS DATA PENDAFTAR PSB (otomatis server; baca saja; rahasia institusi) ===';
        $lines[] = 'Tahun ajaran (filter): Hijriyah ' . $th . ' · Masehi ' . $tm . '.';
        $lines[] = 'Angka mengikuti lingkup lembaga akun Anda (sama seperti halaman Data Pendaftar).';
        $lines[] = '';

        $lines[] = '[Ringkasan pembayaran registrasi]';
        $lines[] = '- Total registrasi: ' . (int) ($ring['total_registrasi'] ?? 0);
        $lines[] = '- Lunas: ' . (int) ($ring['lunas'] ?? 0);
        $lines[] = '- Belum bayar (nominal masuk 0): ' . (int) ($ring['belum_bayar'] ?? 0);
        $lines[] = '- Kurang bayar: ' . (int) ($ring['kurang_bayar'] ?? 0);
        $lines[] = '- Tanpa tagihan (wajib 0): ' . (int) ($ring['tanpa_tagihan'] ?? 0);
        $lines[] = '- Total tagihan (wajib) Rp: ' . round((float) ($ring['total_wajib_rp'] ?? 0));
        $lines[] = '- Total sudah dibayar Rp: ' . round((float) ($ring['total_bayar_rp'] ?? 0));
        $lines[] = '- Total piutang/kurang Rp (agregat): ' . round((float) ($ring['total_kurang_rp'] ?? 0));
        $pct = ($ring['total_wajib_rp'] ?? 0) > 0
            ? round(100.0 * (float) ($ring['total_bayar_rp'] ?? 0) / (float) $ring['total_wajib_rp'], 1)
            : null;
        if ($pct !== null) {
            $lines[] = '- Rasio terhadap total tagihan (pendapatan terklaim vs wajib): ~' . $pct . '%';
        }

        $lines[] = '';
        $lines[] = '[Hari dengan jumlah pendaftar terbanyak (tanggal pertama kali biodata disimpan, fallback tanggal dibuat registrasi)]';
        if (!is_array($dist) || $dist === []) {
            $lines[] = '(tidak ada tanggal tercatat)';
        } else {
            $top = $dist[0] ?? null;
            if (is_array($top)) {
                $lines[] = 'Puncak: ' . ($top['tanggal'] ?? '?') . ' — ' . (int) ($top['jumlah'] ?? 0) . ' registrasi.';
            }
            $n = 0;
            foreach ($dist as $row) {
                if (!is_array($row) || $n >= 10) {
                    break;
                }
                $lines[] = '- ' . ($row['tanggal'] ?? '') . ': ' . (int) ($row['jumlah'] ?? 0);
                $n++;
            }
        }

        $lines[] = '';
        $lines[] = '[Sampel yang belum bayar — id registrasi · id santri · NIS · nama · wajib Rp · kurang Rp]';
        if (!is_array($belum) || $belum === []) {
            $lines[] = '(kosong atau tidak disertakan)';
        } else {
            foreach ($belum as $b) {
                if (!is_array($b)) {
                    continue;
                }
                $nis = $b['nis'] ?? null;
                $nisT = $nis !== null && trim((string) $nis) !== '' ? (string) $nis : '—';
                $lines[] = '- reg ' . (int) ($b['id_registrasi'] ?? 0)
                    . ' · santri ' . (int) ($b['id_santri'] ?? 0)
                    . ' · NIS ' . $nisT
                    . ' · ' . ($b['nama'] ?? '')
                    . ' · wajib ' . (int) ($b['wajib_rp'] ?? 0)
                    . ' · kurang ' . (int) ($b['kurang_rp'] ?? 0);
            }
        }

        $lines[] = '';
        $lines[] = '[Sampel kurang bayar]';
        if (!is_array($kurang) || $kurang === []) {
            $lines[] = '(kosong)';
        } else {
            foreach ($kurang as $b) {
                if (!is_array($b)) {
                    continue;
                }
                $nis = $b['nis'] ?? null;
                $nisT = $nis !== null && trim((string) $nis) !== '' ? (string) $nis : '—';
                $lines[] = '- reg ' . (int) ($b['id_registrasi'] ?? 0)
                    . ' · NIS ' . $nisT
                    . ' · ' . ($b['nama'] ?? '')
                    . ' · wajib ' . (int) ($b['wajib_rp'] ?? 0)
                    . ' · bayar ' . (int) ($b['bayar_rp'] ?? 0)
                    . ' · kurang ' . (int) ($b['kurang_rp'] ?? 0);
            }
        }

        $lines[] = '';
        $lines[] = '[Registrasi ganda per santri (satu santri punya lebih dari satu baris registrasi pada tahun ajaran ini)]';
        if (!is_array($rganda) || $rganda === []) {
            $lines[] = '(tidak ada)';
        } else {
            $n = 0;
            foreach ($rganda as $g) {
                if (!is_array($g) || $n >= 15) {
                    break;
                }
                $ids = $g['id_registrasi'] ?? [];
                $idsStr = is_array($ids) ? implode(', ', array_map('intval', $ids)) : '';
                $lines[] = '- santri id ' . (int) ($g['id_santri'] ?? 0) . ' · ' . (int) ($g['jumlah_registrasi'] ?? 0)
                    . ' registrasi · id: ' . $idsStr;
                $n++;
            }
        }

        $lines[] = '';
        $lines[] = '[Potensi pendaftar ganda / orang sama (heuristik)]';
        if (!is_array($potensi) || $potensi === []) {
            $lines[] = '(tidak terdeteksi pada tahun ajaran ini)';
        } else {
            $gn = 0;
            foreach ($potensi as $p) {
                if (!is_array($p) || $gn >= self::MAX_POTENSI_GROUPS_IN_TEXT) {
                    break;
                }
                $lines[] = '- [' . ($p['jenis'] ?? '') . '] ' . ($p['deskripsi'] ?? '');
                $lines[] = '  NIK berbeda antar anggota: ' . (!empty($p['nik_unik_berbeda']) ? 'ya' : 'tidak');
                $anggota = $p['anggota'] ?? [];
                $an = 0;
                if (is_array($anggota)) {
                    foreach ($anggota as $m) {
                        if (!is_array($m) || $an >= self::MAX_ANGGOTA_PER_GROUP) {
                            break;
                        }
                        $nis = $m['nis'] ?? null;
                        $nisT = $nis !== null && trim((string) $nis) !== '' ? (string) $nis : '—';
                        $lines[] = '  · reg ' . (int) ($m['id_registrasi'] ?? 0)
                            . ' · santri ' . (int) ($m['id_santri'] ?? 0)
                            . ' · NIS ' . $nisT
                            . ' · ' . ($m['nama'] ?? '')
                            . ' · ' . ($m['status_pembayaran'] ?? '');
                        $an++;
                    }
                }
                $gn++;
            }
            if (\count($potensi) > self::MAX_POTENSI_GROUPS_IN_TEXT) {
                $lines[] = '(… potensi lain dipotong; buka halaman Pendaftaran → Analisis untuk daftar penuh)';
            }
        }

        $lines[] = '';
        $lines[] = '---';
        $lines[] = 'Petunjuk untuk asisten AI:';
        $lines[] = '(1) Jelaskan siapa saja kelompok belum/kurang bayar dari sampel dan implikasi operasional (penagihan, pengingat WA, verifikasi berkas).';
        $lines[] = '(2) Analisis keuangan singkat dari ringkasan (piutang, proporsi lunas, risiko penolakan administrasi).';
        $lines[] = '(3) Uraikan pola hari puncak pendaftaran (kampanye, penempatan petugas, beban server).';
        $lines[] = '(4) Bahas potensi duplikasi dan registrasi ganda; tekankan verifikasi manual sebelum Padukan Data.';
        $lines[] = '(5) Berikan 3–7 saran perbaikan konkret selaras modul eBeddien (Data Pendaftar, Item/tagihan, Padukan Data, komunikasi ortu).';
        $lines[] = 'Jangan menyebut nama tabel basis data. Jangan mengarang id/NIS di luar daftar di atas.';

        return implode("\n", $lines);
    }

    private static function trimBlock(string $s): string
    {
        if (mb_strlen($s, 'UTF-8') <= self::MAX_BLOCK_CHARS) {
            return $s;
        }

        return mb_substr($s, 0, self::MAX_BLOCK_CHARS - 40, 'UTF-8') . "\n…(analisis pendaftar dipotong).";
    }
}
