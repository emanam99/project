<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\AiAgentImageInputHelper;
use App\Helpers\NikHelper;
use App\Helpers\RoleHelper;
use App\Helpers\TextSanitizer;
use App\Services\WhatsAppCloudService;
use App\Services\WhatsAppInboundService;
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
            $data = is_array($data) ? $data : [];
            // Jangan pakai cleanText pada seluruh body: itu menghapus baris baru (WA jadi satu baris).
            $message = TextSanitizer::cleanMultilineMessage($data['message'] ?? '');
            $documentBase64 = trim((string) ($data['documentBase64'] ?? ''));
            $imageBase64 = trim((string) ($data['imageBase64'] ?? ''));
            $fileName = trim((string) ($data['fileName'] ?? ''));
            $mimetype = trim((string) ($data['mimetype'] ?? ''));
            unset($data['message'], $data['documentBase64'], $data['imageBase64'], $data['fileName'], $data['mimetype']);
            $data = TextSanitizer::sanitizeStringValues($data, []);
            $phoneNumber = trim($data['phoneNumber'] ?? $data['phone_number'] ?? '');
            $instance = isset($data['instance']) ? trim($data['instance']) : null;
            $idSantriResolve = isset($data['id_santri']) ? (int) $data['id_santri'] : 0;
            $phoneField = trim((string) ($data['phone_field'] ?? $data['field'] ?? 'no_wa_santri'));

            // Nomor di FE sering ter-mask (****) — resolve dari DB bila id_santri ada
            if ($phoneNumber === '' || NikHelper::looksMasked($phoneNumber)) {
                if ($idSantriResolve > 0) {
                    $db = Database::getInstance()->getConnection();
                    $resolved = WhatsAppService::resolveSantriPhoneField($db, $idSantriResolve, $phoneField);
                    if ($resolved) {
                        $phoneNumber = $resolved;
                    }
                }
            }

            if ($phoneNumber === '' || NikHelper::looksMasked($phoneNumber)) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WhatsApp harus diisi'], 400);
            }
            if (preg_match('#^data:[^;]+;base64,#i', $documentBase64)) {
                $documentBase64 = trim((string) preg_replace('#^data:[^;]+;base64,#i', '', $documentBase64));
            }
            if (preg_match('#^data:[^;]+;base64,#i', $imageBase64)) {
                $imageBase64 = trim((string) preg_replace('#^data:[^;]+;base64,#i', '', $imageBase64));
            }
            $documentBase64 = preg_replace('/\s+/', '', $documentBase64) ?? '';
            $imageBase64 = preg_replace('/\s+/', '', $imageBase64) ?? '';
            $isPdfDocument = $documentBase64 !== '' && (
                $mimetype === 'application/pdf'
                || preg_match('/\.pdf$/i', $fileName) === 1
            );
            $isImageMedia = !$isPdfDocument && $imageBase64 !== '';
            if ($isPdfDocument) {
                if (strlen($documentBase64) > 7000000) {
                    return $this->json($response, ['success' => false, 'message' => 'Berkas PDF terlalu besar'], 413);
                }
                if ($fileName === '') {
                    $fileName = 'kwitansi.pdf';
                }
                if ($mimetype === '') {
                    $mimetype = 'application/pdf';
                }
                if ($message === '') {
                    $message = 'Kwitansi PDF';
                }
            } elseif ($isImageMedia) {
                if (strlen($imageBase64) > 7000000) {
                    return $this->json($response, ['success' => false, 'message' => 'Berkas gambar terlalu besar'], 413);
                }
                if ($mimetype === '' || !str_starts_with(strtolower($mimetype), 'image/')) {
                    $mimetype = 'image/jpeg';
                }
                if ($message === '') {
                    $message = 'Kwitansi';
                }
            } elseif ($message === '') {
                return $this->json($response, ['success' => false, 'message' => 'Pesan harus diisi'], 400);
            }

            $logContext = ['id_santri' => null, 'id_pengurus' => null, 'tujuan' => 'santri', 'id_pengurus_pengirim' => null, 'kategori' => 'staff_manual_wa', 'sumber' => 'api_wa'];
            $user = $request->getAttribute('user');
            if (is_array($user)) {
                $pid = RoleHelper::getPengurusIdFromPayload($user);
                if ($pid !== null && $pid > 0) {
                    $logContext['id_pengurus_pengirim'] = $pid;
                }
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
            if ($isPdfDocument) {
                $result = WhatsAppService::sendMessageWithImage(
                    $phoneNumber,
                    $message,
                    $documentBase64,
                    $mimetype !== '' ? $mimetype : 'application/pdf',
                    $instance,
                    $logContext,
                    $fileName
                );
            } elseif ($isImageMedia) {
                $result = WhatsAppService::sendMessageWithImage(
                    $phoneNumber,
                    $message,
                    $imageBase64,
                    $mimetype !== '' ? $mimetype : 'image/jpeg',
                    $instance,
                    $logContext
                );
            } else {
                $result = WhatsAppService::sendMessage($phoneNumber, $message, $instance, $logContext);
            }

            if (!empty($result['success']) && !WhatsAppService::deliveryWasNotActuallySent($result)) {
                $payload = ['success' => true, 'message' => $result['message'] ?? 'Pesan berhasil dikirim'];
                if (!empty($result['messageId'])) {
                    $payload['messageId'] = $result['messageId'];
                }
                if (!empty($result['senderPhoneNumber'])) {
                    $payload['senderPhoneNumber'] = $result['senderPhoneNumber'];
                }
                return $this->json($response, $payload, 200);
            }

            $failMsg = $result['message'] ?? 'Gagal mengirim pesan';
            if (!empty($result['success']) && WhatsAppService::deliveryWasNotActuallySent($result)) {
                $failMsg = 'Pesan tidak terkirim ke WhatsApp: ' . $failMsg;
            }

            return $this->json($response, [
                'success' => false,
                'message' => $failMsg,
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
            $data = is_array($data) ? $data : [];
            $phoneNumber = trim($data['phoneNumber'] ?? $data['phone_number'] ?? '');
            $messageId = isset($data['messageId']) ? trim((string) $data['messageId']) : '';
            $newMessageRaw = $data['newMessage'] ?? $data['new_message'] ?? '';
            $newMessage = TextSanitizer::cleanMultilineMessage(is_string($newMessageRaw) ? $newMessageRaw : (string) $newMessageRaw);
            $idSantriResolve = isset($data['id_santri']) ? (int) $data['id_santri'] : 0;
            $phoneField = trim((string) ($data['phone_field'] ?? $data['field'] ?? 'no_wa_santri'));

            if ($phoneNumber === '' || NikHelper::looksMasked($phoneNumber)) {
                if ($idSantriResolve > 0) {
                    $dbResolve = Database::getInstance()->getConnection();
                    $resolved = WhatsAppService::resolveSantriPhoneField($dbResolve, $idSantriResolve, $phoneField);
                    if ($resolved) {
                        $phoneNumber = $resolved;
                    }
                }
            }

            if ($phoneNumber === '' || NikHelper::looksMasked($phoneNumber)) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WhatsApp harus diisi'], 400);
            }
            if ($messageId === '') {
                return $this->json($response, ['success' => false, 'message' => 'messageId wajib'], 400);
            }
            if ($newMessage === '') {
                return $this->json($response, ['success' => false, 'message' => 'Isi pesan baru tidak boleh kosong'], 400);
            }

            $result = WhatsAppService::editMessage($phoneNumber, $messageId, $newMessage);

            if ($result['success']) {
                $db = \App\Database::getInstance()->getConnection();
                $hasWaMessageId = $db->query("SHOW COLUMNS FROM whatsapp LIKE 'wa_message_id'")->rowCount() > 0;
                if ($hasWaMessageId) {
                    $stmt = $db->prepare("UPDATE whatsapp SET isi_pesan = ? WHERE wa_message_id = ? AND (arah = 'keluar' OR arah IS NULL)");
                    $stmt->execute([$newMessage, $messageId]);
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
     * POST /api/wa/check (auth) atau /api/public/wa/check (publik, hanya phoneNumber).
     * Body: { "phoneNumber": "08xxx" } ATAU (auth) { "id_santri": 123, "field": "no_telpon"|"no_wa_santri" }
     */
    public function check(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? $data : [];
            $phoneNumber = trim($data['phoneNumber'] ?? $data['phone_number'] ?? '');
            $sessionId = isset($data['sessionId']) ? trim((string) $data['sessionId']) : (isset($data['session_id']) ? trim((string) $data['session_id']) : '');
            $sessionId = $sessionId !== '' ? $sessionId : null;
            $idSantri = isset($data['id_santri']) ? (int) $data['id_santri'] : 0;
            $field = trim((string) ($data['field'] ?? $data['phone_field'] ?? ''));
            $resolvedViaSantri = false;

            if ($idSantri > 0) {
                $user = $request->getAttribute('user');
                if (!is_array($user) || $user === []) {
                    return $this->json($response, [
                        'success' => false,
                        'data' => ['phoneNumber' => '', 'isRegistered' => false],
                        'message' => 'Login diperlukan untuk cek nomor berdasarkan data santri',
                    ], 401);
                }
                if ($field === '') {
                    $field = 'no_wa_santri';
                }
                $db = Database::getInstance()->getConnection();
                $resolved = WhatsAppService::resolveSantriPhoneField($db, $idSantri, $field);
                if ($resolved === null || $resolved === '') {
                    return $this->json($response, [
                        'success' => false,
                        'data' => ['phoneNumber' => '', 'isRegistered' => false, 'phone_masked' => ''],
                        'message' => 'Nomor tidak ditemukan pada data santri',
                    ], 404);
                }
                $phoneNumber = $resolved;
                $resolvedViaSantri = true;
            }

            if ($phoneNumber === '' || NikHelper::looksMasked($phoneNumber)) {
                return $this->json($response, [
                    'success' => false,
                    'data' => ['phoneNumber' => '', 'isRegistered' => false],
                    'message' => 'Nomor WhatsApp harus diisi',
                ], 400);
            }

            $result = WhatsAppService::checkNumber($phoneNumber, $sessionId);
            $dataOut = $result['data'] ?? [
                'phoneNumber' => WhatsAppService::formatPhoneNumber($phoneNumber),
                'isRegistered' => false,
            ];
            // Jangan bocorkan nomor penuh ke FE bila resolve dari santri (list PII ter-mask)
            if ($resolvedViaSantri) {
                $full = (string) ($dataOut['phoneNumber'] ?? $phoneNumber);
                $dataOut['phone_masked'] = NikHelper::maskPhone($full);
                $dataOut['phoneNumber'] = $dataOut['phone_masked'];
            }

            return $this->json($response, [
                'success' => $result['success'],
                'data' => $dataOut,
                'message' => $result['message'] ?? '',
            ], 200);
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
     * Kirim antrian follow-up handshake WA (link/username) + pesan maaf 15 menit.
     * Dipanggil mesin WA setelah webhook incoming selesai (hindari deadlock kirim-di-dalam-webhook).
     * POST /api/wa/flush-auth-followup — header X-API-Key = WA_API_KEY.
     */
    public function flushAuthFollowup(Request $request, Response $response): Response
    {
        $apiKey = $request->getHeaderLine('X-API-Key');
        $config = require __DIR__ . '/../../config.php';
        $expectedKey = (string) (getenv('WA_API_KEY') ?: ($config['whatsapp']['api_key'] ?? ''));
        if ($expectedKey === '' || !hash_equals($expectedKey, $apiKey)) {
            return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
        }
        try {
            $result = \App\Helpers\AuthWaFollowupHelper::flush();
            return $this->json($response, [
                'success' => true,
                'followup_sent' => (int) ($result['followup_sent'] ?? 0),
                'apology_sent' => (int) ($result['apology_sent'] ?? 0),
            ], 200);
        } catch (\Throwable $e) {
            error_log('WhatsAppController::flushAuthFollowup ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memproses antrian follow-up'], 500);
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
            // Auth ringan: di production wajibkan X-API-Key = WA_API_KEY (selaras messageStatus).
            // Di dev/staging: jika WA_API_KEY di-set, tetap diverifikasi; jika kosong, terima (memudahkan dev).
            $apiKey = $request->getHeaderLine('X-API-Key');
            $config = require __DIR__ . '/../../config.php';
            $expectedKey = (string) (getenv('WA_API_KEY') ?: ($config['whatsapp']['api_key'] ?? ''));
            $isProduction = strtolower((string) getenv('APP_ENV')) === 'production';
            if ($expectedKey === '' && $isProduction) {
                error_log('WhatsAppController::incoming tolak: WA_API_KEY kosong di production');
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }
            if ($expectedKey !== '' && !hash_equals($expectedKey, $apiKey)) {
                error_log('WhatsAppController::incoming tolak: X-API-Key tidak cocok');
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }

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

            $nomorFrom = WhatsAppService::normalizeWebhookFrom($from, $fromJid);
            if (strlen($nomorFrom) < 10) {
                error_log('WhatsAppController::incoming rejected: nomor tidak valid. from=' . substr($from, 0, 20));
                return $this->json($response, ['success' => false, 'message' => 'Nomor tidak valid'], 400);
            }
            // Untuk tampilan/riwayat: pakai nomor kanonik (62xxx asli) jika dikirim WA client (mis. dari getContactLidAndPhone), agar cocok dengan nomor pendaftar
            $nomorTujuan = $canonicalNumber !== ''
                ? WhatsAppService::normalizeWebhookDestination($canonicalNumber)
                : $nomorFrom;
            if (strlen($nomorTujuan) < 10) {
                $nomorTujuan = $nomorFrom;
            }

            $jid = $fromJid !== '' ? $fromJid : null;

            $incomingIsGroup = null;
            if (array_key_exists('is_group', $body)) {
                $incomingIsGroup = filter_var($body['is_group'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            } elseif (array_key_exists('isGroup', $body)) {
                $incomingIsGroup = filter_var($body['isGroup'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            }
            if ($incomingIsGroup === null && isset($body['chat_type'])) {
                $ct = strtolower(trim((string) $body['chat_type']));
                if (in_array($ct, ['group', 'grp', 'g'], true)) {
                    $incomingIsGroup = true;
                } elseif (in_array($ct, ['private', 'personal', 'direct', 'dm'], true)) {
                    $incomingIsGroup = false;
                }
            }
            if ($incomingIsGroup === null && $jid !== null && $jid !== '') {
                $jl = strtolower($jid);
                if (str_ends_with($jl, '@g.us')) {
                    $incomingIsGroup = true;
                }
            }

            $attachments = self::parseWaIncomingAttachments($body);

            $res = WhatsAppInboundService::persistInboundAndRun(
                $nomorTujuan,
                $message,
                $messageId,
                $jid,
                $incomingIsGroup,
                'api_wa',
                $attachments
            );
            if (!empty($res['duplicate'])) {
                return $this->json($response, ['success' => true, 'message' => 'OK'], 200);
            }

            $payload = ['success' => true, 'message' => 'OK', 'id' => $res['id'] ?? null];
            if (!empty($res['immediate_ack']) && is_string($res['immediate_ack'])) {
                $payload['immediate_ack'] = $res['immediate_ack'];
                if (!empty($res['immediate_jid']) && is_string($res['immediate_jid'])) {
                    $payload['immediate_jid'] = $res['immediate_jid'];
                }
            }

            return $this->json($response, $payload, 200);
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

    /**
     * Webhook verifikasi WhatsApp Cloud API (Meta).
     * GET /api/wa/official/webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
     * Meta memanggil ini saat setup Callback URL di App → WhatsApp → Configuration.
     */
    public function webhookOfficialVerify(Request $request, Response $response): Response
    {
        $params = $request->getQueryParams();
        $mode = $params['hub.mode'] ?? $params['hub_mode'] ?? '';
        $token = $params['hub.verify_token'] ?? $params['hub_verify_token'] ?? '';
        $challenge = $params['hub.challenge'] ?? $params['hub_challenge'] ?? '';

        $config = require __DIR__ . '/../../config.php';
        $verifyToken = trim((string) ($config['whatsapp_cloud']['verify_token'] ?? getenv('WA_CLOUD_VERIFY_TOKEN') ?? ''));

        if ($mode !== 'subscribe' || $verifyToken === '' || $token !== $verifyToken) {
            return $response->withStatus(403);
        }

        $response->getBody()->write($challenge);
        return $response->withHeader('Content-Type', 'text/plain');
    }

    /**
     * Webhook penerimaan pesan/status WhatsApp Cloud API (Meta).
     * POST /api/wa/official/webhook
     * Body: payload dari Meta (whatsapp_business_account). Validasi x-hub-signature-256 jika app_secret diset.
     */
    public function webhookOfficialReceive(Request $request, Response $response): Response
    {
        $rawBody = (string) $request->getBody();
        $signature = $request->getHeaderLine('x-hub-signature-256');

        if ($rawBody === '') {
            $response->getBody()->write('EVENT_RECEIVED');
            return $response->withStatus(200)->withHeader('Content-Type', 'text/plain');
        }

        if ($signature !== '' && !WhatsAppCloudService::verifyWebhookSignature($rawBody, $signature)) {
            error_log('WhatsAppController::webhookOfficialReceive signature invalid');
            return $response->withStatus(403);
        }

        $body = json_decode($rawBody, true);
        if (!is_array($body)) {
            $response->getBody()->write('EVENT_RECEIVED');
            return $response->withStatus(200)->withHeader('Content-Type', 'text/plain');
        }

        $parsed = WhatsAppCloudService::parseWebhookPayload($body);
        foreach ($parsed['messages'] as $rawMessage) {
            $from = $rawMessage['from'] ?? '';
            $messageId = $rawMessage['id'] ?? null;
            $text = WhatsAppCloudService::getMessageText($rawMessage);
            $nomor = WhatsAppCloudService::formatPhoneNumber($from);
            if (strlen($nomor) >= 10) {
                WhatsAppCloudService::logIncomingToDb($nomor, $text !== '' ? $text : '(tanpa teks)', $messageId);
            }
        }

        $response->getBody()->write('EVENT_RECEIVED');
        return $response->withStatus(200)->withHeader('Content-Type', 'text/plain');
    }

    /**
     * Kirim pesan via WhatsApp Cloud API (resmi Meta).
     * POST /api/wa/official/send
     * Body: { "phoneNumber": "08xxx atau 62xxx", "message": "teks" }
     * Hanya dipakai jika WA_CLOUD_ENABLED=true dan token sudah di-set.
     */
    public function sendOfficial(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            $phoneNumber = trim($data['phoneNumber'] ?? $data['phone_number'] ?? '');
            $message = TextSanitizer::cleanText($data['message'] ?? '');

            if ($phoneNumber === '') {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WhatsApp harus diisi'], 400);
            }
            if ($message === '') {
                return $this->json($response, ['success' => false, 'message' => 'Pesan harus diisi'], 400);
            }

            $result = WhatsAppCloudService::sendText($phoneNumber, $message);

            if ($result['success']) {
                $payload = ['success' => true, 'message' => $result['message'] ?? 'Pesan berhasil dikirim'];
                if (!empty($result['message_id'])) {
                    $payload['messageId'] = $result['message_id'];
                }
                return $this->json($response, $payload, 200);
            }

            return $this->json($response, [
                'success' => false,
                'message' => $result['message'] ?? 'Gagal mengirim pesan',
            ], 502);
        } catch (\Exception $e) {
            error_log('WhatsAppController::sendOfficial ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat mengirim pesan',
            ], 500);
        }
    }

    /**
     * Hentikan stack WA di host: docker compose down (container mati & dihapus; bind mount whatsapp-sessions tetap).
     * Hanya jika WA_DOCKER_CONTROL_ENABLED + WA_DOCKER_COMPOSE_DIR di api/.env.
     */
    public function dockerStop(Request $request, Response $response): Response
    {
        try {
            if (!$this->waDockerControlEnabled()) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Kontrol Docker WA tidak diaktifkan. Set WA_DOCKER_CONTROL_ENABLED=true dan WA_DOCKER_COMPOSE_DIR di api/.env.',
                ], 503);
            }
            $dir = $this->resolveWaDockerComposeDir();
            if ($dir === null) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'WA_DOCKER_COMPOSE_DIR tidak valid atau tidak berisi docker-compose.yml.',
                ], 400);
            }
            $run = $this->runDockerCompose($dir, ['down', '--remove-orphans']);
            if (!$run['ok']) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Gagal menghentikan stack Docker WA: ' . ($run['output'] !== '' ? $run['output'] : ('kode keluar ' . $run['code'])),
                    'data' => ['exitCode' => $run['code']],
                ], 502);
            }

            return $this->json($response, [
                'success' => true,
                'message' => 'Stack Docker WA dihentikan (container off). Data sesi di volume host tetap; saat start, proses Node berjalan baru dari awal.',
                'data' => ['waEngineEnabled' => false],
            ], 200);
        } catch (\Throwable $e) {
            error_log('WhatsAppController::dockerStop ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan saat menghentikan Docker'], 500);
        }
    }

    /**
     * Jalankan ulang stack WA: docker compose up -d (container baru setelah down).
     */
    public function dockerStart(Request $request, Response $response): Response
    {
        try {
            if (!$this->waDockerControlEnabled()) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Kontrol Docker WA tidak diaktifkan. Set WA_DOCKER_CONTROL_ENABLED=true dan WA_DOCKER_COMPOSE_DIR di api/.env.',
                ], 503);
            }
            $dir = $this->resolveWaDockerComposeDir();
            if ($dir === null) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'WA_DOCKER_COMPOSE_DIR tidak valid atau tidak berisi docker-compose.yml.',
                ], 400);
            }
            $run = $this->runDockerCompose($dir, ['up', '-d', '--remove-orphans']);
            if (!$run['ok']) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Gagal menjalankan stack Docker WA: ' . ($run['output'] !== '' ? $run['output'] : ('kode keluar ' . $run['code'])),
                    'data' => ['exitCode' => $run['code']],
                ], 502);
            }

            return $this->json($response, [
                'success' => true,
                'message' => 'Stack Docker WA dijalankan kembali (container segar, sesi Baileys dari disk).',
                'data' => ['waEngineEnabled' => true],
            ], 200);
        } catch (\Throwable $e) {
            error_log('WhatsAppController::dockerStart ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan saat menjalankan Docker'], 500);
        }
    }

    private function waDockerControlEnabled(): bool
    {
        $v = getenv('WA_DOCKER_CONTROL_ENABLED');

        return $v === '1' || strcasecmp((string) $v, 'true') === 0;
    }

    /** @return non-falsy-string|null */
    private function resolveWaDockerComposeDir(): ?string
    {
        $raw = trim((string) (getenv('WA_DOCKER_COMPOSE_DIR') ?: ''));
        if ($raw === '') {
            return null;
        }
        $real = realpath($raw);
        if ($real === false || !is_dir($real)) {
            return null;
        }
        $yml = $real . DIRECTORY_SEPARATOR . 'docker-compose.yml';
        $yaml = $real . DIRECTORY_SEPARATOR . 'docker-compose.yaml';
        if (!is_file($yml) && !is_file($yaml)) {
            return null;
        }

        return $real;
    }

    /**
     * @param list<string> $composeArgs contoh: ['down','--remove-orphans']
     * @return array{ok: bool, code: int, output: string}
     */
    private function runDockerCompose(string $workDir, array $composeArgs): array
    {
        $timeout = (int) (getenv('WA_DOCKER_COMPOSE_TIMEOUT_SEC') ?: '180');
        if ($timeout < 30) {
            $timeout = 30;
        }
        if ($timeout > 600) {
            $timeout = 600;
        }

        $escapedPieces = [];
        foreach ($composeArgs as $a) {
            $escapedPieces[] = escapeshellarg((string) $a);
        }
        $dockerLine = 'docker compose ' . implode(' ', $escapedPieces) . ' 2>&1';

        $isWin = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
        if ($isWin) {
            $inner = 'cd /d ' . escapeshellarg($workDir) . ' && ' . $dockerLine;
            $command = 'cmd /C ' . escapeshellarg($inner);
        } else {
            $inner = 'cd ' . escapeshellarg($workDir) . ' && ' . $dockerLine;
            $command = 'sh -c ' . escapeshellarg($inner);
        }

        return $this->runShellCommand($command, $timeout);
    }

    /**
     * @return array{ok: bool, code: int, output: string}
     */
    private function runShellCommand(string $command, int $timeoutSec): array
    {
        $descriptorspec = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];
        $proc = @proc_open($command, $descriptorspec, $pipes, null, null);
        if (!is_resource($proc)) {
            return ['ok' => false, 'code' => -1, 'output' => 'Tidak bisa menjalankan perintah shell'];
        }
        fclose($pipes[0]);
        if (is_resource($pipes[1])) {
            stream_set_blocking($pipes[1], false);
        }
        if (is_resource($pipes[2])) {
            stream_set_blocking($pipes[2], false);
        }
        $output = '';
        $start = time();
        while (true) {
            $out1 = is_resource($pipes[1]) ? (string) stream_get_contents($pipes[1]) : '';
            $out2 = is_resource($pipes[2]) ? (string) stream_get_contents($pipes[2]) : '';
            $output .= $out1 . $out2;
            $st = proc_get_status($proc);
            if (!$st['running']) {
                break;
            }
            if (time() - $start > $timeoutSec) {
                proc_terminate($proc);
                if (is_resource($pipes[1])) {
                    fclose($pipes[1]);
                }
                if (is_resource($pipes[2])) {
                    fclose($pipes[2]);
                }
                proc_close($proc);

                return ['ok' => false, 'code' => -2, 'output' => trim($output) . "\n[timeout {$timeoutSec}s]"];
            }
            usleep(150000);
        }
        if (is_resource($pipes[1])) {
            fclose($pipes[1]);
        }
        if (is_resource($pipes[2])) {
            fclose($pipes[2]);
        }
        $code = proc_close($proc);

        return ['ok' => $code === 0, 'code' => $code, 'output' => trim($output)];
    }

    /**
     * Lampiran dari wa-backend (gambar/pdf/dokumen) — base64 + mime_type.
     *
     * @param array<string, mixed> $body
     *
     * @return list<array{mime_type: string, data: string}>
     */
    private static function parseWaIncomingAttachments(array $body): array
    {
        $raw = $body['attachments'] ?? ($body['images'] ?? []);
        if (!is_array($raw) || $raw === []) {
            return [];
        }
        [$ok, , $norm] = AiAgentImageInputHelper::normalize($raw);

        return $ok ? $norm : [];
    }

    private function json(Response $response, array $data, int $status): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }
}
