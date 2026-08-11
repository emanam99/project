<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Normalisasi flag boolean pengurus (mengajar, dll.) — DB TINYINT 1/0, rumus Bisyaroh, input checkbox.
 */
final class PengurusBooleanHelper
{
    /** @var list<string> */
    public const TRUTHY_STRINGS = ['1', 'true', 'ya', 'yes', 'on', 'y', 'iya'];

    /** @var list<string> */
    public const FALSY_STRINGS = ['0', 'false', 'tidak', 'no', 'off', 'n'];

    public static function isTruthy(mixed $raw): bool
    {
        if ($raw === null || $raw === '') {
            return false;
        }
        if (is_bool($raw)) {
            return $raw;
        }
        if (is_numeric($raw)) {
            return ((int) round((float) $raw)) !== 0;
        }
        $s = strtolower(trim((string) $raw));
        if ($s === '') {
            return false;
        }
        if (in_array($s, self::FALSY_STRINGS, true)) {
            return false;
        }
        if (in_array($s, self::TRUTHY_STRINGS, true)) {
            return true;
        }

        return false;
    }

    public static function normalizeToTinyInt(mixed $raw): int
    {
        return self::isTruthy($raw) ? 1 : 0;
    }

    /** Token numerik untuk evaluator rumus Bisyaroh. */
    public static function toFormulaToken(mixed $raw): string
    {
        return self::isTruthy($raw) ? '1' : '0';
    }

    public static function toDisplayLabel(mixed $raw): string
    {
        return self::isTruthy($raw) ? 'Ya' : 'Tidak';
    }
}
