<?php

namespace App\Controllers;

use App\Helpers\PlatformAdminHelper;
use App\Helpers\TenantHostHelper;
use App\Services\SppgService;
use App\Services\SubdomainProvisioner;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class PlatformAdminController
{
    private function json(Response $response, array $payload, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }

    /** GET /platform/dashboard */
    public function dashboard(Request $request, Response $response): Response
    {
        $pdo = PlatformAdminHelper::pdo();
        $tenants = (int) $pdo->query('SELECT COUNT(*) FROM sppg')->fetchColumn();
        $activeSubs = (int) $pdo->query(
            "SELECT COUNT(*) FROM sppg_subscriptions WHERE status = 'active'"
        )->fetchColumn();
        $pastDue = (int) $pdo->query(
            "SELECT COUNT(*) FROM sppg_subscriptions WHERE status IN ('past_due', 'pending_payment')"
        )->fetchColumn();
        $pendingDns = (int) $pdo->query(
            "SELECT COUNT(*) FROM sppg WHERE status = 'pending_dns'"
        )->fetchColumn();
        $revenueMonth = (float) $pdo->query(
            "SELECT COALESCE(SUM(amount), 0) FROM sppg_subscription_payments
             WHERE status = 'paid' AND paid_at >= DATE_FORMAT(NOW(), '%Y-%m-01')"
        )->fetchColumn();

        return $this->json($response, [
            'success' => true,
            'data' => [
                'tenants_total' => $tenants,
                'subscriptions_active' => $activeSubs,
                'subscriptions_attention' => $pastDue,
                'tenants_pending_dns' => $pendingDns,
                'revenue_month' => $revenueMonth,
            ],
        ]);
    }

    /** GET /platform/tenants */
    public function tenants(Request $request, Response $response): Response
    {
        $params = $request->getQueryParams();
        $status = trim((string) ($params['status'] ?? ''));
        $q = trim((string) ($params['q'] ?? ''));

        $sql = 'SELECT s.*, sub.status AS sub_status, sub.period_end
                FROM sppg s
                LEFT JOIN sppg_subscriptions sub ON sub.id = (
                    SELECT id FROM sppg_subscriptions WHERE sppg_id = s.id ORDER BY id DESC LIMIT 1
                )
                WHERE 1=1';
        $bind = [];
        if ($status !== '') {
            $sql .= ' AND s.status = ?';
            $bind[] = $status;
        }
        if ($q !== '') {
            $sql .= ' AND (s.nama_unit LIKE ? OR s.subdomain LIKE ? OR s.public_id LIKE ? OR s.email_kontak LIKE ?)';
            $like = '%' . $q . '%';
            array_push($bind, $like, $like, $like, $like);
        }
        $sql .= ' ORDER BY s.id DESC LIMIT 200';

        $stmt = PlatformAdminHelper::pdo()->prepare($sql);
        $stmt->execute($bind);
        $rows = $stmt->fetchAll() ?: [];
        $sppg = new SppgService();

        $items = array_map(static function (array $row) use ($sppg) {
            $profile = $sppg->publicProfile($row);
            $profile['subscription_status'] = $row['sub_status'] ?? null;
            $profile['period_end'] = $row['period_end'] ?? null;
            return $profile;
        }, $rows);

        return $this->json($response, ['success' => true, 'data' => ['items' => $items]]);
    }

    /** GET /platform/tenants/{id} */
    public function tenantDetail(Request $request, Response $response, array $args): Response
    {
        $id = (int) ($args['id'] ?? 0);
        $sppg = new SppgService();
        $row = $sppg->findById($id);
        if (!$row) {
            return $this->json($response, ['success' => false, 'message' => 'Tenant tidak ditemukan'], 404);
        }

        $pdo = PlatformAdminHelper::pdo();
        $users = $pdo->prepare(
            'SELECT id, email, name, role, created_at FROM users WHERE sppg_id = ? ORDER BY id ASC'
        );
        $users->execute([$id]);
        $sub = $sppg->getActiveSubscription($id);
        $payments = $sppg->getPaymentHistory($id, 20);

        return $this->json($response, [
            'success' => true,
            'data' => [
                'sppg' => $sppg->publicProfile($row),
                'subscription' => $sppg->publicSubscription($sub),
                'users' => $users->fetchAll() ?: [],
                'payments' => $payments,
            ],
        ]);
    }

    /** PATCH /platform/tenants/{id} */
    public function updateTenant(Request $request, Response $response, array $args): Response
    {
        $id = (int) ($args['id'] ?? 0);
        $sppgService = new SppgService();
        $row = $sppgService->findById($id);
        if (!$row) {
            return $this->json($response, ['success' => false, 'message' => 'Tenant tidak ditemukan'], 404);
        }

        $body = json_decode((string) $request->getBody(), true);
        $body = is_array($body) ? $body : [];
        $status = trim((string) ($body['status'] ?? ''));
        $allowed = ['pending_payment', 'pending_dns', 'active', 'suspended', 'cancelled'];
        if (!in_array($status, $allowed, true)) {
            return $this->json($response, ['success' => false, 'message' => 'Status tidak valid'], 422);
        }

        $upd = PlatformAdminHelper::pdo()->prepare(
            'UPDATE sppg SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        );
        $upd->execute([$status, $id]);

        return $this->json($response, [
            'success' => true,
            'data' => ['sppg' => $sppgService->publicProfile($sppgService->findById($id) ?? $row)],
        ]);
    }

    /** POST /platform/tenants/{id}/retry-dns */
    public function retryDns(Request $request, Response $response, array $args): Response
    {
        $id = (int) ($args['id'] ?? 0);
        $sppgService = new SppgService();
        $row = $sppgService->findById($id);
        if (!$row || empty($row['subdomain'])) {
            return $this->json($response, ['success' => false, 'message' => 'Tenant/subdomain tidak ditemukan'], 404);
        }

        $provisioner = new SubdomainProvisioner();
        $result = $provisioner->provision((string) $row['subdomain']);
        if (!$result['success']) {
            return $this->json($response, ['success' => false, 'message' => $result['message']], 500);
        }

        $upd = PlatformAdminHelper::pdo()->prepare(
            "UPDATE sppg SET status = 'pending_payment', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending_dns'"
        );
        $upd->execute([$id]);

        return $this->json($response, [
            'success' => true,
            'message' => 'Subdomain diprovisikan ulang',
            'data' => ['sppg' => $sppgService->publicProfile($sppgService->findById($id) ?? $row)],
        ]);
    }

    /** GET /platform/subscriptions */
    public function subscriptions(Request $request, Response $response): Response
    {
        $status = trim((string) ($request->getQueryParams()['status'] ?? ''));
        $sql = 'SELECT sub.*, s.public_id, s.nama_unit, s.subdomain, s.status AS tenant_status
                FROM sppg_subscriptions sub
                INNER JOIN sppg s ON s.id = sub.sppg_id
                WHERE 1=1';
        $bind = [];
        if ($status !== '') {
            $sql .= ' AND sub.status = ?';
            $bind[] = $status;
        }
        $sql .= ' ORDER BY sub.id DESC LIMIT 300';
        $stmt = PlatformAdminHelper::pdo()->prepare($sql);
        $stmt->execute($bind);

        return $this->json($response, ['success' => true, 'data' => ['items' => $stmt->fetchAll() ?: []]]);
    }

    /** GET /platform/payments */
    public function payments(Request $request, Response $response): Response
    {
        $sppgId = (int) ($request->getQueryParams()['sppg_id'] ?? 0);
        $sql = 'SELECT p.*, s.public_id, s.nama_unit, s.subdomain
                FROM sppg_subscription_payments p
                INNER JOIN sppg s ON s.id = p.sppg_id
                WHERE 1=1';
        $bind = [];
        if ($sppgId > 0) {
            $sql .= ' AND p.sppg_id = ?';
            $bind[] = $sppgId;
        }
        $sql .= ' ORDER BY p.id DESC LIMIT 300';
        $stmt = PlatformAdminHelper::pdo()->prepare($sql);
        $stmt->execute($bind);

        return $this->json($response, ['success' => true, 'data' => ['items' => $stmt->fetchAll() ?: []]]);
    }
}
