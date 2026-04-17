<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\EvolutionApiService;
use App\Services\EvolutionInboundParser;
use App\Services\WhatsAppInboundService;
use App\Services\WhatsAppService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Webhook pesan masuk dari Evolution API (MESSAGES_UPSERT) → alur sama dengan POST /api/wa/incoming.
 *
 * URL (set di Evolution instance webhook): {API_PUBLIC_URL}/api/public/evolution-webhook
 * Opsional keamanan: set EVOLUTION_WEBHOOK_SECRET di api/.env lalu tambahkan ?secret=... atau header X-Ebeddien-Webhook-Secret.
 *
 * Event yang disarankan: MESSAGES_UPSERT. webhook_by_events false agar satu URL.
 *
 * @see https://doc.evolution-api.com/v2/en/configuration/webhooks
 */
final class EvolutionWebhookController
{
    private function json(Response $response, array $data, int $code = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response
            ->withStatus($code)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    private static function webhookSecretValid(Request $request): bool
    {
        $expected = trim((string) \getenv('EVOLUTION_WEBHOOK_SECRET'));
        if ($expected === '') {
            return true;
        }
        $q = isset($request->getQueryParams()['secret']) ? (string) $request->getQueryParams()['secret'] : '';
        $h = $request->getHeaderLine('X-Ebeddien-Webhook-Secret');

        return hash_equals($expected, $q) || hash_equals($expected, $h);
    }

    public function receive(Request $request, Response $response): Response
    {
        if (!self::webhookSecretValid($request)) {
            return $this->json($response, ['success' => false, 'message' => 'Forbidden'], 403);
        }

        $raw = (string) $request->getBody();
        $payload = $request->getParsedBody();
        if (!\is_array($payload)) {
            $payload = json_decode($raw, true) ?? [];
        }
        if (!\is_array($payload)) {
            error_log('EvolutionWebhookController: body bukan JSON');
            return $this->json($response, ['success' => true, 'message' => 'ignored'], 200);
        }

        $payloadInstance = trim((string) ($payload['instance'] ?? ''));
        $storedInst = EvolutionApiService::getStoredInstanceName();
        if ($storedInst !== '' && $payloadInstance !== '' && strcasecmp($payloadInstance, $storedInst) !== 0) {
            error_log('EvolutionWebhookController: abaikan — instance payload "' . $payloadInstance . '" ≠ default tersimpan "' . $storedInst . '"');

            return $this->json($response, ['success' => true, 'message' => 'instance mismatch', 'processed' => 0], 200);
        }

        $items = EvolutionInboundParser::extractInboundMessages($payload);
        if ($items === []) {
            $ev = (string) ($payload['event'] ?? '');
            error_log('EvolutionWebhookController: tidak ada teks masuk yang diproses (event=' . $ev . '). Pastikan di Evolution WEBHOOK_EVENTS_MESSAGES_UPSERT=true dan URL webhook benar; HTTP 403 = cek EVOLUTION_WEBHOOK_SECRET.');

            return $this->json($response, ['success' => true, 'message' => 'no inbound text', 'processed' => 0], 200);
        }

        $processed = 0;
        foreach ($items as $row) {
            $from = trim((string) ($row['from'] ?? ''));
            $fromJid = trim((string) ($row['from_jid'] ?? ''));
            $text = (string) ($row['text'] ?? '');
            $messageId = $row['message_id'] ?? null;
            $isGroup = $row['is_group'] ?? null;

            $nomorFrom = WhatsAppService::normalizeWebhookFrom($from, $fromJid !== '' ? $fromJid : null);
            if (strlen($nomorFrom) < 10) {
                error_log('EvolutionWebhookController: skip nomor tidak valid from=' . substr($from, 0, 24));
                continue;
            }
            $nomorTujuan = $nomorFrom;

            $res = WhatsAppInboundService::persistInboundAndRun(
                $nomorTujuan,
                $text,
                $messageId,
                $fromJid !== '' ? $fromJid : null,
                $isGroup,
                'evolution'
            );
            if (!empty($res['success'])) {
                $processed++;
            }
        }

        return $this->json($response, ['success' => true, 'message' => 'OK', 'processed' => $processed], 200);
    }
}
