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
}
