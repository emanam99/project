<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class UmrohTabunganController
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
     * Helper function untuk insert ke tabel payment (induk)
     * @param string $jenisPembayaran Pendaftaran, Uwaba, Tunggakan, Khusus, Tabungan, Umroh
     * @param int $idReferensi ID dari tabel referensi
     * @param string $tabelReferensi Nama tabel referensi
     * @param array $data Data pembayaran
     * @return int|false ID payment yang baru dibuat atau false jika gagal
     */
    private function insertToPayment(string $jenisPembayaran, int $idReferensi, string $tabelReferensi, array $data): int|false
    {
        try {
            $sql = "INSERT INTO payment (
                jenis_pembayaran, id_referensi, tabel_referensi, id_santri, id_jamaah,
                nominal, metode_pembayaran, via, bank, no_rekening, bukti_pembayaran,
                keterangan, hijriyah, masehi, id_admin, admin, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                $jenisPembayaran,
                $idReferensi,
                $tabelReferensi,
                $data['id_santri'] ?? null,
                $data['id_jamaah'] ?? null,
                $data['nominal'] ?? 0,
                $data['metode_pembayaran'] ?? ($data['via'] ?? 'Cash'),
                $data['via'] ?? null,
                $data['bank'] ?? null,
                $data['no_rekening'] ?? null,
                $data['bukti_pembayaran'] ?? null,
                $data['keterangan'] ?? null,
                $data['hijriyah'] ?? null,
                $data['masehi'] ?? null,
                $data['id_admin'] ?? null,
                $data['admin'] ?? null,
                $data['status'] ?? 'Success'
            ]);
            
            $idPayment = $this->db->lastInsertId();
            
            // Update id_payment di tabel referensi
            $sqlUpdate = "UPDATE {$tabelReferensi} SET id_payment = ? WHERE id = ?";
            $stmtUpdate = $this->db->prepare($sqlUpdate);
            $stmtUpdate->execute([$idPayment, $idReferensi]);
            
            return $idPayment;
        } catch (\Exception $e) {
            error_log("Insert to payment error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * GET /api/umroh/tabungan - Dapatkan daftar tabungan
     */
    public function getAllTabungan(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idJamaah = $queryParams['id_jamaah'] ?? null;
            $jenis = $queryParams['jenis'] ?? null;
            $metodePembayaran = $queryParams['metode_pembayaran'] ?? null;
            $tanggalDari = $queryParams['tanggal_dari'] ?? null;
            $tanggalSampai = $queryParams['tanggal_sampai'] ?? null;
            $page = isset($queryParams['page']) ? (int)$queryParams['page'] : 1;
            $limit = isset($queryParams['limit']) ? (int)$queryParams['limit'] : 20;
            $offset = ($page - 1) * $limit;

            $whereClause = '';
            $params = [];
            $conditions = [];

            if ($idJamaah) {
                $conditions[] = "t.id_jamaah = ?";
                $params[] = $idJamaah;
            }

            if ($jenis) {
                $conditions[] = "t.jenis = ?";
                $params[] = $jenis;
            }

            if ($metodePembayaran) {
                $conditions[] = "t.metode_pembayaran = ?";
                $params[] = $metodePembayaran;
            }

            if ($tanggalDari) {
                $conditions[] = "DATE(t.tanggal_dibuat) >= ?";
                $params[] = $tanggalDari;
            }

            if ($tanggalSampai) {
                $conditions[] = "DATE(t.tanggal_dibuat) <= ?";
                $params[] = $tanggalSampai;
            }

            if (!empty($conditions)) {
                $whereClause = "WHERE " . implode(" AND ", $conditions);
            }

            // Get total count
            $countSql = "SELECT COUNT(*) as total FROM umroh___tabungan t $whereClause";
            $countStmt = $this->db->prepare($countSql);
            $countStmt->execute($params);
            $total = $countStmt->fetch(\PDO::FETCH_ASSOC)['total'];

            // Get data
            $sql = "SELECT t.*, 
                    j.nama_lengkap as jamaah_nama,
                    j.kode_jamaah,
                    p.nama as admin_nama
                    FROM umroh___tabungan t
                    LEFT JOIN umroh___jamaah j ON t.id_jamaah = j.id
                    LEFT JOIN pengurus p ON t.id_admin = p.id
                    $whereClause
                    ORDER BY t.tanggal_dibuat DESC
                    LIMIT ? OFFSET ?";
            
            $params[] = $limit;
            $params[] = $offset;
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data,
                'pagination' => [
                    'page' => $page,
                    'limit' => $limit,
                    'total' => (int)$total,
                    'total_pages' => ceil($total / $limit)
                ]
            ], 200);

        } catch (\Exception $e) {
            error_log("Get all tabungan error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error fetching tabungan data',
                'data' => []
            ], 500);
        }
    }

    /**
     * GET /api/umroh/tabungan/{id} - Dapatkan detail tabungan by ID
     */
    public function getTabunganById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID tabungan wajib diisi'
                ], 400);
            }

            $sql = "SELECT t.*, 
                    j.nama_lengkap as jamaah_nama,
                    j.kode_jamaah,
                    p.nama as admin_nama
                    FROM umroh___tabungan t
                    LEFT JOIN umroh___jamaah j ON t.id_jamaah = j.id
                    LEFT JOIN pengurus p ON t.id_admin = p.id
                    WHERE t.id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$id]);
            $data = $stmt->fetch(\PDO::FETCH_ASSOC);

            if ($data) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => $data
                ], 200);
            } else {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tabungan tidak ditemukan'
                ], 404);
            }

        } catch (\Exception $e) {
            error_log("Get tabungan by ID error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error fetching tabungan data'
            ], 500);
        }
    }

    /**
     * POST /api/umroh/tabungan - Buat transaksi tabungan baru
     */
    public function createTabungan(Request $request, Response $response): Response
    {
        try {
            $this->db->beginTransaction();

            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            $user = $request->getAttribute('user');
            
            $idAdmin = $user['user_id'] ?? $user['id'] ?? null;
            $idJamaah = $data['id_jamaah'] ?? null;
            $jenis = $data['jenis'] ?? 'Setoran';
            $nominal = $data['nominal'] ?? 0;
            $metodePembayaran = $data['metode_pembayaran'] ?? 'Cash';
            $keterangan = $data['keterangan'] ?? null;
            $hijriyah = $data['hijriyah'] ?? null;

            if (!$idJamaah) {
                $this->db->rollBack();
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID jamaah wajib diisi'
                ], 400);
            }

            // Check if jamaah exists
            $checkJamaah = "SELECT id, total_tabungan FROM umroh___jamaah WHERE id = ?";
            $stmtJamaah = $this->db->prepare($checkJamaah);
            $stmtJamaah->execute([$idJamaah]);
            $jamaah = $stmtJamaah->fetch(\PDO::FETCH_ASSOC);

            if (!$jamaah) {
                $this->db->rollBack();
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Jamaah tidak ditemukan'
                ], 404);
            }

            if (empty($nominal) || $nominal <= 0) {
                $this->db->rollBack();
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nominal harus lebih dari 0'
                ], 400);
            }

            // Validasi jenis
            $validJenis = ['Setoran', 'Penarikan', 'Koreksi'];
            if (!in_array($jenis, $validJenis)) {
                $this->db->rollBack();
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Jenis transaksi tidak valid'
                ], 400);
            }

            // Calculate saldo
            $saldoSebelum = (float)$jamaah['total_tabungan'];
            $saldoSesudah = $saldoSebelum;

            if ($jenis === 'Setoran') {
                $saldoSesudah = $saldoSebelum + $nominal;
            } elseif ($jenis === 'Penarikan') {
                if ($nominal > $saldoSebelum) {
                    $this->db->rollBack();
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Saldo tidak mencukupi untuk penarikan'
                    ], 400);
                }
                $saldoSesudah = $saldoSebelum - $nominal;
            } elseif ($jenis === 'Koreksi') {
                $saldoSesudah = $nominal; // Koreksi langsung set saldo
            }

            // Generate kode transaksi
            $kodeTransaksi = $this->generateKodeTransaksi();

            // Insert tabungan
            $sql = "INSERT INTO umroh___tabungan 
                    (id_jamaah, kode_transaksi, jenis, nominal, saldo_sebelum, saldo_sesudah, 
                     metode_pembayaran, bank, no_rekening, bukti_pembayaran, keterangan, hijriyah, id_admin) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                $idJamaah,
                $kodeTransaksi,
                $jenis,
                $nominal,
                $saldoSebelum,
                $saldoSesudah,
                $metodePembayaran,
                $data['bank'] ?? null,
                $data['no_rekening'] ?? null,
                $data['bukti_pembayaran'] ?? null,
                $keterangan,
                $hijriyah,
                $idAdmin
            ]);

            $idTabungan = $this->db->lastInsertId();

            // Insert ke tabel payment (induk)
            // Setoran = Tabungan, Penarikan = Umroh
            $jenisPembayaran = ($jenis === 'Setoran' || $jenis === 'Koreksi') ? 'Tabungan' : 'Umroh';
            $keteranganPayment = $keterangan;
            if ($keteranganPayment) {
                $keteranganPayment .= ' [' . $jenis . ']';
            } else {
                $keteranganPayment = '[' . $jenis . ']';
            }

            $this->insertToPayment($jenisPembayaran, $idTabungan, 'umroh___tabungan', [
                'id_jamaah' => $idJamaah,
                'nominal' => abs($nominal),
                'metode_pembayaran' => $metodePembayaran,
                'via' => $metodePembayaran,
                'bank' => $data['bank'] ?? null,
                'no_rekening' => $data['no_rekening'] ?? null,
                'bukti_pembayaran' => $data['bukti_pembayaran'] ?? null,
                'keterangan' => $keteranganPayment,
                'hijriyah' => $hijriyah,
                'id_admin' => $idAdmin,
                'status' => 'Success'
            ]);

            // Update total_tabungan di jamaah
            $updateJamaah = "UPDATE umroh___jamaah SET total_tabungan = ? WHERE id = ?";
            $stmtUpdate = $this->db->prepare($updateJamaah);
            $stmtUpdate->execute([$saldoSesudah, $idJamaah]);

            // Update status_pembayaran jika sudah lunas
            if ($saldoSesudah >= $jamaah['target_tabungan'] && $jamaah['target_tabungan'] > 0) {
                $updateStatus = "UPDATE umroh___jamaah SET status_pembayaran = 'Lunas' WHERE id = ?";
                $stmtStatus = $this->db->prepare($updateStatus);
                $stmtStatus->execute([$idJamaah]);
            }

            $this->db->commit();
            $newRow = $this->db->prepare("SELECT * FROM umroh___tabungan WHERE id = ?");
            $newRow->execute([$idTabungan]);
            $newRow = $newRow->fetch(\PDO::FETCH_ASSOC);
            if ($newRow && $idAdmin !== null) {
                UserAktivitasLogger::log(null, (int) $idAdmin, UserAktivitasLogger::ACTION_CREATE, 'umroh___tabungan', $idTabungan, null, $newRow, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Transaksi tabungan berhasil dibuat',
                'data' => [
                    'id' => $idTabungan,
                    'kode_transaksi' => $kodeTransaksi,
                    'saldo_sebelum' => $saldoSebelum,
                    'saldo_sesudah' => $saldoSesudah
                ]
            ], 201);

        } catch (\PDOException $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log("Error creating tabungan: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat membuat transaksi tabungan'
            ], 500);
        } catch (\Exception $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log("Error creating tabungan: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat membuat transaksi tabungan'
            ], 500);
        }
    }

    /**
     * PUT /api/umroh/tabungan/{id} - Update tabungan
     */
    public function updateTabungan(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID tabungan wajib diisi'
                ], 400);
            }

            // Get existing tabungan
            $getSql = "SELECT * FROM umroh___tabungan WHERE id = ?";
            $getStmt = $this->db->prepare($getSql);
            $getStmt->execute([$id]);
            $existing = $getStmt->fetch(\PDO::FETCH_ASSOC);

            if (!$existing) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tabungan tidak ditemukan'
                ], 404);
            }

            $fields = [
                'jenis', 'nominal', 'metode_pembayaran', 'bank', 'no_rekening',
                'bukti_pembayaran', 'keterangan', 'hijriyah'
            ];

            $set = [];
            $params = [];
            foreach ($fields as $field) {
                if (isset($data[$field])) {
                    $set[] = "$field = ?";
                    $params[] = $data[$field];
                }
            }

            if (empty($set)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak ada data yang diupdate'
                ], 400);
            }

            $params[] = $id;
            $sql = "UPDATE umroh___tabungan SET " . implode(', ', $set) . " WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $stmtNew = $this->db->prepare("SELECT * FROM umroh___tabungan WHERE id = ?");
            $stmtNew->execute([$id]);
            $newRow = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($newRow && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'umroh___tabungan', $id, $existing, $newRow, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Tabungan berhasil diupdate'
            ], 200);

        } catch (\PDOException $e) {
            error_log("Error updating tabungan: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat mengupdate tabungan'
            ], 500);
        } catch (\Exception $e) {
            error_log("Error updating tabungan: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat mengupdate tabungan'
            ], 500);
        }
    }

    /**
     * DELETE /api/umroh/tabungan/{id} - Hapus tabungan
     */
    public function deleteTabungan(Request $request, Response $response, array $args): Response
    {
        try {
            $this->db->beginTransaction();

            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID tabungan wajib diisi'
                ], 400);
            }

            // Get existing tabungan
            $getSql = "SELECT * FROM umroh___tabungan WHERE id = ?";
            $getStmt = $this->db->prepare($getSql);
            $getStmt->execute([$id]);
            $existing = $getStmt->fetch(\PDO::FETCH_ASSOC);

            if (!$existing) {
                $this->db->rollBack();
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tabungan tidak ditemukan'
                ], 404);
            }

            // Recalculate saldo jamaah
            $idJamaah = $existing['id_jamaah'];
            $jenis = $existing['jenis'];
            $nominal = $existing['nominal'];
            $saldoSesudah = $existing['saldo_sesudah'];

            // Delete tabungan
            $deleteSql = "DELETE FROM umroh___tabungan WHERE id = ?";
            $deleteStmt = $this->db->prepare($deleteSql);
            $deleteStmt->execute([$id]);

            // Recalculate total tabungan jamaah
            $recalcSql = "SELECT 
                SUM(CASE WHEN jenis = 'Setoran' THEN nominal ELSE 0 END) - 
                SUM(CASE WHEN jenis = 'Penarikan' THEN nominal ELSE 0 END) as total
                FROM umroh___tabungan
                WHERE id_jamaah = ?";
            $recalcStmt = $this->db->prepare($recalcSql);
            $recalcStmt->execute([$idJamaah]);
            $recalcResult = $recalcStmt->fetch(\PDO::FETCH_ASSOC);
            $newTotal = (float)($recalcResult['total'] ?? 0);

            // Update jamaah total_tabungan
            $updateJamaah = "UPDATE umroh___jamaah SET total_tabungan = ? WHERE id = ?";
            $updateStmt = $this->db->prepare($updateJamaah);
            $updateStmt->execute([$newTotal, $idJamaah]);

            $this->db->commit();
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_DELETE, 'umroh___tabungan', $id, $existing, null, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Tabungan berhasil dihapus'
            ], 200);

        } catch (\PDOException $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log("Error deleting tabungan: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat menghapus tabungan'
            ], 500);
        } catch (\Exception $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log("Error deleting tabungan: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat menghapus tabungan'
            ], 500);
        }
    }

    /**
     * Generate unique kode transaksi
     */
    private function generateKodeTransaksi(): string
    {
        $prefix = 'TAB-UMR-';
        $sql = "SELECT kode_transaksi FROM umroh___tabungan WHERE kode_transaksi LIKE ? ORDER BY kode_transaksi DESC LIMIT 1";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$prefix . '%']);
        $last = $stmt->fetch(\PDO::FETCH_ASSOC);

        if ($last) {
            $lastNumber = (int)str_replace($prefix, '', $last['kode_transaksi']);
            $newNumber = $lastNumber + 1;
        } else {
            $newNumber = 1;
        }

        return $prefix . str_pad($newNumber, 4, '0', STR_PAD_LEFT);
    }
}

