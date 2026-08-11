<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Agregasi jumlah akun eBeddien (pengurus) vs MyBeddian (santri/toko/PJGT) untuk dashboard Super Admin.
 * Klasifikasi identitas selaras ManageUsersController::getAllUsersV2.
 */
class SuperAdminUsersStatsController
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

    public function getStats(Request $request, Response $response): Response
    {
        try {
            $row = $this->db->query("
                SELECT
                    COUNT(DISTINCT u.id) AS total_users,
                    COUNT(DISTINCT CASE WHEN COALESCE(u.is_active, 1) = 1 THEN u.id END) AS total_active,
                    COUNT(DISTINCT CASE WHEN p.id IS NOT NULL THEN u.id END) AS ebeddien_total,
                    COUNT(DISTINCT CASE WHEN p.id IS NOT NULL AND COALESCE(u.is_active, 1) = 1 THEN u.id END) AS ebeddien_active,
                    COUNT(DISTINCT CASE
                        WHEN santri_sc.id_user IS NOT NULL
                          OR toko_sc.id_user IS NOT NULL
                          OR pjgt_m.id IS NOT NULL
                        THEN u.id
                    END) AS mybeddien_total,
                    COUNT(DISTINCT CASE
                        WHEN (santri_sc.id_user IS NOT NULL OR toko_sc.id_user IS NOT NULL OR pjgt_m.id IS NOT NULL)
                          AND COALESCE(u.is_active, 1) = 1
                        THEN u.id
                    END) AS mybeddien_active,
                    COUNT(DISTINCT CASE
                        WHEN p.id IS NOT NULL
                          AND (santri_sc.id_user IS NOT NULL OR toko_sc.id_user IS NOT NULL OR pjgt_m.id IS NOT NULL)
                        THEN u.id
                    END) AS overlap_both,
                    COUNT(DISTINCT CASE WHEN santri_sc.id_user IS NOT NULL THEN u.id END) AS mybeddien_santri,
                    COUNT(DISTINCT CASE WHEN toko_sc.id_user IS NOT NULL THEN u.id END) AS mybeddien_toko,
                    COUNT(DISTINCT CASE WHEN pjgt_m.id IS NOT NULL THEN u.id END) AS mybeddien_pjgt
                FROM users u
                LEFT JOIN pengurus p ON p.id_user = u.id
                LEFT JOIN (
                    SELECT id_user
                    FROM santri
                    GROUP BY id_user
                ) santri_sc ON santri_sc.id_user = u.id
                LEFT JOIN (
                    SELECT id_users AS id_user
                    FROM cashless___pedagang
                    WHERE id_users IS NOT NULL
                    GROUP BY id_users
                ) toko_sc ON toko_sc.id_user = u.id
                LEFT JOIN madrasah pjgt_m ON pjgt_m.id_pjgt = u.id
            ")->fetch(\PDO::FETCH_ASSOC) ?: [];

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'total_users' => (int) ($row['total_users'] ?? 0),
                    'total_active' => (int) ($row['total_active'] ?? 0),
                    'ebeddien' => [
                        'total' => (int) ($row['ebeddien_total'] ?? 0),
                        'active' => (int) ($row['ebeddien_active'] ?? 0),
                    ],
                    'mybeddien' => [
                        'total' => (int) ($row['mybeddien_total'] ?? 0),
                        'active' => (int) ($row['mybeddien_active'] ?? 0),
                        'santri' => (int) ($row['mybeddien_santri'] ?? 0),
                        'toko' => (int) ($row['mybeddien_toko'] ?? 0),
                        'pjgt' => (int) ($row['mybeddien_pjgt'] ?? 0),
                    ],
                    'overlap_both' => (int) ($row['overlap_both'] ?? 0),
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('SuperAdminUsersStatsController::getStats ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat statistik pengguna'], 500);
        }
    }

    public function getTimeseries(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $days = max(1, min(365, (int) ($params['days'] ?? 30)));

            $ebeddienStmt = $this->db->prepare("
                SELECT DATE(p.tanggal_dibuat) AS d, COUNT(*) AS c
                FROM pengurus p
                WHERE p.tanggal_dibuat >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
                GROUP BY DATE(p.tanggal_dibuat)
                ORDER BY d ASC
            ");
            $ebeddienStmt->bindValue(':days', $days, \PDO::PARAM_INT);
            $ebeddienStmt->execute();
            $ebeddien = $ebeddienStmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            $mybeddienStmt = $this->db->prepare("
                SELECT DATE(u.tanggal_dibuat) AS d, COUNT(DISTINCT u.id) AS c
                FROM users u
                WHERE u.tanggal_dibuat >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
                  AND (
                    EXISTS (SELECT 1 FROM santri s WHERE s.id_user = u.id)
                    OR EXISTS (
                        SELECT 1 FROM cashless___pedagang cp
                        WHERE cp.id_users = u.id
                    )
                    OR EXISTS (SELECT 1 FROM madrasah m WHERE m.id_pjgt = u.id)
                  )
                GROUP BY DATE(u.tanggal_dibuat)
                ORDER BY d ASC
            ");
            $mybeddienStmt->bindValue(':days', $days, \PDO::PARAM_INT);
            $mybeddienStmt->execute();
            $mybeddien = $mybeddienStmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'days' => $days,
                    'ebeddien' => array_map(static fn (array $r) => [
                        'd' => (string) ($r['d'] ?? ''),
                        'c' => (int) ($r['c'] ?? 0),
                    ], $ebeddien),
                    'mybeddien' => array_map(static fn (array $r) => [
                        'd' => (string) ($r['d'] ?? ''),
                        'c' => (int) ($r['c'] ?? 0),
                    ], $mybeddien),
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('SuperAdminUsersStatsController::getTimeseries ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat tren pengguna'], 500);
        }
    }
}
