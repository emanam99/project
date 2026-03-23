<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\WaInteractiveMenuService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Menu balasan otomatis WA (super_admin). GET/PUT tree + pengaturan on/off.
 */
class WaInteractiveMenuController
{
    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * GET /api/wa-interactive-menu/settings
     */
    public function getSettings(Request $request, Response $response): Response
    {
        return $this->jsonResponse($response, [
            'success' => true,
            'data' => [
                'enabled' => WaInteractiveMenuService::isEnabled(),
            ],
        ], 200);
    }

    /**
     * PUT /api/wa-interactive-menu/settings — body: { "enabled": true|false }
     */
    public function putSettings(Request $request, Response $response): Response
    {
        $body = (array) $request->getParsedBody();
        $enabled = isset($body['enabled']) && ($body['enabled'] === true || $body['enabled'] === 1 || $body['enabled'] === '1');
        try {
            WaInteractiveMenuService::setEnabled($enabled);
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pengaturan disimpan',
                'data' => ['enabled' => WaInteractiveMenuService::isEnabled()],
            ], 200);
        } catch (\Throwable $e) {
            error_log('WaInteractiveMenuController::putSettings ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * GET /api/wa-interactive-menu/tree
     */
    public function getTree(Request $request, Response $response): Response
    {
        try {
            $rows = WaInteractiveMenuService::getAllNodesFlat();
            $nodes = [];
            foreach ($rows as $row) {
                $triggers = [];
                if (!empty($row['triggers_json'])) {
                    $dec = json_decode((string) $row['triggers_json'], true);
                    $triggers = is_array($dec) ? $dec : [];
                }
                $nodes[] = [
                    'id' => (int) ($row['id'] ?? 0),
                    'parent_id' => isset($row['parent_id']) && $row['parent_id'] !== null ? (int) $row['parent_id'] : null,
                    'sort_order' => (int) ($row['sort_order'] ?? 0),
                    'title' => (string) ($row['title'] ?? ''),
                    'body_text' => (string) ($row['body_text'] ?? ''),
                    'triggers' => $triggers,
                    'action_type' => (string) ($row['action_type'] ?? 'menu'),
                ];
            }
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'enabled' => WaInteractiveMenuService::isEnabled(),
                    'nodes' => $nodes,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('WaInteractiveMenuController::getTree ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memuat menu'], 500);
        }
    }

    /**
     * PUT /api/wa-interactive-menu/tree — body: { "nodes": [ { "parent_index": null|int, "sort_order", "title", "body_text", "triggers": [], "action_type" } ] }
     */
    public function putTree(Request $request, Response $response): Response
    {
        $body = $request->getParsedBody();
        if (!is_array($body)) {
            $body = [];
        }
        if (!isset($body['nodes'])) {
            $raw = (string) $request->getBody();
            $decoded = $raw !== '' ? json_decode($raw, true) : null;
            if (is_array($decoded) && isset($decoded['nodes'])) {
                $body = $decoded;
            }
        }
        $nodes = $body['nodes'] ?? null;
        if (!is_array($nodes)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'nodes wajib berupa array'], 400);
        }
        $normalized = [];
        foreach ($nodes as $n) {
            if (!is_array($n)) {
                continue;
            }
            $parentIndex = $n['parent_index'] ?? null;
            if ($parentIndex !== null && $parentIndex !== '') {
                $parentIndex = (int) $parentIndex;
            } else {
                $parentIndex = null;
            }
            $triggers = $n['triggers'] ?? [];
            if (!is_array($triggers)) {
                $triggers = is_string($triggers) ? array_map('trim', explode(',', $triggers)) : [];
            }
            $normalized[] = [
                'parent_index' => $parentIndex,
                'sort_order' => (int) ($n['sort_order'] ?? 0),
                'title' => trim((string) ($n['title'] ?? '')),
                'body_text' => isset($n['body_text']) ? (string) $n['body_text'] : '',
                'triggers' => $triggers,
                'action_type' => trim((string) ($n['action_type'] ?? 'menu')),
            ];
        }
        try {
            WaInteractiveMenuService::replaceTree($normalized);
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Menu disimpan',
            ], 200);
        } catch (\InvalidArgumentException $e) {
            return $this->jsonResponse($response, ['success' => false, 'message' => $e->getMessage()], 400);
        } catch (\Throwable $e) {
            error_log('WaInteractiveMenuController::putTree ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $msg = $e instanceof \RuntimeException ? $e->getMessage() : 'Gagal menyimpan menu';
            return $this->jsonResponse($response, ['success' => false, 'message' => $msg], 500);
        }
    }
}
