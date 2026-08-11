<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Resolusi akun cashless dari users.id (santri / pedagang).
 */
class CashlessUserAccountResolver
{
    private \PDO $db;

    public function __construct(\PDO $db)
    {
        $this->db = $db;
    }

    /**
     * @return array{id: int, entity_type: string, entity_id: int, balance_cached: float, name: string}|null
     */
    public function resolveWalletByUserId(int $userId): ?array
    {
        if ($userId <= 0) {
            return null;
        }

        $stmtSantri = $this->db->prepare('SELECT id, nama FROM santri WHERE id_user = ? LIMIT 1');
        $stmtSantri->execute([$userId]);
        $santri = $stmtSantri->fetch(\PDO::FETCH_ASSOC);
        if ($santri) {
            return $this->fetchAccount('SANTRI', (int) $santri['id'], (string) ($santri['nama'] ?? 'Santri'));
        }

        $stmtPedagang = $this->db->prepare('SELECT id, nama_toko FROM cashless___pedagang WHERE id_users = ? LIMIT 1');
        $stmtPedagang->execute([$userId]);
        $pedagang = $stmtPedagang->fetch(\PDO::FETCH_ASSOC);
        if ($pedagang) {
            return $this->fetchAccount('PEDAGANG', (int) $pedagang['id'], (string) ($pedagang['nama_toko'] ?? 'Toko'));
        }

        return null;
    }

    /**
     * @return array{id: int, entity_type: string, entity_id: int, balance_cached: float, name: string}|null
     */
    private function fetchAccount(string $entityType, int $entityId, string $label): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT id, entity_type, entity_id, balance_cached, name FROM cashless___accounts
             WHERE entity_type = ? AND entity_id = ? LIMIT 1'
        );
        $stmt->execute([$entityType, $entityId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }
        return [
            'id' => (int) $row['id'],
            'entity_type' => (string) $row['entity_type'],
            'entity_id' => (int) $row['entity_id'],
            'balance_cached' => (float) $row['balance_cached'],
            'name' => (string) ($row['name'] ?: $label),
        ];
    }
}
