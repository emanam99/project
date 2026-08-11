<?php

namespace App\Controllers;

use App\Auth\JwtAuth;
use App\Database;
use App\Helpers\LiveAppInstallActivityNotifier;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AppInstallActivityController
{
    private $db;
    private JwtAuth $jwt;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $this->jwt = new JwtAuth();
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    private function normalizeAppKey(string $appKey): string
    {
        $key = strtolower(trim($appKey));
        if ($key === 'mybeddian') {
            return 'mybeddien';
        }
        if ($key === 'nailul murod' || $key === 'nailul_murod' || $key === 'nailulmurod') {
            return 'nailul-murod';
        }
        return $key;
    }

    private function resolveAccessMode(array $payload): string
    {
        $mode = strtolower((string) ($payload['access_mode'] ?? ''));
        if ($mode === 'browser' || $mode === 'pwa') {
            return $mode;
        }
        $isPwa = filter_var($payload['is_pwa'] ?? false, FILTER_VALIDATE_BOOLEAN);
        return $isPwa ? 'pwa' : 'browser';
    }

    private function resolveEventType(array $payload): string
    {
        $eventType = strtolower(trim((string) ($payload['event_type'] ?? 'heartbeat')));
        if (in_array($eventType, ['heartbeat', 'install', 'open'], true)) {
            return $eventType;
        }
        return 'heartbeat';
    }

    private function isValidInstallId(string $installId): bool
    {
        if ($installId === '' || strlen($installId) > 128) {
            return false;
        }
        return (bool) preg_match('/^[a-zA-Z0-9._:-]+$/', $installId);
    }

    private function detectBrowserName(string $userAgent): string
    {
        $ua = strtolower($userAgent);
        if ($ua === '') {
            return 'Unknown';
        }
        if (strpos($ua, 'edg/') !== false) {
            return 'Edge';
        }
        if (strpos($ua, 'opr/') !== false || strpos($ua, 'opera') !== false) {
            return 'Opera';
        }
        if (strpos($ua, 'firefox/') !== false) {
            return 'Firefox';
        }
        if (strpos($ua, 'safari/') !== false && strpos($ua, 'chrome/') === false) {
            return 'Safari';
        }
        if (strpos($ua, 'chrome/') !== false || strpos($ua, 'crios/') !== false) {
            return 'Chrome';
        }
        return 'Unknown';
    }

    private function resolveUserIdFromBearer(Request $request): ?int
    {
        $authHeader = $request->getHeaderLine('Authorization');
        if (!$authHeader || !preg_match('/Bearer\s+(.+)$/i', $authHeader, $m)) {
            return null;
        }

        $payload = $this->jwt->validateToken(trim($m[1]));
        if (!is_array($payload)) {
            return null;
        }

        $usersId = (int) ($payload['users_id'] ?? 0);
        if ($usersId > 0) {
            return $usersId;
        }
        $userId = (int) ($payload['user_id'] ?? 0);
        return $userId > 0 ? $userId : null;
    }

    /**
     * POST /api/app-install-activity/track
     * Body JSON:
     * - app (required): ebeddien | mybeddien | nailul-murod
     * - install_id (required): id unik per instalasi/device
     * - access_mode (optional): browser|pwa
     * - is_pwa (optional): boolean
     * - browser_name (optional)
     * - user_agent (optional)
     */
    public function track(Request $request, Response $response): Response
    {
        try {
            $raw = (string) $request->getBody();
            $body = json_decode($raw, true);
            if (!is_array($body)) {
                $body = $request->getParsedBody();
            }
            if (!is_array($body)) {
                $body = [];
            }

            $appKeyInput = (string) ($body['app'] ?? '');
            $installId = trim((string) ($body['install_id'] ?? ''));

            if ($appKeyInput === '' || $installId === '') {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Field wajib: app, install_id',
                ], 400);
            }
            if (!$this->isValidInstallId($installId)) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'install_id tidak valid',
                ], 400);
            }

            $appKey = $this->normalizeAppKey($appKeyInput);
            $accessMode = $this->resolveAccessMode($body);
            $eventType = $this->resolveEventType($body);
            $userAgent = substr(trim((string) ($body['user_agent'] ?? $request->getHeaderLine('User-Agent'))), 0, 512);
            $browserName = substr(trim((string) ($body['browser_name'] ?? '')), 0, 64);
            $eventSource = substr(trim((string) ($body['event_source'] ?? 'web')), 0, 32);
            $screen = substr(trim((string) ($body['screen'] ?? '')), 0, 255);
            $appVersion = substr(trim((string) ($body['app_version'] ?? '')), 0, 32);
            if ($browserName === '') {
                $browserName = $this->detectBrowserName($userAgent);
            }

            $stmtApp = $this->db->prepare('SELECT id, `key`, label FROM app WHERE `key` = ? LIMIT 1');
            $stmtApp->execute([$appKey]);
            $appRow = $stmtApp->fetch(\PDO::FETCH_ASSOC);
            if (!$appRow) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'App tidak terdaftar',
                ], 404);
            }

            $idUser = $this->resolveUserIdFromBearer($request);

            $stmt = $this->db->prepare("
                INSERT INTO app___install_activity
                    (id_app, install_id, id_user, access_mode, browser_name, user_agent, installed_at, last_active_at)
                VALUES
                    (:id_app, :install_id, :id_user, :access_mode, :browser_name, :user_agent, NOW(), NOW())
                ON DUPLICATE KEY UPDATE
                    id_user = COALESCE(VALUES(id_user), id_user),
                    access_mode = VALUES(access_mode),
                    browser_name = VALUES(browser_name),
                    user_agent = VALUES(user_agent),
                    last_active_at = NOW()
            ");
            $stmt->execute([
                ':id_app' => (int) $appRow['id'],
                ':install_id' => $installId,
                ':id_user' => $idUser,
                ':access_mode' => $accessMode,
                ':browser_name' => $browserName,
                ':user_agent' => $userAgent !== '' ? $userAgent : null,
            ]);

            $installRowStmt = $this->db->prepare('SELECT id FROM app___install_activity WHERE id_app = ? AND install_id = ? LIMIT 1');
            $installRowStmt->execute([(int) $appRow['id'], $installId]);
            $installRow = $installRowStmt->fetch(\PDO::FETCH_ASSOC);
            $installActivityId = (int) ($installRow['id'] ?? 0);
            if ($installActivityId > 0) {
                try {
                    $eventStmt = $this->db->prepare("
                        INSERT INTO app___install_activity_event
                            (id_install_activity, id_app, id_user, event_type, event_source, screen, app_version, access_mode, browser_name, occurred_at)
                        VALUES
                            (:id_install_activity, :id_app, :id_user, :event_type, :event_source, :screen, :app_version, :access_mode, :browser_name, NOW())
                    ");
                    $eventStmt->execute([
                        ':id_install_activity' => $installActivityId,
                        ':id_app' => (int) $appRow['id'],
                        ':id_user' => $idUser,
                        ':event_type' => $eventType,
                        ':event_source' => $eventSource !== '' ? $eventSource : null,
                        ':screen' => $screen !== '' ? $screen : null,
                        ':app_version' => $appVersion !== '' ? $appVersion : null,
                        ':access_mode' => $accessMode,
                        ':browser_name' => $browserName !== '' ? $browserName : null,
                    ]);
                } catch (\Throwable $eventError) {
                    error_log('AppInstallActivityController::track event insert failed: ' . $eventError->getMessage());
                }
            }

            LiveAppInstallActivityNotifier::ping([
                'app_key' => (string) $appRow['key'],
                'install_id' => $installId,
                'id_user' => $idUser,
                'access_mode' => $accessMode,
                'browser_name' => $browserName,
                'last_active_at' => date('c'),
            ]);

            return $this->json($response, [
                'success' => true,
                'message' => 'Tracking aktivitas app tersimpan',
                'data' => [
                    'app' => $appRow['key'],
                    'app_label' => $appRow['label'],
                    'install_id' => $installId,
                    'id_user' => $idUser,
                    'access_mode' => $accessMode,
                    'event_type' => $eventType,
                    'browser_name' => $browserName,
                    'last_active_at' => date('Y-m-d H:i:s'),
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('AppInstallActivityController::track ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal menyimpan tracking app',
            ], 500);
        }
    }
}
