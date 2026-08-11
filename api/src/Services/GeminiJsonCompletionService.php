<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Satu panggilan generateContent (Gemini) untuk agen: systemInstruction + user parts (teks + inline lampiran).
 * Dipakai saat agen Chat AI melampirkan berkas (gambar/PDF/Word/Excel/CSV/TXT); teks-only tetap lewat DeepSeek.
 */
final class GeminiJsonCompletionService
{
    /**
     * @param list<array{mime_type: string, data: string}> $attachments Base64 murni (tanpa prefix data:)
     *
     * @return array{ok: bool, text?: string, usage?: array<string, int>|null, error?: string, http_code?: int}
     */
    public static function generate(
        string $apiKey,
        string $modelId,
        string $systemInstruction,
        string $userText,
        array $attachments
    ): array {
        $apiKey = trim($apiKey);
        if ($apiKey === '') {
            return ['ok' => false, 'error' => 'GEMINI_API_KEY kosong', 'http_code' => 0];
        }
        if ($modelId === '' || !preg_match('/^gemini-[a-zA-Z0-9._-]+$/', $modelId)) {
            return ['ok' => false, 'error' => 'Model Gemini tidak valid', 'http_code' => 0];
        }

        $parts = [];
        if ($userText !== '') {
            $parts[] = ['text' => $userText];
        }
        foreach ($attachments as $img) {
            $mime = isset($img['mime_type']) ? (string) $img['mime_type'] : '';
            $data = isset($img['data']) ? (string) $img['data'] : '';
            if ($mime === '' || $data === '') {
                continue;
            }
            $parts[] = [
                'inline_data' => [
                    'mime_type' => $mime,
                    'data' => $data,
                ],
            ];
        }
        if ($parts === []) {
            return ['ok' => false, 'error' => 'Konten user kosong', 'http_code' => 0];
        }

        $payload = [
            'contents' => [
                ['role' => 'user', 'parts' => $parts],
            ],
            'generationConfig' => [
                'maxOutputTokens' => 8192,
                'temperature' => 0.2,
            ],
        ];
        if ($systemInstruction !== '') {
            $payload['systemInstruction'] = [
                'parts' => [['text' => $systemInstruction]],
            ];
        }

        $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($modelId) . ':generateContent';
        $jsonPayload = json_encode($payload, JSON_UNESCAPED_UNICODE);
        if ($jsonPayload === false) {
            return ['ok' => false, 'error' => 'json_encode gagal', 'http_code' => 0];
        }

        $headers = [
            'Content-Type: application/json',
            'x-goog-api-key: ' . $apiKey,
        ];

        if (!function_exists('curl_init')) {
            return ['ok' => false, 'error' => 'cURL tidak tersedia untuk panggilan Gemini agen', 'http_code' => 0];
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
        curl_close($ch);

        if ($raw === false || $raw === '') {
            return ['ok' => false, 'error' => 'Respons Gemini kosong', 'http_code' => $httpCode];
        }

        $decoded = json_decode((string) $raw, true);
        if (!is_array($decoded)) {
            return ['ok' => false, 'error' => 'Respons Gemini bukan JSON', 'http_code' => $httpCode];
        }
        if (!empty($decoded['error']) && is_array($decoded['error'])) {
            $em = isset($decoded['error']['message']) ? (string) $decoded['error']['message'] : 'Gemini error';

            return ['ok' => false, 'error' => $em, 'http_code' => $httpCode];
        }
        if ($httpCode >= 400) {
            return ['ok' => false, 'error' => 'HTTP ' . (string) $httpCode, 'http_code' => $httpCode];
        }

        $text = self::extractTextFromGenerateContent($decoded);
        $usage = null;
        $um = $decoded['usageMetadata'] ?? null;
        if (is_array($um)) {
            $usage = [
                'prompt_tokens' => (int) ($um['promptTokenCount'] ?? 0),
                'completion_tokens' => (int) ($um['candidatesTokenCount'] ?? 0),
                'total_tokens' => (int) ($um['totalTokenCount'] ?? 0),
            ];
        }

        return ['ok' => true, 'text' => $text, 'usage' => $usage, 'http_code' => $httpCode];
    }

    /**
     * @param array<string, mixed> $decoded
     */
    private static function extractTextFromGenerateContent(array $decoded): string
    {
        $text = '';
        $cand = $decoded['candidates'][0] ?? null;
        if (!is_array($cand)) {
            return '';
        }
        $content = $cand['content'] ?? null;
        if (!is_array($content) || !isset($content['parts']) || !is_array($content['parts'])) {
            return '';
        }
        foreach ($content['parts'] as $p) {
            if (is_array($p) && isset($p['text']) && is_string($p['text'])) {
                $text .= $p['text'];
            }
        }

        return trim($text);
    }
}
