<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\PengurusHelper;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class MadrasahController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * GET /api/madrasah - Get all madrasah (UGT)
     * admin_ugt & super_admin: semua madrasah. koordinator_ugt: hanya madrasah yang id_koordinator = diri sendiri.
     */
    public function getAll(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $roleKey = isset($user['role_key']) ? strtolower((string) $user['role_key']) : '';
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : null;

            $sql = "
                SELECT m.*,
                    a.nama AS alamat_nama, a.tipe AS alamat_tipe,
                    up.username AS pengasuh_nama, COALESCE(up.no_wa, '') AS pengasuh_wa,
                    uj.username AS pjgt_nama, COALESCE(uj.no_wa, '') AS pjgt_wa,
                    pk.nama AS koordinator_nama, pk.nip AS koordinator_nip, COALESCE(uk.no_wa, '') AS koordinator_wa
                FROM madrasah m
                LEFT JOIN alamat a ON a.id = m.id_alamat
                LEFT JOIN users up ON up.id = m.id_pengasuh
                LEFT JOIN users uj ON uj.id = m.id_pjgt
                LEFT JOIN pengurus pk ON pk.id = m.id_koordinator
                LEFT JOIN users uk ON uk.id = pk.id_user
            ";
            $params = [];
            if ($roleKey === 'koordinator_ugt' && $pengurusId > 0) {
                $sql .= " WHERE m.id_koordinator = ?";
                $params[] = $pengurusId;
            }
            $sql .= " ORDER BY m.nama ASC";

            try {
                if ($params !== []) {
                    $stmt = $this->db->prepare($sql);
                    $stmt->execute($params);
                } else {
                    $stmt = $this->db->query($sql);
                }
                $list = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            } catch (\PDOException $e) {
                if (strpos($e->getMessage(), 'nip') !== false || strpos($e->getMessage(), 'Unknown column') !== false) {
                    $sqlFallback = "
                        SELECT m.*,
                            a.nama AS alamat_nama, a.tipe AS alamat_tipe,
                            up.username AS pengasuh_nama, COALESCE(up.no_wa, '') AS pengasuh_wa,
                            uj.username AS pjgt_nama, COALESCE(uj.no_wa, '') AS pjgt_wa,
                            pk.nama AS koordinator_nama, pk.nip AS koordinator_nip, COALESCE(uk.no_wa, '') AS koordinator_wa
                        FROM madrasah m
                        LEFT JOIN alamat a ON a.id = m.id_alamat
                        LEFT JOIN users up ON up.id = m.id_pengasuh
                        LEFT JOIN users uj ON uj.id = m.id_pjgt
                        LEFT JOIN pengurus pk ON pk.id = m.id_koordinator
                        LEFT JOIN users uk ON uk.id = pk.id_user
                    ";
                    $sqlFallback .= ($roleKey === 'koordinator_ugt' && $pengurusId > 0) ? " WHERE m.id_koordinator = ?" : "";
                    $sqlFallback .= " ORDER BY m.nama ASC";
                    if ($params !== []) {
                        $stmt = $this->db->prepare($sqlFallback);
                        $stmt->execute($params);
                    } else {
                        $stmt = $this->db->query($sqlFallback);
                    }
                    $list = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                } else {
                    throw $e;
                }
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $list
            ], 200);
        } catch (\Exception $e) {
            error_log("MadrasahController::getAll " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data madrasah',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/madrasah/{id} - Get madrasah by id
     * koordinator_ugt hanya boleh akses madrasah yang id_koordinator = diri sendiri.
     */
    public function getById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID madrasah tidak valid'
                ], 400);
            }

            $sqlDetail = "
                SELECT m.*,
                    a.nama AS alamat_nama, a.tipe AS alamat_tipe, a.kode_pos AS alamat_kode_pos,
                    up.username AS pengasuh_nama, COALESCE(up.no_wa, '') AS pengasuh_wa, up.no_wa AS pengasuh_telp,
                    uj.username AS pjgt_nama, COALESCE(uj.no_wa, '') AS pjgt_wa, uj.no_wa AS pjgt_telp,
                    pk.nama AS koordinator_nama, pk.nip AS koordinator_nip, COALESCE(uk.no_wa, '') AS koordinator_wa, uk.no_wa AS koordinator_telp
                FROM madrasah m
                LEFT JOIN alamat a ON a.id = m.id_alamat
                LEFT JOIN users up ON up.id = m.id_pengasuh
                LEFT JOIN users uj ON uj.id = m.id_pjgt
                LEFT JOIN pengurus pk ON pk.id = m.id_koordinator
                LEFT JOIN users uk ON uk.id = pk.id_user
                WHERE m.id = ?
            ";
            try {
                $stmt = $this->db->prepare($sqlDetail);
                $stmt->execute([$id]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            } catch (\PDOException $e) {
                if (strpos($e->getMessage(), 'nip') !== false || strpos($e->getMessage(), 'no_telpon') !== false || strpos($e->getMessage(), 'Unknown column') !== false) {
                    $sqlDetail = "
                        SELECT m.*,
                            a.nama AS alamat_nama, a.tipe AS alamat_tipe, a.kode_pos AS alamat_kode_pos,
                            up.username AS pengasuh_nama, COALESCE(up.no_wa, '') AS pengasuh_wa, up.no_wa AS pengasuh_telp,
                            uj.username AS pjgt_nama, COALESCE(uj.no_wa, '') AS pjgt_wa, uj.no_wa AS pjgt_telp,
                            pk.nama AS koordinator_nama, pk.nip AS koordinator_nip, COALESCE(uk.no_wa, '') AS koordinator_wa, uk.no_wa AS koordinator_telp
                        FROM madrasah m
                        LEFT JOIN alamat a ON a.id = m.id_alamat
                        LEFT JOIN users up ON up.id = m.id_pengasuh
                        LEFT JOIN users uj ON uj.id = m.id_pjgt
                        LEFT JOIN pengurus pk ON pk.id = m.id_koordinator
                        LEFT JOIN users uk ON uk.id = pk.id_user
                        WHERE m.id = ?
                    ";
                    $stmt = $this->db->prepare($sqlDetail);
                    $stmt->execute([$id]);
                    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                } else {
                    throw $e;
                }
            }

            if (!$row) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Madrasah tidak ditemukan'
                ], 404);
            }

            $user = $request->getAttribute('user');
            $roleKey = isset($user['role_key']) ? strtolower((string) $user['role_key']) : '';
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : null;
            if ($roleKey === 'koordinator_ugt' && $pengurusId > 0) {
                $idKoord = isset($row['id_koordinator']) ? (int) $row['id_koordinator'] : null;
                if ($idKoord !== $pengurusId) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Madrasah tidak ditemukan'
                    ], 404);
                }
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $row
            ], 200);
        } catch (\Exception $e) {
            error_log("MadrasahController::getById " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data madrasah',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/madrasah - Create madrasah (admin_ugt, koordinator_ugt, super_admin)
     * koordinator_ugt: id_koordinator dipaksa ke diri sendiri.
     */
    public function create(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $roleKey = isset($user['role_key']) ? strtolower((string) $user['role_key']) : '';
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : null;

            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            $nama = trim((string) ($data['nama'] ?? ''));
            if ($nama === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nama madrasah wajib diisi'
                ], 400);
            }

            $identitas = isset($data['identitas']) ? trim((string) $data['identitas']) : null;
            $kategori = isset($data['kategori']) && in_array($data['kategori'], ['Madrasah', 'Pesantren', 'Yayasan', 'Sekolah', 'Lainnya'], true) ? $data['kategori'] : null;
            $status = isset($data['status']) && in_array($data['status'], ['Pendaftar Baru', 'Belum Survei', 'Sudah Survei', 'Penerima', 'Tidak Aktif'], true) ? trim((string) $data['status']) : null;
            $id_alamat = isset($data['id_alamat']) && $data['id_alamat'] !== '' ? trim((string) $data['id_alamat']) : null;
            $dusun = isset($data['dusun']) ? trim((string) $data['dusun']) : null;
            $rt = isset($data['rt']) ? trim((string) $data['rt']) : null;
            $rw = isset($data['rw']) ? trim((string) $data['rw']) : null;
            $desa = isset($data['desa']) ? trim((string) $data['desa']) : null;
            $kecamatan = isset($data['kecamatan']) ? trim((string) $data['kecamatan']) : null;
            $kabupaten = isset($data['kabupaten']) ? trim((string) $data['kabupaten']) : null;
            $provinsi = isset($data['provinsi']) ? trim((string) $data['provinsi']) : null;
            $kode_pos = isset($data['kode_pos']) ? trim((string) $data['kode_pos']) : null;
            $id_koordinator_raw = isset($data['id_koordinator']) && $data['id_koordinator'] !== '' ? $data['id_koordinator'] : (isset($data['nip_koordinator']) && $data['nip_koordinator'] !== '' ? $data['nip_koordinator'] : null);
            $id_koordinator = null;
            if ($id_koordinator_raw !== null && $id_koordinator_raw !== '') {
                $id_koordinator = is_numeric($id_koordinator_raw) ? PengurusHelper::resolveIdByNip($this->db, $id_koordinator_raw) : null;
            }
            if ($roleKey === 'koordinator_ugt' && $pengurusId > 0) {
                $id_koordinator = $pengurusId;
            }
            if ($id_koordinator !== null && (int) $id_koordinator <= 0) {
                $id_koordinator = null;
            }
            $sektor = isset($data['sektor']) ? trim((string) $data['sektor']) : null;
            $id_pengasuh = isset($data['id_pengasuh']) && $data['id_pengasuh'] !== '' ? (int) $data['id_pengasuh'] : null;
            if ($id_pengasuh !== null && (int) $id_pengasuh <= 0) {
                $id_pengasuh = null;
            }
            $id_pjgt = isset($data['id_pjgt']) && $data['id_pjgt'] !== '' ? (int) $data['id_pjgt'] : null;
            if ($id_pjgt !== null && (int) $id_pjgt <= 0) {
                $id_pjgt = null;
            }
            $nama_pengasuh = isset($data['nama_pengasuh']) ? trim((string) $data['nama_pengasuh']) : null;
            $no_pengasuh = isset($data['no_pengasuh']) ? trim((string) $data['no_pengasuh']) : null;
            $nama_pjgt = isset($data['nama_pjgt']) ? trim((string) $data['nama_pjgt']) : null;
            $no_pjgt = isset($data['no_pjgt']) ? trim((string) $data['no_pjgt']) : null;
            $tpq = isset($data['tpq']) ? (int) (bool) $data['tpq'] : 0;
            $ula = isset($data['ula']) ? (int) (bool) $data['ula'] : 0;
            $wustha = isset($data['wustha']) ? (int) (bool) $data['wustha'] : 0;
            $ulya = isset($data['ulya']) ? (int) (bool) $data['ulya'] : 0;
            $ma_had_ali = isset($data['ma_had_ali']) ? (int) (bool) $data['ma_had_ali'] : 0;
            $kurikulum = isset($data['kurikulum']) && in_array($data['kurikulum'], ['Depag', 'Diniyah (Mandiri)'], true) ? $data['kurikulum'] : null;
            $jumlah_murid = isset($data['jumlah_murid']) && $data['jumlah_murid'] !== '' ? (int) $data['jumlah_murid'] : null;
            $foto_path = isset($data['foto_path']) && trim((string) $data['foto_path']) !== '' ? trim((string) $data['foto_path']) : null;

            $opt = static function ($key, $maxLen = 255) use ($data) {
                if (!isset($data[$key])) return null;
                $v = trim((string) $data[$key]);
                return $v === '' ? null : ($maxLen ? substr($v, 0, $maxLen) : $v);
            };
            $kepala = $opt('kepala'); $sekretaris = $opt('sekretaris'); $bendahara = $opt('bendahara');
            $kegiatan_pagi = isset($data['kegiatan_pagi']) ? (int) (bool) $data['kegiatan_pagi'] : 0;
            $kegiatan_sore = isset($data['kegiatan_sore']) ? (int) (bool) $data['kegiatan_sore'] : 0;
            $kegiatan_malam = isset($data['kegiatan_malam']) ? (int) (bool) $data['kegiatan_malam'] : 0;
            $kegiatan_mulai = $opt('kegiatan_mulai', 10); $kegiatan_sampai = $opt('kegiatan_sampai', 10);
            $tempat = $opt('tempat'); $berdiri_tahun = isset($data['berdiri_tahun']) && $data['berdiri_tahun'] !== '' ? (int) $data['berdiri_tahun'] : null;
            $kelas_tertinggi = $opt('kelas_tertinggi', 100); $keterangan = $opt('keterangan', 65535);
            $banin_banat = $opt('banin_banat', 50); $seragam = $opt('seragam', 50); $syahriah = $opt('syahriah', 50);
            $pengelola = $opt('pengelola', 50); $gedung_madrasah = $opt('gedung_madrasah', 50); $kantor = $opt('kantor', 50);
            $bangku = $opt('bangku', 50); $kamar_mandi_murid = $opt('kamar_mandi_murid', 50); $kamar_gt = $opt('kamar_gt', 50);
            $kamar_mandi_gt = $opt('kamar_mandi_gt', 50); $km_bersifat = $opt('km_bersifat', 20); $konsumsi = $opt('konsumsi', 50);
            $kamar_gt_jarak = $opt('kamar_gt_jarak', 50); $masyarakat = $opt('masyarakat', 50); $alumni = $opt('alumni', 50);
            $jarak_md_lain = $opt('jarak_md_lain', 20);

            $insertPairs = [
                'identitas' => $identitas,
                'nama' => $nama,
                'kategori' => $kategori,
                'status' => $status,
                'id_alamat' => $id_alamat,
                'dusun' => $dusun,
                'rt' => $rt,
                'rw' => $rw,
                'desa' => $desa,
                'kecamatan' => $kecamatan,
                'kabupaten' => $kabupaten,
                'provinsi' => $provinsi,
                'kode_pos' => $kode_pos,
                'id_koordinator' => $id_koordinator,
                'sektor' => $sektor,
                'nama_pengasuh' => $nama_pengasuh,
                'id_pengasuh' => $id_pengasuh,
                'no_pengasuh' => $no_pengasuh,
                'nama_pjgt' => $nama_pjgt,
                'id_pjgt' => $id_pjgt,
                'no_pjgt' => $no_pjgt,
                'tpq' => $tpq,
                'ula' => $ula,
                'wustha' => $wustha,
                'ulya' => $ulya,
                'ma_had_ali' => $ma_had_ali,
                'kelas_tertinggi' => $kelas_tertinggi,
                'kurikulum' => $kurikulum,
                'jumlah_murid' => $jumlah_murid,
                'foto_path' => $foto_path,
                'kepala' => $kepala,
                'sekretaris' => $sekretaris,
                'bendahara' => $bendahara,
                'kegiatan_pagi' => $kegiatan_pagi,
                'kegiatan_sore' => $kegiatan_sore,
                'kegiatan_malam' => $kegiatan_malam,
                'kegiatan_mulai' => $kegiatan_mulai,
                'kegiatan_sampai' => $kegiatan_sampai,
                'tempat' => $tempat,
                'berdiri_tahun' => $berdiri_tahun,
                'keterangan' => $keterangan,
                'banin_banat' => $banin_banat,
                'seragam' => $seragam,
                'syahriah' => $syahriah,
                'pengelola' => $pengelola,
                'gedung_madrasah' => $gedung_madrasah,
                'kantor' => $kantor,
                'bangku' => $bangku,
                'kamar_mandi_murid' => $kamar_mandi_murid,
                'kamar_gt' => $kamar_gt,
                'kamar_mandi_gt' => $kamar_mandi_gt,
                'km_bersifat' => $km_bersifat,
                'konsumsi' => $konsumsi,
                'kamar_gt_jarak' => $kamar_gt_jarak,
                'masyarakat' => $masyarakat,
                'alumni' => $alumni,
                'jarak_md_lain' => $jarak_md_lain,
            ];
            $cols = array_keys($insertPairs);
            $placeholders = implode(', ', array_fill(0, count($cols), '?'));
            $sql = 'INSERT INTO madrasah (' . implode(', ', $cols) . ') VALUES (' . $placeholders . ')';
            $stmt = $this->db->prepare($sql);
            $stmt->execute(array_values($insertPairs));
            $id = (int) $this->db->lastInsertId();
            $newRow = $this->db->prepare("SELECT * FROM madrasah WHERE id = ?");
            $newRow->execute([$id]);
            $newRow = $newRow->fetch(\PDO::FETCH_ASSOC);
            if ($newRow && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_CREATE, 'madrasah', $id, null, $newRow, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Madrasah berhasil ditambahkan',
                'data' => ['id' => $id, 'nama' => $nama]
            ], 201);
        } catch (\Exception $e) {
            error_log("MadrasahController::create " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan madrasah',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * PUT /api/madrasah/{id} - Update madrasah (admin_ugt, koordinator_ugt, super_admin)
     * koordinator_ugt: hanya boleh update madrasah yang id_koordinator = diri sendiri; id_koordinator tidak boleh diubah.
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID madrasah tidak valid'
                ], 400);
            }

            $user = $request->getAttribute('user');
            $roleKey = isset($user['role_key']) ? strtolower((string) $user['role_key']) : '';
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : null;

            $stmtOld = $this->db->prepare("SELECT * FROM madrasah WHERE id = ?");
            $stmtOld->execute([$id]);
            $oldMadrasah = $stmtOld->fetch(\PDO::FETCH_ASSOC);
            if (!$oldMadrasah) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Madrasah tidak ditemukan'
                ], 404);
            }
            if ($roleKey === 'koordinator_ugt' && $pengurusId > 0 && (int) ($oldMadrasah['id_koordinator'] ?? 0) !== $pengurusId) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Madrasah tidak ditemukan'
                ], 404);
            }

            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            $nama = trim((string) ($data['nama'] ?? ''));
            if ($nama === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nama madrasah wajib diisi'
                ], 400);
            }

            $identitas = isset($data['identitas']) ? trim((string) $data['identitas']) : null;
            $kategori = isset($data['kategori']) && in_array($data['kategori'], ['Madrasah', 'Pesantren', 'Yayasan', 'Sekolah', 'Lainnya'], true) ? $data['kategori'] : null;
            $status = isset($data['status']) && in_array($data['status'], ['Pendaftar Baru', 'Belum Survei', 'Sudah Survei', 'Penerima', 'Tidak Aktif'], true) ? trim((string) $data['status']) : null;
            $id_alamat = isset($data['id_alamat']) && $data['id_alamat'] !== '' ? trim((string) $data['id_alamat']) : null;
            $dusun = isset($data['dusun']) ? trim((string) $data['dusun']) : null;
            $rt = isset($data['rt']) ? trim((string) $data['rt']) : null;
            $rw = isset($data['rw']) ? trim((string) $data['rw']) : null;
            $desa = isset($data['desa']) ? trim((string) $data['desa']) : null;
            $kecamatan = isset($data['kecamatan']) ? trim((string) $data['kecamatan']) : null;
            $kabupaten = isset($data['kabupaten']) ? trim((string) $data['kabupaten']) : null;
            $provinsi = isset($data['provinsi']) ? trim((string) $data['provinsi']) : null;
            $kode_pos = isset($data['kode_pos']) ? trim((string) $data['kode_pos']) : null;
            $id_koordinator_raw = isset($data['id_koordinator']) && $data['id_koordinator'] !== '' ? $data['id_koordinator'] : (isset($data['nip_koordinator']) && $data['nip_koordinator'] !== '' ? $data['nip_koordinator'] : null);
            $id_koordinator = null;
            if ($id_koordinator_raw !== null && $id_koordinator_raw !== '') {
                $id_koordinator = is_numeric($id_koordinator_raw) ? PengurusHelper::resolveIdByNip($this->db, $id_koordinator_raw) : null;
            }
            if ($roleKey === 'koordinator_ugt' && $pengurusId > 0) {
                $id_koordinator = $pengurusId;
            }
            if ($id_koordinator !== null && (int) $id_koordinator <= 0) {
                $id_koordinator = null;
            }
            $foto_path = isset($data['foto_path']) && trim((string) $data['foto_path']) !== '' ? trim((string) $data['foto_path']) : null;
            $sektor = isset($data['sektor']) ? trim((string) $data['sektor']) : null;
            $id_pengasuh = isset($data['id_pengasuh']) && $data['id_pengasuh'] !== '' ? (int) $data['id_pengasuh'] : null;
            if ($id_pengasuh !== null && (int) $id_pengasuh <= 0) {
                $id_pengasuh = null;
            }
            $id_pjgt = isset($data['id_pjgt']) && $data['id_pjgt'] !== '' ? (int) $data['id_pjgt'] : null;
            if ($id_pjgt !== null && (int) $id_pjgt <= 0) {
                $id_pjgt = null;
            }
            $nama_pengasuh = isset($data['nama_pengasuh']) ? trim((string) $data['nama_pengasuh']) : null;
            $no_pengasuh = isset($data['no_pengasuh']) ? trim((string) $data['no_pengasuh']) : null;
            $nama_pjgt = isset($data['nama_pjgt']) ? trim((string) $data['nama_pjgt']) : null;
            $no_pjgt = isset($data['no_pjgt']) ? trim((string) $data['no_pjgt']) : null;
            $tpq = isset($data['tpq']) ? (int) (bool) $data['tpq'] : 0;
            $ula = isset($data['ula']) ? (int) (bool) $data['ula'] : 0;
            $wustha = isset($data['wustha']) ? (int) (bool) $data['wustha'] : 0;
            $ulya = isset($data['ulya']) ? (int) (bool) $data['ulya'] : 0;
            $ma_had_ali = isset($data['ma_had_ali']) ? (int) (bool) $data['ma_had_ali'] : 0;
            $kurikulum = isset($data['kurikulum']) && in_array($data['kurikulum'], ['Depag', 'Diniyah (Mandiri)'], true) ? $data['kurikulum'] : null;
            $jumlah_murid = isset($data['jumlah_murid']) && $data['jumlah_murid'] !== '' ? (int) $data['jumlah_murid'] : null;

            $opt = static function ($key, $maxLen = 255) use ($data) {
                if (!isset($data[$key])) return null;
                $v = trim((string) $data[$key]);
                return $v === '' ? null : ($maxLen ? substr($v, 0, $maxLen) : $v);
            };
            $kepala = $opt('kepala'); $sekretaris = $opt('sekretaris'); $bendahara = $opt('bendahara');
            $kegiatan_pagi = isset($data['kegiatan_pagi']) ? (int) (bool) $data['kegiatan_pagi'] : 0;
            $kegiatan_sore = isset($data['kegiatan_sore']) ? (int) (bool) $data['kegiatan_sore'] : 0;
            $kegiatan_malam = isset($data['kegiatan_malam']) ? (int) (bool) $data['kegiatan_malam'] : 0;
            $kegiatan_mulai = $opt('kegiatan_mulai', 10); $kegiatan_sampai = $opt('kegiatan_sampai', 10);
            $tempat = $opt('tempat'); $berdiri_tahun = isset($data['berdiri_tahun']) && $data['berdiri_tahun'] !== '' ? (int) $data['berdiri_tahun'] : null;
            $kelas_tertinggi = $opt('kelas_tertinggi', 100); $keterangan = $opt('keterangan', 65535);
            $banin_banat = $opt('banin_banat', 50); $seragam = $opt('seragam', 50); $syahriah = $opt('syahriah', 50);
            $pengelola = $opt('pengelola', 50); $gedung_madrasah = $opt('gedung_madrasah', 50); $kantor = $opt('kantor', 50);
            $bangku = $opt('bangku', 50); $kamar_mandi_murid = $opt('kamar_mandi_murid', 50); $kamar_gt = $opt('kamar_gt', 50);
            $kamar_mandi_gt = $opt('kamar_mandi_gt', 50); $km_bersifat = $opt('km_bersifat', 20); $konsumsi = $opt('konsumsi', 50);
            $kamar_gt_jarak = $opt('kamar_gt_jarak', 50); $masyarakat = $opt('masyarakat', 50); $alumni = $opt('alumni', 50);
            $jarak_md_lain = $opt('jarak_md_lain', 20);

            $stmt = $this->db->prepare("
                UPDATE madrasah SET
                    identitas = ?, nama = ?, kategori = ?, status = ?, id_alamat = ?, dusun = ?, rt = ?, rw = ?,
                    desa = ?, kecamatan = ?, kabupaten = ?, provinsi = ?, kode_pos = ?, id_koordinator = ?, sektor = ?,
                    nama_pengasuh = ?, id_pengasuh = ?, no_pengasuh = ?, nama_pjgt = ?, id_pjgt = ?, no_pjgt = ?,
                    tpq = ?, ula = ?, wustha = ?, ulya = ?, ma_had_ali = ?, kelas_tertinggi = ?, kurikulum = ?, jumlah_murid = ?, foto_path = ?,
                    kepala = ?, sekretaris = ?, bendahara = ?, kegiatan_pagi = ?, kegiatan_sore = ?, kegiatan_malam = ?, kegiatan_mulai = ?, kegiatan_sampai = ?, tempat = ?, berdiri_tahun = ?, keterangan = ?,
                    banin_banat = ?, seragam = ?, syahriah = ?, pengelola = ?, gedung_madrasah = ?, kantor = ?, bangku = ?, kamar_mandi_murid = ?, kamar_gt = ?, kamar_mandi_gt = ?, km_bersifat = ?, konsumsi = ?, kamar_gt_jarak = ?, masyarakat = ?, alumni = ?, jarak_md_lain = ?
                WHERE id = ?
            ");
            $stmt->execute([
                $identitas, $nama, $kategori, $status, $id_alamat, $dusun, $rt, $rw,
                $desa, $kecamatan, $kabupaten, $provinsi, $kode_pos, $id_koordinator, $sektor,
                $nama_pengasuh, $id_pengasuh, $no_pengasuh, $nama_pjgt, $id_pjgt, $no_pjgt,
                $tpq, $ula, $wustha, $ulya, $ma_had_ali, $kelas_tertinggi, $kurikulum, $jumlah_murid, $foto_path,
                $kepala, $sekretaris, $bendahara, $kegiatan_pagi, $kegiatan_sore, $kegiatan_malam, $kegiatan_mulai, $kegiatan_sampai, $tempat, $berdiri_tahun, $keterangan,
                $banin_banat, $seragam, $syahriah, $pengelola, $gedung_madrasah, $kantor, $bangku, $kamar_mandi_murid, $kamar_gt, $kamar_mandi_gt, $km_bersifat, $konsumsi, $kamar_gt_jarak, $masyarakat, $alumni, $jarak_md_lain,
                $id
            ]);

            if ($stmt->rowCount() === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Madrasah tidak ditemukan'
                ], 404);
            }
            $stmtNew = $this->db->prepare("SELECT * FROM madrasah WHERE id = ?");
            $stmtNew->execute([$id]);
            $newMadrasah = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            if ($newMadrasah && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'madrasah', $id, $oldMadrasah, $newMadrasah, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Madrasah berhasil diupdate',
                'data' => ['id' => $id, 'nama' => $nama]
            ], 200);
        } catch (\Exception $e) {
            error_log("MadrasahController::update " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate madrasah',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}
