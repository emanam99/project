<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Penentuan item set PSB aktif & daftar item — logika sama POST /api/pendaftaran/items-by-kondisi.
 */
final class PsbItemSetMatcherHelper
{
    /**
     * @param array<string, mixed> $registrasiData
     * @return list<int>
     */
    public static function findMatchingItemSetIds(\PDO $db, array $registrasiData): array
    {
        try {
            $sql = 'SELECT id, nama_set FROM psb___item_set WHERE is_active = 1 ORDER BY urutan ASC';
            $stmt = $db->prepare($sql);
            $stmt->execute();
            $itemSets = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $matchingSets = [];

            foreach ($itemSets as $set) {
                $sql = 'SELECT 
                            kf.field_name,
                            kv.value
                        FROM psb___item_set_kondisi_rel iskr
                        INNER JOIN psb___kondisi_value kv ON iskr.id_kondisi_value = kv.id
                        INNER JOIN psb___kondisi_field kf ON kv.id_field = kf.id
                        WHERE iskr.id_item_set = ? AND kf.is_active = 1 AND kv.is_active = 1
                        ORDER BY kf.field_name, kv.value';
                $stmt = $db->prepare($sql);
                $stmt->execute([$set['id']]);
                $kondisi = $stmt->fetchAll(\PDO::FETCH_ASSOC);

                if ($kondisi === []) {
                    continue;
                }

                $kondisiByField = [];
                foreach ($kondisi as $k) {
                    $fieldName = $k['field_name'];
                    if (!isset($kondisiByField[$fieldName])) {
                        $kondisiByField[$fieldName] = [];
                    }
                    $kondisiByField[$fieldName][] = $k['value'];
                }

                unset($kondisiByField['status_murid']);
                if ($kondisiByField === []) {
                    continue;
                }

                $allFieldsMatch = true;
                foreach ($kondisiByField as $fieldName => $expectedValues) {
                    if (!isset($registrasiData[$fieldName])) {
                        $allFieldsMatch = false;
                        break;
                    }

                    $registrasiValue = trim((string) $registrasiData[$fieldName]);
                    $fieldMatch = false;
                    foreach ($expectedValues as $expectedValue) {
                        if (trim((string) $expectedValue) === $registrasiValue) {
                            $fieldMatch = true;
                            break;
                        }
                    }

                    if (!$fieldMatch) {
                        $allFieldsMatch = false;
                        break;
                    }
                }

                if ($allFieldsMatch) {
                    $matchingSets[] = (int) $set['id'];
                }
            }

            return $matchingSets;
        } catch (\Throwable $e) {
            error_log('PsbItemSetMatcherHelper::findMatchingItemSetIds ' . $e->getMessage());

            return [];
        }
    }

    /**
     * @param list<int> $matchingSetIds
     * @return array{items: list<array<string, mixed>>, total_wajib: int, matching_set_ids: list<int>}
     */
    public static function resolveItemsFromSetIds(\PDO $db, array $matchingSetIds): array
    {
        if ($matchingSetIds === []) {
            return ['items' => [], 'total_wajib' => 0, 'matching_set_ids' => []];
        }

        $placeholders = implode(',', array_fill(0, count($matchingSetIds), '?'));
        $sql = "SELECT 
                    i.id AS id_item,
                    i.item AS nama_item,
                    COALESCE(i.harga, 0) AS harga,
                    i.kategori,
                    COALESCE(i.urutan, 0) AS urutan,
                    isd.id_item_set
                FROM psb___item_set_detail isd
                INNER JOIN psb___item i ON isd.id_item = i.id
                WHERE isd.id_item_set IN ($placeholders)
                ORDER BY isd.id_item_set ASC, isd.urutan ASC, i.id ASC";
        $stmt = $db->prepare($sql);
        $stmt->execute($matchingSetIds);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        $seen = [];
        $items = [];
        $totalWajib = 0;
        foreach ($rows as $row) {
            $idItem = (int) $row['id_item'];
            if (isset($seen[$idItem])) {
                continue;
            }
            $seen[$idItem] = true;
            $harga = (int) ($row['harga'] ?? 0);
            $items[] = [
                'id' => $idItem,
                'id_item' => $idItem,
                'nama_item' => $row['nama_item'] ?? '',
                'harga' => $harga,
                'kategori' => $row['kategori'] ?? null,
                'urutan' => (int) ($row['urutan'] ?? 0),
            ];
            $totalWajib += $harga;
        }

        return [
            'items' => $items,
            'total_wajib' => $totalWajib,
            'matching_set_ids' => $matchingSetIds,
        ];
    }

    /**
     * @param array<string, mixed> $registrasiData
     * @return array{items: list<array<string, mixed>>, total_wajib: int, matching_set_ids: list<int>}
     */
    public static function resolveItemsForRegistrasiData(\PDO $db, array $registrasiData): array
    {
        $filtered = array_filter($registrasiData, static function ($v) {
            return $v !== null && $v !== '';
        });
        $setIds = self::findMatchingItemSetIds($db, $filtered);

        return self::resolveItemsFromSetIds($db, $setIds);
    }

    public static function tableExists(\PDO $db): bool
    {
        try {
            $st = $db->query("SHOW TABLES LIKE 'psb___item_set'");

            return $st !== false && $st->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * @return list<array<string, mixed>>
     */
    public static function fetchActiveSetsWithKondisiAndItems(\PDO $db): array
    {
        $stmt = $db->query(
            'SELECT id, nama_set, urutan, keterangan FROM psb___item_set WHERE is_active = 1 ORDER BY urutan ASC, nama_set ASC'
        );
        if ($stmt === false) {
            return [];
        }
        $sets = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        foreach ($sets as &$set) {
            $kondisiStmt = $db->prepare(
                'SELECT kf.field_name, kf.field_label, kv.value, kv.value_label
                FROM psb___item_set_kondisi_rel iskr
                INNER JOIN psb___kondisi_value kv ON iskr.id_kondisi_value = kv.id
                INNER JOIN psb___kondisi_field kf ON kv.id_field = kf.id
                WHERE iskr.id_item_set = ? AND kf.is_active = 1 AND kv.is_active = 1
                ORDER BY kf.urutan ASC, kv.urutan ASC'
            );
            $kondisiStmt->execute([$set['id']]);
            $set['kondisi'] = $kondisiStmt->fetchAll(\PDO::FETCH_ASSOC);

            $itemStmt = $db->prepare(
                'SELECT i.id AS id_item, i.item AS nama_item, COALESCE(i.harga, 0) AS harga, i.kategori, isd.urutan
                FROM psb___item_set_detail isd
                INNER JOIN psb___item i ON isd.id_item = i.id
                WHERE isd.id_item_set = ?
                ORDER BY isd.urutan ASC, i.id ASC'
            );
            $itemStmt->execute([$set['id']]);
            $set['items'] = $itemStmt->fetchAll(\PDO::FETCH_ASSOC);
        }
        unset($set);

        return $sets;
    }
}
