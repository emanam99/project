<?php

namespace App\Controllers;

use App\Config\Database;
use App\Services\SppgService;
use App\Services\XenditService;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class SubscriptionCronController
{
    private PDO $db;
    private XenditService $xendit;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->xendit = new XenditService();
    }

    private function json(Response $response, array $payload, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }

    private function verifyKey(Request $request): bool
    {
        $expected = trim((string) ($_ENV['SUBSCRIPTION_CRON_KEY'] ?? $_ENV['BNI_CRON_KEY'] ?? ''));
        if ($expected === '') {
            return false;
        }
        $params = $request->getQueryParams();
        $key = (string) ($params['key'] ?? $request->getHeaderLine('X-Cron-Key'));
        return hash_equals($expected, $key);
    }

    /** GET/POST /cron/subscription-renewal?key= */
    public function renewal(Request $request, Response $response): Response
    {
        if (!$this->verifyKey($request)) {
            return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
        }

        if (!$this->xendit->isConfigured()) {
            return $this->json($response, ['success' => false, 'message' => 'Xendit belum dikonfigurasi'], 503);
        }

        $stmt = $this->db->query(
            "SELECT s.*, sp.email_kontak, u.email AS admin_email
             FROM sppg_subscriptions s
             INNER JOIN sppg sp ON sp.id = s.sppg_id
             LEFT JOIN users u ON u.sppg_id = s.sppg_id AND u.role = 'super_admin'
             WHERE s.status IN ('active', 'past_due')
               AND s.period_end IS NOT NULL
               AND s.period_end <= DATE_ADD(NOW(), INTERVAL 7 DAY)
             GROUP BY s.id"
        );
        $rows = $stmt->fetchAll();
        $processed = 0;

        foreach ($rows as $sub) {
            $email = (string) ($sub['admin_email'] ?? $sub['email_kontak'] ?? '');
            if ($email === '') {
                continue;
            }
            try {
                $this->xendit->createSubscriptionInvoice(
                    (int) $sub['sppg_id'],
                    (int) $sub['id'],
                    (float) $sub['amount'],
                    $email,
                    'Perpanjangan langganan SPPG'
                );
                $this->db->prepare(
                    'UPDATE sppg_subscriptions SET status = \'past_due\' WHERE id = ?'
                )->execute([(int) $sub['id']]);
                $processed++;
            } catch (\Throwable $e) {
                // lanjut tenant berikutnya
            }
        }

        return $this->json($response, ['success' => true, 'data' => ['processed' => $processed]]);
    }
}
