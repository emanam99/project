<?php

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\TenantHelper;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class KategoriController
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

    /** GET /kategori */
    public function index(Request $request, Response $response): Response
    {
        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $stmt = $this->db->prepare('SELECT id, nama FROM kategori WHERE sppg_id = ? ORDER BY nama ASC');
        $stmt->execute([$sppgId]);
        return $this->json($response, ['success' => true, 'data' => $stmt->fetchAll()]);
    }

    public static function ensureKategori(PDO $db, int $sppgId, string $nama): void
    {
        $nama = trim($nama);
        if ($nama === '') {
            return;
        }
        $stmt = $db->prepare('INSERT IGNORE INTO kategori (sppg_id, nama) VALUES (?, ?)');
        $stmt->execute([$sppgId, $nama]);
    }
}
