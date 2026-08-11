<?php

declare(strict_types=1);

namespace App\Services;

/**
 * POST generateContent ke Google Gemini API.
 *
 * @return array{raw:string|false,http_code:int,curl_error:string,curl_errno:int}
 */
final class GeminiGenerateContentTransport
{
    public static function generateContent(string $apiKey, string $modelId, array $payload): array
    {
        $url = 'https://generativelanguage.googleapis.com/v1beta/models/'
            . rawurlencode($modelId) . ':generateContent';
        $jsonPayload = json_encode($payload, JSON_UNESCAPED_UNICODE);
        if ($jsonPayload === false) {
            return [
                'raw' => false,
                'http_code' => 0,
                'curl_error' => 'json_encode failed',
                'curl_errno' => -2,
            ];
        }
        $headers = [
            'Content-Type: application/json',
            'x-goog-api-key: ' . $apiKey,
        ];
        if (!function_exists('curl_init')) {
            return ['raw' => false, 'http_code' => 0, 'curl_error' => 'curl tidak tersedia', 'curl_errno' => -3];
        }
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
        $curlErrno = (int) curl_errno($ch);
        curl_close($ch);

        return [
            'raw' => $raw,
            'http_code' => $httpCode,
            'curl_error' => $curlErr,
            'curl_errno' => $curlErrno,
        ];
    }

    /**
     * @return array{text: string, finish_reason: string}
     */
    public static function parseTextResponse(array $decoded): array
    {
        $text = '';
        $finish = '';
        $cand = $decoded['candidates'][0] ?? null;
        if (is_array($cand)) {
            if (isset($cand['finishReason']) && is_string($cand['finishReason'])) {
                $finish = $cand['finishReason'];
            }
            $content = $cand['content'] ?? null;
            if (is_array($content) && isset($content['parts']) && is_array($content['parts'])) {
                foreach ($content['parts'] as $p) {
                    if (is_array($p) && isset($p['text']) && is_string($p['text'])) {
                        $text .= $p['text'];
                    }
                }
            }
        }

        return ['text' => trim($text), 'finish_reason' => $finish];
    }

    /**
     * @param array<int, array{role: string, content: string, gemini_inline_images?: list<array{mime_type: string, data: string}>}> $openAiMessages
     *
     * @return array{system: string, contents: array<int, array<string, mixed>>}
     */
    public static function openAiMessagesToGeminiParts(array $openAiMessages): array
    {
        $system = '';
        $contents = [];
        foreach ($openAiMessages as $m) {
            if (!is_array($m) || !isset($m['role'])) {
                continue;
            }
            $role = strtolower(trim((string) $m['role']));
            $content = isset($m['content']) && is_string($m['content']) ? $m['content'] : '';
            if ($role === 'system') {
                $system = $content;
                continue;
            }
            if ($role === 'user') {
                $imgs = isset($m['gemini_inline_images']) && is_array($m['gemini_inline_images'])
                    ? $m['gemini_inline_images'] : [];
                $parts = [];
                if ($content !== '') {
                    $parts[] = ['text' => $content];
                }
                foreach ($imgs as $img) {
                    if (!is_array($img) || empty($img['mime_type']) || empty($img['data'])) {
                        continue;
                    }
                    $parts[] = [
                        'inline_data' => [
                            'mime_type' => (string) $img['mime_type'],
                            'data' => (string) $img['data'],
                        ],
                    ];
                }
                if ($parts === []) {
                    continue;
                }
                if ($content === '' && $imgs !== []) {
                    array_unshift($parts, [
                        'text' => 'Analisis berkas/gambar yang dilampirkan. Jawab ringkas dalam Bahasa Indonesia sesuai konteks asisten eBeddien.',
                    ]);
                }
                $contents[] = ['role' => 'user', 'parts' => $parts];
            } elseif ($role === 'assistant') {
                if ($content === '') {
                    continue;
                }
                $contents[] = ['role' => 'model', 'parts' => [['text' => $content]]];
            }
        }

        return ['system' => $system, 'contents' => $contents];
    }
}
