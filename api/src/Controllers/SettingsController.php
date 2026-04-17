<?php

namespace App\Controllers;

use App\Config\EbeddienFiturSelectorRepository;
use App\Config\LegacyRouteRoleDefinitions;
use App\Config\LegacyRouteRolesRepository;
use App\Config\RoleConfig;
use App\Config\RolePolicyResolver;
use App\Database;
use App\Services\WhatsAppService;
use App\Services\WatzapService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Settings endpoints (super_admin only).
 */
class SettingsController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * GET /api/settings/roles-config - Daftar role dari tabel role + akses efektif (DB override atau RoleConfig).
     * Hanya super_admin.
     */
    public function getRolesConfig(Request $request, Response $response): Response
    {
        try {
            $stmt = $this->db->query(
                'SELECT id, `key`, label, `permissions_json`, `allowed_apps_json` FROM `role` ORDER BY id ASC'
            );
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $apps = RoleConfig::APPS;
            $roles = [];
            foreach ($rows as $row) {
                $roleKey = (string) ($row['key'] ?? '');
                $allowedApps = RolePolicyResolver::getAllowedApps($roleKey);
                // Halaman Role hanya menampilkan role yang punya akses ke aplikasi UWABA
                if (!in_array('uwaba', $allowedApps, true)) {
                    continue;
                }
                $permRaw = $row['permissions_json'] ?? null;
                $appsRaw = $row['allowed_apps_json'] ?? null;
                $roles[] = [
                    'id' => (int) ($row['id'] ?? 0),
                    'key' => $roleKey,
                    'label' => $row['label'] ?? RoleConfig::getRoleLabel($roleKey),
                    'allowed_apps' => $allowedApps,
                    'allowed_apps_labels' => array_map(function ($appKey) use ($apps) {
                        return $apps[$appKey] ?? $appKey;
                    }, $allowedApps),
                    'permissions' => RolePolicyResolver::getPermissions($roleKey),
                    'permissions_policy_source' => ($permRaw === null || $permRaw === '') ? 'php' : 'database',
                    'allowed_apps_policy_source' => ($appsRaw === null || $appsRaw === '') ? 'php' : 'database',
                ];
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'apps' => $apps,
                    'roles' => $roles,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('SettingsController::getRolesConfig ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil konfigurasi role',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /api/settings/ebeddien-fitur-selectors — baris ebeddien_fitur_selector (middleware).
     */
    public function getEbeddienFiturSelectors(Request $request, Response $response): Response
    {
        try {
            $stmt = $this->db->query(
                'SELECT `selector_key`, `codes_json`, `updated_at` FROM `ebeddien_fitur_selector` ORDER BY `selector_key` ASC'
            );
            $rows = $stmt ? $stmt->fetchAll(\PDO::FETCH_ASSOC) : [];
            $items = [];
            foreach ($rows as $row) {
                $key = (string) ($row['selector_key'] ?? '');
                if ($key === '') {
                    continue;
                }
                $decoded = json_decode((string) ($row['codes_json'] ?? '[]'), true);
                $codes = is_array($decoded) ? array_values(array_filter($decoded, static fn ($v) => is_string($v) && $v !== '')) : [];
                $items[] = [
                    'selector_key' => $key,
                    'codes' => $codes,
                    'updated_at' => $row['updated_at'] ?? null,
                ];
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => ['items' => $items],
            ], 200);
        } catch (\Throwable $e) {
            error_log('SettingsController::getEbeddienFiturSelectors ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil selector fitur',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * PUT /api/settings/ebeddien-fitur-selectors/{selectorKey} — body: { "codes": string[] }.
     */
    public function putEbeddienFiturSelector(Request $request, Response $response, array $args): Response
    {
        try {
            $key = trim((string) ($args['selectorKey'] ?? ''));
            if (!preg_match('/^[A-Za-z][A-Za-z0-9_]{0,63}$/', $key)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'selector_key tidak valid',
                ], 400);
            }
            $body = (array) $request->getParsedBody();
            $codes = $body['codes'] ?? null;
            if (!is_array($codes)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Body wajib berisi "codes" (array string)',
                ], 400);
            }
            $clean = [];
            foreach ($codes as $c) {
                if (!is_string($c) || trim($c) === '') {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Setiap kode harus string non-kosong',
                    ], 400);
                }
                $clean[] = $c;
            }
            $json = json_encode($clean, JSON_UNESCAPED_UNICODE);
            $stmt = $this->db->prepare(
                'INSERT INTO `ebeddien_fitur_selector` (`selector_key`, `codes_json`) VALUES (?, ?) '
                . 'ON DUPLICATE KEY UPDATE `codes_json` = VALUES(`codes_json`)'
            );
            $stmt->execute([$key, $json]);
            EbeddienFiturSelectorRepository::clearCache();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Selector disimpan.',
                'data' => [
                    'selector_key' => $key,
                    'codes' => $clean,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('SettingsController::putEbeddienFiturSelector ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan selector',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /api/settings/ebeddien-legacy-route-roles — fallback role per legacy_key (DB + fallback PHP).
     */
    public function getEbeddienLegacyRouteRoles(Request $request, Response $response): Response
    {
        try {
            $defs = LegacyRouteRoleDefinitions::allGroups();
            $items = [];
            foreach ($defs as $legacyKey => $defaultRoles) {
                $dbRoles = LegacyRouteRolesRepository::rolesForKey((string) $legacyKey);
                $isDb = $dbRoles !== [] && $dbRoles !== $defaultRoles;
                $items[] = [
                    'legacy_key' => (string) $legacyKey,
                    'roles' => $isDb ? array_values($dbRoles) : array_values($defaultRoles),
                    'source' => $isDb ? 'database' : 'php',
                    'default_roles' => array_values($defaultRoles),
                ];
            }
            usort($items, static function (array $a, array $b): int {
                return strcmp((string) ($a['legacy_key'] ?? ''), (string) ($b['legacy_key'] ?? ''));
            });

            $roleRows = $this->db->query('SELECT `key`, `label` FROM `role` ORDER BY `key` ASC')->fetchAll(\PDO::FETCH_ASSOC);
            $roleCatalog = [];
            foreach ($roleRows as $r) {
                $k = str_replace(' ', '_', strtolower(trim((string) ($r['key'] ?? ''))));
                if ($k === '') {
                    continue;
                }
                $roleCatalog[] = [
                    'key' => $k,
                    'label' => (string) ($r['label'] ?? $k),
                ];
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'items' => $items,
                    'role_catalog' => $roleCatalog,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('SettingsController::getEbeddienLegacyRouteRoles ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil fallback role route',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * PUT /api/settings/ebeddien-legacy-route-roles/{legacyKey} — body: { "roles": string[] }.
     */
    public function putEbeddienLegacyRouteRoles(Request $request, Response $response, array $args): Response
    {
        try {
            $legacyKey = trim((string) ($args['legacyKey'] ?? ''));
            $defs = LegacyRouteRoleDefinitions::allGroups();
            if (!isset($defs[$legacyKey])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'legacy_key tidak dikenal',
                ], 404);
            }
            $body = (array) $request->getParsedBody();
            $roles = $body['roles'] ?? null;
            if (!is_array($roles)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Body wajib berisi "roles" (array string)',
                ], 400);
            }
            $clean = [];
            foreach ($roles as $rk) {
                $k = str_replace(' ', '_', strtolower(trim((string) $rk)));
                if ($k === '' || !preg_match('/^[a-z0-9_]+$/', $k)) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Setiap role harus string valid (a-z, 0-9, underscore)',
                    ], 400);
                }
                $clean[$k] = true;
            }
            $rolesFinal = array_keys($clean);

            $this->db->beginTransaction();
            $del = $this->db->prepare('DELETE FROM `ebeddien_legacy_route_role` WHERE `legacy_key` = ?');
            $del->execute([$legacyKey]);
            if ($rolesFinal !== []) {
                $ins = $this->db->prepare(
                    'INSERT INTO `ebeddien_legacy_route_role` (`legacy_key`, `role_key`, `sort_order`) VALUES (?, ?, ?)'
                );
                foreach ($rolesFinal as $i => $k) {
                    $ins->execute([$legacyKey, $k, (int) $i]);
                }
            }
            $this->db->commit();
            LegacyRouteRolesRepository::clearCache();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Fallback role route diperbarui.',
                'data' => [
                    'legacy_key' => $legacyKey,
                    'roles' => $rolesFinal,
                ],
            ], 200);
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('SettingsController::putEbeddienLegacyRouteRoles ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan fallback role route',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /api/settings/role-policy/catalog — daftar aplikasi & permission (RoleConfig) untuk UI centang tanpa JSON.
     */
    public function getRolePolicyCatalog(Request $request, Response $response): Response
    {
        try {
            $apps = [];
            foreach (RoleConfig::APPS as $key => $label) {
                $apps[] = ['key' => (string) $key, 'label' => (string) $label];
            }

            $permSeen = [];
            foreach (RoleConfig::ROLE_PERMISSIONS as $perms) {
                foreach ($perms as $p) {
                    $pk = strtolower(trim((string) $p));
                    if ($pk !== '') {
                        $permSeen[$pk] = true;
                    }
                }
            }
            $permLabels = [
                'manage_users' => 'Kelola pengguna',
                'manage_santri' => 'Kelola data santri',
                'manage_uwaba' => 'Kelola pembayaran UWABA',
                'manage_umroh' => 'Kelola data Umroh',
                'manage_psb' => 'Kelola pendaftaran PSB',
                'manage_ijin' => 'Kelola data Ijin',
                'view_reports' => 'Melihat laporan',
                'manage_finance' => 'Kelola keuangan',
                'manage_settings' => 'Kelola pengaturan',
            ];
            $permissions = [];
            foreach (array_keys($permSeen) as $pk) {
                $permissions[] = [
                    'key' => $pk,
                    'label' => $permLabels[$pk] ?? $pk,
                ];
            }
            usort($permissions, static function (array $a, array $b): int {
                return strcasecmp((string) ($a['label'] ?? ''), (string) ($b['label'] ?? ''));
            });

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'apps' => $apps,
                    'permissions' => $permissions,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('SettingsController::getRolePolicyCatalog ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil katalog kebijakan role',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * PATCH /api/settings/role-policy/{roleKey} — body opsional: permissions (array|null), allowed_apps (array|null); null = hapus override (pakai PHP).
     */
    public function patchRolePolicy(Request $request, Response $response, array $args): Response
    {
        try {
            $roleKey = str_replace(' ', '_', strtolower(trim((string) ($args['roleKey'] ?? ''))));
            if ($roleKey === '' || !preg_match('/^[a-z0-9_]+$/', $roleKey)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'roleKey tidak valid',
                ], 400);
            }
            $stmt = $this->db->prepare('SELECT `id`, `key` FROM `role` WHERE `key` = ? LIMIT 1');
            $stmt->execute([$roleKey]);
            $roleRow = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($roleRow === false) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Role tidak ditemukan',
                ], 404);
            }
            $body = (array) $request->getParsedBody();
            if (!array_key_exists('permissions', $body) && !array_key_exists('allowed_apps', $body)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Sertakan minimal salah satu: permissions, allowed_apps',
                ], 400);
            }

            $sets = [];
            $params = [];
            if (array_key_exists('permissions', $body)) {
                $p = $body['permissions'];
                if ($p === null) {
                    $sets[] = '`permissions_json` = NULL';
                } elseif (is_array($p)) {
                    foreach ($p as $x) {
                        if (!is_string($x) || trim($x) === '') {
                            return $this->jsonResponse($response, [
                                'success' => false,
                                'message' => 'permissions harus array string',
                            ], 400);
                        }
                    }
                    $norm = array_values(array_unique(array_map(static fn ($x) => strtolower(trim((string) $x)), $p)));
                    $sets[] = '`permissions_json` = ?';
                    $params[] = json_encode($norm, JSON_UNESCAPED_UNICODE);
                } else {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'permissions harus array atau null',
                    ], 400);
                }
            }
            if (array_key_exists('allowed_apps', $body)) {
                $a = $body['allowed_apps'];
                if ($a === null) {
                    $sets[] = '`allowed_apps_json` = NULL';
                } elseif (is_array($a)) {
                    foreach ($a as $x) {
                        if (!is_string($x) || trim($x) === '') {
                            return $this->jsonResponse($response, [
                                'success' => false,
                                'message' => 'allowed_apps harus array string',
                            ], 400);
                        }
                    }
                    $norm = array_values(array_unique(array_map(static fn ($x) => strtolower(trim((string) $x)), $a)));
                    $sets[] = '`allowed_apps_json` = ?';
                    $params[] = json_encode($norm, JSON_UNESCAPED_UNICODE);
                } else {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'allowed_apps harus array atau null',
                    ], 400);
                }
            }
            if ($sets === []) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak ada perubahan',
                ], 400);
            }
            $params[] = (int) ($roleRow['id'] ?? 0);
            $sql = 'UPDATE `role` SET ' . implode(', ', $sets) . ' WHERE `id` = ?';
            $upd = $this->db->prepare($sql);
            $upd->execute($params);
            RolePolicyResolver::clearCache();

            $sel = $this->db->prepare('SELECT `permissions_json`, `allowed_apps_json` FROM `role` WHERE `id` = ? LIMIT 1');
            $sel->execute([(int) $roleRow['id']]);
            $snap = $sel->fetch(\PDO::FETCH_ASSOC) ?: [];

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Kebijakan role diperbarui.',
                'data' => [
                    'key' => $roleKey,
                    'permissions' => RolePolicyResolver::getPermissions($roleKey),
                    'allowed_apps' => RolePolicyResolver::getAllowedApps($roleKey),
                    'permissions_policy_source' => (($snap['permissions_json'] ?? null) === null || ($snap['permissions_json'] ?? '') === '') ? 'php' : 'database',
                    'allowed_apps_policy_source' => (($snap['allowed_apps_json'] ?? null) === null || ($snap['allowed_apps_json'] ?? '') === '') ? 'php' : 'database',
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('SettingsController::patchRolePolicy ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memperbarui kebijakan role',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * POST /api/settings/role-policy/sync-from-php — salin RoleConfig ke kolom JSON semua baris role.
     */
    public function postRolePolicySyncFromPhp(Request $request, Response $response): Response
    {
        try {
            $rows = $this->db->query('SELECT `id`, `key` FROM `role` ORDER BY `id` ASC')->fetchAll(\PDO::FETCH_ASSOC);
            $upd = $this->db->prepare(
                'UPDATE `role` SET `permissions_json` = ?, `allowed_apps_json` = ? WHERE `id` = ?'
            );
            foreach ($rows as $r) {
                $k = (string) ($r['key'] ?? '');
                $id = (int) ($r['id'] ?? 0);
                if ($id <= 0 || $k === '') {
                    continue;
                }
                $perms = RoleConfig::getPermissions($k);
                $apps = RoleConfig::getAllowedApps($k);
                $upd->execute([
                    json_encode(array_values($perms), JSON_UNESCAPED_UNICODE),
                    json_encode(array_values($apps), JSON_UNESCAPED_UNICODE),
                    $id,
                ]);
            }
            RolePolicyResolver::clearCache();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Semua role diselaraskan dari RoleConfig ke database.',
                'data' => ['roles_updated' => count($rows)],
            ], 200);
        } catch (\Throwable $e) {
            error_log('SettingsController::postRolePolicySyncFromPhp ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal sinkron dari RoleConfig',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * POST /api/settings/role-policy/clear-cache — buang cache RolePolicyResolver di worker PHP ini.
     * Berguna setelah edit manual kolom permissions_json / allowed_apps_json (phpMyAdmin, migrasi CLI).
     */
    public function postRolePolicyClearCache(Request $request, Response $response): Response
    {
        RolePolicyResolver::clearCache();
        LegacyRouteRolesRepository::clearCache();

        return $this->jsonResponse($response, [
            'success' => true,
            'message' => 'Cache kebijakan role dibuang untuk proses PHP ini.',
        ], 200);
    }

    /**
     * GET /api/settings/ebeddien-menu-fitur — menu app ebeddien + role_id per baris (role___fitur).
     * Semua role dari tabel `role` (untuk editor matriks). Hanya super_admin.
     */
    public function getEbeddienMenuFitur(Request $request, Response $response): Response
    {
        try {
            $appStmt = $this->db->prepare('SELECT `id`, `key`, `label` FROM `app` WHERE `key` = ? LIMIT 1');
            $appStmt->execute(['ebeddien']);
            $appRow = $appStmt->fetch(\PDO::FETCH_ASSOC);
            if ($appRow === false) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Aplikasi ebeddien belum ada di tabel app. Jalankan seed AppSeed.',
                ], 404);
            }

            $appId = (int) $appRow['id'];

            $rolesStmt = $this->db->query('SELECT `id`, `key`, `label` FROM `role` ORDER BY `id` ASC');
            $allRoles = array_map(function ($r) {
                return [
                    'id' => (int) ($r['id'] ?? 0),
                    'key' => (string) ($r['key'] ?? ''),
                    'label' => (string) ($r['label'] ?? ''),
                ];
            }, $rolesStmt->fetchAll(\PDO::FETCH_ASSOC));

            $fiturStmt = $this->db->prepare(
                'SELECT `id`, `parent_id`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `type` '
                . 'FROM `app___fitur` WHERE `id_app` = ? AND `type` IN (\'menu\', \'action\') ORDER BY `parent_id` IS NOT NULL ASC, `sort_order` ASC, `id` ASC'
            );
            $fiturStmt->execute([$appId]);
            $fiturRows = $fiturStmt->fetchAll(\PDO::FETCH_ASSOC);

            $rfStmt = $this->db->prepare('SELECT `role_id` FROM `role___fitur` WHERE `fitur_id` = ? ORDER BY `role_id` ASC');
            $items = [];
            foreach ($fiturRows as $f) {
                $fid = (int) ($f['id'] ?? 0);
                $rfStmt->execute([$fid]);
                $roleIds = array_map('intval', array_column($rfStmt->fetchAll(\PDO::FETCH_ASSOC), 'role_id'));
                $pid = $f['parent_id'] ?? null;
                $iconKey = $f['icon_key'] ?? null;
                $items[] = [
                    'id' => $fid,
                    'parent_id' => $pid !== null && $pid !== '' ? (int) $pid : null,
                    'code' => (string) ($f['code'] ?? ''),
                    'label' => (string) ($f['label'] ?? ''),
                    'path' => (string) ($f['path'] ?? ''),
                    'icon_key' => $iconKey !== null && $iconKey !== '' ? (string) $iconKey : null,
                    'group_label' => (string) ($f['group_label'] ?? ''),
                    'sort_order' => (int) ($f['sort_order'] ?? 0),
                    'type' => (string) ($f['type'] ?? 'menu'),
                    'role_ids' => $roleIds,
                ];
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'app' => [
                        'id' => $appId,
                        'key' => (string) $appRow['key'],
                        'label' => (string) $appRow['label'],
                    ],
                    'roles' => $allRoles,
                    'items' => $items,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('SettingsController::getEbeddienMenuFitur ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil pemetaan menu–role',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * PUT /api/settings/ebeddien-menu-fitur — body: { assignments: [ { fitur_id, role_ids: number[] } ] }.
     * Mengganti seluruh baris role___fitur untuk setiap fitur_id yang dikirim. Hanya super_admin.
     */
    public function putEbeddienMenuFitur(Request $request, Response $response): Response
    {
        try {
            $body = (array) $request->getParsedBody();
            $assignments = $body['assignments'] ?? null;
            if (!is_array($assignments) || $assignments === []) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Body wajib berisi assignments (array tidak kosong).',
                ], 400);
            }

            $appStmt = $this->db->prepare('SELECT `id` FROM `app` WHERE `key` = ? LIMIT 1');
            $appStmt->execute(['ebeddien']);
            $appRow = $appStmt->fetch(\PDO::FETCH_ASSOC);
            if ($appRow === false) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Aplikasi ebeddien tidak ditemukan.',
                ], 404);
            }
            $appId = (int) $appRow['id'];

            $verifyFitur = $this->db->prepare(
                'SELECT `id` FROM `app___fitur` WHERE `id` = ? AND `id_app` = ? AND `type` IN (\'menu\', \'action\') LIMIT 1'
            );
            $verifyRole = $this->db->prepare('SELECT `id` FROM `role` WHERE `id` = ? LIMIT 1');

            $this->db->beginTransaction();
            $del = $this->db->prepare('DELETE FROM `role___fitur` WHERE `fitur_id` = ?');
            $ins = $this->db->prepare('INSERT INTO `role___fitur` (`role_id`, `fitur_id`) VALUES (?, ?)');

            foreach ($assignments as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $fid = (int) ($row['fitur_id'] ?? 0);
                if ($fid <= 0) {
                    $this->db->rollBack();

                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'fitur_id tidak valid.',
                    ], 400);
                }
                $verifyFitur->execute([$fid, $appId]);
                if ($verifyFitur->fetch(\PDO::FETCH_ASSOC) === false) {
                    $this->db->rollBack();

                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Fitur tidak valid untuk app ebeddien: id ' . $fid,
                    ], 400);
                }

                $roleIds = $row['role_ids'] ?? [];
                if (!is_array($roleIds)) {
                    $this->db->rollBack();

                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'role_ids harus array untuk fitur_id ' . $fid,
                    ], 400);
                }

                $del->execute([$fid]);
                $seen = [];
                foreach ($roleIds as $rid) {
                    $rid = (int) $rid;
                    if ($rid <= 0 || isset($seen[$rid])) {
                        continue;
                    }
                    $seen[$rid] = true;
                    $verifyRole->execute([$rid]);
                    if ($verifyRole->fetch(\PDO::FETCH_ASSOC) === false) {
                        $this->db->rollBack();

                        return $this->jsonResponse($response, [
                            'success' => false,
                            'message' => 'Role id tidak dikenal: ' . $rid,
                        ], 400);
                    }
                    $ins->execute([$rid, $fid]);
                }
            }

            $this->db->commit();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pemetaan menu–role disimpan.',
            ], 200);
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('SettingsController::putEbeddienMenuFitur ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan pemetaan menu–role',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * PATCH /api/settings/ebeddien-menu-fitur/{fiturId}
     * Body: { role_ids?: number[], label?, icon_key?, group_label?, sort_order? }
     * — perbarui role___fitur dan/atau kolom tampilan di app___fitur (label, icon_key, group_label, sort_order).
     */
    public function patchEbeddienMenuFiturItem(Request $request, Response $response, array $args): Response
    {
        try {
            $fiturId = (int) ($args['fiturId'] ?? 0);
            if ($fiturId <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'fiturId tidak valid'], 400);
            }

            $body = (array) $request->getParsedBody();
            $hasRoleIds = array_key_exists('role_ids', $body);
            $hasLabel = array_key_exists('label', $body);
            $hasIconKey = array_key_exists('icon_key', $body);
            $hasGroupLabel = array_key_exists('group_label', $body);
            $hasSortOrder = array_key_exists('sort_order', $body);
            $hasMeta = $hasLabel || $hasIconKey || $hasGroupLabel || $hasSortOrder;

            if (!$hasRoleIds && !$hasMeta) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Kirim role_ids dan/atau label, icon_key, group_label, sort_order.',
                ], 400);
            }

            if ($hasRoleIds && !is_array($body['role_ids'])) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'role_ids harus array'], 400);
            }

            $appStmt = $this->db->prepare('SELECT `id` FROM `app` WHERE `key` = ? LIMIT 1');
            $appStmt->execute(['ebeddien']);
            $appRow = $appStmt->fetch(\PDO::FETCH_ASSOC);
            if ($appRow === false) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Aplikasi ebeddien tidak ditemukan.'], 404);
            }
            $appId = (int) $appRow['id'];

            $loadFitur = $this->db->prepare(
                'SELECT `id`, `label`, `icon_key`, `group_label`, `sort_order` FROM `app___fitur` '
                . 'WHERE `id` = ? AND `id_app` = ? AND `type` IN (\'menu\', \'action\') LIMIT 1'
            );
            $loadFitur->execute([$fiturId, $appId]);
            $fiturRow = $loadFitur->fetch(\PDO::FETCH_ASSOC);
            if ($fiturRow === false) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Fitur tidak ditemukan.'], 404);
            }

            $newLabel = (string) ($fiturRow['label'] ?? '');
            $newIconKey = $fiturRow['icon_key'] ?? null;
            $newGroupLabel = (string) ($fiturRow['group_label'] ?? '');
            $newSortOrder = (int) ($fiturRow['sort_order'] ?? 0);

            if ($hasLabel) {
                $label = trim((string) $body['label']);
                if ($label === '') {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'Label tidak boleh kosong.'], 400);
                }
                if (mb_strlen($label) > 255) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'Label maksimal 255 karakter.'], 400);
                }
                $newLabel = $label;
            }

            if ($hasIconKey) {
                $ik = trim((string) $body['icon_key']);
                if ($ik === '') {
                    $newIconKey = null;
                } else {
                    if (mb_strlen($ik) > 64) {
                        return $this->jsonResponse($response, ['success' => false, 'message' => 'icon_key maksimal 64 karakter.'], 400);
                    }
                    $newIconKey = $ik;
                }
            }

            if ($hasGroupLabel) {
                $gl = trim((string) $body['group_label']);
                $newGroupLabel = $gl === '' ? '' : (mb_substr($gl, 0, 128) ?: '');
            }

            if ($hasSortOrder) {
                $so = $body['sort_order'];
                if (is_bool($so) || !is_numeric($so)) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'sort_order harus angka.'], 400);
                }
                $newSortOrder = (int) $so;
                if ($newSortOrder < -999999 || $newSortOrder > 999999) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'sort_order di luar rentang yang diizinkan.'], 400);
                }
            }

            $this->db->beginTransaction();

            if ($hasMeta) {
                $upd = $this->db->prepare(
                    'UPDATE `app___fitur` SET `label` = ?, `icon_key` = ?, `group_label` = ?, `sort_order` = ? '
                    . 'WHERE `id` = ? AND `id_app` = ? LIMIT 1'
                );
                $upd->execute([
                    $newLabel,
                    $newIconKey,
                    $newGroupLabel === '' ? null : $newGroupLabel,
                    $newSortOrder,
                    $fiturId,
                    $appId,
                ]);
            }

            if ($hasRoleIds) {
                $roleIds = $body['role_ids'];
                $verifyRole = $this->db->prepare('SELECT `id` FROM `role` WHERE `id` = ? LIMIT 1');
                $this->db->prepare('DELETE FROM `role___fitur` WHERE `fitur_id` = ?')->execute([$fiturId]);
                $ins = $this->db->prepare('INSERT INTO `role___fitur` (`role_id`, `fitur_id`) VALUES (?, ?)');
                $seen = [];
                foreach ($roleIds as $rid) {
                    $rid = (int) $rid;
                    if ($rid <= 0 || isset($seen[$rid])) {
                        continue;
                    }
                    $seen[$rid] = true;
                    $verifyRole->execute([$rid]);
                    if ($verifyRole->fetch(\PDO::FETCH_ASSOC) === false) {
                        $this->db->rollBack();

                        return $this->jsonResponse($response, [
                            'success' => false,
                            'message' => 'Role id tidak dikenal: ' . $rid,
                        ], 400);
                    }
                    $ins->execute([$rid, $fiturId]);
                }
            }

            $this->db->commit();

            $rfStmt = $this->db->prepare(
                'SELECT `role_id` FROM `role___fitur` WHERE `fitur_id` = ? ORDER BY `role_id` ASC'
            );
            $rfStmt->execute([$fiturId]);
            $savedRoleIds = array_map('intval', array_column($rfStmt->fetchAll(\PDO::FETCH_ASSOC), 'role_id'));

            $outStmt = $this->db->prepare(
                'SELECT `label`, `icon_key`, `group_label`, `sort_order` FROM `app___fitur` WHERE `id` = ? AND `id_app` = ? LIMIT 1'
            );
            $outStmt->execute([$fiturId, $appId]);
            $outRow = $outStmt->fetch(\PDO::FETCH_ASSOC) ?: [];
            $glOut = $outRow['group_label'] ?? null;

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $hasMeta && $hasRoleIds
                    ? 'Menu dan akses role disimpan.'
                    : ($hasMeta ? 'Pengaturan tampilan disimpan.' : 'Akses role disimpan.'),
                'data' => [
                    'fitur_id' => $fiturId,
                    'role_ids' => $savedRoleIds,
                    'label' => (string) ($outRow['label'] ?? ''),
                    'icon_key' => !empty($outRow['icon_key']) ? (string) $outRow['icon_key'] : null,
                    'group_label' => $glOut !== null && $glOut !== '' ? (string) $glOut : '',
                    'sort_order' => (int) ($outRow['sort_order'] ?? 0),
                ],
            ], 200);
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('SettingsController::patchEbeddienMenuFiturItem ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /api/settings/features-config - Daftar semua fitur (aplikasi + permission) dan role yang bisa akses.
     * Hanya super_admin.
     */
    public function getFeaturesConfig(Request $request, Response $response): Response
    {
        try {
            $apps = RoleConfig::APPS;
            $roleLabels = RoleConfig::ROLE_LABELS;
            $features = [];

            // Fitur = akses aplikasi: untuk tiap app, daftar role yang boleh akses
            foreach ($apps as $appKey => $appLabel) {
                $roleKeys = [];
                foreach (array_keys($roleLabels) as $roleKey) {
                    if (RolePolicyResolver::canAccessApp($roleKey, $appKey)) {
                        $roleKeys[] = $roleKey;
                    }
                }
                $features[] = [
                    'type' => 'app',
                    'key' => $appKey,
                    'label' => $appLabel,
                    'role_keys' => $roleKeys,
                    'role_labels' => array_map(function ($k) use ($roleLabels) {
                        return $roleLabels[$k] ?? $k;
                    }, $roleKeys),
                ];
            }

            // Kumpulkan semua permission key yang ada di ROLE_PERMISSIONS
            $allPermissions = [];
            foreach (RoleConfig::ROLE_PERMISSIONS as $perms) {
                foreach ($perms as $p) {
                    $allPermissions[$p] = true;
                }
            }
            $permissionLabels = [
                'manage_users' => 'Kelola pengguna',
                'manage_santri' => 'Kelola data santri',
                'manage_uwaba' => 'Kelola pembayaran UWABA',
                'manage_psb' => 'Kelola pendaftaran PSB',
                'manage_ijin' => 'Kelola data Ijin',
                'view_reports' => 'Melihat laporan',
                'manage_finance' => 'Kelola keuangan',
                'manage_settings' => 'Kelola pengaturan',
            ];

            foreach (array_keys($allPermissions) as $permKey) {
                $roleKeys = [];
                foreach (array_keys($roleLabels) as $roleKey) {
                    if (RolePolicyResolver::hasPermission($roleKey, $permKey)) {
                        $roleKeys[] = $roleKey;
                    }
                }
                $features[] = [
                    'type' => 'permission',
                    'key' => $permKey,
                    'label' => $permissionLabels[$permKey] ?? $permKey,
                    'role_keys' => $roleKeys,
                    'role_labels' => array_map(function ($k) use ($roleLabels) {
                        return $roleLabels[$k] ?? $k;
                    }, $roleKeys),
                ];
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => ['features' => $features],
            ], 200);
        } catch (\Throwable $e) {
            error_log('SettingsController::getFeaturesConfig ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil konfigurasi fitur',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /api/settings/notification-config - Provider notifikasi WA: wa_sendiri | watzap | evolution. Hanya super_admin.
     */
    public function getNotificationConfig(Request $request, Response $response): Response
    {
        try {
            $tableCheck = $this->db->query("SHOW TABLES LIKE 'app___settings'");
            if ($tableCheck->rowCount() === 0) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => ['provider' => 'wa_sendiri'],
                ], 200);
            }
            $stmt = $this->db->prepare("SELECT `value` FROM app___settings WHERE `key` = 'notification_provider' LIMIT 1");
            $stmt->execute();
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $provider = ($row && isset($row['value']) && trim((string) $row['value']) !== '') ? trim((string) $row['value']) : 'wa_sendiri';
            if (!\in_array($provider, ['watzap', 'evolution', 'wa_sendiri'], true)) {
                $provider = 'wa_sendiri';
            }
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => ['provider' => $provider],
            ], 200);
        } catch (\Throwable $e) {
            error_log('SettingsController::getNotificationConfig ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil pengaturan notifikasi',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * PUT /api/settings/notification-config - Simpan provider: wa_sendiri | watzap | evolution. Hanya super_admin.
     */
    public function saveNotificationConfig(Request $request, Response $response): Response
    {
        try {
            $body = (array) $request->getParsedBody();
            $provider = isset($body['provider']) ? trim((string) $body['provider']) : '';
            if (!\in_array($provider, ['watzap', 'evolution', 'wa_sendiri'], true)) {
                $provider = 'wa_sendiri';
            }

            $tableCheck = $this->db->query("SHOW TABLES LIKE 'app___settings'");
            if ($tableCheck->rowCount() === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tabel app___settings belum ada. Jalankan migration 20260315000001_app_settings_watzap.',
                ], 500);
            }

            $stmt = $this->db->prepare("INSERT INTO app___settings (`key`, `value`) VALUES ('notification_provider', ?) ON DUPLICATE KEY UPDATE `value` = ?, updated_at = NOW()");
            $stmt->execute([$provider, $provider]);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => ['provider' => $provider],
            ], 200);
        } catch (\Throwable $e) {
            error_log('SettingsController::saveNotificationConfig ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan pengaturan notifikasi',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /api/settings/notification-groups - Daftar kelompok notifikasi terkirim (kategori + jumlah). Hanya super_admin.
     * Pesan keluar (arah=keluar atau arah null) dari tabel whatsapp, dikelompokkan per kategori.
     */
    public function getNotificationGroups(Request $request, Response $response): Response
    {
        try {
            $hasArah = $this->db->query("SHOW COLUMNS FROM whatsapp LIKE 'arah'")->rowCount() > 0;
            $where = $hasArah ? "WHERE (arah = 'keluar' OR arah IS NULL)" : '';
            $stmt = $this->db->query(
                "SELECT kategori, COUNT(*) as total FROM whatsapp {$where} GROUP BY kategori ORDER BY total DESC"
            );
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            $data = array_map(function ($r) {
                return [
                    'kategori' => (string) ($r['kategori'] ?? 'custom'),
                    'total' => (int) ($r['total'] ?? 0),
                ];
            }, $rows);
            return $this->jsonResponse($response, ['success' => true, 'data' => $data], 200);
        } catch (\Throwable $e) {
            error_log('SettingsController::getNotificationGroups ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil kelompok notifikasi',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /api/settings/notification-messages?kategori=xxx&page=1&limit=50 - Daftar pesan terkirim per kategori. Hanya super_admin.
     */
    public function getNotificationMessages(Request $request, Response $response): Response
    {
        try {
            $kategori = trim((string) ($request->getQueryParams()['kategori'] ?? ''));
            if ($kategori === '') {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'kategori wajib'], 400);
            }
            $page = max(1, (int) ($request->getQueryParams()['page'] ?? 1));
            $limit = max(1, min(100, (int) ($request->getQueryParams()['limit'] ?? 50)));
            $offset = ($page - 1) * $limit;

            $hasArah = $this->db->query("SHOW COLUMNS FROM whatsapp LIKE 'arah'")->rowCount() > 0;
            $where = $hasArah
                ? "WHERE (arah = 'keluar' OR arah IS NULL) AND kategori = ?"
                : "WHERE kategori = ?";
            $countStmt = $this->db->prepare("SELECT COUNT(*) FROM whatsapp {$where}");
            $countStmt->execute([$kategori]);
            $total = (int) $countStmt->fetchColumn();

            $cols = 'id, nomor_tujuan, isi_pesan, status, created_at';
            $order = 'ORDER BY created_at DESC';
            $listStmt = $this->db->prepare("SELECT {$cols} FROM whatsapp {$where} {$order} LIMIT {$limit} OFFSET {$offset}");
            $listStmt->execute([$kategori]);
            $list = $listStmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'items' => $list,
                    'total' => $total,
                    'page' => $page,
                    'limit' => $limit,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('SettingsController::getNotificationMessages ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil pesan notifikasi',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * POST /api/settings/error-alert/test
     * Body opsional: { "phone": "0822...", "message": "..." }
     * Kirim tes alert error WA dengan prioritas WA server sendiri.
     */
    public function postErrorAlertTest(Request $request, Response $response): Response
    {
        try {
            $enabled = filter_var((string) (getenv('ERROR_ALERT_ENABLED') ?: 'true'), FILTER_VALIDATE_BOOLEAN);
            if (!$enabled) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ERROR_ALERT_ENABLED=false. Aktifkan dulu untuk tes.',
                ], 400);
            }

            $body = (array) $request->getParsedBody();
            $phoneRaw = isset($body['phone']) ? (string) $body['phone'] : (string) (getenv('ERROR_ALERT_WA_NUMBER') ?: '082232999921');
            $phone = preg_replace('/\D/', '', $phoneRaw) ?: '';
            if ($phone === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nomor tujuan tidak valid.',
                ], 400);
            }

            $customMessage = isset($body['message']) ? trim((string) $body['message']) : '';
            $text = $customMessage !== '' ? $customMessage : (
                "*TEST ALERT API ERROR*\n"
                . "Env: " . (string) (getenv('APP_ENV') ?: 'local') . "\n"
                . "Waktu: " . date('Y-m-d H:i:s') . " WIB\n"
                . "Sumber: /api/settings/error-alert/test\n"
                . "Status: Ini pesan tes, bukan error asli."
            );

            $preferOwnWa = ((string) (getenv('ERROR_ALERT_PROVIDER') ?: 'wa_sendiri')) !== 'watzap';
            $usedProvider = 'watzap';
            $sent = false;
            $resultMessage = '';
            $waHealth = null;

            if ($preferOwnWa) {
                $waStatus = WhatsAppService::fetchNodeSessionStatus(WhatsAppService::getPrimaryWaSessionId());
                $waHealth = [
                    'reachable' => is_array($waStatus),
                    'baileys_status' => is_array($waStatus) ? (string) ($waStatus['baileysStatus'] ?? $waStatus['status'] ?? '-') : 'unreachable',
                ];
                $res = WhatsAppService::sendMessage($phone, $text, null, [
                    'tujuan' => 'pengurus',
                    'kategori' => 'error_alert_test',
                    'sumber' => 'settings',
                ]);
                if (!empty($res['success'])) {
                    $sent = true;
                    $usedProvider = 'wa_sendiri';
                    $resultMessage = (string) ($res['message'] ?? 'OK');
                }
            }

            if (!$sent) {
                $res = WatzapService::sendMessage($phone, $text);
                if (!empty($res['success'])) {
                    $sent = true;
                    $usedProvider = 'watzap';
                    $resultMessage = (string) ($res['message'] ?? 'OK');
                } else {
                    $resultMessage = (string) ($res['message'] ?? 'Gagal kirim notifikasi tes');
                }
            }

            if (!$sent) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tes alert gagal dikirim.',
                    'data' => [
                        'provider' => $usedProvider,
                        'phone' => $phone,
                        'provider_message' => $resultMessage,
                    'wa_health' => $waHealth,
                    ],
                ], 500);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Tes alert berhasil dikirim.',
                'data' => [
                    'provider' => $usedProvider,
                    'phone' => $phone,
                    'provider_message' => $resultMessage,
                    'wa_health' => $waHealth,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('SettingsController::postErrorAlertTest ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menjalankan tes alert error',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /api/settings/role-boleh-assign — daftar role + pasangan (role___boleh_assign_role). Super admin.
     */
    public function getRoleBolehAssign(Request $request, Response $response): Response
    {
        try {
            $rolesStmt = $this->db->query('SELECT `id`, `key`, `label` FROM `role` ORDER BY `id` ASC');
            $roles = array_map(static function ($r) {
                return [
                    'id' => (int) ($r['id'] ?? 0),
                    'key' => (string) ($r['key'] ?? ''),
                    'label' => (string) ($r['label'] ?? ''),
                ];
            }, $rolesStmt->fetchAll(\PDO::FETCH_ASSOC));

            $pairs = [];
            $pStmt = $this->db->query(
                'SELECT r.`id`, r.`role_id`, r.`assignable_role_id`, '
                . 'g.`key` AS `granting_key`, g.`label` AS `granting_label`, '
                . 'a.`key` AS `assignable_key`, a.`label` AS `assignable_label` '
                . 'FROM `role___boleh_assign_role` r '
                . 'INNER JOIN `role` g ON g.`id` = r.`role_id` '
                . 'INNER JOIN `role` a ON a.`id` = r.`assignable_role_id` '
                . 'ORDER BY r.`role_id` ASC, r.`assignable_role_id` ASC'
            );
            foreach ($pStmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
                $pairs[] = [
                    'id' => (int) ($row['id'] ?? 0),
                    'role_id' => (int) ($row['role_id'] ?? 0),
                    'assignable_role_id' => (int) ($row['assignable_role_id'] ?? 0),
                    'granting_key' => (string) ($row['granting_key'] ?? ''),
                    'granting_label' => (string) ($row['granting_label'] ?? ''),
                    'assignable_key' => (string) ($row['assignable_key'] ?? ''),
                    'assignable_label' => (string) ($row['assignable_label'] ?? ''),
                ];
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'roles' => $roles,
                    'pairs' => $pairs,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('SettingsController::getRoleBolehAssign ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memuat matriks penugasan role. Pastikan migrasi tabel role___boleh_assign_role sudah dijalankan.',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * PUT /api/settings/role-boleh-assign — body: { pairs: [ { role_id, assignable_role_id } ] }. Mengganti seluruh isi tabel. Super admin.
     */
    public function putRoleBolehAssign(Request $request, Response $response): Response
    {
        try {
            $body = (array) $request->getParsedBody();
            $pairsIn = $body['pairs'] ?? null;
            if (!\is_array($pairsIn)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Body wajib berisi pairs (array).',
                ], 400);
            }

            $normalized = [];
            $seen = [];
            foreach ($pairsIn as $p) {
                if (!\is_array($p)) {
                    continue;
                }
                $rid = (int) ($p['role_id'] ?? 0);
                $aid = (int) ($p['assignable_role_id'] ?? 0);
                if ($rid <= 0 || $aid <= 0) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Setiap pasangan wajib memiliki role_id dan assignable_role_id yang valid.',
                    ], 400);
                }
                $k = $rid . ':' . $aid;
                if (isset($seen[$k])) {
                    continue;
                }
                $seen[$k] = true;
                $normalized[] = ['role_id' => $rid, 'assignable_role_id' => $aid];
            }

            $roleCheck = $this->db->prepare('SELECT 1 FROM `role` WHERE `id` = ? LIMIT 1');
            foreach ($normalized as $row) {
                $roleCheck->execute([$row['role_id']]);
                if (!$roleCheck->fetchColumn()) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Role penugas tidak ditemukan: id ' . $row['role_id'],
                    ], 400);
                }
                $roleCheck->execute([$row['assignable_role_id']]);
                if (!$roleCheck->fetchColumn()) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Role yang boleh ditugaskan tidak ditemukan: id ' . $row['assignable_role_id'],
                    ], 400);
                }
            }

            $this->db->beginTransaction();
            try {
                $this->db->exec('DELETE FROM `role___boleh_assign_role`');
                if ($normalized !== []) {
                    $ins = $this->db->prepare(
                        'INSERT INTO `role___boleh_assign_role` (`role_id`, `assignable_role_id`) VALUES (?, ?)'
                    );
                    foreach ($normalized as $row) {
                        $ins->execute([$row['role_id'], $row['assignable_role_id']]);
                    }
                }
                $this->db->commit();
            } catch (\Throwable $e) {
                $this->db->rollBack();
                throw $e;
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Matriks penugasan role disimpan.',
                'data' => [
                    'count' => \count($normalized),
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('SettingsController::putRoleBolehAssign ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan matriks penugasan role.',
                'error' => $e->getMessage(),
            ], 500);
        }
    }
}
