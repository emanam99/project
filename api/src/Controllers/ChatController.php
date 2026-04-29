<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use App\Services\WhatsAppService;
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
     * Helper function untuk logging
     */
    private function log(string $message): void
    {
        if ($this->logFile) {
            file_put_contents($this->logFile, date('Y-m-d H:i:s') . ' ' . $message . PHP_EOL, FILE_APPEND);
        }
    }

    /**
     * POST /api/chat/save - Simpan log pesan ke tabel whatsapp (untuk manual send / pelengkap).
     * Jika kirim lewat API /wa/send, backend sudah log ke whatsapp; frontend tidak perlu panggil saveChat lagi.
     */
    public function saveChat(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            if (is_array($input) && isset($input['pesan']) && is_string($input['pesan'])) {
                $input['pesan'] = TextSanitizer::cleanText($input['pesan']);
            }
            $this->log('SAVE_DATA: ' . json_encode($input));

            $requiredFields = ['nomor_tujuan', 'pesan'];
            foreach ($requiredFields as $field) {
                if (!isset($input[$field]) || (is_string($input[$field]) && trim($input[$field]) === '')) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => "Field '$field' is required"
                    ], 400);
                }
            }

            $tableCheck = $this->db->query("SHOW TABLES LIKE 'whatsapp'");
            if ($tableCheck->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tabel whatsapp tidak ada'], 500);
            }

            $messageId = isset($input['message_id']) ? trim((string) $input['message_id']) : null;
            if ($messageId !== '' && $messageId !== null) {
                $hasWaMsgId = $this->db->query("SHOW COLUMNS FROM whatsapp LIKE 'wa_message_id'")->rowCount() > 0;
                if ($hasWaMsgId) {
                    $stmt = $this->db->prepare("SELECT id FROM whatsapp WHERE wa_message_id = ? AND arah = 'keluar' LIMIT 1");
                    $stmt->execute([$messageId]);
                    if ($stmt->fetch(\PDO::FETCH_ASSOC)) {
                        return $this->jsonResponse($response, ['success' => true, 'message' => 'OK (sudah tercatat)'], 200);
                    }
                }
            }

            $idSantri = isset($input['id_santri']) ? (trim((string) $input['id_santri']) !== '' ? $input['id_santri'] : null) : null;
            if ($idSantri !== null && is_numeric($idSantri)) {
                $idSantri = (int) $idSantri;
            }
            if ($idSantri !== null) {
                try {
                    $stmtCheck = $this->db->prepare("SELECT 1 FROM santri WHERE id = ?");
                    $stmtCheck->execute([$idSantri]);
                    if ($stmtCheck->fetch() === false) {
                        $idSantri = null;
                    }
                } catch (\Throwable $e) {
                    $idSantri = null;
                }
            }

            $idPengurusPengirim = isset($input['id_pengurus']) ? (int) $input['id_pengurus'] : null;
            if ($idPengurusPengirim <= 0) {
                $idPengurusPengirim = null;
            }

            $status = $input['status_pengiriman'] ?? 'berhasil';
            $statusWa = in_array($status, ['sent', 'delivered', 'read'], true) ? $status : 'terkirim';

            $nomorTujuan = trim($input['nomor_tujuan']);
            $nomor62 = WhatsAppService::formatPhoneNumber($nomorTujuan);
            $sumber = in_array($input['source'] ?? 'uwaba', ['uwaba', 'daftar', 'api_wa', 'edited', 'template', 'manual'], true) ? ($input['source'] ?? 'uwaba') : 'uwaba';

            $hasArah = $this->db->query("SHOW COLUMNS FROM whatsapp LIKE 'arah'")->rowCount() > 0;
            $hasWaMessageId = $this->db->query("SHOW COLUMNS FROM whatsapp LIKE 'wa_message_id'")->rowCount() > 0;

            $cols = ['id_santri', 'id_pengurus', 'tujuan', 'id_pengurus_pengirim', 'kategori', 'sumber', 'nomor_tujuan', 'isi_pesan', 'punya_gambar', 'status'];
            $vals = [$idSantri, null, 'wali_santri', $idPengurusPengirim, 'custom', $sumber, $nomor62, TextSanitizer::cleanText($input['pesan'] ?? ''), 0, $statusWa];
            if ($hasArah) {
                $cols[] = 'arah';
                $vals[] = 'keluar';
            }
            if ($hasWaMessageId && $messageId !== '' && $messageId !== null) {
                $cols[] = 'wa_message_id';
                $vals[] = $messageId;
            }
            $placeholders = implode(', ', array_fill(0, count($cols), '?'));
            $sql = "INSERT INTO whatsapp (" . implode(', ', $cols) . ") VALUES ($placeholders)";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($vals);

            return $this->jsonResponse($response, [
                'success' => true,
                'id' => $this->db->lastInsertId(),
                'message' => 'Chat berhasil disimpan'
            ], 200);
        } catch (\Exception $e) {
            $this->log('SAVE_CHAT_ERROR: ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan chat'
            ], 500);
        }
    }

    /**
     * POST /api/chat/save-all - Simpan semua variasi ke tabel whatsapp
     */
    public function saveAllChat(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $variations = $input['variations'] ?? [];
            $nomorTujuan = trim($input['nomor_tujuan'] ?? '');
            $idSantri = isset($input['id_santri']) && trim((string) $input['id_santri']) !== '' ? (is_numeric($input['id_santri']) ? (int) $input['id_santri'] : null) : null;
            $idPengurusPengirim = isset($input['id_pengurus']) ? (int) $input['id_pengurus'] : null;
            if ($idPengurusPengirim <= 0) {
                $idPengurusPengirim = null;
            }
            if (empty($variations) || $nomorTujuan === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Variations dan nomor_tujuan diperlukan'
                ], 400);
            }
            $tableCheck = $this->db->query("SHOW TABLES LIKE 'whatsapp'");
            if ($tableCheck->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tabel whatsapp tidak ada'], 500);
            }
            $nomor62 = WhatsAppService::formatPhoneNumber($nomorTujuan);
            $hasArah = $this->db->query("SHOW COLUMNS FROM whatsapp LIKE 'arah'")->rowCount() > 0;
            $cols = ['id_santri', 'id_pengurus', 'tujuan', 'id_pengurus_pengirim', 'kategori', 'sumber', 'nomor_tujuan', 'isi_pesan', 'punya_gambar', 'status'];
            if ($hasArah) {
                $cols[] = 'arah';
            }
            $placeholders = implode(', ', array_fill(0, count($cols), '?'));
            $sql = "INSERT INTO whatsapp (" . implode(', ', $cols) . ") VALUES ($placeholders)";
            $this->db->beginTransaction();
            $results = [];
            foreach ($variations as $variation) {
                $params = [$idSantri, null, 'wali_santri', $idPengurusPengirim, 'custom', 'uwaba', $nomor62, TextSanitizer::cleanText($variation['message'] ?? $variation['isi_pesan'] ?? ''), 0, 'terkirim'];
                if ($hasArah) {
                    $params[] = 'keluar';
                }
                $stmt = $this->db->prepare($sql);
                $stmt->execute($params);
                $results[] = ['success' => true, 'id' => $this->db->lastInsertId()];
            }
            $this->db->commit();
            return $this->jsonResponse($response, ['success' => true, 'results' => $results, 'message' => 'Semua variasi berhasil disimpan'], 200);
        } catch (\Exception $e) {
            $this->db->rollBack();
            $this->log('SAVE_ALL_CHAT_ERROR: ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menyimpan'], 500);
        }
    }

    /**
     * POST /api/chat/update-status - Update status di tabel whatsapp (id = whatsapp.id)
     */
    public function updateStatus(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $id = $input['id'] ?? '';
            $status = $input['status'] ?? '';
            if (empty($id) || empty($status)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID dan status diperlukan'], 400);
            }
            $validStatuses = ['pending', 'sent', 'delivered', 'read', 'berhasil', 'gagal', 'terkirim'];
            $statusWa = in_array($status, ['sent', 'delivered', 'read'], true) ? $status : 'terkirim';
            $tableCheck = $this->db->query("SHOW TABLES LIKE 'whatsapp'");
            if ($tableCheck->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tabel whatsapp tidak ada'], 500);
            }
            $stmt = $this->db->prepare("UPDATE whatsapp SET status = ? WHERE id = ?");
            $stmt->execute([$statusWa, $id]);
            return $this->jsonResponse($response, ['success' => true, 'message' => 'Status berhasil diupdate'], 200);
        } catch (\Exception $e) {
            $this->log('UPDATE_STATUS_ERROR: ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengupdate status'], 500);
        }
    }

    /**
     * POST /api/chat/update-status-by-message-id - Update status by wa_message_id (dipanggil dari server WA saat message_ack).
     */
    public function updateStatusByMessageId(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $messageId = isset($input['messageId']) ? trim((string) $input['messageId']) : (isset($input['message_id']) ? trim((string) $input['message_id']) : '');
            $status = isset($input['status']) ? trim((string) $input['status']) : '';
            if ($messageId === '') {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'messageId wajib'], 400);
            }
            if (!in_array($status, ['sent', 'delivered', 'read'], true)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Status harus sent, delivered, atau read'], 400);
            }
            $tableCheck = $this->db->query("SHOW TABLES LIKE 'whatsapp'");
            $hasWaMessageId = $tableCheck->rowCount() > 0 && $this->db->query("SHOW COLUMNS FROM whatsapp LIKE 'wa_message_id'")->rowCount() > 0;
            if ($hasWaMessageId) {
                $stmt = $this->db->prepare("UPDATE whatsapp SET status = ? WHERE wa_message_id = ? AND (arah = 'keluar' OR arah IS NULL)");
                $stmt->execute([$status, $messageId]);
            }
            return $this->jsonResponse($response, ['success' => true, 'message' => 'OK'], 200);
        } catch (\Exception $e) {
            $this->log('UPDATE_STATUS_BY_MESSAGE_ID_ERROR: ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengupdate status'], 500);
        }
    }

    /**
     * POST /api/chat/update-nomor-aktif - No-op (tabel whatsapp tidak punya nomor_aktif). Tetap return success.
     */
    public function updateNomorAktif(Request $request, Response $response): Response
    {
        return $this->jsonResponse($response, ['success' => true, 'message' => 'OK'], 200);
    }

    /**
     * POST /api/chat/count-by-santri - Hitung jumlah pesan whatsapp by id_santri
     */
    public function countBySantri(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $idSantri = $input['id_santri'] ?? '';
            if (empty($idSantri)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID Santri diperlukan'], 400);
            }
            $tableCheck = $this->db->query("SHOW TABLES LIKE 'whatsapp'");
            if ($tableCheck->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => true, 'count' => 0], 200);
            }
            $stmt = $this->db->prepare("SELECT COUNT(*) as total FROM whatsapp WHERE id_santri = ?");
            $stmt->execute([$idSantri]);
            $result = $stmt->fetch(\PDO::FETCH_ASSOC);
            return $this->jsonResponse($response, ['success' => true, 'count' => (int) ($result['total'] ?? 0)], 200);
        } catch (\Exception $e) {
            $this->log('COUNT_BY_SANTRI_ERROR: ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menghitung riwayat'], 500);
        }
    }

    /**
     * GET /api/chat/get-by-santri - Ambil riwayat whatsapp berdasarkan id_santri (format seragam dengan get-all)
     */
    public function getBySantri(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idSantri = $queryParams['id_santri'] ?? '';
            $limit = (int) ($queryParams['limit'] ?? 50);
            if (empty($idSantri)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID Santri diperlukan'], 400);
            }
            $limit = max(1, min(1000, $limit));
            $tableCheck = $this->db->query("SHOW TABLES LIKE 'whatsapp'");
            if ($tableCheck->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => true, 'data' => []], 200);
            }
            $hasArah = $this->db->query("SHOW COLUMNS FROM whatsapp LIKE 'arah'")->rowCount() > 0;
            $hasWaMessageId = $this->db->query("SHOW COLUMNS FROM whatsapp LIKE 'wa_message_id'")->rowCount() > 0;
            $selCols = 'id, id_santri, id_pengurus_pengirim, nomor_tujuan, isi_pesan, created_at, status';
            if ($hasArah) {
                $selCols .= ', arah';
            }
            if ($hasWaMessageId) {
                $selCols .= ', wa_message_id';
            }
            $sql = "SELECT $selCols FROM whatsapp WHERE id_santri = ? ORDER BY created_at DESC LIMIT ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idSantri, $limit]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            $data = [];
            $idPengurusUnik = [];
            foreach ($rows as $row) {
                $arah = $hasArah && (($row['arah'] ?? '') === 'masuk') ? 'masuk' : 'keluar';
                $st = $row['status'] ?? 'terkirim';
                $statusPesan = in_array($st, ['pending', 'sent', 'delivered', 'read'], true) ? $st : (($st === 'terkirim' || $st === 'berhasil') ? 'sent' : 'sent');
                $idPengirim = isset($row['id_pengurus_pengirim']) && (int) $row['id_pengurus_pengirim'] > 0 ? (int) $row['id_pengurus_pengirim'] : null;
                if ($idPengirim) {
                    $idPengurusUnik[$idPengirim] = true;
                }
                $data[] = [
                    'id' => 'w_' . $row['id'],
                    'pesan' => $row['isi_pesan'] ?? '',
                    'tanggal_dibuat' => $row['created_at'] ?? null,
                    'id_pengurus' => $idPengirim,
                    'nama_pengirim' => null,
                    'status_pengiriman' => $statusPesan,
                    'message_id' => $hasWaMessageId ? ($row['wa_message_id'] ?? null) : null,
                    'arah' => $arah,
                    'id_santri' => $row['id_santri'] ?? null,
                    'nomor_tujuan' => $row['nomor_tujuan'] ?? null,
                ];
            }
            if (!empty($idPengurusUnik) && $this->db->query("SHOW TABLES LIKE 'pengurus'")->rowCount() > 0) {
                $ids = array_keys($idPengurusUnik);
                $placeholders = implode(',', array_fill(0, count($ids), '?'));
                $stmtP = $this->db->prepare("SELECT id, nama FROM pengurus WHERE id IN ($placeholders)");
                $stmtP->execute($ids);
                $namaById = [];
                while (($r = $stmtP->fetch(\PDO::FETCH_ASSOC)) !== false) {
                    $idP = isset($r['id']) ? (int) $r['id'] : null;
                    if ($idP !== null && isset($r['nama']) && trim((string) $r['nama']) !== '') {
                        $namaById[$idP] = trim($r['nama']);
                    }
                }
                foreach ($data as &$m) {
                    if (isset($m['id_pengurus']) && (int) $m['id_pengurus'] > 0) {
                        $m['nama_pengirim'] = $namaById[(int) $m['id_pengurus']] ?? null;
                    }
                }
                unset($m);
            }
            return $this->jsonResponse($response, ['success' => true, 'data' => $data], 200);
        } catch (\Exception $e) {
            $this->log('GET_CHAT_ERROR: ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil data chat'], 500);
        }
    }

    /**
     * GET /api/chat/get-all - Riwayat chat dari tabel whatsapp saja (by nomor_tujuan).
     * Format: id (w_id), pesan, tanggal_dibuat, id_pengurus (id_pengurus_pengirim), nama_pengirim, status_pengiriman (sent/delivered/read), arah.
     */
    public function getAll(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $nomorTujuan = isset($queryParams['nomor_tujuan']) ? trim((string) $queryParams['nomor_tujuan']) : '';
            $defaultLimit = $nomorTujuan !== '' ? 30 : 100;
            $limit = isset($queryParams['limit']) ? (int) $queryParams['limit'] : $defaultLimit;
            $limit = max(1, min(500, $limit));
            $beforeDate = isset($queryParams['before_date']) ? trim((string) $queryParams['before_date']) : null;

            $tableCheck = $this->db->query("SHOW TABLES LIKE 'whatsapp'");
            if ($tableCheck->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => true, 'data' => []], 200);
            }

            if ($nomorTujuan === '') {
                return $this->jsonResponse($response, ['success' => true, 'data' => []], 200);
            }

            $nomor62 = WhatsAppService::formatPhoneNumber($nomorTujuan);
            $hasArah = $this->db->query("SHOW COLUMNS FROM whatsapp LIKE 'arah'")->rowCount() > 0;
            $hasWaMessageId = $this->db->query("SHOW COLUMNS FROM whatsapp LIKE 'wa_message_id'")->rowCount() > 0;

            $selCols = 'id, id_santri, id_pengurus_pengirim, nomor_tujuan, isi_pesan, created_at, status';
            if ($hasArah) {
                $selCols .= ', arah';
            }
            if ($hasWaMessageId) {
                $selCols .= ', wa_message_id';
            }
            $sql = "SELECT $selCols FROM whatsapp WHERE (nomor_tujuan = ? OR nomor_tujuan = ?)";
            $params = [$nomorTujuan, $nomor62];
            if ($beforeDate !== null && $beforeDate !== '') {
                $sql .= " AND created_at < ?";
                $params[] = $beforeDate;
            }
            $sql .= " ORDER BY created_at DESC LIMIT ?";
            $params[] = $limit;
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $merged = [];
            foreach ($rows as $row) {
                $arah = $hasArah && (($row['arah'] ?? '') === 'masuk') ? 'masuk' : 'keluar';
                $st = $row['status'] ?? 'terkirim';
                $statusPesan = in_array($st, ['pending', 'sent', 'delivered', 'read'], true) ? $st : (($st === 'terkirim' || $st === 'berhasil') ? 'sent' : 'sent');
                $idPengirim = isset($row['id_pengurus_pengirim']) && (int) $row['id_pengurus_pengirim'] > 0 ? (int) $row['id_pengurus_pengirim'] : null;
                $merged[] = [
                    'id' => 'w_' . $row['id'],
                    'pesan' => $row['isi_pesan'] ?? '',
                    'tanggal_dibuat' => $row['created_at'] ?? null,
                    'id_pengurus' => $idPengirim,
                    'nama_pengirim' => null,
                    'status_pengiriman' => $statusPesan,
                    'message_id' => $hasWaMessageId ? ($row['wa_message_id'] ?? null) : null,
                    'arah' => $arah,
                    'id_santri' => $row['id_santri'] ?? null,
                    'nomor_tujuan' => $row['nomor_tujuan'] ?? $nomor62,
                    'page' => null,
                    'source' => null,
                ];
            }

            $idPengurusUnik = [];
            foreach ($merged as $m) {
                if (isset($m['id_pengurus']) && (int) $m['id_pengurus'] > 0) {
                    $idPengurusUnik[(int) $m['id_pengurus']] = true;
                }
            }
            if (!empty($idPengurusUnik)) {
                $hasTblPengurus = $this->db->query("SHOW TABLES LIKE 'pengurus'")->rowCount() > 0;
                if ($hasTblPengurus) {
                    $ids = array_keys($idPengurusUnik);
                    $placeholders = implode(',', array_fill(0, count($ids), '?'));
                    try {
                        $stmtP = $this->db->prepare("SELECT id, nama FROM pengurus WHERE id IN ($placeholders)");
                        $stmtP->execute($ids);
                        $namaById = [];
                        while (($r = $stmtP->fetch(\PDO::FETCH_ASSOC)) !== false) {
                            $idP = isset($r['id']) ? (int) $r['id'] : null;
                            $namaVal = isset($r['nama']) && trim((string) $r['nama']) !== '' ? trim($r['nama']) : null;
                            if ($idP !== null) {
                                $namaById[$idP] = $namaVal;
                            }
                        }
                        foreach ($merged as &$m) {
                            if (isset($m['id_pengurus']) && (int) $m['id_pengurus'] > 0) {
                                $m['nama_pengirim'] = $namaById[(int) $m['id_pengurus']] ?? null;
                            }
                        }
                        unset($m);
                    } catch (\Throwable $e) {
                        $this->log('GET_ALL_PENGURUS_LOOKUP: ' . $e->getMessage());
                    }
                }
            }

            return $this->jsonResponse($response, ['success' => true, 'data' => $merged], 200);
        } catch (\Exception $e) {
            $this->log('GET_ALL_CHAT_ERROR: ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data chat'
            ], 500);
        }
    }

    /**
     * GET /api/chat/stats - Ambil statistik dari tabel whatsapp
     */
    public function getStats(Request $request, Response $response): Response
    {
        try {
            $tableCheck = $this->db->query("SHOW TABLES LIKE 'whatsapp'");
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
                COUNT(CASE WHEN status IN ('terkirim','sent','delivered','read','berhasil') THEN 1 END) as berhasil,
                COUNT(CASE WHEN status = 'gagal' THEN 1 END) as gagal,
                0 as pending,
                0 as nomor_aktif,
                0 as dari_ai
                FROM whatsapp";
            $stmt = $this->db->prepare($sql);
            $stmt->execute();
            $stats = $stmt->fetch(\PDO::FETCH_ASSOC);
            return $this->jsonResponse($response, ['success' => true, 'data' => $stats], 200);
        } catch (\Exception $e) {
            $this->log('GET_STATS_ERROR: ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil statistik'], 500);
        }
    }

    /**
     * POST /api/chat/check-phone-status - Cek status nomor (default aktif; tabel whatsapp tidak punya nomor_aktif)
     */
    public function checkPhoneStatus(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $nomorTujuan = $input['nomor_tujuan'] ?? '';
            if (empty($nomorTujuan)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Nomor tujuan diperlukan'], 400);
            }
            return $this->jsonResponse($response, ['success' => true, 'is_active' => true], 200);
        } catch (\Exception $e) {
            $this->log('CHECK_PHONE_STATUS_ERROR: ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => true, 'is_active' => true], 200);
        }
    }

    /**
     * POST /api/chat/sync-from-wa - Muat pesan yang belum ada di DB dari server WA
     * (pesan kirim lewat WA langsung atau pesan masuk saat WA off).
     * Body: { nomor_tujuan, limit? } — limit default 50, max 100.
     * Response: { success, synced_count, message }
     */
    public function syncFromWa(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody() ?? [];
            $nomorTujuan = trim((string) ($input['nomor_tujuan'] ?? ''));
            if ($nomorTujuan === '') {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'nomor_tujuan diperlukan'], 400);
            }
            $limit = isset($input['limit']) ? (int) $input['limit'] : 50;
            $limit = max(1, min(100, $limit));

            $result = WhatsAppService::fetchChatMessagesFromWa($nomorTujuan, $limit);
            if (!$result['success']) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => $result['message'],
                    'synced_count' => 0,
                ], 200);
            }

            $nomor62 = WhatsAppService::formatPhoneNumber($nomorTujuan);
            $existingIds = [];
            $stmt = $this->db->prepare('SELECT wa_message_id FROM whatsapp WHERE nomor_tujuan = ? AND wa_message_id IS NOT NULL');
            $stmt->execute([$nomor62]);
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $existingIds[$row['wa_message_id']] = true;
            }

            $syncedCount = 0;
            $insertSql = 'INSERT INTO whatsapp (arah, nomor_tujuan, isi_pesan, wa_message_id, tujuan, kategori, sumber, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
            $insertStmt = $this->db->prepare($insertSql);
            $statusMap = ['pending' => 'pending', 'sent' => 'sent', 'delivered' => 'delivered', 'read' => 'read'];
            foreach ($result['data'] as $msg) {
                $waId = isset($msg['id']) && (string) $msg['id'] !== '' ? (string) $msg['id'] : null;
                if ($waId !== null && isset($existingIds[$waId])) {
                    continue;
                }
                $arah = !empty($msg['fromMe']) ? 'keluar' : 'masuk';
                $isi = isset($msg['body']) ? trim((string) $msg['body']) : '';
                if ($isi === '' && $arah === 'masuk') {
                    $isi = '(tanpa teks)';
                }
                $status = $statusMap[$msg['status'] ?? 'sent'] ?? 'sent';
                $ts = isset($msg['timestamp']) ? (int) $msg['timestamp'] : 0;
                $createdAt = $ts > 0 ? date('Y-m-d H:i:s', $ts) : null;
                $insertStmt->execute([
                    $arah,
                    $msg['nomor_tujuan'] ?? $nomor62,
                    $isi,
                    $waId,
                    'wali_santri',
                    'sync_wa',
                    'api_wa',
                    $status,
                    $createdAt,
                ]);
                $syncedCount++;
                if ($waId !== null) {
                    $existingIds[$waId] = true;
                }
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'synced_count' => $syncedCount,
                'message' => $syncedCount > 0 ? "Berhasil menyinkronkan {$syncedCount} pesan" : 'Tidak ada pesan baru',
            ], 200);
        } catch (\Exception $e) {
            $this->log('SYNC_FROM_WA_ERROR: ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal sinkron',
                'synced_count' => 0,
            ], 500);
        }
    }
}


