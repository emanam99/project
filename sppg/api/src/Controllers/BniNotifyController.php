<?php

namespace App\Controllers;

use App\Config\Database;
use App\Services\BniBatchService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class BniNotifyController
{
    private function json(Response $response, array $payload, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }

    private function assertCronKey(Request $request, Response $response): ?Response
    {
        $expected = trim((string) ($_ENV['BNI_CRON_KEY'] ?? ''));
        if ($expected === '') {
            return $this->json($response, [
                'success' => false,
                'message' => 'BNI_CRON_KEY belum dikonfigurasi di server',
            ], 503);
        }

        $q = $request->getQueryParams();
        $provided = trim((string) ($q['key'] ?? ''));
        if ($provided === '') {
            $provided = trim((string) $request->getHeaderLine('X-BNI-Cron-Key'));
        }
        if ($provided === '' || !hash_equals($expected, $provided)) {
            return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
        }
        return null;
    }

    /** GET/POST /cron/bni-email-poll?key= */
    public function poll(Request $request, Response $response): Response
    {
        if ($denied = $this->assertCronKey($request, $response)) {
            return $denied;
        }
        try {
            $svc = new BniBatchService(Database::getInstance());
            $result = $svc->pollImap(30);
            return $this->json($response, $result, !empty($result['success']) ? 200 : 422);
        } catch (\Throwable $e) {
            error_log('bni-email-poll: ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal poll email: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * POST /cron/bni-email-hook?key=
     * Body JSON: { "raw": "teks email..." } atau plain text.
     */
    public function hook(Request $request, Response $response): Response
    {
        if ($denied = $this->assertCronKey($request, $response)) {
            return $denied;
        }

        $contentType = strtolower($request->getHeaderLine('Content-Type'));
        $rawBody = (string) $request->getBody();
        $messageId = null;

        if (str_contains($contentType, 'application/json')) {
            $data = json_decode($rawBody, true);
            if (!is_array($data)) {
                return $this->json($response, ['success' => false, 'message' => 'JSON tidak valid'], 422);
            }
            $raw = (string) ($data['raw'] ?? $data['body'] ?? $data['text'] ?? '');
            $messageId = isset($data['message_id']) ? (string) $data['message_id'] : null;
        } else {
            $raw = $rawBody;
        }

        $raw = trim($raw);
        if ($raw === '') {
            return $this->json($response, ['success' => false, 'message' => 'Body email kosong'], 422);
        }

        try {
            $svc = new BniBatchService(Database::getInstance());
            $result = $svc->processEmailText($raw, $messageId);
            $code = !empty($result['success']) ? 200 : 422;
            return $this->json($response, $result, $code);
        } catch (\Throwable $e) {
            error_log('bni-email-hook: ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal memproses email: ' . $e->getMessage(),
            ], 500);
        }
    }
}
