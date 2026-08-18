<?php

namespace App\Controllers;

use App\Config\Database;
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

    /** GET /kategori?jenis=masuk|keluar */
    public function index(Request $request, Response $response): Response
    {
        $jenis = strtolower(trim((string) ($request->getQueryParams()['jenis'] ?? '')));
        if (in_array($jenis, ['masuk', 'keluar'], true)) {
            $stmt = $this->db->prepare(
                "SELECT id, nama, jenis FROM kategori
                 WHERE jenis IN (?, 'semua')
                 ORDER BY nama ASC"
            );
            $stmt->execute([$jenis]);
            $rows = $stmt->fetchAll();
        } else {
            $rows = $this->db->query(
                'SELECT id, nama, jenis FROM kategori ORDER BY jenis ASC, nama ASC'
            )->fetchAll();
        }

        return $this->json($response, ['success' => true, 'data' => $rows]);
    }

    public static function ensureKategori(PDO $db, string $nama, string $jenis = 'semua'): void
    {
        $nama = trim($nama);
        if ($nama === '') {
            return;
        }
        if (!in_array($jenis, ['masuk', 'keluar', 'semua'], true)) {
            $jenis = 'semua';
        }
        $stmt = $db->prepare('INSERT IGNORE INTO kategori (nama, jenis) VALUES (?, ?)');
        $stmt->execute([$nama, $jenis]);
    }
}
