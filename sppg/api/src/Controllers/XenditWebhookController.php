<?php

namespace App\Controllers;

use App\Services\XenditService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class XenditWebhookController
{
    private XenditService $xendit;

    public function __construct()
    {
        $this->xendit = new XenditService();
    }

    private function json(Response $response, array $payload, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }

    /** POST /webhooks/xendit */
    public function invoice(Request $request, Response $response): Response
    {
        $token = $request->getHeaderLine('x-callback-token');
        if (!$this->xendit->verifyCallbackToken($token !== '' ? $token : null)) {
            return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
        }

        $body = json_decode((string) $request->getBody(), true);
        if (!is_array($body)) {
            return $this->json($response, ['success' => false, 'message' => 'Payload tidak valid'], 422);
        }

        try {
            $this->xendit->handleInvoiceWebhook($body);
            return $this->json($response, ['success' => true]);
        } catch (\Throwable $e) {
            return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 500);
        }
    }
}
