<?php

namespace App\Controllers;

use App\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AlamatController
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
     * GET /api/alamat - Daftar wilayah untuk dropdown berjenjang.
     * Query: tipe = provinsi|kabupaten|kecamatan|desa, parent = id induk (opsional).
     * Contoh: ?tipe=provinsi | ?tipe=kabupaten&parent=11 | ?tipe=desa&parent=11.01.01
     */
    public function getList(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $tipe = isset($params['tipe']) ? trim((string) $params['tipe']) : null;
            $parent = isset($params['parent']) ? trim((string) $params['parent']) : null;

            $allowedTipe = ['provinsi', 'kabupaten', 'kecamatan', 'desa', 'dusun'];
            if ($tipe !== null && $tipe !== '' && !in_array($tipe, $allowedTipe, true)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter tipe tidak valid'
                ], 400);
            }

            $sql = "SELECT id, nama, tipe, kode_pos FROM alamat WHERE 1=1";
            $bind = [];

            if ($tipe !== null && $tipe !== '') {
                $sql .= " AND tipe = ?";
                $bind[] = $tipe;
            }

            if ($parent !== null && $parent !== '') {
                $sql .= " AND id LIKE ? AND id NOT LIKE ?";
                $bind[] = $parent . '.%';
                $bind[] = $parent . '.%.%';
            }

            $sql .= " ORDER BY nama ASC";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $list = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $list
            ], 200);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data alamat'
            ], 500);
        }
    }
}
