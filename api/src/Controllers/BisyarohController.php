<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\BisyarohFormulaEvaluator;
use App\Helpers\BisyarohKolomComputation;
use App\Helpers\BisyarohPengurusFormulaHelper;
use App\Helpers\BisyarohPotongKewajibanApplier;
use App\Helpers\BisyarohRekapSnapshotHelper;
use App\Helpers\BisyarohTransferHelper;
use App\Helpers\RoleHelper;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * API modul Bisyaroh — kolom input/rumus (gaya Excel), rekap per pengurus.
 */
final class BisyarohController
{
    private PDO $db;

    /** @var bool|null Per request: apakah tabel rekap punya kolom `kalender`. */
    private ?bool $rekapHasKalenderColumnCache = null;

    /** @var bool|null Per request: apakah tabel status rekap per lembaga ada. */
    private ?bool $rekapStatusLembagaTableCache = null;

    /** @var bool|null Per request: apakah tabel urutan pengurus rekap per lembaga ada. */
    private ?bool $rekapPengurusUrutanTableCache = null;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function rekapBarisHasKalenderColumn(): bool
    {
        if ($this->rekapHasKalenderColumnCache !== null) {
            return $this->rekapHasKalenderColumnCache;
        }
        try {
            $stmt = $this->db->prepare(
                'SELECT 1 FROM information_schema.`COLUMNS`
                 WHERE `TABLE_SCHEMA` = DATABASE()
                   AND `TABLE_NAME` = ?
                   AND `COLUMN_NAME` = ?
                 LIMIT 1'
            );
            $stmt->execute(['bisyaroh___rekap_baris', 'kalender']);
            $this->rekapHasKalenderColumnCache = (bool) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            try {
                $stmt = $this->db->query("SHOW COLUMNS FROM `bisyaroh___rekap_baris` LIKE 'kalender'");
                $row = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : false;
                $this->rekapHasKalenderColumnCache = is_array($row);
            } catch (\Throwable $e2) {
                $this->rekapHasKalenderColumnCache = false;
            }
        }

        return $this->rekapHasKalenderColumnCache;
    }

    /** Paksa deteksi ulang (mis. setelah fallback SQL). */
    private function setRekapKalenderColumnDetected(bool $has): void
    {
        $this->rekapHasKalenderColumnCache = $has;
    }

    private function rekapStatusLembagaTableExists(): bool
    {
        if ($this->rekapStatusLembagaTableCache !== null) {
            return $this->rekapStatusLembagaTableCache;
        }
        try {
            $stmt = $this->db->prepare(
                'SELECT 1 FROM information_schema.`TABLES`
                 WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = ? LIMIT 1'
            );
            $stmt->execute(['bisyaroh___rekap_status_lembaga']);
            $this->rekapStatusLembagaTableCache = (bool) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            $this->rekapStatusLembagaTableCache = false;
        }

        return $this->rekapStatusLembagaTableCache;
    }

    private function rekapPengurusUrutanTableExists(): bool
    {
        if ($this->rekapPengurusUrutanTableCache !== null) {
            return $this->rekapPengurusUrutanTableCache;
        }
        try {
            $stmt = $this->db->prepare(
                'SELECT 1 FROM information_schema.`TABLES`
                 WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = ? LIMIT 1'
            );
            $stmt->execute(['bisyaroh___rekap_pengurus_urutan']);
            $this->rekapPengurusUrutanTableCache = (bool) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            $this->rekapPengurusUrutanTableCache = false;
        }

        return $this->rekapPengurusUrutanTableCache;
    }

    /**
     * @param list<array<string, mixed>> $pengurus
     * @return list<array<string, mixed>>
     */
    private function applyRekapPengurusSortOrder(array $pengurus, string $lembagaId): array
    {
        if ($pengurus === [] || trim($lembagaId) === '' || !$this->rekapPengurusUrutanTableExists()) {
            return $pengurus;
        }
        try {
            $stmt = $this->db->prepare(
                'SELECT `id_pengurus`, `sort_order` FROM `bisyaroh___rekap_pengurus_urutan`
                 WHERE `lembaga_id` = ? ORDER BY `sort_order` ASC, `id` ASC'
            );
            $stmt->execute([$lembagaId]);
            $orderMap = [];
            while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $pid = (int) ($r['id_pengurus'] ?? 0);
                if ($pid > 0) {
                    $orderMap[$pid] = (int) ($r['sort_order'] ?? 0);
                }
            }
        } catch (\Throwable $e) {
            return $pengurus;
        }
        if ($orderMap === []) {
            return $pengurus;
        }
        $byId = [];
        foreach ($pengurus as $p) {
            $byId[(int) ($p['id'] ?? 0)] = $p;
        }
        $sortedIds = array_keys($orderMap);
        usort($sortedIds, static function (int $a, int $b) use ($orderMap): int {
            $oa = $orderMap[$a] ?? PHP_INT_MAX;
            $ob = $orderMap[$b] ?? PHP_INT_MAX;
            if ($oa !== $ob) {
                return $oa <=> $ob;
            }

            return $a <=> $b;
        });
        $out = [];
        $seen = [];
        foreach ($sortedIds as $pid) {
            if (isset($byId[$pid])) {
                $out[] = $byId[$pid];
                $seen[$pid] = true;
            }
        }
        foreach ($pengurus as $p) {
            $pid = (int) ($p['id'] ?? 0);
            if ($pid > 0 && !isset($seen[$pid])) {
                $out[] = $p;
            }
        }

        return $out;
    }

    /**
     * @param list<int> $rekapBarisIds
     *
     * @return array<int, array{terpotong_total: int, keterangan: string, alokasi: list<array{id_santri: int, nama: string, nis: ?string, nominal: int}>}>
     */
    private function loadPotongUwabaPayloadByRekapBarisIds(array $rekapBarisIds): array
    {
        $rekapBarisIds = array_values(array_unique(array_filter(array_map('intval', $rekapBarisIds), static fn (int $x) => $x > 0)));
        if ($rekapBarisIds === [] || !BisyarohPotongKewajibanApplier::featureEnabled($this->db)) {
            return [];
        }
        $ph = implode(',', array_fill(0, count($rekapBarisIds), '?'));
        try {
            $sql = 'SELECT l.`rekap_baris_id`, l.`id_santri`, l.`nominal`, s.`nama` AS `santri_nama`, s.`nis` AS `santri_nis`,
                           TRIM(COALESCE(rb.`catatan`, \'\')) AS `rekap_catatan`
                    FROM `bisyaroh___potong_uwaba_log` l
                    INNER JOIN `santri` s ON s.`id` = l.`id_santri`
                    LEFT JOIN `bisyaroh___rekap_baris` rb ON rb.`id` = l.`rekap_baris_id`
                    WHERE l.`rekap_baris_id` IN (' . $ph . ')
                    ORDER BY l.`rekap_baris_id` ASC, l.`id_santri` ASC';
            $stmt = $this->db->prepare($sql);
            $stmt->execute($rekapBarisIds);
        } catch (\Throwable $e) {
            return [];
        }
        $byRid = [];
        while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
            if (!is_array($r)) {
                continue;
            }
            $rid = (int) ($r['rekap_baris_id'] ?? 0);
            if ($rid <= 0) {
                continue;
            }
            if (!isset($byRid[$rid])) {
                $catRekap = trim((string) ($r['rekap_catatan'] ?? ''));
                $ket = 'Total rekap dibagi rata ke santri dengan toggle potong aktif (MyBeddien); dikreditkan ke UWABA sebagai «Potong Bisyaroh».';
                if ($catRekap !== '') {
                    $ket .= ' Catatan rekap: ' . $catRekap;
                }
                $byRid[$rid] = [
                    'terpotong_total' => 0,
                    'keterangan' => $ket,
                    'alokasi' => [],
                ];
            }
            $nom = (int) ($r['nominal'] ?? 0);
            $byRid[$rid]['terpotong_total'] += $nom;
            $byRid[$rid]['alokasi'][] = [
                'id_santri' => (int) ($r['id_santri'] ?? 0),
                'nama' => (string) ($r['santri_nama'] ?? ''),
                'nis' => isset($r['santri_nis']) && trim((string) $r['santri_nis']) !== '' ? (string) $r['santri_nis'] : null,
                'nominal' => $nom,
            ];
        }

        return $byRid;
    }

    /**
     * @param list<int> $rekapBarisIds
     *
     * @return array<int, int>
     */
    private function loadPotongUwabaTotalsByRekapBarisIds(array $rekapBarisIds): array
    {
        $rekapBarisIds = array_values(array_unique(array_filter(array_map('intval', $rekapBarisIds), static fn (int $x) => $x > 0)));
        if ($rekapBarisIds === [] || !BisyarohPotongKewajibanApplier::featureEnabled($this->db)) {
            return [];
        }
        $ph = implode(',', array_fill(0, count($rekapBarisIds), '?'));
        try {
            $sql = 'SELECT `rekap_baris_id`, SUM(`nominal`) AS `t` FROM `bisyaroh___potong_uwaba_log`
                    WHERE `rekap_baris_id` IN (' . $ph . ') GROUP BY `rekap_baris_id`';
            $stmt = $this->db->prepare($sql);
            $stmt->execute($rekapBarisIds);
        } catch (\Throwable $e) {
            return [];
        }
        $map = [];
        while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
            if (!is_array($r)) {
                continue;
            }
            $rid = (int) ($r['rekap_baris_id'] ?? 0);
            if ($rid > 0) {
                $map[$rid] = (int) round((float) ($r['t'] ?? 0));
            }
        }

        return $map;
    }

    /**
     * @param list<array<string, mixed>> $outRows
     *
     * @return list<array<string, mixed>>
     */
    private function attachPotongUwabaToRekapRows(array $outRows): array
    {
        $ids = [];
        foreach ($outRows as $row) {
            $rid = isset($row['id']) ? (int) $row['id'] : 0;
            if ($rid > 0) {
                $ids[] = $rid;
            }
        }
        $map = $this->loadPotongUwabaPayloadByRekapBarisIds($ids);
        foreach ($outRows as &$row) {
            $rid = isset($row['id']) ? (int) $row['id'] : 0;
            $row['potong_uwaba'] = $rid > 0 && isset($map[$rid]) ? $map[$rid] : null;
        }
        unset($row);

        return $outRows;
    }

    /** Lembaga induk pengurus (kolom pengurus.lembaga_id) untuk kunci status & histori. */
    private function fetchPengurusMasterLembagaId(int $pengurusId): string
    {
        if ($pengurusId <= 0) {
            return '';
        }
        try {
            $stmt = $this->db->prepare('SELECT `lembaga_id` FROM `pengurus` WHERE `id` = ? LIMIT 1');
            $stmt->execute([$pengurusId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            return '';
        }

        return is_array($row) ? trim((string) ($row['lembaga_id'] ?? '')) : '';
    }

    /** @param array<string, mixed> $user */
    private function userMayRilisRekap(array $user): bool
    {
        if ($this->isSuper($user)) {
            return true;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.bisyaroh.rekap.rilis');
    }

    /**
     * SQL: histori hanya baris yang set+periode+kalender sudah rilis di lembaga tempat pengurus berjabatan
     * (bukan hanya lembaga induk pengurus.lembaga_id — selaras rilis di tab Rekap).
     */
    private function sqlHistoriRilisExistsCondition(string $rekapAlias = 'r'): string
    {
        if (!$this->rekapStatusLembagaTableExists()) {
            return '';
        }
        $r = $rekapAlias;
        $pjAktif = $this->sqlPengurusJabatanPenugasanAktifCondition('pj_hr');
        $jAktif = $this->sqlJabatanMasterAktifCondition('j_hr');
        $effectiveLembaga = $this->sqlEffectiveJabatanLembagaId('pj_hr', 'j_hr');
        $kalMatch = $this->rekapBarisHasKalenderColumn()
            ? ' AND s_hr.`kalender` = ' . $r . '.`kalender`'
            : " AND s_hr.`kalender` = 'masehi'";

        $legacyRilis = 'EXISTS (
            SELECT 1 FROM `bisyaroh___rekap_status_lembaga` s_hr
            INNER JOIN `pengurus___jabatan` pj_hr ON pj_hr.`pengurus_id` = ' . $r . '.`id_pengurus`
            INNER JOIN `jabatan` j_hr ON j_hr.`id` = pj_hr.`jabatan_id`
            WHERE s_hr.`bisyaroh_id` = ' . $r . '.`bisyaroh_id`
              AND s_hr.`periode_bulan` = ' . $r . '.`periode_bulan`
              ' . $kalMatch . "
              AND s_hr.`status` = 'rilis'
              AND {$pjAktif}
              AND {$jAktif}
              AND {$effectiveLembaga} = s_hr.`lembaga_id`
        )";

        if (BisyarohTransferHelper::rekapHasTransferStatus($this->db)) {
            return ' AND (' . $legacyRilis . " OR {$r}.`transfer_status` = 'berhasil')";
        }

        return ' AND ' . $legacyRilis;
    }

    /** @deprecated Gunakan sqlHistoriRilisExistsCondition — tetap untuk kompatibilitas internal lama. */
    private function sqlHistoriRilisJoin(): string
    {
        return '';
    }

    private function assertRekapNotLockedForSave(int $bisyarohId, string $lembagaId, string $periode, string $kalender): void
    {
        if (!$this->rekapStatusLembagaTableExists() || trim($lembagaId) === '') {
            return;
        }
        $stmt = $this->db->prepare(
            'SELECT `status` FROM `bisyaroh___rekap_status_lembaga`
             WHERE `bisyaroh_id` = ? AND `lembaga_id` = ? AND `periode_bulan` = ? AND `kalender` = ?
             LIMIT 1'
        );
        $stmt->execute([$bisyarohId, $lembagaId, $periode, $kalender]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (is_array($row) && ($row['status'] ?? '') === 'rilis') {
            throw new \InvalidArgumentException(
                'Rekap untuk lembaga ini sudah dirilis dan tidak dapat diubah. Hubungi admin bila perlu koreksi.'
            );
        }
    }

    private function touchRekapStatusAfterDataSave(
        int $bisyarohId,
        string $lembagaId,
        string $periode,
        string $kalender,
        ?int $actorPengurusId
    ): void {
        if (!$this->rekapStatusLembagaTableExists() || trim($lembagaId) === '') {
            return;
        }
        $sql = <<<'SQL'
INSERT INTO `bisyaroh___rekap_status_lembaga`
  (`bisyaroh_id`, `lembaga_id`, `periode_bulan`, `kalender`, `status`, `updated_by_pengurus_id`)
VALUES (?, ?, ?, ?, 'pengajuan', ?)
ON DUPLICATE KEY UPDATE
  `status` = IF(`status` = 'ditinjau', 'pengajuan', `status`),
  `updated_by_pengurus_id` = VALUES(`updated_by_pengurus_id`),
  `updated_at` = CURRENT_TIMESTAMP
SQL;
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$bisyarohId, $lembagaId, $periode, $kalender, $actorPengurusId]);
    }

    /** @return array<string, mixed> */
    private function userFromRequest(Request $request): array
    {
        $u = $request->getAttribute('user');

        return is_array($u) ? $u : [];
    }

    private function json(Response $response, array $data, int $code = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response->withStatus($code)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /** @param array<string, mixed> $user */
    private function isSuper(array $user): bool
    {
        return !empty($user['is_real_super_admin']);
    }

    /**
     * @param array<string, mixed> $user
     * @return array{all: bool, ids: list<string>}
     */
    private function lembagaListScopeFromUser(array $user): array
    {
        if ($user === []) {
            return ['all' => true, 'ids' => []];
        }
        if (RoleHelper::tokenHasAnyRoleKey($user, ['super_admin', 'admin_uwaba'])) {
            return ['all' => true, 'ids' => []];
        }
        if (RoleHelper::tokenHasAnyRoleKey($user, ['admin_lembaga'])) {
            if (!empty($user['lembaga_scope_all'])) {
                return ['all' => true, 'ids' => []];
            }

            return ['all' => false, 'ids' => RoleHelper::tokenPengeluaranLembagaIdsFromUser($user)];
        }

        return ['all' => true, 'ids' => []];
    }

    /** @param array<string, mixed> $user */
    private function userMayAccessLembagaId(array $user, string $lembagaId): bool
    {
        $scope = $this->lembagaListScopeFromUser($user);
        if ($scope['all']) {
            return true;
        }
        $id = trim($lembagaId);

        return $id !== '' && in_array($id, $scope['ids'], true);
    }

    /**
     * Cakupan lembaga untuk tab Rekap: super / admin_uwaba / aksi lembaga_semua = semua;
     * selain itu hanya lembaga dari peran yang punya `action.bisyaroh.tab.rekap`.
     *
     * @param array<string, mixed> $user
     * @return array{all: bool, ids: list<string>}
     */
    private function bisyarohRekapLembagaScope(array $user): array
    {
        if ($this->isSuper($user) || RoleHelper::tokenHasAnyRoleKey($user, ['admin_uwaba'])) {
            return ['all' => true, 'ids' => []];
        }
        if (RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.bisyaroh.rekap.lembaga_semua')) {
            return ['all' => true, 'ids' => []];
        }
        $pid = RoleHelper::getPengurusIdFromPayload($user);
        if ($pid !== null && $pid > 0) {
            $scope = RoleHelper::computeBisyarohRekapLembagaScopeForPengurus($this->db, $pid);
            if ($scope['lembaga_scope_all']) {
                return ['all' => true, 'ids' => []];
            }

            return ['all' => false, 'ids' => array_values(array_unique($scope['lembaga_ids']))];
        }
        $ids = RoleHelper::tokenPengeluaranLembagaIdsFromUser($user);

        return ['all' => false, 'ids' => $ids];
    }

    /** @param array<string, mixed> $user */
    private function userMayAccessLembagaForRekap(array $user, string $lembagaId): bool
    {
        $scope = $this->bisyarohRekapLembagaScope($user);
        if ($scope['all']) {
            return true;
        }
        $id = trim($lembagaId);

        return $id !== '' && in_array($id, $scope['ids'], true);
    }

    /**
     * Cakupan lembaga untuk filter tab Histori (aksi semua lembaga mengikuti pola rekap).
     *
     * @param array<string, mixed> $user
     * @return array{all: bool, ids: list<string>}
     */
    private function bisyarohHistoriLembagaScope(array $user): array
    {
        if ($this->isSuper($user) || RoleHelper::tokenHasAnyRoleKey($user, ['admin_uwaba'])) {
            return ['all' => true, 'ids' => []];
        }
        if (RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.bisyaroh.histori.semua_lembaga')) {
            return ['all' => true, 'ids' => []];
        }

        return $this->bisyarohRekapLembagaScope($user);
    }

    /** @param array<string, mixed> $user */
    private function userMayAccessLembagaForHistori(array $user, string $lembagaId): bool
    {
        $scope = $this->bisyarohHistoriLembagaScope($user);
        if ($scope['all']) {
            return true;
        }
        $id = trim($lembagaId);

        return $id !== '' && in_array($id, $scope['ids'], true);
    }

    /**
     * Ruang lingkup baris histori per pengurus: sendiri / lembaga (peran) / semua lembaga.
     *
     * @param array<string, mixed> $user
     * @return 'self'|'lembaga'|'semua'
     */
    private function historiPengurusScopeMode(array $user): string
    {
        if ($this->isSuper($user)) {
            return 'semua';
        }
        if (RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.bisyaroh.histori.semua_lembaga')) {
            return 'semua';
        }
        if (RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.bisyaroh.histori.lembaga_peran')) {
            return 'lembaga';
        }

        return 'self';
    }

    /**
     * Akses set Bisyaroh untuk daftar histori (cakupan lembaga mengikuti tab Histori).
     *
     * @param array<string, mixed> $user
     * @return array{bisyaroh_id:int, lembaga_id:string, lembaga_ids?: list<string>, nama?: ?string, aktif?: bool}|null
     */
    private function resolveBisyarohRowForHistori(int $bisyarohId, array $user): ?array
    {
        $stmt = $this->db->prepare('SELECT `id`, `lembaga_id`, `nama`, `aktif` FROM `bisyaroh` WHERE `id` = ? LIMIT 1');
        $stmt->execute([$bisyarohId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            return null;
        }
        $fallback = trim((string) ($row['lembaga_id'] ?? ''));
        $lembagaIds = $this->getLembagaIdsForBisyaroh($bisyarohId, $fallback);
        $histScope = $this->bisyarohHistoriLembagaScope($user);
        $allowed = false;
        if ($lembagaIds === []) {
            $allowed = $this->userMayManageUnlinkedBisyaroh($user) && $histScope['all'];
        } else {
            foreach ($lembagaIds as $lid) {
                if ($this->userMayAccessLembagaForHistori($user, $lid)) {
                    $allowed = true;
                    break;
                }
            }
        }
        if (!$allowed) {
            return null;
        }

        return [
            'bisyaroh_id' => (int) $row['id'],
            'lembaga_id' => $lembagaIds[0] ?? $fallback,
            'lembaga_ids' => $lembagaIds,
            'nama' => isset($row['nama']) ? (string) $row['nama'] : null,
            'aktif' => !empty($row['aktif']),
        ];
    }

    /**
     * @param array<string, mixed> $user
     * @return list<int>
     */
    private function listAllowedBisyarohIdsForHistoriUser(array $user): array
    {
        try {
            $stmt = $this->db->query('SELECT `id` FROM `bisyaroh`');
            $raw = $stmt ? $stmt->fetchAll(PDO::FETCH_COLUMN) : [];
        } catch (\Throwable $e) {
            return [];
        }
        if (!is_array($raw)) {
            return [];
        }
        $out = [];
        foreach ($raw as $rid) {
            $id = (int) $rid;
            if ($id <= 0) {
                continue;
            }
            if ($this->resolveBisyarohRowForHistori($id, $user) !== null) {
                $out[] = $id;
            }
        }

        return $out;
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $rekapRow baris dari bisyaroh___rekap_baris + join
     */
    private function userMayViewHistoriRekapRow(array $user, array $rekapRow): bool
    {
        $bid = (int) ($rekapRow['bisyaroh_id'] ?? 0);
        if ($bid <= 0) {
            return false;
        }
        if ($this->resolveBisyarohRowForHistori($bid, $user) === null) {
            return false;
        }
        if ($this->historiPengurusScopeMode($user) !== 'self') {
            return $this->historiRekapBarisIsReleased($rekapRow);
        }
        $pid = RoleHelper::getPengurusIdFromPayload($user);
        if ($pid === null || $pid <= 0) {
            return false;
        }

        return (int) ($rekapRow['id_pengurus'] ?? 0) === $pid && $this->historiRekapBarisIsReleased($rekapRow);
    }

    /**
     * Tab Histori hanya menampilkan baris yang lembaga master pengurusnya berstatus rilis (jika tabel status ada).
     *
     * @param array<string, mixed> $rekapRow minimal: bisyaroh_id, id_pengurus, periode_bulan; kalender opsional
     */
    private function historiRekapBarisIsReleased(array $rekapRow): bool
    {
        if (!$this->rekapStatusLembagaTableExists()) {
            return true;
        }
        $bid = (int) ($rekapRow['bisyaroh_id'] ?? 0);
        $pid = (int) ($rekapRow['id_pengurus'] ?? 0);
        $periode = trim((string) ($rekapRow['periode_bulan'] ?? ''));
        if ($bid <= 0 || $pid <= 0 || $periode === '' || !preg_match('/^\d{4}-\d{2}$/', $periode)) {
            return false;
        }
        $kal = 'masehi';
        if ($this->rekapBarisHasKalenderColumn() && isset($rekapRow['kalender'])) {
            $kal = $this->normalizeRekapKalender((string) $rekapRow['kalender']);
        }
        $pjAktif = $this->sqlPengurusJabatanPenugasanAktifCondition('pj_hr');
        $jAktif = $this->sqlJabatanMasterAktifCondition('j_hr');
        try {
            $stmt = $this->db->prepare(
                'SELECT 1 FROM `bisyaroh___rekap_status_lembaga` s_hr
                 INNER JOIN `pengurus___jabatan` pj_hr ON pj_hr.`pengurus_id` = ?
                 INNER JOIN `jabatan` j_hr ON j_hr.`id` = pj_hr.`jabatan_id`
                 WHERE s_hr.`bisyaroh_id` = ? AND s_hr.`periode_bulan` = ? AND s_hr.`kalender` = ?
                   AND s_hr.`status` = \'rilis\'
                   AND ' . $pjAktif . '
                   AND ' . $jAktif . '
                   AND ' . $this->sqlEffectiveJabatanLembagaId('pj_hr', 'j_hr') . ' = s_hr.`lembaga_id`
                 LIMIT 1'
            );
            $stmt->execute([$pid, $bid, $periode, $kal]);
        } catch (\Throwable $e) {
            return false;
        }

        return (bool) $stmt->fetchColumn();
    }

    /**
     * @return array<string, mixed>
     */
    private function nilaiJsonToInputs(mixed $nilaiJson): array
    {
        return BisyarohRekapSnapshotHelper::extractInputs($nilaiJson);
    }

    /**
     * Tambah rumus_terurai (angka menggantikan @[kunci]) untuk sel rumus.
     *
     * @param array<string, mixed> $calc hasil computeRow
     * @param array<string, float> $env dari $calc['env']
     * @param array<string, string>|array{pengurus?: array<string, string>, jabatan?: array<string, string>, pj?: array<string, string>} $formulaContext
     */
    private function enrichHistoriCellsRumusTerurai(array $calc, array $formulaContext): array
    {
        $cells = $calc['cells'] ?? [];
        if (!is_array($cells)) {
            return [];
        }
        $env = $calc['env'] ?? [];
        if (!is_array($env)) {
            $env = [];
        }

        return BisyarohRekapSnapshotHelper::enrichCellsRumusTerurai($cells, $env, $formulaContext);
    }

    /**
     * Set tanpa lembaga (belum dihubungkan) — hanya pengguna dengan cakupan lembaga penuh / super.
     *
     * @param array<string, mixed> $user
     */
    private function userMayManageUnlinkedBisyaroh(array $user): bool
    {
        if ($this->isSuper($user)) {
            return true;
        }
        $scope = $this->lembagaListScopeFromUser($user);

        return $scope['all'];
    }

    /**
     * @param array<string, mixed> $user
     * @return list<array<string, mixed>>
     */
    private function listBisyarohAccessibleToUser(array $user): array
    {
        $scope = $this->lembagaListScopeFromUser($user);
        try {
            if ($scope['all']) {
                $stmt = $this->db->query(
                    'SELECT `id`, `lembaga_id`, `nama`, `aktif`, `created_at`, `updated_at` FROM `bisyaroh` ORDER BY `id` ASC'
                );
                $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
            } else {
                $ids = $scope['ids'];
                if ($ids === []) {
                    return [];
                }
                $ph = implode(',', array_fill(0, count($ids), '?'));
                $sql = 'SELECT DISTINCT b.`id`, b.`lembaga_id`, b.`nama`, b.`aktif`, b.`created_at`, b.`updated_at`
                    FROM `bisyaroh` b
                    WHERE EXISTS (
                        SELECT 1 FROM `bisyaroh___lembaga` bl
                        WHERE bl.`bisyaroh_id` = b.`id` AND bl.`lembaga_id` IN (' . $ph . ')
                    ) OR TRIM(COALESCE(b.`lembaga_id`, \'\')) IN (' . $ph . ')
                    ORDER BY b.`id` ASC';
                $stmt = $this->db->prepare($sql);
                $stmt->execute(array_merge($ids, $ids));
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            }
        } catch (\Throwable $e) {
            return [];
        }

        return is_array($rows) ? $rows : [];
    }

    /** @param array<string, mixed> $user */
    private function apiHasBisyarohTabGranular(array $user): bool
    {
        return RoleHelper::tokenUserHasAnyEbeddienFiturCodePrefix($this->db, $user, 'action.bisyaroh.tab.');
    }

    /** @param array<string, mixed> $user */
    private function hasMenuBisyaroh(array $user): bool
    {
        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'menu.bisyaroh');
    }

    /** @param array<string, mixed> $user */
    private function hasHalamanBisyaroh(array $user): bool
    {
        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.bisyaroh.halaman');
    }

    /** @param array<string, mixed> $user */
    private function canViewTabAturan(array $user): bool
    {
        if ($this->isSuper($user)) {
            return true;
        }
        if (!$this->apiHasBisyarohTabGranular($user)) {
            return $this->hasMenuBisyaroh($user) || $this->hasHalamanBisyaroh($user);
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.bisyaroh.tab.aturan')
            || $this->hasHalamanBisyaroh($user);
    }

    /** @param array<string, mixed> $user */
    private function canViewTabRekap(array $user): bool
    {
        if ($this->isSuper($user)) {
            return true;
        }
        if (!$this->apiHasBisyarohTabGranular($user)) {
            return $this->hasMenuBisyaroh($user) || $this->hasHalamanBisyaroh($user);
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.bisyaroh.tab.rekap')
            || $this->hasHalamanBisyaroh($user);
    }

    /** @param array<string, mixed> $user */
    private function canViewTabHistori(array $user): bool
    {
        if ($this->isSuper($user)) {
            return true;
        }
        if (!$this->apiHasBisyarohTabGranular($user)) {
            return $this->hasMenuBisyaroh($user) || $this->hasHalamanBisyaroh($user);
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.bisyaroh.tab.histori')
            || $this->hasHalamanBisyaroh($user);
    }

    /** @param array<string, mixed> $user */
    private function apiHasBisyarohAturanActionGranular(array $user): bool
    {
        return RoleHelper::tokenUserHasAnyEbeddienFiturCodePrefix($this->db, $user, 'action.bisyaroh.aturan.');
    }

    /** Kolom & blok aturan (bisyaroh___aturan) — action.bisyaroh.aturan.kolom */
    private function canEditAturanKolom(array $user): bool
    {
        if ($this->isSuper($user)) {
            return true;
        }
        if (!$this->apiHasBisyarohAturanActionGranular($user)) {
            return $this->canViewTabAturan($user);
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.bisyaroh.aturan.kolom')
            || $this->hasHalamanBisyaroh($user);
    }

    /** @param array<string, mixed> $user */
    private function canEditTabRekap(array $user): bool
    {
        return $this->canViewTabRekap($user);
    }

    /**
     * Konteks akses satu set Bisyaroh (tanpa Request).
     *
     * @param array<string, mixed> $user
     * @return array{bisyaroh_id:int, lembaga_id:string, lembaga_ids?: list<string>, nama?: ?string, aktif?: bool}|null
     */
    private function resolveBisyarohRowContext(int $bisyarohId, array $user, bool $forRekap = false): ?array
    {
        $stmt = $this->db->prepare('SELECT `id`, `lembaga_id`, `nama`, `aktif` FROM `bisyaroh` WHERE `id` = ? LIMIT 1');
        $stmt->execute([$bisyarohId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            return null;
        }
        $fallback = trim((string) ($row['lembaga_id'] ?? ''));
        $lembagaIds = $this->getLembagaIdsForBisyaroh($bisyarohId, $fallback);
        $allowed = false;
        if ($lembagaIds === []) {
            $allowed = $forRekap
                ? ($this->userMayManageUnlinkedBisyaroh($user) && $this->bisyarohRekapLembagaScope($user)['all'])
                : $this->userMayManageUnlinkedBisyaroh($user);
        } else {
            foreach ($lembagaIds as $lid) {
                if ($forRekap) {
                    if ($this->userMayAccessLembagaForRekap($user, $lid)) {
                        $allowed = true;
                        break;
                    }
                } elseif ($this->userMayAccessLembagaId($user, $lid)) {
                    $allowed = true;
                    break;
                }
            }
        }
        if (!$allowed) {
            return null;
        }

        return [
            'bisyaroh_id' => (int) $row['id'],
            'lembaga_id' => $lembagaIds[0] ?? $fallback,
            'lembaga_ids' => $lembagaIds,
            'nama' => isset($row['nama']) ? (string) $row['nama'] : null,
            'aktif' => !empty($row['aktif']),
        ];
    }

    /**
     * @param array<string, mixed> $user
     * @return array{bisyaroh_id:int, lembaga_id:string, lembaga_ids?: list<string>, nama?: ?string, aktif?: bool}|null
     */
    private function loadBisyarohRow(Request $request, Response $response, int $bisyarohId, array $user, bool $forRekap = false): ?array
    {
        return $this->resolveBisyarohRowContext($bisyarohId, $user, $forRekap);
    }

    /**
     * @param array<string, mixed> $user
     * @return list<int>
     */
    private function listAllowedBisyarohIdsForRekapUser(array $user): array
    {
        try {
            $stmt = $this->db->query('SELECT `id` FROM `bisyaroh`');
            $raw = $stmt ? $stmt->fetchAll(PDO::FETCH_COLUMN) : [];
        } catch (\Throwable $e) {
            return [];
        }
        if (!is_array($raw)) {
            return [];
        }
        $out = [];
        foreach ($raw as $rid) {
            $id = (int) $rid;
            if ($id <= 0) {
                continue;
            }
            if ($this->resolveBisyarohRowContext($id, $user, true) !== null) {
                $out[] = $id;
            }
        }

        return $out;
    }

    /**
     * @return list<string>
     */
    private function getLembagaIdsForBisyaroh(int $bisyarohId, string $fallbackSingle): array
    {
        try {
            $stmt = $this->db->prepare('SELECT `lembaga_id` FROM `bisyaroh___lembaga` WHERE `bisyaroh_id` = ? ORDER BY `lembaga_id` ASC');
            $stmt->execute([$bisyarohId]);
            $ids = [];
            while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $lid = trim((string) ($r['lembaga_id'] ?? ''));
                if ($lid !== '') {
                    $ids[] = $lid;
                }
            }
            if ($ids !== []) {
                return array_values(array_unique($ids));
            }
        } catch (\Throwable $e) {
            // tabel belum ada (pra-migrasi)
        }
        $fb = trim($fallbackSingle);

        return $fb !== '' ? [$fb] : [];
    }

    /** Status master pengurus dianggap aktif (legacy: NULL/kosong = aktif). */
    private function sqlPengurusMasterAktifCondition(string $alias = 'p'): string
    {
        return '(' . $alias . '.`status` IS NULL OR TRIM(COALESCE(' . $alias . '.`status`, \'\')) = \'\''
            . ' OR LOWER(TRIM(' . $alias . '.`status`)) IN (\'aktif\', \'active\'))';
    }

    /** Penugasan pengurus___jabatan aktif (legacy: NULL/kosong = aktif). */
    private function sqlPengurusJabatanPenugasanAktifCondition(string $alias = 'pj'): string
    {
        return '(' . $alias . '.`status` = \'aktif\' OR ' . $alias . '.`status` = \'active\''
            . ' OR ' . $alias . '.`status` IS NULL OR TRIM(COALESCE(' . $alias . '.`status`, \'\')) = \'\')';
    }

    /** Master jabatan aktif (legacy: NULL = aktif). */
    private function sqlJabatanMasterAktifCondition(string $alias = 'j'): string
    {
        return '(' . $alias . '.`status` = \'aktif\' OR ' . $alias . '.`status` IS NULL)';
    }

    private function sqlEffectiveJabatanLembagaId(string $pjAlias = 'pj', string $jAlias = 'j'): string
    {
        return 'COALESCE(NULLIF(TRIM(' . $pjAlias . '.`lembaga_id`), \'\'), ' . $jAlias . '.`lembaga_id`)';
    }

    /**
     * @param list<string> $lembagaIds
     * @return list<array<string, mixed>>
     */
    private function loadPengurusForLembagaIds(array $lembagaIds): array
    {
        $lembagaIds = array_values(array_unique(array_filter(array_map(static fn (string $x): string => trim($x), $lembagaIds), static fn (string $x): bool => $x !== '')));
        if ($lembagaIds === []) {
            return [];
        }
        if (count($lembagaIds) === 1) {
            return $this->loadPengurusForLembaga($lembagaIds[0]);
        }
        $ph = implode(',', array_fill(0, count($lembagaIds), '?'));
        $pjAktif = $this->sqlPengurusJabatanPenugasanAktifCondition('pj');
        $jAktif = $this->sqlJabatanMasterAktifCondition('j');
        $sql = 'SELECT DISTINCT p.`id`, p.`nip`, p.`nama`, p.`rekening_jatim`
            FROM `pengurus` p
            WHERE ' . $this->sqlPengurusMasterAktifCondition('p') . '
            AND EXISTS (
                SELECT 1 FROM `pengurus___jabatan` pj
                INNER JOIN `jabatan` j ON j.`id` = pj.`jabatan_id`
                WHERE pj.`pengurus_id` = p.`id`
                AND ' . $pjAktif . '
                AND ' . $jAktif . '
                AND ' . $this->sqlEffectiveJabatanLembagaId('pj', 'j') . ' IN (' . $ph . ')
            )
            ORDER BY p.`nama` ASC';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($lembagaIds);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return is_array($rows) ? $rows : [];
    }

    /**
     * Sinkronkan baris junction dengan daftar lembaga (setelah validasi akses).
     *
     * @param list<string> $lembagaIds
     */
    private function syncBisyarohLembagaRows(int $bisyarohId, array $lembagaIds): void
    {
        $this->db->prepare('DELETE FROM `bisyaroh___lembaga` WHERE `bisyaroh_id` = ?')->execute([$bisyarohId]);
        $ins = $this->db->prepare('INSERT INTO `bisyaroh___lembaga` (`bisyaroh_id`, `lembaga_id`) VALUES (?, ?)');
        foreach ($lembagaIds as $lid) {
            $ins->execute([$bisyarohId, $lid]);
        }
    }

    /**
     * Pasangkan field `lembaga_ids` ke tiap baris set Bisyaroh.
     *
     * @param list<array<string, mixed>> $rows
     * @return list<array<string, mixed>>
     */
    private function attachLembagaIdsToBisyarohRows(array $rows): array
    {
        if ($rows === []) {
            return [];
        }
        $ids = [];
        foreach ($rows as $r) {
            $ids[] = (int) ($r['id'] ?? 0);
        }
        $ids = array_values(array_filter($ids, static fn (int $x): bool => $x > 0));
        if ($ids === []) {
            return $rows;
        }
        $ph = implode(',', array_fill(0, count($ids), '?'));
        try {
            $stmt = $this->db->prepare(
                'SELECT `bisyaroh_id`, `lembaga_id` FROM `bisyaroh___lembaga` WHERE `bisyaroh_id` IN (' . $ph . ') ORDER BY `lembaga_id` ASC'
            );
            $stmt->execute($ids);
            $map = [];
            while ($x = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $bid = (int) ($x['bisyaroh_id'] ?? 0);
                $lid = trim((string) ($x['lembaga_id'] ?? ''));
                if ($bid <= 0 || $lid === '') {
                    continue;
                }
                if (!isset($map[$bid])) {
                    $map[$bid] = [];
                }
                $map[$bid][] = $lid;
            }
            foreach ($rows as &$r) {
                $bid = (int) ($r['id'] ?? 0);
                $fb = trim((string) ($r['lembaga_id'] ?? ''));
                $r['lembaga_ids'] = $map[$bid] ?? ($fb !== '' ? [$fb] : []);
                unset($r);
            }
        } catch (\Throwable $e) {
            foreach ($rows as &$r) {
                $fb = trim((string) ($r['lembaga_id'] ?? ''));
                $r['lembaga_ids'] = $fb !== '' ? [$fb] : [];
                unset($r);
            }
        }

        return $rows;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function loadKolomRowsSorted(int $bisyarohId, bool $onlyAktif): array
    {
        $sql = 'SELECT `id`, `bisyaroh_id`, `col_key`, `kind`, `label`, `keterangan`, `rumus`, `input_tipe`, `default_nilai`, `masuk_total`, `sort_order`, `aktif`, `created_at`, `updated_at`
            FROM `bisyaroh___kolom` WHERE `bisyaroh_id` = ?';
        if ($onlyAktif) {
            $sql .= ' AND `aktif` = 1';
        }
        $sql .= ' ORDER BY `sort_order` ASC, `id` ASC';
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$bisyarohId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return is_array($rows) ? $rows : [];
    }

    /** @return array<string, mixed>|null */
    private function fetchKolomRowById(int $bisyarohId, int $kolomId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT `id`, `bisyaroh_id`, `col_key`, `kind`, `label`, `keterangan`, `rumus`, `input_tipe`, `default_nilai`, `masuk_total`, `sort_order`, `aktif`, `created_at`, `updated_at`
             FROM `bisyaroh___kolom` WHERE `id` = ? AND `bisyaroh_id` = ? LIMIT 1'
        );
        $stmt->execute([$kolomId, $bisyarohId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row === false ? null : $row;
    }

    /**
     * Rumus hanya boleh merujuk kolom yang sudah didefinisikan di atasnya (urutan sort).
     *
     * @param list<array<string, mixed>> $rows
     */
    private function assertFormulaRefsOnlyPriorColumns(array $rows): void
    {
        $priorKeys = [];
        foreach ($rows as $row) {
            if (empty($row['aktif'])) {
                continue;
            }
            $key = (string) ($row['col_key'] ?? '');
            if ($key === '') {
                continue;
            }
            if (($row['kind'] ?? '') === 'formula') {
                $rumus = isset($row['rumus']) ? (string) $row['rumus'] : '';
                foreach (BisyarohKolomComputation::extractRefKeys($rumus) as $ref) {
                    if (!in_array($ref, $priorKeys, true)) {
                        throw new \InvalidArgumentException(
                            'Rumus kolom «' . $key . '» merujuk @[' . $ref . '] yang belum ada di atas (urutkan kolom / kunci).'
                        );
                    }
                }
            }
            $priorKeys[] = $key;
        }
    }

    /**
     * @param list<array<string, mixed>> $rows
     */
    private function assertKolomGraphValid(int $bisyarohId): void
    {
        $rows = $this->loadKolomRowsSorted($bisyarohId, true);
        $this->assertFormulaRefsOnlyPriorColumns($rows);
        BisyarohKolomComputation::validateAllWithDummyInputs($rows);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function loadPengurusForLembaga(string $lembagaId): array
    {
        $pjAktif = $this->sqlPengurusJabatanPenugasanAktifCondition('pj');
        $jAktif = $this->sqlJabatanMasterAktifCondition('j');
        $sql = 'SELECT p.`id`, p.`nip`, p.`nama`, p.`rekening_jatim`,
            GROUP_CONCAT(DISTINCT j.`nama` ORDER BY j.`urutan` ASC, j.`nama` ASC SEPARATOR \', \') AS `jabatan_label`
            FROM `pengurus` p
            INNER JOIN `pengurus___jabatan` pj ON pj.`pengurus_id` = p.`id`
            INNER JOIN `jabatan` j ON j.`id` = pj.`jabatan_id`
            WHERE ' . $this->sqlPengurusMasterAktifCondition('p') . '
            AND ' . $pjAktif . '
            AND ' . $jAktif . '
            AND ' . $this->sqlEffectiveJabatanLembagaId('pj', 'j') . ' = ?
            GROUP BY p.`id`, p.`nip`, p.`nama`, p.`rekening_jatim`
            ORDER BY p.`nama` ASC';
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$lembagaId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $rows = is_array($rows) ? $rows : [];

        return $this->applyRekapPengurusSortOrder($rows, $lembagaId);
    }

    /** @param array<string, mixed>|null $nilai */
    private function extractInputsFromNilaiJson(?array $nilai): array
    {
        return $this->nilaiJsonToInputs($nilai);
    }

    private function isValidColKey(string $k): bool
    {
        return (bool) preg_match('/^[a-z][a-z0-9_]{0,63}$/', $k);
    }

    /** Normalisasi rumus tersimpan: pemisah argumen fungsi → titik koma (koma desimal tetap). */
    private function normalizeRumusInput(?string $rumus): ?string
    {
        if ($rumus === null) {
            return null;
        }
        $t = trim($rumus);

        return $t === '' ? null : BisyarohFormulaEvaluator::normalizeFunctionArgCommas($t);
    }

    /**
     * Normalisasi query lembaga: `lembaga_ids` (koma), `lembaga_id` tunggal, atau array.
     *
     * @return list<string>|null null jika kosong
     */
    private function parseLembagaIdsFromQuery(array $q): ?array
    {
        $raw = $q['lembaga_ids'] ?? $q['lembaga_id'] ?? null;
        $ids = [];
        if (is_array($raw)) {
            foreach ($raw as $x) {
                $t = trim((string) $x);
                if ($t !== '') {
                    $ids[] = $t;
                }
            }
        } elseif (is_string($raw) && $raw !== '') {
            foreach (explode(',', $raw) as $p) {
                $t = trim($p);
                if ($t !== '') {
                    $ids[] = $t;
                }
            }
        }

        return $ids !== [] ? array_values(array_unique($ids)) : null;
    }

    /**
     * @param array<string, mixed> $body
     * @return list<string>|null
     */
    private function parseLembagaIdsFromBody(array $body): ?array
    {
        return $this->parseLembagaIdsFromQuery($body);
    }

    /**
     * @param list<string>|null $lembagaIds
     * @return array{pengurus: array<string, string>, jabatan: array<string, string>, pj: array<string, string>}
     */
    private function loadFormulaContextForPengurus(int $idPengurus, ?array $lembagaIds = null): array
    {
        return BisyarohPengurusFormulaHelper::loadFormulaContext($this->db, $idPengurus, null, $lembagaIds);
    }

    /**
     * @param list<string>|null $fromRequest
     * @return list<string>|null
     */
    private function resolveFormulaLembagaIdsForRekap(int $bid, int $idPengurus, ?array $fromRequest = null): ?array
    {
        if ($fromRequest !== null && $fromRequest !== []) {
            return $fromRequest;
        }
        try {
            $stmt = $this->db->prepare('SELECT `lembaga_id` FROM `bisyaroh` WHERE `id` = ? LIMIT 1');
            $stmt->execute([$bid]);
            $fb = $stmt->fetch(PDO::FETCH_ASSOC);
            $fallback = is_array($fb) ? trim((string) ($fb['lembaga_id'] ?? '')) : '';
        } catch (\Throwable $e) {
            $fallback = '';
        }
        $setIds = $this->getLembagaIdsForBisyaroh($bid, $fallback);
        if ($setIds !== []) {
            return $setIds;
        }
        $master = $this->fetchPengurusMasterLembagaId($idPengurus);

        return $master !== '' ? [$master] : null;
    }

    /**
     * @param list<string>|null $lembagaIds
     */
    private function formulaContextCacheKey(int $pid, ?array $lembagaIds): string
    {
        if ($lembagaIds === null || $lembagaIds === []) {
            return $pid . ':all';
        }
        $ids = $lembagaIds;
        sort($ids);

        return $pid . ':' . implode(',', $ids);
    }

    /**
     * @param list<string> $setLembagaIds
     * @param list<string>|null $selectedLembagaIds
     * @return list<string>
     */
    private function resolveRekapPengurusLembagaIds(array $setLembagaIds, ?array $selectedLembagaIds): array
    {
        $set = array_values(array_unique(array_filter(array_map(static fn (string $x): string => trim($x), $setLembagaIds), static fn (string $x): bool => $x !== '')));
        if ($selectedLembagaIds === null) {
            return $set;
        }
        $selectedMap = [];
        foreach ($selectedLembagaIds as $x) {
            $t = trim((string) $x);
            if ($t !== '') {
                $selectedMap[$t] = true;
            }
        }
        if ($selectedMap === []) {
            return [];
        }

        return array_values(array_filter($set, static fn (string $x): bool => isset($selectedMap[$x])));
    }

    public function list(Request $request, Response $response): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canViewTabAturan($user) && !$this->canViewTabRekap($user) && !$this->canViewTabHistori($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
        }
        $q = $request->getQueryParams();
        $listAll = filter_var($q['all'] ?? false, FILTER_VALIDATE_BOOLEAN);
        if ($listAll) {
            if (!$this->canViewTabAturan($user)) {
                return $this->json($response, ['success' => false, 'message' => 'Akses tab Aturan diperlukan'], 403);
            }
            $rows = $this->listBisyarohAccessibleToUser($user);
            $rows = $this->attachLembagaIdsToBisyarohRows($rows);

            return $this->json($response, ['success' => true, 'data' => $rows]);
        }
        $ids = $this->parseLembagaIdsFromQuery($q);
        if ($ids === null || $ids === []) {
            return $this->json($response, ['success' => false, 'message' => 'Parameter lembaga_id atau lembaga_ids wajib'], 400);
        }
        foreach ($ids as $lid) {
            if (!$this->userMayAccessLembagaForRekap($user, $lid)) {
                return $this->json($response, ['success' => false, 'message' => 'Akses rekap: lembaga di luar cakupan peran Anda'], 403);
            }
        }
        try {
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $this->db->prepare(
                'SELECT DISTINCT b.`id`, b.`lembaga_id`, b.`nama`, b.`aktif`, b.`created_at`, b.`updated_at`
                 FROM `bisyaroh` b
                 INNER JOIN `bisyaroh___lembaga` bl ON bl.`bisyaroh_id` = b.`id`
                 WHERE bl.`lembaga_id` IN (' . $ph . ')
                 ORDER BY b.`id` ASC'
            );
            $stmt->execute($ids);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            if (count($ids) !== 1) {
                return $this->json($response, ['success' => false, 'message' => 'Gunakan satu lembaga atau jalankan migrasi bisyaroh multi-lembaga.'], 503);
            }
            $stmt = $this->db->prepare(
                'SELECT `id`, `lembaga_id`, `nama`, `aktif`, `created_at`, `updated_at` FROM `bisyaroh` WHERE `lembaga_id` = ? ORDER BY `id` ASC'
            );
            $stmt->execute([$ids[0]]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }
        $rows = is_array($rows) ? $rows : [];
        $rows = $this->attachLembagaIdsToBisyarohRows($rows);

        return $this->json($response, ['success' => true, 'data' => $rows]);
    }

    /**
     * GET /api/bisyaroh/rekap/lembaga — daftar lembaga untuk filter tab Rekap (ter-scope per peran tab Rekap).
     */
    public function listRekapLembaga(Request $request, Response $response): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canViewTabRekap($user) && !$this->canViewTabHistori($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses tab Rekap atau Histori diperlukan'], 403);
        }
        $qL = $request->getQueryParams();
        $qL = is_array($qL) ? $qL : [];
        $forHistori = filter_var($qL['histori'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $scope = ($forHistori && $this->canViewTabHistori($user))
            ? $this->bisyarohHistoriLembagaScope($user)
            : $this->bisyarohRekapLembagaScope($user);
        try {
            if ($scope['all']) {
                $stmt = $this->db->query('SELECT `id`, `nama` FROM `lembaga` ORDER BY `nama` ASC, `id` ASC');
                $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
            } else {
                $ids = $scope['ids'];
                if ($ids === []) {
                    $rows = [];
                } else {
                    $ph = implode(',', array_fill(0, count($ids), '?'));
                    $stmt = $this->db->prepare(
                        'SELECT `id`, `nama` FROM `lembaga` WHERE `id` IN (' . $ph . ') ORDER BY `nama` ASC, `id` ASC'
                    );
                    $stmt->execute($ids);
                    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                }
            }
        } catch (\Throwable $e) {
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat lembaga'], 500);
        }
        $rows = is_array($rows) ? $rows : [];

        return $this->json($response, [
            'success' => true,
            'data' => $rows,
            'semua_lembaga' => $scope['all'],
        ]);
    }

    /**
     * GET /api/bisyaroh/rekap/review-meta — filter tab Review.
     * Query kalender wajib. periode_bulan opsional (filter lembaga per bulan). lembaga_id opsional (periode per lembaga, legacy).
     */
    public function listRekapReviewMeta(Request $request, Response $response): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canViewTabRekap($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses tab Rekap diperlukan'], 403);
        }
        $q = $request->getQueryParams();
        $q = is_array($q) ? $q : [];
        $lembagaId = trim((string) ($q['lembaga_id'] ?? ''));
        $periodeBulanFilter = trim((string) ($q['periode_bulan'] ?? ''));
        if ($periodeBulanFilter !== '' && !preg_match('/^\d{4}-\d{2}$/', $periodeBulanFilter)) {
            return $this->json($response, ['success' => false, 'message' => 'periode_bulan tidak valid (YYYY-MM)'], 400);
        }
        $kalenderFilter = isset($q['kalender']) ? $this->normalizeRekapKalender($q['kalender']) : null;
        $scope = $this->bisyarohRekapLembagaScope($user);
        $hasKalCol = $this->rekapBarisHasKalenderColumn();

        if ($lembagaId !== '') {
            if (!$this->userMayAccessLembagaForRekap($user, $lembagaId)) {
                return $this->json($response, ['success' => false, 'message' => 'Lembaga di luar cakupan rekap Anda'], 403);
            }
            if ($kalenderFilter === null) {
                return $this->json($response, ['success' => false, 'message' => 'kalender wajib (masehi atau hijriyah)'], 400);
            }
            if (!$hasKalCol && $kalenderFilter === 'hijriyah') {
                return $this->json($response, ['success' => true, 'data' => ['lembaga' => [], 'periode' => []]]);
            }
            try {
                $barisRows = $this->fetchReviewMetaRekapBarisRows(
                    $scope,
                    $lembagaId,
                    $hasKalCol ? $kalenderFilter : null,
                    null
                );
            } catch (\Throwable $e) {
                return $this->json($response, ['success' => false, 'message' => 'Gagal memuat periode review'], 500);
            }
            $periode = $this->buildReviewMetaPeriodeList($barisRows, $lembagaId, $hasKalCol, $kalenderFilter);

            return $this->json($response, [
                'success' => true,
                'data' => ['lembaga' => [], 'periode' => $periode],
            ]);
        }

        if ($kalenderFilter === null) {
            return $this->json($response, ['success' => false, 'message' => 'kalender wajib (masehi atau hijriyah)'], 400);
        }
        if (!$hasKalCol && $kalenderFilter === 'hijriyah') {
            return $this->json($response, ['success' => true, 'data' => ['lembaga' => [], 'periode' => []]]);
        }
        if (!$scope['all'] && $scope['ids'] === []) {
            return $this->json($response, ['success' => true, 'data' => ['lembaga' => [], 'periode' => []]]);
        }

        if ($periodeBulanFilter !== '') {
            try {
                $barisRows = $this->fetchReviewMetaRekapBarisRows(
                    $scope,
                    null,
                    $hasKalCol ? $kalenderFilter : null,
                    $periodeBulanFilter
                );
            } catch (\Throwable $e) {
                return $this->json($response, ['success' => false, 'message' => 'Gagal memuat lembaga review'], 500);
            }
            $lembaga = $this->buildReviewMetaLembagaList($barisRows);

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'lembaga' => $lembaga,
                    'periode' => [
                        [
                            'periode_bulan' => $periodeBulanFilter,
                            'kalender' => $kalenderFilter,
                        ],
                    ],
                ],
            ]);
        }

        try {
            $barisRows = $this->fetchReviewMetaRekapBarisRows(
                $scope,
                null,
                $hasKalCol ? $kalenderFilter : null,
                null
            );
        } catch (\Throwable $e) {
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat periode review'], 500);
        }
        $periode = $this->buildReviewMetaPeriodeListFromRows($barisRows, $hasKalCol, $kalenderFilter);

        return $this->json($response, [
            'success' => true,
            'data' => ['lembaga' => [], 'periode' => $periode],
        ]);
    }

    /** SQL: baris rekap punya isian (nilai_json atau catatan). */
    private function sqlRekapBarisHasIsian(): string
    {
        return <<<'SQL'
(
  (r.`nilai_json` IS NOT NULL AND TRIM(r.`nilai_json`) NOT IN ('', '{}', 'null', '[]'))
  OR (r.`catatan` IS NOT NULL AND TRIM(r.`catatan`) <> '')
)
SQL;
    }

    /** EXISTS: pengurus pada baris rekap punya penugasan jabatan di lembaga target. */
    private function sqlExistsRekapPengurusDiLembaga(string $lembagaIdExpr): string
    {
        $pjAktif = $this->sqlPengurusJabatanPenugasanAktifCondition('pj_rv');
        $jAktif = $this->sqlJabatanMasterAktifCondition('j_rv');
        $pAktif = $this->sqlPengurusMasterAktifCondition('p_rv');

        return 'EXISTS (
            SELECT 1 FROM `pengurus` p_rv
            INNER JOIN `pengurus___jabatan` pj_rv ON pj_rv.`pengurus_id` = p_rv.`id`
            INNER JOIN `jabatan` j_rv ON j_rv.`id` = pj_rv.`jabatan_id`
            WHERE p_rv.`id` = r.`id_pengurus`
              AND ' . $pAktif . '
              AND ' . $pjAktif . '
              AND ' . $jAktif . '
              AND ' . $this->sqlEffectiveJabatanLembagaId('pj_rv', 'j_rv') . ' = ' . $lembagaIdExpr . '
        )';
    }

    /**
     * Kandidat baris rekap untuk meta Review (per lembaga terhubung, pengurus milik lembaga itu).
     *
     * @param array{all: bool, ids: list<string>} $scope
     * @return list<array<string, mixed>>
     */
    private function fetchReviewMetaRekapBarisRows(
        array $scope,
        ?string $filterLembagaId,
        ?string $filterKalender,
        ?string $filterPeriodeBulan = null
    ): array {
        $isianSql = $this->sqlRekapBarisHasIsian();
        $hasKalCol = $this->rekapBarisHasKalenderColumn();
        $kalSel = $hasKalCol ? ', r.`kalender`' : '';
        $sql = 'SELECT bl.`lembaga_id`, l.`nama` AS `lembaga_nama`, r.`bisyaroh_id`, r.`id_pengurus`,'
            . ' r.`periode_bulan`, r.`nilai_json`, r.`catatan`' . $kalSel . '
            FROM `bisyaroh___lembaga` bl
            INNER JOIN `lembaga` l ON l.`id` = bl.`lembaga_id`
            INNER JOIN `bisyaroh___rekap_baris` r ON r.`bisyaroh_id` = bl.`bisyaroh_id`
            INNER JOIN `bisyaroh` b ON b.`id` = bl.`bisyaroh_id` AND (b.`aktif` = 1 OR b.`aktif` = \'1\')
            WHERE ' . $isianSql . '
              AND ' . $this->sqlExistsRekapPengurusDiLembaga('bl.`lembaga_id`');
        $bind = [];
        if ($filterLembagaId !== null && $filterLembagaId !== '') {
            $sql .= ' AND bl.`lembaga_id` = ?';
            $bind[] = $filterLembagaId;
        }
        if ($hasKalCol && $filterKalender !== null && $filterKalender !== '') {
            $sql .= ' AND r.`kalender` = ?';
            $bind[] = $filterKalender;
        }
        if ($filterPeriodeBulan !== null && $filterPeriodeBulan !== '' && preg_match('/^\d{4}-\d{2}$/', $filterPeriodeBulan)) {
            $sql .= ' AND r.`periode_bulan` = ?';
            $bind[] = $filterPeriodeBulan;
        }
        if (!$scope['all']) {
            $ids = $scope['ids'];
            if ($ids === []) {
                return [];
            }
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $sql .= ' AND l.`id` IN (' . $ph . ')';
            foreach ($ids as $id) {
                $bind[] = $id;
            }
        }
        $stmt = $this->db->prepare($sql);
        $stmt->execute($bind);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return is_array($rows) ? $rows : [];
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return list<array{id: string, nama: string}>
     */
    private function buildReviewMetaLembagaList(array $rows): array
    {
        $filled = $this->reviewMetaLembagaIdsWithNonZeroTotal($rows);
        if ($filled === []) {
            return [];
        }
        $filledSet = array_fill_keys($filled, true);
        $byId = [];
        foreach ($rows as $r) {
            $id = isset($r['lembaga_id']) ? trim((string) $r['lembaga_id']) : '';
            if ($id === '' || !isset($filledSet[$id])) {
                continue;
            }
            $byId[$id] = [
                'id' => $id,
                'nama' => isset($r['lembaga_nama']) ? (string) $r['lembaga_nama'] : $id,
            ];
        }
        $lembaga = array_values($byId);
        usort($lembaga, static function (array $a, array $b): int {
            $na = $a['nama'] ?? '';
            $nb = $b['nama'] ?? '';
            $c = strcasecmp($na, $nb);

            return $c !== 0 ? $c : strcasecmp($a['id'] ?? '', $b['id'] ?? '');
        });

        return $lembaga;
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return list<array{periode_bulan: string, kalender: string}>
     */
    private function buildReviewMetaPeriodeList(
        array $rows,
        string $lembagaId,
        bool $hasKalCol,
        string $kalenderFilter
    ): array {
        $kolomCache = [];
        $fctxCache = [];
        $periodeOk = [];
        foreach ($rows as $row) {
            if (trim((string) ($row['lembaga_id'] ?? '')) !== $lembagaId) {
                continue;
            }
            $pb = isset($row['periode_bulan']) ? trim((string) $row['periode_bulan']) : '';
            if ($pb === '' || !preg_match('/^\d{4}-\d{2}$/', $pb)) {
                continue;
            }
            $kal = $hasKalCol ? (string) ($row['kalender'] ?? 'masehi') : 'masehi';
            if ($kal !== $kalenderFilter) {
                continue;
            }
            if ($this->reviewMetaRekapRowTotalNominal($row, $lembagaId, $kolomCache, $fctxCache) <= 0) {
                continue;
            }
            $periodeOk[$pb . '|' . $kal] = [
                'periode_bulan' => $pb,
                'kalender' => $kal,
            ];
        }
        $periode = array_values($periodeOk);
        usort($periode, static function (array $a, array $b): int {
            return strcmp($b['periode_bulan'] ?? '', $a['periode_bulan'] ?? '');
        });

        return $periode;
    }

    /**
     * Daftar bulan (periode) yang punya isian rekap untuk kalender terpilih (semua lembaga dalam cakupan, termasuk sudah rilis).
     *
     * @param list<array<string, mixed>> $rows
     * @return list<array{periode_bulan: string, kalender: string}>
     */
    private function buildReviewMetaPeriodeListFromRows(array $rows, bool $hasKalCol, string $kalenderFilter): array
    {
        $kolomCache = [];
        $fctxCache = [];
        $periodeOk = [];
        foreach ($rows as $row) {
            $lid = isset($row['lembaga_id']) ? trim((string) $row['lembaga_id']) : '';
            if ($lid === '') {
                continue;
            }
            $pb = isset($row['periode_bulan']) ? trim((string) $row['periode_bulan']) : '';
            if ($pb === '' || !preg_match('/^\d{4}-\d{2}$/', $pb)) {
                continue;
            }
            $kal = $hasKalCol ? (string) ($row['kalender'] ?? 'masehi') : 'masehi';
            if ($kal !== $kalenderFilter) {
                continue;
            }
            if ($this->reviewMetaRekapRowTotalNominal($row, $lid, $kolomCache, $fctxCache) <= 0) {
                continue;
            }
            $periodeOk[$pb . '|' . $kal] = [
                'periode_bulan' => $pb,
                'kalender' => $kal,
            ];
        }
        $periode = array_values($periodeOk);
        usort($periode, static function (array $a, array $b): int {
            return strcmp($b['periode_bulan'] ?? '', $a['periode_bulan'] ?? '');
        });

        return $periode;
    }

    /**
     * Lembaga yang punya minimal satu baris rekap (pengurus lembaga itu) dengan total_nominal > 0.
     *
     * @param list<array<string, mixed>> $rows
     * @return list<string>
     */
    private function reviewMetaLembagaIdsWithNonZeroTotal(array $rows): array
    {
        $kolomCache = [];
        $fctxCache = [];
        $ok = [];
        foreach ($rows as $row) {
            $lid = isset($row['lembaga_id']) ? trim((string) $row['lembaga_id']) : '';
            if ($lid === '' || isset($ok[$lid])) {
                continue;
            }
            if ($this->reviewMetaRekapRowTotalNominal($row, $lid, $kolomCache, $fctxCache) > 0) {
                $ok[$lid] = true;
            }
        }

        return array_keys($ok);
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @param array<int, list<array<string, mixed>>> $kolomCache
     * @param array<string, array{pengurus: array<string, string>, jabatan: array<string, string>, pj: array<string, string>}> $fctxCache
     */
    private function reviewMetaRekapRowTotalNominal(
        array $row,
        string $lembagaId,
        array &$kolomCache,
        array &$fctxCache
    ): float {
        $bid = (int) ($row['bisyaroh_id'] ?? 0);
        $pid = (int) ($row['id_pengurus'] ?? 0);
        if ($bid <= 0 || $pid <= 0) {
            return 0.0;
        }
        if (!isset($kolomCache[$bid])) {
            $kolomCache[$bid] = $this->loadKolomRowsSorted($bid, true);
        }
        $fctxKey = $this->formulaContextCacheKey($pid, [$lembagaId]);
        if (!isset($fctxCache[$fctxKey])) {
            $fctxCache[$fctxKey] = $this->loadFormulaContextForPengurus($pid, [$lembagaId]);
        }
        $inputs = $this->nilaiJsonToInputs($row['nilai_json'] ?? null);
        try {
            return BisyarohRekapSnapshotHelper::resolveTotalNominal(
                $kolomCache[$bid],
                $inputs,
                $fctxCache[$fctxKey],
                $row['nilai_json'] ?? null
            );
        } catch (\Throwable $e) {
            return 0.0;
        }
    }

    /**
     * GET /api/bisyaroh/rekap/pengurus-urutan?lembaga_id=… — daftar pengurus + urutan tersimpan per lembaga.
     */
    public function getRekapPengurusUrutan(Request $request, Response $response): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canViewTabRekap($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses tab Rekap diperlukan'], 403);
        }
        $q = $request->getQueryParams();
        $q = is_array($q) ? $q : [];
        $lembagaId = trim((string) ($q['lembaga_id'] ?? ''));
        if ($lembagaId === '') {
            return $this->json($response, ['success' => false, 'message' => 'lembaga_id wajib'], 400);
        }
        if (!$this->userMayAccessLembagaForRekap($user, $lembagaId)) {
            return $this->json($response, ['success' => false, 'message' => 'Lembaga di luar cakupan rekap Anda'], 403);
        }
        $pengurus = $this->loadPengurusForLembaga($lembagaId);
        $order = array_map(static fn (array $p): int => (int) ($p['id'] ?? 0), $pengurus);

        return $this->json($response, [
            'success' => true,
            'data' => [
                'lembaga_id' => $lembagaId,
                'pengurus' => $pengurus,
                'order' => $order,
            ],
        ]);
    }

    /**
     * PUT /api/bisyaroh/rekap/pengurus-urutan — simpan urutan baris pengurus per lembaga.
     */
    public function putRekapPengurusUrutan(Request $request, Response $response): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canEditTabRekap($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses mengubah rekap ditolak'], 403);
        }
        if (!$this->rekapPengurusUrutanTableExists()) {
            return $this->json($response, ['success' => false, 'message' => 'Fitur urutan pengurus membutuhkan migrasi database'], 503);
        }
        $body = $request->getParsedBody();
        $body = is_array($body) ? $body : [];
        $lembagaId = trim((string) ($body['lembaga_id'] ?? ''));
        if ($lembagaId === '') {
            return $this->json($response, ['success' => false, 'message' => 'lembaga_id wajib'], 400);
        }
        if (!$this->userMayAccessLembagaForRekap($user, $lembagaId)) {
            return $this->json($response, ['success' => false, 'message' => 'Lembaga di luar cakupan rekap Anda'], 403);
        }
        $order = $body['order'] ?? null;
        if (!is_array($order) || $order === []) {
            return $this->json($response, ['success' => false, 'message' => 'order wajib berupa array id_pengurus'], 400);
        }
        $ids = [];
        foreach ($order as $rawId) {
            $id = (int) $rawId;
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID pengurus tidak valid'], 400);
            }
            if (in_array($id, $ids, true)) {
                return $this->json($response, ['success' => false, 'message' => 'ID pengurus duplikat dalam order'], 400);
            }
            $ids[] = $id;
        }
        $existing = $this->loadPengurusForLembaga($lembagaId);
        $existingIds = array_map(static fn (array $r): int => (int) ($r['id'] ?? 0), $existing);
        sort($existingIds);
        $sortedReq = $ids;
        sort($sortedReq);
        if ($sortedReq !== $existingIds) {
            return $this->json($response, ['success' => false, 'message' => 'order harus memuat semua pengurus lembaga ini tepat sekali'], 400);
        }
        $this->db->beginTransaction();
        try {
            $del = $this->db->prepare('DELETE FROM `bisyaroh___rekap_pengurus_urutan` WHERE `lembaga_id` = ?');
            $del->execute([$lembagaId]);
            $ins = $this->db->prepare(
                'INSERT INTO `bisyaroh___rekap_pengurus_urutan` (`lembaga_id`, `id_pengurus`, `sort_order`) VALUES (?, ?, ?)'
            );
            foreach ($ids as $index => $pengurusId) {
                $ins->execute([$lembagaId, $pengurusId, ($index + 1) * 10]);
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $e;
        }

        return $this->json($response, ['success' => true, 'message' => 'Urutan pengurus diperbarui']);
    }

    /**
     * PUT /api/bisyaroh/rekap/pengurus-rekening-jatim — simpan nomor rekening Bank Jatim ke tabel pengurus.
     */
    public function putRekapPengurusRekeningJatim(Request $request, Response $response): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canEditTabRekap($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses mengubah rekap ditolak'], 403);
        }
        $body = $request->getParsedBody();
        $body = is_array($body) ? $body : [];
        $lembagaId = trim((string) ($body['lembaga_id'] ?? ''));
        if ($lembagaId === '') {
            return $this->json($response, ['success' => false, 'message' => 'lembaga_id wajib'], 400);
        }
        if (!$this->userMayAccessLembagaForRekap($user, $lembagaId)) {
            return $this->json($response, ['success' => false, 'message' => 'Lembaga di luar cakupan rekap Anda'], 403);
        }
        $pengurusId = (int) ($body['id_pengurus'] ?? 0);
        if ($pengurusId <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'id_pengurus wajib'], 400);
        }
        $rekening = trim((string) ($body['rekening_jatim'] ?? ''));
        if (strlen($rekening) > 50) {
            return $this->json($response, ['success' => false, 'message' => 'Nomor rekening maksimal 50 karakter'], 400);
        }
        $allowed = $this->loadPengurusForLembaga($lembagaId);
        $allowedIds = array_map(static fn (array $r): int => (int) ($r['id'] ?? 0), $allowed);
        if (!in_array($pengurusId, $allowedIds, true)) {
            return $this->json($response, ['success' => false, 'message' => 'Pengurus tidak termasuk lembaga rekap ini'], 403);
        }
        $stmt = $this->db->prepare(
            'UPDATE `pengurus` SET `rekening_jatim` = ?, `tanggal_update` = NOW() WHERE `id` = ?'
        );
        $stmt->execute([$rekening !== '' ? $rekening : null, $pengurusId]);

        return $this->json($response, [
            'success' => true,
            'message' => 'Rekening Jatim disimpan',
            'data' => [
                'id_pengurus' => $pengurusId,
                'rekening_jatim' => $rekening,
            ],
        ]);
    }

    /**
     * GET /api/bisyaroh/histori — ringkas: total + catatan; ruang lingkup pengurus memakai aksi histori.
     */
    public function listHistori(Request $request, Response $response): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canViewTabHistori($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses tab Histori ditolak'], 403);
        }
        $scopeMode = $this->historiPengurusScopeMode($user);
        $q = $request->getQueryParams();
        $q = is_array($q) ? $q : [];
        $limit = isset($q['limit']) ? (int) $q['limit'] : 50;
        if ($limit < 1) {
            $limit = 50;
        }
        if ($limit > 100) {
            $limit = 100;
        }
        $offset = isset($q['offset']) ? (int) $q['offset'] : 0;
        if ($offset < 0) {
            $offset = 0;
        }
        $search = trim((string) ($q['q'] ?? ''));
        $lembagaId = trim((string) ($q['lembaga_id'] ?? ''));
        $onlySelf = filter_var($q['only_self'] ?? false, FILTER_VALIDATE_BOOLEAN);
        if ($lembagaId !== '' && !$this->userMayAccessLembagaForHistori($user, $lembagaId)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses histori: lembaga di luar cakupan'], 403);
        }

        $allowedIds = $this->listAllowedBisyarohIdsForHistoriUser($user);
        if ($allowedIds === []) {
            return $this->json($response, [
                'success' => true,
                'data' => [],
                'total' => 0,
                'histori_pengurus_scope' => $scopeMode,
            ]);
        }

        $selfSql = '';
        $selfParams = [];
        if ($scopeMode === 'self' || $onlySelf) {
            $pidSelf = RoleHelper::getPengurusIdFromPayload($user);
            if ($pidSelf === null || $pidSelf <= 0) {
                return $this->json($response, [
                    'success' => true,
                    'data' => [],
                    'total' => 0,
                    'histori_pengurus_scope' => $scopeMode,
                ]);
            }
            $selfSql = ' AND r.`id_pengurus` = ?';
            $selfParams = [$pidSelf];
        }

        $phB = implode(',', array_fill(0, count($allowedIds), '?'));
        $lembagaFilterSql = '';
        $lembagaParams = [];
        if ($lembagaId !== '') {
            $lembagaFilterSql = ' AND (
                EXISTS (SELECT 1 FROM `bisyaroh___lembaga` blf WHERE blf.`bisyaroh_id` = r.`bisyaroh_id` AND blf.`lembaga_id` = ?)
                OR EXISTS (SELECT 1 FROM `bisyaroh` bf WHERE bf.`id` = r.`bisyaroh_id` AND TRIM(COALESCE(bf.`lembaga_id`, \'\')) = ?)
            )';
            $lembagaParams = [$lembagaId, $lembagaId];
        }

        $searchSql = '';
        $searchParams = [];
        if ($search !== '' && $scopeMode !== 'self') {
            $searchSql = ' AND (p.`nama` LIKE ? OR CAST(p.`nip` AS CHAR) LIKE ?)';
            $like = '%' . $search . '%';
            $searchParams = [$like, $like];
        }

        $baseWhere = 'r.`bisyaroh_id` IN (' . $phB . ')' . $lembagaFilterSql . $selfSql . $searchSql;
        $bindAll = array_merge($allowedIds, $lembagaParams, $selfParams, $searchParams);

        $kalSel = $this->rekapBarisHasKalenderColumn() ? ', r.`kalender`' : '';
        $hrCond = $this->sqlHistoriRilisExistsCondition('r');

        try {
            $sqlCount = 'SELECT COUNT(*) FROM `bisyaroh___rekap_baris` r'
                . ' INNER JOIN `pengurus` p ON p.`id` = r.`id_pengurus`'
                . ' WHERE ' . $baseWhere . $hrCond;
            $stmt = $this->db->prepare($sqlCount);
            $stmt->execute($bindAll);
            $total = (int) $stmt->fetchColumn();

            $sqlList = 'SELECT r.`id`, r.`bisyaroh_id`, r.`id_pengurus`, r.`periode_bulan`, r.`nilai_json`, r.`catatan`,'
                . ' r.`created_at`, r.`updated_at`' . $kalSel . ','
                . ' p.`nama` AS `pengurus_nama`, p.`nip` AS `pengurus_nip`,'
                . ' b.`nama` AS `bisyaroh_nama`'
                . ' FROM `bisyaroh___rekap_baris` r'
                . ' INNER JOIN `pengurus` p ON p.`id` = r.`id_pengurus`'
                . ' INNER JOIN `bisyaroh` b ON b.`id` = r.`bisyaroh_id`'
                . ' WHERE ' . $baseWhere . $hrCond
                . ' ORDER BY r.`updated_at` DESC, r.`id` DESC'
                . ' LIMIT ' . $limit . ' OFFSET ' . $offset;
            $stmt = $this->db->prepare($sqlList);
            $stmt->execute($bindAll);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            error_log('BisyarohController::listHistori SQL: ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat histori'], 500);
        }
        $rows = is_array($rows) ? $rows : [];
        $kolomCache = [];
        $historiLembagaIds = $lembagaId !== '' ? [$lembagaId] : null;
        /** @var array<string, array{pengurus: array<string, string>, jabatan: array<string, string>, pj: array<string, string>}> $fctxCache */
        $fctxCache = [];
        $out = [];
        try {
        foreach ($rows as $row) {
            $ca = isset($row['created_at']) ? strtotime((string) $row['created_at']) : false;
            $ua = isset($row['updated_at']) ? strtotime((string) $row['updated_at']) : false;
            $isBaru = is_int($ca) && is_int($ua) && $ca > 0 && $ua > 0 && abs($ua - $ca) < 2;
            $bid = (int) ($row['bisyaroh_id'] ?? 0);
            $pid = (int) ($row['id_pengurus'] ?? 0);
            if (!isset($kolomCache[$bid])) {
                $kolomCache[$bid] = $this->loadKolomRowsSorted($bid, true);
            }
            $fctxKey = $this->formulaContextCacheKey($pid, $historiLembagaIds);
            if (!isset($fctxCache[$fctxKey])) {
                $fctxCache[$fctxKey] = $this->loadFormulaContextForPengurus($pid, $historiLembagaIds);
            }
            $totalNom = 0.0;
            $inputs = $this->nilaiJsonToInputs($row['nilai_json'] ?? null);
            try {
                $totalNom = BisyarohRekapSnapshotHelper::resolveTotalNominal(
                    $kolomCache[$bid],
                    $inputs,
                    $fctxCache[$fctxKey],
                    $row['nilai_json'] ?? null
                );
            } catch (\Throwable $e) {
                $totalNom = 0.0;
            }
            $catatan = isset($row['catatan']) ? trim((string) $row['catatan']) : '';
            $out[] = [
                'id' => (int) ($row['id'] ?? 0),
                'pengurus_nama' => isset($row['pengurus_nama']) ? (string) $row['pengurus_nama'] : '',
                'pengurus_nip' => isset($row['pengurus_nip']) ? $row['pengurus_nip'] : null,
                'total_nominal' => $totalNom,
                'catatan' => $catatan !== '' ? $catatan : null,
                'is_baru' => $isBaru,
                'display_at' => $row['updated_at'] ?? null,
                'potong_uwaba_total' => null,
            ];
        }
        } catch (\Throwable $e) {
            error_log('BisyarohController::listHistori compute: ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat histori'], 500);
        }
        $potongIds = [];
        foreach ($out as $item) {
            $rid = (int) ($item['id'] ?? 0);
            if ($rid > 0) {
                $potongIds[] = $rid;
            }
        }
        $potongTotals = $this->loadPotongUwabaTotalsByRekapBarisIds($potongIds);
        foreach ($out as &$item) {
            $rid = (int) ($item['id'] ?? 0);
            if ($rid > 0 && isset($potongTotals[$rid]) && $potongTotals[$rid] > 0) {
                $item['potong_uwaba_total'] = $potongTotals[$rid];
            }
        }
        unset($item);

        return $this->json($response, [
            'success' => true,
            'data' => $out,
            'total' => $total,
            'histori_pengurus_scope' => $scopeMode,
        ]);
    }

    /**
     * GET /api/bisyaroh/histori/rincian/{rekapBarisId} — kolom, rumus terurai, total.
     */
    public function historiRincian(Request $request, Response $response, array $args): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canViewTabHistori($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses tab Histori ditolak'], 403);
        }
        $rid = isset($args['rekapBarisId']) ? (int) $args['rekapBarisId'] : 0;
        if ($rid <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'ID baris tidak valid'], 400);
        }
        $kalSel = $this->rekapBarisHasKalenderColumn() ? ', r.`kalender`' : '';
        try {
            $stmt = $this->db->prepare(
                'SELECT r.`id`, r.`bisyaroh_id`, r.`id_pengurus`, r.`periode_bulan`, r.`nilai_json`, r.`catatan`,'
                . ' r.`created_at`, r.`updated_at`' . $kalSel . ','
                . ' p.`nama` AS `pengurus_nama`, p.`nip` AS `pengurus_nip`,'
                . ' b.`nama` AS `bisyaroh_nama`'
                . ' FROM `bisyaroh___rekap_baris` r'
                . ' INNER JOIN `pengurus` p ON p.`id` = r.`id_pengurus`'
                . ' INNER JOIN `bisyaroh` b ON b.`id` = r.`bisyaroh_id`'
                . ' WHERE r.`id` = ? LIMIT 1'
            );
            $stmt->execute([$rid]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat rincian'], 500);
        }
        if (!is_array($row)) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak ditemukan'], 404);
        }
        if (!$this->userMayViewHistoriRekapRow($user, $row)) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak ditemukan atau akses ditolak'], 404);
        }
        $bid = (int) ($row['bisyaroh_id'] ?? 0);
        $pid = (int) ($row['id_pengurus'] ?? 0);
        $kolomDef = $this->loadKolomRowsSorted($bid, true);
        $inputs = $this->nilaiJsonToInputs($row['nilai_json'] ?? null);
        $qHist = $request->getQueryParams();
        $qHist = is_array($qHist) ? $qHist : [];
        $histLembaga = trim((string) ($qHist['lembaga_id'] ?? ''));
        $histLembagaIds = $histLembaga !== '' ? [$histLembaga] : null;
        if ($histLembagaIds === null) {
            $master = $this->fetchPengurusMasterLembagaId($pid);
            $histLembagaIds = $master !== '' ? [$master] : null;
        }
        $fCtx = $this->loadFormulaContextForPengurus($pid, $histLembagaIds);
        $calc = BisyarohRekapSnapshotHelper::resolveCalc($kolomDef, $inputs, $fCtx, $row['nilai_json'] ?? null);
        $cells = BisyarohRekapSnapshotHelper::hasSnapshot($row['nilai_json'] ?? null)
            ? ($calc['cells'] ?? [])
            : $this->enrichHistoriCellsRumusTerurai($calc, $fCtx);
        $kalender = null;
        if ($this->rekapBarisHasKalenderColumn() && array_key_exists('kalender', $row)) {
            $kalender = (string) $row['kalender'];
        }
        $catatanRow = isset($row['catatan']) ? trim((string) $row['catatan']) : '';
        $rekapBarisId = (int) ($row['id'] ?? 0);
        $potongMap = $rekapBarisId > 0 ? $this->loadPotongUwabaPayloadByRekapBarisIds([$rekapBarisId]) : [];
        $potongUwaba = $potongMap[$rekapBarisId] ?? null;

        return $this->json($response, [
            'success' => true,
            'data' => [
                'id' => (int) ($row['id'] ?? 0),
                'bisyaroh_id' => $bid,
                'bisyaroh_nama' => isset($row['bisyaroh_nama']) ? (string) $row['bisyaroh_nama'] : '',
                'id_pengurus' => $pid,
                'pengurus_nama' => isset($row['pengurus_nama']) ? (string) $row['pengurus_nama'] : '',
                'pengurus_nip' => $row['pengurus_nip'] ?? null,
                'periode_bulan' => isset($row['periode_bulan']) ? (string) $row['periode_bulan'] : '',
                'kalender' => $kalender,
                'catatan' => $catatanRow !== '' ? $catatanRow : null,
                'total_nominal' => (float) ($calc['total_nominal'] ?? 0.0),
                'cells' => $cells,
                'updated_at' => $row['updated_at'] ?? null,
                'histori_pengurus_scope' => $this->historiPengurusScopeMode($user),
                'potong_uwaba' => $potongUwaba,
            ],
        ]);
    }

    public function show(Request $request, Response $response, array $args): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canViewTabAturan($user) && !$this->canViewTabRekap($user) && !$this->canViewTabHistori($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
        }
        $id = isset($args['id']) ? (int) $args['id'] : 0;
        $ctx = $id > 0 ? $this->loadBisyarohRow($request, $response, $id, $user) : null;
        if ($ctx === null) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak ditemukan atau akses ditolak'], 404);
        }
        $stmt = $this->db->prepare(
            'SELECT `id`, `lembaga_id`, `nama`, `aktif`, `created_at`, `updated_at` FROM `bisyaroh` WHERE `id` = ? LIMIT 1'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!is_array($row)) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak ditemukan'], 404);
        }
        $lembagaIds = $this->getLembagaIdsForBisyaroh($id, trim((string) ($row['lembaga_id'] ?? '')));

        $data = [
            'id' => (int) $row['id'],
            'lembaga_id' => trim((string) ($row['lembaga_id'] ?? '')),
            'lembaga_ids' => $lembagaIds,
            'nama' => $row['nama'] ?? null,
            'aktif' => !empty($row['aktif']),
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
            'akses' => [
                'aturan_kolom' => $this->canEditAturanKolom($user),
            ],
        ];

        return $this->json($response, [
            'success' => true,
            'data' => $data,
        ]);
    }

    public function create(Request $request, Response $response): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canEditAturanKolom($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses mengubah aturan ditolak'], 403);
        }
        $body = $request->getParsedBody();
        $body = is_array($body) ? $body : [];
        $nama = isset($body['nama']) ? trim((string) $body['nama']) : null;
        $lembagaIds = [];
        if (isset($body['lembaga_ids']) && is_array($body['lembaga_ids'])) {
            foreach ($body['lembaga_ids'] as $x) {
                $t = trim((string) $x);
                if ($t !== '') {
                    $lembagaIds[] = $t;
                }
            }
            $lembagaIds = array_values(array_unique($lembagaIds));
        }
        if ($lembagaIds === [] && isset($body['lembaga_id'])) {
            $t = trim((string) $body['lembaga_id']);
            if ($t !== '') {
                $lembagaIds[] = $t;
            }
        }
        if ($lembagaIds !== []) {
            foreach ($lembagaIds as $lid) {
                if (!$this->userMayAccessLembagaId($user, $lid)) {
                    return $this->json($response, ['success' => false, 'message' => 'Akses lembaga ditolak'], 403);
                }
            }
        } elseif (!$this->userMayManageUnlinkedBisyaroh($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Set tanpa lembaga hanya untuk admin dengan cakupan penuh'], 403);
        }
        if ($nama === null || $nama === '') {
            return $this->json($response, ['success' => false, 'message' => 'Nama set wajib diisi'], 400);
        }
        $primary = $lembagaIds[0] ?? null;
        $aktif = isset($body['aktif']) ? (int) (bool) $body['aktif'] : 1;
        $stmt = $this->db->prepare(
            'INSERT INTO `bisyaroh` (`lembaga_id`, `nama`, `aktif`) VALUES (?, ?, ?)'
        );
        $stmt->execute([$primary, $nama, $aktif]);
        $id = (int) $this->db->lastInsertId();
        try {
            $this->syncBisyarohLembagaRows($id, $lembagaIds);
        } catch (\Throwable $e) {
            $this->db->prepare('DELETE FROM `bisyaroh` WHERE `id` = ?')->execute([$id]);

            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan lembaga: ' . $e->getMessage()], 500);
        }

        return $this->json($response, [
            'success' => true,
            'message' => 'Set Bisyaroh dibuat',
            'data' => [
                'id' => $id,
                'lembaga_id' => $primary,
                'lembaga_ids' => $lembagaIds,
                'nama' => $nama,
                'aktif' => $aktif,
            ],
        ], 201);
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canEditAturanKolom($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses mengubah aturan ditolak'], 403);
        }
        $id = isset($args['id']) ? (int) $args['id'] : 0;
        if ($id <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
        }
        $ctx = $this->loadBisyarohRow($request, $response, $id, $user);
        if ($ctx === null) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak ditemukan atau akses ditolak'], 404);
        }
        $body = $request->getParsedBody();
        $body = is_array($body) ? $body : [];
        $nama = array_key_exists('nama', $body) ? trim((string) $body['nama']) : null;
        $aktif = array_key_exists('aktif', $body) ? (int) (bool) $body['aktif'] : null;
        $lembagaIdsNew = null;
        if (array_key_exists('lembaga_ids', $body) && is_array($body['lembaga_ids'])) {
            $lembagaIdsNew = [];
            foreach ($body['lembaga_ids'] as $x) {
                $t = trim((string) $x);
                if ($t !== '') {
                    $lembagaIdsNew[] = $t;
                }
            }
            $lembagaIdsNew = array_values(array_unique($lembagaIdsNew));
        }
        if ($aktif === null && !array_key_exists('nama', $body) && $lembagaIdsNew === null) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak ada field diubah'], 400);
        }
        $fields = [];
        $params = [];
        if (array_key_exists('nama', $body)) {
            $fields[] = '`nama` = ?';
            $params[] = $nama !== '' ? $nama : null;
        }
        if ($aktif !== null) {
            $fields[] = '`aktif` = ?';
            $params[] = $aktif;
        }
        if ($lembagaIdsNew !== null) {
            if ($lembagaIdsNew === [] && !$this->userMayManageUnlinkedBisyaroh($user)) {
                return $this->json($response, ['success' => false, 'message' => 'Mengosongkan lembaga hanya untuk admin dengan cakupan penuh'], 403);
            }
            foreach ($lembagaIdsNew as $lid) {
                if (!$this->userMayAccessLembagaId($user, $lid)) {
                    return $this->json($response, ['success' => false, 'message' => 'Akses salah satu lembaga ditolak'], 403);
                }
            }
            $fields[] = '`lembaga_id` = ?';
            $params[] = $lembagaIdsNew[0] ?? null;
        }
        if ($fields !== []) {
            $params[] = $id;
            $sql = 'UPDATE `bisyaroh` SET ' . implode(', ', $fields) . ' WHERE `id` = ?';
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
        }
        if ($lembagaIdsNew !== null) {
            try {
                $this->syncBisyarohLembagaRows($id, $lembagaIdsNew);
            } catch (\Throwable $e) {
                return $this->json($response, ['success' => false, 'message' => 'Gagal memperbarui lembaga: ' . $e->getMessage()], 500);
            }
        }

        return $this->json($response, ['success' => true, 'message' => 'Diperbarui']);
    }

    public function delete(Request $request, Response $response, array $args): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canEditAturanKolom($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses mengubah aturan ditolak'], 403);
        }
        $id = isset($args['id']) ? (int) $args['id'] : 0;
        if ($id <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
        }
        $ctx = $this->loadBisyarohRow($request, $response, $id, $user);
        if ($ctx === null) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak ditemukan atau akses ditolak'], 404);
        }
        $stmt = $this->db->prepare('DELETE FROM `bisyaroh` WHERE `id` = ?');
        $stmt->execute([$id]);

        return $this->json($response, ['success' => true, 'message' => 'Dihapus']);
    }

    public function listKolom(Request $request, Response $response, array $args): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canViewTabAturan($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses tab Aturan ditolak'], 403);
        }
        $id = isset($args['id']) ? (int) $args['id'] : 0;
        if ($id <= 0 || $this->loadBisyarohRow($request, $response, $id, $user) === null) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak ditemukan atau akses ditolak'], 404);
        }
        $rows = $this->loadKolomRowsSorted($id, false);

        return $this->json($response, [
            'success' => true,
            'data' => $rows,
            'pengurus_formula_fields' => BisyarohPengurusFormulaHelper::getFieldCatalog($this->db),
            'jabatan_formula_fields' => BisyarohPengurusFormulaHelper::getJabatanFieldCatalog($this->db),
            'pengurus_jabatan_formula_fields' => BisyarohPengurusFormulaHelper::getPjFieldCatalog($this->db),
        ]);
    }

    public function createKolom(Request $request, Response $response, array $args): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canEditAturanKolom($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses mengubah aturan ditolak'], 403);
        }
        $bid = isset($args['id']) ? (int) $args['id'] : 0;
        if ($this->loadBisyarohRow($request, $response, $bid, $user) === null) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak ditemukan atau akses ditolak'], 404);
        }
        $body = $request->getParsedBody();
        $body = is_array($body) ? $body : [];
        $colKey = isset($body['col_key']) ? trim((string) $body['col_key']) : '';
        if (!$this->isValidColKey($colKey)) {
            return $this->json($response, [
                'success' => false,
                'message' => 'col_key wajib huruf kecil/digit/underscore, diawali huruf (mis. hari, jam_masuk).',
            ], 400);
        }
        $kind = isset($body['kind']) && (string) $body['kind'] === 'formula' ? 'formula' : 'input';
        $label = isset($body['label']) ? trim((string) $body['label']) : '';
        if ($label === '') {
            return $this->json($response, ['success' => false, 'message' => 'label wajib'], 400);
        }
        $keterangan = isset($body['keterangan']) ? trim((string) $body['keterangan']) : null;
        $rumus = isset($body['rumus']) ? $this->normalizeRumusInput((string) $body['rumus']) : null;
        if ($kind === 'formula' && ($rumus === null || $rumus === '')) {
            return $this->json($response, ['success' => false, 'message' => 'Rumus wajib untuk kolom jenis rumus'], 400);
        }
        if ($kind === 'input') {
            $rumus = null;
        }
        $requestedInputTipe = isset($body['input_tipe']) ? trim((string) $body['input_tipe']) : 'angka';
        $inputTipe = BisyarohKolomComputation::normalizeInputTipe($kind, $requestedInputTipe);
        if ($kind === 'formula' && $requestedInputTipe === 'teks' && $inputTipe !== 'teks') {
            return $this->json($response, [
                'success' => false,
                'message' => 'Tipe Teks untuk kolom rumus membutuhkan API versi 2.12.37 atau lebih baru.',
            ], 400);
        }
        $defaultNilai = isset($body['default_nilai']) && $body['default_nilai'] !== ''
            ? trim((string) $body['default_nilai']) : null;
        $masukTotal = array_key_exists('masuk_total', $body) ? (int) (bool) $body['masuk_total'] : 1;
        if (($kind === 'input' || $kind === 'formula') && $inputTipe === 'teks') {
            $masukTotal = 0;
        }
        $sortOrder = isset($body['sort_order']) ? (int) $body['sort_order'] : 0;
        $aktif = isset($body['aktif']) ? (int) (bool) $body['aktif'] : 1;

        $newId = 0;
        try {
            $stmt = $this->db->prepare(
                'INSERT INTO `bisyaroh___kolom` (`bisyaroh_id`, `col_key`, `kind`, `label`, `keterangan`, `rumus`, `input_tipe`, `default_nilai`, `masuk_total`, `sort_order`, `aktif`)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $bid,
                $colKey,
                $kind,
                $label,
                $keterangan !== '' ? $keterangan : null,
                $rumus,
                $inputTipe,
                $defaultNilai,
                $masukTotal,
                $sortOrder,
                $aktif,
            ]);
            $newId = (int) $this->db->lastInsertId();
            $this->assertKolomGraphValid($bid);
        } catch (\PDOException $e) {
            if (str_contains($e->getMessage(), 'Duplicate')) {
                return $this->json($response, ['success' => false, 'message' => 'col_key sudah dipakai di set ini'], 400);
            }
            throw $e;
        } catch (\InvalidArgumentException $e) {
            if ($newId > 0) {
                $this->db->prepare('DELETE FROM `bisyaroh___kolom` WHERE `id` = ?')->execute([$newId]);
            }

            return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 400);
        }

        $saved = $this->fetchKolomRowById($bid, $newId);

        return $this->json($response, [
            'success' => true,
            'message' => 'Kolom ditambah',
            'data' => $saved ?? ['id' => $newId],
        ], 201);
    }

    public function reorderKolom(Request $request, Response $response, array $args): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canEditAturanKolom($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses mengubah aturan ditolak'], 403);
        }
        $bid = isset($args['id']) ? (int) $args['id'] : 0;
        if ($this->loadBisyarohRow($request, $response, $bid, $user) === null) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak ditemukan atau akses ditolak'], 404);
        }
        $body = $request->getParsedBody();
        $body = is_array($body) ? $body : [];
        $order = $body['order'] ?? null;
        if (!is_array($order) || $order === []) {
            return $this->json($response, ['success' => false, 'message' => 'order wajib berupa array id kolom'], 400);
        }
        $ids = [];
        foreach ($order as $rawId) {
            $id = (int) $rawId;
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID kolom tidak valid'], 400);
            }
            if (in_array($id, $ids, true)) {
                return $this->json($response, ['success' => false, 'message' => 'ID kolom duplikat dalam order'], 400);
            }
            $ids[] = $id;
        }
        $existing = $this->loadKolomRowsSorted($bid, false);
        $existingIds = array_map(static fn (array $r): int => (int) ($r['id'] ?? 0), $existing);
        sort($existingIds);
        $sortedReq = $ids;
        sort($sortedReq);
        if ($sortedReq !== $existingIds) {
            return $this->json($response, ['success' => false, 'message' => 'order harus memuat semua kolom set ini tepat sekali'], 400);
        }
        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare('UPDATE `bisyaroh___kolom` SET `sort_order` = ? WHERE `id` = ? AND `bisyaroh_id` = ?');
            foreach ($ids as $index => $kolomId) {
                $stmt->execute([($index + 1) * 10, $kolomId, $bid]);
            }
            $this->assertKolomGraphValid($bid);
            $this->db->commit();
        } catch (\InvalidArgumentException $e) {
            $this->db->rollBack();

            return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 400);
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        return $this->json($response, ['success' => true, 'message' => 'Urutan kolom diperbarui']);
    }

    public function updateKolom(Request $request, Response $response, array $args): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canEditAturanKolom($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses mengubah aturan ditolak'], 403);
        }
        $bid = isset($args['id']) ? (int) $args['id'] : 0;
        $kid = isset($args['kolomId']) ? (int) $args['kolomId'] : 0;
        if ($this->loadBisyarohRow($request, $response, $bid, $user) === null) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak ditemukan atau akses ditolak'], 404);
        }
        $stmt = $this->db->prepare('SELECT `id`, `kind` FROM `bisyaroh___kolom` WHERE `id` = ? AND `bisyaroh_id` = ? LIMIT 1');
        $stmt->execute([$kid, $bid]);
        $exist = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($exist === false) {
            return $this->json($response, ['success' => false, 'message' => 'Kolom tidak ditemukan'], 404);
        }
        $body = $request->getParsedBody();
        $body = is_array($body) ? $body : [];
        $fields = [];
        $params = [];
        if (array_key_exists('col_key', $body)) {
            $ck = trim((string) $body['col_key']);
            if (!$this->isValidColKey($ck)) {
                return $this->json($response, ['success' => false, 'message' => 'col_key tidak valid'], 400);
            }
            $fields[] = '`col_key` = ?';
            $params[] = $ck;
        }
        if (array_key_exists('kind', $body)) {
            $k = (string) $body['kind'] === 'formula' ? 'formula' : 'input';
            $fields[] = '`kind` = ?';
            $params[] = $k;
        }
        if (array_key_exists('label', $body)) {
            $fields[] = '`label` = ?';
            $params[] = trim((string) $body['label']) !== '' ? trim((string) $body['label']) : '';
        }
        if (array_key_exists('keterangan', $body)) {
            $kt = trim((string) $body['keterangan']);
            $fields[] = '`keterangan` = ?';
            $params[] = $kt !== '' ? $kt : null;
        }
        if (array_key_exists('rumus', $body)) {
            $fields[] = '`rumus` = ?';
            $params[] = $this->normalizeRumusInput((string) $body['rumus']);
        }
        if (array_key_exists('input_tipe', $body)) {
            $effectiveKind = array_key_exists('kind', $body)
                ? ((string) $body['kind'] === 'formula' ? 'formula' : 'input')
                : (string) ($exist['kind'] ?? 'input');
            $requestedInputTipe = trim((string) $body['input_tipe']);
            $it = BisyarohKolomComputation::normalizeInputTipe($effectiveKind, $requestedInputTipe);
            if ($effectiveKind === 'formula' && $requestedInputTipe === 'teks' && $it !== 'teks') {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Tipe Teks untuk kolom rumus membutuhkan API versi 2.12.37 atau lebih baru.',
                ], 400);
            }
            $fields[] = '`input_tipe` = ?';
            $params[] = $it;
            if ($effectiveKind === 'formula' && $it === 'teks' && !array_key_exists('masuk_total', $body)) {
                $fields[] = '`masuk_total` = ?';
                $params[] = 0;
            }
        }
        if (array_key_exists('default_nilai', $body)) {
            $dv = $body['default_nilai'];
            $fields[] = '`default_nilai` = ?';
            $params[] = ($dv === '' || $dv === null) ? null : trim((string) $dv);
        }
        if (array_key_exists('masuk_total', $body)) {
            $fields[] = '`masuk_total` = ?';
            $params[] = (int) (bool) $body['masuk_total'];
        }
        if (array_key_exists('sort_order', $body)) {
            $fields[] = '`sort_order` = ?';
            $params[] = (int) $body['sort_order'];
        }
        if (array_key_exists('aktif', $body)) {
            $fields[] = '`aktif` = ?';
            $params[] = (int) (bool) $body['aktif'];
        }
        if ($fields === []) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak ada field diubah'], 400);
        }
        $params[] = $kid;
        $sql = 'UPDATE `bisyaroh___kolom` SET ' . implode(', ', $fields) . ' WHERE `id` = ?';
        try {
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $this->assertKolomGraphValid($bid);
        } catch (\PDOException $e) {
            if (str_contains($e->getMessage(), 'Duplicate')) {
                return $this->json($response, ['success' => false, 'message' => 'col_key bentrok'], 400);
            }
            throw $e;
        } catch (\InvalidArgumentException $e) {
            return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 400);
        }

        $saved = $this->fetchKolomRowById($bid, $kid);

        return $this->json($response, [
            'success' => true,
            'message' => 'Kolom diperbarui',
            'data' => $saved,
        ]);
    }

    public function deleteKolom(Request $request, Response $response, array $args): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canEditAturanKolom($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses mengubah aturan ditolak'], 403);
        }
        $bid = isset($args['id']) ? (int) $args['id'] : 0;
        $kid = isset($args['kolomId']) ? (int) $args['kolomId'] : 0;
        if ($this->loadBisyarohRow($request, $response, $bid, $user) === null) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak ditemukan atau akses ditolak'], 404);
        }
        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare('DELETE FROM `bisyaroh___kolom` WHERE `id` = ? AND `bisyaroh_id` = ?');
            $stmt->execute([$kid, $bid]);
            $this->assertKolomGraphValid($bid);
            $this->db->commit();
        } catch (\InvalidArgumentException $e) {
            $this->db->rollBack();

            return $this->json($response, [
                'success' => false,
                'message' => 'Tidak bisa menghapus: rumus kolom lain masih bergantung atau set tidak valid. Ubah rumus dulu. (' . $e->getMessage() . ')',
            ], 400);
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        return $this->json($response, ['success' => true, 'message' => 'Kolom dihapus']);
    }

    public function listAturan(Request $request, Response $response, array $args): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canViewTabAturan($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses tab Aturan ditolak'], 403);
        }
        $id = isset($args['id']) ? (int) $args['id'] : 0;
        if ($id <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
        }
        if ($this->loadBisyarohRow($request, $response, $id, $user) === null) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak ditemukan atau akses ditolak'], 404);
        }
        $stmt = $this->db->prepare(
            'SELECT a.`id`, a.`bisyaroh_id`, a.`rule_key`, a.`judul`, a.`id_pengurus`, a.`value_json`, a.`sort_order`, a.`aktif`, a.`created_at`, a.`updated_at`,
                    p.`nama` AS `pengurus_nama`
             FROM `bisyaroh___aturan` a
             LEFT JOIN `pengurus` p ON p.`id` = a.`id_pengurus`
             WHERE a.`bisyaroh_id` = ?
             ORDER BY a.`sort_order` ASC, a.`id` ASC'
        );
        $stmt->execute([$id]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$r) {
            if (!empty($r['value_json'])) {
                $decoded = json_decode((string) $r['value_json'], true);
                $r['value'] = is_array($decoded) ? $decoded : null;
            } else {
                $r['value'] = null;
            }
            unset($r['value_json']);
        }
        unset($r);

        return $this->json($response, ['success' => true, 'data' => $rows]);
    }

    public function createAturan(Request $request, Response $response, array $args): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canEditAturanKolom($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses mengubah aturan ditolak'], 403);
        }
        $bid = isset($args['id']) ? (int) $args['id'] : 0;
        if ($this->loadBisyarohRow($request, $response, $bid, $user) === null) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak ditemukan atau akses ditolak'], 404);
        }
        $body = $request->getParsedBody();
        $body = is_array($body) ? $body : [];
        $ruleKey = isset($body['rule_key']) ? trim((string) $body['rule_key']) : '';
        if ($ruleKey === '') {
            return $this->json($response, ['success' => false, 'message' => 'rule_key wajib'], 400);
        }
        $judul = isset($body['judul']) ? trim((string) $body['judul']) : null;
        $idPengurus = isset($body['id_pengurus']) && $body['id_pengurus'] !== '' && $body['id_pengurus'] !== null
            ? (int) $body['id_pengurus'] : null;
        $value = $body['value'] ?? null;
        $valueJson = null;
        if ($value !== null) {
            $valueJson = json_encode($value, JSON_UNESCAPED_UNICODE);
        }
        $sortOrder = isset($body['sort_order']) ? (int) $body['sort_order'] : 0;
        $aktif = isset($body['aktif']) ? (int) (bool) $body['aktif'] : 1;

        $stmt = $this->db->prepare(
            'INSERT INTO `bisyaroh___aturan` (`bisyaroh_id`, `rule_key`, `judul`, `id_pengurus`, `value_json`, `sort_order`, `aktif`)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$bid, $ruleKey, $judul !== '' ? $judul : null, $idPengurus, $valueJson, $sortOrder, $aktif]);
        $newId = (int) $this->db->lastInsertId();

        return $this->json($response, ['success' => true, 'message' => 'Aturan ditambah', 'data' => ['id' => $newId]], 201);
    }

    public function updateAturan(Request $request, Response $response, array $args): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canEditAturanKolom($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses mengubah aturan ditolak'], 403);
        }
        $bid = isset($args['id']) ? (int) $args['id'] : 0;
        $aid = isset($args['aturanId']) ? (int) $args['aturanId'] : 0;
        if ($this->loadBisyarohRow($request, $response, $bid, $user) === null) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak ditemukan atau akses ditolak'], 404);
        }
        $stmt = $this->db->prepare('SELECT `id` FROM `bisyaroh___aturan` WHERE `id` = ? AND `bisyaroh_id` = ? LIMIT 1');
        $stmt->execute([$aid, $bid]);
        if ($stmt->fetch(PDO::FETCH_ASSOC) === false) {
            return $this->json($response, ['success' => false, 'message' => 'Aturan tidak ditemukan'], 404);
        }
        $body = $request->getParsedBody();
        $body = is_array($body) ? $body : [];
        $fields = [];
        $params = [];
        if (array_key_exists('rule_key', $body)) {
            $rk = trim((string) $body['rule_key']);
            if ($rk === '') {
                return $this->json($response, ['success' => false, 'message' => 'rule_key tidak boleh kosong'], 400);
            }
            $fields[] = '`rule_key` = ?';
            $params[] = $rk;
        }
        if (array_key_exists('judul', $body)) {
            $fields[] = '`judul` = ?';
            $params[] = trim((string) $body['judul']) !== '' ? trim((string) $body['judul']) : null;
        }
        if (array_key_exists('id_pengurus', $body)) {
            $fields[] = '`id_pengurus` = ?';
            $v = $body['id_pengurus'];
            $params[] = ($v === '' || $v === null) ? null : (int) $v;
        }
        if (array_key_exists('value', $body)) {
            $fields[] = '`value_json` = ?';
            $params[] = json_encode($body['value'], JSON_UNESCAPED_UNICODE);
        }
        if (array_key_exists('sort_order', $body)) {
            $fields[] = '`sort_order` = ?';
            $params[] = (int) $body['sort_order'];
        }
        if (array_key_exists('aktif', $body)) {
            $fields[] = '`aktif` = ?';
            $params[] = (int) (bool) $body['aktif'];
        }
        if ($fields === []) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak ada field diubah'], 400);
        }
        $params[] = $aid;
        $sql = 'UPDATE `bisyaroh___aturan` SET ' . implode(', ', $fields) . ' WHERE `id` = ?';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);

        return $this->json($response, ['success' => true, 'message' => 'Aturan diperbarui']);
    }

    public function deleteAturan(Request $request, Response $response, array $args): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canEditAturanKolom($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses mengubah aturan ditolak'], 403);
        }
        $bid = isset($args['id']) ? (int) $args['id'] : 0;
        $aid = isset($args['aturanId']) ? (int) $args['aturanId'] : 0;
        if ($this->loadBisyarohRow($request, $response, $bid, $user) === null) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak ditemukan atau akses ditolak'], 404);
        }
        $stmt = $this->db->prepare('DELETE FROM `bisyaroh___aturan` WHERE `id` = ? AND `bisyaroh_id` = ?');
        $stmt->execute([$aid, $bid]);

        return $this->json($response, ['success' => true, 'message' => 'Aturan dihapus']);
    }

    /**
     * POST /api/bisyaroh/{id}/rekap/preview — hitung rumus + total tanpa menyimpan (body: { inputs }).
     */
    public function previewRekapRow(Request $request, Response $response, array $args): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canViewTabRekap($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses tab Rekap ditolak'], 403);
        }
        $bid = isset($args['id']) ? (int) $args['id'] : 0;
        if ($this->loadBisyarohRow($request, $response, $bid, $user, true) === null) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak ditemukan atau akses ditolak'], 404);
        }
        $body = $request->getParsedBody();
        $body = is_array($body) ? $body : [];
        $inputs = $body['inputs'] ?? [];
        if (!is_array($inputs)) {
            $inputs = [];
        }
        $idPengurusPreview = isset($body['id_pengurus']) ? (int) $body['id_pengurus'] : 0;
        $previewLembagaIds = $this->resolveFormulaLembagaIdsForRekap($bid, $idPengurusPreview, $this->parseLembagaIdsFromBody($body));
        $fCtx = $this->loadFormulaContextForPengurus($idPengurusPreview, $previewLembagaIds);
        $kolomDef = $this->loadKolomRowsSorted($bid, true);
        $calc = BisyarohKolomComputation::computeRow($kolomDef, $inputs, $fCtx);

        return $this->json($response, [
            'success' => true,
            'data' => [
                'computed' => $calc['computed'],
                'cells' => $calc['cells'],
                'total_nominal' => $calc['total_nominal'],
            ],
        ]);
    }

    public function listRekap(Request $request, Response $response, array $args): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canViewTabRekap($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses tab Rekap ditolak'], 403);
        }
        $bid = isset($args['id']) ? (int) $args['id'] : 0;
        $ctx = $bid > 0 ? $this->loadBisyarohRow($request, $response, $bid, $user, true) : null;
        if ($ctx === null) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak ditemukan atau akses ditolak'], 404);
        }
        $q = $request->getQueryParams();
        $selectedLembagaIds = $this->parseLembagaIdsFromQuery($q);
        if ($selectedLembagaIds !== null) {
            foreach ($selectedLembagaIds as $lid) {
                if (!$this->userMayAccessLembagaForRekap($user, $lid)) {
                    return $this->json($response, ['success' => false, 'message' => 'Akses rekap: lembaga di luar cakupan peran Anda'], 403);
                }
            }
        }
        $setLembagaIds = $ctx['lembaga_ids'] ?? $this->getLembagaIdsForBisyaroh($bid, $ctx['lembaga_id']);
        $lembagaIdsForPengurus = $this->resolveRekapPengurusLembagaIds($setLembagaIds, $selectedLembagaIds);
        $periode = isset($q['periode_bulan']) ? trim((string) $q['periode_bulan']) : '';
        if ($periode === '' || !preg_match('/^\d{4}-\d{2}$/', $periode)) {
            return $this->json($response, ['success' => false, 'message' => 'periode_bulan wajib (YYYY-MM)'], 400);
        }

        $kolomDef = $this->loadKolomRowsSorted($bid, true);
        $kolomHeader = [];
        foreach ($kolomDef as $c) {
            $kolomHeader[] = [
                'col_key' => $c['col_key'],
                'label' => $c['label'],
                'keterangan' => $c['keterangan'] ?? '',
                'kind' => $c['kind'],
                'input_tipe' => $c['input_tipe'] ?? 'angka',
                'masuk_total' => !empty($c['masuk_total']),
                'rumus' => $c['kind'] === 'formula' ? ($c['rumus'] ?? '') : null,
            ];
        }

        $kalender = $this->normalizeRekapKalender($q['kalender'] ?? null);
        $saved = [];
        try {
            if (!$this->rekapBarisHasKalenderColumn()) {
                if ($kalender === 'hijriyah') {
                    return $this->json($response, [
                        'success' => false,
                        'message' => 'Rekap Hijriyah membutuhkan migrasi database (kolom kalender). Jalankan migrasi Phinx untuk modul Bisyaroh.',
                    ], 503);
                }
                $stmt = $this->db->prepare(
                    'SELECT r.`id`, r.`id_pengurus`, r.`nilai_json`, r.`catatan`, r.`transfer_status`
                     FROM `bisyaroh___rekap_baris` r
                     WHERE r.`bisyaroh_id` = ? AND r.`periode_bulan` = ?'
                );
                $stmt->execute([$bid, $periode]);
            } else {
                $stmt = $this->db->prepare(
                    'SELECT r.`id`, r.`id_pengurus`, r.`nilai_json`, r.`catatan`, r.`transfer_status`
                     FROM `bisyaroh___rekap_baris` r
                     WHERE r.`bisyaroh_id` = ? AND r.`periode_bulan` = ? AND r.`kalender` = ?'
                );
                $stmt->execute([$bid, $periode, $kalender]);
            }
            $saved = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (\PDOException $e) {
            $msg = $e->getMessage();
            if (
                str_contains($msg, 'kalender')
                && (str_contains($msg, 'Unknown column') || $e->getCode() === '42S22')
            ) {
                $this->setRekapKalenderColumnDetected(false);
                if ($kalender === 'hijriyah') {
                    return $this->json($response, [
                        'success' => false,
                        'message' => 'Rekap Hijriyah membutuhkan migrasi database (kolom kalender). Jalankan migrasi Phinx untuk modul Bisyaroh.',
                    ], 503);
                }
                $stmt = $this->db->prepare(
                    'SELECT r.`id`, r.`id_pengurus`, r.`nilai_json`, r.`catatan`, r.`transfer_status`
                     FROM `bisyaroh___rekap_baris` r
                     WHERE r.`bisyaroh_id` = ? AND r.`periode_bulan` = ?'
                );
                $stmt->execute([$bid, $periode]);
                $saved = $stmt->fetchAll(PDO::FETCH_ASSOC);
            } else {
                throw $e;
            }
        }
        $byPid = [];
        foreach (is_array($saved) ? $saved : [] as $s) {
            $byPid[(int) $s['id_pengurus']] = $s;
        }

        if ($lembagaIdsForPengurus === []) {
            return $this->json($response, [
                'success' => true,
                'data' => [
                    'kolom' => $kolomHeader,
                    'rows' => [],
                ],
            ]);
        }

        $pengurus = $this->loadPengurusForLembagaIds($lembagaIdsForPengurus);
        /** @var array<string, array{pengurus: array<string, string>, jabatan: array<string, string>, pj: array<string, string>}> $fctxCache */
        $fctxCache = [];
        $outRows = [];
        foreach ($pengurus as $p) {
            $pid = (int) $p['id'];
            $nilai = null;
            if (isset($byPid[$pid])) {
                $raw = $byPid[$pid]['nilai_json'] ?? null;
                $nilai = is_string($raw) ? json_decode($raw, true) : null;
                if (!is_array($nilai)) {
                    $nilai = null;
                }
            }
            $inputs = $this->extractInputsFromNilaiJson($nilai);
            $fctxKey = $this->formulaContextCacheKey($pid, $lembagaIdsForPengurus);
            if (!isset($fctxCache[$fctxKey])) {
                $fctxCache[$fctxKey] = $this->loadFormulaContextForPengurus($pid, $lembagaIdsForPengurus);
            }
            $rawNilai = isset($byPid[$pid]['nilai_json']) ? $byPid[$pid]['nilai_json'] : null;
            $calc = BisyarohRekapSnapshotHelper::resolveCalc($kolomDef, $inputs, $fctxCache[$fctxKey], $rawNilai);
            $outRows[] = [
                'id' => isset($byPid[$pid]['id']) ? (int) $byPid[$pid]['id'] : null,
                'id_pengurus' => $pid,
                'bisyaroh_id' => $bid,
                'pengurus_nama' => $p['nama'] ?? '',
                'nip' => $p['nip'] ?? null,
                'rekening_jatim' => isset($p['rekening_jatim']) ? (string) $p['rekening_jatim'] : '',
                'catatan' => isset($byPid[$pid]['catatan']) ? (string) $byPid[$pid]['catatan'] : '',
                'transfer_status' => isset($byPid[$pid]['transfer_status']) ? $byPid[$pid]['transfer_status'] : null,
                'inputs' => $inputs,
                'computed' => $calc['computed'],
                'cells' => $calc['cells'],
                'total_nominal' => $calc['total_nominal'],
                'frozen' => BisyarohRekapSnapshotHelper::hasSnapshot($rawNilai),
            ];
        }
        $outRows = $this->attachPotongUwabaToRekapRows($outRows);

        return $this->json($response, [
            'success' => true,
            'data' => [
                'kolom' => $kolomHeader,
                'rows' => $outRows,
            ],
        ]);
    }

    /**
     * GET /api/bisyaroh/rekap/multi?bisyaroh_ids=1,2&periode_bulan=YYYY-MM&kalender=masehi
     */
    public function listRekapMulti(Request $request, Response $response): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canViewTabRekap($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses tab Rekap ditolak'], 403);
        }
        $q = $request->getQueryParams();
        $idsRaw = isset($q['bisyaroh_ids']) ? trim((string) $q['bisyaroh_ids']) : '';
        $bidList = [];
        foreach (explode(',', $idsRaw) as $p) {
            $n = (int) trim($p);
            if ($n > 0) {
                $bidList[] = $n;
            }
        }
        $bidList = array_values(array_unique($bidList));
        if ($bidList === []) {
            return $this->json($response, ['success' => false, 'message' => 'bisyaroh_ids wajib (pisah koma)'], 400);
        }
        if (count($bidList) > 12) {
            return $this->json($response, ['success' => false, 'message' => 'Maksimal 12 set per permintaan'], 400);
        }
        $periode = isset($q['periode_bulan']) ? trim((string) $q['periode_bulan']) : '';
        if ($periode === '' || !preg_match('/^\d{4}-\d{2}$/', $periode)) {
            return $this->json($response, ['success' => false, 'message' => 'periode_bulan wajib (YYYY-MM)'], 400);
        }
        $kalender = $this->normalizeRekapKalender($q['kalender'] ?? null);
        $selectedLembagaIds = $this->parseLembagaIdsFromQuery($q);
        if ($selectedLembagaIds !== null) {
            foreach ($selectedLembagaIds as $lid) {
                if (!$this->userMayAccessLembagaForRekap($user, $lid)) {
                    return $this->json($response, ['success' => false, 'message' => 'Akses rekap: lembaga di luar cakupan peran Anda'], 403);
                }
            }
        }

        if (!$this->rekapBarisHasKalenderColumn() && $kalender === 'hijriyah') {
            return $this->json($response, [
                'success' => false,
                'message' => 'Rekap Hijriyah membutuhkan migrasi database (kolom kalender). Jalankan migrasi Phinx untuk modul Bisyaroh.',
            ], 503);
        }

        $sections = [];
        $grand = 0.0;
        foreach ($bidList as $bid) {
            $ctx = $this->loadBisyarohRow($request, $response, $bid, $user, true);
            if ($ctx === null) {
                return $this->json($response, ['success' => false, 'message' => 'Set #' . $bid . ' tidak ditemukan atau akses ditolak'], 404);
            }
            try {
                $setLembagaIds = $ctx['lembaga_ids'] ?? $this->getLembagaIdsForBisyaroh($bid, $ctx['lembaga_id']);
                $effectiveLembagaIds = $this->resolveRekapPengurusLembagaIds($setLembagaIds, $selectedLembagaIds);
                $snapshot = $this->buildRekapSnapshotForBisyaroh($bid, $periode, $kalender, $effectiveLembagaIds);
            } catch (\InvalidArgumentException $e) {
                return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 400);
            }
            $sub = 0.0;
            foreach ($snapshot['rows'] as $r) {
                $sub += (float) ($r['total_nominal'] ?? 0);
            }
            $grand += $sub;
            $sections[] = [
                'bisyaroh_id' => $bid,
                'bisyaroh_nama' => $ctx['nama'] ?? null,
                'kolom' => $snapshot['kolom'],
                'rows' => $snapshot['rows'],
                'subtotal_nominal' => round($sub, 2),
            ];
        }

        return $this->json($response, [
            'success' => true,
            'data' => [
                'periode_bulan' => $periode,
                'kalender' => $kalender,
                'sections' => $sections,
                'grand_total_nominal' => round($grand, 2),
            ],
        ]);
    }

    /**
     * @return array{kolom: list<array<string, mixed>>, rows: list<array<string, mixed>>}
     */
    private function buildRekapSnapshotForBisyaroh(int $bid, string $periode, string $kalender, array $lembagaIdsForPengurus): array
    {
        $kolomDef = $this->loadKolomRowsSorted($bid, true);
        $kolomHeader = [];
        foreach ($kolomDef as $c) {
            $kolomHeader[] = [
                'col_key' => $c['col_key'],
                'label' => $c['label'],
                'keterangan' => $c['keterangan'] ?? '',
                'kind' => $c['kind'],
                'input_tipe' => $c['input_tipe'] ?? 'angka',
                'masuk_total' => !empty($c['masuk_total']),
                'rumus' => $c['kind'] === 'formula' ? ($c['rumus'] ?? '') : null,
            ];
        }

        $saved = [];
        try {
            if (!$this->rekapBarisHasKalenderColumn()) {
                if ($kalender === 'hijriyah') {
                    throw new \InvalidArgumentException(
                        'Rekap Hijriyah membutuhkan migrasi database (kolom kalender). Jalankan migrasi Phinx untuk modul Bisyaroh.'
                    );
                }
                $stmt = $this->db->prepare(
                    'SELECT r.`id`, r.`id_pengurus`, r.`nilai_json`, r.`catatan`, r.`transfer_status`
                     FROM `bisyaroh___rekap_baris` r
                     WHERE r.`bisyaroh_id` = ? AND r.`periode_bulan` = ?'
                );
                $stmt->execute([$bid, $periode]);
            } else {
                $stmt = $this->db->prepare(
                    'SELECT r.`id`, r.`id_pengurus`, r.`nilai_json`, r.`catatan`, r.`transfer_status`
                     FROM `bisyaroh___rekap_baris` r
                     WHERE r.`bisyaroh_id` = ? AND r.`periode_bulan` = ? AND r.`kalender` = ?'
                );
                $stmt->execute([$bid, $periode, $kalender]);
            }
            $saved = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (\PDOException $e) {
            $msg = $e->getMessage();
            if (
                str_contains($msg, 'kalender')
                && (str_contains($msg, 'Unknown column') || $e->getCode() === '42S22')
            ) {
                $this->setRekapKalenderColumnDetected(false);
                if ($kalender === 'hijriyah') {
                    throw new \InvalidArgumentException(
                        'Rekap Hijriyah membutuhkan migrasi database (kolom kalender). Jalankan migrasi Phinx untuk modul Bisyaroh.'
                    );
                }
                $stmt = $this->db->prepare(
                    'SELECT r.`id`, r.`id_pengurus`, r.`nilai_json`, r.`catatan`, r.`transfer_status`
                     FROM `bisyaroh___rekap_baris` r
                     WHERE r.`bisyaroh_id` = ? AND r.`periode_bulan` = ?'
                );
                $stmt->execute([$bid, $periode]);
                $saved = $stmt->fetchAll(PDO::FETCH_ASSOC);
            } else {
                throw $e;
            }
        }
        $byPid = [];
        foreach (is_array($saved) ? $saved : [] as $s) {
            $byPid[(int) $s['id_pengurus']] = $s;
        }

        if ($lembagaIdsForPengurus === []) {
            return [
                'kolom' => $kolomHeader,
                'rows' => [],
            ];
        }

        $pengurus = $this->loadPengurusForLembagaIds($lembagaIdsForPengurus);
        /** @var array<string, array{pengurus: array<string, string>, jabatan: array<string, string>, pj: array<string, string>}> $fctxCache */
        $fctxCache = [];
        $outRows = [];
        foreach ($pengurus as $p) {
            $pid = (int) $p['id'];
            $nilai = null;
            if (isset($byPid[$pid])) {
                $raw = $byPid[$pid]['nilai_json'] ?? null;
                $nilai = is_string($raw) ? json_decode($raw, true) : null;
                if (!is_array($nilai)) {
                    $nilai = null;
                }
            }
            $inputs = $this->extractInputsFromNilaiJson($nilai);
            $fctxKey = $this->formulaContextCacheKey($pid, $lembagaIdsForPengurus);
            if (!isset($fctxCache[$fctxKey])) {
                $fctxCache[$fctxKey] = $this->loadFormulaContextForPengurus($pid, $lembagaIdsForPengurus);
            }
            $rawNilai = isset($byPid[$pid]['nilai_json']) ? $byPid[$pid]['nilai_json'] : null;
            $calc = BisyarohRekapSnapshotHelper::resolveCalc($kolomDef, $inputs, $fctxCache[$fctxKey], $rawNilai);
            $outRows[] = [
                'id' => isset($byPid[$pid]['id']) ? (int) $byPid[$pid]['id'] : null,
                'id_pengurus' => $pid,
                'bisyaroh_id' => $bid,
                'pengurus_nama' => $p['nama'] ?? '',
                'nip' => $p['nip'] ?? null,
                'rekening_jatim' => isset($p['rekening_jatim']) ? (string) $p['rekening_jatim'] : '',
                'catatan' => isset($byPid[$pid]['catatan']) ? (string) $byPid[$pid]['catatan'] : '',
                'transfer_status' => isset($byPid[$pid]['transfer_status']) ? $byPid[$pid]['transfer_status'] : null,
                'inputs' => $inputs,
                'computed' => $calc['computed'],
                'cells' => $calc['cells'],
                'total_nominal' => $calc['total_nominal'],
                'frozen' => BisyarohRekapSnapshotHelper::hasSnapshot($rawNilai),
            ];
        }
        $outRows = $this->attachPotongUwabaToRekapRows($outRows);

        return ['kolom' => $kolomHeader, 'rows' => $outRows];
    }

    /** @return 'masehi'|'hijriyah' */
    private function normalizeRekapKalender(?string $raw): string
    {
        $k = strtolower(trim((string) ($raw ?? '')));

        return ($k === 'hijriyah' || $k === 'hijri') ? 'hijriyah' : 'masehi';
    }

    /**
     * Normalisasi inputs dari body upsert tunggal (dukung legacy nilai.inputs).
     *
     * @param array<string, mixed> $body
     * @return array<string, mixed>
     */
    private function normalizeRekapInputsFromBody(array $body): array
    {
        $inputs = $body['inputs'] ?? null;
        if (!is_array($inputs)) {
            $legacy = $body['nilai'] ?? null;
            if (is_array($legacy) && isset($legacy['inputs']) && is_array($legacy['inputs'])) {
                $inputs = $legacy['inputs'];
            } else {
                $inputs = [];
            }
        }

        return $inputs;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function fetchExistingRekapNilaiDecoded(int $bid, int $idPengurus, string $periode, string $kalender): ?array
    {
        try {
            if ($this->rekapBarisHasKalenderColumn()) {
                $stmt = $this->db->prepare(
                    'SELECT `nilai_json` FROM `bisyaroh___rekap_baris`
                     WHERE `bisyaroh_id` = ? AND `id_pengurus` = ? AND `periode_bulan` = ? AND `kalender` = ?
                     LIMIT 1'
                );
                $stmt->execute([$bid, $idPengurus, $periode, $kalender]);
            } else {
                $stmt = $this->db->prepare(
                    'SELECT `nilai_json` FROM `bisyaroh___rekap_baris`
                     WHERE `bisyaroh_id` = ? AND `id_pengurus` = ? AND `periode_bulan` = ?
                     LIMIT 1'
                );
                $stmt->execute([$bid, $idPengurus, $periode]);
            }
            $raw = $stmt->fetchColumn();
            if ($raw === false || $raw === null || $raw === '') {
                return null;
            }
            $dec = BisyarohRekapSnapshotHelper::decodeNilaiJson($raw);

            return $dec !== [] ? $dec : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Hitung rumus, simpan satu baris rekap (tanpa transaksi).
     *
     * @param list<array<string, mixed>> $kolomDef
     * @return array{computed: mixed, cells: mixed, total_nominal: float|int}
     */
    private function computeAndPersistRekapRow(
        array $kolomDef,
        int $bid,
        string $periode,
        string $kalender,
        int $idPengurus,
        array $inputs,
        ?string $catatan,
        ?int $actorPengurusId = null,
        ?array $formulaLembagaIds = null
    ): array {
        $lembagaMaster = $this->fetchPengurusMasterLembagaId($idPengurus);
        if ($lembagaMaster !== '') {
            $this->assertRekapNotLockedForSave($bid, $lembagaMaster, $periode, $kalender);
        }
        $scopeIds = $this->resolveFormulaLembagaIdsForRekap($bid, $idPengurus, $formulaLembagaIds);
        $fCtx = $this->loadFormulaContextForPengurus($idPengurus, $scopeIds);
        $calc = BisyarohKolomComputation::computeRow($kolomDef, $inputs, $fCtx);
        $existingDecoded = $this->fetchExistingRekapNilaiDecoded($bid, $idPengurus, $periode, $kalender);
        $toStore = BisyarohRekapSnapshotHelper::buildSavePayload($inputs, $calc, $existingDecoded);
        $nilaiJson = json_encode($toStore, JSON_UNESCAPED_UNICODE);
        $catatanDb = $catatan !== null && $catatan !== '' ? $catatan : null;

        $sqlLegacy = <<<'SQL'
INSERT INTO `bisyaroh___rekap_baris` (`bisyaroh_id`, `id_pengurus`, `periode_bulan`, `nilai_json`, `catatan`)
VALUES (?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  `nilai_json` = VALUES(`nilai_json`),
  `catatan` = VALUES(`catatan`),
  `updated_at` = CURRENT_TIMESTAMP
SQL;
        $sqlKalender = <<<'SQL'
INSERT INTO `bisyaroh___rekap_baris` (`bisyaroh_id`, `id_pengurus`, `periode_bulan`, `kalender`, `nilai_json`, `catatan`)
VALUES (?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  `nilai_json` = VALUES(`nilai_json`),
  `catatan` = VALUES(`catatan`),
  `updated_at` = CURRENT_TIMESTAMP
SQL;

        if (!$this->rekapBarisHasKalenderColumn()) {
            if ($kalender !== 'masehi') {
                throw new \InvalidArgumentException(
                    'Simpan rekap Hijriyah membutuhkan migrasi database (kolom kalender). Jalankan migrasi Phinx untuk modul Bisyaroh.'
                );
            }
            $stmt = $this->db->prepare($sqlLegacy);
            $stmt->execute([$bid, $idPengurus, $periode, $nilaiJson, $catatanDb]);
        } else {
            try {
                $stmt = $this->db->prepare($sqlKalender);
                $stmt->execute([$bid, $idPengurus, $periode, $kalender, $nilaiJson, $catatanDb]);
            } catch (\PDOException $e) {
                $msg = $e->getMessage();
                $unknownCol = str_contains($msg, 'Unknown column') || (string) $e->getCode() === '42S22';
                if (!$unknownCol || !str_contains($msg, 'kalender')) {
                    throw $e;
                }
                $this->setRekapKalenderColumnDetected(false);
                if ($kalender !== 'masehi') {
                    throw new \InvalidArgumentException(
                        'Simpan rekap Hijriyah membutuhkan migrasi database (kolom kalender). Jalankan migrasi Phinx untuk modul Bisyaroh.'
                    );
                }
                $stmt = $this->db->prepare($sqlLegacy);
                $stmt->execute([$bid, $idPengurus, $periode, $nilaiJson, $catatanDb]);
            }
        }

        if ($lembagaMaster !== '') {
            $this->touchRekapStatusAfterDataSave($bid, $lembagaMaster, $periode, $kalender, $actorPengurusId);
        }

        return [
            'computed' => $calc['computed'],
            'cells' => $calc['cells'],
            'total_nominal' => $calc['total_nominal'],
        ];
    }

    public function upsertRekap(Request $request, Response $response, array $args): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canEditTabRekap($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses mengubah rekap ditolak'], 403);
        }
        $bid = isset($args['id']) ? (int) $args['id'] : 0;
        if ($this->loadBisyarohRow($request, $response, $bid, $user, true) === null) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak ditemukan atau akses ditolak'], 404);
        }
        $body = $request->getParsedBody();
        $body = is_array($body) ? $body : [];
        $idPengurus = isset($body['id_pengurus']) ? (int) $body['id_pengurus'] : 0;
        $periode = isset($body['periode_bulan']) ? trim((string) $body['periode_bulan']) : '';
        if ($idPengurus <= 0 || $periode === '' || !preg_match('/^\d{4}-\d{2}$/', $periode)) {
            return $this->json($response, ['success' => false, 'message' => 'id_pengurus dan periode_bulan (YYYY-MM) wajib'], 400);
        }

        $inputs = $this->normalizeRekapInputsFromBody($body);
        $catatan = isset($body['catatan']) ? trim((string) $body['catatan']) : null;
        $kalender = $this->normalizeRekapKalender($body['kalender'] ?? null);

        $kolomDef = $this->loadKolomRowsSorted($bid, true);
        $actorPid = RoleHelper::getPengurusIdFromPayload($user);
        $formulaLembagaIds = $this->parseLembagaIdsFromBody($body);
        try {
            $calc = $this->computeAndPersistRekapRow(
                $kolomDef,
                $bid,
                $periode,
                $kalender,
                $idPengurus,
                $inputs,
                $catatan,
                $actorPid,
                $formulaLembagaIds
            );
        } catch (\Throwable $e) {
            return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 400);
        }

        return $this->json($response, [
            'success' => true,
            'message' => 'Rekap disimpan',
            'data' => [
                'computed' => $calc['computed'],
                'cells' => $calc['cells'],
                'total_nominal' => $calc['total_nominal'],
            ],
        ]);
    }

    /**
     * POST /api/bisyaroh/{id}/rekap/bulk — simpan banyak baris sekaligus (satu transaksi).
     * Body: { periode_bulan, rows: [ { id_pengurus, inputs?, catatan? }, ... ] }
     */
    public function upsertRekapBulk(Request $request, Response $response, array $args): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canEditTabRekap($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses mengubah rekap ditolak'], 403);
        }
        $bid = isset($args['id']) ? (int) $args['id'] : 0;
        if ($this->loadBisyarohRow($request, $response, $bid, $user, true) === null) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak ditemukan atau akses ditolak'], 404);
        }
        $body = $request->getParsedBody();
        $body = is_array($body) ? $body : [];
        $periode = isset($body['periode_bulan']) ? trim((string) $body['periode_bulan']) : '';
        if ($periode === '' || !preg_match('/^\d{4}-\d{2}$/', $periode)) {
            return $this->json($response, ['success' => false, 'message' => 'periode_bulan wajib (YYYY-MM)'], 400);
        }
        $rows = $body['rows'] ?? null;
        if (!is_array($rows)) {
            return $this->json($response, ['success' => false, 'message' => 'rows wajib berupa array'], 400);
        }
        $kalender = $this->normalizeRekapKalender($body['kalender'] ?? null);

        $kolomDef = $this->loadKolomRowsSorted($bid, true);
        $actorPid = RoleHelper::getPengurusIdFromPayload($user);
        $formulaLembagaIds = $this->parseLembagaIdsFromBody($body);
        $n = 0;
        $this->db->beginTransaction();
        try {
            foreach ($rows as $i => $row) {
                if (!is_array($row)) {
                    throw new \InvalidArgumentException('Setiap baris rows harus berupa objek');
                }
                $idPengurus = isset($row['id_pengurus']) ? (int) $row['id_pengurus'] : 0;
                if ($idPengurus <= 0) {
                    throw new \InvalidArgumentException('Baris #' . ($i + 1) . ': id_pengurus tidak valid');
                }
                $inputs = $row['inputs'] ?? [];
                if (!is_array($inputs)) {
                    $inputs = $this->normalizeRekapInputsFromBody($row);
                }
                $catatan = isset($row['catatan']) ? trim((string) $row['catatan']) : null;
                $this->computeAndPersistRekapRow(
                    $kolomDef,
                    $bid,
                    $periode,
                    $kalender,
                    $idPengurus,
                    $inputs,
                    $catatan,
                    $actorPid,
                    $formulaLembagaIds
                );
                ++$n;
            }
            $this->db->commit();
        } catch (\InvalidArgumentException $e) {
            $this->db->rollBack();

            return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 400);
        } catch (\Throwable $e) {
            $this->db->rollBack();

            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal simpan massal: ' . $e->getMessage(),
            ], 400);
        }

        return $this->json($response, [
            'success' => true,
            'message' => 'Rekap disimpan (' . $n . ' baris)',
            'data' => ['saved' => $n],
        ]);
    }

    /**
     * GET /api/bisyaroh/rekap/status — status alur rekap per set × lembaga × periode.
     */
    public function listRekapStatuses(Request $request, Response $response): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canViewTabRekap($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses tab Rekap ditolak'], 403);
        }
        if (!$this->rekapStatusLembagaTableExists()) {
            return $this->json($response, [
                'success' => true,
                'rekap_status_ready' => false,
                'data' => ['items' => []],
            ]);
        }
        $q = $request->getQueryParams();
        $q = is_array($q) ? $q : [];
        $idsRaw = isset($q['bisyaroh_ids']) ? trim((string) $q['bisyaroh_ids']) : '';
        $bidList = [];
        foreach (explode(',', $idsRaw) as $p) {
            $n = (int) trim($p);
            if ($n > 0) {
                $bidList[] = $n;
            }
        }
        $bidList = array_values(array_unique($bidList));
        $lembagaIds = $this->parseLembagaIdsFromQuery($q);
        if ($lembagaIds === null || $lembagaIds === []) {
            return $this->json($response, ['success' => false, 'message' => 'lembaga_ids wajib'], 400);
        }
        foreach ($lembagaIds as $lid) {
            if (!$this->userMayAccessLembagaForRekap($user, $lid)) {
                return $this->json($response, ['success' => false, 'message' => 'Akses rekap: lembaga di luar cakupan peran Anda'], 403);
            }
        }
        if ($bidList === []) {
            return $this->json($response, ['success' => false, 'message' => 'bisyaroh_ids wajib'], 400);
        }
        if (count($bidList) > 12) {
            return $this->json($response, ['success' => false, 'message' => 'Maksimal 12 set'], 400);
        }
        $periode = isset($q['periode_bulan']) ? trim((string) $q['periode_bulan']) : '';
        if ($periode === '' || !preg_match('/^\d{4}-\d{2}$/', $periode)) {
            return $this->json($response, ['success' => false, 'message' => 'periode_bulan wajib (YYYY-MM)'], 400);
        }
        $kalender = $this->normalizeRekapKalender($q['kalender'] ?? null);
        foreach ($bidList as $bid) {
            if ($this->loadBisyarohRow($request, $response, $bid, $user, true) === null) {
                return $this->json($response, ['success' => false, 'message' => 'Set #' . $bid . ' tidak ditemukan atau akses ditolak'], 404);
            }
        }
        $phB = implode(',', array_fill(0, count($bidList), '?'));
        $phL = implode(',', array_fill(0, count($lembagaIds), '?'));
        $bind = array_merge($bidList, $lembagaIds, [$periode, $kalender]);
        try {
            $stmt = $this->db->prepare(
                'SELECT `bisyaroh_id`, `lembaga_id`, `status`, `updated_at`, `updated_by_pengurus_id`
                 FROM `bisyaroh___rekap_status_lembaga`
                 WHERE `bisyaroh_id` IN (' . $phB . ')
                   AND `lembaga_id` IN (' . $phL . ')
                   AND `periode_bulan` = ?
                   AND `kalender` = ?'
            );
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat status rekap'], 500);
        }
        $out = [];
        foreach (is_array($rows) ? $rows : [] as $r) {
            $out[] = [
                'bisyaroh_id' => (int) ($r['bisyaroh_id'] ?? 0),
                'lembaga_id' => (string) ($r['lembaga_id'] ?? ''),
                'status' => (string) ($r['status'] ?? 'pengajuan'),
                'updated_at' => $r['updated_at'] ?? null,
                'updated_by_pengurus_id' => isset($r['updated_by_pengurus_id']) ? (int) $r['updated_by_pengurus_id'] : null,
            ];
        }

        return $this->json($response, [
            'success' => true,
            'rekap_status_ready' => true,
            'data' => ['items' => $out],
        ]);
    }

    /**
     * PUT /api/bisyaroh/{id}/rekap/status — alur: pengajuan ↔ ditinjau → rilis (rilis butuh aksi khusus).
     */
    public function updateRekapStatus(Request $request, Response $response, array $args): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canViewTabRekap($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses tab Rekap ditolak'], 403);
        }
        if (!$this->rekapStatusLembagaTableExists()) {
            return $this->json($response, ['success' => false, 'message' => 'Fitur status rekap membutuhkan migrasi database'], 503);
        }
        $bid = isset($args['id']) ? (int) $args['id'] : 0;
        if ($this->loadBisyarohRow($request, $response, $bid, $user, true) === null) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak ditemukan atau akses ditolak'], 404);
        }
        $body = $request->getParsedBody();
        $body = is_array($body) ? $body : [];
        $lembagaId = isset($body['lembaga_id']) ? trim((string) $body['lembaga_id']) : '';
        $periode = isset($body['periode_bulan']) ? trim((string) $body['periode_bulan']) : '';
        if ($lembagaId === '' || $periode === '' || !preg_match('/^\d{4}-\d{2}$/', $periode)) {
            return $this->json($response, ['success' => false, 'message' => 'lembaga_id dan periode_bulan (YYYY-MM) wajib'], 400);
        }
        if (!$this->userMayAccessLembagaForRekap($user, $lembagaId)) {
            return $this->json($response, ['success' => false, 'message' => 'Lembaga di luar cakupan rekap Anda'], 403);
        }
        $kalender = $this->normalizeRekapKalender($body['kalender'] ?? null);
        $rawStatus = isset($body['status']) ? trim((string) $body['status']) : '';
        if (!in_array($rawStatus, ['pengajuan', 'ditinjau', 'rilis'], true)) {
            return $this->json($response, ['success' => false, 'message' => 'status harus pengajuan, ditinjau, atau rilis'], 400);
        }
        $stmt = $this->db->prepare(
            'SELECT `status` FROM `bisyaroh___rekap_status_lembaga`
             WHERE `bisyaroh_id` = ? AND `lembaga_id` = ? AND `periode_bulan` = ? AND `kalender` = ?
             LIMIT 1'
        );
        $stmt->execute([$bid, $lembagaId, $periode, $kalender]);
        $ex = $stmt->fetch(PDO::FETCH_ASSOC);
        $cur = is_array($ex) ? (string) ($ex['status'] ?? '') : '';

        if ($rawStatus === 'ditinjau') {
            if (!$this->canEditTabRekap($user)) {
                return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
            }
            if ($cur === 'ditinjau' || $cur === 'rilis') {
                return $this->json($response, ['success' => false, 'message' => 'Tidak dapat menandai ditinjau dari status saat ini'], 400);
            }
        } elseif ($rawStatus === 'pengajuan') {
            if (!$this->canEditTabRekap($user)) {
                return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
            }
            if ($cur !== 'ditinjau') {
                return $this->json($response, ['success' => false, 'message' => 'Hanya bisa mengembalikan ke pengajuan dari status ditinjau'], 400);
            }
        } elseif ($rawStatus === 'rilis') {
            if (!$this->userMayRilisRekap($user)) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Anda tidak memiliki akses merilis rekap (fitur aksi «Bisyaroh · Merilis rekap»).',
                ], 403);
            }
            if ($cur !== 'ditinjau' && $cur !== 'pengajuan' && $cur !== '') {
                return $this->json($response, ['success' => false, 'message' => 'Hanya bisa merilis dari status pengajuan atau ditinjau'], 400);
            }
        }
        $actorPid = RoleHelper::getPengurusIdFromPayload($user);
        $sql = <<<'SQL'
INSERT INTO `bisyaroh___rekap_status_lembaga`
  (`bisyaroh_id`, `lembaga_id`, `periode_bulan`, `kalender`, `status`, `updated_by_pengurus_id`)
VALUES (?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  `status` = VALUES(`status`),
  `updated_by_pengurus_id` = VALUES(`updated_by_pengurus_id`),
  `updated_at` = CURRENT_TIMESTAMP
SQL;
        try {
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$bid, $lembagaId, $periode, $kalender, $rawStatus, $actorPid]);
        } catch (\Throwable $e) {
            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan status'], 500);
        }

        $potongSummary = null;
        if ($rawStatus === 'rilis') {
            BisyarohRekapSnapshotHelper::freezeRekapRowsForRelease(
                $this->db,
                $bid,
                $lembagaId,
                $periode,
                $kalender
            );
            $potongSummary = BisyarohPotongKewajibanApplier::applyAfterRilis(
                $this->db,
                $bid,
                $lembagaId,
                $periode,
                $kalender,
                $actorPid
            );
        }

        return $this->json($response, [
            'success' => true,
            'message' => 'Status rekap diperbarui',
            'data' => [
                'bisyaroh_id' => $bid,
                'lembaga_id' => $lembagaId,
                'periode_bulan' => $periode,
                'kalender' => $kalender,
                'status' => $rawStatus,
                'potong_kewajiban' => $potongSummary,
            ],
        ]);
    }
}
