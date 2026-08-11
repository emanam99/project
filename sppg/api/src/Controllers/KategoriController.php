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

    /** GET /kategori — daftar kategori yang pernah dipakai / tersimpan */
    public function index(Request $request, Response $response): Response
    {
        $rows = $this->db->query(
            'SELECT id, nama FROM kategori ORDER BY nama ASC'
        )->fetchAll();

        return $this->json($response, ['success' => true, 'data' => $rows]);
    }

    public static function ensureKategori(PDO $db, string $nama): void
    {
        $nama = trim($nama);
        if ($nama === '') {
            return;
        }
        $stmt = $db->prepare('INSERT IGNORE INTO kategori (nama) VALUES (?)');
        $stmt->execute([$nama]);
    }
}
