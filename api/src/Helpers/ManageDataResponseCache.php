<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Cache ringkas respons JSON Manage Data (APCu). Fallback no-op jika APCu tidak ada.
 */
final class ManageDataResponseCache
{
    private static function enabled(): bool
    {
        return function_exists('apcu_fetch') && function_exists('apcu_store')
            && (bool) ini_get('apc.enabled');
    }

    public static function makeKey(string $routeSuffix, array $queryParams): string
    {
        ksort($queryParams);

        return 'manage_data_' . $routeSuffix . '_' . md5(json_encode($queryParams));
    }

    /** @return array<string,mixed>|null */
    public static function get(string $key): ?array
    {
        if (!self::enabled()) {
            return null;
        }
        $v = @apcu_fetch($key);
        if (!is_array($v)) {
            return null;
        }

        return $v;
    }

    /** @param array<string,mixed> $payload */
    public static function set(string $key, array $payload, int $ttlSeconds = 20): void
    {
        if (!self::enabled()) {
            return;
        }
        @apcu_store($key, $payload, max(5, $ttlSeconds));
    }
}
