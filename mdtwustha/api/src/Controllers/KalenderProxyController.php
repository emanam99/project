<?php

namespace App\Controllers;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class KalenderProxyController {
    private const UPSTREAM = 'https://api.alutsmani.id/api/kalender';

    public function proxy(Request $request, Response $response): Response {
        $query = $request->getUri()->getQuery();
        $url = self::UPSTREAM . ($query !== '' ? '?' . $query : '');

        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 20,
                'ignore_errors' => true,
                'header' => "Accept: application/json\r\n",
            ],
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
            ],
        ]);

        $body = @file_get_contents($url, false, $context);

        if ($body === false) {
            return $this->jsonResponse($response, [
                'error' => 'Gagal mengambil data kalender dari server pusat',
            ], 502);
        }

        $status = 200;
        if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
            $status = (int) $m[1];
            if ($status < 100 || $status >= 600) {
                $status = 200;
            }
        }

        $response->getBody()->write($body);
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }

    private function jsonResponse(Response $response, array $data, int $status = 200): Response {
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
