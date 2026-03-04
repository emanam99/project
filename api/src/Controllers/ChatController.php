<?php

namespace App\Controllers;

use App\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class ChatController
{
    private $db;
    private $logFile;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $this->logFile = __DIR__ . '/../../../../api/chat_debug.log';
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * Helper function untuk memastikan tabel chat ada
     */
    private function ensureChatTableExists(): void
    {
        $tableCheck = $this->db->query("SHOW TABLES LIKE 'chat'");
        if ($tableCheck->rowCount() === 0) {
            $createTableSQL = "
            CREATE TABLE `chat` (
              `id` INT AUTO_INCREMENT PRIMARY KEY,
              `id_santri` VARCHAR(20) NOT NULL,
              `nama_santri` VARCHAR(255) NOT NULL,
              `nomor_tujuan` VARCHAR(20) NOT NULL,
              `pesan` TEXT NOT NULL,
              `page` ENUM('uwaba', 'tunggakan', 'khusus') DEFAULT 'uwaba',
              `source` ENUM('gemini', 'template', 'fallback', 'edited') DEFAULT 'template',
              `status_pengiriman` ENUM('berhasil', 'pending', 'gagal') DEFAULT 'pending',
              `nomor_aktif` BOOLEAN DEFAULT TRUE,
              `admin_pengirim` VARCHAR(100) NULL,
              `nomor_uwaba` VARCHAR(20) NULL,
              `tanggal_dibuat` DATETIME DEFAULT CURRENT_TIMESTAMP,
              `tanggal_update` DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_id_santri (id_santri),
              INDEX idx_page (page),
              INDEX idx_status (status_pengiriman),
              INDEX idx_tanggal (tanggal_dibuat)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ";
            
            $this->db->exec($createTableSQL);
            $this->log("TABLE_CREATED: chat table created");
        } else {
            // Cek apakah kolom nomor_uwaba sudah ada
            $columnCheck = $this->db->query("SHOW COLUMNS FROM chat LIKE 'nomor_uwaba'");
            if ($columnCheck->rowCount() === 0) {
                $this->db->exec("ALTER TABLE chat ADD COLUMN nomor_uwaba VARCHAR(20) NULL AFTER admin_pengirim");
                $this->log("COLUMN_ADDED: nomor_uwaba column added");
            }
        }
    }

    /**
     * Helper function untuk logging
     */
    private function log(string $message): void
    {
        if ($this->logFile) {
            file_put_contents($this->logFile, date('Y-m-d H:i:s') . ' ' . $message . PHP_EOL, FILE_APPEND);
        }
    }

    /**
     * POST /api/chat/save - Simpan chat data
     */
    public function saveChat(Request $request, Response $response): Response
    {
        try {
            $this->ensureChatTableExists();
            
            $input = $request->getParsedBody();
            $this->log('SAVE_DATA: ' . json_encode($input));
            
            // Validasi data yang diperlukan
            $requiredFields = ['id_santri', 'nama_santri', 'nomor_tujuan', 'pesan'];
            foreach ($requiredFields as $field) {
                if (!isset($input[$field]) || empty($input[$field])) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => "Field '$field' is required"
                    ], 400);
                }
            }
            
            // Set default values
            $data = [
                'id_santri' => $input['id_santri'],
                'nama_santri' => $input['nama_santri'],
                'nomor_tujuan' => $input['nomor_tujuan'],
                'pesan' => $input['pesan'],
                'page' => $input['page'] ?? 'uwaba',
                'source' => $input['source'] ?? 'template',
                'status_pengiriman' => $input['status_pengiriman'] ?? 'pending',
                'nomor_aktif' => $input['nomor_aktif'] ?? true,
                'admin_pengirim' => $input['admin_pengirim'] ?? null,
                'nomor_uwaba' => $input['nomor_uwaba'] ?? null
            ];
            
            $sql = "INSERT INTO chat (
                id_santri, nama_santri, nomor_tujuan, pesan, page,
                source, status_pengiriman, nomor_aktif, admin_pengirim, nomor_uwaba
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                $data['id_santri'],
                $data['nama_santri'],
                $data['nomor_tujuan'],
                $data['pesan'],
                $data['page'],
                $data['source'],
                $data['status_pengiriman'],
                $data['nomor_aktif'] ? 1 : 0,
                $data['admin_pengirim'],
                $data['nomor_uwaba']
            ]);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'id' => $this->db->lastInsertId(),
                'message' => 'Chat berhasil disimpan'
            ], 200);
            
        } catch (\Exception $e) {
            $this->log('SAVE_CHAT_ERROR: ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan chat: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/chat/save-all - Simpan semua variasi chat
     */
    public function saveAllChat(Request $request, Response $response): Response
    {
        try {
            $this->ensureChatTableExists();
            
            $input = $request->getParsedBody();
            $variations = $input['variations'] ?? [];
            $idSantri = $input['id_santri'] ?? '';
            $namaSantri = $input['nama_santri'] ?? '';
            $nomorTujuan = $input['nomor_tujuan'] ?? '';
            $adminPengirim = $input['admin_pengirim'] ?? null;
            
            if (empty($variations) || empty($idSantri) || empty($namaSantri) || empty($nomorTujuan)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Variations, id_santri, nama_santri, dan nomor_tujuan diperlukan'
                ], 400);
            }
            
            $this->db->beginTransaction();
            
            $results = [];
            foreach ($variations as $variation) {
                $chatData = [
                    'id_santri' => $idSantri,
                    'nama_santri' => $namaSantri,
                    'nomor_tujuan' => $nomorTujuan,
                    'pesan' => $variation['message'] ?? '',
                    'page' => $variation['page'] ?? 'uwaba',
                    'source' => $variation['source'] ?? 'template',
                    'status_pengiriman' => 'pending',
                    'nomor_aktif' => true,
                    'admin_pengirim' => $adminPengirim
                ];
                
                $sql = "INSERT INTO chat (
                    id_santri, nama_santri, nomor_tujuan, pesan, page,
                    source, status_pengiriman, nomor_aktif, admin_pengirim
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
                
                $stmt = $this->db->prepare($sql);
                $stmt->execute([
                    $chatData['id_santri'],
                    $chatData['nama_santri'],
                    $chatData['nomor_tujuan'],
                    $chatData['pesan'],
                    $chatData['page'],
                    $chatData['source'],
                    $chatData['status_pengiriman'],
                    $chatData['nomor_aktif'] ? 1 : 0,
                    $chatData['admin_pengirim']
                ]);
                
                $results[] = [
                    'success' => true,
                    'id' => $this->db->lastInsertId()
                ];
            }
            
            $this->db->commit();
            
            return $this->jsonResponse($response, [
                'success' => true,
                'results' => $results,
                'message' => 'Semua variasi berhasil disimpan'
            ], 200);
            
        } catch (\Exception $e) {
            $this->db->rollBack();
            $this->log('SAVE_ALL_CHAT_ERROR: ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan semua variasi: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/chat/update-status - Update status pengiriman
     */
    public function updateStatus(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $id = $input['id'] ?? '';
            $status = $input['status'] ?? '';
            
            if (empty($id) || empty($status)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID dan status diperlukan'
                ], 400);
            }
            
            $validStatuses = ['berhasil', 'pending', 'gagal'];
            if (!in_array($status, $validStatuses)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Status tidak valid'
                ], 400);
            }
            
            $sql = "UPDATE chat SET status_pengiriman = ? WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$status, $id]);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Status berhasil diupdate'
            ], 200);
            
        } catch (\Exception $e) {
            $this->log('UPDATE_STATUS_ERROR: ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate status: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/chat/update-nomor-aktif - Update status nomor aktif
     */
    public function updateNomorAktif(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $id = $input['id'] ?? '';
            $nomorAktif = $input['nomor_aktif'] ?? null;
            
            if (empty($id) || $nomorAktif === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID dan nomor_aktif diperlukan'
                ], 400);
            }
            
            $nomorAktif = (bool)$nomorAktif;
            
            $sql = "UPDATE chat SET nomor_aktif = ? WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$nomorAktif ? 1 : 0, $id]);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Status nomor berhasil diupdate'
            ], 200);
            
        } catch (\Exception $e) {
            $this->log('UPDATE_NOMOR_AKTIF_ERROR: ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate status nomor: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/chat/count-by-santri - Hitung jumlah chat berdasarkan santri
     */
    public function countBySantri(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $idSantri = $input['id_santri'] ?? '';
            
            if (empty($idSantri)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID Santri diperlukan'
                ], 400);
            }
            
            $this->ensureChatTableExists();
            
            $sql = "SELECT COUNT(*) as total FROM chat WHERE id_santri = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idSantri]);
            $result = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'count' => intval($result['total'])
            ], 200);
            
        } catch (\Exception $e) {
            $this->log('COUNT_BY_SANTRI_ERROR: ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghitung riwayat: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/chat/get-by-santri - Ambil chat berdasarkan santri
     */
    public function getBySantri(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idSantri = $queryParams['id_santri'] ?? '';
            $limit = intval($queryParams['limit'] ?? 50);
            
            if (empty($idSantri)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID Santri diperlukan'
                ], 400);
            }
            
            $this->ensureChatTableExists();
            
            // Validasi limit
            if ($limit <= 0 || $limit > 1000) {
                $limit = 50;
            }
            
            $sql = "SELECT * FROM chat WHERE id_santri = ? ORDER BY tanggal_dibuat DESC LIMIT ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idSantri, $limit]);
            $chats = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $chats
            ], 200);
            
        } catch (\Exception $e) {
            $this->log('GET_CHAT_ERROR: ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data chat: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/chat/get-all - Ambil semua chat dengan filter
     */
    public function getAll(Request $request, Response $response): Response
    {
        try {
            $this->ensureChatTableExists();
            
            $queryParams = $request->getQueryParams();
            
            $sql = "SELECT c.*, s.nama as nama_santri_lengkap 
                    FROM chat c 
                    LEFT JOIN santri s ON c.id_santri = s.id 
                    WHERE 1=1";
            $params = [];
            
            // Filter berdasarkan parameter
            if (!empty($queryParams['id_santri'])) {
                $sql .= " AND c.id_santri = ?";
                $params[] = $queryParams['id_santri'];
            }
            if (!empty($queryParams['nomor_tujuan'])) {
                $sql .= " AND c.nomor_tujuan = ?";
                $params[] = $queryParams['nomor_tujuan'];
            }
            if (!empty($queryParams['status_pengiriman'])) {
                $sql .= " AND c.status_pengiriman = ?";
                $params[] = $queryParams['status_pengiriman'];
            }
            if (!empty($queryParams['source'])) {
                $sql .= " AND c.source = ?";
                $params[] = $queryParams['source'];
            }
            if (isset($queryParams['nomor_aktif']) && $queryParams['nomor_aktif'] !== '') {
                $sql .= " AND c.nomor_aktif = ?";
                $params[] = ($queryParams['nomor_aktif'] === 'true' || $queryParams['nomor_aktif'] === '1') ? 1 : 0;
            }
            if (!empty($queryParams['tanggal_dari'])) {
                $sql .= " AND DATE(c.tanggal_dibuat) >= ?";
                $params[] = $queryParams['tanggal_dari'];
            }
            if (!empty($queryParams['tanggal_sampai'])) {
                $sql .= " AND DATE(c.tanggal_dibuat) <= ?";
                $params[] = $queryParams['tanggal_sampai'];
            }
            
            $sql .= " ORDER BY c.tanggal_dibuat DESC";
            
            // Limit
            $limit = isset($queryParams['limit']) ? intval($queryParams['limit']) : 100;
            $sql .= " LIMIT ?";
            $params[] = $limit;
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $chats = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $chats
            ], 200);
            
        } catch (\Exception $e) {
            $this->log('GET_ALL_CHAT_ERROR: ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil semua data chat: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/chat/stats - Ambil statistik chat
     */
    public function getStats(Request $request, Response $response): Response
    {
        try {
            $this->ensureChatTableExists();
            
            $tableCheck = $this->db->query("SHOW TABLES LIKE 'chat'");
            if ($tableCheck->rowCount() === 0) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => [
                        'total_pesan' => 0,
                        'total_santri' => 0,
                        'berhasil' => 0,
                        'gagal' => 0,
                        'pending' => 0,
                        'nomor_aktif' => 0,
                        'dari_ai' => 0
                    ]
                ], 200);
            }
            
            $sql = "SELECT 
                        COUNT(*) as total_pesan,
                        COUNT(DISTINCT id_santri) as total_santri,
                        COUNT(CASE WHEN status_pengiriman = 'berhasil' THEN 1 END) as berhasil,
                        COUNT(CASE WHEN status_pengiriman = 'gagal' THEN 1 END) as gagal,
                        COUNT(CASE WHEN status_pengiriman = 'pending' THEN 1 END) as pending,
                        COUNT(CASE WHEN nomor_aktif = 1 THEN 1 END) as nomor_aktif,
                        COUNT(CASE WHEN source = 'gemini' OR source = 'ai' THEN 1 END) as dari_ai
                    FROM chat";
            $stmt = $this->db->prepare($sql);
            $stmt->execute();
            $stats = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $stats
            ], 200);
            
        } catch (\Exception $e) {
            $this->log('GET_STATS_ERROR: ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil statistik: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/chat/check-phone-status - Cek status nomor telepon
     */
    public function checkPhoneStatus(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $nomorTujuan = $input['nomor_tujuan'] ?? '';
            
            if (empty($nomorTujuan)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nomor tujuan diperlukan'
                ], 400);
            }
            
            $this->ensureChatTableExists();
            
            // Cek status nomor terakhir berdasarkan nomor_tujuan
            $sql = "SELECT nomor_aktif FROM chat WHERE nomor_tujuan = ? ORDER BY tanggal_dibuat DESC LIMIT 1";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$nomorTujuan]);
            $result = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            // Jika tidak ada data, default aktif (true)
            $isActive = $result ? (bool)$result['nomor_aktif'] : true;
            
            return $this->jsonResponse($response, [
                'success' => true,
                'is_active' => $isActive
            ], 200);
            
        } catch (\Exception $e) {
            $this->log('CHECK_PHONE_STATUS_ERROR: ' . $e->getMessage());
            // Fallback ke default aktif jika ada error
            return $this->jsonResponse($response, [
                'success' => true,
                'is_active' => true,
                'message' => 'Error: ' . $e->getMessage()
            ], 200);
        }
    }
}


