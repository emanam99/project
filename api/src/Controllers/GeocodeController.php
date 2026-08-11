<?php

declare(strict_types=1);

namespace App\Controllers;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Proxy reverse geocoding (OSM Nominatim) untuk tampilan alamat di klien — patuhi rate limit & User-Agent.
 */
final class GeocodeController
{
    private function json(Response $response, array $data, int $code = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response->withStatus($code)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * @param array<string, mixed> $addr
     */
    private static function pickString(array $addr, array $keys): string
    {
        foreach ($keys as $k) {
            if (!empty($addr[$k]) && is_string($addr[$k])) {
                $v = trim($addr[$k]);
                if ($v !== '') {
                    return $v;
                }
            }
        }

        return '';
    }

    /**
     * @param array<string, mixed> $a address object Nominatim
     *
     * @return array{desa:string,kecamatan:string,kota:string,provinsi:string}
     */
    private static function mapIndonesiaFields(array $a): array
    {
        $desa = self::pickString($a, [
            'village',
            'hamlet',
            'neighbourhood',
            'quarter',
            'allotments',
            'isolated_dwelling',
        ]);
        $provinsi = self::pickString($a, ['state', 'region']);
        $kecamatan = self::pickString($a, ['city_district', 'suburb', 'district']);
        $kota = self::pickString($a, ['city', 'town']);
        if ($kota === '') {
            $kota = self::pickString($a, ['municipality']);
        }
        if ($kota === '') {
            $kota = self::pickString($a, ['county']);
        }
        if ($kecamatan === '') {
            $fallback = self::pickString($a, ['municipality', 'county']);
            if ($fallback !== '' && $fallback !== $kota) {
                $kecamatan = $fallback;
            }
        }

        return [
            'desa' => $desa,
            'kecamatan' => $kecamatan,
            'kota' => $kota,
            'provinsi' => $provinsi,
        ];
    }

    /**
     * Ambil isi URL JSON dari Nominatim — cURL jika ada, selain itu stream HTTP (allow_url_fopen).
     *
     * @return array{ok:bool,body:string,http_code:int,error:string}
     */
    private static function fetchNominatimJson(string $url): array
    {
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER => [
                    'Accept: application/json',
                    'User-Agent: eBeddien/1.0 (reverse-geocode)',
                ],
                CURLOPT_TIMEOUT => 10,
                CURLOPT_FOLLOWLOCATION => true,
            ]);
            $body = curl_exec($ch);
            $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $err = curl_error($ch);
            curl_close($ch);
            if ($body === false) {
                return ['ok' => false, 'body' => '', 'http_code' => $httpCode, 'error' => $err !== '' ? $err : 'curl_exec gagal'];
            }

            return ['ok' => true, 'body' => (string) $body, 'http_code' => $httpCode, 'error' => ''];
        }

        if (!ini_get('allow_url_fopen')) {
            return [
                'ok' => false,
                'body' => '',
                'http_code' => 0,
                'error' => 'Aktifkan ekstensi php_curl di php.ini, atau set allow_url_fopen=On untuk geocode.',
            ];
        }

        $ctx = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => "Accept: application/json\r\nUser-Agent: eBeddien/1.0 (reverse-geocode)\r\nConnection: close\r\n",
                'timeout' => 10,
                'ignore_errors' => true,
            ],
        ]);

        /** @var array<int, string>|null $hdr */
        $hdr = null;
        $prevHandler = set_error_handler(static function () {
            return true;
        });
        try {
            $body = @file_get_contents($url, false, $ctx);
            $hdr = $http_response_header ?? null;
        } finally {
            if ($prevHandler !== null) {
                restore_error_handler();
            }
        }

        if ($body === false) {
            return [
                'ok' => false,
                'body' => '',
                'http_code' => 0,
                'error' => 'Permintaan HTTP ke Nominatim gagal (periksa SSL / firewall).',
            ];
        }

        $httpCode = 0;
        if (is_array($hdr) && isset($hdr[0]) && preg_match('/HTTP\/\S+\s+(\d+)/', $hdr[0], $m)) {
            $httpCode = (int) $m[1];
        }

        return ['ok' => true, 'body' => (string) $body, 'http_code' => $httpCode, 'error' => ''];
    }

    /**
     * GET /api/geocode/reverse?lat=&lng=
     */
    public function reverse(Request $request, Response $response): Response
    {
        $params = $request->getQueryParams();
        $lat = isset($params['lat']) ? (float) $params['lat'] : null;
        $lng = isset($params['lng']) ? (float) $params['lng'] : null;
        if ($lat === null || $lng === null || abs($lat) > 90 || abs($lng) > 180) {
            return $this->json($response, ['success' => false, 'message' => 'Parameter lat dan lng wajib valid'], 400);
        }

        $url = 'https://nominatim.openstreetmap.org/reverse?' . http_build_query([
            'lat' => $lat,
            'lon' => $lng,
            'format' => 'json',
            'accept-language' => 'id',
            'zoom' => 18,
            'addressdetails' => 1,
        ], '', '&', PHP_QUERY_RFC3986);

        $fetched = self::fetchNominatimJson($url);
        if (!$fetched['ok']) {
            return $this->json($response, [
                'success' => false,
                'message' => $fetched['error'] !== ''
                    ? $fetched['error']
                    : 'Layanan geocode tidak tersedia',
            ], 503);
        }
        $body = $fetched['body'];
        $httpCode = $fetched['http_code'];

        if ($httpCode !== 200) {
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengambil alamat dari peta'], 502);
        }

        $data = json_decode($body, true);
        if (!is_array($data)) {
            return $this->json($response, ['success' => false, 'message' => 'Respons geocode tidak valid'], 502);
        }

        $addr = isset($data['address']) && is_array($data['address']) ? $data['address'] : [];
        $mapped = self::mapIndonesiaFields($addr);

        return $this->json($response, [
            'success' => true,
            'data' => array_merge($mapped, [
                'display_name' => isset($data['display_name']) ? (string) $data['display_name'] : '',
            ]),
        ], 200);
    }
}
