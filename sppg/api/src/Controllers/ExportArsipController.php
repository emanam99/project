<?php

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\AuthHelper;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class ExportArsipController
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    private function json(Response $response, array $payload, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }

    private function denyUnlessSuper(?array $user, Response $response): ?Response
    {
        if (!AuthHelper::isSuperAdminRole($user['role'] ?? null)) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Hanya super admin yang dapat melihat arsip ekspor',
            ], 403);
        }
        return null;
    }

    /** GET /export-arsip?type=bni_csv|maker_xlsx */
    public function index(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        if ($denied = $this->denyUnlessSuper($user, $response)) {
            return $denied;
        }

        $q = $request->getQueryParams();
        $sql = 'SELECT b.id, b.export_type, b.nama_file, b.csv_filename, b.record_count, b.total_amount,
                       b.trx_date, b.status, b.bni_reference, b.email_datetime, b.matched_at, b.created_at,
                       b.created_by, u.name AS exported_by_name, u.email AS exported_by_email
                FROM bni_batch b
                LEFT JOIN users u ON u.id = b.created_by
                WHERE 1=1';
        $params = [];
        $type = trim((string) ($q['type'] ?? ''));
        if (in_array($type, ['bni_csv', 'maker_xlsx'], true)) {
            $sql .= ' AND b.export_type = ?';
            $params[] = $type;
        }
        $sql .= ' ORDER BY b.created_at DESC, b.id DESC LIMIT 200';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);

        return $this->json($response, ['success' => true, 'data' => $stmt->fetchAll()]);
    }

    /** GET /export-arsip/{id} — meta batch + daftar belanja */
    public function show(Request $request, Response $response, array $args): Response
    {
        $user = $request->getAttribute('user');
        if ($denied = $this->denyUnlessSuper($user, $response)) {
            return $denied;
        }

        $id = (int) ($args['id'] ?? 0);
        $stmt = $this->db->prepare(
            'SELECT b.*, u.name AS exported_by_name, u.email AS exported_by_email
             FROM bni_batch b
             LEFT JOIN users u ON u.id = b.created_by
             WHERE b.id = ?
             LIMIT 1'
        );
        $stmt->execute([$id]);
        $batch = $stmt->fetch();
        if (!$batch) {
            return $this->json($response, ['success' => false, 'message' => 'Arsip tidak ditemukan'], 404);
        }

        $ids = json_decode((string) ($batch['belanja_ids'] ?? '[]'), true);
        if (!is_array($ids)) {
            $ids = [];
        }
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn ($v) => $v > 0)));

        $belanja = [];
        if ($ids) {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $sql = "SELECT b.*, u.name AS created_by_name, u.email AS created_by_email,
                           r.nomor_rekening, r.nama_penerima, r.bank_tujuan, r.online_bank_code, r.jenis AS rekening_jenis,
                           (SELECT COUNT(*) FROM belanja_item bi WHERE bi.belanja_id = b.id) AS item_count
                    FROM belanja b
                    LEFT JOIN users u ON u.id = b.created_by
                    LEFT JOIN rekening r ON r.id = b.rekening_id
                    WHERE b.id IN ($placeholders)
                    ORDER BY FIELD(b.id, $placeholders)";
            $stmt = $this->db->prepare($sql);
            $stmt->execute(array_merge($ids, $ids));
            $belanja = $stmt->fetchAll() ?: [];
        }

        return $this->json($response, [
            'success' => true,
            'data' => [
                'batch' => $batch,
                'belanja' => $belanja,
            ],
        ]);
    }
}
