<?php

namespace App\Controllers;

use App\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AppInstallActivityAdminController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    private function buildAppsFilterSql(): string
    {
        return "a.`key` IN ('ebeddien', 'mybeddien', 'nailul-murod')";
    }

    public function getOverview(Request $request, Response $response): Response
    {
        return $this->getDashboard($request, $response);
    }

    public function getTimeseries(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $days = max(1, min(365, (int) ($params['days'] ?? 30)));
            $appsFilter = $this->buildAppsFilterSql();

            $installsStmt = $this->db->prepare("
                SELECT DATE(ia.installed_at) AS d, COUNT(*) AS installs
                FROM app___install_activity ia
                INNER JOIN app a ON a.id = ia.id_app
                WHERE {$appsFilter}
                  AND ia.installed_at >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
                GROUP BY DATE(ia.installed_at)
                ORDER BY d ASC
            ");
            $installsStmt->bindValue(':days', $days, \PDO::PARAM_INT);
            $installsStmt->execute();
            $installs = $installsStmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            $activeStmt = $this->db->prepare("
                SELECT DATE(ev.occurred_at) AS d, COUNT(DISTINCT ev.id_install_activity) AS active
                FROM app___install_activity_event ev
                INNER JOIN app a ON a.id = ev.id_app
                WHERE {$appsFilter}
                  AND ev.occurred_at >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
                GROUP BY DATE(ev.occurred_at)
                ORDER BY d ASC
            ");
            $activeStmt->bindValue(':days', $days, \PDO::PARAM_INT);
            $activeStmt->execute();
            $active = $activeStmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'days' => $days,
                    'installs' => $installs,
                    'active' => $active,
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('AppInstallActivityAdminController::getTimeseries ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat timeseries analytics'], 500);
        }
    }

    public function getBreakdown(Request $request, Response $response): Response
    {
        try {
            $appsFilter = $this->buildAppsFilterSql();

            $perApp = $this->db->query("
                SELECT a.`key` AS app_key, a.label AS app_label, COUNT(*) AS total_installations
                FROM app___install_activity ia
                INNER JOIN app a ON a.id = ia.id_app
                WHERE {$appsFilter}
                GROUP BY a.id, a.`key`, a.label
                ORDER BY a.sort_order ASC, a.id ASC
            ")->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            $byMode = $this->db->query("
                SELECT ia.access_mode, COUNT(*) AS total
                FROM app___install_activity ia
                INNER JOIN app a ON a.id = ia.id_app
                WHERE {$appsFilter}
                GROUP BY ia.access_mode
                ORDER BY total DESC
            ")->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            $byBrowser = $this->db->query("
                SELECT COALESCE(NULLIF(TRIM(ia.browser_name), ''), 'Unknown') AS browser_name, COUNT(*) AS total
                FROM app___install_activity ia
                INNER JOIN app a ON a.id = ia.id_app
                WHERE {$appsFilter}
                GROUP BY COALESCE(NULLIF(TRIM(ia.browser_name), ''), 'Unknown')
                ORDER BY total DESC
                LIMIT 10
            ")->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'per_app' => $perApp,
                    'by_mode' => $byMode,
                    'by_browser' => $byBrowser,
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('AppInstallActivityAdminController::getBreakdown ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat breakdown analytics'], 500);
        }
    }

    public function getRetention(Request $request, Response $response): Response
    {
        try {
            $appsFilter = $this->buildAppsFilterSql();
            $cohortSql = "
                SELECT COUNT(*) AS cohort_size
                FROM app___install_activity ia
                INNER JOIN app a ON a.id = ia.id_app
                WHERE {$appsFilter}
            ";
            $cohortSize = (int) (($this->db->query($cohortSql)->fetch(\PDO::FETCH_ASSOC)['cohort_size'] ?? 0));

            $d1Sql = "
                SELECT COUNT(DISTINCT ev.id_install_activity) AS retained
                FROM app___install_activity_event ev
                INNER JOIN app___install_activity ia ON ia.id = ev.id_install_activity
                INNER JOIN app a ON a.id = ev.id_app
                WHERE {$appsFilter}
                  AND ev.occurred_at >= DATE_ADD(ia.installed_at, INTERVAL 1 DAY)
            ";
            $d7Sql = "
                SELECT COUNT(DISTINCT ev.id_install_activity) AS retained
                FROM app___install_activity_event ev
                INNER JOIN app___install_activity ia ON ia.id = ev.id_install_activity
                INNER JOIN app a ON a.id = ev.id_app
                WHERE {$appsFilter}
                  AND ev.occurred_at >= DATE_ADD(ia.installed_at, INTERVAL 7 DAY)
            ";
            $d30Sql = "
                SELECT COUNT(DISTINCT ev.id_install_activity) AS retained
                FROM app___install_activity_event ev
                INNER JOIN app___install_activity ia ON ia.id = ev.id_install_activity
                INNER JOIN app a ON a.id = ev.id_app
                WHERE {$appsFilter}
                  AND ev.occurred_at >= DATE_ADD(ia.installed_at, INTERVAL 30 DAY)
            ";
            $d1 = (int) (($this->db->query($d1Sql)->fetch(\PDO::FETCH_ASSOC)['retained'] ?? 0));
            $d7 = (int) (($this->db->query($d7Sql)->fetch(\PDO::FETCH_ASSOC)['retained'] ?? 0));
            $d30 = (int) (($this->db->query($d30Sql)->fetch(\PDO::FETCH_ASSOC)['retained'] ?? 0));

            $rate = static function (int $retained, int $cohort): float {
                if ($cohort <= 0) {
                    return 0.0;
                }
                return round(($retained / $cohort) * 100, 2);
            };

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'cohort_size' => $cohortSize,
                    'd1' => ['retained' => $d1, 'rate_percent' => $rate($d1, $cohortSize)],
                    'd7' => ['retained' => $d7, 'rate_percent' => $rate($d7, $cohortSize)],
                    'd30' => ['retained' => $d30, 'rate_percent' => $rate($d30, $cohortSize)],
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('AppInstallActivityAdminController::getRetention ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat retention analytics'], 500);
        }
    }

    public function getFunnel(Request $request, Response $response): Response
    {
        try {
            $appsFilter = $this->buildAppsFilterSql();
            $installed = (int) (($this->db->query("
                SELECT COUNT(*) AS c
                FROM app___install_activity ia
                INNER JOIN app a ON a.id = ia.id_app
                WHERE {$appsFilter}
            ")->fetch(\PDO::FETCH_ASSOC)['c'] ?? 0));

            $opened7d = (int) (($this->db->query("
                SELECT COUNT(DISTINCT ev.id_install_activity) AS c
                FROM app___install_activity_event ev
                INNER JOIN app a ON a.id = ev.id_app
                WHERE {$appsFilter}
                  AND ev.occurred_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            ")->fetch(\PDO::FETCH_ASSOC)['c'] ?? 0));

            $active24h = (int) (($this->db->query("
                SELECT COUNT(*) AS c
                FROM app___install_activity ia
                INNER JOIN app a ON a.id = ia.id_app
                WHERE {$appsFilter}
                  AND ia.last_active_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
            ")->fetch(\PDO::FETCH_ASSOC)['c'] ?? 0));

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'steps' => [
                        ['key' => 'installed', 'label' => 'Installed', 'count' => $installed],
                        ['key' => 'opened_7d', 'label' => 'Opened (7d)', 'count' => $opened7d],
                        ['key' => 'active_24h', 'label' => 'Active (24h)', 'count' => $active24h],
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('AppInstallActivityAdminController::getFunnel ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat funnel analytics'], 500);
        }
    }

    public function exportCsv(Request $request, Response $response): Response
    {
        try {
            $rows = $this->db->query("
                SELECT
                    a.`key` AS app_key,
                    a.label AS app_label,
                    ia.install_id,
                    ia.id_user,
                    u.username,
                    ia.access_mode,
                    ia.browser_name,
                    ia.installed_at,
                    ia.last_active_at
                FROM app___install_activity ia
                INNER JOIN app a ON a.id = ia.id_app
                LEFT JOIN users u ON u.id = ia.id_user
                WHERE " . $this->buildAppsFilterSql() . "
                ORDER BY ia.last_active_at DESC
                LIMIT 5000
            ")->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            $lines = [];
            $lines[] = 'app_key,app_label,install_id,id_user,username,access_mode,browser_name,installed_at,last_active_at';
            foreach ($rows as $r) {
                $vals = [
                    (string) ($r['app_key'] ?? ''),
                    (string) ($r['app_label'] ?? ''),
                    (string) ($r['install_id'] ?? ''),
                    (string) ($r['id_user'] ?? ''),
                    (string) ($r['username'] ?? ''),
                    (string) ($r['access_mode'] ?? ''),
                    (string) ($r['browser_name'] ?? ''),
                    (string) ($r['installed_at'] ?? ''),
                    (string) ($r['last_active_at'] ?? ''),
                ];
                $escaped = array_map(static function (string $v): string {
                    return '"' . str_replace('"', '""', $v) . '"';
                }, $vals);
                $lines[] = implode(',', $escaped);
            }

            $csv = implode("\n", $lines);
            $response->getBody()->write($csv);
            return $response
                ->withHeader('Content-Type', 'text/csv; charset=utf-8')
                ->withHeader('Content-Disposition', 'attachment; filename="app-install-activity.csv"');
        } catch (\Throwable $e) {
            error_log('AppInstallActivityAdminController::exportCsv ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal export CSV'], 500);
        }
    }

    public function deployChecklist(Request $request, Response $response): Response
    {
        return $this->json($response, [
            'success' => true,
            'data' => [
                'checklist' => [
                    'Jalankan migrate di API (schema event + menu split).',
                    'Deploy API terbaru (controller analytics + notifier).',
                    'Deploy live server terbaru (event app_install_activity_hint + app_install_kpi_updated).',
                    'Deploy frontend eBeddien terbaru (route online/dashboard + UI dashboard).',
                    'Verifikasi socket tersambung: users_updated dan app_install_activity_hint.',
                    'Verifikasi role akses pada menu Online dan Dashboard di halaman Fitur.',
                    'Uji export CSV dari dashboard analytics.',
                ],
            ],
        ]);
    }

    public function getDashboard(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $days = (int) ($params['days'] ?? 30);
            if ($days < 1) {
                $days = 1;
            } elseif ($days > 365) {
                $days = 365;
            }

            $totalsSql = "
                SELECT
                    COUNT(*) AS total_installations,
                    SUM(CASE WHEN ia.last_active_at >= DATE_SUB(NOW(), INTERVAL 1 DAY) THEN 1 ELSE 0 END) AS active_24h,
                    SUM(CASE WHEN ia.last_active_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS active_7d,
                    SUM(CASE WHEN ia.access_mode = 'pwa' THEN 1 ELSE 0 END) AS total_pwa,
                    SUM(CASE WHEN ia.access_mode = 'browser' THEN 1 ELSE 0 END) AS total_browser
                FROM app___install_activity ia
                INNER JOIN app a ON a.id = ia.id_app
                WHERE a.`key` IN ('ebeddien', 'mybeddien', 'nailul-murod')
            ";
            $totals = $this->db->query($totalsSql)->fetch(\PDO::FETCH_ASSOC) ?: [];

            $perAppStmt = $this->db->prepare("
                SELECT
                    a.`key` AS app_key,
                    a.label AS app_label,
                    COUNT(*) AS total_installations,
                    SUM(CASE WHEN ia.last_active_at >= DATE_SUB(NOW(), INTERVAL 1 DAY) THEN 1 ELSE 0 END) AS active_24h,
                    SUM(CASE WHEN ia.last_active_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS active_7d,
                    SUM(CASE WHEN ia.access_mode = 'pwa' THEN 1 ELSE 0 END) AS total_pwa,
                    SUM(CASE WHEN ia.access_mode = 'browser' THEN 1 ELSE 0 END) AS total_browser,
                    MAX(ia.last_active_at) AS last_active_at
                FROM app___install_activity ia
                INNER JOIN app a ON a.id = ia.id_app
                WHERE a.`key` IN ('ebeddien', 'mybeddien', 'nailul-murod')
                GROUP BY a.id, a.`key`, a.label
                ORDER BY a.sort_order ASC, a.id ASC
            ");
            $perAppStmt->execute();
            $perApp = $perAppStmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            $trendStmt = $this->db->prepare("
                SELECT
                    DATE(ia.installed_at) AS install_date,
                    COUNT(*) AS installs_count
                FROM app___install_activity ia
                INNER JOIN app a ON a.id = ia.id_app
                WHERE a.`key` IN ('ebeddien', 'mybeddien', 'nailul-murod')
                  AND ia.installed_at >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
                GROUP BY DATE(ia.installed_at)
                ORDER BY install_date ASC
            ");
            $trendStmt->bindValue(':days', $days, \PDO::PARAM_INT);
            $trendStmt->execute();
            $trend = $trendStmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            $activeDailyStmt = $this->db->prepare("
                SELECT
                    DATE(ev.occurred_at) AS activity_date,
                    COUNT(DISTINCT ev.id_install_activity) AS active_installs
                FROM app___install_activity_event ev
                INNER JOIN app a ON a.id = ev.id_app
                WHERE a.`key` IN ('ebeddien', 'mybeddien', 'nailul-murod')
                  AND ev.occurred_at >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
                GROUP BY DATE(ev.occurred_at)
                ORDER BY activity_date ASC
            ");
            $activeDailyStmt->bindValue(':days', $days, \PDO::PARAM_INT);
            $activeDailyStmt->execute();
            $activeDaily = $activeDailyStmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            $dauStmt = $this->db->query("
                SELECT COUNT(DISTINCT ev.id_install_activity) AS dau
                FROM app___install_activity_event ev
                INNER JOIN app a ON a.id = ev.id_app
                WHERE a.`key` IN ('ebeddien', 'mybeddien', 'nailul-murod')
                  AND ev.occurred_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
            ");
            $dau = (int) (($dauStmt->fetch(\PDO::FETCH_ASSOC)['dau'] ?? 0));

            $wauStmt = $this->db->query("
                SELECT COUNT(DISTINCT ev.id_install_activity) AS wau
                FROM app___install_activity_event ev
                INNER JOIN app a ON a.id = ev.id_app
                WHERE a.`key` IN ('ebeddien', 'mybeddien', 'nailul-murod')
                  AND ev.occurred_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            ");
            $wau = (int) (($wauStmt->fetch(\PDO::FETCH_ASSOC)['wau'] ?? 0));

            $mauStmt = $this->db->query("
                SELECT COUNT(DISTINCT ev.id_install_activity) AS mau
                FROM app___install_activity_event ev
                INNER JOIN app a ON a.id = ev.id_app
                WHERE a.`key` IN ('ebeddien', 'mybeddien', 'nailul-murod')
                  AND ev.occurred_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            ");
            $mau = (int) (($mauStmt->fetch(\PDO::FETCH_ASSOC)['mau'] ?? 0));

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'days' => $days,
                    'totals' => [
                        'total_installations' => (int) ($totals['total_installations'] ?? 0),
                        'active_24h' => (int) ($totals['active_24h'] ?? 0),
                        'active_7d' => (int) ($totals['active_7d'] ?? 0),
                        'total_pwa' => (int) ($totals['total_pwa'] ?? 0),
                        'total_browser' => (int) ($totals['total_browser'] ?? 0),
                        'dau' => $dau,
                        'wau' => $wau,
                        'mau' => $mau,
                    ],
                    'per_app' => array_map(static function (array $r): array {
                        return [
                            'app_key' => (string) ($r['app_key'] ?? ''),
                            'app_label' => (string) ($r['app_label'] ?? ''),
                            'total_installations' => (int) ($r['total_installations'] ?? 0),
                            'active_24h' => (int) ($r['active_24h'] ?? 0),
                            'active_7d' => (int) ($r['active_7d'] ?? 0),
                            'total_pwa' => (int) ($r['total_pwa'] ?? 0),
                            'total_browser' => (int) ($r['total_browser'] ?? 0),
                            'last_active_at' => $r['last_active_at'] ?? null,
                        ];
                    }, $perApp),
                    'installs_trend' => array_map(static function (array $r): array {
                        return [
                            'install_date' => (string) ($r['install_date'] ?? ''),
                            'installs_count' => (int) ($r['installs_count'] ?? 0),
                        ];
                    }, $trend),
                    'active_daily_trend' => array_map(static function (array $r): array {
                        return [
                            'activity_date' => (string) ($r['activity_date'] ?? ''),
                            'active_installs' => (int) ($r['active_installs'] ?? 0),
                        ];
                    }, $activeDaily),
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('AppInstallActivityAdminController::getDashboard ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat dashboard install activity'], 500);
        }
    }

    public function getList(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $page = max(1, (int) ($params['page'] ?? 1));
            $limit = (int) ($params['limit'] ?? 20);
            if ($limit < 1) {
                $limit = 20;
            } elseif ($limit > 200) {
                $limit = 200;
            }
            $offset = ($page - 1) * $limit;

            $allowedApps = ['ebeddien', 'mybeddien', 'nailul-murod'];
            $appKey = strtolower(trim((string) ($params['app_key'] ?? '')));
            if ($appKey !== '' && !in_array($appKey, $allowedApps, true)) {
                return $this->json($response, ['success' => false, 'message' => 'app_key tidak valid'], 400);
            }

            $accessMode = strtolower(trim((string) ($params['access_mode'] ?? '')));
            if ($accessMode !== '' && !in_array($accessMode, ['browser', 'pwa'], true)) {
                return $this->json($response, ['success' => false, 'message' => 'access_mode harus browser atau pwa'], 400);
            }

            $search = trim((string) ($params['search'] ?? ''));
            $days = (int) ($params['days'] ?? 0);
            if ($days < 0) {
                $days = 0;
            } elseif ($days > 365) {
                $days = 365;
            }

            $where = ["a.`key` IN ('ebeddien', 'mybeddien', 'nailul-murod')"];
            $bind = [];

            if ($appKey !== '') {
                $where[] = "a.`key` = :app_key";
                $bind[':app_key'] = $appKey;
            }
            if ($accessMode !== '') {
                $where[] = "ia.access_mode = :access_mode";
                $bind[':access_mode'] = $accessMode;
            }
            if ($days > 0) {
                $where[] = "ia.last_active_at >= DATE_SUB(NOW(), INTERVAL :days DAY)";
                $bind[':days'] = $days;
            }
            if ($search !== '') {
                $where[] = "(ia.install_id LIKE :search OR ia.browser_name LIKE :search OR u.username LIKE :search)";
                $bind[':search'] = '%' . $search . '%';
            }

            $whereSql = 'WHERE ' . implode(' AND ', $where);

            $countSql = "
                SELECT COUNT(*) AS total_rows
                FROM app___install_activity ia
                INNER JOIN app a ON a.id = ia.id_app
                LEFT JOIN users u ON u.id = ia.id_user
                $whereSql
            ";
            $countStmt = $this->db->prepare($countSql);
            foreach ($bind as $k => $v) {
                $type = is_int($v) ? \PDO::PARAM_INT : \PDO::PARAM_STR;
                $countStmt->bindValue($k, $v, $type);
            }
            $countStmt->execute();
            $totalRows = (int) ($countStmt->fetchColumn() ?: 0);

            $dataSql = "
                SELECT
                    ia.id,
                    a.`key` AS app_key,
                    a.label AS app_label,
                    ia.install_id,
                    ia.id_user,
                    u.username,
                    ia.access_mode,
                    ia.browser_name,
                    ia.user_agent,
                    ia.installed_at,
                    ia.last_active_at
                FROM app___install_activity ia
                INNER JOIN app a ON a.id = ia.id_app
                LEFT JOIN users u ON u.id = ia.id_user
                $whereSql
                ORDER BY ia.last_active_at DESC, ia.id DESC
                LIMIT :limit OFFSET :offset
            ";
            $stmt = $this->db->prepare($dataSql);
            foreach ($bind as $k => $v) {
                $type = is_int($v) ? \PDO::PARAM_INT : \PDO::PARAM_STR;
                $stmt->bindValue($k, $v, $type);
            }
            $stmt->bindValue(':limit', $limit, \PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, \PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            return $this->json($response, [
                'success' => true,
                'data' => $rows,
                'pagination' => [
                    'page' => $page,
                    'limit' => $limit,
                    'total_rows' => $totalRows,
                    'total_pages' => $limit > 0 ? (int) ceil($totalRows / $limit) : 1,
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('AppInstallActivityAdminController::getList ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat data install activity'], 500);
        }
    }

    public function getRealtime(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $activeMinutes = (int) ($params['active_minutes'] ?? 5);
            if ($activeMinutes < 1) {
                $activeMinutes = 1;
            } elseif ($activeMinutes > 120) {
                $activeMinutes = 120;
            }

            $summaryStmt = $this->db->prepare("
                SELECT
                    a.`key` AS app_key,
                    a.label AS app_label,
                    COUNT(*) AS active_now
                FROM app___install_activity ia
                INNER JOIN app a ON a.id = ia.id_app
                WHERE a.`key` IN ('ebeddien', 'mybeddien', 'nailul-murod')
                  AND ia.last_active_at >= DATE_SUB(NOW(), INTERVAL :active_minutes MINUTE)
                GROUP BY a.id, a.`key`, a.label
                ORDER BY a.sort_order ASC, a.id ASC
            ");
            $summaryStmt->bindValue(':active_minutes', $activeMinutes, \PDO::PARAM_INT);
            $summaryStmt->execute();
            $summaryRows = $summaryStmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            $orderedApps = [
                'ebeddien' => 'Aplikasi eBeddien',
                'mybeddien' => 'Aplikasi MyBeddien',
                'nailul-murod' => 'Aplikasi Nailul Murod',
            ];
            $perAppMap = [];
            foreach ($orderedApps as $k => $label) {
                $perAppMap[$k] = [
                    'app_key' => $k,
                    'app_label' => $label,
                    'active_now' => 0,
                ];
            }
            foreach ($summaryRows as $row) {
                $k = (string) ($row['app_key'] ?? '');
                if ($k !== '' && isset($perAppMap[$k])) {
                    $perAppMap[$k]['app_label'] = (string) ($row['app_label'] ?? $perAppMap[$k]['app_label']);
                    $perAppMap[$k]['active_now'] = (int) ($row['active_now'] ?? 0);
                }
            }
            $perAppOrdered = array_values($perAppMap);

            $totalActiveNow = 0;
            foreach ($perAppOrdered as $row) {
                $totalActiveNow += (int) ($row['active_now'] ?? 0);
            }

            $listStmt = $this->db->prepare("
                SELECT
                    ia.id,
                    a.`key` AS app_key,
                    a.label AS app_label,
                    ia.install_id,
                    ia.id_user,
                    u.username,
                    ia.access_mode,
                    ia.browser_name,
                    ia.last_active_at
                FROM app___install_activity ia
                INNER JOIN app a ON a.id = ia.id_app
                LEFT JOIN users u ON u.id = ia.id_user
                WHERE a.`key` IN ('ebeddien', 'mybeddien', 'nailul-murod')
                  AND ia.last_active_at >= DATE_SUB(NOW(), INTERVAL :active_minutes MINUTE)
                ORDER BY ia.last_active_at DESC, ia.id DESC
                LIMIT 100
            ");
            $listStmt->bindValue(':active_minutes', $activeMinutes, \PDO::PARAM_INT);
            $listStmt->execute();
            $listRows = $listStmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'active_minutes' => $activeMinutes,
                    'total_active_now' => $totalActiveNow,
                    'per_app' => $perAppOrdered,
                    'active_list' => $listRows,
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('AppInstallActivityAdminController::getRealtime ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat data realtime install activity'], 500);
        }
    }
}
