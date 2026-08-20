<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\SantriHelper;
use App\Helpers\SantriRombelHelper;
use App\Helpers\SantriLttqHelper;
use App\Helpers\SantriKamarHelper;
use App\Helpers\SantriDomisiliHelper;
use App\Helpers\SantriStatusHelper;
use App\Helpers\ProperCaseHelper;
use App\Helpers\TextSanitizer;
use App\Helpers\LiveSantriIndexNotifier;
use App\Helpers\UserAktivitasLogger;
use App\Helpers\RoleHelper;
use App\Helpers\PublicSantriViewTokenHelper;
use App\Helpers\SantriJwtAccessHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class SantriController
{
    private const FITUR_RIWAYAT_ROMBEL_HAPUS = 'action.santri.riwayat_rombel.hapus';

    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    /**
     * @param array<string, mixed> $userArr
     */
    private function canDeleteRiwayatRombel(array $userArr): bool
    {
        if (!empty($userArr['is_real_super_admin'])) {
            return true;
        }
        if (!RoleHelper::tokenUnionHasAnyEbeddienFiturAssignment($this->db, $userArr)) {
            return true;
        }
        if (!RoleHelper::tokenUserHasAnyEbeddienFiturCodePrefix($this->db, $userArr, 'action.santri.riwayat_rombel.')) {
            return true;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $userArr, self::FITUR_RIWAYAT_ROMBEL_HAPUS);
    }

    public function getAllSantri(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $id = $queryParams['id'] ?? null;

            // Jika ada parameter id, ambil data santri by ID
            if ($id) {
                return $this->getSantriById($request, $response);
            }

            // Jika tidak ada id, ambil semua santri — kolom selaras GET /santri/excel-raw (biodata + rombel/kamar) agar daftar & eksport eBeddien tidak kehilangan field.
            // Parameter since (datetime ISO / MySQL): hanya baris yang diubah/dibuat setelah watermark — sinkron inkremental di klien.
            $since = isset($queryParams['since']) ? trim((string) $queryParams['since']) : '';

            $ugtMadrasahSelect = ', NULL AS madrasah_gt';
            $ugtMadrasahJoin = '';
            if ($this->tableExists('ugt___guru_tugas_tugasan')) {
                $ugtMadrasahSelect = ', ugt_gt.madrasah_gt';
                $ugtMadrasahJoin = "
                LEFT JOIN (
                    SELECT t.id_santri,
                        GROUP_CONCAT(DISTINCT m.nama ORDER BY m.nama SEPARATOR ', ') AS madrasah_gt
                    FROM ugt___guru_tugas_tugasan t
                    INNER JOIN madrasah m ON m.id = t.id_madrasah
                    WHERE COALESCE(t.is_aktif, 1) = 1
                    GROUP BY t.id_santri
                ) ugt_gt ON ugt_gt.id_santri = s.id";
            }

            $sql = "SELECT
                s.id,
                s.nis,
                s.nama,
                s.nik,
                s.tempat_lahir,
                s.tanggal_lahir,
                s.gender,
                s.nisn,
                s.no_kk,
                s.kepala_keluarga,
                s.anak_ke,
                s.jumlah_saudara,
                s.ayah,
                s.status_ayah,
                s.nik_ayah,
                s.tempat_lahir_ayah,
                s.tanggal_lahir_ayah,
                s.pekerjaan_ayah,
                s.pendidikan_ayah,
                s.penghasilan_ayah,
                s.ibu,
                s.status_ibu,
                s.nik_ibu,
                s.tempat_lahir_ibu,
                s.tanggal_lahir_ibu,
                s.pekerjaan_ibu,
                s.pendidikan_ibu,
                s.penghasilan_ibu,
                s.hubungan_wali,
                s.wali,
                s.nik_wali,
                s.tempat_lahir_wali,
                s.tanggal_lahir_wali,
                s.pekerjaan_wali,
                s.pendidikan_wali,
                s.penghasilan_wali,
                COALESCE(st.status_santri, s.status_santri, '') AS status_santri,
                COALESCE(d.kategori, '') AS kategori,
                s.status_pendaftar,
                s.status_murid,
                s.status_nikah,
                s.pekerjaan,
                s.saudara_di_pesantren,
                s.hobi,
                s.cita_cita,
                s.kebutuhan_khusus,
                s.riwayat_sakit,
                s.ukuran_baju,
                s.kip,
                s.pkh,
                s.kks,
                s.dusun,
                s.rt,
                s.rw,
                s.desa,
                s.kecamatan,
                s.kabupaten,
                s.provinsi,
                s.kode_pos,
                s.madrasah,
                s.nama_madrasah,
                s.alamat_madrasah,
                s.lulus_madrasah,
                s.sekolah,
                s.nama_sekolah,
                s.alamat_sekolah,
                s.lulus_sekolah,
                s.npsn,
                s.nsm,
                d.id AS id_daerah,
                d.daerah,
                dk.kamar,
                CONCAT(COALESCE(d.daerah, ''), IF(COALESCE(d.daerah, '') <> '' AND COALESCE(dk.kamar, '') <> '', '.', ''), COALESCE(dk.kamar, '')) AS daerah_kamar,
                s.id_kamar,
                s.id_diniyah,
                rd.lembaga_id AS diniyah,
                rd.kelas AS kelas_diniyah,
                rd.kel AS kel_diniyah,
                s.nim_diniyah,
                s.id_formal,
                rf.lembaga_id AS formal,
                rf.kelas AS kelas_formal,
                rf.kel AS kel_formal,
                s.nim_formal,
                " . SantriLttqHelper::selectAliasSql() . ",
                s.no_telpon,
                s.no_wa_santri,
                s.email,
                s.tanggal_update,
                s.tanggal_dibuat
                {$ugtMadrasahSelect}
                FROM santri s
                LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                " . SantriLttqHelper::joinSql('s') . "
                LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                LEFT JOIN daerah d ON d.id = dk.id_daerah
                " . SantriStatusHelper::currentStatusJoinSql('s', 'st', 'ss') . "
                {$ugtMadrasahJoin}";
            $pagination = $this->parseListPagination($queryParams);
            if ($since !== '') {
                $pagination['active'] = false;
            }

            $totalRows = null;
            if ($pagination['active']) {
                $totalRows = (int) $this->db->query('SELECT COUNT(*) FROM santri')->fetchColumn();
            }

            if ($since !== '') {
                $sql .= ' WHERE (s.tanggal_update IS NOT NULL AND s.tanggal_update > ?)
                    OR (s.tanggal_update IS NULL AND s.tanggal_dibuat > ?)';
            }

            $sql .= ' ORDER BY s.id ASC';

            if ($pagination['active']) {
                $sql .= ' LIMIT ' . (int) $pagination['limit'] . ' OFFSET ' . (int) $pagination['offset'];
            }

            if ($since !== '') {
                $stmt = $this->db->prepare($sql);
                $stmt->execute([$since, $since]);
            } else {
                $stmt = $this->db->query($sql);
            }
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $payload = [
                'success' => true,
                'data' => $data,
                'incremental' => $since !== '',
            ];
            if ($pagination['active'] && $totalRows !== null) {
                $n = count($data);
                $payload['meta'] = [
                    'total' => $totalRows,
                    'offset' => $pagination['offset'],
                    'limit' => $pagination['limit'],
                    'returned' => $n,
                    'has_more' => ($pagination['offset'] + $n) < $totalRows,
                ];
            }

            return $this->jsonResponse($response, $payload, 200);

        } catch (\Exception $e) {
            error_log("Get all santri error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error fetching santri data',
                'data' => []
            ], 500);
        }
    }

    public function getSantriById(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $id = $queryParams['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID santri wajib diisi'
                ], 400);
            }

            $resolvedId = SantriHelper::resolveId($this->db, $id);
            if ($resolvedId === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan'
                ], 404);
            }

            // Ambil semua field yang diperlukan untuk biodata pendaftaran (id_diniyah/id_formal + rombel dari JOIN)
            $sql = "SELECT 
                s.id, s.nis, s.nama, s.nik, s.tempat_lahir, s.tanggal_lahir, s.gender, s.nisn, s.no_kk, s.kepala_keluarga,
                s.anak_ke, s.jumlah_saudara, s.saudara_di_pesantren, s.hobi, s.cita_cita, s.kebutuhan_khusus,
                s.ayah, s.status_ayah, s.nik_ayah, s.tempat_lahir_ayah, s.tanggal_lahir_ayah, 
                s.pekerjaan_ayah, s.pendidikan_ayah, s.penghasilan_ayah,
                s.ibu, s.status_ibu, s.nik_ibu, s.tempat_lahir_ibu, s.tanggal_lahir_ibu,
                s.pekerjaan_ibu, s.pendidikan_ibu, s.penghasilan_ibu,
                s.hubungan_wali, s.wali, s.nik_wali, s.tempat_lahir_wali, s.tanggal_lahir_wali,
                s.pekerjaan_wali, s.pendidikan_wali, s.penghasilan_wali,
                s.dusun, s.rt, s.rw, s.desa, s.kecamatan, s.kode_pos, s.kabupaten, s.provinsi,
                s.madrasah, s.nama_madrasah, s.alamat_madrasah, s.lulus_madrasah,
                s.sekolah, s.nama_sekolah, s.alamat_sekolah, s.lulus_sekolah, s.npsn, s.nsm,
                s.no_telpon, s.email, s.riwayat_sakit, s.ukuran_baju, s.kip, s.pkh, s.kks,
                s.status_nikah, s.pekerjaan, s.no_wa_santri,
                s.status_pendaftar, s.status_murid,
                s.id_user, u.username AS login_username,
                COALESCE(st.status_santri, s.status_santri, '') AS status_santri,
                COALESCE(d.kategori, '') AS kategori, d.daerah, dk.kamar, dk.id_daerah, s.id_kamar,
                s.id_diniyah, rd.lembaga_id AS diniyah, ld.nama AS lembaga_diniyah, rd.kelas AS kelas_diniyah, rd.kel AS kel_diniyah, s.nim_diniyah,
                s.id_formal, rf.lembaga_id AS formal, lf.nama AS lembaga_formal, rf.kelas AS kelas_formal, rf.kel AS kel_formal, s.nim_formal,
                " . SantriLttqHelper::selectAliasSql() . "
                FROM santri s
                LEFT JOIN users u ON u.id = s.id_user
                LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                LEFT JOIN lembaga ld ON ld.id = rd.lembaga_id
                LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                LEFT JOIN lembaga lf ON lf.id = rf.lembaga_id
                " . SantriLttqHelper::joinSql('s') . "
                LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                LEFT JOIN daerah d ON d.id = dk.id_daerah
                " . SantriStatusHelper::currentStatusJoinSql('s', 'st', 'ss') . "
                WHERE s.id = ? LIMIT 1";
            try {
                $stmt = $this->db->prepare($sql);
                $stmt->execute([$resolvedId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            } catch (\PDOException $e) {
                if (strpos($e->getMessage(), 'id_user') === false && strpos($e->getMessage(), 'Unknown column') === false) {
                    throw $e;
                }
                $sqlFallback = str_replace(
                    ['s.id_user, u.username AS login_username,', 'LEFT JOIN users u ON u.id = s.id_user'],
                    ['NULL AS id_user, NULL AS login_username,', ''],
                    $sql
                );
                $stmt = $this->db->prepare($sqlFallback);
                $stmt->execute([$resolvedId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            }

            if ($row) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => $row
                ], 200);
            } else {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan'
                ], 404);
            }

        } catch (\Exception $e) {
            error_log("Get santri by ID error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error fetching santri data'
            ], 500);
        }
    }

    /**
     * GET /api/santri/riwayat-rombel?id_santri=... — riwayat rombel santri (santri___rombel).
     */
    public function getRiwayatRombel(Request $request, Response $response): Response
    {
        try {
            $idSantri = $request->getQueryParams()['id_santri'] ?? null;
            if (!$idSantri) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'id_santri wajib'], 400);
            }
            $resolvedId = SantriHelper::resolveId($this->db, $idSantri);
            if ($resolvedId === null) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Santri tidak ditemukan'], 404);
            }
            if (!$this->tableExists('santri___rombel')) {
                return $this->jsonResponse($response, ['success' => true, 'data' => []], 200);
            }
            $sql = "SELECT sr.id, sr.id_rombel, sr.id_santri, sr.nim, sr.tahun_ajaran, sr.tanggal_dibuat,
                    l.nama AS lembaga_nama, l.kategori AS lembaga_kategori, r.kelas, r.kel,
                    CONCAT(TRIM(COALESCE(r.kelas,'')), IF(TRIM(COALESCE(r.kel,''))='','',' '), TRIM(COALESCE(r.kel,''))) AS rombel_label
                    FROM santri___rombel sr
                    JOIN lembaga___rombel r ON r.id = sr.id_rombel
                    JOIN lembaga l ON l.id = r.lembaga_id
                    WHERE sr.id_santri = ?
                    ORDER BY sr.tahun_ajaran DESC, sr.tanggal_dibuat DESC";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$resolvedId]);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            return $this->jsonResponse($response, ['success' => true, 'data' => $data], 200);
        } catch (\Exception $e) {
            error_log("Get riwayat rombel error: " . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Error mengambil riwayat rombel', 'data' => []], 500);
        }
    }

    /**
     * DELETE /api/santri/riwayat-rombel/{id} — hapus satu baris santri___rombel (bukan rombel aktif santri).
     */
    public function deleteRiwayatRombel(Request $request, Response $response, array $args): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            if (!$this->canDeleteRiwayatRombel($userArr)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Anda tidak memiliki izin menghapus riwayat rombel',
                ], 403);
            }

            $idRiwayat = isset($args['id']) ? (int) $args['id'] : 0;
            if ($idRiwayat <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID riwayat tidak valid'], 400);
            }
            if (!$this->tableExists('santri___rombel')) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tabel riwayat rombel tidak tersedia'], 404);
            }

            $stmt = $this->db->prepare('
                SELECT sr.id, sr.id_santri, sr.id_rombel, sr.tahun_ajaran,
                       s.id_diniyah, s.id_formal
                FROM santri___rombel sr
                INNER JOIN santri s ON s.id = sr.id_santri
                WHERE sr.id = ?
                LIMIT 1
            ');
            $stmt->execute([$idRiwayat]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Riwayat rombel tidak ditemukan'], 404);
            }

            $idRombel = (int) $row['id_rombel'];
            $idDiniyah = $row['id_diniyah'] !== null && $row['id_diniyah'] !== '' ? (int) $row['id_diniyah'] : null;
            $idFormal = $row['id_formal'] !== null && $row['id_formal'] !== '' ? (int) $row['id_formal'] : null;
            if (($idDiniyah !== null && $idDiniyah === $idRombel) || ($idFormal !== null && $idFormal === $idRombel)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Rombel aktif santri tidak dapat dihapus dari riwayat. Gunakan Pindah Rombel jika perlu mengubah penempatan.',
                ], 422);
            }

            $del = $this->db->prepare('DELETE FROM santri___rombel WHERE id = ? LIMIT 1');
            $del->execute([$idRiwayat]);
            if ($del->rowCount() < 1) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menghapus riwayat rombel'], 500);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Riwayat rombel dihapus',
            ], 200);
        } catch (\Exception $e) {
            error_log('Delete riwayat rombel error: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error menghapus riwayat rombel',
            ], 500);
        }
    }

    /**
     * GET /api/santri/riwayat-kamar?id_santri=... — riwayat kamar santri (santri___kamar).
     */
    public function getRiwayatKamar(Request $request, Response $response): Response
    {
        try {
            $idSantri = $request->getQueryParams()['id_santri'] ?? null;
            if (!$idSantri) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'id_santri wajib'], 400);
            }
            $resolvedId = SantriHelper::resolveId($this->db, $idSantri);
            if ($resolvedId === null) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Santri tidak ditemukan'], 404);
            }
            if (!$this->tableExists('santri___kamar')) {
                return $this->jsonResponse($response, ['success' => true, 'data' => []], 200);
            }
            $sql = "SELECT sk.id, sk.id_kamar, sk.id_santri, sk.tahun_ajaran, sk.tanggal_dibuat,
                    COALESCE(ss.status_santri, '') AS status_santri, COALESCE(d.kategori, '') AS kategori,
                    d.daerah, dk.kamar, CONCAT(d.daerah, '.', dk.kamar) AS daerah_kamar
                    FROM santri___kamar sk
                    LEFT JOIN santri___status ss ON ss.id = (
                        SELECT ss2.id
                        FROM santri___status ss2
                        WHERE ss2.id_santri = sk.id_santri
                          AND ss2.dari <= COALESCE(sk.tanggal_dibuat, CURRENT_TIMESTAMP)
                          AND (ss2.sampai IS NULL OR ss2.sampai >= COALESCE(sk.tanggal_dibuat, CURRENT_TIMESTAMP))
                        ORDER BY ss2.dari DESC, ss2.id DESC
                        LIMIT 1
                    )
                    JOIN daerah___kamar dk ON dk.id = sk.id_kamar
                    JOIN daerah d ON d.id = dk.id_daerah
                    WHERE sk.id_santri = ?
                    ORDER BY sk.tahun_ajaran DESC, sk.tanggal_dibuat DESC";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$resolvedId]);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            return $this->jsonResponse($response, ['success' => true, 'data' => $data], 200);
        } catch (\Exception $e) {
            error_log("Get riwayat kamar error: " . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Error mengambil riwayat kamar', 'data' => []], 500);
        }
    }

    /**
     * Pagination opsional: ?limit=&offset= — muat bertahap (halaman Data Santri eBeddien).
     *
     * Audit Mei 2026: jika `limit` kosong, default jadi `limit=500` (sebelumnya
     * tanpa LIMIT → query full table ~5500 baris untuk setiap GET /api/santri).
     * Klien yang butuh seluruh data harus eksplisit set `limit=` (dan idealnya
     * paginate via `offset=`) atau pakai endpoint export khusus di masa depan.
     */
    private const SANTRI_LIST_DEFAULT_LIMIT = 500;
    private const SANTRI_LIST_MAX_LIMIT = 1000;

    private function parseListPagination(array $queryParams): array
    {
        $limitRaw = $queryParams['limit'] ?? null;
        if ($limitRaw === null || $limitRaw === '') {
            return [
                'active' => true,
                'limit' => self::SANTRI_LIST_DEFAULT_LIMIT,
                'offset' => max(0, (int) ($queryParams['offset'] ?? 0)),
            ];
        }

        return [
            'active' => true,
            'limit' => min(self::SANTRI_LIST_MAX_LIMIT, max(1, (int) $limitRaw)),
            'offset' => max(0, (int) ($queryParams['offset'] ?? 0)),
        ];
    }

    private function tableExists(string $table): bool
    {
        $stmt = $this->db->query("SHOW TABLES LIKE " . $this->db->quote($table));
        return $stmt->rowCount() > 0;
    }

    /**
     * Parse nilai is_aktif dari Excel (1/0, aktif/nonaktif, bool).
     */
    private function parseExcelIsAktif($raw): int
    {
        if ($raw === null || $raw === '') {
            return 1;
        }
        if (is_bool($raw)) {
            return $raw ? 1 : 0;
        }
        $s = strtolower(trim((string) $raw));
        if (in_array($s, ['0', 'nonaktif', 'tidak', 'false', 'no', 'off'], true)) {
            return 0;
        }

        return 1;
    }

    /** @param array<string, mixed> $userArr */
    private function assertMadrasahAllowedForUgtExcel(int $mid, array $userArr): bool
    {
        if ($mid <= 0) {
            return false;
        }
        $applyKoord = RoleHelper::tokenMadrasahDataApplyKoordinatorScope($this->db, $userArr);
        $pid = isset($userArr['user_id']) ? (int) $userArr['user_id'] : 0;
        if ($applyKoord && $pid > 0) {
            $mStmt = $this->db->prepare('SELECT m.id FROM madrasah m WHERE m.id = ? AND m.id_koordinator = ? LIMIT 1');
            $mStmt->execute([$mid, $pid]);
        } else {
            $mStmt = $this->db->prepare('SELECT m.id FROM madrasah m WHERE m.id = ? LIMIT 1');
            $mStmt->execute([$mid]);
        }

        return (bool) $mStmt->fetchColumn();
    }

    /**
     * Excel bulk (mode UGT): per baris — update by id_tugasan bila ada, atau hapus+insert per santri+TA.
     *
     * @param array<string, mixed> $row
     * @param array<string, mixed> $userArr
     * @return array{ok: bool, message?: string}
     */
    private function syncExcelGuruTugasTugasanRow(int $idSantri, array $row, string $defaultTahunAjaran, array $userArr): array
    {
        if (!$this->tableExists('ugt___guru_tugas_tugasan')) {
            return ['ok' => false, 'message' => 'Tabel penugasan UGT belum tersedia'];
        }
        $st = $this->db->prepare('SELECT TRIM(LOWER(COALESCE(st.status_santri, s.status_santri, \'\'))) AS s FROM santri s ' . SantriStatusHelper::currentStatusJoinSql('s', 'st', 'ss') . ' WHERE s.id = ? LIMIT 1');
        $st->execute([$idSantri]);
        $srow = $st->fetch(\PDO::FETCH_ASSOC);
        if (!$srow || (string) $srow['s'] !== 'guru tugas') {
            return ['ok' => false, 'message' => 'Santri harus berstatus Guru Tugas'];
        }

        $idTugasan = isset($row['id_tugasan']) ? (int) $row['id_tugasan'] : 0;
        $ta = isset($row['tahun_ajaran']) && trim((string) $row['tahun_ajaran']) !== ''
            ? trim((string) $row['tahun_ajaran'])
            : $defaultTahunAjaran;
        if ($ta === '' || preg_match('/^[0-9A-Za-z\\-\\.]+$/', $ta) !== 1) {
            return ['ok' => false, 'message' => 'Tahun ajaran tidak valid'];
        }
        $taStmt = $this->db->prepare('SELECT 1 FROM tahun_ajaran WHERE tahun_ajaran = ? LIMIT 1');
        $taStmt->execute([$ta]);
        if (!$taStmt->fetchColumn()) {
            return ['ok' => false, 'message' => 'Tahun ajaran tidak dikenal'];
        }

        $hasMadrasahKey = array_key_exists('id_madrasah', $row);
        $hasAktifKey = array_key_exists('is_aktif', $row);
        $hasTaKey = array_key_exists('tahun_ajaran', $row);
        if ($idTugasan > 0 && ($hasMadrasahKey || $hasAktifKey || $hasTaKey)) {
            [$extraWhere, $extraBind] = $this->ugtExcelKoordinatorFilterSql($userArr);
            $sel = $this->db->prepare(
                'SELECT t.id, t.id_santri, t.id_madrasah, t.id_tahun_ajaran, COALESCE(t.is_aktif, 1) AS is_aktif
                 FROM ugt___guru_tugas_tugasan t
                 INNER JOIN madrasah m ON m.id = t.id_madrasah
                 WHERE t.id = ? AND t.id_santri = ?' . $extraWhere . ' LIMIT 1'
            );
            $sel->execute(array_merge([$idTugasan, $idSantri], $extraBind));
            $existing = $sel->fetch(\PDO::FETCH_ASSOC);
            if (!$existing) {
                return ['ok' => false, 'message' => 'Penugasan tidak ditemukan atau tidak diizinkan'];
            }

            $newMid = (int) $existing['id_madrasah'];
            if ($hasMadrasahKey) {
                $rawMid = $row['id_madrasah'];
                if ($rawMid === null || $rawMid === '') {
                    return ['ok' => false, 'message' => 'ID madrasah wajib diisi'];
                }
                $newMid = (int) (is_numeric($rawMid) ? $rawMid : 0);
                if ($newMid <= 0 || !$this->assertMadrasahAllowedForUgtExcel($newMid, $userArr)) {
                    return ['ok' => false, 'message' => 'ID madrasah tidak valid atau tidak diizinkan'];
                }
            }

            $newTa = $hasTaKey ? $ta : (string) $existing['id_tahun_ajaran'];
            $newAktif = $hasAktifKey ? $this->parseExcelIsAktif($row['is_aktif']) : (int) $existing['is_aktif'];

            $upd = $this->db->prepare(
                'UPDATE ugt___guru_tugas_tugasan SET id_madrasah = ?, id_tahun_ajaran = ?, is_aktif = ? WHERE id = ? AND id_santri = ?'
            );
            try {
                $upd->execute([$newMid, $newTa, $newAktif, $idTugasan, $idSantri]);
            } catch (\PDOException $e) {
                if (strpos($e->getMessage(), 'uq_gt_tugasan_santri_madrasah_ta') !== false || (int) $e->getCode() === 23000) {
                    return ['ok' => false, 'message' => 'Tugasan untuk madrasah dan tahun ajaran ini sudah ada'];
                }
                throw $e;
            }

            return ['ok' => true];
        }

        if (!$hasMadrasahKey) {
            return ['ok' => true];
        }

        return $this->syncExcelGuruTugasTugasanLegacy($idSantri, $ta, $row['id_madrasah'], $userArr, $hasAktifKey ? $this->parseExcelIsAktif($row['is_aktif']) : 1);
    }

    /**
     * Legacy: hapus semua tugasan santri untuk TA, lalu insert satu baris jika id_madrasah > 0.
     *
     * @param array<string, mixed> $userArr
     * @return array{ok: bool, message?: string}
     */
    private function syncExcelGuruTugasTugasanLegacy(int $idSantri, string $idTahunAjaran, $rawIdMadrasah, array $userArr, int $isAktif = 1): array
    {
        $mid = null;
        if ($rawIdMadrasah !== null && $rawIdMadrasah !== '') {
            $mid = (int) (is_numeric($rawIdMadrasah) ? $rawIdMadrasah : 0);
            if ($mid <= 0) {
                $mid = null;
            }
        }
        if ($mid !== null && !$this->assertMadrasahAllowedForUgtExcel($mid, $userArr)) {
            return ['ok' => false, 'message' => 'ID madrasah tidak valid atau tidak diizinkan'];
        }

        $del = $this->db->prepare('DELETE FROM ugt___guru_tugas_tugasan WHERE id_santri = ? AND id_tahun_ajaran = ?');
        $del->execute([$idSantri, $idTahunAjaran]);
        if ($mid === null || $mid <= 0) {
            return ['ok' => true];
        }
        $pembuat = isset($userArr['user_id']) ? (int) $userArr['user_id'] : 0;
        $ins = $this->db->prepare(
            'INSERT INTO ugt___guru_tugas_tugasan (id_santri, id_madrasah, id_tahun_ajaran, id_pengurus_pembuat, keterangan, is_aktif) VALUES (?,?,?,?,NULL,?)'
        );
        $ins->execute([$idSantri, $mid, $idTahunAjaran, $pembuat > 0 ? $pembuat : null, $isAktif ? 1 : 0]);

        return ['ok' => true];
    }

    /** @param array<string, mixed> $userArr @return array{0: string, 1: list<mixed>} */
    private function ugtExcelKoordinatorFilterSql(array $userArr): array
    {
        $apply = RoleHelper::tokenMadrasahDataApplyKoordinatorScope($this->db, $userArr);
        $pid = isset($userArr['user_id']) ? (int) $userArr['user_id'] : 0;
        if ($apply && $pid > 0) {
            return [' AND m.id_koordinator = ? ', [$pid]];
        }

        return ['', []];
    }

    /**
     * GET excel-raw mode UGT: satu baris per penugasan pada tahun ajaran terpilih.
     *
     * @param array<string, mixed> $userArr
     * @return array{0: list<array<string, mixed>>, 1: list<mixed>}
     */
    private function fetchExcelRawUgtGuruTugasRows(
        string $tahunAjaranUgt,
        array $userArr,
        string $lembaga,
        string $kelas,
        string $kel,
        string $statusCsv,
        string $kategoriCsv,
        string $daerah,
        string $kamar,
        bool $tidakDiniyah,
        bool $tidakFormal
    ): array {
        [$koordWhere, $koordBind] = $this->ugtExcelKoordinatorFilterSql($userArr);
        $sql = "SELECT
                s.id,
                s.nis,
                s.nama,
                s.nik,
                s.tempat_lahir,
                s.tanggal_lahir,
                s.gender,
                s.nisn,
                s.no_kk,
                s.kepala_keluarga,
                s.anak_ke,
                s.jumlah_saudara,
                s.ayah,
                s.status_ayah,
                s.nik_ayah,
                s.tempat_lahir_ayah,
                s.tanggal_lahir_ayah,
                s.pekerjaan_ayah,
                s.pendidikan_ayah,
                s.penghasilan_ayah,
                s.ibu,
                s.status_ibu,
                s.nik_ibu,
                s.tempat_lahir_ibu,
                s.tanggal_lahir_ibu,
                s.pekerjaan_ibu,
                s.pendidikan_ibu,
                s.penghasilan_ibu,
                s.hubungan_wali,
                s.wali,
                s.nik_wali,
                s.tempat_lahir_wali,
                s.tanggal_lahir_wali,
                s.pekerjaan_wali,
                s.pendidikan_wali,
                s.penghasilan_wali,
                COALESCE(st.status_santri, s.status_santri, '') AS status_santri,
                COALESCE(d.kategori, '') AS kategori,
                s.status_pendaftar,
                s.status_murid,
                s.status_nikah,
                s.pekerjaan,
                s.saudara_di_pesantren,
                s.hobi,
                s.cita_cita,
                s.kebutuhan_khusus,
                s.riwayat_sakit,
                s.ukuran_baju,
                s.kip,
                s.pkh,
                s.kks,
                s.dusun,
                s.rt,
                s.rw,
                s.desa,
                s.kecamatan,
                s.kabupaten,
                s.provinsi,
                s.kode_pos,
                s.madrasah,
                s.nama_madrasah,
                s.alamat_madrasah,
                s.lulus_madrasah,
                s.sekolah,
                s.nama_sekolah,
                s.alamat_sekolah,
                s.lulus_sekolah,
                s.npsn,
                s.nsm,
                d.daerah,
                dk.kamar,
                CONCAT(COALESCE(d.daerah, ''), IF(COALESCE(d.daerah, '') <> '' AND COALESCE(dk.kamar, '') <> '', '.', ''), COALESCE(dk.kamar, '')) AS daerah_kamar,
                s.id_kamar,
                s.id_diniyah,
                rd.lembaga_id AS diniyah,
                rd.kelas AS kelas_diniyah,
                rd.kel AS kel_diniyah,
                s.nim_diniyah,
                s.id_formal,
                rf.lembaga_id AS formal,
                rf.kelas AS kelas_formal,
                rf.kel AS kel_formal,
                " . SantriLttqHelper::selectAliasSql() . ",
                s.no_telpon,
                s.no_wa_santri,
                s.email,
                t.id AS id_tugasan,
                t.id_tahun_ajaran AS tahun_ajaran,
                t.id_madrasah,
                m.nama AS nama_madrasah_ugt,
                COALESCE(t.is_aktif, 1) AS is_aktif
                FROM ugt___guru_tugas_tugasan t
                INNER JOIN santri s ON s.id = t.id_santri
                INNER JOIN madrasah m ON m.id = t.id_madrasah
                " . SantriStatusHelper::currentStatusJoinSql('s', 'st', 'ss') . "
                LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                " . SantriLttqHelper::joinSql('s') . "
                LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                LEFT JOIN daerah d ON d.id = dk.id_daerah
                WHERE t.id_tahun_ajaran = ?" . $koordWhere;

        $bind = array_merge([$tahunAjaranUgt], $koordBind);
        $where = [];

        if ($lembaga !== '') {
            $where[] = '(rd.lembaga_id = ? OR rf.lembaga_id = ?)';
            $bind[] = $lembaga;
            $bind[] = $lembaga;
        }
        if ($kelas !== '' && $lembaga !== '') {
            $where[] = '((rd.lembaga_id = ? AND rd.kelas = ?) OR (rf.lembaga_id = ? AND rf.kelas = ?))';
            $bind[] = $lembaga;
            $bind[] = $kelas;
            $bind[] = $lembaga;
            $bind[] = $kelas;
        }
        if ($kel !== '' && $lembaga !== '') {
            $where[] = '((rd.lembaga_id = ? AND rd.kel = ?) OR (rf.lembaga_id = ? AND rf.kel = ?))';
            $bind[] = $lembaga;
            $bind[] = $kel;
            $bind[] = $lembaga;
            $bind[] = $kel;
        }
        if ($statusCsv !== '') {
            $statusList = array_values(array_filter(array_map(static function ($v) {
                $x = strtolower(trim((string) $v));
                if ($x === 'khooriji') {
                    $x = 'khoriji';
                }

                return $x;
            }, explode(',', $statusCsv)), static fn($x) => $x !== ''));
            if ($statusList !== []) {
                $includeEmptyStatus = in_array('__empty__', $statusList, true);
                $statusValues = array_values(array_filter($statusList, static fn($x) => $x !== '__empty__'));
                $statusWhere = [];
                if ($statusValues !== []) {
                    $ph = implode(',', array_fill(0, count($statusValues), '?'));
                    $statusWhere[] = "LOWER(TRIM(COALESCE(st.status_santri, s.status_santri, ''))) IN ($ph)";
                    foreach ($statusValues as $sv) {
                        $bind[] = $sv;
                    }
                }
                if ($includeEmptyStatus) {
                    $statusWhere[] = "TRIM(COALESCE(st.status_santri, s.status_santri, '')) = ''";
                }
                if ($statusWhere !== []) {
                    $where[] = '(' . implode(' OR ', $statusWhere) . ')';
                }
            }
        }
        if ($kategoriCsv !== '') {
            $kategoriList = array_values(array_filter(array_map(static function ($v) {
                return trim((string) $v);
            }, explode(',', $kategoriCsv)), static fn($x) => $x !== ''));
            if ($kategoriList !== []) {
                $includeEmptyKategori = in_array('__empty__', $kategoriList, true);
                $kategoriValues = array_values(array_filter($kategoriList, static fn($x) => $x !== '__empty__'));
                $kategoriWhere = [];
                if ($kategoriValues !== []) {
                    $ph = implode(',', array_fill(0, count($kategoriValues), '?'));
                        $kategoriWhere[] = "TRIM(COALESCE(d.kategori, '')) IN ($ph)";
                    foreach ($kategoriValues as $kv) {
                        $bind[] = $kv;
                    }
                }
                if ($includeEmptyKategori) {
                        $kategoriWhere[] = "TRIM(COALESCE(d.kategori, '')) = ''";
                }
                if ($kategoriWhere !== []) {
                    $where[] = '(' . implode(' OR ', $kategoriWhere) . ')';
                }
            }
        }
        if ($daerah !== '') {
            $where[] = 'd.daerah = ?';
            $bind[] = $daerah;
        }
        if ($kamar !== '') {
            $where[] = 'dk.kamar = ?';
            $bind[] = $kamar;
        }
        if ($tidakDiniyah) {
            $where[] = '(s.id_diniyah IS NULL OR s.id_diniyah = "")';
        }
        if ($tidakFormal) {
            $where[] = '(s.id_formal IS NULL OR s.id_formal = "")';
        }

        if ($where !== []) {
            $sql .= ' AND ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY s.nama ASC, t.id ASC';

        $stmt = $this->db->prepare($sql);
        $stmt->execute($bind);

        return [$stmt->fetchAll(\PDO::FETCH_ASSOC), $bind];
    }

    public function updateSantri(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            if (!$data) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Data wajib diisi'], 400);
            }
            // Sanitasi teks dari ebeddien agar data tersimpan aman (UTF-8 bersih)
            $data = TextSanitizer::sanitizeStringValues($data, []);

            if (!isset($data['id'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID santri wajib diisi'
                ], 400);
            }

            $resolvedId = SantriHelper::resolveId($this->db, $data['id'] ?? null);
            if ($resolvedId === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan'
                ], 404);
            }
            $id = $resolvedId;
            SantriDomisiliHelper::applyKategoriFromKamar($data, $this->db);
            $this->resolveLegacyLttqPayload($data);
            // Simpan kamar hanya via id_kamar (daerah/kamar legacy tidak lagi diupdate)
            $fields = [
                'nama', 'nik', 'nisn', 'no_kk', 'kepala_keluarga', 'tempat_lahir', 'tanggal_lahir', 'gender', 'ayah', 'ibu', 'no_telpon', 'no_wa_santri', 'dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kode_pos', 'kabupaten', 'provinsi',
                'status_ayah', 'nik_ayah', 'tempat_lahir_ayah', 'tanggal_lahir_ayah', 'pekerjaan_ayah', 'pendidikan_ayah', 'penghasilan_ayah',
                'status_ibu', 'nik_ibu', 'tempat_lahir_ibu', 'tanggal_lahir_ibu', 'pekerjaan_ibu', 'pendidikan_ibu', 'penghasilan_ibu',
                'hubungan_wali', 'wali', 'nik_wali', 'tempat_lahir_wali', 'tanggal_lahir_wali', 'pekerjaan_wali', 'pendidikan_wali', 'penghasilan_wali', 'no_telpon_wali',
                'id_diniyah', 'nim_diniyah', 'id_formal', 'nim_formal',
                'id_lttq_tingkatan',
                'id_kamar', 'saudara_di_pesantren'
            ];
            $hasNoTelponWali = $this->db->query("SHOW COLUMNS FROM santri LIKE 'no_telpon_wali'")->rowCount() > 0;
            if (!$hasNoTelponWali) {
                $fields = array_values(array_diff($fields, ['no_telpon_wali']));
            }

            $set = [];
            $params = [];
            foreach ($fields as $f) {
                // array_key_exists: body JSON boleh mengirim null eksplisit (mis. hapus rombel diniyah/formal);
                // isset() salah false untuk null sehingga kolom tidak pernah di-UPDATE.
                if (array_key_exists($f, $data)) {
                    $set[] = "$f = ?";
                    $raw = $data[$f] === '' ? null : $data[$f];
                    $params[] = \is_string($raw) ? ProperCaseHelper::forBiodataField($f, $raw) : $raw;
                }
            }

            $hasStatusKategoriPatch = array_key_exists('status_santri', $data);
            if ($set === [] && !$hasStatusKategoriPatch) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak ada data yang diupdate'
                ], 400);
            }

            $stmtOld = $this->db->prepare("SELECT * FROM santri WHERE id = ?");
            $stmtOld->execute([$id]);
            $oldSantri = $stmtOld->fetch(\PDO::FETCH_ASSOC);
            $oldDiniyah = $oldSantri && isset($oldSantri['id_diniyah']) ? (int) $oldSantri['id_diniyah'] : null;
            $oldFormal = $oldSantri && isset($oldSantri['id_formal']) ? (int) $oldSantri['id_formal'] : null;
            $newDiniyah = array_key_exists('id_diniyah', $data)
                ? ($data['id_diniyah'] === '' || $data['id_diniyah'] === null ? null : (int) $data['id_diniyah'])
                : null;
            $newFormal = array_key_exists('id_formal', $data)
                ? ($data['id_formal'] === '' || $data['id_formal'] === null ? null : (int) $data['id_formal'])
                : null;
            $needRiwayat = ($newDiniyah !== null && $newDiniyah != $oldDiniyah) || ($newFormal !== null && $newFormal != $oldFormal);

            $oldLttq = $oldSantri && isset($oldSantri['id_lttq_tingkatan']) ? (int) $oldSantri['id_lttq_tingkatan'] : null;
            $newLttq = array_key_exists('id_lttq_tingkatan', $data)
                ? ($data['id_lttq_tingkatan'] === '' || $data['id_lttq_tingkatan'] === null ? null : (int) $data['id_lttq_tingkatan'])
                : null;
            $needLttqRiwayat = $newLttq !== null && $newLttq != $oldLttq;

            $oldKamar = $oldSantri && isset($oldSantri['id_kamar']) ? (int) $oldSantri['id_kamar'] : null;
            $newKamar = array_key_exists('id_kamar', $data) ? ($data['id_kamar'] === '' || $data['id_kamar'] === null ? null : (int) $data['id_kamar']) : null;
            $needKamarRiwayat = $newKamar !== null && $newKamar != $oldKamar && $newKamar > 0;

            $idPengurus = null;
            if ($needRiwayat || $needKamarRiwayat || $needLttqRiwayat || $hasStatusKategoriPatch) {
                $idPengurus = isset($data['id_pengurus']) && $data['id_pengurus'] !== '' && $data['id_pengurus'] !== null ? (int) $data['id_pengurus'] : null;
                if (!$idPengurus) {
                    $user = $request->getAttribute('user');
                    $idPengurus = isset($user['id_pengurus']) ? (int) $user['id_pengurus'] : null;
                }
                if (!$idPengurus) {
                    $user = $request->getAttribute('user');
                    $uid = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
                    if ($uid) {
                        $st = $this->db->prepare("SELECT id FROM pengurus WHERE id = ? LIMIT 1");
                        $st->execute([$uid]);
                        $row = $st->fetch(\PDO::FETCH_ASSOC);
                        $idPengurus = $row ? (int) $row['id'] : null;
                        if (!$idPengurus) {
                            $st = $this->db->prepare("SELECT id FROM pengurus WHERE id_user = ? LIMIT 1");
                            $st->execute([$uid]);
                            $row = $st->fetch(\PDO::FETCH_ASSOC);
                            $idPengurus = $row ? (int) $row['id'] : null;
                        }
                    }
                }
                if ($idPengurus !== null && $idPengurus <= 0) {
                    $idPengurus = null;
                }
                // Rombel: wajib ada pengurus; kamar saja boleh NULL (santri / daftar).
                if (($needRiwayat || $needLttqRiwayat) && (!$idPengurus || $idPengurus <= 0)) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'id_pengurus wajib diisi saat mengubah rombel/tingkatan LTTQ. Sertakan di body atau login sebagai pengurus.'
                    ], 400);
                }
            }

            $dbUpdateOk = true;
            if ($set !== []) {
                $params[] = $id;
                $sql = "UPDATE santri SET " . implode(', ', $set) . " WHERE id = ?";
                $stmt = $this->db->prepare($sql);
                $dbUpdateOk = $stmt->execute($params);
            }

            if ($dbUpdateOk) {
                if ($needRiwayat) {
                    $tahunDiniyah = isset($data['tahun_ajaran_diniyah']) && trim((string) $data['tahun_ajaran_diniyah']) !== '' ? trim((string) $data['tahun_ajaran_diniyah']) : SantriRombelHelper::getDefaultTahunAjaran($this->db, 'hijriyah');
                    $tahunFormal = isset($data['tahun_ajaran_formal']) && trim((string) $data['tahun_ajaran_formal']) !== '' ? trim((string) $data['tahun_ajaran_formal']) : SantriRombelHelper::getDefaultTahunAjaran($this->db, 'masehi');
                    $nim = isset($data['nim_diniyah']) ? trim((string) $data['nim_diniyah']) : (isset($data['nim_formal']) ? trim((string) $data['nim_formal']) : null);
                    try {
                        if ($newDiniyah !== null && $newDiniyah != $oldDiniyah && $newDiniyah > 0 && $tahunDiniyah) {
                            SantriRombelHelper::appendRombelRiwayat($this->db, $id, $newDiniyah, $tahunDiniyah, $idPengurus, $nim ?: null);
                        }
                        if ($newFormal !== null && $newFormal != $oldFormal && $newFormal > 0 && $tahunFormal) {
                            SantriRombelHelper::appendRombelRiwayat($this->db, $id, $newFormal, $tahunFormal, $idPengurus, $nim ?: null);
                        }
                    } catch (\InvalidArgumentException $e) {
                        return $this->jsonResponse($response, ['success' => false, 'message' => $e->getMessage()], 400);
                    }
                }
                if ($needLttqRiwayat) {
                    $tahunLttq = isset($data['tahun_ajaran_lttq']) && trim((string) $data['tahun_ajaran_lttq']) !== ''
                        ? trim((string) $data['tahun_ajaran_lttq'])
                        : SantriLttqHelper::getDefaultTahunAjaran($this->db, 'hijriyah');
                    $nimLttq = isset($data['nis']) ? trim((string) $data['nis']) : (isset($oldSantri['nis']) ? trim((string) $oldSantri['nis']) : null);
                    try {
                        if ($newLttq > 0 && $tahunLttq) {
                            SantriLttqHelper::appendLttqRiwayat($this->db, $id, $newLttq, $tahunLttq, $idPengurus, $nimLttq ?: null);
                        }
                    } catch (\InvalidArgumentException $e) {
                        return $this->jsonResponse($response, ['success' => false, 'message' => $e->getMessage()], 400);
                    }
                }
                if ($needKamarRiwayat) {
                    $tahunKamar = isset($data['tahun_ajaran_kamar']) && trim((string) $data['tahun_ajaran_kamar']) !== '' ? trim((string) $data['tahun_ajaran_kamar']) : SantriRombelHelper::getDefaultTahunAjaran($this->db, 'hijriyah');
                    if ($tahunKamar) {
                        try {
                            SantriKamarHelper::appendKamarRiwayat($this->db, $id, $newKamar, $tahunKamar, $idPengurus);
                        } catch (\InvalidArgumentException $e) {
                            return $this->jsonResponse($response, ['success' => false, 'message' => $e->getMessage()], 400);
                        }
                    }
                }
                if (array_key_exists('status_santri', $data)) {
                    $rawStatus = trim((string) ($data['status_santri'] ?? ''));
                    if ($rawStatus === '') {
                        return $this->jsonResponse($response, [
                            'success' => false,
                            'message' => 'Status santri wajib diisi',
                        ], 400);
                    }
                    $normalized = SantriStatusHelper::normalize($rawStatus);
                    if ($normalized === null) {
                        return $this->jsonResponse($response, [
                            'success' => false,
                            'message' => 'Status santri tidak valid. Pilih: ' . implode(', ', SantriStatusHelper::ALLOWED),
                        ], 400);
                    }
                    SantriStatusHelper::applyCurrentStatus($this->db, $id, $normalized, $idPengurus);
                } else {
                    // Jaring pengaman: status tidak boleh kosong setelah update biodata lain
                    SantriStatusHelper::ensureCurrentStatus($this->db, $id, null, null, $idPengurus);
                }

                $stmtNew = $this->db->prepare("SELECT * FROM santri WHERE id = ?");
                $stmtNew->execute([$id]);
                $newSantri = $stmtNew->fetch(\PDO::FETCH_ASSOC);
                $user = $request->getAttribute('user');
                $idAdmin = $user['user_id'] ?? $user['id'] ?? null;
                if ($oldSantri && $newSantri) {
                    UserAktivitasLogger::log(null, $idAdmin, UserAktivitasLogger::ACTION_UPDATE, 'santri', $id, $oldSantri, $newSantri, $request);
                }
                LiveSantriIndexNotifier::ping();
                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Biodata berhasil diupdate'
                ], 200);
            } else {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Gagal update'
                ], 500);
            }

        } catch (\Exception $e) {
            error_log("Update santri error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate data santri'
            ], 500);
        }
    }

    /**
     * POST /api/santri/public-view-token — Terbitkan signed token untuk halaman publik biodata/ijin/shohifah/registrasi (staff login).
     * Body: { id_santri, scope?: biodata|ijin|shohifah_read|shohifah_write|registrasi|all, ttl?: int }
     */
    public function issuePublicSantriViewToken(Request $request, Response $response): Response
    {
        try {
            $body = $request->getParsedBody();
            $idParam = is_array($body) ? ($body['id_santri'] ?? null) : null;
            $scope = is_array($body)
                ? trim((string) ($body['scope'] ?? PublicSantriViewTokenHelper::SCOPE_ALL))
                : PublicSantriViewTokenHelper::SCOPE_ALL;
            $ttl = is_array($body) && isset($body['ttl']) ? (int) $body['ttl'] : null;

            if ($idParam === null || $idParam === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_santri wajib diisi',
                ], 400);
            }
            if (!in_array($scope, PublicSantriViewTokenHelper::ALLOWED_SCOPES, true)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Scope tidak valid',
                ], 400);
            }

            $resolvedId = SantriHelper::resolveId($this->db, $idParam);
            if ($resolvedId === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan',
                ], 404);
            }

            $user = $request->getAttribute('user');
            if (!is_array($user) || !RoleHelper::tokenUnionHasAnyEbeddienFiturAssignment($this->db, $user)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Akses ditolak',
                ], 403);
            }

            $token = PublicSantriViewTokenHelper::issue((int) $resolvedId, $scope, $ttl);
            if ($token === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Gagal membuat token',
                ], 500);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'token' => $token,
                    'scope' => $scope,
                    'id_santri' => (int) $resolvedId,
                ],
            ], 200);
        } catch (\Exception $e) {
            error_log('issuePublicSantriViewToken error: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal membuat token akses publik',
            ], 500);
        }
    }

    public function getPublicSantri(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $id = $queryParams['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID santri wajib diisi'
                ], 400);
            }

            $resolvedId = SantriHelper::resolveId($this->db, $id);
            if ($resolvedId === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan'
                ], 404);
            }

            $fullAccess = SantriJwtAccessHelper::canAccessFullSantriData(
                $this->db,
                $request,
                (int) $resolvedId,
                PublicSantriViewTokenHelper::SCOPE_BIODATA
            );
            if (!$fullAccess) {
                $user = SantriJwtAccessHelper::extractOptionalJwtUser($request);
                $hasCred = $user !== null
                    || SantriJwtAccessHelper::extractViewToken($request) !== null;
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => $hasCred
                        ? 'Akses ditolak untuk data santri ini'
                        : 'Wajib login atau view_token untuk melihat data santri',
                ], $hasCred ? 403 : 401);
            }

            // Cek apakah kolom no_telpon_wali ada di tabel
            $checkColumn = $this->db->query("SHOW COLUMNS FROM santri LIKE 'no_telpon_wali'");
            $hasNoTelponWali = $checkColumn->rowCount() > 0;
            
            // Ambil data santri untuk public view (termasuk nis untuk tampilan)
            $sql = "SELECT 
                s.id, s.nis, s.nama, s.nik, s.tempat_lahir, s.tanggal_lahir, s.gender, 
                s.ayah, s.status_ayah, s.nik_ayah, s.tempat_lahir_ayah, s.tanggal_lahir_ayah,
                s.pekerjaan_ayah, s.pendidikan_ayah, s.penghasilan_ayah,
                s.ibu, s.status_ibu, s.nik_ibu, s.tempat_lahir_ibu, s.tanggal_lahir_ibu,
                s.pekerjaan_ibu, s.pendidikan_ibu, s.penghasilan_ibu,
                s.hubungan_wali, s.wali, s.nik_wali, s.tempat_lahir_wali, s.tanggal_lahir_wali,
                s.pekerjaan_wali, s.pendidikan_wali, s.penghasilan_wali,
                s.no_telpon, s.email, s.no_wa_santri" . 
                ($hasNoTelponWali ? ", s.no_telpon_wali" : "") . 
                ", s.dusun, s.rt, s.rw, s.desa, s.kecamatan, s.kode_pos, s.kabupaten, s.provinsi,
                rd.lembaga_id AS diniyah, rd.kelas AS kelas_diniyah, rd.kel AS kel_diniyah,
                rf.lembaga_id AS formal, rf.kelas AS kelas_formal, rf.kel AS kel_formal,
                " . SantriLttqHelper::selectAliasSql() . ",
                d.daerah, dk.kamar, s.id_kamar,
                COALESCE(st.status_santri, s.status_santri, '') AS status_santri,
                COALESCE(d.kategori, '') AS kategori, s.saudara_di_pesantren
                FROM santri s
                LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                " . SantriLttqHelper::joinSql('s') . "
                LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                LEFT JOIN daerah d ON d.id = dk.id_daerah
                " . SantriStatusHelper::currentStatusJoinSql('s', 'st', 'ss') . "
                WHERE s.id = ? LIMIT 1";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$resolvedId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            if ($row) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => $row,
                    'redacted' => false,
                ], 200);
            } else {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan'
                ], 404);
            }

        } catch (\Exception $e) {
            error_log("Get public santri error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error fetching santri data'
            ], 500);
        }
    }

    public function getPublicShohifah(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idSantri = $queryParams['id_santri'] ?? null;
            $tahunAjaran = $queryParams['tahun_ajaran'] ?? null;

            if (!$idSantri) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID santri wajib diisi'
                ], 400);
            }

            if (!$tahunAjaran) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tahun ajaran wajib diisi'
                ], 400);
            }

            $resolvedId = SantriHelper::resolveId($this->db, $idSantri);
            if ($resolvedId === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan'
                ], 404);
            }

            $sql = "SELECT sh.*, s.nis FROM santri___shohifah sh INNER JOIN santri s ON sh.id_santri = s.id WHERE sh.id_santri = ? AND sh.tahun_ajaran = ? LIMIT 1";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$resolvedId, $tahunAjaran]);
            $data = $stmt->fetch(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data ?: null
            ], 200);

        } catch (\Exception $e) {
            error_log("Get public shohifah error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan'
            ], 500);
        }
    }

    public function savePublicShohifah(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();

            if (!isset($data['id_santri']) || !isset($data['tahun_ajaran'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'id_santri dan tahun_ajaran wajib diisi'
                ], 400);
            }

            $resolvedId = SantriHelper::resolveId($this->db, $data['id_santri']);
            if ($resolvedId === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan'
                ], 404);
            }

            $canWrite = false;
            $bodyToken = isset($data['view_token']) ? trim((string) $data['view_token']) : '';
            if ($bodyToken !== '') {
                $verified = PublicSantriViewTokenHelper::verify($bodyToken);
                if (
                    is_array($verified)
                    && (int) $verified['id_santri'] === (int) $resolvedId
                    && PublicSantriViewTokenHelper::scopeAllows((string) $verified['scope'], PublicSantriViewTokenHelper::SCOPE_SHOHIFAH_WRITE)
                ) {
                    $canWrite = true;
                }
            }
            if (!$canWrite) {
                $bound = SantriJwtAccessHelper::resolveJwtBoundSantriId(
                    $this->db,
                    is_array($request->getAttribute('user')) ? $request->getAttribute('user') : SantriJwtAccessHelper::extractOptionalJwtUser($request)
                );
                $canWrite = $bound !== null && $bound === (int) $resolvedId;
            }
            if (!$canWrite && SantriJwtAccessHelper::canAccessFullSantriData(
                $this->db,
                $request,
                (int) $resolvedId,
                PublicSantriViewTokenHelper::SCOPE_SHOHIFAH_WRITE
            )) {
                $canWrite = true;
            }
            if (!$canWrite) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Token tulis atau login santri diperlukan untuk menyimpan shohifah'
                ], 403);
            }

            // Cek apakah data sudah ada (pakai id untuk relasi)
            $checkSql = "SELECT id_santri, tahun_ajaran FROM santri___shohifah WHERE id_santri = ? AND tahun_ajaran = ?";
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$resolvedId, $data['tahun_ajaran']]);
            $existing = $checkStmt->fetch(\PDO::FETCH_ASSOC);

            if ($existing) {
                // Update existing data
                $sql = "UPDATE santri___shohifah SET 
                    sholat_jamaah_5_waktu = ?,
                    sholat_tarawih = ?,
                    sholat_witir = ?,
                    sholat_tahajjud = ?,
                    sholat_dhuha = ?,
                    puasa_ramadhan_status = ?,
                    puasa_ramadhan_alasan = ?,
                    khatam_alquran_status = ?,
                    khatam_alquran_jumlah = ?,
                    khatam_alquran_tanggal = ?,
                    kitab_a_nama = ?,
                    kitab_a_status = ?,
                    kitab_b_nama = ?,
                    kitab_b_status = ?,
                    kitab_c_nama = ?,
                    kitab_c_status = ?,
                    berbakti_orang_tua = ?,
                    akhlaq_pergaulan = ?,
                    syawal_kembali_hari = ?,
                    syawal_kembali_tanggal = ?,
                    tanggal_update = CURRENT_TIMESTAMP
                    WHERE id_santri = ? AND tahun_ajaran = ?";

                $stmt = $this->db->prepare($sql);
                $stmt->execute([
                    $data['sholat_jamaah_5_waktu'] ?? null,
                    $data['sholat_tarawih'] ?? null,
                    $data['sholat_witir'] ?? null,
                    $data['sholat_tahajjud'] ?? null,
                    $data['sholat_dhuha'] ?? null,
                    $data['puasa_ramadhan_status'] ?? null,
                    $data['puasa_ramadhan_alasan'] ?? null,
                    $data['khatam_alquran_status'] ?? null,
                    $data['khatam_alquran_jumlah'] ?? null,
                    $data['khatam_alquran_tanggal'] ?? null,
                    $data['kitab_a_nama'] ?? null,
                    $data['kitab_a_status'] ?? null,
                    $data['kitab_b_nama'] ?? null,
                    $data['kitab_b_status'] ?? null,
                    $data['kitab_c_nama'] ?? null,
                    $data['kitab_c_status'] ?? null,
                    $data['berbakti_orang_tua'] ?? null,
                    $data['akhlaq_pergaulan'] ?? null,
                    $data['syawal_kembali_hari'] ?? null,
                    $data['syawal_kembali_tanggal'] ?? null,
                    $resolvedId,
                    $data['tahun_ajaran']
                ]);
            } else {
                // Insert new data
                $sql = "INSERT INTO santri___shohifah (
                    id_santri, tahun_ajaran,
                    sholat_jamaah_5_waktu, sholat_tarawih, sholat_witir, sholat_tahajjud, sholat_dhuha,
                    puasa_ramadhan_status, puasa_ramadhan_alasan,
                    khatam_alquran_status, khatam_alquran_jumlah, khatam_alquran_tanggal,
                    kitab_a_nama, kitab_a_status, kitab_b_nama, kitab_b_status, kitab_c_nama, kitab_c_status,
                    berbakti_orang_tua, akhlaq_pergaulan,
                    syawal_kembali_hari, syawal_kembali_tanggal
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

                $stmt = $this->db->prepare($sql);
                $stmt->execute([
                    $resolvedId,
                    $data['tahun_ajaran'],
                    $data['sholat_jamaah_5_waktu'] ?? null,
                    $data['sholat_tarawih'] ?? null,
                    $data['sholat_witir'] ?? null,
                    $data['sholat_tahajjud'] ?? null,
                    $data['sholat_dhuha'] ?? null,
                    $data['puasa_ramadhan_status'] ?? null,
                    $data['puasa_ramadhan_alasan'] ?? null,
                    $data['khatam_alquran_status'] ?? null,
                    $data['khatam_alquran_jumlah'] ?? null,
                    $data['khatam_alquran_tanggal'] ?? null,
                    $data['kitab_a_nama'] ?? null,
                    $data['kitab_a_status'] ?? null,
                    $data['kitab_b_nama'] ?? null,
                    $data['kitab_b_status'] ?? null,
                    $data['kitab_c_nama'] ?? null,
                    $data['kitab_c_status'] ?? null,
                    $data['berbakti_orang_tua'] ?? null,
                    $data['akhlaq_pergaulan'] ?? null,
                    $data['syawal_kembali_hari'] ?? null,
                    $data['syawal_kembali_tanggal'] ?? null
                ]);
            }

            // Get updated data (return dengan nis untuk tampilan)
            $getSql = "SELECT sh.*, s.nis FROM santri___shohifah sh INNER JOIN santri s ON sh.id_santri = s.id WHERE sh.id_santri = ? AND sh.tahun_ajaran = ? LIMIT 1";
            $getStmt = $this->db->prepare($getSql);
            $getStmt->execute([$resolvedId, $data['tahun_ajaran']]);
            $updatedData = $getStmt->fetch(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data shohifah berhasil disimpan',
                'data' => $updatedData
            ], 200);

        } catch (\Exception $e) {
            error_log("Save public shohifah error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan'
            ], 500);
        }
    }

    /**
     * GET /api/santri/by-kelas?mode=diniyah|formal&id_rombel=123
     * Mengembalikan daftar santri yang sesuai rombel (id_diniyah atau id_formal = id_rombel).
     */
    public function getSantriByKelas(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $mode = isset($params['mode']) ? strtolower(trim($params['mode'])) : 'diniyah';
            if (!in_array($mode, ['diniyah', 'formal'], true)) {
                $mode = 'diniyah';
            }
            $idRombel = isset($params['id_rombel']) ? (int) $params['id_rombel'] : 0;
            if ($idRombel <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'id_rombel wajib diisi',
                    'data' => []
                ], 400);
            }

            $statusJoin = SantriStatusHelper::currentStatusJoinSql('s', 'st', 'ss');
            if ($mode === 'diniyah') {
                $sql = "SELECT
                        s.id, s.nis, s.nama, COALESCE(st.status_santri, s.status_santri, '') AS status_santri,
                        s.id_diniyah AS id_rombel,
                        s.id_diniyah, rd.lembaga_id AS diniyah, ld.nama AS diniyah_lembaga_nama, rd.kelas AS kelas_diniyah, rd.kel AS kel_diniyah,
                        s.id_formal, rf.lembaga_id AS formal, lf.nama AS formal_lembaga_nama, rf.kelas AS kelas_formal, rf.kel AS kel_formal,
                        s.id_kamar, d.daerah, dk.kamar,
                        CONCAT(COALESCE(d.daerah, ''), IF(COALESCE(d.daerah, '') <> '' AND COALESCE(dk.kamar, '') <> '', '.', ''), COALESCE(dk.kamar, '')) AS daerah_kamar
                    FROM santri s
                    {$statusJoin}
                    LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                    LEFT JOIN lembaga ld ON ld.id = rd.lembaga_id
                    LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                    LEFT JOIN lembaga lf ON lf.id = rf.lembaga_id
                    LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                    LEFT JOIN daerah d ON d.id = dk.id_daerah
                    WHERE s.id_diniyah = ? ORDER BY s.nama";
            } else {
                $sql = "SELECT
                        s.id, s.nis, s.nama, COALESCE(st.status_santri, s.status_santri, '') AS status_santri,
                        s.id_formal AS id_rombel,
                        s.id_diniyah, rd.lembaga_id AS diniyah, ld.nama AS diniyah_lembaga_nama, rd.kelas AS kelas_diniyah, rd.kel AS kel_diniyah,
                        s.id_formal, rf.lembaga_id AS formal, lf.nama AS formal_lembaga_nama, rf.kelas AS kelas_formal, rf.kel AS kel_formal,
                        s.id_kamar, d.daerah, dk.kamar,
                        CONCAT(COALESCE(d.daerah, ''), IF(COALESCE(d.daerah, '') <> '' AND COALESCE(dk.kamar, '') <> '', '.', ''), COALESCE(dk.kamar, '')) AS daerah_kamar
                    FROM santri s
                    {$statusJoin}
                    LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                    LEFT JOIN lembaga ld ON ld.id = rd.lembaga_id
                    LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                    LEFT JOIN lembaga lf ON lf.id = rf.lembaga_id
                    LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                    LEFT JOIN daerah d ON d.id = dk.id_daerah
                    WHERE s.id_formal = ? ORDER BY s.nama";
            }
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idRombel]);

            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data
            ], 200);
        } catch (\Exception $e) {
            error_log("getSantriByKelas error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data santri',
                'data' => []
            ], 500);
        }
    }

    /**
     * GET /api/santri/excel-raw
     * Data ringkas untuk editor spreadsheet.
     */
    public function getExcelRawSantri(Request $request, Response $response): Response
    {
        try {
            $q = $request->getQueryParams();
            $lembaga = isset($q['lembaga']) ? trim((string) $q['lembaga']) : '';
            $kelas = isset($q['kelas']) ? trim((string) $q['kelas']) : '';
            $kel = isset($q['kel']) ? trim((string) $q['kel']) : '';
            $statusCsv = isset($q['status']) ? trim((string) $q['status']) : '';
            $kategoriCsv = isset($q['kategori']) ? trim((string) $q['kategori']) : '';
            $daerah = isset($q['daerah']) ? trim((string) $q['daerah']) : '';
            $kamar = isset($q['kamar']) ? trim((string) $q['kamar']) : '';
            $tidakDiniyah = isset($q['tidak_diniyah']) && (string) $q['tidak_diniyah'] === '1';
            $tidakFormal = isset($q['tidak_formal']) && (string) $q['tidak_formal'] === '1';
            $ugtExcel = isset($q['ugt_guru_tugas']) && ((string) $q['ugt_guru_tugas'] === '1' || strtolower((string) $q['ugt_guru_tugas']) === 'true');
            $tahunAjaranUgt = isset($q['tahun_ajaran_ugt']) ? trim((string) $q['tahun_ajaran_ugt']) : '';

            if ($ugtExcel) {
                if ($tahunAjaranUgt === '' || preg_match('/^[0-9A-Za-z\\-\\.]+$/', $tahunAjaranUgt) !== 1) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Mode Guru Tugas: tahun_ajaran_ugt wajib (format tahun ajaran master)',
                        'data' => [],
                    ], 400);
                }
                if (!$this->tableExists('ugt___guru_tugas_tugasan')) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Tabel penugasan UGT belum tersedia',
                        'data' => [],
                    ], 503);
                }
                $reqUser = $request->getAttribute('user');
                $reqUserArr = is_array($reqUser) ? $reqUser : [];
                [$rows] = $this->fetchExcelRawUgtGuruTugasRows(
                    $tahunAjaranUgt,
                    $reqUserArr,
                    $lembaga,
                    $kelas,
                    $kel,
                    $statusCsv,
                    $kategoriCsv,
                    $daerah,
                    $kamar,
                    $tidakDiniyah,
                    $tidakFormal
                );

                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => $rows,
                ], 200);
            }

            $ugtExcelJoin = '';
            $ugtExcelSelect = ', NULL AS id_madrasah, NULL AS nama_madrasah_ugt';
            if ($ugtExcel && $tahunAjaranUgt !== '' && preg_match('/^[0-9A-Za-z\\-\\.]+$/', $tahunAjaranUgt) === 1 && $this->tableExists('ugt___guru_tugas_tugasan')) {
                $taEsc = $this->db->quote($tahunAjaranUgt);
                $ugtExcelSelect = ', ugt_excel.id_madrasah, ugt_excel.nama_madrasah_ugt';
                $ugtExcelJoin = "
                LEFT JOIN (
                    SELECT t1.id_santri, t1.id_madrasah, m.nama AS nama_madrasah_ugt
                    FROM ugt___guru_tugas_tugasan t1
                    INNER JOIN (
                        SELECT id_santri, MAX(id) AS mx
                        FROM ugt___guru_tugas_tugasan
                        WHERE id_tahun_ajaran = {$taEsc} AND COALESCE(is_aktif, 1) = 1
                        GROUP BY id_santri
                    ) pick ON pick.mx = t1.id
                    INNER JOIN madrasah m ON m.id = t1.id_madrasah
                ) ugt_excel ON ugt_excel.id_santri = s.id";
            }

            $sql = "SELECT
                s.id,
                s.nis,
                s.nama,
                s.nik,
                s.tempat_lahir,
                s.tanggal_lahir,
                s.gender,
                s.nisn,
                s.no_kk,
                s.kepala_keluarga,
                s.anak_ke,
                s.jumlah_saudara,
                s.ayah,
                s.status_ayah,
                s.nik_ayah,
                s.tempat_lahir_ayah,
                s.tanggal_lahir_ayah,
                s.pekerjaan_ayah,
                s.pendidikan_ayah,
                s.penghasilan_ayah,
                s.ibu,
                s.status_ibu,
                s.nik_ibu,
                s.tempat_lahir_ibu,
                s.tanggal_lahir_ibu,
                s.pekerjaan_ibu,
                s.pendidikan_ibu,
                s.penghasilan_ibu,
                s.hubungan_wali,
                s.wali,
                s.nik_wali,
                s.tempat_lahir_wali,
                s.tanggal_lahir_wali,
                s.pekerjaan_wali,
                s.pendidikan_wali,
                s.penghasilan_wali,
                COALESCE(st.status_santri, s.status_santri, '') AS status_santri,
                COALESCE(d.kategori, '') AS kategori,
                s.status_pendaftar,
                s.status_murid,
                s.status_nikah,
                s.pekerjaan,
                s.saudara_di_pesantren,
                s.hobi,
                s.cita_cita,
                s.kebutuhan_khusus,
                s.riwayat_sakit,
                s.ukuran_baju,
                s.kip,
                s.pkh,
                s.kks,
                s.dusun,
                s.rt,
                s.rw,
                s.desa,
                s.kecamatan,
                s.kabupaten,
                s.provinsi,
                s.kode_pos,
                s.madrasah,
                s.nama_madrasah,
                s.alamat_madrasah,
                s.lulus_madrasah,
                s.sekolah,
                s.nama_sekolah,
                s.alamat_sekolah,
                s.lulus_sekolah,
                s.npsn,
                s.nsm,
                d.daerah,
                dk.kamar,
                CONCAT(COALESCE(d.daerah, ''), IF(COALESCE(d.daerah, '') <> '' AND COALESCE(dk.kamar, '') <> '', '.', ''), COALESCE(dk.kamar, '')) AS daerah_kamar,
                s.id_kamar,
                s.id_diniyah,
                rd.lembaga_id AS diniyah,
                rd.kelas AS kelas_diniyah,
                rd.kel AS kel_diniyah,
                s.nim_diniyah,
                s.id_formal,
                rf.lembaga_id AS formal,
                rf.kelas AS kelas_formal,
                rf.kel AS kel_formal,
                s.nim_formal,
                " . SantriLttqHelper::selectAliasSql() . ",
                s.no_telpon,
                s.no_wa_santri,
                s.email
                {$ugtExcelSelect}
                FROM santri s
                " . SantriStatusHelper::currentStatusJoinSql('s', 'st', 'ss') . "
                LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                " . SantriLttqHelper::joinSql('s') . "
                LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                LEFT JOIN daerah d ON d.id = dk.id_daerah{$ugtExcelJoin}";

            $where = [];
            $bind = [];

            if ($lembaga !== '') {
                $where[] = '(rd.lembaga_id = ? OR rf.lembaga_id = ?)';
                $bind[] = $lembaga;
                $bind[] = $lembaga;
            }

            if ($kelas !== '' && $lembaga !== '') {
                $where[] = '((rd.lembaga_id = ? AND rd.kelas = ?) OR (rf.lembaga_id = ? AND rf.kelas = ?))';
                $bind[] = $lembaga;
                $bind[] = $kelas;
                $bind[] = $lembaga;
                $bind[] = $kelas;
            }

            if ($kel !== '' && $lembaga !== '') {
                $where[] = '((rd.lembaga_id = ? AND rd.kel = ?) OR (rf.lembaga_id = ? AND rf.kel = ?))';
                $bind[] = $lembaga;
                $bind[] = $kel;
                $bind[] = $lembaga;
                $bind[] = $kel;
            }

            if ($statusCsv !== '') {
                $statusList = array_values(array_filter(array_map(static function ($v) {
                    $x = strtolower(trim((string) $v));
                    if ($x === 'khooriji') $x = 'khoriji';
                    return $x;
                }, explode(',', $statusCsv)), static function ($x) {
                    return $x !== '';
                }));
                if ($statusList !== []) {
                    $includeEmptyStatus = in_array('__empty__', $statusList, true);
                    $statusValues = array_values(array_filter($statusList, static fn($x) => $x !== '__empty__'));
                    $statusWhere = [];
                    if ($statusValues !== []) {
                        $ph = implode(',', array_fill(0, count($statusValues), '?'));
                        $statusWhere[] = "LOWER(TRIM(COALESCE(st.status_santri, s.status_santri, ''))) IN ($ph)";
                        foreach ($statusValues as $sv) $bind[] = $sv;
                    }
                    if ($includeEmptyStatus) {
                        $statusWhere[] = "TRIM(COALESCE(st.status_santri, s.status_santri, '')) = ''";
                    }
                    if ($statusWhere !== []) {
                        $where[] = '(' . implode(' OR ', $statusWhere) . ')';
                    }
                }
            }

            if ($kategoriCsv !== '') {
                $kategoriList = array_values(array_filter(array_map(static function ($v) {
                    return trim((string) $v);
                }, explode(',', $kategoriCsv)), static function ($x) {
                    return $x !== '';
                }));
                if ($kategoriList !== []) {
                    $includeEmptyKategori = in_array('__empty__', $kategoriList, true);
                    $kategoriValues = array_values(array_filter($kategoriList, static fn($x) => $x !== '__empty__'));
                    $kategoriWhere = [];
                    if ($kategoriValues !== []) {
                        $ph = implode(',', array_fill(0, count($kategoriValues), '?'));
                        $kategoriWhere[] = "TRIM(COALESCE(d.kategori, '')) IN ($ph)";
                        foreach ($kategoriValues as $kv) $bind[] = $kv;
                    }
                    if ($includeEmptyKategori) {
                        $kategoriWhere[] = "TRIM(COALESCE(d.kategori, '')) = ''";
                    }
                    if ($kategoriWhere !== []) {
                        $where[] = '(' . implode(' OR ', $kategoriWhere) . ')';
                    }
                }
            }
            if ($daerah !== '') {
                $where[] = 'd.daerah = ?';
                $bind[] = $daerah;
            }
            if ($kamar !== '') {
                $where[] = 'dk.kamar = ?';
                $bind[] = $kamar;
            }
            if ($tidakDiniyah) {
                $where[] = '(s.id_diniyah IS NULL OR s.id_diniyah = "")';
            }
            if ($tidakFormal) {
                $where[] = '(s.id_formal IS NULL OR s.id_formal = "")';
            }

            if ($where !== []) {
                $sql .= ' WHERE ' . implode(' AND ', $where);
            }
            $sql .= ' ORDER BY s.id ASC';

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows
            ], 200);
        } catch (\Exception $e) {
            error_log("Get excel raw santri error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data mentah santri',
                'data' => []
            ], 500);
        }
    }

    /**
     * POST /api/santri/excel-bulk-update
     * Body: { rows: [{id, ...fields}] }
     */
    public function bulkUpdateSantriFromExcel(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getParsedBody();
            $rows = is_array($payload['rows'] ?? null) ? $payload['rows'] : [];
            if ($rows === []) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'rows wajib diisi'
                ], 400);
            }

            $ugtExcel = !empty($payload['ugt_guru_tugas']);
            $tahunAjaranUgt = isset($payload['tahun_ajaran_ugt']) ? trim((string) $payload['tahun_ajaran_ugt']) : '';
            if ($ugtExcel) {
                if ($tahunAjaranUgt === '' || preg_match('/^[0-9A-Za-z\\-\\.]+$/', $tahunAjaranUgt) !== 1) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Mode Guru Tugas: tahun_ajaran_ugt wajib (format tahun ajaran master)',
                    ], 400);
                }
                if (!$this->tableExists('ugt___guru_tugas_tugasan')) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Tabel penugasan UGT belum tersedia',
                    ], 503);
                }
            }

            $allowedFields = [
                'nama', 'tempat_lahir', 'tanggal_lahir', 'gender', 'nisn', 'no_kk', 'kepala_keluarga', 'anak_ke', 'jumlah_saudara',
                'ayah', 'status_ayah', 'nik_ayah', 'tempat_lahir_ayah', 'tanggal_lahir_ayah', 'pekerjaan_ayah', 'pendidikan_ayah', 'penghasilan_ayah',
                'ibu', 'status_ibu', 'nik_ibu', 'tempat_lahir_ibu', 'tanggal_lahir_ibu', 'pekerjaan_ibu', 'pendidikan_ibu', 'penghasilan_ibu',
                'hubungan_wali', 'wali', 'nik_wali', 'tempat_lahir_wali', 'tanggal_lahir_wali', 'pekerjaan_wali', 'pendidikan_wali', 'penghasilan_wali',
                'status_pendaftar', 'status_murid', 'status_nikah', 'pekerjaan',
                'saudara_di_pesantren', 'hobi', 'cita_cita', 'kebutuhan_khusus', 'riwayat_sakit', 'ukuran_baju', 'kip', 'pkh', 'kks',
                'dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kabupaten', 'provinsi', 'kode_pos',
                'madrasah', 'nama_madrasah', 'alamat_madrasah', 'lulus_madrasah',
                'sekolah', 'nama_sekolah', 'alamat_sekolah', 'lulus_sekolah', 'npsn', 'nsm',
                'id_kamar', 'id_diniyah', 'nim_diniyah', 'id_formal', 'nim_formal',
                'id_lttq_tingkatan',
                'no_telpon', 'no_wa_santri', 'email'
            ];

            $this->db->beginTransaction();
            $updated = 0;
            $skipped = 0;
            $errors = [];
            $reqUser = $request->getAttribute('user');
            $reqUserArr = is_array($reqUser) ? $reqUser : [];
            $pengurusId = isset($reqUserArr['id_pengurus']) ? (int) $reqUserArr['id_pengurus'] : null;
            if (!$pengurusId && isset($reqUserArr['user_id'])) {
                $pengurusId = (int) $reqUserArr['user_id'];
            }

            foreach ($rows as $idx => $row) {
                if (!is_array($row)) {
                    $skipped++;
                    continue;
                }
                $idRaw = $row['id'] ?? null;
                $resolvedId = SantriHelper::resolveId($this->db, $idRaw);
                if ($resolvedId === null) {
                    $errors[] = "Baris " . ($idx + 1) . ": ID santri tidak valid";
                    continue;
                }

                $didUgt = false;
                if ($ugtExcel && (
                    array_key_exists('id_madrasah', $row)
                    || array_key_exists('tahun_ajaran', $row)
                    || array_key_exists('is_aktif', $row)
                    || array_key_exists('id_tugasan', $row)
                )) {
                    $ugtRes = $this->syncExcelGuruTugasTugasanRow($resolvedId, $row, $tahunAjaranUgt, $reqUserArr);
                    if (!$ugtRes['ok']) {
                        $errors[] = 'Baris ' . ($idx + 1) . ': ' . ($ugtRes['message'] ?? 'Penugasan UGT gagal');
                    } else {
                        $didUgt = true;
                    }
                }

                $set = [];
                $params = [];
                foreach ($allowedFields as $field) {
                    if (!array_key_exists($field, $row)) {
                        continue;
                    }
                    $set[] = $field . " = ?";
                    $val = $row[$field];
                    if ($val === '') {
                        $val = null;
                    }
                    if (\is_string($val)) {
                        $val = TextSanitizer::cleanTextOrNull($val);
                        $val = ProperCaseHelper::forBiodataField($field, $val);
                    }
                    $params[] = $val;
                }

                $isRowUpdated = false;
                if ($set !== []) {
                    $oldStmt = $this->db->prepare("SELECT * FROM santri WHERE id = ? LIMIT 1");
                    $oldStmt->execute([$resolvedId]);
                    $oldRow = $oldStmt->fetch(\PDO::FETCH_ASSOC) ?: [];

                    $params[] = $resolvedId;
                    $sql = "UPDATE santri SET " . implode(', ', $set) . " WHERE id = ?";
                    $stmt = $this->db->prepare($sql);
                    $stmt->execute($params);
                    $isRowUpdated = $stmt->rowCount() > 0;
                } else {
                    $oldRow = [];
                }

                if ($didUgt || $isRowUpdated) {
                    $updated++;
                } else {
                    $skipped++;
                    continue;
                }

                if ($isRowUpdated) {
                    $oldChanged = [];
                    $newChanged = [];
                    foreach ($allowedFields as $field) {
                        if (!array_key_exists($field, $row)) {
                            continue;
                        }
                        $oldVal = $oldRow[$field] ?? null;
                        $newVal = $row[$field];
                        if ($newVal === '') $newVal = null;
                        if ((string) ($oldVal ?? '') === (string) ($newVal ?? '')) {
                            continue;
                        }
                        $oldChanged[$field] = $oldVal;
                        $newChanged[$field] = $newVal;
                    }

                    if ($oldChanged !== [] || $newChanged !== []) {
                        UserAktivitasLogger::log(
                            null,
                            $pengurusId,
                            UserAktivitasLogger::ACTION_UPDATE,
                            'santri',
                            (string) $resolvedId,
                            $oldChanged,
                            $newChanged,
                            $request
                        );
                    }
                }
            }

            $this->db->commit();
            if ($updated > 0) {
                LiveSantriIndexNotifier::ping();
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Bulk update selesai',
                'updated' => $updated,
                'skipped' => $skipped,
                'errors' => $errors
            ], 200);
        } catch (\Exception $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log("Bulk update santri excel error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan perubahan massal santri'
            ], 500);
        }
    }

    /**
     * @param array<string, mixed> $data
     */
    private function resolveLegacyLttqPayload(array &$data): void
    {
        if (array_key_exists('id_lttq_tingkatan', $data)) {
            return;
        }
        if (!array_key_exists('lttq', $data) && !array_key_exists('kelas_lttq', $data) && !array_key_exists('kel_lttq', $data)) {
            return;
        }
        $tingkatan = trim((string) ($data['lttq'] ?? ''));
        $kelas = trim((string) ($data['kelas_lttq'] ?? ''));
        $kel = trim((string) ($data['kel_lttq'] ?? ''));
        $kelompok = $kelas;
        if ($kel !== '' && $kelas !== '') {
            $kelompok = $kelas . '-' . $kel;
        } elseif ($kel !== '') {
            $kelompok = $kel;
        }
        if ($tingkatan === '' && $kelompok === '') {
            $data['id_lttq_tingkatan'] = null;

            return;
        }
        $resolved = SantriLttqHelper::resolveIdByTingkatan($this->db, $tingkatan, $kelompok);
        if ($resolved !== null) {
            $data['id_lttq_tingkatan'] = $resolved;
        }
    }

    public function getSantriByLttqTingkatan(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $idTingkatan = isset($params['id_lttq_tingkatan']) ? (int) $params['id_lttq_tingkatan'] : 0;
            if ($idTingkatan <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'id_lttq_tingkatan wajib', 'data' => []], 400);
            }
            $statusJoin = SantriStatusHelper::currentStatusJoinSql('s', 'st', 'ss');
            $sql = "SELECT s.id, s.nis, s.nama, COALESCE(st.status_santri, s.status_santri, '') AS status_santri,
                s.id_lttq_tingkatan, lt.tingkatan, lt.kelompok
                FROM santri s
                {$statusJoin}
                " . SantriLttqHelper::joinSql('s') . "
                WHERE s.id_lttq_tingkatan = ? ORDER BY s.nama";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idTingkatan]);

            return $this->jsonResponse($response, ['success' => true, 'data' => $stmt->fetchAll(\PDO::FETCH_ASSOC)], 200);
        } catch (\Exception $e) {
            error_log('getSantriByLttqTingkatan: ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil santri', 'data' => []], 500);
        }
    }

    public function getRiwayatLttq(Request $request, Response $response): Response
    {
        try {
            $idSantri = $request->getQueryParams()['id_santri'] ?? null;
            if (!$idSantri) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'id_santri wajib'], 400);
            }
            $resolvedId = SantriHelper::resolveId($this->db, $idSantri);
            if ($resolvedId === null) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Santri tidak ditemukan'], 404);
            }
            if (!$this->tableExists('santri___lttq')) {
                return $this->jsonResponse($response, ['success' => true, 'data' => []], 200);
            }
            $sql = "SELECT sl.id, sl.id_lttq_tingkatan, sl.id_santri, sl.nim, sl.tahun_ajaran, sl.tanggal_dibuat,
                    t.tingkatan, t.kelompok, l.nama AS lembaga_nama,
                    CONCAT(TRIM(COALESCE(t.tingkatan,'')), IF(TRIM(COALESCE(t.kelompok,''))='','',' · '), TRIM(COALESCE(t.kelompok,''))) AS tingkatan_label
                    FROM santri___lttq sl
                    JOIN lttq_tingkatan t ON t.id = sl.id_lttq_tingkatan
                    JOIN lembaga l ON l.id = t.lembaga_id
                    WHERE sl.id_santri = ?
                    ORDER BY sl.tahun_ajaran DESC, sl.tanggal_dibuat DESC";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$resolvedId]);

            return $this->jsonResponse($response, ['success' => true, 'data' => $stmt->fetchAll(\PDO::FETCH_ASSOC)], 200);
        } catch (\Exception $e) {
            error_log('getRiwayatLttq: ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Error mengambil riwayat LTTQ', 'data' => []], 500);
        }
    }

    public function deleteRiwayatLttq(Request $request, Response $response, array $args): Response
    {
        try {
            $idRiwayat = isset($args['id']) ? (int) $args['id'] : 0;
            if ($idRiwayat <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID riwayat tidak valid'], 400);
            }
            if (!$this->tableExists('santri___lttq')) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tabel riwayat tidak tersedia'], 404);
            }
            $stmt = $this->db->prepare('
                SELECT sl.id, sl.id_santri, sl.id_lttq_tingkatan, s.id_lttq_tingkatan AS aktif_id
                FROM santri___lttq sl
                INNER JOIN santri s ON s.id = sl.id_santri
                WHERE sl.id = ? LIMIT 1
            ');
            $stmt->execute([$idRiwayat]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Riwayat tidak ditemukan'], 404);
            }
            if ((int) ($row['aktif_id'] ?? 0) === (int) ($row['id_lttq_tingkatan'] ?? 0)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak dapat menghapus riwayat yang masih menjadi penempatan aktif santri',
                ], 400);
            }
            $this->db->prepare('DELETE FROM santri___lttq WHERE id = ?')->execute([$idRiwayat]);

            return $this->jsonResponse($response, ['success' => true, 'message' => 'Riwayat LTTQ dihapus'], 200);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menghapus riwayat'], 500);
        }
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json');
    }
}

