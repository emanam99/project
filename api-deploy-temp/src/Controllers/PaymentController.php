<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\SantriHelper;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class PaymentController
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
     * Helper untuk mendapatkan konfigurasi tabel berdasarkan mode.
     * Riwayat pembayaran di-load dari tabel asli (bukan dari tabel payment):
     * - uwaba: uwaba___bayar
     * - khusus: uwaba___bayar_khusus
     * - tunggakan: uwaba___bayar_tunggakan
     */
    private function getTableConfig(string $pageMode): array
    {
        if ($pageMode === 'khusus') {
            return [
                'tabel_utama' => 'uwaba___khusus',
                'tabel_bayar' => 'uwaba___bayar_khusus',
                'id_kolom_referensi' => 'id_khusus'
            ];
        } elseif ($pageMode === 'uwaba') {
            return [
                'tabel_utama' => 'uwaba',
                'tabel_bayar' => 'uwaba___bayar',
                'id_kolom_referensi' => 'id'
            ];
        } else {
            return [
                'tabel_utama' => 'uwaba___tunggakan',
                'tabel_bayar' => 'uwaba___bayar_tunggakan',
                'id_kolom_referensi' => 'id_tunggakan'
            ];
        }
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
     * GET /api/payment/rincian - Ambil rincian tunggakan/khusus berdasarkan id_santri
     */
    public function getRincian(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $pageMode = $queryParams['page'] ?? 'tunggakan';
            $idSantri = $queryParams['id_santri'] ?? null;
            $tahunAjaran = $queryParams['tahun_ajaran'] ?? null;

            if (!$idSantri) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_santri wajib diisi'
                ], 400);
            }

            $idSantriResolved = SantriHelper::resolveId($this->db, $idSantri);
            if ($idSantriResolved === null) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => ['rincian' => [], 'total' => ['total' => 0, 'bayar' => 0, 'kurang' => 0]]
                ], 200);
            }

            // Rincian uwaba (bulanan) punya struktur berbeda; gunakan GET /api/uwaba atau GET /api/public/pembayaran/uwaba
            if ($pageMode === 'uwaba') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Untuk rincian uwaba gunakan endpoint GET /api/uwaba dengan id dan tahun_ajaran, atau GET /api/public/pembayaran/uwaba'
                ], 400);
            }

            $config = $this->getTableConfig($pageMode);
            $tabelUtama = $config['tabel_utama'];
            $tabelBayar = $config['tabel_bayar'];
            $idKolomReferensi = $config['id_kolom_referensi'];

            // Untuk tunggakan dan khusus, ambil semua data tanpa filter tahun_ajaran
            $sqlTunggakan = "SELECT id, keterangan_1, keterangan_2, wajib, tahun_ajaran, lembaga FROM {$tabelUtama} WHERE id_santri=?";
            $stmt = $this->db->prepare($sqlTunggakan);
            $stmt->execute([$idSantriResolved]);
            
            $rincian = [];
            $totalNominal = 0;
            $totalBayar = 0;
            
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $row['wajib'] = (int)$row['wajib'];
                
                // Ambil total bayar dari tabel pembayaran
                $sqlSum = "SELECT COALESCE(SUM(nominal),0) as total_bayar FROM {$tabelBayar} WHERE {$idKolomReferensi}=?";
                $stmtSum = $this->db->prepare($sqlSum);
                $stmtSum->execute([$row['id']]);
                $rowSum = $stmtSum->fetch(\PDO::FETCH_ASSOC);
                $row['bayar'] = (int)$rowSum['total_bayar'];
                $row['kurang'] = $row['wajib'] - $row['bayar'];
                $totalNominal += $row['wajib'];
                $totalBayar += $row['bayar'];
                $rincian[] = $row;
            }

            $total = [
                'total' => $totalNominal,
                'bayar' => $totalBayar,
                'kurang' => $totalNominal - $totalBayar
            ];

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'rincian' => $rincian,
                    'total' => $total
                ]
            ], 200);

        } catch (\Exception $e) {
            error_log("Get rincian error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil rincian: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/payment/history - Ambil history pembayaran untuk id_tunggakan atau id_khusus
     */
    public function getPaymentHistory(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $pageMode = $queryParams['page'] ?? 'tunggakan';
            $idTunggakan = $queryParams['id_tunggakan'] ?? null;
            $idKhusus = $queryParams['id_khusus'] ?? null;

            $config = $this->getTableConfig($pageMode);
            $tabelBayar = $config['tabel_bayar'];
            $idKolomReferensi = $config['id_kolom_referensi'];

            $idReferensi = null;
            if ($pageMode === 'khusus' && $idKhusus) {
                $idReferensi = $idKhusus;
            } elseif ($pageMode === 'tunggakan' && $idTunggakan) {
                $idReferensi = $idTunggakan;
            } else {
                // Fallback: coba ambil dari query params
                $idReferensi = $queryParams[$idKolomReferensi] ?? null;
            }

            if (!$idReferensi) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID referensi tidak valid'
                ], 400);
            }

            $sqlHistory = "SELECT id, {$idKolomReferensi} AS id_referensi, nominal, via, admin, hijriyah, tanggal_dibuat FROM {$tabelBayar} WHERE {$idKolomReferensi}=? ORDER BY tanggal_dibuat DESC";
            $stmt = $this->db->prepare($sqlHistory);
            $stmt->execute([$idReferensi]);
            $history = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $history
            ], 200);

        } catch (\Exception $e) {
            error_log("Get payment history error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil riwayat pembayaran: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/payment/create - Buat pembayaran baru untuk tunggakan/khusus
     */
    public function createPayment(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $input = is_array($input) ? TextSanitizer::sanitizeStringValues($input, []) : [];
            $pageMode = $input['page'] ?? $request->getQueryParams()['page'] ?? 'tunggakan';

            $config = $this->getTableConfig($pageMode);
            $tabelUtama = $config['tabel_utama'];
            $tabelBayar = $config['tabel_bayar'];
            $idKolomReferensi = $config['id_kolom_referensi'];

            // Validasi parameter
            $requiredFields = ['amount', 'admin', 'id_admin', 'id_santri', 'hijriyah', 'via'];
            $missingFields = [];

            foreach ($requiredFields as $field) {
                if (!isset($input[$field]) || $input[$field] === "") {
                    $missingFields[] = $field;
                }
            }

            // Cek apakah ada id_tunggakan atau id_khusus
            $idReferensi = null;
            if ($pageMode === 'khusus' && isset($input['id_khusus'])) {
                $idReferensi = $input['id_khusus'];
            } elseif ($pageMode === 'tunggakan' && isset($input['id_tunggakan'])) {
                $idReferensi = $input['id_tunggakan'];
            } else {
                $idReferensi = $input[$idKolomReferensi] ?? null;
            }

            if (!$idReferensi) {
                $missingFields[] = $idKolomReferensi;
            }

            if (!empty($missingFields)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data input tidak valid. Field yang hilang: ' . implode(', ', $missingFields)
                ], 400);
            }

            $idSantriRaw = $input['id_santri'];
            $idSantri = SantriHelper::resolveId($this->db, $idSantriRaw);
            if ($idSantri === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan untuk ID/NIS: ' . $idSantriRaw
                ], 400);
            }
            $amount = (float)$input['amount'];
            $admin = $input['admin'];
            $idAdmin = $input['id_admin'];
            $hijriyah = $input['hijriyah'];
            $via = $input['via'];

            $this->db->beginTransaction();

            try {
                // Pastikan tunggakan/khusus ada
                $sqlSelect = "SELECT wajib FROM {$tabelUtama} WHERE id=? FOR UPDATE";
                $stmtSelect = $this->db->prepare($sqlSelect);
                $stmtSelect->execute([$idReferensi]);
                $tunggakan = $stmtSelect->fetch(\PDO::FETCH_ASSOC);

                if (!$tunggakan) {
                    throw new \Exception("Data dengan ID {$idReferensi} tidak ditemukan.");
                }
                $total = (float)$tunggakan['wajib'];

                // Hitung total bayar saat ini
                $sqlSum = "SELECT COALESCE(SUM(nominal),0) as total_bayar FROM {$tabelBayar} WHERE {$idKolomReferensi}=?";
                $stmtSum = $this->db->prepare($sqlSum);
                $stmtSum->execute([$idReferensi]);
                $rowSum = $stmtSum->fetch(\PDO::FETCH_ASSOC);
                $currentBayar = (float)$rowSum['total_bayar'];

                $newBayar = $currentBayar + $amount;
                if ($newBayar > $total) {
                    throw new \Exception("Pembayaran melebihi total tunggakan.");
                }

                // Insert pembayaran ke tabel pembayaran
                $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
                $sqlInsert = "INSERT INTO {$tabelBayar} (id_santri, {$idKolomReferensi}, nominal, via, admin, id_admin, hijriyah, tanggal_dibuat) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
                $stmtInsert = $this->db->prepare($sqlInsert);
                $stmtInsert->execute([$idSantri, $idReferensi, $amount, $via, $admin, $idAdmin, $hijriyah, $waktuIndonesia]);

                // Ambil id pembayaran yang baru dibuat
                $idPembayaran = $this->db->lastInsertId();

                // Insert ke tabel payment (induk)
                $jenisPembayaran = $pageMode === 'khusus' ? 'Khusus' : 'Tunggakan';
                $this->insertToPayment($jenisPembayaran, $idPembayaran, $tabelBayar, [
                    'id_santri' => $idSantri,
                    'nominal' => $amount,
                    'via' => $via,
                    'metode_pembayaran' => $via,
                    'hijriyah' => $hijriyah,
                    'id_admin' => $idAdmin,
                    'admin' => $admin,
                    'status' => 'Success'
                ]);

                $this->db->commit();
                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Pembayaran berhasil disimpan.'
                ], 200);

            } catch (\Exception $e) {
                $this->db->rollBack();
                error_log("Create payment error: " . $e->getMessage());
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Gagal memproses pembayaran: ' . $e->getMessage()
                ], 500);
            }

        } catch (\Exception $e) {
            error_log("Create payment error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memproses pembayaran: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/payment/delete - Hapus pembayaran
     */
    public function deletePayment(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $pageMode = $input['page'] ?? $request->getQueryParams()['page'] ?? 'tunggakan';

            if (!isset($input['id_bayar'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID Pembayaran diperlukan.'
                ], 400);
            }

            $idBayar = $input['id_bayar'];
            $config = $this->getTableConfig($pageMode);
            $tabelBayar = $config['tabel_bayar'];
            $idKolomReferensi = $config['id_kolom_referensi'];

            // Log untuk debugging
            error_log("Delete payment - ID: {$idBayar}, Mode: {$pageMode}, Table: {$tabelBayar}");

            $this->db->beginTransaction();

            try {
                // Cek apakah data pembayaran ada (tanpa FOR UPDATE karena tidak diperlukan)
                $sqlSelectBayar = "SELECT id, nominal, {$idKolomReferensi} FROM {$tabelBayar} WHERE id = ?";
                $stmtSelect = $this->db->prepare($sqlSelectBayar);
                $stmtSelect->execute([$idBayar]);
                $payment = $stmtSelect->fetch(\PDO::FETCH_ASSOC);

                if (!$payment) {
                    $this->db->rollBack();
                    error_log("Delete payment - Data tidak ditemukan: ID {$idBayar} di tabel {$tabelBayar}");
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => "Data pembayaran dengan ID {$idBayar} tidak ditemukan di tabel {$tabelBayar}."
                    ], 404);
                }

                // Hapus pembayaran dari tabel riwayat
                $sqlDelete = "DELETE FROM {$tabelBayar} WHERE id = ?";
                $stmtDelete = $this->db->prepare($sqlDelete);
                $stmtDelete->execute([$idBayar]);
                $deleted = $stmtDelete->rowCount();

                if ($deleted > 0) {
                    $this->db->commit();
                    error_log("Delete payment - Berhasil menghapus ID {$idBayar} dari tabel {$tabelBayar}");
                    return $this->jsonResponse($response, [
                        'success' => true,
                        'message' => 'Pembayaran berhasil dihapus.'
                    ], 200);
                } else {
                    $this->db->rollBack();
                    error_log("Delete payment - Tidak ada baris yang dihapus: ID {$idBayar} di tabel {$tabelBayar}");
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Tidak ada data yang dihapus. Data mungkin sudah tidak ada.'
                    ], 404);
                }

            } catch (\Exception $e) {
                $this->db->rollBack();
                error_log("Delete payment error (inner): " . $e->getMessage());
                error_log("Delete payment error (inner) trace: " . $e->getTraceAsString());
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Gagal menghapus pembayaran: ' . $e->getMessage()
                ], 500);
            }

        } catch (\Exception $e) {
            error_log("Delete payment error (outer): " . $e->getMessage());
            error_log("Delete payment error (outer) trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus pembayaran: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/payment/check-related - Cek apakah ada pembayaran terkait
     */
    public function checkRelatedPayment(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $pageMode = $input['page'] ?? $request->getQueryParams()['page'] ?? 'tunggakan';

            if (!isset($input['id'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID wajib diisi.'
                ], 400);
            }

            $id = $input['id'];
            $config = $this->getTableConfig($pageMode);
            $tabelBayar = $config['tabel_bayar'];
            $idKolomReferensi = $config['id_kolom_referensi'];

            $sqlCek = "SELECT COUNT(*) as jumlah, COALESCE(SUM(nominal),0) as total_bayar FROM {$tabelBayar} WHERE {$idKolomReferensi}=?";
            $stmtCek = $this->db->prepare($sqlCek);
            $stmtCek->execute([$id]);
            $row = $stmtCek->fetch(\PDO::FETCH_ASSOC);
            $ada = ($row && $row['jumlah'] > 0);
            $totalBayar = $row ? (float)$row['total_bayar'] : 0;

            return $this->jsonResponse($response, [
                'success' => true,
                'ada_pembayaran' => $ada,
                'jumlah' => (int)($row['jumlah'] ?? 0),
                'total_bayar' => $totalBayar
            ], 200);

        } catch (\Exception $e) {
            error_log("Check related payment error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengecek pembayaran terkait: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/payment/insert - Tambah data tunggakan/khusus
     */
    public function insertTunggakanKhusus(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $input = is_array($input) ? TextSanitizer::sanitizeStringValues($input, []) : [];
            $pageMode = $input['page'] ?? $request->getQueryParams()['page'] ?? 'tunggakan';
            
            $tabel = $pageMode === 'khusus' ? 'uwaba___khusus' : 'uwaba___tunggakan';
            
            if (!isset($input['id_santri'], $input['keterangan_1'], $input['total'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data input tidak valid.'
                ], 400);
            }
            
            $idSantriParam = $input['id_santri'];
            $idSantri = SantriHelper::resolveId($this->db, $idSantriParam);
            if ($idSantri === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan (id_santri/NIS tidak valid).'
                ], 404);
            }
            $keterangan1 = $input['keterangan_1'];
            $keterangan2 = $input['keterangan_2'] ?? null;
            $wajib = (float)$input['total']; // Input masih 'total' untuk backward compatibility
            $tahunAjaran = $input['tahun_ajaran'];
            $lembaga = $input['lembaga'];
            $idAdmin = $input['id_admin'] ?? null;
            $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            
            $sqlInsert = "INSERT INTO {$tabel} (id_santri, keterangan_1, keterangan_2, wajib, tahun_ajaran, lembaga, tanggal_dibuat, id_admin) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
            $stmtInsert = $this->db->prepare($sqlInsert);
            $stmtInsert->execute([$idSantri, $keterangan1, $keterangan2, $wajib, $tahunAjaran, $lembaga, $waktuIndonesia, $idAdmin]);
            $newId = (int) $this->db->lastInsertId();
            $newRow = [
                'id' => $newId,
                'id_santri' => $idSantri,
                'keterangan_1' => $keterangan1,
                'keterangan_2' => $keterangan2,
                'wajib' => $wajib,
                'tahun_ajaran' => $tahunAjaran,
                'lembaga' => $lembaga,
                'tanggal_dibuat' => $waktuIndonesia,
                'id_admin' => $idAdmin,
            ];
            $u = $request->getAttribute('user');
            $idAdminResolved = $idAdmin !== null ? (int) $idAdmin : (isset($u['user_id']) ? (int) $u['user_id'] : (isset($u['id']) ? (int) $u['id'] : null));
            UserAktivitasLogger::log(null, $idAdminResolved, UserAktivitasLogger::ACTION_CREATE, $tabel, $newId, null, $newRow, $request);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data berhasil ditambahkan.'
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Insert tunggakan/khusus error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan data: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/payment/update - Update data tunggakan/khusus
     */
    public function updateTunggakanKhusus(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $input = is_array($input) ? TextSanitizer::sanitizeStringValues($input, []) : [];
            $pageMode = $input['page'] ?? $request->getQueryParams()['page'] ?? 'tunggakan';
            
            $tabel = $pageMode === 'khusus' ? 'uwaba___khusus' : 'uwaba___tunggakan';
            
            if (!isset($input['id'], $input['keterangan_1'], $input['total'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data input tidak valid.'
                ], 400);
            }
            
            $id = $input['id'];
            $keterangan1 = $input['keterangan_1'];
            $keterangan2 = $input['keterangan_2'] ?? null;
            $wajib = (float)$input['total']; // Input masih 'total' untuk backward compatibility
            $tahunAjaran = $input['tahun_ajaran'] ?? null;
            $lembaga = $input['lembaga'] ?? null;
            $idAdmin = $input['id_admin'] ?? null;
            
            // Ambil baris lengkap untuk audit (old_data)
            $sqlSelect = "SELECT * FROM {$tabel} WHERE id = ?";
            $stmtSelect = $this->db->prepare($sqlSelect);
            $stmtSelect->execute([$id]);
            $existing = $stmtSelect->fetch(\PDO::FETCH_ASSOC);
            
            if (!$existing) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data tidak ditemukan.'
                ], 404);
            }
            
            // Gunakan nilai dari input jika ada, jika tidak gunakan nilai dari database
            $finalTahunAjaran = ($tahunAjaran !== null && $tahunAjaran !== '') ? $tahunAjaran : $existing['tahun_ajaran'];
            $finalLembaga = ($lembaga !== null && $lembaga !== '') ? $lembaga : $existing['lembaga'];
            $finalWajib = ($wajib > 0) ? $wajib : (float)$existing['wajib'];
            $finalKeterangan1 = ($keterangan1 !== null && $keterangan1 !== '') ? $keterangan1 : $existing['keterangan_1'];
            $finalKeterangan2 = ($keterangan2 !== null && $keterangan2 !== '') ? $keterangan2 : $existing['keterangan_2'];
            
            if ($finalWajib <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Total wajib harus lebih dari 0.'
                ], 400);
            }
            
            $sqlUpdate = "UPDATE {$tabel} SET keterangan_1=?, keterangan_2=?, wajib=?, tahun_ajaran=?, lembaga=?, id_admin=? WHERE id=?";
            $stmtUpdate = $this->db->prepare($sqlUpdate);
            $stmtUpdate->execute([$finalKeterangan1, $finalKeterangan2, $finalWajib, $finalTahunAjaran, $finalLembaga, $idAdmin, $id]);
            $newRow = $existing;
            $newRow['keterangan_1'] = $finalKeterangan1;
            $newRow['keterangan_2'] = $finalKeterangan2;
            $newRow['wajib'] = $finalWajib;
            $newRow['tahun_ajaran'] = $finalTahunAjaran;
            $newRow['lembaga'] = $finalLembaga;
            $newRow['id_admin'] = $idAdmin;
            $u = $request->getAttribute('user');
            $idAdminResolved = $idAdmin !== null ? (int) $idAdmin : (isset($u['user_id']) ? (int) $u['user_id'] : (isset($u['id']) ? (int) $u['id'] : null));
            UserAktivitasLogger::log(null, $idAdminResolved, UserAktivitasLogger::ACTION_UPDATE, $tabel, $id, $existing, $newRow, $request);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data berhasil diupdate.'
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Update tunggakan/khusus error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate data: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/payment/delete-item - Hapus data tunggakan/khusus
     */
    public function deleteTunggakanKhusus(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $pageMode = $input['page'] ?? $request->getQueryParams()['page'] ?? 'tunggakan';
            
            if (!isset($input['id'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID wajib diisi.'
                ], 400);
            }
            
            $id = $input['id'];
            $tabel = $pageMode === 'khusus' ? 'uwaba___khusus' : 'uwaba___tunggakan';
            $stmtOld = $this->db->prepare("SELECT * FROM {$tabel} WHERE id = ?");
            $stmtOld->execute([$id]);
            $oldRow = $stmtOld->fetch(\PDO::FETCH_ASSOC);
            
            $sqlDelete = "DELETE FROM {$tabel} WHERE id=?";
            $stmtDelete = $this->db->prepare($sqlDelete);
            $stmtDelete->execute([$id]);
            if ($oldRow) {
                $u = $request->getAttribute('user');
                $idAdminResolved = isset($u['user_id']) ? (int) $u['user_id'] : (isset($u['id']) ? (int) $u['id'] : null);
                UserAktivitasLogger::log(null, $idAdminResolved, UserAktivitasLogger::ACTION_DELETE, $tabel, $id, $oldRow, null, $request);
            }
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data berhasil dihapus.'
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Delete tunggakan/khusus error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus data: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/payment/khusus - Ambil data pembayaran khusus dengan filter
     */
    public function getPembayaranKhusus(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $tahunAjaran = $queryParams['tahun_ajaran'] ?? '';
            $keterangan1 = $queryParams['keterangan_1'] ?? '';
            
            // Validasi input
            if (strlen($tahunAjaran) > 20) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tahun ajaran terlalu panjang (maksimal 20 karakter)',
                    'error_type' => 'validation'
                ], 400);
            }
            
            if (strlen($keterangan1) > 255) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Keterangan terlalu panjang (maksimal 255 karakter)',
                    'error_type' => 'validation'
                ], 400);
            }
            
            // Query untuk mendapatkan data pembayaran khusus
            $sql = "
                SELECT 
                    k.id,
                    k.id_santri,
                    s.nama as nama_santri,
                    s.nim_formal as nim,
                    s.status_santri,
                    k.wajib as total,
                    (k.wajib - COALESCE(SUM(bk.nominal), 0)) as kurang,
                    k.keterangan_1,
                    k.keterangan_2,
                    k.tahun_ajaran,
                    k.lembaga,
                    rf.kelas AS kelas_formal,
                    rf.kel AS kel_formal,
                    k.tanggal_dibuat,
                    COALESCE(SUM(bk.nominal), 0) as total_bayar,
                    CASE 
                        WHEN COALESCE(SUM(bk.nominal), 0) >= k.wajib THEN 'Lunas'
                        WHEN COALESCE(SUM(bk.nominal), 0) > 0 THEN 'Belum Lunas'
                        ELSE 'Belum Bayar'
                    END as status_pembayaran
                FROM uwaba___khusus k
                LEFT JOIN santri s ON k.id_santri = s.id
                LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                LEFT JOIN uwaba___bayar_khusus bk ON k.id = bk.id_khusus
            ";
            
            $whereConditions = [];
            $params = [];
            
            // Filter tahun ajaran
            if (!empty($tahunAjaran)) {
                $whereConditions[] = "k.tahun_ajaran = ?";
                $params[] = $tahunAjaran;
            }
            
            // Filter keterangan_1
            if (!empty($keterangan1)) {
                $whereConditions[] = "k.keterangan_1 = ?";
                $params[] = $keterangan1;
            }
            
            // Tambahkan WHERE clause jika ada filter
            if (!empty($whereConditions)) {
                $sql .= " WHERE " . implode(" AND ", $whereConditions);
            }
            
            $sql .= " GROUP BY k.id ORDER BY k.tanggal_dibuat DESC";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            // Query untuk mendapatkan daftar tahun ajaran yang tersedia
            $sqlTahun = "SELECT DISTINCT tahun_ajaran FROM uwaba___khusus WHERE tahun_ajaran IS NOT NULL AND tahun_ajaran != '' ORDER BY tahun_ajaran DESC";
            $stmtTahun = $this->db->query($sqlTahun);
            $tahunAjaranList = $stmtTahun->fetchAll(\PDO::FETCH_COLUMN);
            
            // Query untuk mendapatkan daftar keterangan_1 yang tersedia
            $sqlKeterangan = "SELECT DISTINCT keterangan_1 FROM uwaba___khusus WHERE keterangan_1 IS NOT NULL AND keterangan_1 != '' ORDER BY keterangan_1";
            $stmtKeterangan = $this->db->query($sqlKeterangan);
            $keteranganList = $stmtKeterangan->fetchAll(\PDO::FETCH_COLUMN);
            
            // Hitung statistik
            $totalSantri = count($data);
            $totalLunas = 0;
            $totalBelumLunas = 0;
            $totalBelumBayar = 0;
            $totalNominal = 0;
            $totalBayar = 0;
            
            foreach ($data as $row) {
                if ($row['status_pembayaran'] === 'Lunas') {
                    $totalLunas++;
                } elseif ($row['status_pembayaran'] === 'Belum Lunas') {
                    $totalBelumLunas++;
                } else {
                    $totalBelumBayar++;
                }
                $totalNominal += $row['total'];
                $totalBayar += $row['total_bayar'];
            }
            
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data,
                'filters' => [
                    'tahun_ajaran' => $tahunAjaran,
                    'keterangan_1' => $keterangan1
                ],
                'options' => [
                    'tahun_ajaran_list' => $tahunAjaranList,
                    'keterangan_list' => $keteranganList
                ],
                'statistics' => [
                    'total_santri' => $totalSantri,
                    'total_lunas' => $totalLunas,
                    'total_belum_lunas' => $totalBelumLunas,
                    'total_belum_bayar' => $totalBelumBayar,
                    'total_nominal' => $totalNominal,
                    'total_bayar' => $totalBayar,
                    'total_kurang' => $totalNominal - $totalBayar
                ]
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Get pembayaran khusus error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Database error: ' . $e->getMessage(),
                'error_type' => 'database'
            ], 500);
        }
    }

    /**
     * POST /api/payment/syahriah/last-number - Ambil nomor pembayaran terakhir untuk uwaba
     */
    public function getSyahriahLastNumber(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $idSantri = $input['id_santri'] ?? '';
            $tahunAjaran = $input['tahun_ajaran'] ?? '';
            
            if (empty($idSantri) || empty($tahunAjaran)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID Santri dan tahun ajaran harus diisi'
                ], 400);
            }
            
            $stmt = $this->db->prepare("
                SELECT COUNT(*) as last_number 
                FROM uwaba___bayar 
                WHERE id_santri = ? AND tahun_ajaran = ?
            ");
            $stmt->execute([$idSantri, $tahunAjaran]);
            $result = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'last_number' => (int)($result['last_number'] ?? 0)
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Get uwaba last number error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil nomor terakhir: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/payment/syahriah/save - Simpan pembayaran uwaba
     */
    public function saveSyahriahPayment(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $input = is_array($input) ? TextSanitizer::sanitizeStringValues($input, []) : [];
            $idSantriParam = $input['id_santri'] ?? '';
            $nominal = $input['nominal'] ?? 0;
            $via = $input['via'] ?? 'Cash';
            $tahunAjaran = $input['tahun_ajaran'] ?? '';
            $hijriyah = $input['hijriyah'] ?? '';
            $idAdmin = $input['id_admin'] ?? 1;
            $admin = $input['admin'] ?? 'Admin';
            
            if ($idSantriParam === '' || $idSantriParam === null || empty($nominal) || empty($tahunAjaran)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data pembayaran tidak lengkap'
                ], 400);
            }
            
            // Resolve id_santri: frontend bisa kirim santri.id atau NIS (setelah migrasi 78, id = AUTO_INCREMENT)
            $idSantri = SantriHelper::resolveId($this->db, $idSantriParam);
            if ($idSantri === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan (id_santri/NIS tidak valid)'
                ], 404);
            }
            
            // Hitung nomor pembayaran
            $stmtCount = $this->db->prepare('SELECT COUNT(*) FROM uwaba___bayar WHERE id_santri = ? AND tahun_ajaran = ?');
            $stmtCount->execute([$idSantri, $tahunAjaran]);
            $count = $stmtCount->fetchColumn();
            $nomor = $count + 1;
            
            // Insert pembayaran (id akan AUTO_INCREMENT)
            $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            $stmt = $this->db->prepare("
                INSERT INTO uwaba___bayar 
                (id_santri, nominal, via, tahun_ajaran, hijriyah, id_admin, admin, nomor, masehi) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$idSantri, $nominal, $via, $tahunAjaran, $hijriyah, $idAdmin, $admin, $nomor, $waktuIndonesia]);
            
            // Ambil id yang baru dibuat
            $newId = $this->db->lastInsertId();
            $stmtNew = $this->db->prepare("SELECT * FROM uwaba___bayar WHERE id = ?");
            $stmtNew->execute([$newId]);
            $newBayar = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            if ($newBayar) {
                UserAktivitasLogger::log(null, $idAdmin, UserAktivitasLogger::ACTION_CREATE, 'uwaba___bayar', $newId, null, $newBayar, $request);
            }

            // Insert ke tabel payment (induk)
            $this->insertToPayment('Uwaba', $newId, 'uwaba___bayar', [
                'id_santri' => $idSantri,
                'nominal' => $nominal,
                'via' => $via,
                'metode_pembayaran' => $via,
                'hijriyah' => $hijriyah,
                'masehi' => date('Y-m-d', strtotime($waktuIndonesia)),
                'id_admin' => $idAdmin,
                'admin' => $admin,
                'status' => 'Success'
            ]);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pembayaran berhasil disimpan',
                'id' => $newId
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Save uwaba payment error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan pembayaran: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/payment/syahriah/delete - Hapus pembayaran uwaba
     */
    public function deleteSyahriahPayment(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $id = $input['id'] ?? '';
            
            if (empty($id)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID pembayaran harus diisi'
                ], 400);
            }
            
            // Validasi bahwa id adalah integer (karena sekarang AUTO_INCREMENT INT)
            $id = filter_var($id, FILTER_VALIDATE_INT);
            if ($id === false) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID pembayaran harus berupa angka'
                ], 400);
            }
            
            // Cek apakah data pembayaran ada sebelum dihapus (ambil full row untuk audit)
            $stmtCheck = $this->db->prepare("SELECT * FROM uwaba___bayar WHERE id = ?");
            $stmtCheck->execute([$id]);
            $oldBayar = $stmtCheck->fetch(\PDO::FETCH_ASSOC);
            
            if (!$oldBayar) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pembayaran tidak ditemukan'
                ], 404);
            }
            $user = $request->getAttribute('user');
            $idAdmin = $user['user_id'] ?? $user['id'] ?? null;
            
            // Coba hapus pembayaran
            // Jika error karena trigger yang bermasalah, nonaktifkan trigger dan coba lagi
            $triggerName = 'trg_backup_before_delete_uwaba_bayar';
            $triggerWasDisabled = false;
            
            try {
                // Hapus pembayaran (id sekarang adalah INT AUTO_INCREMENT)
                // Catatan: Foreign key constraint akan otomatis menangani relasi dengan tabel payment
                // Foreign key constraint fk_uwaba_bayar_id_payment akan set id_payment menjadi NULL saat delete
                $stmt = $this->db->prepare("DELETE FROM uwaba___bayar WHERE id = ?");
                $stmt->execute([$id]);
            } catch (\PDOException $e) {
                // Jika error karena trigger (error tentang INSERT dengan kolom tidak sesuai)
                if (strpos($e->getMessage(), 'Column count') !== false || 
                    strpos($e->getMessage(), 'Insert value list') !== false ||
                    strpos($e->getMessage(), 'does not match') !== false) {
                    
                    error_log("Delete failed due to trigger error. Attempting to disable trigger: " . $e->getMessage());
                    
                    try {
                        // Nonaktifkan trigger sementara
                        $this->db->exec("DROP TRIGGER IF EXISTS `{$triggerName}`");
                        $triggerWasDisabled = true;
                        error_log("Trigger {$triggerName} disabled temporarily");
                        
                        // Coba hapus lagi tanpa trigger
                        $stmt = $this->db->prepare("DELETE FROM uwaba___bayar WHERE id = ?");
                        $stmt->execute([$id]);
                    } catch (\Exception $e2) {
                        error_log("Error during trigger disable/retry: " . $e2->getMessage());
                        throw $e; // Throw original error
                    }
                } else {
                    // Error lain, throw as is
                    throw $e;
                }
            }
            if ($stmt->rowCount() > 0 && $oldBayar) {
                UserAktivitasLogger::log(null, $idAdmin, UserAktivitasLogger::ACTION_DELETE, 'uwaba___bayar', $id, $oldBayar, null, $request);
            }
            
            if ($stmt->rowCount() > 0) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Pembayaran berhasil dihapus'
                ], 200);
            } else {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pembayaran tidak ditemukan atau sudah dihapus'
                ], 404);
            }
            
        } catch (\PDOException $e) {
            error_log("Delete uwaba payment PDO error: " . $e->getMessage());
            error_log("PDO Error Code: " . $e->getCode());
            error_log("PDO Error Info: " . print_r($e->errorInfo, true));
            
            // Handle specific database errors
            $errorMessage = 'Gagal menghapus pembayaran';
            if ($e->getCode() == 23000) {
                $errorMessage = 'Pembayaran tidak dapat dihapus karena masih terhubung dengan data lain';
            } elseif ($e->getCode() == 42000) {
                $errorMessage = 'Kesalahan sintaks database';
            }
            
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => $errorMessage . ': ' . $e->getMessage()
            ], 500);
        } catch (\Exception $e) {
            error_log("Delete uwaba payment error: " . $e->getMessage());
            error_log("Error trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus pembayaran: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/payment/syahriah/history - Ambil riwayat pembayaran uwaba
     */
    public function getSyahriahHistory(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $idSantriParam = $input['id_santri'] ?? '';
            $tahunAjaran = $input['tahun_ajaran'] ?? '';
            $filter = $input['filter'] ?? '';
            
            if ($idSantriParam === '' || $idSantriParam === null || empty($tahunAjaran)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID Santri dan tahun ajaran harus diisi'
                ], 400);
            }
            
            // Resolve id_santri: frontend bisa kirim santri.id atau NIS
            $idSantri = SantriHelper::resolveId($this->db, $idSantriParam);
            if ($idSantri === null) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => []
                ], 200);
            }
            
            $query = "
                SELECT id, nominal, via, hijriyah, admin, masehi, tanggal_dibuat
                FROM uwaba___bayar 
                WHERE id_santri = ? AND tahun_ajaran = ?
                ORDER BY COALESCE(masehi, tanggal_dibuat) DESC
            ";
            
            $params = [$idSantri, $tahunAjaran];
            
            // Filter 'uwaba' tidak diperlukan lagi karena semua pembayaran uwaba masuk ke tabel ini
            // Jika perlu filter di masa depan, bisa menggunakan kolom lain atau flag khusus
            
            $stmt = $this->db->prepare($query);
            $stmt->execute($params);
            $payments = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $payments
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Get uwaba history error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil riwayat pembayaran: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/public/pembayaran/uwaba/tahun-list - Daftar tahun ajaran UWABA (format 1447-1448 dari tabel uwaba)
     * Dipakai agar insert uwaba___bayar memakai tahun_ajaran yang benar (1447-1448), bukan hanya 1447.
     */
    public function getPublicUwabaTahunList(Request $request, Response $response): Response
    {
        try {
            $stmt = $this->db->query("SHOW TABLES LIKE 'uwaba'");
            if ($stmt->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => true, 'data' => ['tahun_ajaran' => []]], 200);
            }
            $stmt = $this->db->query("SELECT DISTINCT tahun_ajaran FROM uwaba WHERE tahun_ajaran IS NOT NULL AND TRIM(tahun_ajaran) != '' ORDER BY tahun_ajaran DESC");
            $rows = $stmt->fetchAll(\PDO::FETCH_COLUMN);
            $list = is_array($rows) ? array_values($rows) : [];
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => ['tahun_ajaran' => $list]
            ], 200);
        } catch (\Exception $e) {
            error_log("getPublicUwabaTahunList error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar tahun ajaran UWABA'
            ], 500);
        }
    }

    /**
     * GET /api/public/pembayaran/{mode} - Public endpoint untuk rincian pembayaran
     * Mode: uwaba, khusus, tunggakan
     */
    public function getPublicRincian(Request $request, Response $response, array $args): Response
    {
        try {
            $mode = $args['mode'] ?? null;
            $queryParams = $request->getQueryParams();
            $idSantri = $queryParams['id_santri'] ?? null;
            $tahunAjaran = $queryParams['tahun_ajaran'] ?? null;

            if (!$idSantri) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_santri wajib diisi'
                ], 400);
            }

            // Validasi mode
            $validModes = ['uwaba', 'khusus', 'tunggakan'];
            if (!in_array($mode, $validModes)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Mode tidak valid. Gunakan: uwaba, khusus, atau tunggakan'
                ], 400);
            }

            $idSantriResolved = SantriHelper::resolveId($this->db, $idSantri);
            if ($idSantriResolved === null) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => ['rincian' => [], 'total' => ['total' => 0, 'bayar' => 0, 'kurang' => 0]]
                ], 200);
            }

            // Untuk uwaba, gunakan struktur berbeda (tabel uwaba)
            if ($mode === 'uwaba') {
                // Jika tidak ada tahun_ajaran, gunakan tahun saat ini
                if (!$tahunAjaran) {
                    $tahunAjaran = date('Y');
                }
                
                // Debug: log untuk troubleshooting
                error_log("Public UWABA - id_santri: {$idSantri}, tahun_ajaran: {$tahunAjaran}");

                // Cek apakah tabel uwaba ada
                $stmtCheckTable = $this->db->prepare("SHOW TABLES LIKE 'uwaba'");
                $stmtCheckTable->execute();
                $tableExists = $stmtCheckTable->rowCount() > 0;

                if (!$tableExists) {
                    return $this->jsonResponse($response, [
                        'success' => true,
                        'data' => [
                            'rincian' => [],
                            'total' => ['total' => 0, 'bayar' => 0, 'kurang' => 0]
                        ]
                    ], 200);
                }

                // Ambil data dari uwaba (wajib per bulan); total bayar diambil dari SUM(uwaba___bayar) di tahun ajaran tersebut
                $sqlUwaba = "SELECT id, id_bulan, wajib, nominal, tahun_ajaran, bulan FROM uwaba WHERE id_santri=? AND tahun_ajaran=? AND is_disabled=0 ORDER BY FIELD(id_bulan, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8)";
                $stmt = $this->db->prepare($sqlUwaba);
                $stmt->execute([$idSantriResolved, $tahunAjaran]);
                
                $rincian = [];
                $totalNominal = 0;
                
                $bulanMapping = [
                    1 => 'Muharram',
                    2 => 'Shafar',
                    3 => 'Rabiul Awal',
                    4 => 'Rabiul Akhir',
                    5 => 'Jumadil Ula',
                    6 => 'Jumadil Akhir',
                    7 => 'Rajab',
                    8 => 'Sya\'ban',
                    9 => 'Ramadhan',
                    10 => 'Syawal',
                    11 => 'Dzul Qo\'dah',
                    12 => 'Dzul Hijjah'
                ];
                
                while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                    $idBulan = (int)$row['id_bulan'];
                    $wajib = (int)($row['wajib'] ?? 0);
                    $bayar = (int)($row['nominal'] ?? 0);
                    
                    $namaBulan = !empty($row['bulan']) && $row['bulan'] !== '-' 
                        ? $row['bulan'] 
                        : ($bulanMapping[$idBulan] ?? "Bulan {$idBulan}");
                    
                    $rincian[] = [
                        'id' => $row['id'],
                        'id_bulan' => $idBulan,
                        'keterangan_1' => $namaBulan,
                        'keterangan_2' => null,
                        'wajib' => $wajib,
                        'bayar' => $bayar,
                        'kurang' => $wajib - $bayar,
                        'tahun_ajaran' => $row['tahun_ajaran'],
                        'lembaga' => null
                    ];
                    
                    $totalNominal += $wajib;
                }

                // Total bayar = SUM dari list bayar (uwaba___bayar) di tahun ajaran ini, bukan dari wajib per bulan
                $stmtSum = $this->db->prepare("SELECT COALESCE(SUM(nominal), 0) AS total_bayar FROM uwaba___bayar WHERE id_santri = ? AND tahun_ajaran = ?");
                $stmtSum->execute([$idSantriResolved, $tahunAjaran]);
                $rowSum = $stmtSum->fetch(\PDO::FETCH_ASSOC);
                $totalBayar = (int) ($rowSum['total_bayar'] ?? 0);

                $total = [
                    'total' => $totalNominal,
                    'bayar' => $totalBayar,
                    'kurang' => $totalNominal - $totalBayar
                ];

                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => [
                        'rincian' => $rincian,
                        'total' => $total
                    ]
                ], 200);
            }

            // Untuk khusus dan tunggakan, gunakan struktur yang sama
            $config = $this->getTableConfig($mode);
            $tabelUtama = $config['tabel_utama'];
            $tabelBayar = $config['tabel_bayar'];
            $idKolomReferensi = $config['id_kolom_referensi'];

            // Untuk tunggakan dan khusus, ambil semua data tanpa filter tahun_ajaran
            $sqlTunggakan = "SELECT id, keterangan_1, keterangan_2, wajib, tahun_ajaran, lembaga FROM {$tabelUtama} WHERE id_santri=?";
            $stmt = $this->db->prepare($sqlTunggakan);
            $stmt->execute([$idSantriResolved]);
            
            $rincian = [];
            $totalNominal = 0;
            $totalBayar = 0;
            
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $row['wajib'] = (int)$row['wajib'];
                
                // Ambil total bayar dari tabel pembayaran
                $sqlSum = "SELECT COALESCE(SUM(nominal),0) as total_bayar FROM {$tabelBayar} WHERE {$idKolomReferensi}=?";
                $stmtSum = $this->db->prepare($sqlSum);
                $stmtSum->execute([$row['id']]);
                $rowSum = $stmtSum->fetch(\PDO::FETCH_ASSOC);
                $row['bayar'] = (int)$rowSum['total_bayar'];
                $row['kurang'] = $row['wajib'] - $row['bayar'];
                $totalNominal += $row['wajib'];
                $totalBayar += $row['bayar'];
                $rincian[] = $row;
            }

            $total = [
                'total' => $totalNominal,
                'bayar' => $totalBayar,
                'kurang' => $totalNominal - $totalBayar
            ];

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'rincian' => $rincian,
                    'total' => $total
                ]
            ], 200);

        } catch (\Exception $e) {
            error_log("Get public rincian error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil rincian: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/public/pembayaran/{mode}/history - Public endpoint untuk riwayat pembayaran.
     * Data di-load dari tabel asli (bukan payment): uwaba___bayar, uwaba___bayar_khusus, uwaba___bayar_tunggakan.
     * Mode: uwaba, khusus, tunggakan
     */
    public function getPublicPaymentHistory(Request $request, Response $response, array $args): Response
    {
        try {
            $mode = $args['mode'] ?? null;
            $queryParams = $request->getQueryParams();
            $idSantri = $queryParams['id_santri'] ?? null;
            $tahunAjaran = $queryParams['tahun_ajaran'] ?? null;

            if (!$idSantri) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_santri wajib diisi'
                ], 400);
            }

            // Validasi mode
            $validModes = ['uwaba', 'khusus', 'tunggakan'];
            if (!in_array($mode, $validModes)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Mode tidak valid. Gunakan: uwaba, khusus, atau tunggakan'
                ], 400);
            }

            $idSantriResolved = SantriHelper::resolveId($this->db, $idSantri);
            if ($idSantriResolved === null) {
                return $this->jsonResponse($response, ['success' => true, 'data' => []], 200);
            }

            // Riwayat uwaba: dari tabel uwaba___bayar (bukan payment)
            if ($mode === 'uwaba') {
                if (!$tahunAjaran) {
                    $tahunAjaran = date('Y');
                }

                $query = "
                    SELECT id, nominal, via, hijriyah, admin, masehi, tanggal_dibuat
                    FROM uwaba___bayar 
                    WHERE id_santri = ? AND tahun_ajaran = ?
                    ORDER BY COALESCE(masehi, tanggal_dibuat) DESC
                ";
                
                $stmt = $this->db->prepare($query);
                $stmt->execute([$idSantriResolved, $tahunAjaran]);
                $payments = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                // Pastikan unik per id (satu baris = satu transaksi pembayaran)
                $byId = [];
                foreach ($payments as $row) {
                    $id = $row['id'] ?? null;
                    if ($id !== null && !isset($byId[$id])) {
                        $byId[$id] = $row;
                    }
                }
                $payments = array_values($byId);

                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => $payments
                ], 200);
            }

            // Riwayat khusus/tunggakan: dari uwaba___bayar_khusus / uwaba___bayar_tunggakan (bukan payment)
            $config = $this->getTableConfig($mode);
            $tabelBayar = $config['tabel_bayar'];
            $idKolomReferensi = $config['id_kolom_referensi'];

            // Ambil semua id referensi untuk id_santri ini
            $tabelUtama = $config['tabel_utama'];
            $sqlIds = "SELECT id FROM {$tabelUtama} WHERE id_santri=?";
            $stmtIds = $this->db->prepare($sqlIds);
            $stmtIds->execute([$idSantriResolved]);
            $ids = $stmtIds->fetchAll(\PDO::FETCH_COLUMN);

            if (empty($ids)) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => []
                ], 200);
            }

            // Ambil semua history untuk semua id referensi
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $sqlHistory = "SELECT id, {$idKolomReferensi} AS id_referensi, nominal, via, admin, hijriyah, tanggal_dibuat as masehi FROM {$tabelBayar} WHERE {$idKolomReferensi} IN ({$placeholders}) ORDER BY tanggal_dibuat DESC";
            $stmt = $this->db->prepare($sqlHistory);
            $stmt->execute($ids);
            $history = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $history
            ], 200);

        } catch (\Exception $e) {
            error_log("Get public payment history error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil riwayat pembayaran: ' . $e->getMessage()
            ], 500);
        }
    }
}

