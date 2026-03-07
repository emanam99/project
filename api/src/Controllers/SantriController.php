<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\SantriHelper;
use App\Helpers\SantriRombelHelper;
use App\Helpers\SantriKamarHelper;
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
            $sql = "SELECT s.id, s.nis, s.nama, s.nik, s.tempat_lahir, s.tanggal_lahir, s.gender, s.ayah, s.ibu, s.no_telpon, s.email,
                s.dusun, s.rt, s.rw, s.desa, s.kecamatan, s.kode_pos, s.kabupaten, s.provinsi,
                s.id_diniyah, rd.lembaga_id AS diniyah, rd.kelas AS kelas_diniyah, rd.kel AS kel_diniyah, s.nim_diniyah,
                s.id_formal, rf.lembaga_id AS formal, rf.kelas AS kelas_formal, rf.kel AS kel_formal, s.nim_formal,
                s.lttq, s.kelas_lttq, s.kel_lttq, d.daerah, dk.kamar, s.id_kamar, s.status_santri, s.kategori, s.saudara_di_pesantren
                FROM santri s
                LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                LEFT JOIN daerah d ON d.id = dk.id_daerah";
            $stmt = $this->db->query($sql);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data
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
                s.kategori, d.daerah, dk.kamar, dk.id_daerah, s.id_kamar,
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

            if (!$data || !isset($data['id'])) {
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
            // Simpan kamar hanya via id_kamar (daerah/kamar legacy tidak lagi diupdate)
            $fields = [
                'nama', 'nik', 'tempat_lahir', 'tanggal_lahir', 'gender', 'ayah', 'ibu', 'no_telpon', 'no_wa_santri', 'dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kode_pos', 'kabupaten', 'provinsi',
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
                        // Token pengurus bisa kirim user_id = pengurus.id (backward compat); cek dulu sebagai pengurus.id
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
                if (!$idPengurus || $idPengurus <= 0) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'id_pengurus wajib diisi saat mengubah rombel diniyah/formal atau kamar (siapa yang melakukan perubahan)'
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
                    $kategori = array_key_exists('kategori', $data) ? ($data['kategori'] ?? $oldSantri['kategori'] ?? null) : ($oldSantri['kategori'] ?? null);
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
                'message' => 'Error updating santri: ' . $e->getMessage()
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
                d.daerah, dk.kamar, s.id_kamar, s.status_santri, s.kategori, s.saudara_di_pesantren
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
                'message' => 'Error: ' . $e->getMessage()
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
                'message' => 'Error: ' . $e->getMessage()
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
     * GET /api/santri/distinct-kelas?mode=diniyah|formal
     * List rombel (lembaga___rombel) yang punya santri, dengan jumlah santri (id_diniyah atau id_formal).
     */
    public function getDistinctKelas(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $mode = isset($params['mode']) ? strtolower(trim($params['mode'])) : 'diniyah';
            if (!in_array($mode, ['diniyah', 'formal'], true)) {
                $mode = 'diniyah';
            }

            if ($mode === 'diniyah') {
                $sql = "SELECT r.id AS id_rombel, r.lembaga_id AS diniyah, r.kelas AS kelas_diniyah, r.kel AS kel_diniyah, COUNT(s.id) AS jumlah
                    FROM lembaga___rombel r
                    INNER JOIN santri s ON s.id_diniyah = r.id
                    GROUP BY r.id, r.lembaga_id, r.kelas, r.kel
                    ORDER BY r.lembaga_id, r.kelas, r.kel";
            } else {
                $sql = "SELECT r.id AS id_rombel, r.lembaga_id AS formal, r.kelas AS kelas_formal, r.kel AS kel_formal, COUNT(s.id) AS jumlah
                    FROM lembaga___rombel r
                    INNER JOIN santri s ON s.id_formal = r.id
                    GROUP BY r.id, r.lembaga_id, r.kelas, r.kel
                    ORDER BY r.lembaga_id, r.kelas, r.kel";
            }

            $stmt = $this->db->query($sql);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data,
                'mode' => $mode
            ], 200);
        } catch (\Exception $e) {
            error_log("getDistinctKelas error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data kelas santri',
                'data' => []
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

