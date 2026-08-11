<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Preferensi DeepSeek vs Gemini per user (UI + WA).
 */
final class AiChatUserProviderPrefHelper
{
    public const PROVIDER_DEEPSEEK = 'deepseek';

    public const PROVIDER_GEMINI = 'gemini';

    public const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite';

    public static function columnExists(\PDO $db, string $column): bool
    {
        try {
            $st = $db->prepare(
                'SELECT COUNT(*) FROM information_schema.COLUMNS '
                . 'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
            );
            $st->execute(['users', $column]);

            return (int) $st->fetchColumn() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * @return array{provider: string, gemini_model: string}
     */
    public static function getForUser(\PDO $db, int $usersId): array
    {
        $provider = self::PROVIDER_DEEPSEEK;
        $geminiModel = self::DEFAULT_GEMINI_MODEL;
        if ($usersId < 1) {
            return ['provider' => $provider, 'gemini_model' => $geminiModel];
        }
        if (!self::columnExists($db, 'ai_chat_api_provider_pref')) {
            return ['provider' => $provider, 'gemini_model' => $geminiModel];
        }
        try {
            $hasGeminiCol = self::columnExists($db, 'ai_chat_gemini_model_pref');
            $sql = 'SELECT ai_chat_api_provider_pref'
                . ($hasGeminiCol ? ', ai_chat_gemini_model_pref' : '')
                . ' FROM users WHERE id = ? LIMIT 1';
            $stmt = $db->prepare($sql);
            $stmt->execute([$usersId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row) {
                $p = strtolower(trim((string) ($row['ai_chat_api_provider_pref'] ?? '')));
                if ($p === self::PROVIDER_GEMINI) {
                    $provider = self::PROVIDER_GEMINI;
                }
                if ($hasGeminiCol) {
                    $gm = trim((string) ($row['ai_chat_gemini_model_pref'] ?? ''));
                    if ($gm !== '' && preg_match('/^gemini-[a-zA-Z0-9._-]+$/', $gm)) {
                        $geminiModel = $gm;
                    }
                }
            }
        } catch (\Throwable $e) {
            error_log('AiChatUserProviderPrefHelper::getForUser ' . $e->getMessage());
        }

        return ['provider' => $provider, 'gemini_model' => $geminiModel];
    }

    /**
     * Provider efektif selaras UI: lampiran → Gemini bila dikonfigurasi; else preferensi user.
     */
    public static function resolveEffectiveProvider(\PDO $db, int $usersId, bool $hasAttachments): string
    {
        $geminiConfigured = trim((string) (getenv('GEMINI_API_KEY') ?: '')) !== '';
        if ($hasAttachments && $geminiConfigured) {
            return self::PROVIDER_GEMINI;
        }
        $pref = self::getForUser($db, $usersId);
        if ($pref['provider'] === self::PROVIDER_GEMINI && !$geminiConfigured) {
            return self::PROVIDER_DEEPSEEK;
        }

        return $pref['provider'];
    }

    /**
     * @return array{ok: bool, message?: string}
     */
    public static function saveForUser(\PDO $db, int $usersId, string $provider, ?string $geminiModel = null): array
    {
        if ($usersId < 1) {
            return ['ok' => false, 'message' => 'User tidak valid'];
        }
        if (!self::columnExists($db, 'ai_chat_api_provider_pref')) {
            return ['ok' => false, 'message' => 'Kolom preferensi provider belum ada. Jalankan migrasi terbaru.'];
        }
        $p = strtolower(trim($provider));
        if ($p !== self::PROVIDER_DEEPSEEK && $p !== self::PROVIDER_GEMINI) {
            return ['ok' => false, 'message' => 'provider wajib deepseek atau gemini'];
        }
        if ($p === self::PROVIDER_GEMINI && trim((string) (getenv('GEMINI_API_KEY') ?: '')) === '') {
            return ['ok' => false, 'message' => 'Gemini belum dikonfigurasi di server'];
        }
        $gm = null;
        if ($geminiModel !== null && trim($geminiModel) !== '') {
            $gm = trim($geminiModel);
            if (!preg_match('/^gemini-[a-zA-Z0-9._-]+$/', $gm)) {
                return ['ok' => false, 'message' => 'Model Gemini tidak valid'];
            }
        }
        try {
            if (self::columnExists($db, 'ai_chat_gemini_model_pref')) {
                $stmt = $db->prepare(
                    'UPDATE users SET ai_chat_api_provider_pref = ?, ai_chat_gemini_model_pref = COALESCE(?, ai_chat_gemini_model_pref) WHERE id = ?'
                );
                $stmt->execute([$p, $gm, $usersId]);
            } else {
                $stmt = $db->prepare('UPDATE users SET ai_chat_api_provider_pref = ? WHERE id = ?');
                $stmt->execute([$p, $usersId]);
            }

            return ['ok' => true];
        } catch (\Throwable $e) {
            error_log('AiChatUserProviderPrefHelper::saveForUser ' . $e->getMessage());

            return ['ok' => false, 'message' => 'Gagal menyimpan preferensi'];
        }
    }
}
