<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\AiAgentAccessHelper;
use App\Helpers\AiAgentIntentHelper;
use App\Helpers\AiAgentUserHelper;
use App\Helpers\AiChatPromptContextHelper;
use App\Helpers\AiChatUserProviderPrefHelper;
use App\Helpers\AiTrainingRagHelper;
use App\Helpers\AiWhatsappThreadContextHelper;

/**
 * Obrolan AI WA untuk user terverifikasi — selaras UI (DeepSeek/Gemini + agen + lampiran).
 */
final class AiEbeddienWaOfficialChatService
{
    private const SESSION_ID = 'ebeddien-main';

    private const WA_THREAD_MESSAGE_LIMIT = 10;

    /**
     * @param list<array{mime_type: string, data: string}> $attachments
     *
     * @return array{ok: bool, reply?: string, thinking?: string, message?: string, model_used?: string}
     */
    public static function chatForVerifiedUser(
        \PDO $db,
        int $usersId,
        string $prompt,
        string $nomorTujuan,
        array $attachments = [],
        string $extraSystemBlock = ''
    ): array {
        $userPayload = AiAgentUserHelper::buildPayloadForAgentFromUsersId($db, $usersId);
        if ($userPayload === null) {
            return ['ok' => false, 'message' => 'Akun tidak ditemukan'];
        }

        $hasAttachments = $attachments !== [];
        $text = trim($prompt);
        if ($text === '' || $text === '(tanpa teks)' || $text === '[media]') {
            $text = '';
        }

        if ($text === '' && !$hasAttachments) {
            return ['ok' => false, 'message' => 'Pesan kosong'];
        }

        $useAgent = AiAgentAccessHelper::canUseAgent($db, $userPayload)
            && AiAgentIntentHelper::suggestsAgentIntent($text, $hasAttachments);

        if ($useAgent) {
            return self::runAgentTurn($db, $usersId, $userPayload, $text, $nomorTujuan, $attachments, $extraSystemBlock);
        }

        $provider = AiChatUserProviderPrefHelper::resolveEffectiveProvider($db, $usersId, $hasAttachments);
        if ($provider === AiChatUserProviderPrefHelper::PROVIDER_GEMINI) {
            return self::runGeminiChat($db, $usersId, $userPayload, $text, $nomorTujuan, $attachments, $extraSystemBlock);
        }

        return self::runDeepseekChat($db, $usersId, $userPayload, $text, $nomorTujuan, $extraSystemBlock);
    }

    /**
     * @param list<array{mime_type: string, data: string}> $attachments
     *
     * @return array{ok: bool, reply?: string, thinking?: string, message?: string, model_used?: string}
     */
    private static function runAgentTurn(
        \PDO $db,
        int $usersId,
        array $userPayload,
        string $text,
        string $nomorTujuan,
        array $attachments,
        string $extraSystemBlock
    ): array {
        $orch = new AiAgentOrchestratorService();
        $msg = $text;
        if ($msg === '' && $attachments !== []) {
            $msg = 'Buat/sarankan rencana pengeluaran dari isi lampiran.';
        }
        $waBlock = AiWhatsappThreadContextHelper::buildThreadHistoryTextBlock(
            $db,
            $nomorTujuan,
            $text,
            self::WA_THREAD_MESSAGE_LIMIT
        );
        if ($waBlock !== '') {
            $msg = $waBlock . "\n\n---\nPertanyaan saat ini:\n" . $msg;
        }
        $out = $orch->processTurn($userPayload, $msg, $attachments, null);
        if (!($out['success'] ?? false)) {
            return ['ok' => false, 'message' => (string) ($out['message'] ?? 'Gagal agen')];
        }
        $data = is_array($out['data'] ?? null) ? $out['data'] : [];
        if (($data['mode'] ?? '') === 'propose_actions') {
            $intro = trim((string) ($data['message'] ?? ''));
            $job = is_array($data['job'] ?? null) ? $data['job'] : [];
            $summary = trim((string) ($job['summary'] ?? ''));
            $lines = [];
            if ($intro !== '') {
                $lines[] = $intro;
            }
            if ($summary !== '') {
                $lines[] = 'Ringkasan: ' . $summary;
            }
            $lines[] = 'Usulan menunggu konfirmasi. Tekan Konfirmasi di aplikasi eBeddien, atau balas YA di WhatsApp.';

            return [
                'ok' => true,
                'reply' => implode("\n\n", $lines),
                'thinking' => '',
                'model_used' => 'ebeddien_agent',
            ];
        }
        $reply = trim((string) ($data['message'] ?? ''));

        return [
            'ok' => true,
            'reply' => $reply !== '' ? $reply : '_(tidak ada teks)_',
            'thinking' => '',
            'model_used' => 'ebeddien_agent',
        ];
    }

    /**
     * @param list<array{mime_type: string, data: string}> $attachments
     *
     * @return array{ok: bool, reply?: string, thinking?: string, message?: string, model_used?: string}
     */
    private static function runDeepseekChat(
        \PDO $db,
        int $usersId,
        array $userPayload,
        string $text,
        string $nomorTujuan,
        string $extraSystemBlock
    ): array {
        $apiKey = trim((string) (getenv('DEEPSEEK_API_KEY') ?: ''));
        if ($apiKey === '') {
            return ['ok' => false, 'message' => 'Kunci API AI belum di-set'];
        }

        $userContent = self::mergeRagIntoPrompt($db, $text);
        $messages = self::buildMessageListWithHistory($db, $nomorTujuan, $text, $userContent, []);
        $system = self::buildAugmentedSystemPrompt($db, $userPayload, $usersId, $text, $extraSystemBlock);
        array_unshift($messages, ['role' => 'system', 'content' => $system]);

        $payload = [
            'model' => 'deepseek-chat',
            'messages' => $messages,
            'stream' => false,
        ];
        $curl = DeepseekOpenAiTransport::postChatCompletions($apiKey, $payload);
        if ($curl['raw'] === false || ($curl['curl_error'] ?? '') !== '') {
            return ['ok' => false, 'message' => 'Gagal menghubungi AI'];
        }
        $decoded = json_decode((string) $curl['raw'], true);
        if (!is_array($decoded) || (int) ($curl['http_code'] ?? 0) >= 400) {
            $err = isset($decoded['error']['message']) ? (string) $decoded['error']['message'] : 'Respons AI tidak valid';

            return ['ok' => false, 'message' => $err];
        }
        $msg = $decoded['choices'][0]['message'] ?? null;
        $content = is_array($msg) && isset($msg['content']) ? trim((string) $msg['content']) : '';
        $reasoning = is_array($msg) && isset($msg['reasoning_content']) ? trim((string) $msg['reasoning_content']) : '';
        if ($content === '') {
            $content = 'Maaf, saya belum bisa menjawab saat ini.';
        }

        return [
            'ok' => true,
            'reply' => $content,
            'thinking' => $reasoning,
            'model_used' => 'deepseek-chat',
        ];
    }

    /**
     * @param list<array{mime_type: string, data: string}> $attachments
     *
     * @return array{ok: bool, reply?: string, thinking?: string, message?: string, model_used?: string}
     */
    private static function runGeminiChat(
        \PDO $db,
        int $usersId,
        array $userPayload,
        string $text,
        string $nomorTujuan,
        array $attachments,
        string $extraSystemBlock
    ): array {
        $apiKey = trim((string) (getenv('GEMINI_API_KEY') ?: ''));
        if ($apiKey === '') {
            return ['ok' => false, 'message' => 'Gemini belum dikonfigurasi di server'];
        }
        $pref = AiChatUserProviderPrefHelper::getForUser($db, $usersId);
        $model = $pref['gemini_model'];

        $userContent = self::mergeRagIntoPrompt($db, $text);
        if ($userContent === '' && $attachments !== []) {
            $userContent = 'Pengguna mengirim lampiran tanpa teks. Jawab berdasarkan isi berkas/gambar.';
        }
        $messages = self::buildMessageListWithHistory($db, $nomorTujuan, $text, $userContent, $attachments);
        $system = self::buildAugmentedSystemPrompt($db, $userPayload, $usersId, $text, $extraSystemBlock);
        array_unshift($messages, ['role' => 'system', 'content' => $system]);

        $gemParts = GeminiGenerateContentTransport::openAiMessagesToGeminiParts($messages);
        if ($gemParts['contents'] === []) {
            return ['ok' => false, 'message' => 'Konten obrolan kosong'];
        }
        $gemPayload = [
            'contents' => $gemParts['contents'],
            'generationConfig' => ['maxOutputTokens' => 8192],
        ];
        if ($gemParts['system'] !== '') {
            $gemPayload['systemInstruction'] = ['parts' => [['text' => $gemParts['system']]]];
        }

        $curl = GeminiGenerateContentTransport::generateContent($apiKey, $model, $gemPayload);
        if ($curl['raw'] === false || ($curl['curl_error'] ?? '') !== '') {
            return ['ok' => false, 'message' => 'Gagal menghubungi Gemini'];
        }
        $decoded = json_decode((string) $curl['raw'], true);
        if (!is_array($decoded) || (int) ($curl['http_code'] ?? 0) >= 400) {
            $err = isset($decoded['error']['message']) ? (string) $decoded['error']['message'] : 'Respons Gemini tidak valid';

            return ['ok' => false, 'message' => $err];
        }
        if (!empty($decoded['error']) && is_array($decoded['error'])) {
            return ['ok' => false, 'message' => (string) ($decoded['error']['message'] ?? 'Gemini error')];
        }
        $parsed = GeminiGenerateContentTransport::parseTextResponse($decoded);
        $content = $parsed['text'];
        if ($content === '') {
            $content = 'Maaf, saya belum bisa menjawab saat ini.';
        }

        return [
            'ok' => true,
            'reply' => $content,
            'thinking' => '',
            'model_used' => 'gemini:' . $model,
        ];
    }

    private static function mergeRagIntoPrompt(\PDO $db, string $text): string
    {
        if ($text === '') {
            return '';
        }
        try {
            return AiTrainingRagHelper::mergeIntoPrompt($db, $text);
        } catch (\Throwable $e) {
            error_log('AiEbeddienWaOfficialChatService RAG ' . $e->getMessage());

            return $text;
        }
    }

    /**
     * @param list<array{mime_type: string, data: string}> $attachments
     *
     * @return list<array{role: string, content: string, gemini_inline_images?: list<array{mime_type: string, data: string}>}>
     */
    private static function buildMessageListWithHistory(
        \PDO $db,
        string $nomorTujuan,
        string $currentUserOriginal,
        string $userContent,
        array $attachments
    ): array {
        $hist = AiWhatsappThreadContextHelper::fetchRecentThreadMessages(
            $db,
            $nomorTujuan,
            self::WA_THREAD_MESSAGE_LIMIT,
            $currentUserOriginal
        );
        $last = ['role' => 'user', 'content' => $userContent];
        if ($attachments !== []) {
            $last['gemini_inline_images'] = $attachments;
        }
        $hist[] = $last;

        return $hist;
    }

    private static function buildAugmentedSystemPrompt(
        \PDO $db,
        array $userPayload,
        int $usersId,
        string $lastUserOriginal,
        string $extraSystemBlock
    ): string {
        $system = AiTrainingRagHelper::getEbeddienAssistantSystemPrompt();
        if ($extraSystemBlock !== '') {
            $system .= "\n\n" . $extraSystemBlock;
        }
        try {
            $system = AiChatPromptContextHelper::augmentSystemPrompt(
                $system,
                $db,
                $userPayload,
                $lastUserOriginal,
                $usersId,
                self::SESSION_ID,
                'wa'
            );
        } catch (\Throwable $e) {
            error_log('AiEbeddienWaOfficialChatService augmentSystem ' . $e->getMessage());
        }

        return $system;
    }
}
