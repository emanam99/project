<?php

namespace App\Services;

use App\Config\Database;
use PDO;

class XenditService
{
    private PDO $db;
    private string $secretKey;
    private string $callbackToken;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->secretKey = trim((string) ($_ENV['XENDIT_SECRET_KEY'] ?? ''));
        $this->callbackToken = trim((string) ($_ENV['XENDIT_CALLBACK_TOKEN'] ?? ''));
    }

    public function isConfigured(): bool
    {
        return $this->secretKey !== '';
    }

    public function verifyCallbackToken(?string $token): bool
    {
        if ($this->callbackToken === '') {
            return false;
        }
        return hash_equals($this->callbackToken, (string) $token);
    }

    /**
     * @return array{invoice_id:string,external_id:string,invoice_url:string,amount:float,status:string}
     */
    public function createSubscriptionInvoice(int $sppgId, int $subscriptionId, float $amount, string $payerEmail, string $description): array
    {
        if (!$this->isConfigured()) {
            throw new \RuntimeException('Xendit belum dikonfigurasi');
        }

        $period = date('Ym');
        $externalId = 'sppg-' . $sppgId . '-' . $period . '-' . bin2hex(random_bytes(4));

        $payload = [
            'external_id' => $externalId,
            'amount' => (int) round($amount),
            'payer_email' => $payerEmail,
            'description' => $description,
            'invoice_duration' => 86400 * 3,
            'currency' => 'IDR',
            'items' => [
                [
                    'name' => 'Langganan SPPG bulanan',
                    'quantity' => 1,
                    'price' => (int) round($amount),
                ],
            ],
        ];

        $response = $this->httpPostJson('https://api.xendit.co/v2/invoices', $payload);

        if (empty($response['id'])) {
            $msg = (string) ($response['message'] ?? 'Gagal membuat invoice Xendit');
            throw new \RuntimeException($msg);
        }

        $invoiceId = (string) $response['id'];
        $invoiceUrl = (string) ($response['invoice_url'] ?? '');

        $ins = $this->db->prepare(
            'INSERT INTO sppg_subscription_payments
             (sppg_id, subscription_id, amount, currency, status, xendit_invoice_id, xendit_external_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $ins->execute([
            $sppgId,
            $subscriptionId,
            $amount,
            'IDR',
            'pending',
            $invoiceId,
            $externalId,
        ]);

        $upd = $this->db->prepare(
            'UPDATE sppg_subscriptions
             SET xendit_invoice_id = ?, xendit_external_id = ?, xendit_invoice_url = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?'
        );
        $upd->execute([$invoiceId, $externalId, $invoiceUrl, $subscriptionId]);

        return [
            'invoice_id' => $invoiceId,
            'external_id' => $externalId,
            'invoice_url' => $invoiceUrl,
            'amount' => $amount,
            'status' => (string) ($response['status'] ?? 'PENDING'),
        ];
    }

    public function handleInvoiceWebhook(array $payload): void
    {
        $status = strtoupper((string) ($payload['status'] ?? ''));
        $invoiceId = (string) ($payload['id'] ?? '');
        $externalId = (string) ($payload['external_id'] ?? '');

        if ($invoiceId === '' && $externalId === '') {
            return;
        }

        $stmt = $this->db->prepare(
            'SELECT p.*, s.id AS sub_id
             FROM sppg_subscription_payments p
             LEFT JOIN sppg_subscriptions s ON s.id = p.subscription_id
             WHERE (p.xendit_invoice_id = ? AND ? <> \'\') OR (p.xendit_external_id = ? AND ? <> \'\')
             ORDER BY p.id DESC
             LIMIT 1'
        );
        $stmt->execute([$invoiceId, $invoiceId, $externalId, $externalId]);
        $payment = $stmt->fetch();
        if (!$payment) {
            return;
        }

        $payStatus = in_array($status, ['PAID', 'SETTLED'], true) ? 'paid' : strtolower($status ?: 'pending');
        $updPay = $this->db->prepare(
            'UPDATE sppg_subscription_payments
             SET status = ?, paid_at = IF(? = \'paid\', NOW(), paid_at), raw_payload = ?, xendit_invoice_id = COALESCE(NULLIF(xendit_invoice_id, \'\'), ?)
             WHERE id = ?'
        );
        $updPay->execute([
            $payStatus,
            $payStatus,
            json_encode($payload, JSON_UNESCAPED_UNICODE),
            $invoiceId,
            $payment['id'],
        ]);

        if (!in_array($status, ['PAID', 'SETTLED'], true)) {
            return;
        }

        $sppgId = (int) $payment['sppg_id'];
        $subId = (int) ($payment['subscription_id'] ?? $payment['sub_id'] ?? 0);

        $periodStart = date('Y-m-d H:i:s');
        $periodEnd = date('Y-m-d H:i:s', strtotime('+1 month'));

        if ($subId > 0) {
            $updSub = $this->db->prepare(
                'UPDATE sppg_subscriptions
                 SET status = \'active\', period_start = ?, period_end = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?'
            );
            $updSub->execute([$periodStart, $periodEnd, $subId]);
        }

        $updSppg = $this->db->prepare(
            'UPDATE sppg SET status = \'active\', updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        );
        $updSppg->execute([$sppgId]);
    }

    private function httpPostJson(string $url, array $payload): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Basic ' . base64_encode($this->secretKey . ':'),
            ],
            CURLOPT_TIMEOUT => 30,
        ]);
        $body = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);
        if ($body === false) {
            throw new \RuntimeException('HTTP error: ' . $err);
        }
        $data = json_decode($body, true);
        return is_array($data) ? $data : [];
    }
}
