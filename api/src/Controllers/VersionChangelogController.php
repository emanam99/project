<?php

namespace App\Controllers;

use App\Auth\JwtAuth;
use App\Database;
use App\Helpers\RoleHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Changelog versi aplikasi (api, daftar, ebeddien).
 * Data dari tabel app_version_changelog (Phinx migrations + ChangelogVersionSeed).
 * Filter by role: jika request punya Bearer token valid, tampilkan entri yang role_id IS NULL atau role_id = role user.
 * Tanpa token: hanya entri yang role_id IS NULL (public).
 */
class VersionChangelogController
{
    private $db;
    private $jwt;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $this->jwt = new JwtAuth();
    }

    /**
     * GET /api/version/changelog?app=ebeddien
     * Query: app (optional) = api | daftar | ebeddien (alias legacy: uwaba). Kosong = semua.
     * Opsional: header Authorization Bearer <token> → filter by role user.
     */
    public function getChangelog(Request $request, Response $response): Response
    {
        $params = $request->getQueryParams();
        $app = isset($params['app']) ? trim($params['app']) : null;
        $isEbeddienRequest = $app === 'ebeddien' || $app === 'uwaba';

        $allowedApps = ['api', 'daftar', 'uwaba', 'ebeddien'];
        if ($app !== null && $app !== '') {
            if (!in_array($app, $allowedApps, true)) {
                $response->getBody()->write(json_encode([
                    'success' => false,
                    'message' => 'Parameter app harus salah satu: api, daftar, ebeddien'
                ], JSON_UNESCAPED_UNICODE));
                return $response->withStatus(400)
                    ->withHeader('Content-Type', 'application/json; charset=utf-8');
            }
        }

        $roleIds = [];
        $isSuperAdmin = false;
        $authHeader = $request->getHeaderLine('Authorization');
        if ($authHeader && preg_match('/Bearer\s+(.+)$/i', $authHeader, $m)) {
            $payload = $this->jwt->validateToken(trim($m[1]));
            if ($payload && is_array($payload)) {
                $isSuperAdmin = RoleHelper::tokenHasAnyRoleKey($payload, ['super_admin']);
                if (!$isSuperAdmin) {
                    $stmt = $this->db->prepare('SELECT id FROM role WHERE `key` = ? LIMIT 1');
                    $seen = [];
                    foreach (RoleHelper::normalizeTokenRoleKeysUnion($payload) as $rk) {
                        if ($rk === '' || $rk === 'multi_role') {
                            continue;
                        }
                        $stmt->execute([$rk]);
                        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                        if ($row && !empty($row['id'])) {
                            $seen[(int) $row['id']] = true;
                        }
                    }
                    $roleIds = array_keys($seen);
                }
            }
        }

        $rows = [];
        try {
            $sql = 'SELECT id, app, version, title, changelog, released_at, created_at 
                    FROM app_version_changelog';
            $where = [];
            $bind = [];
            if ($app !== null && $app !== '') {
                if ($isEbeddienRequest) {
                    $where[] = ' app IN (?, ?)';
                    $bind[] = 'ebeddien';
                    $bind[] = 'uwaba';
                } else {
                    $where[] = ' app = ?';
                    $bind[] = $app;
                }
            }
            if ($isSuperAdmin) {
                // Super admin melihat semua entri (tanpa filter role_id)
            } elseif (!empty($roleIds)) {
                $ph = implode(',', array_fill(0, count($roleIds), '?'));
                $where[] = ' (role_id IS NULL OR role_id IN (' . $ph . '))';
                foreach ($roleIds as $rid) {
                    $bind[] = $rid;
                }
            } else {
                $where[] = ' role_id IS NULL';
            }
            if (!empty($where)) {
                $sql .= ' WHERE' . implode(' AND', $where);
            }
            $sql .= ' ORDER BY app ASC, released_at DESC';
            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            $msg = $e->getMessage();
            if (stripos($msg, 'role_id') !== false || stripos($msg, 'Unknown column') !== false) {
                try {
                    $sql = 'SELECT id, app, version, title, changelog, released_at, created_at 
                            FROM app_version_changelog';
                    $where = [];
                    $bind = [];
                    if ($app !== null && $app !== '') {
                        if ($isEbeddienRequest) {
                            $where[] = ' app IN (?, ?)';
                            $bind[] = 'ebeddien';
                            $bind[] = 'uwaba';
                        } else {
                            $where[] = ' app = ?';
                            $bind[] = $app;
                        }
                    }
                    if (!empty($where)) {
                        $sql .= ' WHERE' . implode(' AND', $where);
                    }
                    $sql .= ' ORDER BY app ASC, released_at DESC';
                    $stmt = $this->db->prepare($sql);
                    $stmt->execute($bind);
                    $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                } catch (\Throwable $e2) {
                    error_log('VersionChangelogController: ' . $e2->getMessage());
                    $response->getBody()->write(json_encode([
                        'success' => false,
                        'message' => 'Tabel app_version_changelog belum ada. Jalankan: php vendor/bin/phinx migrate'
                    ], JSON_UNESCAPED_UNICODE));
                    return $response->withStatus(503)
                        ->withHeader('Content-Type', 'application/json; charset=utf-8');
                }
            } else {
                error_log('VersionChangelogController: ' . $msg);
                $response->getBody()->write(json_encode([
                    'success' => false,
                    'message' => 'Tabel app_version_changelog belum ada. Jalankan: php vendor/bin/phinx migrate'
                ], JSON_UNESCAPED_UNICODE));
                return $response->withStatus(503)
                    ->withHeader('Content-Type', 'application/json; charset=utf-8');
            }
        }

        $response->getBody()->write(json_encode([
            'success' => true,
            'data' => $rows
        ], JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json; charset=utf-8');
    }
}
