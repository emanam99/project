<?php

namespace App\Controllers;

use App\Database;
use App\Services\WatzapService;
use App\Services\WhatsAppService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Proxy WatZap API (super_admin only). Endpoint: /api/watzap/*
 */
class WatzapController
{
    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * GET /api/watzap/status
     */
    public function getStatus(Request $request, Response $response): Response
    {
        $res = WatzapService::getStatus();
        return $this->jsonResponse($response, [
            'success' => $res['success'],
            'data' => $res['data'],
            'message' => $res['message'] ?? null,
        ], 200);
    }

    /**
     * GET /api/watzap/devices
     */
    public function getDevices(Request $request, Response $response): Response
    {
        $res = WatzapService::getDevices();
        return $this->jsonResponse($response, [
            'success' => $res['success'],
            'data' => $res['data'],
            'message' => $res['message'] ?? null,
        ], 200);
    }

    /**
     * GET /api/watzap/webhook-url - URL webhook untuk copy ke dashboard WatZap (staging: api2, production: api).
     */
    public function getWebhookUrl(Request $request, Response $response): Response
    {
        $url = WatzapService::getWebhookUrl();
        return $this->jsonResponse($response, [
            'success' => true,
            'url' => $url,
            'message' => $url === '' ? 'Set API_PUBLIC_URL atau WATZAP_WEBHOOK_URL di .env' : null,
        ], 200);
    }

    /**
     * GET /api/watzap/webhooks - Daftar webhook yang terdaftar di WatZap (get webhook dari API WatZap).
     */
    public function getWebhooks(Request $request, Response $response): Response
    {
        $res = WatzapService::getWebhooks();
        return $this->jsonResponse($response, [
            'success' => $res['success'],
            'data' => $res['data'],
            'message' => $res['message'] ?? null,
        ], 200);
    }

    /**
     * POST /api/watzap/set-webhook - Daftarkan webhook ke WatZap (jika API mendukung; else set manual di dashboard).
     */
    public function setWebhook(Request $request, Response $response): Response
    {
        $body = (array) $request->getParsedBody();
        $url = isset($body['url']) ? trim((string) $body['url']) : null;
        $res = WatzapService::setWebhook($url);
        return $this->jsonResponse($response, [
            'success' => $res['success'],
            'message' => $res['message'],
        ], 200);
    }

    /**
     * POST /api/watzap/webhook - Diterima dari WatZap (tanpa auth).
     * Simpan pesan masuk ke tabel whatsapp (arah=masuk, sumber=watzap) agar riwayat chat Data Pendaftar menampilkannya.
     * Dokumentasi: https://api-docs.watzap.id/
     * Payload umum: event + data, atau flat from/sender + message/body/text + message_id/id.
     */
    public function webhook(Request $request, Response $response): Response
    {
        $rawBody = (string) $request->getBody();
        $data = json_decode($rawBody, true);
        if (!is_array($data)) {
            error_log('WatZap webhook: invalid JSON, len=' . strlen($rawBody));
            return $this->jsonResponse($response, ['success' => true], 200);
        }

        $logPrefix = 'WatZap webhook: ';
        error_log($logPrefix . substr(json_encode($data, JSON_UNESCAPED_UNICODE), 0, 500));

        $payload = isset($data['data']) && is_array($data['data']) ? $data['data'] : $data;
        $from = trim((string) ($payload['from'] ?? $payload['sender'] ?? $payload['phone'] ?? $payload['phone_number'] ?? $payload['phoneNo'] ?? $payload['phone_no'] ?? ''));
        $message = trim((string) ($payload['message'] ?? $payload['body'] ?? $payload['text'] ?? $payload['content'] ?? ''));
        $messageId = isset($payload['messageId']) ? trim((string) $payload['messageId']) : (isset($payload['message_id']) ? trim((string) $payload['message_id']) : (isset($payload['id']) ? trim((string) $payload['id']) : null));

        if ($from !== '' && strlen(WhatsAppService::formatPhoneNumber($from)) >= 10) {
            try {
                $nomorTujuan = WhatsAppService::formatPhoneNumber($from);
                $db = Database::getInstance()->getConnection();

                if ($messageId !== null && $messageId !== '') {
                    $stmt = $db->prepare('SELECT id FROM whatsapp WHERE arah = ? AND wa_message_id = ? LIMIT 1');
                    $stmt->execute(['masuk', $messageId]);
                    if ($stmt->fetch(\PDO::FETCH_ASSOC)) {
                        return $this->jsonResponse($response, ['success' => true], 200);
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
                    'watzap',
                    'terkirim',
                ]);
                error_log($logPrefix . 'saved from=' . $nomorTujuan);
            } catch (\Throwable $e) {
                error_log($logPrefix . 'save error: ' . $e->getMessage());
            }
        }

        return $this->jsonResponse($response, ['success' => true], 200);
    }

    /**
     * POST /api/watzap/send - Body: { phone, message [, number_key ] }. number_key opsional (default ALL).
     */
    public function send(Request $request, Response $response): Response
    {
        $body = (array) $request->getParsedBody();
        $phone = isset($body['phone']) ? trim((string) $body['phone']) : '';
        $message = isset($body['message']) ? trim((string) $body['message']) : '';
        $numberKey = isset($body['number_key']) ? trim((string) $body['number_key']) : '';

        if ($phone === '' || $message === '') {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'phone dan message wajib diisi',
            ], 400);
        }

        $res = WatzapService::sendMessage($phone, $message, $numberKey);
        return $this->jsonResponse($response, [
            'success' => $res['success'],
            'message' => $res['message'],
        ], 200);
    }
}
