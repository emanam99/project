<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\RoleHelper;
use App\Services\BukuTamuService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class BukuTamuController
{
    private \PDO $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response->withStatus($statusCode)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    private function svc(): BukuTamuService
    {
        return new BukuTamuService($this->db);
    }

    /** @return array<string, mixed> */
    private function userFromRequest(Request $request): array
    {
        $u = $request->getAttribute('user');

        return is_array($u) ? $u : [];
    }

    /**
     * GET /api/v2/buku-tamu
     */
    public function getList(Request $request, Response $response): Response
    {
        try {
            $q = $request->getQueryParams();
            $result = $this->svc()->list([
                'tanggal' => $q['tanggal'] ?? '',
                'search' => $q['search'] ?? '',
                'page' => $q['page'] ?? 1,
                'limit' => $q['limit'] ?? 30,
            ]);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $result['items'],
                'pagination' => [
                    'total' => $result['total'],
                    'page' => $result['page'],
                    'limit' => $result['limit'],
                    'total_pages' => $result['total_pages'],
                ],
                'filter_tanggal' => trim((string) ($q['tanggal'] ?? '')) !== ''
                    ? trim((string) $q['tanggal'])
                    : (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d'),
            ], 200);
        } catch (\Throwable $e) {
            error_log('BukuTamuController::getList ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memuat buku tamu'], 500);
        }
    }

    /**
     * POST /api/v2/buku-tamu/scan — scan QR kartu CM & catat kunjungan.
     */
    public function scan(Request $request, Response $response): Response
    {
        try {
            $body = $request->getParsedBody();
            $body = is_array($body) ? $body : [];
            $token = trim((string) ($body['token'] ?? ''));
            $santriIds = null;
            if (isset($body['santri_ids']) && is_array($body['santri_ids'])) {
                $santriIds = array_map('intval', $body['santri_ids']);
            }
            $petugasId = RoleHelper::getPengurusIdFromPayload($this->userFromRequest($request));
            $result = $this->svc()->scanAndRecord($token, $santriIds, $petugasId);
            if (!$result['success']) {
                return $this->jsonResponse($response, $result, 400);
            }

            return $this->jsonResponse($response, $result, 200);
        } catch (\Throwable $e) {
            error_log('BukuTamuController::scan ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memproses scan'], 500);
        }
    }

    /**
     * PATCH /api/v2/buku-tamu/{id}/santri — perbarui santri yang didatangi (kunjungan terakhir).
     */
    public function patchSantri(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            $body = $request->getParsedBody();
            $body = is_array($body) ? $body : [];
            $santriIds = isset($body['santri_ids']) && is_array($body['santri_ids'])
                ? array_map('intval', $body['santri_ids'])
                : [];
            $result = $this->svc()->updateEntrySantri($id, $santriIds);
            if (!$result['success']) {
                return $this->jsonResponse($response, $result, 400);
            }

            return $this->jsonResponse($response, $result, 200);
        } catch (\Throwable $e) {
            error_log('BukuTamuController::patchSantri ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memperbarui'], 500);
        }
    }
}
