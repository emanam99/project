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

    /**
     * GET /api/v2/fitur/ebeddien/menu-catalog
     * Semua baris menu eBeddien (app___fitur type=menu) untuk menyusun UI dari DB — bukan menuConfig.js.
     */
    public function getEbeddienMenuCatalog(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            if (!is_array($user)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak terautentikasi',
                ], 401);
            }

            $stmt = $this->db->prepare('SELECT `id` FROM `app` WHERE `key` = ? LIMIT 1');
            $stmt->execute(['ebeddien']);
            $appRow = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($appRow === false) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Aplikasi ebeddien tidak ditemukan',
                ], 404);
            }
            $appId = (int) $appRow['id'];

            $stmt = $this->db->prepare(
                'SELECT `id`, `id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`
                 FROM `app___fitur` WHERE `id_app` = ? AND `type` = \'menu\'
                 ORDER BY `sort_order` ASC, `id` ASC'
            );
            $stmt->execute([$appId]);

            $items = [];
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
                $items[] = $row;
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'items' => $items,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('AppFiturController::getEbeddienMenuCatalog: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memuat katalog menu',
            ], 500);
        }
    }

    /**
     * GET /api/v2/me/fitur-favorit?app_key=ebeddien
     * Urutan path menu yang disimpan untuk nav bawah (hanya path yang masih diizinkan role).
     */
    public function getMyFiturFavorit(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            if (!is_array($user)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak terautentikasi',
                ], 401);
            }

            $usersId = $this->resolveUsersIdForFavorit($user);
            if ($usersId === null || $usersId <= 0) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => ['paths' => [], 'fitur_ids' => []],
                ], 200);
            }

            $q = $request->getQueryParams();
            $appKey = isset($q['app_key']) ? trim((string) $q['app_key']) : 'ebeddien';
            if ($appKey === '') {
                $appKey = 'ebeddien';
            }

            $appId = $this->resolveAppIdByKey($appKey);
            if ($appId === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Aplikasi tidak ditemukan',
                ], 404);
            }

            $allowedPathToId = $this->allowedMenuPathToFiturId($appId, $user);
            if ($allowedPathToId === []) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => ['paths' => [], 'fitur_ids' => []],
                ], 200);
            }

            $stmt = $this->db->prepare(
                'SELECT f.`path`, f.`id` AS fitur_id, aff.`sort_order`
                FROM `app___fitur_favorit` aff
                INNER JOIN `app___fitur` f ON f.`id` = aff.`fitur_id`
                WHERE aff.`users_id` = ? AND f.`id_app` = ?
                ORDER BY aff.`sort_order` ASC, aff.`id` ASC'
            );
            $stmt->execute([$usersId, $appId]);

            $paths = [];
            $ids = [];
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $path = (string) ($row['path'] ?? '');
                if ($path === '' || !isset($allowedPathToId[$path])) {
                    continue;
                }
                $paths[] = $path;
                $ids[] = (int) $row['fitur_id'];
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'paths' => $paths,
                    'fitur_ids' => $ids,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('AppFiturController::getMyFiturFavorit: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memuat favorit menu',
            ], 500);
        }
    }

    /**
     * PUT /api/v2/me/fitur-favorit
     * Body: app_key (optional), ordered_paths: string[] — disimpan sebagai baris app___fitur_favorit.
     */
    public function putMyFiturFavorit(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            if (!is_array($user)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak terautentikasi',
                ], 401);
            }

            $usersId = $this->resolveUsersIdForFavorit($user);
            if ($usersId === null || $usersId <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Akun tidak memiliki users_id untuk menyimpan favorit',
                ], 400);
            }

            $body = (array) $request->getParsedBody();
            $appKey = isset($body['app_key']) ? trim((string) $body['app_key']) : 'ebeddien';
            if ($appKey === '') {
                $appKey = 'ebeddien';
            }

            $orderedPaths = $body['ordered_paths'] ?? null;
            if (!is_array($orderedPaths)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Body wajib berisi ordered_paths (array string path)',
                ], 400);
            }

            $appId = $this->resolveAppIdByKey($appKey);
            if ($appId === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Aplikasi tidak ditemukan',
                ], 404);
            }

            $allowedPathToId = $this->allowedMenuPathToFiturId($appId, $user);
            if ($allowedPathToId === [] && $orderedPaths !== []) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak ada menu yang diizinkan untuk akun ini',
                ], 403);
            }

            $max = 16;
            $seen = [];
            $fiturIds = [];
            foreach ($orderedPaths as $p) {
                if (!is_string($p)) {
                    continue;
                }
                $path = $this->normalizeMenuPath($p);
                if ($path === '' || isset($seen[$path])) {
                    continue;
                }
                if (!isset($allowedPathToId[$path])) {
                    continue;
                }
                $seen[$path] = true;
                $fiturIds[] = $allowedPathToId[$path];
                if (count($fiturIds) >= $max) {
                    break;
                }
            }

            $this->db->beginTransaction();
            try {
                $del = $this->db->prepare(
                    'DELETE aff FROM `app___fitur_favorit` aff
                    INNER JOIN `app___fitur` f ON f.`id` = aff.`fitur_id`
                    WHERE aff.`users_id` = ? AND f.`id_app` = ?'
                );
                $del->execute([$usersId, $appId]);

                if ($fiturIds !== []) {
                    $ins = $this->db->prepare(
                        'INSERT INTO `app___fitur_favorit` (`users_id`, `fitur_id`, `sort_order`) VALUES (?, ?, ?)'
                    );
                    foreach ($fiturIds as $i => $fid) {
                        $ins->execute([$usersId, $fid, $i]);
                    }
                }
                $this->db->commit();
            } catch (\Throwable $e) {
                $this->db->rollBack();
                throw $e;
            }

            $pathsOut = array_keys($seen);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Favorit menu disimpan.',
                'data' => [
                    'paths' => $pathsOut,
                    'fitur_ids' => $fiturIds,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('AppFiturController::putMyFiturFavorit: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan favorit menu',
            ], 500);
        }
    }

    private function resolveAppIdByKey(string $appKey): ?int
    {
        $stmt = $this->db->prepare('SELECT `id` FROM `app` WHERE `key` = ? LIMIT 1');
        $stmt->execute([$appKey]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        return $row ? (int) $row['id'] : null;
    }

    /**
     * Samakan dengan penentuan session: users_id token, atau id_user dari pengurus.
     */
    private function resolveUsersIdForFavorit(array $user): ?int
    {
        $u = isset($user['users_id']) ? (int) $user['users_id'] : 0;
        if ($u > 0) {
            return $u;
        }
        $pid = isset($user['user_id']) ? (int) $user['user_id'] : 0;
        if ($pid > 0) {
            $stmt = $this->db->prepare('SELECT `id_user` FROM `pengurus` WHERE `id` = ? LIMIT 1');
            $stmt->execute([$pid]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row && !empty($row['id_user'])) {
                return (int) $row['id_user'];
            }

            return $pid;
        }

        return null;
    }

    /** @return array<string, int> path → fitur id */
    private function allowedMenuPathToFiturId(int $appId, array $user): array
    {
        $roleKeys = RoleHelper::normalizeTokenRoleKeysUnion($user);
        if ($roleKeys === []) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($roleKeys), '?'));
        $stmt = $this->db->prepare("SELECT `id` FROM `role` WHERE `key` IN ($placeholders)");
        $stmt->execute($roleKeys);
        $roleIds = [];
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $roleIds[] = (int) $row['id'];
        }
        if ($roleIds === []) {
            return [];
        }
        $rolePh = implode(',', array_fill(0, count($roleIds), '?'));
        $sql = "SELECT DISTINCT f.`path`, f.`id`
            FROM `app___fitur` f
            INNER JOIN `role___fitur` rf ON rf.`fitur_id` = f.`id`
            WHERE f.`id_app` = ? AND f.`type` = 'menu' AND rf.`role_id` IN ($rolePh)";
        $stmt = $this->db->prepare($sql);
        $stmt->execute(array_merge([$appId], $roleIds));
        $map = [];
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $path = (string) ($row['path'] ?? '');
            if ($path !== '' && !isset($map[$path])) {
                $map[$path] = (int) $row['id'];
            }
        }

        return $map;
    }

    private function normalizeMenuPath(string $path): string
    {
        $path = trim($path);
        if ($path === '') {
            return '';
        }
        if ($path[0] !== '/') {
            $path = '/' . $path;
        }

        return $path;
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }
}
