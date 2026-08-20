<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\SantriStatusHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class StatusSantriMasterController
{
    private \PDO $db;

    private const READ_ONLY_MESSAGE = 'Status santri tetap di kode, tidak bisa diubah';

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

    /** GET — daftar enum status santri (read-only). */
    public function getAll(Request $request, Response $response): Response
    {
        $list = SantriStatusHelper::allowedList();
        $data = array_map(static function (string $statusSantri): array {
            return ['status_santri' => $statusSantri];
        }, $list);

        return $this->jsonResponse($response, [
            'success' => true,
            'data' => $data,
        ], 200);
    }

    public function create(Request $request, Response $response): Response
    {
        return $this->jsonResponse($response, [
            'success' => false,
            'message' => self::READ_ONLY_MESSAGE,
        ], 400);
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        return $this->jsonResponse($response, [
            'success' => false,
            'message' => self::READ_ONLY_MESSAGE,
        ], 400);
    }

    public function setStatus(Request $request, Response $response, array $args): Response
    {
        return $this->jsonResponse($response, [
            'success' => false,
            'message' => self::READ_ONLY_MESSAGE,
        ], 400);
    }
}
