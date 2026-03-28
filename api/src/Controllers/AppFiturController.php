<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\RoleHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Fitur/menu per aplikasi + pemetaan role (tabel app, app___fitur, role___fitur).
 */
class AppFiturController
{
    private \PDO $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    /**
     * GET /api/v2/me/fitur-menu
     * Query: app_key (default ebeddien), types=menu|action|menu,action
     *
     * Menggabungkan hak akses dari semua role_key di token (multi_role).
     */
    public function getMyMenu(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            if (!is_array($user)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak terautentikasi',
                ], 401);
            }

            $q = $request->getQueryParams();
            $appKey = isset($q['app_key']) ? trim((string) $q['app_key']) : 'ebeddien';
            if ($appKey === '') {
                $appKey = 'ebeddien';
            }

            $typesParam = isset($q['types']) ? trim((string) $q['types']) : 'menu';
            $allowedTypes = ['menu', 'action'];
            $types = [];
            foreach (explode(',', $typesParam) as $t) {
                $t = strtolower(trim($t));
                if (in_array($t, $allowedTypes, true)) {
                    $types[$t] = true;
                }
            }
            if ($types === []) {
                $types = ['menu' => true];
            }
            $typeList = array_keys($types);

            $stmt = $this->db->prepare('SELECT `id`, `key`, `label`, `sort_order` FROM `app` WHERE `key` = ? LIMIT 1');
            $stmt->execute([$appKey]);
            $appRow = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($appRow === false) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Aplikasi tidak ditemukan',
                ], 404);
            }

            $appId = (int) $appRow['id'];
            $roleKeys = RoleHelper::normalizeTokenRoleKeysUnion($user);

            $appPayload = [
                'id' => (int) $appRow['id'],
                'key' => (string) $appRow['key'],
                'label' => (string) $appRow['label'],
                'sort_order' => (int) $appRow['sort_order'],
            ];

            if ($roleKeys === []) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => [
                        'app' => $appPayload,
                        'role_keys' => [],
                        'items' => [],
                        'codes' => [],
                    ],
                ], 200);
            }

            $placeholders = implode(',', array_fill(0, count($roleKeys), '?'));
            $stmt = $this->db->prepare("SELECT `id` FROM `role` WHERE `key` IN ($placeholders)");
            $stmt->execute($roleKeys);
            $roleIds = [];
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $roleIds[] = (int) $row['id'];
            }

            if ($roleIds === []) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => [
                        'app' => $appPayload,
                        'role_keys' => $roleKeys,
                        'items' => [],
                        'codes' => [],
                    ],
                ], 200);
            }

            $typePh = implode(',', array_fill(0, count($typeList), '?'));
            $rolePh = implode(',', array_fill(0, count($roleIds), '?'));
            $sql = "SELECT DISTINCT f.`id`, f.`id_app`, f.`parent_id`, f.`type`, f.`code`, f.`label`, f.`path`, f.`icon_key`, f.`group_label`, f.`sort_order`, f.`meta_json`
                FROM `app___fitur` f
                INNER JOIN `role___fitur` rf ON rf.`fitur_id` = f.`id`
                WHERE f.`id_app` = ? AND f.`type` IN ($typePh) AND rf.`role_id` IN ($rolePh)
                ORDER BY f.`sort_order` ASC, f.`id` ASC";
            $stmt = $this->db->prepare($sql);
            $params = array_merge([$appId], $typeList, $roleIds);
            $stmt->execute($params);

            $items = [];
            $codes = [];
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $meta = null;
                if (!empty($row['meta_json'])) {
                    $decoded = json_decode((string) $row['meta_json'], true);
                    $meta = is_array($decoded) ? $decoded : null;
                }
                unset($row['meta_json']);

                $row['id'] = (int) $row['id'];
                $row['id_app'] = (int) $row['id_app'];
                $row['parent_id'] = $row['parent_id'] !== null && $row['parent_id'] !== '' ? (int) $row['parent_id'] : null;
                $row['sort_order'] = (int) $row['sort_order'];
                $row['meta'] = $meta;

                $codes[] = (string) $row['code'];
                $items[] = $row;
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'app' => $appPayload,
                    'role_keys' => $roleKeys,
                    'items' => $items,
                    'codes' => $codes,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('AppFiturController::getMyMenu: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memuat fitur',
            ], 500);
        }
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }
}
