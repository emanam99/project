<?php

declare(strict_types=1);

namespace App\Services;

/**
 * POST JSON ke https://api.deepseek.com/chat/completions (format OpenAI).
 *
 * @return array{raw:string|false,http_code:int,curl_error:string,curl_errno:int}
 */
final class DeepseekOpenAiTransport
{
    private const BASE = 'https://api.deepseek.com/chat/completions';

    public static function postChatCompletions(string $apiKey, array $payload): array
    {
        $jsonPayload = json_encode($payload, JSON_UNESCAPED_UNICODE);
        if ($jsonPayload === false) {
            return [
                'raw' => false,
                'http_code' => 0,
                'curl_error' => 'json_encode failed',
                'curl_errno' => -2,
            ];
        }

        if (function_exists('curl_init') && function_exists('curl_exec')) {
            return self::postWithCurl(self::BASE, $apiKey, $jsonPayload);
        }

        return self::postWithFileGetContents(self::BASE, $apiKey, $jsonPayload);
    }

    /**
     * @return array{raw:string|false,http_code:int,curl_error:string,curl_errno:int}
     */
    private static function postWithCurl(string $url, string $apiKey, string $jsonPayload): array
    {
        $headers = [
            'Content-Type: application/json',
            'Accept: application/json',
            'Authorization: Bearer ' . $apiKey,
        ];

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonPayload);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 180);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 30);
        curl_setopt($ch, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);

        $raw = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        $curlErrNo = curl_errno($ch);
        curl_close($ch);

        return [
            'raw' => $raw,
            'http_code' => $httpCode,
            'curl_error' => $curlErr,
            'curl_errno' => $curlErrNo,
        ];
    }

    /**
     * @return array{raw:string|false,http_code:int,curl_error:string,curl_errno:int}
     */
    private static function postWithFileGetContents(string $url, string $apiKey, string $jsonPayload): array
    {
        $fopenOk = filter_var(ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN);
        if (!$fopenOk) {
            return [
                'raw' => false,
                'http_code' => 0,
                'curl_error' => 'allow_url_fopen=Off dan cURL tidak tersedia untuk proses ini.',
                'curl_errno' => -3,
            ];
        }

        $headerBlock = implode("\r\n", [
            'Content-Type: application/json',
            'Accept: application/json',
            'Authorization: Bearer ' . $apiKey,
        ]);
        $ctx = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => $headerBlock,
                'content' => $jsonPayload,
                'timeout' => 180,
                'ignore_errors' => true,
            ],
        ]);

        $raw = @file_get_contents($url, false, $ctx);
        $httpCode = 0;
        if (isset($http_response_header[0]) && preg_match('/HTTP\/\S+\s+(\d{3})/', $http_response_header[0], $m)) {
            $httpCode = (int) $m[1];
        }
        if ($raw === false) {
            $err = error_get_last();
            $msg = is_array($err) ? (string) ($err['message'] ?? 'Permintaan HTTPS gagal') : 'file_get_contents gagal';

            return [
                'raw' => false,
                'http_code' => $httpCode,
                'curl_error' => $msg,
                'curl_errno' => -4,
            ];
        }

        return [
            'raw' => $raw,
            'http_code' => $httpCode,
            'curl_error' => '',
            'curl_errno' => 0,
        ];
    }
}
