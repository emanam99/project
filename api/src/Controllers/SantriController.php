<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\SantriHelper;
use App\Helpers\SantriRombelHelper;
use App\Helpers\SantriKamarHelper;
use App\Helpers\SantriDomisiliHelper;
use App\Helpers\TextSanitizer;
use App\Helpers\LiveSantriIndexNotifier;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class SantriController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
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

            // Jika tidak ada id, ambil semua santri (id_diniyah/id_formal + nama rombel dari JOIN)
            // Parameter since (datetime ISO / MySQL): hanya baris yang diubah/dibuat setelah watermark — sinkron inkremental di klien.
            $since = isset($queryParams['since']) ? trim((string) $queryParams['since']) : '';

            $sql = "SELECT s.id, s.nis, s.nama, s.nik, s.tempat_lahir, s.tanggal_lahir, s.gender, s.ayah, s.ibu, s.no_telpon, s.email,
                s.dusun, s.rt, s.rw, s.desa, s.kecamatan, s.kode_pos, s.kabupaten, s.provinsi,
                s.id_diniyah, rd.lembaga_id AS diniyah, rd.kelas AS kelas_diniyah, rd.kel AS kel_diniyah, s.nim_diniyah,
                s.id_formal, rf.lembaga_id AS formal, rf.kelas AS kelas_formal, rf.kel AS kel_formal, s.nim_formal,
                s.lttq, s.kelas_lttq, s.kel_lttq, d.daerah, dk.kamar, s.id_kamar, s.status_santri,
                COALESCE(d.kategori, s.kategori) AS kategori, s.saudara_di_pesantren,
                s.tanggal_update, s.tanggal_dibuat
                FROM santri s
                LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                LEFT JOIN daerah d ON d.id = dk.id_daerah";
            if ($since !== '') {
                $sql .= ' WHERE (s.tanggal_update IS NOT NULL AND s.tanggal_update > ?)
                    OR (s.tanggal_update IS NULL AND s.tanggal_dibuat > ?)';
                $stmt = $this->db->prepare($sql);
                $stmt->execute([$since, $since]);
            } else {
                $stmt = $this->db->query($sql);
            }
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data,
                'incremental' => $since !== '',
            ], 200);

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
                s.status_pendaftar, s.status_murid, s.status_santri,
                COALESCE(d.kategori, s.kategori) AS kategori, d.daerah, dk.kamar, dk.id_daerah, s.id_kamar,
                s.id_diniyah, rd.lembaga_id AS diniyah, rd.kelas AS kelas_diniyah, rd.kel AS kel_diniyah, s.nim_diniyah,
                s.id_formal, rf.lembaga_id AS formal, rf.kelas AS kelas_formal, rf.kel AS kel_formal, s.nim_formal,
                s.lttq, s.kelas_lttq, s.kel_lttq
                FROM santri s
                LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                LEFT JOIN daerah d ON d.id = dk.id_daerah
                WHERE s.id = ? LIMIT 1";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$resolvedId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

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
            $sql = "SELECT sk.id, sk.id_kamar, sk.id_santri, sk.tahun_ajaran, sk.status_santri, sk.kategori, sk.tanggal_dibuat,
                    d.daerah, dk.kamar, CONCAT(d.daerah, '.', dk.kamar) AS daerah_kamar
                    FROM santri___kamar sk
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

    private function tableExists(string $table): bool
    {
        $stmt = $this->db->query("SHOW TABLES LIKE " . $this->db->quote($table));
        return $stmt->rowCount() > 0;
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
            // Simpan kamar hanya via id_kamar (daerah/kamar legacy tidak lagi diupdate)
            $fields = [
                'nama', 'nik', 'nisn', 'no_kk', 'kepala_keluarga', 'tempat_lahir', 'tanggal_lahir', 'gender', 'ayah', 'ibu', 'no_telpon', 'no_wa_santri', 'dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kode_pos', 'kabupaten', 'provinsi',
                'status_ayah', 'nik_ayah', 'tempat_lahir_ayah', 'tanggal_lahir_ayah', 'pekerjaan_ayah', 'pendidikan_ayah', 'penghasilan_ayah',
                'status_ibu', 'nik_ibu', 'tempat_lahir_ibu', 'tanggal_lahir_ibu', 'pekerjaan_ibu', 'pendidikan_ibu', 'penghasilan_ibu',
                'hubungan_wali', 'wali', 'nik_wali', 'tempat_lahir_wali', 'tanggal_lahir_wali', 'pekerjaan_wali', 'pendidikan_wali', 'penghasilan_wali', 'no_telpon_wali',
                'id_diniyah', 'nim_diniyah', 'id_formal', 'nim_formal',
                'lttq', 'kelas_lttq', 'kel_lttq',
                'id_kamar', 'status_santri', 'kategori', 'saudara_di_pesantren'
            ];
            $hasNoTelponWali = $this->db->query("SHOW COLUMNS FROM santri LIKE 'no_telpon_wali'")->rowCount() > 0;
            if (!$hasNoTelponWali) {
                $fields = array_values(array_diff($fields, ['no_telpon_wali']));
            }

            $set = [];
            $params = [];
            foreach ($fields as $f) {
                if (isset($data[$f])) {
                    $set[] = "$f = ?";
                    $params[] = $data[$f] === '' ? null : $data[$f];
                }
            }

            if (empty($set)) {
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
            $newDiniyah = isset($data['id_diniyah']) ? ($data['id_diniyah'] === '' || $data['id_diniyah'] === null ? null : (int) $data['id_diniyah']) : null;
            $newFormal = isset($data['id_formal']) ? ($data['id_formal'] === '' || $data['id_formal'] === null ? null : (int) $data['id_formal']) : null;
            $needRiwayat = ($newDiniyah !== null && $newDiniyah != $oldDiniyah) || ($newFormal !== null && $newFormal != $oldFormal);

            $oldKamar = $oldSantri && isset($oldSantri['id_kamar']) ? (int) $oldSantri['id_kamar'] : null;
            $newKamar = array_key_exists('id_kamar', $data) ? ($data['id_kamar'] === '' || $data['id_kamar'] === null ? null : (int) $data['id_kamar']) : null;
            $needKamarRiwayat = $newKamar !== null && $newKamar != $oldKamar && $newKamar > 0;

            $idPengurus = null;
            if ($needRiwayat || $needKamarRiwayat) {
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
                if ($needRiwayat && (!$idPengurus || $idPengurus <= 0)) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'id_pengurus wajib diisi saat mengubah rombel diniyah/formal (siapa yang melakukan perubahan). Sertakan di body atau login sebagai pengurus.'
                    ], 400);
                }
            }

            $params[] = $id;
            $sql = "UPDATE santri SET " . implode(', ', $set) . " WHERE id = ?";
            $stmt = $this->db->prepare($sql);

            if ($stmt->execute($params)) {
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
                if ($needKamarRiwayat) {
                    $tahunKamar = isset($data['tahun_ajaran_kamar']) && trim((string) $data['tahun_ajaran_kamar']) !== '' ? trim((string) $data['tahun_ajaran_kamar']) : SantriRombelHelper::getDefaultTahunAjaran($this->db, 'hijriyah');
                    $statusSantri = array_key_exists('status_santri', $data) ? ($data['status_santri'] ?? $oldSantri['status_santri'] ?? null) : ($oldSantri['status_santri'] ?? null);
                    $kategori = SantriDomisiliHelper::kategoriForKamarId($this->db, $newKamar)
                        ?? (array_key_exists('kategori', $data) ? ($data['kategori'] ?? $oldSantri['kategori'] ?? null) : ($oldSantri['kategori'] ?? null));
                    if ($tahunKamar) {
                        try {
                            SantriKamarHelper::appendKamarRiwayat($this->db, $id, $newKamar, $tahunKamar, $idPengurus, $statusSantri, $kategori);
                        } catch (\InvalidArgumentException $e) {
                            return $this->jsonResponse($response, ['success' => false, 'message' => $e->getMessage()], 400);
                        }
                    }
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
                s.lttq, s.kelas_lttq, s.kel_lttq,
                d.daerah, dk.kamar, s.id_kamar, s.status_santri,
                COALESCE(d.kategori, s.kategori) AS kategori, s.saudara_di_pesantren
                FROM santri s
                LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                LEFT JOIN daerah d ON d.id = dk.id_daerah
                WHERE s.id = ? LIMIT 1";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$resolvedId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

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

            if ($mode === 'diniyah') {
                $sql = "SELECT s.id, s.nis, s.nama, s.status_santri, s.id_diniyah AS id_rombel, rd.lembaga_id AS diniyah, rd.kelas AS kelas_diniyah, rd.kel AS kel_diniyah
                    FROM santri s
                    LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                    WHERE s.id_diniyah = ? ORDER BY s.nama";
            } else {
                $sql = "SELECT s.id, s.nis, s.nama, s.status_santri, s.id_formal AS id_rombel, rf.lembaga_id AS formal, rf.kelas AS kelas_formal, rf.kel AS kel_formal
                    FROM santri s
                    LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
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
            $kategori = isset($q['kategori']) ? trim((string) $q['kategori']) : '';
            $daerah = isset($q['daerah']) ? trim((string) $q['daerah']) : '';
            $kamar = isset($q['kamar']) ? trim((string) $q['kamar']) : '';
            $tidakDiniyah = isset($q['tidak_diniyah']) && (string) $q['tidak_diniyah'] === '1';
            $tidakFormal = isset($q['tidak_formal']) && (string) $q['tidak_formal'] === '1';

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
                s.status_santri,
                COALESCE(d.kategori, s.kategori) AS kategori,
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
                s.lttq,
                s.kelas_lttq,
                s.kel_lttq,
                s.no_telpon,
                s.no_wa_santri,
                s.email
                FROM santri s
                LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                LEFT JOIN daerah d ON d.id = dk.id_daerah";

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
                    $ph = implode(',', array_fill(0, count($statusList), '?'));
                    $where[] = "LOWER(TRIM(COALESCE(s.status_santri, ''))) IN ($ph)";
                    foreach ($statusList as $sv) $bind[] = $sv;
                }
            }

            if ($kategori !== '') {
                $where[] = 'COALESCE(d.kategori, s.kategori) = ?';
                $bind[] = $kategori;
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

            $allowedFields = [
                'nama', 'tempat_lahir', 'tanggal_lahir', 'gender', 'nisn', 'no_kk', 'kepala_keluarga', 'anak_ke', 'jumlah_saudara',
                'ayah', 'status_ayah', 'nik_ayah', 'tempat_lahir_ayah', 'tanggal_lahir_ayah', 'pekerjaan_ayah', 'pendidikan_ayah', 'penghasilan_ayah',
                'ibu', 'status_ibu', 'nik_ibu', 'tempat_lahir_ibu', 'tanggal_lahir_ibu', 'pekerjaan_ibu', 'pendidikan_ibu', 'penghasilan_ibu',
                'hubungan_wali', 'wali', 'nik_wali', 'tempat_lahir_wali', 'tanggal_lahir_wali', 'pekerjaan_wali', 'pendidikan_wali', 'penghasilan_wali',
                'status_santri', 'kategori', 'status_pendaftar', 'status_murid', 'status_nikah', 'pekerjaan',
                'saudara_di_pesantren', 'hobi', 'cita_cita', 'kebutuhan_khusus', 'riwayat_sakit', 'ukuran_baju', 'kip', 'pkh', 'kks',
                'dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kabupaten', 'provinsi', 'kode_pos',
                'madrasah', 'nama_madrasah', 'alamat_madrasah', 'lulus_madrasah',
                'sekolah', 'nama_sekolah', 'alamat_sekolah', 'lulus_sekolah', 'npsn', 'nsm',
                'id_kamar', 'id_diniyah', 'nim_diniyah', 'id_formal', 'nim_formal',
                'lttq', 'kelas_lttq', 'kel_lttq',
                'no_telpon', 'no_wa_santri', 'email'
            ];

            $this->db->beginTransaction();
            $updated = 0;
            $skipped = 0;
            $errors = [];
            $reqUser = $request->getAttribute('user');
            $pengurusId = isset($reqUser['id_pengurus']) ? (int) $reqUser['id_pengurus'] : null;
            if (!$pengurusId && isset($reqUser['user_id'])) {
                $pengurusId = (int) $reqUser['user_id'];
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
                    $params[] = is_string($val) ? TextSanitizer::cleanTextOrNull($val) : $val;
                }

                if ($set === []) {
                    $skipped++;
                    continue;
                }

                $oldStmt = $this->db->prepare("SELECT * FROM santri WHERE id = ? LIMIT 1");
                $oldStmt->execute([$resolvedId]);
                $oldRow = $oldStmt->fetch(\PDO::FETCH_ASSOC) ?: [];

                $params[] = $resolvedId;
                $sql = "UPDATE santri SET " . implode(', ', $set) . " WHERE id = ?";
                $stmt = $this->db->prepare($sql);
                $stmt->execute($params);
                $isRowUpdated = $stmt->rowCount() > 0;
                $updated += $isRowUpdated ? 1 : 0;

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

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json');
    }
}

