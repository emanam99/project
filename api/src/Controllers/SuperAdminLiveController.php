<?php

declare(strict_types=1);

namespace App\Controllers;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Proxy backend untuk endpoint admin di server live (Socket.IO).
 *
 * Sebelumnya frontend memanggil `${LIVE_SERVER_URL}/admin/online?secret=...`
 * dengan `VITE_LIVE_ADMIN_SECRET` yang ikut ter-bundle di JavaScript publik.
 * Audit Mei 2026: pindahkan secret ke backend, frontend cukup JWT (super_admin).
 */
final class SuperAdminLiveController
{
    private function jsonResponse(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * GET /api/super-admin/live-online
     * Dilindungi AuthMiddleware + RoleMiddleware('super_admin') di routes.
     */
    public function getOnline(Request $request, Response $response): Response
    {
        $config = require __DIR__ . '/../../config.php';
        $liveCfg = is_array($config['live_server'] ?? null) ? $config['live_server'] : [];
        $base = (string) ($liveCfg['url'] ?? '');
        $secret = (string) ($liveCfg['admin_secret'] ?? '');

        if ($base === '') {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'LIVE_SERVER_URL belum di-set di server',
            ], 500);
        }

        $url = rtrim($base, '/') . '/admin/online';
        if ($secret !== '') {
            $url .= '?secret=' . rawurlencode($secret);
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
            ],
        ]);

        $body = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($body === false) {
            error_log('SuperAdminLiveController::getOnline curl error: ' . $curlErr);
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Server live tidak dapat dihubungi',
            ], 502);
        }

        if ($httpCode < 200 || $httpCode >= 300) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Server live mengembalikan status ' . $httpCode,
            ], $httpCode === 401 ? 401 : 502);
        }

        $decoded = json_decode((string) $body, true);
        if (!is_array($decoded)) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Respons server live tidak valid',
            ], 502);
        }

        return $this->jsonResponse($response, $decoded, 200);
    }
}
