<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\EvolutionApiService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Proxy Evolution API (super_admin). Endpoint: /api/evolution-api/*
 */
final class EvolutionApiController
{
    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    private static function normalizeInstanceName(string $raw): ?string
    {
        $s = trim($raw);
        if ($s === '' || strlen($s) > 120) {
            return null;
        }
        if (!preg_match('/^[a-zA-Z0-9._-]+$/', $s)) {
            return null;
        }

        return $s;
    }

    private static function normalizeEvoWaDigits(string $raw): ?string
    {
        $d = preg_replace('/\D/', '', $raw);
        if ($d === '') {
            return null;
        }
        if (str_starts_with($d, '0')) {
            $d = '62' . substr($d, 1);
        }
        if (strlen($d) < 10 || strlen($d) > 15) {
            return null;
        }

        return $d;
    }

    /**
     * Satu bagian pesan error dari Evolution (boleh string, angka, array/objek nested).
     * Hindari strval(array) yang di PHP menjadi teks literal "Array".
     */
    private static function evoMessagePartToString($part): string
    {
        if (\is_string($part)) {
            return trim($part);
        }
        if ($part === null) {
            return '';
        }
        if (\is_int($part) || \is_float($part)) {
            return (string) $part;
        }
        if (\is_bool($part)) {
            return $part ? 'true' : 'false';
        }
        if (\is_array($part)) {
            foreach (['message', 'msg', 'error', 'text', 'description'] as $k) {
                if (isset($part[$k]) && \is_string($part[$k]) && trim($part[$k]) !== '') {
                    return trim($part[$k]);
                }
            }
            $nested = [];
            foreach ($part as $v) {
                $s = self::evoMessagePartToString($v);
                if ($s !== '') {
                    $nested[] = $s;
                }
            }
            if ($nested !== []) {
                return implode('; ', $nested);
            }
            $json = json_encode($part, JSON_UNESCAPED_UNICODE);

            return ($json !== false && $json !== '[]' && $json !== '{}') ? $json : '';
        }

        return '';
    }

    /**
     * @param mixed $data Body JSON error dari Evolution (sudah di-sanitize atau mentah)
     */
    private static function evolutionErrorMessage($data, ?string $fallback): string
    {
        if (!\is_array($data)) {
            return $fallback ?? 'Permintaan gagal';
        }
        if (isset($data['response']['message'])) {
            $m = $data['response']['message'];
            if (\is_array($m)) {
                $parts = [];
                foreach ($m as $item) {
                    $s = self::evoMessagePartToString($item);
                    if ($s !== '') {
                        $parts[] = $s;
                    }
                }
                if ($parts !== []) {
                    return implode('; ', $parts);
                }
            } elseif (\is_string($m) && trim($m) !== '') {
                return trim($m);
            }
        }
        if (isset($data['message'])) {
            $m = $data['message'];
            if (\is_string($m) && trim($m) !== '') {
                return trim($m);
            }
            if (\is_array($m)) {
                $parts = [];
                foreach ($m as $item) {
                    $s = self::evoMessagePartToString($item);
                    if ($s !== '') {
                        $parts[] = $s;
                    }
                }
                if ($parts !== []) {
                    return implode('; ', $parts);
                }
            }
        }
        if (isset($data['error'])) {
            if (\is_string($data['error']) && $data['error'] !== '') {
                return $data['error'];
            }
            $s = self::evoMessagePartToString($data['error']);
            if ($s !== '') {
                return $s;
            }
        }

        return $fallback ?? 'Permintaan gagal';
    }

    /**
     * @return array{0: ?string, 1: ?string, 2: ?string} [error message, instanceName, digits]
     */
    private static function resolveSendTarget(array $body): array
    {
        $numRaw = isset($body['number']) ? (string) $body['number'] : '';
        $instRaw = isset($body['instance_name']) ? trim((string) $body['instance_name']) : '';
        $digits = self::normalizeEvoWaDigits($numRaw);
        if ($digits === null) {
            return ['Nomor tidak valid (gunakan 08… atau 62…)', null, null];
        }
        $inst = $instRaw !== '' ? $instRaw : EvolutionApiService::getStoredInstanceName();
        $name = self::normalizeInstanceName($inst);
        if ($name === null || $name === '') {
            return ['Nama instance wajib — isi di atas lalu simpan, atau kirim instance_name di body.', null, null];
        }

        return [null, $name, $digits];
    }

    /**
     * GET /api/evolution-api/config
     */
    public function getConfig(Request $request, Response $response): Response
    {
        $res = EvolutionApiService::getAppConfig();

        return $this->jsonResponse($response, [
            'success' => $res['success'],
            'data' => $res['data'],
            'message' => $res['message'],
        ], 200);
    }

    /**
     * PUT /api/evolution-api/config — body: { "instance_name": "..." }
     */
    public function putConfig(Request $request, Response $response): Response
    {
        $body = (array) $request->getParsedBody();
        $name = isset($body['instance_name']) ? trim((string) $body['instance_name']) : '';
        if ($name !== '' && self::normalizeInstanceName($name) === null) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Nama instance tidak valid (huruf, angka, titik, strip, underscore; maks. 120 karakter).',
            ], 400);
        }
        EvolutionApiService::setInstanceName($name);
        $cfg = EvolutionApiService::getAppConfig();

        return $this->jsonResponse($response, [
            'success' => true,
            'message' => 'Pengaturan Evolution API disimpan',
            'data' => $cfg['data'],
        ], 200);
    }

    /**
     * GET /api/evolution-api/info — GET / di Evolution
     */
    public function getInfo(Request $request, Response $response): Response
    {
        $r = EvolutionApiService::request('GET', '/', null, true);

        return $this->jsonResponse($response, [
            'success' => $r['ok'],
            'data' => $r['data'],
            'message' => $r['message'] ?? ($r['ok'] ? null : 'Gagal memanggil Evolution API'),
            'evo_status' => $r['status'],
        ], 200);
    }

    /**
     * GET /api/evolution-api/instances?instanceName=
     */
    public function getInstances(Request $request, Response $response): Response
    {
        $q = $request->getQueryParams();
        $name = isset($q['instanceName']) ? trim((string) $q['instanceName']) : '';
        $path = '/instance/fetchInstances';
        if ($name !== '') {
            $enc = rawurlencode($name);
            $path .= '?instanceName=' . $enc;
        }
        $r = EvolutionApiService::request('GET', $path, null, true);

        return $this->jsonResponse($response, [
            'success' => $r['ok'],
            'data' => $r['data'],
            'message' => $r['message'],
            'evo_status' => $r['status'],
        ], 200);
    }

    /**
     * GET /api/evolution-api/instance/{name}/connection-state
     */
    public function getConnectionState(Request $request, Response $response, array $args): Response
    {
        $name = self::normalizeInstanceName((string) ($args['name'] ?? ''));
        if ($name === null) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Nama instance tidak valid'], 400);
        }
        $r = EvolutionApiService::request('GET', '/instance/connectionState/' . rawurlencode($name), null, true);

        return $this->jsonResponse($response, [
            'success' => $r['ok'],
            'data' => $r['data'],
            'message' => $r['message'],
            'evo_status' => $r['status'],
        ], 200);
    }

    /**
     * GET /api/evolution-api/instance/{name}/connect — QR / pairing
     */
    public function getConnect(Request $request, Response $response, array $args): Response
    {
        $name = self::normalizeInstanceName((string) ($args['name'] ?? ''));
        if ($name === null) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Nama instance tidak valid'], 400);
        }
        $q = $request->getQueryParams();
        $number = isset($q['number']) ? trim((string) $q['number']) : '';
        $path = '/instance/connect/' . rawurlencode($name);
        if ($number !== '') {
            $path .= '?number=' . rawurlencode($number);
        }
        // Respons berisi string pairing/QR — jangan sanitize agar tidak memutus field yang tidak dikenal
        $r = EvolutionApiService::request('GET', $path, null, false);

        return $this->jsonResponse($response, [
            'success' => $r['ok'],
            'data' => $r['data'],
            'message' => $r['message'],
            'evo_status' => $r['status'],
        ], 200);
    }

    /**
     * DELETE /api/evolution-api/instance/{name}/logout
     */
    public function deleteLogout(Request $request, Response $response, array $args): Response
    {
        $name = self::normalizeInstanceName((string) ($args['name'] ?? ''));
        if ($name === null) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Nama instance tidak valid'], 400);
        }
        $r = EvolutionApiService::request('DELETE', '/instance/logout/' . rawurlencode($name), null, true);

        return $this->jsonResponse($response, [
            'success' => $r['ok'],
            'data' => $r['data'],
            'message' => $r['message'],
            'evo_status' => $r['status'],
        ], 200);
    }

    /**
     * POST /api/evolution-api/instance/create — body JSON diteruskan ke Evolution (instanceName, integration, qrcode, …)
     */
    public function postCreate(Request $request, Response $response): Response
    {
        $body = $request->getParsedBody();
        if (!\is_array($body) || $body === []) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Body JSON wajib'], 400);
        }
        $r = EvolutionApiService::request('POST', '/instance/create', $body, true);

        return $this->jsonResponse($response, [
            'success' => $r['ok'],
            'data' => $r['data'],
            'message' => $r['message'],
            'evo_status' => $r['status'],
        ], 200);
    }

    /**
     * POST /api/evolution-api/send-text — body: { "number": "08…|62…", "text": "…" [, "instance_name": "…" ] }
     * Proxy ke Evolution POST /message/sendText/{instance}
     *
     * @see https://doc.evolution-api.com/v2/api-reference/message-controller/send-text
     */
    public function postSendText(Request $request, Response $response): Response
    {
        $body = (array) $request->getParsedBody();
        $text = isset($body['text']) ? trim((string) $body['text']) : '';

        if ($text === '') {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Isi pesan wajib diisi'], 400);
        }
        if (strlen($text) > 4096) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Pesan terlalu panjang (maks. 4096 karakter)'], 400);
        }

        [$err, $name, $digits] = self::resolveSendTarget($body);
        if ($err !== null) {
            return $this->jsonResponse($response, ['success' => false, 'message' => $err], 400);
        }

        $r = EvolutionApiService::request('POST', '/message/sendText/' . rawurlencode((string) $name), [
            'number' => $digits,
            'text' => $text,
        ], true);

        $ok = $r['ok'];
        $msg = $r['message'];
        if (!$ok) {
            $msg = self::evolutionErrorMessage($r['data'], $msg ?? 'Gagal mengirim pesan');
        } else {
            $msg = 'Pesan tes terkirim';
        }

        return $this->jsonResponse($response, [
            'success' => $ok,
            'data' => $r['data'],
            'message' => $msg,
            'evo_status' => $r['status'],
        ], 200);
    }

    /**
     * POST /api/evolution-api/send-list — body: number, instance_name?, title, description, buttonText, footerText, sections[]
     * Beberapa versi Evolution memakai "sections" (bukan "values"); body lama "values" tetap diterima dan dipetakan ke sections.
     *
     * @see https://doc.evolution-api.com/v2/api-reference/message-controller/send-list
     */
    public function postSendList(Request $request, Response $response): Response
    {
        $body = (array) $request->getParsedBody();
        [$err, $name, $digits] = self::resolveSendTarget($body);
        if ($err !== null) {
            return $this->jsonResponse($response, ['success' => false, 'message' => $err], 400);
        }

        $title = trim((string) ($body['title'] ?? ''));
        $description = trim((string) ($body['description'] ?? ''));
        $buttonText = trim((string) ($body['buttonText'] ?? ''));
        $footerText = trim((string) ($body['footerText'] ?? ''));
        $sections = $body['sections'] ?? $body['values'] ?? null;

        if ($title === '' || $description === '' || $buttonText === '' || $footerText === '') {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Field wajib: title, description, buttonText, footerText',
            ], 400);
        }
        if (!\is_array($sections) || $sections === []) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'sections wajib: array berisi minimal satu section (boleh kirim legacy key "values")',
            ], 400);
        }

        $r = EvolutionApiService::request('POST', '/message/sendList/' . rawurlencode((string) $name), [
            'number' => $digits,
            'title' => $title,
            'description' => $description,
            'buttonText' => $buttonText,
            'footerText' => $footerText,
            'sections' => $sections,
        ], true);

        $ok = $r['ok'];
        $msg = $ok
            ? 'Evolution mengonfirmasi permintaan list (HTTP sukses). List interaktif lewat Baileys sering tidak muncul di WA penerima — itu batasan platform, bukan bug eBeddien. Untuk pasti sampai, pakai tab Teks.'
            : self::evolutionErrorMessage($r['data'], $r['message'] ?? 'Gagal mengirim list');

        return $this->jsonResponse($response, [
            'success' => $ok,
            'data' => $r['data'],
            'message' => $msg,
            'evo_status' => $r['status'],
        ], 200);
    }

    /**
     * POST /api/evolution-api/send-buttons — body: number, instance_name?, title, description, footer, buttons[]
     * Tiap tombol: type (reply|url|call), displayText, id — alias: field lama "title" = type
     *
     * @see https://doc.evolution-api.com/v2/api-reference/message-controller/send-button
     */
    public function postSendButtons(Request $request, Response $response): Response
    {
        $body = (array) $request->getParsedBody();
        [$err, $name, $digits] = self::resolveSendTarget($body);
        if ($err !== null) {
            return $this->jsonResponse($response, ['success' => false, 'message' => $err], 400);
        }

        $title = trim((string) ($body['title'] ?? ''));
        $description = trim((string) ($body['description'] ?? ''));
        $footer = trim((string) ($body['footer'] ?? ''));
        $buttonsIn = $body['buttons'] ?? null;

        if ($title === '' || $description === '' || $footer === '') {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Field wajib: title, description, footer',
            ], 400);
        }
        if (!\is_array($buttonsIn) || $buttonsIn === []) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'buttons wajib berisi minimal satu item',
            ], 400);
        }
        if (\count($buttonsIn) > 3) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Maksimal 3 tombol (batas umum WhatsApp)',
            ], 400);
        }

        $evoButtons = [];
        foreach ($buttonsIn as $b) {
            if (!\is_array($b)) {
                continue;
            }
            $btnType = strtolower(trim((string) ($b['title'] ?? $b['type'] ?? 'reply')));
            if (!\in_array($btnType, ['reply', 'url', 'call'], true)) {
                $btnType = 'reply';
            }
            $displayText = trim((string) ($b['displayText'] ?? $b['display_text'] ?? ''));
            $id = trim((string) ($b['id'] ?? ''));
            if ($displayText === '' || $id === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Setiap tombol wajib punya displayText dan id',
                ], 400);
            }
            // Evolution memvalidasi property "type" (reply|url|call); "title" di OpenAPI kadang mengacu ke ini
            $evoButtons[] = [
                'type' => $btnType,
                'displayText' => $displayText,
                'id' => $id,
            ];
        }
        if ($evoButtons === []) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Format buttons tidak valid',
            ], 400);
        }

        $r = EvolutionApiService::request('POST', '/message/sendButtons/' . rawurlencode((string) $name), [
            'number' => $digits,
            'title' => $title,
            'description' => $description,
            'footer' => $footer,
            'buttons' => $evoButtons,
        ], true);

        $ok = $r['ok'];
        $msg = $ok
            ? 'Evolution mengonfirmasi permintaan tombol (HTTP sukses). Pesan tombol lewat Baileys sering tidak pernah sampai ke WA penerima meski notifikasi sukses — dilaporkan luas di komunitas Evolution. Bukan kesalahan format dari eBeddien; untuk pasti sampai gunakan tab Teks atau WhatsApp Business API resmi.'
            : self::evolutionErrorMessage($r['data'], $r['message'] ?? 'Gagal mengirim tombol');

        return $this->jsonResponse($response, [
            'success' => $ok,
            'data' => $r['data'],
            'message' => $msg,
            'evo_status' => $r['status'],
        ], 200);
    }
}
