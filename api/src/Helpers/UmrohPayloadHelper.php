<?php

namespace App\Helpers;

use PDO;

/**
 * Normalisasi payload & binding query modul Umroh.
 */
class UmrohPayloadHelper
{
    public static function pengurusId(?array $user): ?int
    {
        if (!is_array($user) || $user === []) {
            return null;
        }
        $id = RoleHelper::getPengurusIdFromPayload($user);
        return ($id !== null && $id > 0) ? $id : null;
    }

    public static function nullIfEmpty(mixed $value): mixed
    {
        if ($value === null) {
            return null;
        }
        if (is_string($value) && trim($value) === '') {
            return null;
        }
        return is_string($value) ? trim($value) : $value;
    }

    /**
     * @param list<string> $dateFields
     * @param list<string> $enumFields
     * @param list<string> $uniqueEmptyNull
     */
    public static function normalizeRow(array $data, array $dateFields, array $enumFields, array $uniqueEmptyNull = []): array
    {
        $out = [];
        foreach ($data as $key => $value) {
            if (!is_string($key)) {
                continue;
            }
            $v = self::nullIfEmpty($value);
            if ($v === null && (
                in_array($key, $dateFields, true)
                || in_array($key, $enumFields, true)
                || in_array($key, $uniqueEmptyNull, true)
            )) {
                $out[$key] = null;
                continue;
            }
            $out[$key] = $v;
        }

        if (!empty($out['tanggal_lahir']) && empty($out['usia'])) {
            try {
                $born = new \DateTime((string) $out['tanggal_lahir']);
                $out['usia'] = (int) $born->diff(new \DateTime('today'))->y;
            } catch (\Throwable $e) {
                // biarkan usia kosong
            }
        }

        return $out;
    }

    /**
     * @param list<mixed> $params
     * @return list<array<string, mixed>>
     */
    public static function fetchLimited(PDO $db, string $sql, array $params, int $limit, int $offset): array
    {
        $stmt = $db->prepare($sql);
        $i = 1;
        foreach ($params as $p) {
            $stmt->bindValue($i++, $p);
        }
        $stmt->bindValue($i++, $limit, PDO::PARAM_INT);
        $stmt->bindValue($i++, $offset, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }
}
