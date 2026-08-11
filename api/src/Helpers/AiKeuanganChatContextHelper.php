<?php

declare(strict_types=1);

namespace App\Helpers;

use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;

/**
 * Menyisipkan ringkasan pemasukan/pengeluaran (agregat DB) ke konteks chat AI
 * bila pengguna berhak dan pertanyaan menyentuh keuangan.
 */
final class AiKeuanganChatContextHelper
{
    private const MAX_BLOCK_CHARS = 6000;

    /** Maks. baris rencana yang belum di-approve untuk konteks prompt */
    private const MAX_RENCANA_PENDING_ROWS = 28;

    /**
     * @param array{role_keys: list<string>, codes: list<string>, items: list<array<string, mixed>>, app_key: string}|null $snapshot
     */
    public static function tryBuildFinanceContext(\PDO $db, array $user, string $lastUserMessage, ?array $snapshot = null): ?string
    {
        return self::tryBuildFinanceBlock($db, $user, $lastUserMessage, $snapshot);
    }

    /**
     * @param array{role_keys: list<string>, codes: list<string>, items: list<array<string, mixed>>, app_key: string}|null $snapshot
     */
    private static function tryBuildFinanceBlock(\PDO $db, array $user, string $lastUserMessage, ?array $snapshot = null): ?string
    {
        $trimmed = trim($lastUserMessage);
        if ($trimmed === '') {
            return null;
        }
        if (!self::messageSuggestsFinanceSummary($trimmed) && !self::messageSuggestsPengeluaranPendingApproval($trimmed)) {
            return null;
        }
        if ($snapshot === null) {
            $snapshot = AiChatUserCapabilityHelper::fetchEbeddienSnapshot($db, $user);
        }
        $codes = $snapshot['codes'] ?? [];
        if (!self::userMayReceiveFinanceSummary($db, $user, $codes)) {
            return null;
        }

        try {
            return self::buildFinanceBlock($db, $user, $trimmed, $codes);
        } catch (\Throwable $e) {
            error_log('AiKeuanganChatContextHelper: ' . $e->getMessage());

            return null;
        }
    }

    private static function messageSuggestsFinanceSummary(string $text): bool
    {
        $t = mb_strtolower($text, 'UTF-8');

        return (bool) preg_match(
            '/pemasukan|pengeluaran|keuangan|saldo|analisis|aktivitas|transaksi|pendapatan|'
            . 'laporan\s*keuangan|cash\s*flow|arus\s*kas|budget|anggaran|'
            . 'bulan\s*(lalu|kemarin|terakhir)|bulan\s+yang\s+lalu|last\s*month|'
            . 'satu\s+bulan|1\s+bulan|sebulan|30\s*hari|tiga\s*puluh\s*hari|'
            . 'dashboard\s*keuangan|ringkasan\s*keuangan|'
            . 'buat(?:kan)?\s+rencana\s+pengeluaran|rencana\s+pengeluaran\s+baru/i',
            $t
        );
    }

    /**
     * Pertanyaan tentang rencana pengeluaran yang belum disetujui / menunggu approve (bukan agregat realisasi).
     */
    private static function messageSuggestsPengeluaranPendingApproval(string $text): bool
    {
        $t = mb_strtolower(trim($text), 'UTF-8');
        if ($t === '') {
            return false;
        }

        $approvalCue = (bool) preg_match(
            '/belum\s*(di\s*)?(approve|setujui)|belum\s*disetujui|menunggu\s*(approve|persetujuan)|'
            . 'pending\s*approval|persetujuan\s*belum|disetujui\s*belum|'
            . 'yang\s*belum\s*(di\s*)?(approve|setujui)|list\s*belum\s*approve|daftar\s*belum\s*approve|'
            . 'belum\s*ada\s*yang\s*(approve|setujui)|antrian\s*approve|menunggu\s*admin/i',
            $t
        );
        if (!$approvalCue) {
            return false;
        }

        if (preg_match('/pengeluaran|keuangan/i', $t)) {
            return true;
        }
        if (preg_match('/\brencana\b/i', $t)) {
            return true;
        }

        return false;
    }

    /**
     * @param list<string> $codes Gabungan kode dari role___fitur (kosong = fallback cek per kode via DB).
     */
    private static function userMayReceiveFinanceSummary(\PDO $db, array $user, array $codes): bool
    {
        if (RoleHelper::tokenHasAnyRoleKey($user, ['super_admin'])) {
            return true;
        }

        if (RoleHelper::tokenHasPermissionFromRolePolicy($user, 'manage_finance')) {
            return true;
        }

        $legacyFinance = LegacyRouteRoles::forKey(LegacyRouteRoleKeys::FINANCE_MENUS);
        if ($legacyFinance !== [] && RoleHelper::tokenHasAnyRoleKey($user, $legacyFinance)) {
            return true;
        }

        if ($codes !== []) {
            foreach ($codes as $c) {
                $c = (string) $c;
                if (in_array($c, ['menu.pemasukan', 'menu.pengeluaran', 'menu.dashboard_keuangan', 'menu.aktivitas', 'menu.aktivitas_tahun_ajaran'], true)) {
                    return true;
                }
                if (str_starts_with($c, 'action.pengeluaran.')) {
                    return true;
                }
            }

            return false;
        }

        foreach (['menu.pemasukan', 'menu.pengeluaran', 'menu.dashboard_keuangan', 'menu.aktivitas', 'menu.aktivitas_tahun_ajaran'] as $menuCode) {
            if (RoleHelper::tokenHasEbeddienFiturCode($db, $user, $menuCode)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param list<string> $codes
     */
    private static function userCanSeePemasukan(\PDO $db, array $user, array $codes): bool
    {
        if (RoleHelper::tokenHasAnyRoleKey($user, ['super_admin'])) {
            return true;
        }

        if (RoleHelper::tokenHasPermissionFromRolePolicy($user, 'manage_finance')) {
            return true;
        }

        $legacyFinance = LegacyRouteRoles::forKey(LegacyRouteRoleKeys::FINANCE_MENUS);
        if ($legacyFinance !== [] && RoleHelper::tokenHasAnyRoleKey($user, $legacyFinance)) {
            return true;
        }

        if ($codes !== []) {
            foreach ($codes as $c) {
                if (in_array((string) $c, ['menu.pemasukan', 'menu.dashboard_keuangan', 'menu.aktivitas', 'menu.aktivitas_tahun_ajaran'], true)) {
                    return true;
                }
            }

            return false;
        }

        foreach (['menu.pemasukan', 'menu.dashboard_keuangan', 'menu.aktivitas', 'menu.aktivitas_tahun_ajaran'] as $c) {
            if (RoleHelper::tokenHasEbeddienFiturCode($db, $user, $c)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param list<string> $codes
     */
    private static function userCanSeePengeluaran(\PDO $db, array $user, array $codes): bool
    {
        if (RoleHelper::tokenHasAnyRoleKey($user, ['super_admin'])) {
            return true;
        }

        if (RoleHelper::tokenHasPermissionFromRolePolicy($user, 'manage_finance')) {
            return true;
        }

        $legacyFinance = LegacyRouteRoles::forKey(LegacyRouteRoleKeys::FINANCE_MENUS);
        if ($legacyFinance !== [] && RoleHelper::tokenHasAnyRoleKey($user, $legacyFinance)) {
            return true;
        }

        if ($codes !== []) {
            foreach ($codes as $c) {
                $c = (string) $c;
                if (in_array($c, ['menu.pengeluaran', 'menu.dashboard_keuangan', 'menu.aktivitas', 'menu.aktivitas_tahun_ajaran'], true)) {
                    return true;
                }
                if (str_starts_with($c, 'action.pengeluaran.')) {
                    return true;
                }
            }

            return false;
        }

        foreach (['menu.pengeluaran', 'menu.dashboard_keuangan', 'menu.aktivitas', 'menu.aktivitas_tahun_ajaran'] as $c) {
            if (RoleHelper::tokenHasEbeddienFiturCode($db, $user, $c)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array{0:string,1:string,2:string} [startYmd, endYmd, deskripsi_periode]
     */
    private static function resolvePeriod(string $message): array
    {
        $m = mb_strtolower($message, 'UTF-8');
        if (preg_match('/30\s*hari|tiga\s*puluh\s*hari/i', $m)) {
            $end = new \DateTimeImmutable('today');
            $start = $end->modify('-30 days');

            return [$start->format('Y-m-d'), $end->format('Y-m-d'), 'rolling 30 hari hingga hari ini'];
        }
        if (preg_match('/bulan\s+lalu|bulan\s+kemarin|bulan\s+yang\s+lalu|last\s+month/i', $m)) {
            $firstThis = new \DateTimeImmutable('first day of this month');
            $end = $firstThis->modify('-1 day');
            $start = $end->modify('first day of this month');

            return [$start->format('Y-m-d'), $end->format('Y-m-d'), 'kalender bulan sebelumnya (' . $start->format('Y-m') . ')'];
        }

        // "1 bulan terakhir" / pertanyaan umum → 30 hari terakhir (inklusif hari ini)
        $end = new \DateTimeImmutable('today');
        $start = $end->modify('-29 days');

        return [$start->format('Y-m-d'), $end->format('Y-m-d'), 'rolling ~30 hari (29 hari ke belakang + hari ini)'];
    }

    /**
     * Filter lembaga untuk pemasukan: samakan dengan pola pembatasan pengeluaran bila ada.
     *
     * @return array{apply:bool, ids:list<string>}
     */
    private static function pemasukanLembagaFilter(\PDO $db, array $user): array
    {
        if (!RoleHelper::tokenPengeluaranApplyLembagaScope($db, $user, 'pengeluaran')) {
            return ['apply' => false, 'ids' => []];
        }
        $ids = RoleHelper::tokenPengeluaranLembagaIdsFromUser($user);

        return ['apply' => $ids !== [], 'ids' => $ids];
    }

    /**
     * @param list<string> $conditions
     * @param list<mixed> $params
     */
    private static function appendPengeluaranLembagaSql(\PDO $db, array $user, array &$conditions, array &$params): void
    {
        if (!RoleHelper::tokenPengeluaranApplyLembagaScope($db, $user, 'pengeluaran')) {
            return;
        }
        $ids = RoleHelper::tokenPengeluaranLembagaIdsFromUser($user);
        if ($ids === []) {
            return;
        }
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $conditions[] = "p.lembaga IN ({$ph})";
        foreach ($ids as $id) {
            $params[] = $id;
        }
    }

    /**
     * Filter lembaga untuk rencana pengeluaran (kolom r.lembaga).
     *
     * @param list<string> $conditions
     * @param list<mixed> $params
     */
    private static function appendRencanaPengeluaranLembagaSql(\PDO $db, array $user, array &$conditions, array &$params): void
    {
        if (!RoleHelper::tokenPengeluaranApplyLembagaScope($db, $user, 'pengeluaran')) {
            return;
        }
        $ids = RoleHelper::tokenPengeluaranLembagaIdsFromUser($user);
        if ($ids === []) {
            return;
        }
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $conditions[] = "r.lembaga IN ({$ph})";
        foreach ($ids as $id) {
            $params[] = $id;
        }
    }

    private static function rencanaPengeluaranTableReady(\PDO $db): bool
    {
        try {
            $st = $db->query("SHOW TABLES LIKE 'pengeluaran___rencana'");

            return $st !== false && $st->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function summarizeRencanaKeterangan(?string $raw): string
    {
        $collapsed = preg_replace('/\s+/u', ' ', (string) $raw);
        $s = trim(is_string($collapsed) ? $collapsed : '');
        if ($s === '') {
            return '—';
        }
        if (mb_strlen($s, 'UTF-8') > 140) {
            return mb_substr($s, 0, 137, 'UTF-8') . '…';
        }

        return $s;
    }

    /**
     * Label human-readable untuk kolom ket rencana.
     */
    private static function labelRencanaKet(string $ket): string
    {
        $k = trim($ket);

        return match ($k) {
            'pending' => 'menunggu persetujuan',
            'di edit' => 'sedang diperbaiki (diajukan ulang)',
            'draft' => 'draf',
            'ditolak' => 'ditolak',
            'di approve' => 'sudah disetujui',
            default => ($k !== '' ? $k : '—'),
        };
    }

    /**
     * @return list<string>
     */
    private static function buildRencanaPendingApprovalLines(\PDO $db, array $user, string $message): array
    {
        if (!self::messageSuggestsPengeluaranPendingApproval($message)) {
            return [];
        }
        if (!self::rencanaPengeluaranTableReady($db)) {
            return [
                '',
                'RENCANA BELUM DI-APPROVE: (tabel rencana pengeluaran tidak ditemukan — lewati).',
            ];
        }

        $conditions = ["r.ket IN ('pending','di edit','draft')"];
        $params = [];
        self::appendRencanaPengeluaranLembagaSql($db, $user, $conditions, $params);
        $where = 'WHERE ' . implode(' AND ', $conditions);
        $lim = self::MAX_RENCANA_PENDING_ROWS;

        try {
            $sql = "SELECT r.id, r.keterangan, r.kategori, r.lembaga, r.nominal, r.ket, r.tahun_ajaran, r.tanggal_dibuat
                FROM pengeluaran___rencana r {$where}
                ORDER BY r.tanggal_dibuat DESC
                LIMIT {$lim}";
            $st = $db->prepare($sql);
            $st->execute($params);
            $rows = $st->fetchAll(\PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            error_log('AiKeuanganChatContextHelper rencana pending ' . $e->getMessage());

            return ['', 'RENCANA BELUM DI-APPROVE: (gagal membaca basis data).'];
        }

        $lines = [];
        $lines[] = '';
        $lines[] = 'RENCANA PENGELUARAN BELUM DI-APPROVE (status ket: pending, di edit, atau draft — belum masuk realisasi tabel pengeluaran):';
        if ($rows === []) {
            $lines[] = '(tidak ada baris yang cocok untuk lingkup lembaga Anda.)';

            return $lines;
        }

        $sum = 0.0;
        foreach ($rows as $r) {
            $sum += (float) ($r['nominal'] ?? 0);
            $id = (int) ($r['id'] ?? 0);
            $ketLabel = self::labelRencanaKet((string) ($r['ket'] ?? ''));
            $lines[] = '- id ' . $id
                . ' | ' . ($r['kategori'] ?? '—')
                . ' | lembaga ' . ($r['lembaga'] ?? '—')
                . ' | Rp ' . self::rp((float) ($r['nominal'] ?? 0))
                . ' | status: ' . $ketLabel
                . ' | TA: ' . ($r['tahun_ajaran'] ?? '—')
                . ' | dibuat: ' . ($r['tanggal_dibuat'] ?? '—')
                . ' | ket: ' . self::summarizeRencanaKeterangan(isset($r['keterangan']) ? (string) $r['keterangan'] : '');
        }
        $lines[] = 'Ringkas: ' . count($rows) . ' rencana teratas (urut terbaru), Σ nominal Rp ' . self::rp($sum) . '.';
        $lines[] = 'Detail lengkap & aksi approve/tolak: menu Pengeluaran → tab Rencana di aplikasi.';

        return $lines;
    }

    /**
     * @param list<string> $codes
     */
    private static function buildFinanceBlock(\PDO $db, array $user, string $message, array $codes): string
    {
        [$dari, $sampai, $periodeLabel] = self::resolvePeriod($message);

        $lines = [];
        $lines[] = 'Periode: ' . $periodeLabel . ' (tanggal ' . $dari . ' s.d. ' . $sampai . ', filter tanggal = tanggal_dibuat).';
        $scopeNote = '';
        if (RoleHelper::tokenPengeluaranApplyLembagaScope($db, $user, 'pengeluaran')) {
            $ids = RoleHelper::tokenPengeluaranLembagaIdsFromUser($user);
            if ($ids !== []) {
                $scopeNote = 'Pengeluaran (dan pemasukan bila difilter) dibatasi ke lembaga: ' . implode(', ', $ids) . '.';
            }
        }
        if ($scopeNote !== '') {
            $lines[] = $scopeNote;
        }

        $canP = self::userCanSeePemasukan($db, $user, $codes);
        $canPg = self::userCanSeePengeluaran($db, $user, $codes);

        $totalMasuk = 0.0;
        $totalKeluar = 0.0;

        if ($canP) {
            $conditions = ['DATE(p.tanggal_dibuat) >= ?', 'DATE(p.tanggal_dibuat) <= ?'];
            $params = [$dari, $sampai];
            $pf = self::pemasukanLembagaFilter($db, $user);
            if ($pf['apply']) {
                $ph = implode(',', array_fill(0, count($pf['ids']), '?'));
                $conditions[] = "(p.lembaga IN ({$ph}))";
                foreach ($pf['ids'] as $id) {
                    $params[] = $id;
                }
            }
            $where = 'WHERE ' . implode(' AND ', $conditions);

            $sqlSum = "SELECT COALESCE(SUM(p.nominal),0) AS total, COUNT(*) AS cnt FROM pemasukan p {$where}";
            $st = $db->prepare($sqlSum);
            $st->execute($params);
            $row = $st->fetch(\PDO::FETCH_ASSOC);
            $totalMasuk = (float) ($row['total'] ?? 0);
            $cntP = (int) ($row['cnt'] ?? 0);

            $lines[] = '';
            $lines[] = 'PEMASUKAN: total Rp ' . self::rp($totalMasuk) . ' (' . $cntP . ' baris).';
            $sqlKat = "SELECT p.kategori, COALESCE(SUM(p.nominal),0) AS sub, COUNT(*) AS n
                FROM pemasukan p {$where}
                GROUP BY p.kategori
                ORDER BY sub DESC
                LIMIT 8";
            $st2 = $db->prepare($sqlKat);
            $st2->execute($params);
            while ($r = $st2->fetch(\PDO::FETCH_ASSOC)) {
                $kat = (string) ($r['kategori'] ?? '—');
                $lines[] = '  - ' . $kat . ': Rp ' . self::rp((float) ($r['sub'] ?? 0)) . ' (' . (int) ($r['n'] ?? 0) . ' baris)';
            }
        } else {
            $lines[] = '';
            $lines[] = 'PEMASUKAN: (tidak disertakan — tidak ada menu.pemasukan / aktivitas / dashboard keuangan pada penugasan fitur role Anda).';
        }

        if ($canPg) {
            $conditions = ['DATE(p.tanggal_dibuat) >= ?', 'DATE(p.tanggal_dibuat) <= ?'];
            $params = [$dari, $sampai];
            self::appendPengeluaranLembagaSql($db, $user, $conditions, $params);
            $where = 'WHERE ' . implode(' AND ', $conditions);

            $sqlSum = "SELECT COALESCE(SUM(p.nominal),0) AS total, COUNT(*) AS cnt FROM pengeluaran p {$where}";
            $st = $db->prepare($sqlSum);
            $st->execute($params);
            $row = $st->fetch(\PDO::FETCH_ASSOC);
            $totalKeluar = (float) ($row['total'] ?? 0);
            $cntPg = (int) ($row['cnt'] ?? 0);

            $lines[] = '';
            $lines[] = 'PENGELUARAN: total Rp ' . self::rp($totalKeluar) . ' (' . $cntPg . ' baris).';
            $sqlKat = "SELECT p.kategori, COALESCE(SUM(p.nominal),0) AS sub, COUNT(*) AS n
                FROM pengeluaran p {$where}
                GROUP BY p.kategori
                ORDER BY sub DESC
                LIMIT 8";
            $st2 = $db->prepare($sqlKat);
            $st2->execute($params);
            while ($r = $st2->fetch(\PDO::FETCH_ASSOC)) {
                $kat = (string) ($r['kategori'] ?? '—');
                $lines[] = '  - ' . $kat . ': Rp ' . self::rp((float) ($r['sub'] ?? 0)) . ' (' . (int) ($r['n'] ?? 0) . ' baris)';
            }

            $sqlLem = "SELECT p.lembaga, COALESCE(SUM(p.nominal),0) AS sub, COUNT(*) AS n
                FROM pengeluaran p {$where}
                GROUP BY p.lembaga
                ORDER BY sub DESC
                LIMIT 6";
            $st3 = $db->prepare($sqlLem);
            $st3->execute($params);
            $lemRows = $st3->fetchAll(\PDO::FETCH_ASSOC);
            if ($lemRows !== []) {
                $lines[] = '  Per lembaga (top):';
                foreach ($lemRows as $r) {
                    $lem = (string) ($r['lembaga'] ?? '—');
                    $lines[] = '    · ' . $lem . ': Rp ' . self::rp((float) ($r['sub'] ?? 0)) . ' (' . (int) ($r['n'] ?? 0) . ' baris)';
                }
            }
        } else {
            $lines[] = '';
            $lines[] = 'PENGELUARAN: (tidak disertakan — tidak ada menu.pengeluaran, aksi action.pengeluaran.*, aktivitas, atau dashboard keuangan pada penugasan fitur role Anda).';
        }

        if ($canP && $canPg) {
            $net = $totalMasuk - $totalKeluar;
            $lines[] = '';
            $lines[] = 'NET (pemasukan − pengeluaran, periode yang sama): Rp ' . self::rp($net) . '.';
        }

        if ($canPg) {
            foreach (self::buildRencanaPendingApprovalLines($db, $user, $message) as $line) {
                $lines[] = $line;
            }
        }

        $out = implode("\n", $lines);
        if (mb_strlen($out, 'UTF-8') > self::MAX_BLOCK_CHARS) {
            return mb_substr($out, 0, self::MAX_BLOCK_CHARS - 20, 'UTF-8') . "\n…(dipotong)";
        }

        return $out;
    }

    private static function rp(float $n): string
    {
        return number_format($n, 0, ',', '.');
    }
}
