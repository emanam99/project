<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use App\Services\AiWhatsappBridgeService;
use App\Services\DaftarNotifFlow;
use App\Services\WaInteractiveMenuService;
use App\Services\WhatsAppService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Controller pengiriman WA terpusat.
 * Sama dengan cara yang dipakai di UWABA (offcanvas kwitansi/biodata).
 * Semua kirim WA lewat backend agar menyatu di sini.
 */
class WhatsAppController
{
    /**
     * Kirim pesan WA.
     * POST /api/wa/send
     * Body: { "phoneNumber": "08xxx atau 62xxx", "message": "teks", "instance": "uwaba1" (opsional) }
     */
    public function send(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            $phoneNumber = trim($data['phoneNumber'] ?? $data['phone_number'] ?? '');
            $message = TextSanitizer::cleanText($data['message'] ?? '');
            $instance = isset($data['instance']) ? trim($data['instance']) : null;

            if ($phoneNumber === '') {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WhatsApp harus diisi'], 400);
            }
            if ($message === '') {
                return $this->json($response, ['success' => false, 'message' => 'Pesan harus diisi'], 400);
            }

            $logContext = ['id_santri' => null, 'id_pengurus' => null, 'tujuan' => 'santri', 'id_pengurus_pengirim' => null, 'kategori' => 'custom', 'sumber' => 'api_wa'];
            $user = $request->getAttribute('user');
            if ($user !== null && (isset($user['id_pengurus']) || isset($user['pengurus_id']) || isset($user['id']))) {
                $logContext['id_pengurus_pengirim'] = (int) ($user['id_pengurus'] ?? $user['pengurus_id'] ?? $user['id']);
            }
            if (isset($data['tujuan']) && in_array($data['tujuan'], ['pengurus', 'santri', 'wali_santri'], true)) {
                $logContext['tujuan'] = $data['tujuan'];
            }
            if (!empty($data['id_pengurus'])) {
                $logContext['id_pengurus'] = (int) $data['id_pengurus'];
            }
            if (!empty($data['id_santri'])) {
                $logContext['id_santri'] = (int) $data['id_santri'];
            }
            $result = WhatsAppService::sendMessage($phoneNumber, $message, $instance, $logContext);

            if ($result['success']) {
                $payload = ['success' => true, 'message' => $result['message'] ?? 'Pesan berhasil dikirim'];
                if (!empty($result['messageId'])) {
                    $payload['messageId'] = $result['messageId'];
                }
                if (!empty($result['senderPhoneNumber'])) {
                    $payload['senderPhoneNumber'] = $result['senderPhoneNumber'];
                }
                return $this->json($response, $payload, 200);
            }

            return $this->json($response, [
                'success' => false,
                'message' => $result['message'] ?? 'Gagal mengirim pesan',
            ], 502);
        } catch (\Exception $e) {
            error_log('WhatsAppController::send ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat mengirim pesan',
            ], 500);
        }
    }

    /**
     * Edit pesan WA yang sudah dikirim (hanya dalam 15 menit setelah kirim).
     * POST /api/wa/edit-message
     * Body: { "phoneNumber": "08xxx atau 62xxx", "messageId": "xxx", "newMessage": "teks baru" }
     */
    public function edit(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $phoneNumber = trim($data['phoneNumber'] ?? $data['phone_number'] ?? '');
            $messageId = isset($data['messageId']) ? trim((string) $data['messageId']) : '';
            $newMessage = $data['newMessage'] ?? $data['new_message'] ?? '';

            if ($phoneNumber === '') {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WhatsApp harus diisi'], 400);
            }
            if ($messageId === '') {
                return $this->json($response, ['success' => false, 'message' => 'messageId wajib'], 400);
            }
            if (trim((string) $newMessage) === '') {
                return $this->json($response, ['success' => false, 'message' => 'Isi pesan baru tidak boleh kosong'], 400);
            }

            $result = WhatsAppService::editMessage($phoneNumber, $messageId, (string) $newMessage);

            if ($result['success']) {
                $db = \App\Database::getInstance()->getConnection();
                $hasWaMessageId = $db->query("SHOW COLUMNS FROM whatsapp LIKE 'wa_message_id'")->rowCount() > 0;
                if ($hasWaMessageId) {
                    $stmt = $db->prepare("UPDATE whatsapp SET isi_pesan = ? WHERE wa_message_id = ? AND (arah = 'keluar' OR arah IS NULL)");
                    $stmt->execute([trim((string) $newMessage), $messageId]);
                }
                return $this->json($response, [
                    'success' => true,
                    'message' => $result['message'] ?? 'Pesan berhasil diedit',
                    'messageId' => $result['messageId'] ?? $messageId,
                ], 200);
            }

            return $this->json($response, [
                'success' => false,
                'message' => $result['message'] ?? 'Gagal mengedit pesan',
            ], 400);
        } catch (\Exception $e) {
            error_log('WhatsAppController::edit ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat mengedit pesan',
            ], 500);
        }
    }

    /**
     * Cek nomor WA (apakah terdaftar di WhatsApp).
     * POST /api/wa/check
     * Body: { "phoneNumber": "08xxx atau 62xxx" }
     */
    public function check(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $phoneNumber = trim($data['phoneNumber'] ?? $data['phone_number'] ?? '');

            if ($phoneNumber === '') {
                return $this->json($response, [
                    'success' => false,
                    'data' => ['phoneNumber' => '', 'isRegistered' => false],
                    'message' => 'Nomor WhatsApp harus diisi',
                ], 400);
            }

            $result = WhatsAppService::checkNumber($phoneNumber);

            return $this->json($response, [
                'success' => $result['success'],
                'data' => $result['data'] ?? ['phoneNumber' => WhatsAppService::formatPhoneNumber($phoneNumber), 'isRegistered' => false],
                'message' => $result['message'] ?? '',
            ], $result['success'] ? 200 : 502);
        } catch (\Exception $e) {
            error_log('WhatsAppController::check ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'data' => ['phoneNumber' => '', 'isRegistered' => false],
                'message' => 'Terjadi kesalahan saat mengecek nomor',
            ], 500);
        }
    }

    /**
     * Proses antrian WA pending (biodata_terdaftar yang menunggu NIS).
     * POST /api/wa/process-pending
     * Bisa dipanggil cron tiap 5–10 detik.
     */
    public function processPending(Request $request, Response $response): Response
    {
        try {
            $result = WhatsAppService::processPending();
            return $this->json($response, [
                'success' => (bool) ($result['success'] ?? true),
                'sent' => (int) ($result['sent'] ?? 0),
                'skipped' => (int) ($result['skipped'] ?? 0),
            ], 200);
        } catch (\Exception $e) {
            error_log('WhatsAppController::processPending ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal memproses antrian pending',
            ], 500);
        }
    }

    /**
     * Terima pesan masuk dari WA (webhook). Public, tanpa auth. CSRF di-exclude di CsrfMiddleware.
     * WA mengirim ke sini dan kirim ulang sampai dapat 200. Simpan ke tabel whatsapp (arah=masuk).
     * POST /api/wa/incoming
     * Body: { "from": "62xxx", "message": "isi", "messageId": "optional" } — from bisa juga phoneNumber, phone_number; message bisa body, text.
     */
    public function incoming(Request $request, Response $response): Response
    {
        try {
            $rawBody = (string) $request->getBody();
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = json_decode($rawBody, true) ?? [];
            }
            if (!is_array($body)) {
                $body = [];
            }
            $from = trim((string) ($body['from'] ?? $body['phoneNumber'] ?? $body['phone_number'] ?? $body['sender'] ?? ''));
            $message = trim((string) ($body['message'] ?? $body['body'] ?? $body['text'] ?? $body['content'] ?? ''));
            $messageId = isset($body['messageId']) ? trim((string) $body['messageId']) : null;
            $canonicalNumber = trim((string) ($body['canonicalNumber'] ?? $body['canonical_number'] ?? $body['phone'] ?? ''));
            $fromJid = isset($body['from_jid']) ? trim((string) $body['from_jid']) : '';

            if ($from === '') {
                error_log('WhatsAppController::incoming rejected: from kosong. Body keys: ' . implode(',', array_keys($body)));
                return $this->json($response, ['success' => false, 'message' => 'from wajib'], 400);
            }

            $nomorFrom = WhatsAppService::formatPhoneNumber($from);
            if (strlen($nomorFrom) < 10) {
                error_log('WhatsAppController::incoming rejected: nomor tidak valid. from=' . substr($from, 0, 20));
                return $this->json($response, ['success' => false, 'message' => 'Nomor tidak valid'], 400);
            }
            // Untuk tampilan/riwayat: pakai nomor kanonik (62xxx asli) jika dikirim WA client (mis. dari getContactLidAndPhone), agar cocok dengan nomor pendaftar
            $nomorTujuan = $canonicalNumber !== ''
                ? WhatsAppService::formatPhoneNumber($canonicalNumber)
                : $nomorFrom;
            if (strlen($nomorTujuan) < 10) {
                $nomorTujuan = $nomorFrom;
            }

            $db = Database::getInstance()->getConnection();

            if ($messageId !== null && $messageId !== '') {
                $stmt = $db->prepare('SELECT id FROM whatsapp WHERE arah = ? AND wa_message_id = ? LIMIT 1');
                $stmt->execute(['masuk', $messageId]);
                if ($stmt->fetch(\PDO::FETCH_ASSOC)) {
                    return $this->json($response, ['success' => true, 'message' => 'OK'], 200);
                }
            }

            $isiPesan = $message === '' ? '(tanpa teks)' : $message;
            $stmt = $db->prepare(
                'INSERT INTO whatsapp (arah, nomor_tujuan, isi_pesan, wa_message_id, tujuan, kategori, sumber, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                'masuk',
                $nomorTujuan,
                $isiPesan,
                $messageId ?: null,
                'wali_santri',
                'incoming',
                'api_wa',
                'terkirim',
            ]);
            $id = (int) $db->lastInsertId();
            error_log('WhatsAppController::incoming saved id=' . $id . ' from=' . $nomorTujuan);

            $jid = $fromJid !== '' ? $fromJid : null;
            $reply = DaftarNotifFlow::handle($nomorTujuan, $message, $jid);
            $isDaftarNotif = $reply !== null && $reply !== '';
            $replySource = $isDaftarNotif ? 'daftar_notif' : null;
            if (!$isDaftarNotif) {
                // Pengguna dengan "Akses AI dari WA" aktif: AI dulu, baru menu interaktif.
                $reply = AiWhatsappBridgeService::tryHandle($db, $nomorTujuan, $message, $jid);
                if ($reply !== null && $reply !== '') {
                    $replySource = 'ai_whatsapp';
                }
            }
            if (!$isDaftarNotif && ($reply === null || $reply === '')) {
                $reply = WaInteractiveMenuService::handle($nomorTujuan, $message, $jid);
                if ($reply !== null && $reply !== '') {
                    $replySource = 'wa_interactive_menu';
                }
            }
            if ($reply !== null && $reply !== '') {
                $logContext = [
                    'id_santri' => null,
                    'id_pengurus' => null,
                    'tujuan' => 'wali_santri',
                    'id_pengurus_pengirim' => null,
                    'kategori' => $replySource ?? 'custom',
                    'sumber' => 'api_wa',
                ];
                error_log('WhatsAppController::incoming ' . ($replySource ?? 'auto_reply') . ' reply to ' . $nomorTujuan . ' len=' . strlen($reply) . ($jid ? ' jid=' . $jid : ''));
                $sendResult = WhatsAppService::sendMessage($nomorTujuan, $reply, null, $logContext, $jid);
                error_log('WhatsAppController::incoming sendMessage result: success=' . ($sendResult['success'] ? '1' : '0') . ' msg=' . ($sendResult['message'] ?? ''));
            } else {
                error_log('WhatsAppController::incoming: no auto reply. from=' . $nomorTujuan . ' message_preview=' . substr($message, 0, 60));
                if (!$isDaftarNotif) {
                    error_log(
                        'WhatsAppController::incoming hint: Menu interaktif tidak mengembalikan teks (mati/tidak cocok). '
                        . 'AI WA butuh baris di atas dari AiWhatsappBridgeService jika penyebabnya bukan nomor/profil.'
                    );
                }
            }

            return $this->json($response, ['success' => true, 'message' => 'OK', 'id' => $id], 200);
        } catch (\Throwable $e) {
            error_log('WhatsAppController::incoming ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan pesan masuk'], 500);
        }
    }

    /**
     * Update status pesan oleh WA server (message_ack). Public dengan validasi X-API-Key.
     * POST /api/wa/message-status
     * Header: X-API-Key (harus sama dengan WA_API_KEY di config/wa).
     * Body: { "messageId": "xxx", "status": "sent"|"delivered"|"read" }
     */
    public function messageStatus(Request $request, Response $response): Response
    {
        $apiKey = $request->getHeaderLine('X-API-Key');
        $config = require __DIR__ . '/../../config.php';
        $expectedKey = getenv('WA_API_KEY') ?: ($config['whatsapp']['api_key'] ?? '');
        if ($expectedKey === '' || $apiKey !== $expectedKey) {
            $response->getBody()->write(json_encode(['success' => false, 'message' => 'Unauthorized'], JSON_UNESCAPED_UNICODE));
            return $response->withStatus(401)->withHeader('Content-Type', 'application/json; charset=utf-8');
        }
        try {
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = json_decode((string) $request->getBody(), true) ?? [];
            }
            $messageId = trim((string) ($body['messageId'] ?? $body['message_id'] ?? ''));
            $status = trim((string) ($body['status'] ?? ''));
            if ($messageId === '') {
                return $this->json($response, ['success' => false, 'message' => 'messageId wajib'], 400);
            }
            if (!in_array($status, ['sent', 'delivered', 'read'], true)) {
                return $this->json($response, ['success' => false, 'message' => 'status harus sent, delivered, atau read'], 400);
            }
            $db = Database::getInstance()->getConnection();
            $hasWa = $db->query("SHOW TABLES LIKE 'whatsapp'")->rowCount() > 0;
            $hasWaMessageId = $hasWa && $db->query("SHOW COLUMNS FROM whatsapp LIKE 'wa_message_id'")->rowCount() > 0;
            if ($hasWaMessageId) {
                $stmt = $db->prepare("UPDATE whatsapp SET status = ? WHERE wa_message_id = ? AND (arah = 'keluar' OR arah IS NULL)");
                $stmt->execute([$status, $messageId]);
            }
            return $this->json($response, ['success' => true, 'message' => 'OK'], 200);
        } catch (\Throwable $e) {
            error_log('WhatsAppController::messageStatus ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal update status'], 500);
        }
    }

    private function json(Response $response, array $data, int $status): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }
}
