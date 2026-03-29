<?php

declare(strict_types=1);

namespace App\Config;

use App\Database;
use PDO;

/**
 * Memuat daftar kode selector untuk EbeddienFiturMiddleware dari tabel ebeddien_fitur_selector.
 * Cache per proses PHP; fallback ke EbeddienFiturAccessDefinitions.
 */
final class EbeddienFiturSelectorRepository
{
    /** @var array<string, list<string>>|null */
    private static ?array $fromDb = null;

    public static function clearCache(): void
    {
        self::$fromDb = null;
    }

    /**
     * @return list<string>
     */
    public static function codesForMethod(string $methodName): array
    {
        $map = self::loadMap();
        if (isset($map[$methodName]) && is_array($map[$methodName]) && $map[$methodName] !== []) {
            return self::normalizeList($map[$methodName]);
        }

        return self::fromDefinitions($methodName);
    }

    /**
     * @return list<string>
     */
    private static function fromDefinitions(string $methodName): array
    {
        if (!method_exists(EbeddienFiturAccessDefinitions::class, $methodName)) {
            error_log('EbeddienFiturSelectorRepository: method tidak ada: ' . $methodName);

            return [];
        }

        $out = call_user_func([EbeddienFiturAccessDefinitions::class, $methodName]);

        return is_array($out) ? self::normalizeList($out) : [];
    }

    /**
     * @return array<string, list<string>>
     */
    private static function loadMap(): array
    {
        if (self::$fromDb !== null) {
            return self::$fromDb;
        }
        self::$fromDb = [];
        try {
            $pdo = Database::getInstance()->getConnection();
            $stmt = $pdo->query('SELECT `selector_key`, `codes_json` FROM `ebeddien_fitur_selector`');
            if ($stmt === false) {
                return self::$fromDb;
            }
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $key = (string) ($row['selector_key'] ?? '');
                if ($key === '') {
                    continue;
                }
                $decoded = json_decode((string) ($row['codes_json'] ?? '[]'), true);
                if (is_array($decoded)) {
                    self::$fromDb[$key] = self::normalizeList($decoded);
                }
            }
        } catch (\Throwable $e) {
            error_log('EbeddienFiturSelectorRepository::loadMap: ' . $e->getMessage());
        }

        return self::$fromDb;
    }

    /**
     * @param list<mixed> $list
     * @return list<string>
     */
    private static function normalizeList(array $list): array
    {
        $out = [];
        foreach ($list as $v) {
            if (is_string($v) && $v !== '') {
                $out[] = $v;
            }
        }

        return $out;
    }
}
