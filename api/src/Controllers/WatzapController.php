<?php

namespace App\Controllers;

use App\Database;
use App\Services\DaftarNotifFlow;
use App\Services\WaInteractiveMenuService;
use App\Services\WatzapService;
use App\Services\WhatsAppService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Proxy WatZap API (super_admin only). Endpoint: /api/watzap/*
 */
class WatzapController
{
    /**
     * Ambil teks pesan masuk dari berbagai bentuk payload WatZap / WhatsApp (flat, nested, Baileys).
     */
    private static function extractIncomingMessageText(array $root, array $payload): string
    {
        foreach ([$payload, $root] as $layer) {
            $t = self::extractTextFromAssociativeArray($layer);
            if ($t !== '') {
                return $t;
            }
        }
        return '';
    }

    /**
     * @param array<string, mixed> $a
     */
    private static function extractTextFromAssociativeArray(array $a): string
    {
        $stringKeys = [
            // WatZap webhook resmi: data.message_body
            'message_body', 'messageBody',
            'message', 'body', 'text', 'content', 'caption', 'chat', 'msg', 'pesan', 'isi', 'isi_pesan',
            'message_text', 'messageText', 'text_message', 'textMessage', 'chat_message', 'chatMessage',
            'push_text', 'pushText',
        ];
        foreach ($stringKeys as $k) {
            if (!\array_key_exists($k, $a)) {
                continue;
            }
            $v = $a[$k];
            if (\is_string($v)) {
                $t = trim($v);
                if ($t !== '') {
                    return $t;
                }
            }
            if (\is_array($v)) {
                $t = self::extractFromBaileysStyleMessage($v);
                if ($t !== '') {
                    return $t;
                }
            }
        }

        if (isset($a['messages']) && \is_array($a['messages']) && $a['messages'] !== []) {
            $first = $a['messages'][0];
            if (\is_array($first)) {
                $t = self::extractTextFromAssociativeArray($first);
                if ($t !== '') {
                    return $t;
                }
                if (isset($first['message']) && \is_array($first['message'])) {
                    $t = self::extractFromBaileysStyleMessage($first['message']);
                    if ($t !== '') {
                        return $t;
                    }
                }
            }
        }

        return '';
    }

    /**
     * Node WhatsApp / Baileys: message.conversation, extendedTextMessage.text, dll.
     *
     * @param array<string, mixed> $msg
     */
    private static function extractFromBaileysStyleMessage(array $msg): string
    {
        if (isset($msg['conversation']) && \is_string($msg['conversation'])) {
            $t = trim($msg['conversation']);
            if ($t !== '') {
                return $t;
            }
        }

        $types = [
            'extendedTextMessage', 'imageMessage', 'videoMessage', 'documentMessage',
            'buttonsMessage', 'templateMessage',
        ];
        foreach ($types as $type) {
            if (empty($msg[$type]) || !\is_array($msg[$type])) {
                continue;
            }
            $inner = $msg[$type];
            foreach (['text', 'caption', 'title'] as $ik) {
                if (isset($inner[$ik]) && \is_string($inner[$ik])) {
                    $t = trim($inner[$ik]);
                    if ($t !== '') {
                        return $t;
                    }
                }
            }
        }

        if (!empty($msg['buttonsResponseMessage']) && \is_array($msg['buttonsResponseMessage'])) {
            $b = $msg['buttonsResponseMessage'];
            foreach (['selectedDisplayText', 'selectedButtonId'] as $ik) {
                if (isset($b[$ik]) && \is_string($b[$ik])) {
                    $t = trim($b[$ik]);
                    if ($t !== '') {
                        return $t;
                    }
                }
            }
        }
        if (!empty($msg['listResponseMessage']) && \is_array($msg['listResponseMessage'])) {
            $l = $msg['listResponseMessage'];
            foreach (['title', 'description', 'singleSelectReply'] as $ik) {
                if ($ik === 'singleSelectReply' && isset($l[$ik]) && \is_array($l[$ik])) {
                    $sr = $l[$ik];
                    if (isset($sr['selectedRowId']) && \is_string($sr['selectedRowId'])) {
                        $t = trim($sr['selectedRowId']);
                        if ($t !== '') {
                            return $t;
                        }
                    }
                } elseif (isset($l[$ik]) && \is_string($l[$ik])) {
                    $t = trim($l[$ik]);
                    if ($t !== '') {
                        return $t;
                    }
                }
            }
        }

        return '';
    }

    /**
     * Cari string pertama dengan key tertentu di array nested (Baileys/WatZap).
     *
     * @param array<string, mixed> $arr
     */
    private static function findStringByKeyDeep(array $arr, string $key, int $depth = 0): string
    {
        if ($depth > 10) {
            return '';
        }
        if (\array_key_exists($key, $arr) && (\is_string($arr[$key]) || \is_int($arr[$key]) || \is_float($arr[$key]))) {
            $t = trim((string) $arr[$key]);
            if ($t !== '') {
                return $t;
            }
        }
        foreach ($arr as $v) {
            if (\is_array($v)) {
                $found = self::findStringByKeyDeep($v, $key, $depth + 1);
                if ($found !== '') {
                    return $found;
                }
            }
        }

        return '';
    }

    /**
     * Kandidat nomor pengirim yang plausibel dari payload webhook.
     * Menerima MSISDN normal (62...) dan id numerik tertentu dari provider (mis. LID) agar tidak drop event.
     */
    private static function isPlausibleSenderDigits(string $digits): bool
    {
        if ($digits === '') {
            return false;
        }
        $len = strlen($digits);
        if ($len < 10 || $len > 18) {
            return false;
        }
        if (!preg_match('/^\d+$/', $digits)) {
            return false;
        }
        return true;
    }

    /**
     * Ambil MSISDN pengirim dari webhook WatZap/Baileys.
     * Prioritas: phone_number / sender_pn (bukan part JID @lid — itu bukan nomor HP).
     *
     * @param array<string, mixed> $data
     * @param array<string, mixed> $payload
     */
    private static function resolveSenderPhoneFromWebhook(array $data, array $payload): string
    {
        $candidates = [];
        $push = function (string $s) use (&$candidates): void {
            $s = trim($s);
            if ($s !== '') {
                $candidates[] = $s;
            }
        };

        foreach (['phone_number', 'phone_no', 'senderPhone', 'sender_phone', 'sender_pn', 'senderPn'] as $k) {
            if (isset($payload[$k]) && (\is_string($payload[$k]) || \is_int($payload[$k]) || \is_float($payload[$k]))) {
                $push((string) $payload[$k]);
            }
        }
        if (isset($payload['key']) && \is_array($payload['key'])) {
            foreach (['sender_pn', 'senderPn'] as $k) {
                if (isset($payload['key'][$k]) && (\is_string($payload['key'][$k]) || \is_int($payload['key'][$k]) || \is_float($payload['key'][$k]))) {
                    $push((string) $payload['key'][$k]);
                }
            }
        }
        foreach (['sender_pn', 'sender_pn_if', 'senderPhone', 'sender_phone', 'phone_number', 'phone_no'] as $k) {
            $s = self::findStringByKeyDeep($payload, $k, 0);
            if ($s !== '') {
                $push($s);
            }
            $s2 = self::findStringByKeyDeep($data, $k, 0);
            if ($s2 !== '') {
                $push($s2);
            }
        }
        foreach (['from', 'sender', 'phone'] as $k) {
            if (isset($payload[$k]) && (\is_string($payload[$k]) || \is_int($payload[$k]) || \is_float($payload[$k]))) {
                $push((string) $payload[$k]);
            }
        }
        if (!empty($payload['jid']) && \is_string($payload['jid'])) {
            $jid = trim($payload['jid']);
            if ($jid !== '' && !preg_match('/@(lid|g\.us|broadcast|newsletter)/i', $jid)) {
                $local = preg_replace('/@.*$/', '', $jid) ?? '';
                $push($local);
            }
        }
        if (isset($payload['key']) && \is_array($payload['key'])) {
            $jid = trim((string) ($payload['key']['remoteJid'] ?? $payload['key']['participant'] ?? ''));
            if ($jid !== '' && !preg_match('/@(lid|g\.us|broadcast|newsletter)/i', $jid)) {
                $local = preg_replace('/@.*$/', '', $jid) ?? '';
                $push($local);
            }
        }

        $seen = [];
        foreach ($candidates as $raw) {
            $digits = preg_replace('/\D/', '', $raw) ?? '';
            if ($digits === '') {
                continue;
            }
            if (strpos($digits, '0') === 0) {
                $digits = '62' . substr($digits, 1);
            }
            if (isset($seen[$digits])) {
                continue;
            }
            $seen[$digits] = true;
            if (self::isPlausibleSenderDigits($digits)) {
                return $digits;
            }
        }

        return '';
    }

    /**
     * Webhook WatZap / Baileys yang bukan pesan chat (typing, creds, presence, koneksi).
     * Dibiarkan 200 OK tanpa log MSISDN — bukan bug.
     *
     * @param array<string, mixed> $data
     * @param array<string, mixed> $payload
     */
    private static function isWatzapNonMessageNoise(array $data, array $payload): bool
    {
        $root = isset($data['event_type']) ? strtolower((string) $data['event_type']) : '';
        $inner = isset($payload['event_type']) ? strtolower((string) $payload['event_type']) : '';

        if (in_array($root, ['presence.update', 'presence_update', 'connection.update', 'connection_update'], true)) {
            return true;
        }
        if (in_array($inner, ['creds.update', 'creds_update', 'connection.update', 'connection_update'], true)) {
            return true;
        }
        if ($root === 'engine.event' && in_array($inner, ['creds.update', 'creds_update'], true)) {
            return true;
        }

        return false;
    }

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
     * PUT /api/watzap/config - Simpan pengaturan WatZap (number_key). Body: { "number_key": "..." }
     */
    public function putConfig(Request $request, Response $response): Response
    {
        $body = (array) $request->getParsedBody();
        $numberKey = isset($body['number_key']) ? trim((string) $body['number_key']) : '';
        WatzapService::setNumberKey($numberKey);
        $cfg = WatzapService::getStatus();
        $effective = ($cfg['success'] && is_array($cfg['data'])) ? ($cfg['data']['number_key'] ?? '') : '';
        return $this->jsonResponse($response, [
            'success' => true,
            'message' => 'Pengaturan WatZap disimpan',
            'data' => ['number_key' => $effective],
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
     * WatZap: event_type + data (message_body, message_id, phone_number, from_me, chat_id, …).
     */
    public function webhook(Request $request, Response $response): Response
    {
        $rawBody = (string) $request->getBody();
        $data = json_decode($rawBody, true);
        if (!is_array($data)) {
            error_log('WatZap webhook: invalid JSON, len=' . strlen($rawBody));
            return $this->jsonResponse($response, ['success' => true], 200);
        }

        $payload = isset($data['payload']) && is_array($data['payload']) ? $data['payload']
            : (isset($data['data']) && is_array($data['data']) ? $data['data'] : $data);

        if (self::isWatzapNonMessageNoise($data, $payload)) {
            return $this->jsonResponse($response, ['success' => true], 200);
        }

        $logPrefix = 'WatZap webhook: ';
        error_log($logPrefix . substr(json_encode($data, JSON_UNESCAPED_UNICODE), 0, 800));

        $from = self::resolveSenderPhoneFromWebhook($data, $payload);
        $message = self::extractIncomingMessageText($data, $payload);
        $messageId = isset($payload['messageId']) ? trim((string) $payload['messageId']) : (isset($payload['message_id']) ? trim((string) $payload['message_id']) : (isset($payload['id']) ? trim((string) $payload['id']) : null));
        if ($from === '' && ($message !== '' || ($messageId !== null && $messageId !== ''))) {
            error_log($logPrefix . 'tidak ada MSISDN plausibel (pastikan payload punya phone_number / sender_pn; JID @lid bukan nomor HP).');
        }
        $fromMe = isset($payload['fromMe'])
            ? (bool) $payload['fromMe']
            : (isset($payload['from_me']) ? (bool) $payload['from_me'] : false);
        error_log($logPrefix . 'parsed from=' . $from . ' message_len=' . strlen($message) . ' msg_preview=' . substr($message, 0, 80) . ' fromMe=' . ($fromMe ? '1' : '0'));

        if ($fromMe) {
            return $this->jsonResponse($response, ['success' => true], 200);
        }
        if ($from !== '') {
            try {
                $nomorTujuan = $from;
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

                $fromJidFlow = trim((string) ($payload['chat_id'] ?? ''));
                $fromJidFlow = $fromJidFlow !== '' ? $fromJidFlow : null;

                $reply = DaftarNotifFlow::handle($nomorTujuan, $message, $fromJidFlow);
                $isDaftarNotif = $reply !== null && $reply !== '';
                if (!$isDaftarNotif) {
                    $reply = WaInteractiveMenuService::handle($nomorTujuan, $message, $fromJidFlow);
                }
                if ($reply !== null && $reply !== '') {
                    $logContext = [
                        'id_santri' => null,
                        'id_pengurus' => null,
                        'tujuan' => 'wali_santri',
                        'id_pengurus_pengirim' => null,
                        'kategori' => $isDaftarNotif ? 'daftar_notif' : 'wa_interactive_menu',
                        'sumber' => 'watzap',
                    ];
                    error_log($logPrefix . ($isDaftarNotif ? 'daftar_notif' : 'wa_interactive_menu') . ' reply to ' . $nomorTujuan . ' len=' . strlen($reply));
                    $sendResult = WhatsAppService::sendMessage($nomorTujuan, $reply, null, $logContext, $fromJidFlow);
                    error_log($logPrefix . 'sendMessage result: success=' . ($sendResult['success'] ? '1' : '0') . ' msg=' . ($sendResult['message'] ?? ''));
                } else {
                    error_log($logPrefix . 'no auto reply (daftar_notif / menu interaktif kosong)');
                }
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
