<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Tingkatan madrasah — banyak pilihan disimpan satu kolom JSON (array slug).
 */
final class MadrasahTingkatanHelper
{
    /** @var array<string, string> slug => label UI */
    public const SLUG_LABELS = [
        'tpq' => 'TPQ',
        'ula' => 'Ula',
        'wustha' => 'Wustha',
        'ulya' => 'Ulya',
        'ma_had_ali' => "Ma'had Ali",
        'ibtidayiyah' => "Ibtida'iyah",
        'tsanawiyah' => 'Tsanawiyah',
        'aliyah' => 'Aliyah',
    ];

    /** Kolom boolean legacy (pra-migrasi). */
    private const LEGACY_BOOL_COLUMNS = ['tpq', 'ula', 'wustha', 'ulya', 'ma_had_ali'];

    /**
     * @return list<string>
     */
    public static function knownSlugs(): array
    {
        return array_keys(self::SLUG_LABELS);
    }

    /**
     * @param array<string, mixed> $row
     * @return list<string>
     */
    public static function slugsFromRow(array $row): array
    {
        $fromJson = self::decode(isset($row['tingkatan']) ? $row['tingkatan'] : null);
        if ($fromJson !== []) {
            return $fromJson;
        }
        $legacy = [];
        foreach (self::LEGACY_BOOL_COLUMNS as $slug) {
            if (!empty($row[$slug]) && ((int) $row[$slug] === 1 || $row[$slug] === true)) {
                $legacy[] = $slug;
            }
        }

        return $legacy;
    }

    /**
     * @param mixed $raw JSON string/array dari DB atau request
     * @return list<string>
     */
    public static function decode($raw): array
    {
        if ($raw === null || $raw === '') {
            return [];
        }
        if (is_array($raw)) {
            return self::normalizeSlugs($raw);
        }
        $s = trim((string) $raw);
        if ($s === '') {
            return [];
        }
        if ($s[0] === '[') {
            $decoded = json_decode($s, true);
            if (is_array($decoded)) {
                return self::normalizeSlugs($decoded);
            }
        }

        return self::slugsFromLabelsString($s);
    }

    /**
     * @param list<string> $slugs
     */
    public static function encode(array $slugs): ?string
    {
        $normalized = self::normalizeSlugs($slugs);
        if ($normalized === []) {
            return null;
        }

        return json_encode($normalized, JSON_UNESCAPED_UNICODE);
    }

    /**
     * @param array<string, mixed> $data body request
     */
    public static function parseFromRequest(array $data): ?string
    {
        $slugs = [];

        if (array_key_exists('tingkatan', $data)) {
            $raw = $data['tingkatan'];
            if (is_array($raw)) {
                $slugs = self::normalizeSlugs($raw);
            } elseif (is_string($raw) && trim($raw) !== '') {
                $slugs = self::slugsFromLabelsString($raw);
            }
        }

        foreach (self::LEGACY_BOOL_COLUMNS as $slug) {
            if (isset($data[$slug]) && (bool) $data[$slug]) {
                $slugs[] = $slug;
            }
        }

        return self::encode($slugs);
    }

    /**
     * @param list<string> $slugs
     */
    public static function labelsFromSlugs(array $slugs): string
    {
        $labels = [];
        foreach (self::normalizeSlugs($slugs) as $slug) {
            $labels[] = self::SLUG_LABELS[$slug] ?? $slug;
        }

        return implode(', ', $labels);
    }

    /**
     * Parse label atau slug dipisah koma (untuk import Excel).
     *
     * @return list<string>
     */
    public static function slugsFromLabelsString(string $text): array
    {
        $parts = preg_split('/\s*,\s*/', trim($text)) ?: [];
        $slugs = [];
        $labelToSlug = [];
        foreach (self::SLUG_LABELS as $slug => $label) {
            $labelToSlug[mb_strtolower($label)] = $slug;
            $labelToSlug[$slug] = $slug;
        }
        foreach ($parts as $part) {
            $p = trim($part);
            if ($p === '') {
                continue;
            }
            $key = mb_strtolower($p);
            if (isset($labelToSlug[$key])) {
                $slugs[] = $labelToSlug[$key];
            }
        }

        return self::normalizeSlugs($slugs);
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    public static function enrichRow(array $row): array
    {
        $slugs = self::slugsFromRow($row);
        $row['tingkatan'] = $slugs;
        $row['tingkatan_label'] = self::labelsFromSlugs($slugs);
        foreach (self::LEGACY_BOOL_COLUMNS as $legacy) {
            unset($row[$legacy]);
        }

        return $row;
    }

    /**
     * @param list<mixed> $items
     * @return list<mixed>
     */
    public static function enrichList(array $items): array
    {
        return array_map(
            static fn ($row) => is_array($row) ? self::enrichRow($row) : $row,
            $items
        );
    }

    /**
     * @param list<mixed> $input
     * @return list<string>
     */
    private static function normalizeSlugs(array $input): array
    {
        $known = array_flip(self::knownSlugs());
        $out = [];
        foreach ($input as $item) {
            $slug = is_string($item) ? trim($item) : '';
            if ($slug === '' || !isset($known[$slug])) {
                continue;
            }
            $out[$slug] = $slug;
        }

        return array_values($out);
    }
}
