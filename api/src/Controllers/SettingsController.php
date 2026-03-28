<?php

namespace App\Controllers;

use App\Config\RoleConfig;
use App\Database;
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
     * GET /api/settings/roles-config - Daftar role dari tabel role + akses (aplikasi & permission) dari RoleConfig.
     * Hanya super_admin.
     */
    public function getRolesConfig(Request $request, Response $response): Response
    {
        try {
            $stmt = $this->db->query("SELECT id, `key`, label FROM `role` ORDER BY id ASC");
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $apps = RoleConfig::APPS;
            $roles = [];
            foreach ($rows as $row) {
                $roleKey = $row['key'] ?? '';
                $allowedApps = RoleConfig::getAllowedApps($roleKey);
                // Halaman Role hanya menampilkan role yang punya akses ke aplikasi UWABA
                if (!in_array('uwaba', $allowedApps)) {
                    continue;
                }
                $roles[] = [
                    'id' => (int) ($row['id'] ?? 0),
                    'key' => $roleKey,
                    'label' => $row['label'] ?? RoleConfig::getRoleLabel($roleKey),
                    'allowed_apps' => $allowedApps,
                    'allowed_apps_labels' => array_map(function ($appKey) use ($apps) {
                        return $apps[$appKey] ?? $appKey;
                    }, $allowedApps),
                    'permissions' => RoleConfig::getPermissions($roleKey),
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
                'SELECT `id`, `parent_id`, `code`, `label`, `path`, `group_label`, `sort_order`, `type` '
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
                $items[] = [
                    'id' => $fid,
                    'parent_id' => $pid !== null && $pid !== '' ? (int) $pid : null,
                    'code' => (string) ($f['code'] ?? ''),
                    'label' => (string) ($f['label'] ?? ''),
                    'path' => (string) ($f['path'] ?? ''),
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
     * PATCH /api/settings/ebeddien-menu-fitur/{fiturId} — body: { role_ids: number[] } untuk satu menu saja.
     */
    public function patchEbeddienMenuFiturItem(Request $request, Response $response, array $args): Response
    {
        try {
            $fiturId = (int) ($args['fiturId'] ?? 0);
            if ($fiturId <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'fiturId tidak valid'], 400);
            }

            $body = (array) $request->getParsedBody();
            $roleIds = $body['role_ids'] ?? null;
            if (!is_array($roleIds)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'role_ids wajib berupa array'], 400);
            }

            $appStmt = $this->db->prepare('SELECT `id` FROM `app` WHERE `key` = ? LIMIT 1');
            $appStmt->execute(['ebeddien']);
            $appRow = $appStmt->fetch(\PDO::FETCH_ASSOC);
            if ($appRow === false) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Aplikasi ebeddien tidak ditemukan.'], 404);
            }
            $appId = (int) $appRow['id'];

            $verifyFitur = $this->db->prepare(
                'SELECT `id` FROM `app___fitur` WHERE `id` = ? AND `id_app` = ? AND `type` IN (\'menu\', \'action\') LIMIT 1'
            );
            $verifyFitur->execute([$fiturId, $appId]);
            if ($verifyFitur->fetch(\PDO::FETCH_ASSOC) === false) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Fitur tidak ditemukan.'], 404);
            }

            $verifyRole = $this->db->prepare('SELECT `id` FROM `role` WHERE `id` = ? LIMIT 1');
            $this->db->beginTransaction();
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
            $this->db->commit();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Akses role untuk menu ini disimpan.',
                'data' => ['fitur_id' => $fiturId, 'role_ids' => array_keys($seen)],
            ], 200);
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('SettingsController::patchEbeddienMenuFiturItem ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan akses menu',
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
                    if (RoleConfig::canAccessApp($roleKey, $appKey)) {
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
                    if (RoleConfig::hasPermission($roleKey, $permKey)) {
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
     * GET /api/settings/notification-config - Provider notifikasi WA: wa_sendiri | watzap. Hanya super_admin.
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
            if ($provider !== 'watzap') {
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
     * PUT /api/settings/notification-config - Simpan provider: wa_sendiri | watzap. Hanya super_admin.
     */
    public function saveNotificationConfig(Request $request, Response $response): Response
    {
        try {
            $body = (array) $request->getParsedBody();
            $provider = isset($body['provider']) ? trim((string) $body['provider']) : '';
            if ($provider !== 'watzap') {
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
}
