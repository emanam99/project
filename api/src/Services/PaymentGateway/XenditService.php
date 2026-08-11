<?php

namespace App\Services\PaymentGateway;

use App\Database;
use App\Helpers\PaymentGatewaySettlementHelper;
use App\Services\PaymentGateway\PaymentGatewayLogger;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Integrasi Xendit Payments API v3 — https://docs.xendit.co/apidocs
 */
class XenditService
{
    private $db;
    private $config;
    private $apiKey;
    private $apiBaseUrl;

    /** @var array<string, string> payment_channel (mybeddien) → channel_code Xendit VA */
    private const VA_CHANNEL_MAP = [
        'bca' => 'BCA_VIRTUAL_ACCOUNT',
        'bni' => 'BNI_VIRTUAL_ACCOUNT',
        'bri' => 'BRI_VIRTUAL_ACCOUNT',
        'mandiri' => 'MANDIRI_VIRTUAL_ACCOUNT',
        'permata' => 'PERMATA_VIRTUAL_ACCOUNT',
        'cimb' => 'CIMB_VIRTUAL_ACCOUNT',
        'danamon' => 'DANAMON_VIRTUAL_ACCOUNT',
        'bsi' => 'BSI_VIRTUAL_ACCOUNT',
    ];

    /** @var array<string, string> payment_channel e-wallet → channel_code Xendit (Payments API v3, country ID) */
    private const EWALLET_CHANNEL_MAP = [
        'dana' => 'DANA',
        'ovo' => 'OVO',
        'gopay' => 'GOPAY',
        'shopeepay' => 'SHOPEEPAY',
        'linkaja' => 'LINKAJA',
    ];

    private const CSTORE_CHANNEL_MAP = [
        'alfamart' => 'ALFAMART',
        'indomaret' => 'INDOMARET',
    ];

    public function __construct(?array $configOverride = null)
    {
        $this->db = Database::getInstance()->getConnection();
        $this->loadConfig($configOverride);
    }

    private function loadConfig(?array $configOverride): void
    {
        $this->config = $configOverride ?? PaymentGatewayConfig::getConfigByProviderAndMode(
            PaymentGatewayConfig::CONFIG_NAME_XENDIT,
            PaymentGatewayConfig::isProductionModeActive()
        );
        if ($this->config) {
            $this->apiKey = trim((string) ($this->config['api_key'] ?? ''));
            if ($this->apiKey === '') {
                $fallback = trim((string) (getenv('XENDIT_SECRET_KEY') ?: ''));
                if ($fallback !== '') {
                    $this->apiKey = $fallback;
                }
            }
        }
        $this->apiBaseUrl = PaymentGatewayConfig::getXenditApiBaseUrl();
    }

    public function isConfigured(): bool
    {
        return $this->apiKey !== '' && $this->apiBaseUrl !== '';
    }

    public function getConfig(): array
    {
        return $this->config ?? [];
    }

    public function verifyCallbackToken(?string $tokenHeader): bool
    {
        $globalConfig = $GLOBALS['config'] ?? [];
        $verify = $globalConfig['xendit_callback']['verify_token'] ?? true;
        if (!$verify) {
            return true;
        }
        $expected = trim((string) ($this->config['api_secret'] ?? ''));
        if ($expected === '') {
            return false;
        }

        return hash_equals($expected, trim((string) ($tokenHeader ?? '')));
    }

    /**
     * Map metode + channel internal ke channel_code Xendit.
     */
    public function resolveChannelCode(string $paymentMethod, string $paymentChannel): ?string
    {
        $pm = strtolower(trim($paymentMethod));
        $ch = strtolower(trim($paymentChannel));
        if ($pm === 'qris') {
            return 'QRIS';
        }
        if ($pm === 'cstore') {
            $aliases = ['alfa' => 'alfamart', 'indo' => 'indomaret'];
            $ch = $aliases[$ch] ?? $ch;

            return self::CSTORE_CHANNEL_MAP[$ch] ?? null;
        }
        if ($pm === 'va') {
            return self::VA_CHANNEL_MAP[$ch] ?? null;
        }
        if ($pm === 'ewallet') {
            return self::EWALLET_CHANNEL_MAP[$ch] ?? null;
        }

        return null;
    }

    /**
     * @return list<string>
     */
    public static function listEwalletChannelKeys(): array
    {
        return array_keys(self::EWALLET_CHANNEL_MAP);
    }

    public function createPayment(array $paymentData): array
    {
        if (!$this->isConfigured()) {
            return ['success' => false, 'message' => 'Xendit belum dikonfigurasi (API Secret Key)'];
        }

        $amount = (int) round((float) ($paymentData['amount'] ?? 0));
        if ($amount < 10000) {
            return ['success' => false, 'message' => 'Nominal minimal Rp 10.000 untuk Xendit'];
        }

        $paymentMethod = $paymentData['payment_method'] ?? 'va';
        $paymentChannel = $paymentData['payment_channel'] ?? '';
        $channelCode = $this->resolveChannelCode($paymentMethod, $paymentChannel);
        if ($channelCode === null) {
            return [
                'success' => false,
                'message' => 'Channel pembayaran tidak didukung Xendit: ' . $paymentMethod . '/' . $paymentChannel,
            ];
        }

        $referenceId = $paymentData['reference_id'] ?? ('XDT-' . time());
        $pmLower = strtolower(trim($paymentMethod));
        $returnUrl = trim((string) ($paymentData['return_url'] ?? ''));
        $cancelUrl = trim((string) ($paymentData['cancel_url'] ?? $returnUrl));

        $channelProperties = [];
        if ($returnUrl !== '') {
            $channelProperties['success_return_url'] = $returnUrl;
            $channelProperties['failure_return_url'] = $cancelUrl !== '' ? $cancelUrl : $returnUrl;
        }

        if ($pmLower === 'ewallet' && $returnUrl === '') {
            return [
                'success' => false,
                'message' => 'URL kembali (return_url) wajib untuk pembayaran e-wallet Xendit',
            ];
        }

        $expiredHours = (int) ($this->config['expired'] ?? 24);
        if ($expiredHours > 0 && $pmLower !== 'ewallet') {
            $channelProperties['expires_at'] = gmdate('Y-m-d\TH:i:s\Z', time() + $expiredHours * 3600);
        }

        $payload = [
            'reference_id' => $referenceId,
            'type' => 'PAY',
            'country' => 'ID',
            'currency' => 'IDR',
            'request_amount' => $amount,
            'capture_method' => 'AUTOMATIC',
            'channel_code' => $channelCode,
            'channel_properties' => (object) $channelProperties,
            'description' => $paymentData['comments'] ?? $paymentData['description'] ?? 'Pembayaran',
            'metadata' => [
                'payment_method' => $paymentMethod,
                'payment_channel' => $paymentChannel,
            ],
        ];

        if (!empty($paymentData['name'])) {
            $payload['metadata']['customer_name'] = $paymentData['name'];
        }

        if ($pmLower === 'ewallet' && $channelCode === 'OVO') {
            $mobile = $this->formatPhoneE164((string) ($paymentData['phone'] ?? ''));
            if ($mobile === '') {
                return ['success' => false, 'message' => 'Nomor HP/WA wajib untuk pembayaran OVO (format internasional)'];
            }
            $givenNames = trim((string) ($paymentData['name'] ?? 'Pembayar'));
            if ($givenNames === '') {
                $givenNames = 'Pembayar';
            }
            $payload['customer'] = [
                'type' => 'INDIVIDUAL',
                'reference_id' => 'mbd-' . preg_replace('/[^a-zA-Z0-9]/', '', $referenceId),
                'individual_detail' => ['given_names' => $givenNames],
                'email' => trim((string) ($paymentData['email'] ?? '')) ?: null,
                'mobile_number' => $mobile,
            ];
            if ($payload['customer']['email'] === null) {
                unset($payload['customer']['email']);
            }
        }

        PaymentGatewayLogger::logRequest(null, 'v3/payment_requests', 'POST', $payload);
        $response = $this->makeRequest('v3/payment_requests', 'POST', $payload);

        if (!$response['success']) {
            return $response;
        }

        $body = $response['data'] ?? [];
        $normalized = $this->normalizePaymentRequestResponse($body, $paymentMethod);

        return [
            'success' => true,
            'data' => $normalized,
            'raw' => $body,
        ];
    }

    public function checkPaymentStatus(string $paymentRequestId): array
    {
        if (!$this->isConfigured()) {
            return ['success' => false, 'message' => 'Xendit belum dikonfigurasi'];
        }

        $path = 'v3/payment_requests/' . rawurlencode($paymentRequestId);
        PaymentGatewayLogger::logRequest(null, $path, 'GET', []);
        $response = $this->makeRequest($path, 'GET', []);

        if (!$response['success']) {
            return $response;
        }

        $body = $response['data'] ?? [];
        $pm = $body['metadata']['payment_method'] ?? 'va';

        return [
            'success' => true,
            'data' => $this->normalizePaymentRequestResponse($body, (string) $pm),
        ];
    }

    /**
     * @return array{success:bool, data?:array, message?:string, http_code?:int}
     */
    private function makeRequest(string $path, string $method, array $data): array
    {
        $url = rtrim($this->apiBaseUrl, '/') . '/' . ltrim($path, '/');
        $ch = curl_init();
        $headers = [
            'Content-Type: application/json',
            'api-version: 2024-11-11',
        ];
        $auth = base64_encode($this->apiKey . ':');
        $headers[] = 'Authorization: Basic ' . $auth;

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);

        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data, JSON_UNESCAPED_UNICODE));
        } elseif ($method !== 'GET') {
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
            if ($data !== []) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data, JSON_UNESCAPED_UNICODE));
            }
        }

        $raw = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($curlError) {
            return ['success' => false, 'message' => 'Koneksi Xendit gagal: ' . $curlError, 'http_code' => $httpCode];
        }

        $decoded = json_decode((string) $raw, true);
        if (!is_array($decoded)) {
            return ['success' => false, 'message' => 'Respons Xendit tidak valid', 'http_code' => $httpCode];
        }

        if ($httpCode < 200 || $httpCode >= 300) {
            $msg = $decoded['message'] ?? $decoded['error_code'] ?? 'Error Xendit HTTP ' . $httpCode;

            return ['success' => false, 'message' => (string) $msg, 'data' => $decoded, 'http_code' => $httpCode];
        }

        return ['success' => true, 'data' => $decoded, 'http_code' => $httpCode];
    }

    /**
     * Normalisasi ke format yang dipakai PaymentTransactionController (mirip iPayMu).
     *
     * @return array<string, mixed>
     */
    public function normalizePaymentRequestResponse(array $body, string $paymentMethod): array
    {
        $sessionId = $body['payment_request_id'] ?? $body['id'] ?? null;
        $status = $this->mapXenditStatus($body['status'] ?? '');
        $vaNumber = null;
        $qrCode = null;
        $paymentUrl = null;

        $actions = $body['actions'] ?? [];
        if (is_array($actions)) {
            foreach ($actions as $action) {
                if (!is_array($action)) {
                    continue;
                }
                $descriptor = $action['descriptor'] ?? '';
                $value = $action['value'] ?? '';
                if ($descriptor === 'VIRTUAL_ACCOUNT_NUMBER' && $value !== '') {
                    $vaNumber = (string) $value;
                }
                if (in_array($descriptor, ['QR_STRING', 'QR_CODE', 'QRIS_STRING'], true) && $value !== '') {
                    $qrCode = (string) $value;
                }
                if (in_array($descriptor, ['WEB_URL', 'DEEPLINK_URL'], true) && $value !== '') {
                    $paymentUrl = (string) $value;
                }
            }
        }

        $cp = $body['channel_properties'] ?? [];
        if (is_array($cp)) {
            if (!$vaNumber && !empty($cp['virtual_account_number'])) {
                $vaNumber = (string) $cp['virtual_account_number'];
            }
            if (!$qrCode && !empty($cp['qr_string'])) {
                $qrCode = (string) $cp['qr_string'];
            }
        }

        if (strtolower($paymentMethod) === 'qris' && !$qrCode && $paymentUrl) {
            $qrCode = $paymentUrl;
        }

        $expiredAt = null;
        if (!empty($body['expires_at'])) {
            try {
                $expiredAt = date('Y-m-d H:i:s', strtotime((string) $body['expires_at']));
            } catch (\Exception $e) {
                $expiredAt = null;
            }
        } elseif (!empty($cp['expires_at'])) {
            try {
                $expiredAt = date('Y-m-d H:i:s', strtotime((string) $cp['expires_at']));
            } catch (\Exception $e) {
                $expiredAt = null;
            }
        }

        return [
            'session_id' => $sessionId,
            'transaction_id' => $sessionId,
            'status' => $status,
            'va_number' => $vaNumber,
            'qr_code' => $qrCode,
            'payment_url' => $paymentUrl,
            'expired_at' => $expiredAt,
            'reference_id' => $body['reference_id'] ?? null,
            'fee' => isset($body['fee_amount']) ? (float) $body['fee_amount'] : null,
            'total' => isset($body['request_amount']) ? (float) $body['request_amount'] : null,
            'raw' => $body,
        ];
    }

    private function formatPhoneE164(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone);
        if ($digits === '') {
            return '';
        }
        if (strpos($digits, '0') === 0) {
            $digits = '62' . substr($digits, 1);
        } elseif (strpos($digits, '62') !== 0) {
            $digits = '62' . $digits;
        }

        return '+' . $digits;
    }

    public function mapXenditStatus(string $xenditStatus): string
    {
        $map = [
            'REQUIRES_ACTION' => 'pending',
            'PENDING' => 'pending',
            'ACTIVE' => 'pending',
            'SUCCEEDED' => 'paid',
            'SUCCESS' => 'paid',
            'PAID' => 'paid',
            'COMPLETED' => 'paid',
            'SETTLED' => 'paid',
            'FAILED' => 'failed',
            'EXPIRED' => 'expired',
            'CANCELED' => 'cancelled',
            'CANCELLED' => 'cancelled',
        ];
        $key = strtoupper(trim($xenditStatus));

        return $map[$key] ?? 'pending';
    }

    /**
     * Parse body webhook (POST JSON dari Xendit / Postman).
     */
    public static function decodeCallbackBody(Request $request, ?string $rawBody = null): ?array
    {
        $raw = $rawBody ?? (string) $request->getBody()->getContents();
        $raw = trim($raw);
        if ($raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }

        $parsed = $request->getParsedBody();
        if (is_array($parsed) && $parsed !== []) {
            return $parsed;
        }
        if (is_string($parsed) && trim($parsed) !== '') {
            $decoded = json_decode(trim($parsed), true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }

        return null;
    }

    /**
     * Normalisasi berbagai format webhook Xendit (Payment Request v3, payment.capture, Fixed VA, dll.).
     *
     * @return array{event:?string,data:array,session_id:?string,reference_id:?string,trx_id:?string,status_raw:string,va_number:?string,is_payment_event:bool}
     */
    private function normalizeWebhookPayload(array $payload): array
    {
        $event = isset($payload['event']) ? (string) $payload['event'] : null;
        $data = $payload;
        if (isset($payload['data']) && is_array($payload['data'])) {
            $data = $payload['data'];
        }

        $sessionId = $data['payment_request_id'] ?? $payload['payment_request_id'] ?? null;
        if ($sessionId === null && isset($data['id']) && is_string($data['id']) && str_starts_with($data['id'], 'pr-')) {
            $sessionId = $data['id'];
        }

        $referenceId = $data['reference_id']
            ?? $data['external_id']
            ?? $payload['reference_id']
            ?? $payload['external_id']
            ?? null;

        $trxId = $data['payment_id']
            ?? $data['capture_id']
            ?? $payload['payment_id']
            ?? $payload['capture_id']
            ?? null;
        if ($trxId === null && isset($data['id']) && is_string($data['id']) && !str_starts_with($data['id'], 'pr-')) {
            $trxId = $data['id'];
        }

        $statusRaw = (string) ($data['status'] ?? $payload['status'] ?? '');
        $vaNumber = $data['account_number'] ?? $data['virtual_account_number'] ?? $payload['account_number'] ?? null;

        $statusUpper = strtoupper($statusRaw);
        $paidStatuses = ['PAID', 'SUCCEEDED', 'SUCCESS', 'COMPLETED', 'SETTLED'];
        $isPaidStatus = in_array($statusUpper, $paidStatuses, true);
        $eventLower = strtolower((string) $event);
        $eventImpliesPayment = $event !== null
            && (strpos($eventLower, 'payment') !== false || strpos($eventLower, 'capture') !== false);

        $isFixedVaOnly = $vaNumber !== null
            && in_array($statusUpper, ['ACTIVE', 'INACTIVE'], true)
            && !$isPaidStatus;

        $isPaymentEvent = ($isPaidStatus || $eventImpliesPayment) && !$isFixedVaOnly;

        return [
            'event' => $event,
            'data' => $data,
            'session_id' => $sessionId,
            'reference_id' => $referenceId,
            'trx_id' => $trxId,
            'status_raw' => $statusRaw,
            'va_number' => $vaNumber,
            'is_payment_event' => $isPaymentEvent && !$isFixedVaOnly,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function findTransactionForWebhook(array $norm): ?array
    {
        if (!empty($norm['session_id'])) {
            $stmt = $this->db->prepare(
                'SELECT id, status, id_payment, session_id FROM payment___transaction WHERE session_id = ? LIMIT 1'
            );
            $stmt->execute([$norm['session_id']]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row) {
                return $row;
            }
        }

        if (!empty($norm['reference_id'])) {
            $stmt = $this->db->prepare(
                'SELECT id, status, id_payment, session_id FROM payment___transaction WHERE reference_id = ? ORDER BY id DESC LIMIT 1'
            );
            $stmt->execute([$norm['reference_id']]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row) {
                return $row;
            }
        }

        if (!empty($norm['va_number'])) {
            $stmt = $this->db->prepare(
                "SELECT id, status, id_payment, session_id FROM payment___transaction
                 WHERE va_number = ? AND gateway_provider = 'xendit' ORDER BY id DESC LIMIT 1"
            );
            $stmt->execute([$norm['va_number']]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row) {
                return $row;
            }
        }

        return null;
    }

    /**
     * Webhook Xendit (payment.capture / payment_request.* / tes Fixed VA dari dashboard).
     */
    public function processCallback(array $callbackData): array
    {
        try {
            $norm = $this->normalizeWebhookPayload($callbackData);
            $sessionId = $norm['session_id'];
            $referenceId = $norm['reference_id'];
            $trxId = $norm['trx_id'];
            $statusRaw = $norm['status_raw'];
            $normalizedStatus = $this->mapXenditStatus($statusRaw);

            if (!$norm['is_payment_event']) {
                try {
                    PaymentGatewayLogger::logCallback(null, $callbackData);
                } catch (\Exception $e) {
                    // non-fatal
                }

                return [
                    'success' => true,
                    'message' => 'Webhook diterima (bukan event pembayaran masuk, mis. Fixed VA status '
                        . ($statusRaw !== '' ? $statusRaw : 'N/A') . '). Integrasi myBeddian memakai Payment Request v3.',
                    'http_code' => 200,
                ];
            }

            if ($sessionId !== null && $sessionId !== '' && $trxId !== null && $trxId !== '') {
                $stmt = $this->db->prepare(
                    'SELECT id FROM payment___callback WHERE session_id = ? AND trx_id = ? LIMIT 1'
                );
                $stmt->execute([$sessionId, $trxId]);
                $existing = $stmt->fetch(\PDO::FETCH_ASSOC);
                if ($existing) {
                    return [
                        'success' => true,
                        'callback_id' => (int) $existing['id'],
                        'message' => 'Callback sudah diproses (idempotent)',
                        'http_code' => 200,
                    ];
                }
            }

            try {
                PaymentGatewayLogger::logCallback(null, $callbackData);
            } catch (\Exception $e) {
                error_log('XenditService::processCallback logger: ' . $e->getMessage());
            }

            $data = $norm['data'];
            $paidAt = null;
            if (!empty($data['updated'])) {
                try {
                    $paidAt = date('Y-m-d H:i:s', strtotime((string) $data['updated']));
                } catch (\Exception $e) {
                    $paidAt = null;
                }
            } elseif (!empty($data['created'])) {
                try {
                    $paidAt = date('Y-m-d H:i:s', strtotime((string) $data['created']));
                } catch (\Exception $e) {
                    $paidAt = null;
                }
            }

            $amount = isset($data['request_amount']) ? (float) $data['request_amount'] : (isset($data['amount']) ? (float) $data['amount'] : null);
            $paymentMethod = $data['metadata']['payment_method'] ?? null;
            $paymentChannel = $data['metadata']['payment_channel'] ?? null;

            $sql = 'INSERT INTO payment___callback (
                session_id, trx_id, reference_id, status, status_code, status_message,
                amount, payment_method, payment_channel, paid_at, raw_data,
                ip_address, user_agent
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                $sessionId,
                $trxId,
                $referenceId,
                $normalizedStatus,
                $statusRaw,
                $norm['event'],
                $amount,
                $paymentMethod,
                $paymentChannel,
                $paidAt,
                json_encode($callbackData, JSON_UNESCAPED_UNICODE),
                $_SERVER['REMOTE_ADDR'] ?? null,
                $_SERVER['HTTP_USER_AGENT'] ?? null,
            ]);
            $callbackId = (int) $this->db->lastInsertId();

            $transaction = $this->findTransactionForWebhook($norm);
            if ($transaction) {
                $this->updateTransactionFromCallback((int) $transaction['id'], $normalizedStatus, $callbackData);
                $msg = $normalizedStatus === 'paid'
                    ? 'Pembayaran tercatat (paid)'
                    : 'Callback pembayaran diproses (status: ' . $normalizedStatus . ')';

                return [
                    'success' => true,
                    'callback_id' => $callbackId,
                    'message' => $msg,
                    'http_code' => 200,
                ];
            }

            return [
                'success' => true,
                'callback_id' => $callbackId,
                'message' => 'Callback disimpan; transaksi lokal tidak ditemukan (session_id/reference_id/va).',
                'http_code' => 200,
            ];
        } catch (\Exception $e) {
            error_log('XenditService::processCallback error: ' . $e->getMessage());

            return ['success' => false, 'message' => 'Gagal memproses callback Xendit', 'http_code' => 500];
        }
    }

    private function updateTransactionFromCallback(int $transactionId, string $status, array $callbackData): void
    {
        $stmt = $this->db->prepare('SELECT id, status, id_payment FROM payment___transaction WHERE id = ? LIMIT 1');
        $stmt->execute([$transactionId]);
        $transaction = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$transaction) {
            return;
        }

        $currentStatus = $transaction['status'] ?? 'pending';

        if ($currentStatus === 'paid') {
            $this->db->prepare('UPDATE payment___transaction SET notify_data = ? WHERE id = ?')
                ->execute([json_encode($callbackData, JSON_UNESCAPED_UNICODE), $transactionId]);

            return;
        }

        if (in_array($currentStatus, ['expired', 'failed', 'cancelled'], true) && $status !== 'paid') {
            $this->db->prepare('UPDATE payment___transaction SET notify_data = ? WHERE id = ?')
                ->execute([json_encode($callbackData, JSON_UNESCAPED_UNICODE), $transactionId]);

            return;
        }

        $paidAt = ($status === 'paid') ? date('Y-m-d H:i:s') : null;
        $this->db->prepare(
            'UPDATE payment___transaction SET status = ?, paid_at = COALESCE(?, paid_at), notify_data = ?, tanggal_update = NOW() WHERE id = ?'
        )->execute([
            $status,
            $paidAt,
            json_encode($callbackData, JSON_UNESCAPED_UNICODE),
            $transactionId,
        ]);

        if ($status === 'paid') {
            PaymentGatewaySettlementHelper::completePaidSettlement($transactionId);
        }
    }

    public function updatePaymentStatusFromTransaction(int $idPayment): void
    {
        $stmt = $this->db->prepare(
            "SELECT id FROM payment___transaction WHERE id_payment = ? AND status = 'paid' ORDER BY id DESC LIMIT 1"
        );
        $stmt->execute([$idPayment]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($row) {
            PaymentGatewaySettlementHelper::completePaidSettlement((int) $row['id']);
        }
    }
}
