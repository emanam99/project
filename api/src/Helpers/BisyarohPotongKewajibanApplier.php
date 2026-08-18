<?php

declare(strict_types=1);

namespace App\Helpers;

use PDO;

/**
 * Saat rekap dirilis: untuk setiap baris rekap pengurus, alokasikan total nominal ke UWABA santri
 * yang punya toggle aktif di MyBeddien (tabel bisyaroh___potong_santri), hanya santri dengan id_user = pengurus.id_user.
 * Hanya kalender Masehi; bulan hijriyah harus masuk 10 bulan syahriah; perlu psa___kalender & tahun_ajaran aktif.
 */
final class BisyarohPotongKewajibanApplier
{
    /** id_bulan di tabel `uwaba` — bulan hijriyah syahriah (bukan indeks 1–10). */
    private const UWABA_ID_BULAN_SYAHRIAH = [11, 12, 1, 2, 3, 4, 5, 6, 7, 8];

    public static function featureEnabled(PDO $db): bool
    {
        return self::schemaReady($db);
    }

    /** @return list<int> */
    public static function validUwabaIdBulanList(): array
    {
        return self::UWABA_ID_BULAN_SYAHRIAH;
    }

    public static function isValidUwabaIdBulan(int $idBulan): bool
    {
        return in_array($idBulan, self::UWABA_ID_BULAN_SYAHRIAH, true);
    }

    private static function sqlUwabaIdBulanIn(string $columnQualified): string
    {
        $list = implode(', ', array_map('intval', self::UWABA_ID_BULAN_SYAHRIAH));

        return $columnQualified . ' IN (' . $list . ')';
    }

    /**
     * Bulan syahriah UWABA (id_bulan hijriyah) dari periode rekap Masehi YYYY-MM.
     *
     * @return array{tahun_ajaran: string, id_bulan: int, hijri_full: string}|null
     */
    private static function resolveSyahriahSlotForMasehiPeriode(PDO $db, string $periodeBulan): ?array
    {
        if (!preg_match('/^\d{4}-\d{2}$/', $periodeBulan)) {
            return null;
        }
        $taRow = TahunAjaranActiveHelper::fetchActiveHijriyahRowForMasehiDate($db, $periodeBulan . '-15');
        if ($taRow === null) {
            return null;
        }
        $hijriFull = PsaKalenderMasehiToHijriHelper::masehiYmdToHijriyahYmd($db, $periodeBulan . '-15', '12:00:00');
        if ($hijriFull === null) {
            return null;
        }
        $parts = explode('-', $hijriFull);
        $hMonth = isset($parts[1]) ? (int) $parts[1] : 0;
        if (!self::isValidUwabaIdBulan($hMonth)) {
            return null;
        }

        return [
            'tahun_ajaran' => (string) $taRow['tahun_ajaran'],
            'id_bulan' => $hMonth,
            'hijri_full' => $hijriFull,
        ];
    }

    /**
     * Tagihan UWABA santri untuk bulan syahriah yang dipetakan dari periode Masehi rekap (YYYY-MM).
     *
     * @return array{
     *   periode_masehi: string,
     *   in_syahriah_window: bool,
     *   tahun_ajaran: ?string,
     *   id_bulan: ?int,
     *   bulan_nama: ?string,
     *   nominal: ?int,
     *   wajib: ?int,
     *   ada_baris: bool
     * }
     */
    public static function fetchUwabaTagihanForSantriMasehiPeriode(PDO $db, int $idSantri, string $periodeBulanMasehi): array
    {
        $empty = [
            'periode_masehi' => $periodeBulanMasehi,
            'in_syahriah_window' => false,
            'tahun_ajaran' => null,
            'id_bulan' => null,
            'bulan_nama' => null,
            'nominal' => null,
            'wajib' => null,
            'ada_baris' => false,
        ];
        if ($idSantri <= 0 || !preg_match('/^\d{4}-\d{2}$/', $periodeBulanMasehi)) {
            return $empty;
        }
        $slot = self::resolveSyahriahSlotForMasehiPeriode($db, $periodeBulanMasehi);
        if ($slot === null) {
            return $empty;
        }
        $ta = $slot['tahun_ajaran'];
        $idBulan = $slot['id_bulan'];
        $stmt = $db->prepare(
            'SELECT `nominal`, `wajib`, `bulan` FROM `uwaba` WHERE `id_santri` = ? AND `tahun_ajaran` = ? AND `id_bulan` = ? LIMIT 1'
        );
        $stmt->execute([$idSantri, $ta, $idBulan]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $ada = is_array($row);

        return [
            'periode_masehi' => $periodeBulanMasehi,
            'in_syahriah_window' => true,
            'tahun_ajaran' => $ta,
            'id_bulan' => $idBulan,
            'bulan_nama' => $ada ? (trim((string) ($row['bulan'] ?? '')) !== '' ? trim((string) $row['bulan']) : null) : null,
            'nominal' => $ada && isset($row['nominal']) ? (int) $row['nominal'] : null,
            'wajib' => $ada && isset($row['wajib']) && $row['wajib'] !== null && $row['wajib'] !== '' ? (int) $row['wajib'] : null,
            'ada_baris' => $ada,
        ];
    }

    /** @return array{applied: int, messages: list<string>} */
    public static function applyAfterRilis(
        PDO $db,
        int $bisyarohId,
        string $lembagaId,
        string $periodeBulan,
        string $kalender,
        int $actorPengurusId
    ): array {
        $messages = [];
        $applied = 0;
        if (!self::schemaReady($db)) {
            return ['applied' => 0, 'messages' => []];
        }
        if ($kalender !== 'masehi') {
            return ['applied' => 0, 'messages' => ['Potong kewajiban: hanya periode kalender Masehi yang didukung.']];
        }
        if (!preg_match('/^\d{4}-\d{2}$/', $periodeBulan)) {
            return ['applied' => 0, 'messages' => ['Potong kewajiban: periode tidak valid.']];
        }
        $slot = self::resolveSyahriahSlotForMasehiPeriode($db, $periodeBulan);
        if ($slot === null) {
            return ['applied' => 0, 'messages' => ['Potong kewajiban: tahun ajaran / kalender tidak siap untuk periode ini.']];
        }
        $tahunAjaran = $slot['tahun_ajaran'];
        $hasKal = self::rekapHasKalenderColumn($db);
        $lembagaSql = self::sqlPengurusBerjabatanDiLembaga('r', 'pj_pot', 'j_pot');
        try {
            if ($hasKal) {
                $stmt = $db->prepare(
                    'SELECT r.`id`, r.`id_pengurus`, r.`nilai_json`, r.`catatan` FROM `bisyaroh___rekap_baris` r
                     WHERE r.`bisyaroh_id` = ? AND r.`periode_bulan` = ? AND r.`kalender` = ?
                       AND ' . $lembagaSql . '
                     ORDER BY r.`id_pengurus` ASC'
                );
                $stmt->execute([$bisyarohId, $periodeBulan, $kalender, $lembagaId, $lembagaId]);
            } else {
                $stmt = $db->prepare(
                    'SELECT r.`id`, r.`id_pengurus`, r.`nilai_json`, r.`catatan` FROM `bisyaroh___rekap_baris` r
                     WHERE r.`bisyaroh_id` = ? AND r.`periode_bulan` = ?
                       AND ' . $lembagaSql . '
                     ORDER BY r.`id_pengurus` ASC'
                );
                $stmt->execute([$bisyarohId, $periodeBulan, $lembagaId, $lembagaId]);
            }
            $rekRows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            error_log('BisyarohPotongKewajibanApplier applyAfterRilis: ' . $e->getMessage());

            return ['applied' => 0, 'messages' => ['Potong kewajiban: gagal membaca baris rekap.']];
        }
        if (!is_array($rekRows) || $rekRows === []) {
            return ['applied' => 0, 'messages' => []];
        }
        $waktu = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
        $masehiTanggal = date('Y-m-d', strtotime($waktu));
        $hijriFull = PsaKalenderMasehiToHijriHelper::masehiYmdToHijriyahYmd($db, $masehiTanggal, '12:00:00') ?? $slot['hijri_full'];
        foreach ($rekRows as $rek) {
            if (!is_array($rek)) {
                continue;
            }
            $one = self::applyPotongForSingleRekapBaris(
                $db,
                $bisyarohId,
                $rek,
                $tahunAjaran,
                $hijriFull,
                $waktu,
                $masehiTanggal,
                $actorPengurusId
            );
            $applied += $one['applied'];
            foreach ($one['messages'] as $m) {
                $messages[] = $m;
            }
        }

        return ['applied' => $applied, 'messages' => $messages];
    }

    /**
     * Terapkan potong UWABA untuk satu baris rekap yang baru berhasil ditransfer.
     *
     * @return array{applied: int, messages: list<string>}
     */
    public static function applyAfterRilisForBaris(
        PDO $db,
        int $rekapBarisId,
        string $periodeBulan,
        string $kalender,
        int $actorPengurusId
    ): array {
        if (!self::schemaReady($db) || $rekapBarisId <= 0) {
            return ['applied' => 0, 'messages' => []];
        }
        if ($kalender !== 'masehi') {
            return ['applied' => 0, 'messages' => ['Potong kewajiban: hanya periode kalender Masehi yang didukung.']];
        }
        if (!preg_match('/^\d{4}-\d{2}$/', $periodeBulan)) {
            return ['applied' => 0, 'messages' => ['Potong kewajiban: periode tidak valid.']];
        }
        $slot = self::resolveSyahriahSlotForMasehiPeriode($db, $periodeBulan);
        if ($slot === null) {
            return ['applied' => 0, 'messages' => ['Potong kewajiban: tahun ajaran / kalender tidak siap untuk periode ini.']];
        }
        $stmt = $db->prepare(
            'SELECT r.`id`, r.`bisyaroh_id`, r.`id_pengurus`, r.`nilai_json`, r.`catatan`
             FROM `bisyaroh___rekap_baris` r WHERE r.`id` = ? LIMIT 1'
        );
        $stmt->execute([$rekapBarisId]);
        $rek = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!is_array($rek)) {
            return ['applied' => 0, 'messages' => []];
        }
        $waktu = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
        $masehiTanggal = date('Y-m-d', strtotime($waktu));
        $hijriFull = PsaKalenderMasehiToHijriHelper::masehiYmdToHijriyahYmd($db, $masehiTanggal, '12:00:00') ?? $slot['hijri_full'];

        return self::applyPotongForSingleRekapBaris(
            $db,
            (int) ($rek['bisyaroh_id'] ?? 0),
            $rek,
            $slot['tahun_ajaran'],
            $hijriFull,
            $waktu,
            $masehiTanggal,
            $actorPengurusId
        );
    }

    /**
     * @param array<string, mixed> $rekRow id, id_pengurus, nilai_json
     *
     * @return array{applied: int, messages: list<string>}
     */
    private static function applyPotongForSingleRekapBaris(
        PDO $db,
        int $bisyarohId,
        array $rekRow,
        string $tahunAjaran,
        string $hijriFull,
        string $waktu,
        string $masehiTanggal,
        int $actorPengurusId
    ): array {
        $messages = [];
        $applied = 0;
        $targetPengurusId = (int) ($rekRow['id_pengurus'] ?? 0);
        if ($targetPengurusId <= 0) {
            return ['applied' => 0, 'messages' => []];
        }
        $stmt = $db->prepare('SELECT `id_user` FROM `pengurus` WHERE `id` = ? LIMIT 1');
        $stmt->execute([$targetPengurusId]);
        $pUser = $stmt->fetch(PDO::FETCH_ASSOC);
        $uid = isset($pUser['id_user']) && $pUser['id_user'] !== null && $pUser['id_user'] !== ''
            ? (int) $pUser['id_user'] : 0;
        if ($uid <= 0) {
            return [
                'applied' => 0,
                'messages' => ['Potong kewajiban: pengurus #' . $targetPengurusId . ' tidak punya akun pengguna (id_user) — lewati.'],
            ];
        }
        if (!self::potongBulanSchemaReady($db)) {
            return ['applied' => 0, 'messages' => []];
        }
        $stmt = $db->prepare(
            'SELECT ps.`id_santri`, ps.`id_bulan` FROM `santri___potong_uwaba_bulan` ps
             INNER JOIN `santri` s ON s.`id` = ps.`id_santri` AND s.`id_user` = ?
             WHERE ps.`tahun_ajaran` = ? AND ' . self::sqlUwabaIdBulanIn('ps.`id_bulan`') . '
             ORDER BY ps.`id_santri` ASC'
        );
        $stmt->execute([$uid, $tahunAjaran]);
        /** @var array<int, int> $potongBulanBySantri */
        $potongBulanBySantri = [];
        while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $sid = (int) ($r['id_santri'] ?? 0);
            $idB = (int) ($r['id_bulan'] ?? 0);
            if ($sid > 0 && self::isValidUwabaIdBulan($idB)) {
                $potongBulanBySantri[$sid] = $idB;
            }
        }
        $santriIds = array_keys($potongBulanBySantri);
        if ($santriIds === []) {
            return ['applied' => 0, 'messages' => []];
        }
        $rekapBarisId = (int) ($rekRow['id'] ?? 0);
        if ($rekapBarisId <= 0) {
            return ['applied' => 0, 'messages' => []];
        }
        $total = self::computeTotalNominal($db, $bisyarohId, $targetPengurusId, $rekRow['nilai_json'] ?? null);
        $totalInt = (int) round(max(0.0, $total));
        if ($totalInt <= 0) {
            return ['applied' => 0, 'messages' => []];
        }
        $n = count($santriIds);
        $base = intdiv($totalInt, $n);
        $rem = $totalInt - ($base * $n);
        $adminNama = 'Bisyaroh';
        if ($actorPengurusId > 0) {
            $stmt = $db->prepare('SELECT `nama` FROM `pengurus` WHERE `id` = ? LIMIT 1');
            $stmt->execute([$actorPengurusId]);
            $an = $stmt->fetch(PDO::FETCH_ASSOC);
            if (is_array($an) && trim((string) ($an['nama'] ?? '')) !== '') {
                $adminNama = trim((string) $an['nama']);
            }
        }
        foreach ($santriIds as $i => $sid) {
            $share = $base + ($i < $rem ? 1 : 0);
            if ($share <= 0) {
                continue;
            }
            $idBulanUwaba = $potongBulanBySantri[$sid] ?? 0;
            if (!self::isValidUwabaIdBulan($idBulanUwaba)) {
                continue;
            }
            if (!self::isUwabaBulanBelumLunas($db, $sid, $tahunAjaran, $idBulanUwaba)) {
                $messages[] = 'Santri #' . $sid . ': bulan UWABA pilihan sudah lunas — lewati.';

                continue;
            }
            $stmt = $db->prepare(
                'SELECT `id` FROM `bisyaroh___potong_uwaba_log` WHERE `rekap_baris_id` = ? AND `id_santri` = ? LIMIT 1'
            );
            $stmt->execute([$rekapBarisId, $sid]);
            if ($stmt->fetchColumn()) {
                continue;
            }
            $stmt = $db->prepare(
                'SELECT `id` FROM `uwaba` WHERE `id_santri` = ? AND `tahun_ajaran` = ? AND `id_bulan` = ? LIMIT 1'
            );
            $stmt->execute([$sid, $tahunAjaran, $idBulanUwaba]);
            if (!$stmt->fetchColumn()) {
                $messages[] = 'Santri #' . $sid . ': belum ada baris UWABA untuk bulan & tahun ajaran ini — lewati.';

                continue;
            }
            try {
                $db->beginTransaction();
                $stmtCount = $db->prepare('SELECT COUNT(*) FROM `uwaba___bayar` WHERE `id_santri` = ? AND `tahun_ajaran` = ?');
                $stmtCount->execute([$sid, $tahunAjaran]);
                $nomor = (int) $stmtCount->fetchColumn() + 1;
                $via = 'Potong Bisyaroh';
                $stmtIns = $db->prepare(
                    'INSERT INTO `uwaba___bayar` (`id_santri`, `tahun_ajaran`, `nominal`, `via`, `admin`, `id_admin`, `hijriyah`, `masehi`, `nomor`)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $stmtIns->execute([
                    $sid,
                    $tahunAjaran,
                    $share,
                    $via,
                    $adminNama,
                    $actorPengurusId > 0 ? $actorPengurusId : null,
                    $hijriFull,
                    $waktu,
                    $nomor,
                ]);
                $bayarId = (int) $db->lastInsertId();
                $payId = self::insertPaymentInduk($db, $bayarId, $sid, $share, $via, $hijriFull, $actorPengurusId, $adminNama, $masehiTanggal);
                if ($payId > 0) {
                    $db->prepare('UPDATE `uwaba___bayar` SET `id_payment` = ? WHERE `id` = ?')->execute([$payId, $bayarId]);
                }
                $stmtUp = $db->prepare(
                    'UPDATE `uwaba` SET `nominal` = COALESCE(`nominal`, 0) + ? WHERE `id_santri` = ? AND `tahun_ajaran` = ? AND `id_bulan` = ?'
                );
                $stmtUp->execute([$share, $sid, $tahunAjaran, $idBulanUwaba]);
                $stmtLog = $db->prepare(
                    'INSERT INTO `bisyaroh___potong_uwaba_log` (`bisyaroh_id`, `rekap_baris_id`, `id_santri`, `nominal`, `uwaba_bayar_id`)
                     VALUES (?, ?, ?, ?, ?)'
                );
                $stmtLog->execute([$bisyarohId, $rekapBarisId, $sid, $share, $bayarId]);
                $db->commit();
                ++$applied;
            } catch (\Throwable $e) {
                if ($db->inTransaction()) {
                    $db->rollBack();
                }
                error_log('BisyarohPotongKewajibanApplier: ' . $e->getMessage());
                $messages[] = 'Gagal potong santri #' . $sid . ': ' . $e->getMessage();
            }
        }

        return ['applied' => $applied, 'messages' => $messages];
    }

    /**
     * Pratinjau pembagian potong UWABA per santri (untuk MyBeddien): total rekap terakhir ÷ jumlah santri potong aktif.
     *
     * @return array{
     *   active_santri_count: int,
     *   has_rekap_baris: bool,
     *   rekap_periode_bulan: ?string,
     *   rekap_kalender: ?string,
     *   rekap_total_rupiah: ?float,
     *   share_per_santri_rupiah: ?int,
     *   share_note: ?string
     * }
     */
    public static function previewPotongPerBulan(PDO $db, int $bisyarohId, int $usersId): array
    {
        $out = [
            'active_santri_count' => 0,
            'has_rekap_baris' => false,
            'rekap_periode_bulan' => null,
            'rekap_kalender' => null,
            'rekap_total_rupiah' => null,
            'share_per_santri_rupiah' => null,
            'share_note' => null,
        ];
        if (!self::schemaReady($db)) {
            return $out;
        }
        $stmt = $db->prepare('SELECT `id` FROM `pengurus` WHERE `id_user` = ? LIMIT 1');
        $stmt->execute([$usersId]);
        $pRow = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$pRow) {
            return $out;
        }
        $targetPengurusId = (int) $pRow['id'];
        if (!self::potongBulanSchemaReady($db)) {
            return $out;
        }
        $stmt = $db->prepare(
            'SELECT COUNT(DISTINCT ps.`id_santri`) FROM `santri___potong_uwaba_bulan` ps
             INNER JOIN `santri` s ON s.`id` = ps.`id_santri` AND s.`id_user` = ?
             WHERE ps.`tahun_ajaran` = ? AND ' . self::sqlUwabaIdBulanIn('ps.`id_bulan`')
        );
        $taRow = TahunAjaranActiveHelper::fetchActiveHijriyahRowForMasehiDate($db, date('Y-m') . '-15');
        $taActive = is_array($taRow) ? trim((string) ($taRow['tahun_ajaran'] ?? '')) : '';
        if ($taActive === '') {
            return $out;
        }
        $stmt->execute([$usersId, $taActive]);
        $activeCount = (int) $stmt->fetchColumn();
        $out['active_santri_count'] = $activeCount;

        $hasKal = self::rekapHasKalenderColumn($db);
        if ($hasKal) {
            $stmt = $db->prepare(
                'SELECT r.`periode_bulan`, r.`kalender`, r.`nilai_json`, r.`id_pengurus`
                 FROM `bisyaroh___rekap_baris` r
                 WHERE r.`bisyaroh_id` = ? AND r.`id_pengurus` = ? AND r.`kalender` = \'masehi\'
                 ORDER BY r.`periode_bulan` DESC, r.`id` DESC
                 LIMIT 1'
            );
            $stmt->execute([$bisyarohId, $targetPengurusId]);
        } else {
            $stmt = $db->prepare(
                'SELECT r.`periode_bulan`, r.`nilai_json`, r.`id_pengurus`
                 FROM `bisyaroh___rekap_baris` r
                 WHERE r.`bisyaroh_id` = ? AND r.`id_pengurus` = ?
                 ORDER BY r.`periode_bulan` DESC, r.`id` DESC
                 LIMIT 1'
            );
            $stmt->execute([$bisyarohId, $targetPengurusId]);
        }
        $rek = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$rek) {
            return $out;
        }
        $out['has_rekap_baris'] = true;
        $out['rekap_periode_bulan'] = (string) ($rek['periode_bulan'] ?? '');
        $out['rekap_kalender'] = $hasKal ? (string) ($rek['kalender'] ?? 'masehi') : 'masehi';
        $total = self::computeTotalNominal($db, $bisyarohId, (int) $rek['id_pengurus'], $rek['nilai_json'] ?? null);
        $out['rekap_total_rupiah'] = round($total, 2);
        $totalInt = (int) round(max(0.0, $total));
        if ($activeCount <= 0) {
            $out['share_note'] = 'Tidak ada santri dengan bulan potong dipilih — nominal dibagi saat minimal satu bulan UWABA dipilih di MyBeddian.';

            return $out;
        }
        $base = intdiv($totalInt, $activeCount);
        $rem = $totalInt - ($base * $activeCount);
        $out['share_per_santri_rupiah'] = $base;
        if ($rem > 0) {
            $out['share_note'] = 'Pembagian merata dari total rekap; sebagian santri mendapat tambahan Rp 1 (sisa pembulatan).';
        }

        return $out;
    }

    /**
     * Nominal potong UWABA terakhir per santri (satu entri per santri, log terbaru).
     *
     * @param list<int> $santriIds
     *
     * @return array<int, int>
     */
    public static function lastPotongNominalPerSantri(PDO $db, int $bisyarohId, array $santriIds): array
    {
        if ($santriIds === [] || !self::schemaReady($db)) {
            return [];
        }
        try {
            $stmt = $db->query(
                "SELECT 1 FROM information_schema.`TABLES` WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'bisyaroh___potong_uwaba_log' LIMIT 1"
            );
            if (!$stmt || !$stmt->fetchColumn()) {
                return [];
            }
        } catch (\Throwable $e) {
            return [];
        }
        $santriIds = array_values(array_unique(array_filter(array_map('intval', $santriIds), static fn (int $x) => $x > 0)));
        if ($santriIds === []) {
            return [];
        }
        $ph = implode(',', array_fill(0, count($santriIds), '?'));
        $sql = 'SELECT `id_santri`, `nominal`, `id` FROM `bisyaroh___potong_uwaba_log`
            WHERE `bisyaroh_id` = ? AND `id_santri` IN (' . $ph . ')
            ORDER BY `id` DESC';
        $stmt = $db->prepare($sql);
        $stmt->execute(array_merge([$bisyarohId], $santriIds));
        $map = [];
        while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $sid = (int) $r['id_santri'];
            if (!isset($map[$sid])) {
                $map[$sid] = (int) $r['nominal'];
            }
        }

        return $map;
    }

    /** Pengurus punya jabatan aktif di lembaga (sama filter daftar rekap). */
    private static function sqlPengurusBerjabatanDiLembaga(string $rekapAlias, string $pjAlias, string $jAlias): string
    {
        return 'EXISTS (
            SELECT 1 FROM `pengurus___jabatan` ' . $pjAlias . '
            INNER JOIN `jabatan` ' . $jAlias . ' ON ' . $jAlias . '.`id` = ' . $pjAlias . '.`jabatan_id`
            WHERE ' . $pjAlias . '.`pengurus_id` = ' . $rekapAlias . '.`id_pengurus`
              AND (' . $pjAlias . '.`status` = \'aktif\' OR ' . $pjAlias . '.`status` = \'active\'
                   OR ' . $pjAlias . '.`status` IS NULL OR TRIM(COALESCE(' . $pjAlias . '.`status`, \'\')) = \'\')
              AND (' . $jAlias . '.`status` = \'aktif\' OR ' . $jAlias . '.`status` IS NULL)
              AND (' . $pjAlias . '.`lembaga_id` = ? OR (' . $pjAlias . '.`lembaga_id` IS NULL AND ' . $jAlias . '.`lembaga_id` = ?))
        )';
    }

    /**
     * Apakah baris UWABA bulan ini belum lunas (boleh dipilih untuk potong berikutnya).
     */
    public static function isUwabaBulanBelumLunas(PDO $db, int $idSantri, string $tahunAjaran, int $idBulan): bool
    {
        if ($idSantri <= 0 || $tahunAjaran === '' || !self::isValidUwabaIdBulan($idBulan)) {
            return false;
        }
        $stmt = $db->prepare(
            'SELECT `wajib`, `nominal` FROM `uwaba` WHERE `id_santri` = ? AND `tahun_ajaran` = ? AND `id_bulan` = ? LIMIT 1'
        );
        $stmt->execute([$idSantri, $tahunAjaran, $idBulan]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!is_array($row)) {
            return false;
        }
        $wajib = isset($row['wajib']) && $row['wajib'] !== null && $row['wajib'] !== '' ? (int) $row['wajib'] : 0;
        if ($wajib <= 0) {
            return false;
        }
        $bayar = isset($row['nominal']) ? (int) $row['nominal'] : 0;

        return $bayar < $wajib;
    }

    /**
     * @param list<int> $santriIds
     *
     * @return array<int, array{tahun_ajaran: string, id_bulan: int}|null>
     */
    public static function fetchPotongBulanMapForSantriIds(PDO $db, array $santriIds, string $tahunAjaran): array
    {
        $out = [];
        foreach ($santriIds as $sid) {
            $out[(int) $sid] = null;
        }
        if ($santriIds === [] || $tahunAjaran === '' || !self::potongBulanSchemaReady($db)) {
            return $out;
        }
        $santriIds = array_values(array_unique(array_filter(array_map('intval', $santriIds), static fn (int $x) => $x > 0)));
        if ($santriIds === []) {
            return $out;
        }
        $ph = implode(',', array_fill(0, count($santriIds), '?'));
        $sql = 'SELECT `id_santri`, `id_bulan` FROM `santri___potong_uwaba_bulan`
            WHERE `tahun_ajaran` = ? AND `id_santri` IN (' . $ph . ')';
        $stmt = $db->prepare($sql);
        $stmt->execute(array_merge([$tahunAjaran], $santriIds));
        while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $sid = (int) ($r['id_santri'] ?? 0);
            $idB = (int) ($r['id_bulan'] ?? 0);
            if ($sid > 0 && self::isValidUwabaIdBulan($idB)) {
                $out[$sid] = ['tahun_ajaran' => $tahunAjaran, 'id_bulan' => $idB];
            }
        }

        return $out;
    }

    public static function potongBulanSchemaReady(PDO $db): bool
    {
        try {
            $stmt = $db->query(
                "SELECT 1 FROM information_schema.`TABLES` WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'santri___potong_uwaba_bulan' LIMIT 1"
            );

            return (bool) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function schemaReady(PDO $db): bool
    {
        try {
            $stmt = $db->query(
                "SELECT 1 FROM information_schema.`TABLES` WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'bisyaroh___potong_santri' LIMIT 1"
            );

            return (bool) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function rekapHasKalenderColumn(PDO $db): bool
    {
        try {
            $stmt = $db->query(
                "SELECT 1 FROM information_schema.`COLUMNS` WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'bisyaroh___rekap_baris' AND `COLUMN_NAME` = 'kalender' LIMIT 1"
            );

            return (bool) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function nilaiJsonToInputs(mixed $nilaiJson): array
    {
        return BisyarohRekapSnapshotHelper::extractInputs($nilaiJson);
    }

    /**
     * @param list<array<string, mixed>> $kolomDef
     */
    private static function computeTotalNominal(PDO $db, int $bisyarohId, int $idPengurus, mixed $nilaiJson): float
    {
        $sql = 'SELECT `id`, `bisyaroh_id`, `col_key`, `kind`, `label`, `keterangan`, `rumus`, `input_tipe`, `default_nilai`, `masuk_total`, `sort_order`, `aktif`
            FROM `bisyaroh___kolom` WHERE `bisyaroh_id` = ? AND `aktif` = 1 ORDER BY `sort_order` ASC, `id` ASC';
        $stmt = $db->prepare($sql);
        $stmt->execute([$bisyarohId]);
        $kolomDef = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if (!is_array($kolomDef)) {
            $kolomDef = [];
        }
        $inputs = self::nilaiJsonToInputs($nilaiJson);
        $masterLembaga = '';
        try {
            $stmtL = $db->prepare('SELECT `lembaga_id` FROM `pengurus` WHERE `id` = ? LIMIT 1');
            $stmtL->execute([$idPengurus]);
            $lr = $stmtL->fetch(\PDO::FETCH_ASSOC);
            $masterLembaga = is_array($lr) ? trim((string) ($lr['lembaga_id'] ?? '')) : '';
        } catch (\Throwable $e) {
            $masterLembaga = '';
        }
        $lembagaScope = $masterLembaga !== '' ? [$masterLembaga] : null;
        $fCtx = BisyarohPengurusFormulaHelper::loadFormulaContext($db, $idPengurus, null, $lembagaScope);
        try {
            return BisyarohRekapSnapshotHelper::resolveTotalNominal($kolomDef, $inputs, $fCtx, $nilaiJson);
        } catch (\Throwable $e) {
            return 0.0;
        }
    }

    private static function insertPaymentInduk(
        PDO $db,
        int $uwabaBayarId,
        int $idSantri,
        int $nominal,
        string $via,
        string $hijriyah,
        int $idAdmin,
        string $admin,
        string $masehiYmd
    ): int {
        $ket = 'Bisyaroh potong kewajiban · uwaba___bayar #' . $uwabaBayarId;
        $sql = 'INSERT INTO `payment` (
                `jenis_pembayaran`, `id_referensi`, `tabel_referensi`, `id_santri`, `id_jamaah`,
                `nominal`, `metode_pembayaran`, `via`, `bank`, `no_rekening`, `bukti_pembayaran`,
                `keterangan`, `hijriyah`, `masehi`, `id_admin`, `admin`, `status`
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        $stmt = $db->prepare($sql);
        $stmt->execute([
            'Uwaba',
            $uwabaBayarId,
            'uwaba___bayar',
            $idSantri,
            null,
            $nominal,
            $via,
            $via,
            null,
            null,
            null,
            $ket,
            $hijriyah,
            $masehiYmd,
            $idAdmin > 0 ? $idAdmin : null,
            $admin,
            'Success',
        ]);

        return (int) $db->lastInsertId();
    }
}
