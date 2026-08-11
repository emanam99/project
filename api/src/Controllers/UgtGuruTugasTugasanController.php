<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\RoleHelper;
use App\Helpers\TextSanitizer;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Penugasan Guru Tugas ke madrasah (ugt___guru_tugas_tugasan).
 */
class UgtGuruTugasTugasanController
{
    private const FITUR_TUGASAN_TAMBAH = 'action.ugt.guru_tugas.tugasan_tambah';

    private const FITUR_TUGASAN_HAPUS = 'action.ugt.guru_tugas.tugasan_hapus';

    private \PDO $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    /**
     * Bila role sudah punya penugasan fitur eBeddien: wajib punya aksi tambah (kecuali super admin instansi).
     * Tanpa penugasan fitur sama sekali: biarkan (middleware legacy sudah loloskan).
     *
     * @param array<string, mixed> $userArr
     */
    private function canCreateTugasan(array $userArr): bool
    {
        if (!empty($userArr['is_real_super_admin'])) {
            return true;
        }
        if (!RoleHelper::tokenUnionHasAnyEbeddienFiturAssignment($this->db, $userArr)) {
            return true;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $userArr, self::FITUR_TUGASAN_TAMBAH);
    }

    /** @param array<string, mixed> $userArr */
    private function canDeleteTugasan(array $userArr): bool
    {
        if (!empty($userArr['is_real_super_admin'])) {
            return true;
        }
        if (!RoleHelper::tokenUnionHasAnyEbeddienFiturAssignment($this->db, $userArr)) {
            return true;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $userArr, self::FITUR_TUGASAN_HAPUS);
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /** @param array<string, mixed> $userArr */
    private function pengurusIdFromUser(array $userArr): ?int
    {
        $id = $userArr['user_id'] ?? null;

        return $id !== null && $id !== '' ? (int) $id : null;
    }

    /**
     * Koordinator ter-scope: hanya madrasah dengan id_koordinator = pengurus token.
     *
     * @param array<string, mixed> $userArr
     */
    private function madrasahAllowedFilterSql(array $userArr): array
    {
        $apply = RoleHelper::tokenMadrasahDataApplyKoordinatorScope($this->db, $userArr);
        $pid = $this->pengurusIdFromUser($userArr);
        if ($apply && $pid !== null && $pid > 0) {
            return [' AND m.id_koordinator = ? ', [$pid]];
        }

        return ['', []];
    }

    /** Pastikan santri berstatus Guru Tugas sebelum create tugasan. */
    private function assertSantriIsGuruTugas(int $idSantri): bool
    {
        $st = $this->db->prepare('SELECT TRIM(LOWER(COALESCE(st.status_santri, \'\'))) AS s FROM santri s LEFT JOIN santri___status ss ON ss.id_santri = s.id AND ss.sampai IS NULL LEFT JOIN status st ON st.id = ss.id_status WHERE s.id = ? LIMIT 1');
        $st->execute([$idSantri]);
        $row = $st->fetch(\PDO::FETCH_ASSOC);

        return $row && (string) $row['s'] === 'guru tugas';
    }

    /**
     * GET /api/ugt/guru-tugas-tugasan?madrasah_id= — riwayat penugasan per madrasah (join santri).
     */
    private function listByMadrasah(Request $request, Response $response, int $mid): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            [$extraWhere, $extraBind] = $this->madrasahAllowedFilterSql($userArr);
            $sql = 'SELECT t.id, t.id_santri, t.id_madrasah, t.id_tahun_ajaran, t.keterangan, t.is_aktif, t.tanggal_dibuat,
                    s.nama AS santri_nama, s.nis AS santri_nis,
                    COALESCE(s.ayah, \'\') AS ayah, COALESCE(s.ibu, \'\') AS ibu, COALESCE(s.wali, \'\') AS wali,
                    COALESCE(s.dusun, \'\') AS dusun, COALESCE(s.rt, \'\') AS rt, COALESCE(s.rw, \'\') AS rw,
                    COALESCE(s.desa, \'\') AS desa, COALESCE(s.kecamatan, \'\') AS kecamatan,
                    COALESCE(s.kabupaten, \'\') AS kabupaten, COALESCE(s.provinsi, \'\') AS provinsi,
                    COALESCE(s.kode_pos, \'\') AS kode_pos
                FROM ugt___guru_tugas_tugasan t
                INNER JOIN santri s ON s.id = t.id_santri
                INNER JOIN madrasah m ON m.id = t.id_madrasah
                WHERE t.id_madrasah = ?' . $extraWhere . '
                ORDER BY t.id_tahun_ajaran DESC, s.nama ASC';
            $stmt = $this->db->prepare($sql);
            $stmt->execute(array_merge([$mid], $extraBind));
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, ['success' => true, 'data' => $rows], 200);
        } catch (\Throwable $e) {
            error_log('UgtGuruTugasTugasanController::listByMadrasah ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memuat tugasan'], 500);
        }
    }

    /**
     * GET /api/mybeddian/v2/guru-tugas-riwayat — riwayat penugasan madrasah token PJGT (baca saja).
     */
    public function listMybeddianPjgt(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            if (!RoleHelper::tokenHasAnyRoleKey($userArr, ['pjgt'])) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
            }
            $mid = isset($userArr['madrasah_id']) ? (int) $userArr['madrasah_id'] : 0;
            if ($mid <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Akun PJGT belum terhubung ke madrasah'], 422);
            }

            return $this->listByMadrasah($request, $response, $mid);
        } catch (\Throwable $e) {
            error_log('UgtGuruTugasTugasanController::listMybeddianPjgt ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memuat riwayat guru tugas'], 500);
        }
    }

    /**
     * GET /api/ugt/guru-tugas-tugasan/santri-by-ta?tahun_ajaran=YYYY-YYYY
     *
     * Mengembalikan santri yang **terikat ke madrasah** lewat tugasan aktif pada tahun ajaran tersebut.
     * Dipakai page UGT → Guru Tugas (menggantikan filter status_santri='guru tugas') agar dinamis sesuai
     * pilihan header (hijriyah) dan otomatis reload saat header berubah.
     */
    public function listSantriByTahunAjaran(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            $q = $request->getQueryParams();
            $ta = isset($q['tahun_ajaran']) ? trim((string) $q['tahun_ajaran']) : '';
            if ($ta === '' || preg_match('/^[0-9A-Za-z\\-\\.]+$/', $ta) !== 1) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter tahun_ajaran wajib (format master, mis. 1446-1447)',
                ], 400);
            }

            // Filter koordinator (id_koordinator = pengurus token) bila role sedang ter-scope.
            [$extraWhere, $extraBind] = $this->madrasahAllowedFilterSql($userArr);

            // Tugasan aktif pada TA tsb → ambil 1 madrasah representatif per santri (id terbaru),
            // sekaligus daftar nama madrasah (concat) bila satu santri terikat ke beberapa madrasah.
            $sql = 'SELECT
                    s.id,
                    s.nis,
                    s.nama,
                    s.nik,
                    s.no_telpon,
                    s.no_wa_santri,
                    s.gender,
                    s.tempat_lahir,
                    s.tanggal_lahir,
                    s.ayah,
                    s.ibu,
                    s.wali,
                    s.dusun,
                    s.rt,
                    s.rw,
                    s.desa,
                    s.kecamatan,
                    s.kabupaten,
                    s.provinsi,
                    s.kode_pos,
                    COALESCE(st.status_santri, \'\') AS status_santri,
                    COALESCE(st.kategori, d.kategori, \'\') AS kategori,
                    d.daerah,
                    dk.kamar,
                    s.id_kamar,
                    s.id_diniyah,
                    rd.lembaga_id AS diniyah,
                    rd.kelas AS kelas_diniyah,
                    rd.kel AS kel_diniyah,
                    s.id_formal,
                    rf.lembaga_id AS formal,
                    rf.kelas AS kelas_formal,
                    rf.kel AS kel_formal,
                    pick.id_tugasan,
                    pick.id_madrasah_gt,
                    pick.madrasah_gt,
                    mgt.id_pjgt,
                    mgt.id_koordinator,
                    uj_gt.username AS pjgt_nama,
                    COALESCE(uj_gt.no_wa, \'\') AS pjgt_wa,
                    pk_gt.nama AS koordinator_nama,
                    pk_gt.nip AS koordinator_nip,
                    COALESCE(uk_gt.no_wa, \'\') AS koordinator_wa
                FROM (
                    SELECT t1.id_santri,
                        MAX(t1.id) AS id_tugasan,
                        SUBSTRING_INDEX(GROUP_CONCAT(t1.id_madrasah ORDER BY t1.id DESC SEPARATOR \',\'), \',\', 1) AS id_madrasah_gt,
                        GROUP_CONCAT(DISTINCT m.nama ORDER BY m.nama SEPARATOR \', \') AS madrasah_gt
                    FROM ugt___guru_tugas_tugasan t1
                    INNER JOIN madrasah m ON m.id = t1.id_madrasah
                    WHERE t1.id_tahun_ajaran = ? AND COALESCE(t1.is_aktif, 1) = 1' . $extraWhere . '
                    GROUP BY t1.id_santri
                ) pick
                INNER JOIN santri s ON s.id = pick.id_santri
                LEFT JOIN santri___status ss ON ss.id_santri = s.id AND ss.sampai IS NULL
                LEFT JOIN status st ON st.id = ss.id_status
                LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                LEFT JOIN daerah d ON d.id = dk.id_daerah
                LEFT JOIN madrasah mgt ON mgt.id = pick.id_madrasah_gt
                LEFT JOIN users uj_gt ON uj_gt.id = mgt.id_pjgt
                LEFT JOIN pengurus pk_gt ON pk_gt.id = mgt.id_koordinator
                LEFT JOIN users uk_gt ON uk_gt.id = pk_gt.id_user
                ORDER BY s.nama ASC';
            $stmt = $this->db->prepare($sql);
            $stmt->execute(array_merge([$ta], $extraBind));
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows,
                'meta' => [
                    'tahun_ajaran' => $ta,
                    'total' => count($rows),
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('UgtGuruTugasTugasanController::listSantriByTahunAjaran ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memuat santri Guru Tugas'], 500);
        }
    }

    /**
     * GET /api/ugt/guru-tugas-tugasan?santri_id= | ?madrasah_id=
     */
    public function listBySantri(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            $mid = (int) ($request->getQueryParams()['madrasah_id'] ?? 0);
            if ($mid > 0) {
                return $this->listByMadrasah($request, $response, $mid);
            }
            $sid = (int) ($request->getQueryParams()['santri_id'] ?? 0);
            if ($sid <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'santri_id atau madrasah_id wajib'], 400);
            }
            [$extraWhere, $extraBind] = $this->madrasahAllowedFilterSql($userArr);
            $sql = 'SELECT t.id, t.id_santri, t.id_madrasah, t.id_tahun_ajaran, t.keterangan, t.is_aktif, t.tanggal_dibuat,
                    m.nama AS madrasah_nama, m.kategori AS madrasah_kategori
                FROM ugt___guru_tugas_tugasan t
                INNER JOIN madrasah m ON m.id = t.id_madrasah
                WHERE t.id_santri = ?' . $extraWhere . '
                ORDER BY t.id_tahun_ajaran DESC, t.tanggal_dibuat DESC';
            $stmt = $this->db->prepare($sql);
            $stmt->execute(array_merge([$sid], $extraBind));
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, ['success' => true, 'data' => $rows], 200);
        } catch (\Throwable $e) {
            error_log('UgtGuruTugasTugasanController::listBySantri ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memuat tugasan'], 500);
        }
    }

    /**
     * POST /api/ugt/guru-tugas-tugasan
     * Body: id_santri, id_madrasah, id_tahun_ajaran, keterangan? (opsional).
     */
    public function create(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            if (!$this->canCreateTugasan($userArr)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Anda tidak memiliki izin menambah penugasan Guru Tugas'], 403);
            }
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = [];
            }
            $idSantri = (int) ($body['id_santri'] ?? 0);
            $idMadrasah = (int) ($body['id_madrasah'] ?? 0);
            $idTa = isset($body['id_tahun_ajaran']) ? trim((string) $body['id_tahun_ajaran']) : '';
            $ketRaw = isset($body['keterangan']) ? TextSanitizer::cleanText((string) $body['keterangan']) : '';
            $ket = $ketRaw !== '' ? mb_substr($ketRaw, 0, 2000, 'UTF-8') : null;
            if ($idSantri <= 0 || $idMadrasah <= 0 || $idTa === '') {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'id_santri, id_madrasah, dan id_tahun_ajaran wajib'], 400);
            }
            if (!$this->assertSantriIsGuruTugas($idSantri)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Santri harus berstatus Guru Tugas'], 422);
            }
            $taStmt = $this->db->prepare('SELECT 1 FROM tahun_ajaran WHERE tahun_ajaran = ? LIMIT 1');
            $taStmt->execute([$idTa]);
            if (!$taStmt->fetchColumn()) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tahun ajaran tidak dikenal'], 422);
            }
            [$extraWhere, $extraBind] = $this->madrasahAllowedFilterSql($userArr);
            $mStmt = $this->db->prepare('SELECT m.id FROM madrasah m WHERE m.id = ?' . $extraWhere . ' LIMIT 1');
            $mStmt->execute(array_merge([$idMadrasah], $extraBind));
            if (!$mStmt->fetchColumn()) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Madrasah tidak ditemukan atau tidak diizinkan'], 403);
            }
            $pembuat = $this->pengurusIdFromUser($userArr);
            $ins = $this->db->prepare(
                'INSERT INTO ugt___guru_tugas_tugasan (id_santri, id_madrasah, id_tahun_ajaran, id_pengurus_pembuat, keterangan, is_aktif)
                 VALUES (?,?,?,?,?,1)'
            );
            $ins->execute([$idSantri, $idMadrasah, $idTa, $pembuat ?: null, $ket]);

            $newId = (int) $this->db->lastInsertId();
            $sel = $this->db->prepare(
                'SELECT t.id, t.id_santri, t.id_madrasah, t.id_tahun_ajaran, t.keterangan, t.is_aktif, t.tanggal_dibuat,
                    m.nama AS madrasah_nama, m.kategori AS madrasah_kategori
                 FROM ugt___guru_tugas_tugasan t
                 INNER JOIN madrasah m ON m.id = t.id_madrasah
                 WHERE t.id = ? LIMIT 1'
            );
            $sel->execute([$newId]);
            $row = $sel->fetch(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, ['success' => true, 'data' => $row], 201);
        } catch (\PDOException $e) {
            if (strpos($e->getMessage(), 'uq_gt_tugasan_santri_madrasah_ta') !== false || (int) $e->getCode() === 23000) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tugasan untuk madrasah dan tahun ajaran ini sudah ada'], 409);
            }
            error_log('UgtGuruTugasTugasanController::create ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menyimpan tugasan'], 500);
        } catch (\Throwable $e) {
            error_log('UgtGuruTugasTugasanController::create ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menyimpan tugasan'], 500);
        }
    }

    /**
     * PATCH /api/ugt/guru-tugas-tugasan/{id}
     * Body: is_aktif (0|1|bool) dan/atau id_tahun_ajaran (string master).
     */
    public function patch(Request $request, Response $response, array $args): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            if (!$this->canCreateTugasan($userArr)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Anda tidak memiliki izin mengubah penugasan Guru Tugas'], 403);
            }
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = [];
            }
            $hasAktif = array_key_exists('is_aktif', $body);
            $hasTa = array_key_exists('id_tahun_ajaran', $body);
            if (!$hasAktif && !$hasTa) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'is_aktif atau id_tahun_ajaran wajib'], 400);
            }
            [$extraWhere, $extraBind] = $this->madrasahAllowedFilterSql($userArr);
            $sql = 'SELECT t.id, COALESCE(t.is_aktif, 1) AS is_aktif, t.id_tahun_ajaran FROM ugt___guru_tugas_tugasan t
                INNER JOIN madrasah m ON m.id = t.id_madrasah
                WHERE t.id = ?' . $extraWhere . ' LIMIT 1';
            $stmt = $this->db->prepare($sql);
            $stmt->execute(array_merge([$id], $extraBind));
            $existing = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$existing) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Data tidak ditemukan'], 404);
            }

            $isAktif = (int) $existing['is_aktif'] === 1;
            if ($hasAktif) {
                $raw = $body['is_aktif'];
                $parsed = filter_var($raw, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
                if ($parsed === null) {
                    $parsed = (int) $raw === 1;
                }
                $isAktif = $parsed;
            }

            $newTa = (string) $existing['id_tahun_ajaran'];
            if ($hasTa) {
                $newTa = trim((string) $body['id_tahun_ajaran']);
                if ($newTa === '' || preg_match('/^[0-9A-Za-z\\-\\.]+$/', $newTa) !== 1) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'Tahun ajaran tidak valid'], 400);
                }
                $taStmt = $this->db->prepare('SELECT 1 FROM tahun_ajaran WHERE tahun_ajaran = ? LIMIT 1');
                $taStmt->execute([$newTa]);
                if (!$taStmt->fetchColumn()) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'Tahun ajaran tidak dikenal'], 422);
                }
            }

            try {
                $upd = $this->db->prepare('UPDATE ugt___guru_tugas_tugasan SET is_aktif = ?, id_tahun_ajaran = ? WHERE id = ?');
                $upd->execute([$isAktif ? 1 : 0, $newTa, $id]);
            } catch (\PDOException $e) {
                if (strpos($e->getMessage(), 'uq_gt_tugasan_santri_madrasah_ta') !== false || (int) $e->getCode() === 23000) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'Tugasan untuk madrasah dan tahun ajaran ini sudah ada'], 409);
                }
                throw $e;
            }

            $msg = [];
            if ($hasTa && $newTa !== (string) $existing['id_tahun_ajaran']) {
                $msg[] = 'Tahun ajaran diperbarui';
            }
            if ($hasAktif) {
                $msg[] = $isAktif ? 'Penugasan diaktifkan' : 'Penugasan dinonaktifkan';
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $msg !== [] ? implode('; ', $msg) : 'Penugasan diperbarui',
                'data' => ['id' => $id, 'is_aktif' => $isAktif ? 1 : 0, 'id_tahun_ajaran' => $newTa],
            ], 200);
        } catch (\Throwable $e) {
            error_log('UgtGuruTugasTugasanController::patch ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memperbarui penugasan'], 500);
        }
    }

    /**
     * DELETE /api/ugt/guru-tugas-tugasan/{id}
     */
    public function delete(Request $request, Response $response, array $args): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            if (!$this->canDeleteTugasan($userArr)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Anda tidak memiliki izin menghapus penugasan Guru Tugas'], 403);
            }
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            [$extraWhere, $extraBind] = $this->madrasahAllowedFilterSql($userArr);
            $sql = 'SELECT t.id FROM ugt___guru_tugas_tugasan t
                INNER JOIN madrasah m ON m.id = t.id_madrasah
                WHERE t.id = ?' . $extraWhere . ' LIMIT 1';
            $stmt = $this->db->prepare($sql);
            $stmt->execute(array_merge([$id], $extraBind));
            if (!$stmt->fetchColumn()) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Data tidak ditemukan'], 404);
            }
            $del = $this->db->prepare('DELETE FROM ugt___guru_tugas_tugasan WHERE id = ?');
            $del->execute([$id]);

            return $this->jsonResponse($response, ['success' => true, 'message' => 'Tugasan dihapus'], 200);
        } catch (\Throwable $e) {
            error_log('UgtGuruTugasTugasanController::delete ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menghapus'], 500);
        }
    }
}
