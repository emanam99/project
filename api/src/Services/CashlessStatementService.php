<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Riwayat mutasi wallet dari ledger (semua tipe jurnal).
 */
class CashlessStatementService
{
    private \PDO $db;

    public function __construct(\PDO $db)
    {
        $this->db = $db;
    }

    /**
     * @return array{success: bool, message?: string, data?: list<array>}
     */
    public function listForSantri(int $santriId, int $limit = 50): array
    {
        $walletId = $this->resolveWalletId($santriId);
        if ($walletId === null) {
            return ['success' => true, 'data' => [], 'message' => 'Belum punya akun wallet'];
        }
        return $this->listForAccount($walletId, $limit);
    }

    /**
     * @return array{success: bool, message?: string, data?: list<array>}
     */
    public function listForPedagang(int $pedagangId, int $limit = 50): array
    {
        $walletId = $this->resolveWalletIdForEntity('PEDAGANG', $pedagangId);
        if ($walletId === null) {
            return ['success' => true, 'data' => [], 'message' => 'Belum punya akun wallet'];
        }
        return $this->listForAccount($walletId, $limit);
    }

    /**
     * @return array{success: bool, message?: string, data?: list<array>}
     */
    public function listForAccount(int $accountId, int $limit = 50): array
    {
        $limit = min(100, max(1, $limit));
        $sql = "SELECT j.id, j.type, j.reference, j.description, j.meta, j.created_at, j.channel,
                       j.created_by, j.actor_user_id, j.reversal_of_journal_id,
                       le.debit, le.credit,
                       COALESCE(u.username, u_pg.username) AS actor_username,
                       p.nama_toko AS toko_nama
                FROM cashless___ledger_entries le
                INNER JOIN cashless___journal j ON j.id = le.journal_id
                LEFT JOIN users u ON u.id = COALESCE(j.actor_user_id, j.created_by)
                LEFT JOIN pengurus pg ON pg.id = COALESCE(j.actor_user_id, j.created_by)
                LEFT JOIN users u_pg ON u_pg.id = pg.id_user
                LEFT JOIN cashless___transaksi_detail td ON td.journal_id = j.id
                LEFT JOIN cashless___pedagang p ON p.id = td.pedagang_id
                WHERE le.account_id = ?
                ORDER BY j.created_at DESC, j.id DESC, le.id DESC
                LIMIT $limit";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$accountId]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

        $data = [];
        foreach ($rows as $row) {
            $meta = [];
            if (!empty($row['meta'])) {
                $decoded = json_decode((string) $row['meta'], true);
                if (is_array($decoded)) {
                    $meta = $decoded;
                }
            }
            $debit = (float) ($row['debit'] ?? 0);
            $credit = (float) ($row['credit'] ?? 0);
            $direction = $credit > 0 ? 'in' : ($debit > 0 ? 'out' : 'neutral');
            $nominal = $direction === 'in' ? $credit : $debit;
            $type = (string) ($row['type'] ?? '');
            $channel = (string) ($row['channel'] ?? ($meta['channel'] ?? ''));
            $actorUserId = $row['actor_user_id'] ?? $row['created_by'] ?? ($meta['actor_user_id'] ?? null);
            $actorUsername = $row['actor_username'] ?? ($meta['actor_username'] ?? null);

            $data[] = [
                'id' => (int) $row['id'],
                'journal_id' => (int) $row['id'],
                'journal_type' => $type,
                'channel' => $channel,
                'direction' => $direction,
                'nominal' => $nominal,
                'signed_amount' => $direction === 'out' ? -$nominal : $nominal,
                'label' => $this->resolveLabel($type, $channel, $meta, $direction),
                'description' => $row['description'] ?? null,
                'reference' => $row['reference'] ?? null,
                'referensi' => $meta['referensi'] ?? null,
                'created_at' => $row['created_at'] ?? null,
                'actor_user_id' => $actorUserId !== null && $actorUserId !== '' ? (int) $actorUserId : null,
                'actor_username' => is_string($actorUsername) && $actorUsername !== '' ? $actorUsername : null,
                'toko_nama' => !empty($row['toko_nama']) ? (string) $row['toko_nama'] : null,
                'reversal_of_journal_id' => isset($row['reversal_of_journal_id']) ? (int) $row['reversal_of_journal_id'] : null,
                'gateway_payment_id' => isset($meta['gateway_payment_id']) ? (int) $meta['gateway_payment_id'] : null,
            ];
        }

        return ['success' => true, 'data' => $data];
    }

    /**
     * Detail satu jurnal milik wallet santri (top-up / belanja / dll).
     *
     * @return array{success: bool, message?: string, data?: array<string, mixed>}
     */
    public function detailForSantri(int $santriId, int $journalId): array
    {
        if ($journalId <= 0) {
            return ['success' => false, 'message' => 'ID transaksi tidak valid'];
        }
        $walletId = $this->resolveWalletId($santriId);
        if ($walletId === null) {
            return ['success' => false, 'message' => 'Belum punya akun wallet'];
        }

        $stmt = $this->db->prepare(
            "SELECT j.id, j.type, j.reference, j.description, j.meta, j.created_at, j.channel,
                    j.created_by, j.actor_user_id, j.reversal_of_journal_id,
                    le.debit, le.credit,
                    COALESCE(u.username, u_pg.username) AS actor_username
             FROM cashless___ledger_entries le
             INNER JOIN cashless___journal j ON j.id = le.journal_id
             LEFT JOIN users u ON u.id = COALESCE(j.actor_user_id, j.created_by)
             LEFT JOIN pengurus pg ON pg.id = COALESCE(j.actor_user_id, j.created_by)
             LEFT JOIN users u_pg ON u_pg.id = pg.id_user
             WHERE le.account_id = ? AND j.id = ?
             LIMIT 1"
        );
        $stmt->execute([$walletId, $journalId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            return ['success' => false, 'message' => 'Transaksi tidak ditemukan'];
        }

        $meta = [];
        if (!empty($row['meta'])) {
            $decoded = json_decode((string) $row['meta'], true);
            if (is_array($decoded)) {
                $meta = $decoded;
            }
        }
        $debit = (float) ($row['debit'] ?? 0);
        $credit = (float) ($row['credit'] ?? 0);
        $direction = $credit > 0 ? 'in' : ($debit > 0 ? 'out' : 'neutral');
        $nominal = $direction === 'in' ? $credit : $debit;
        $type = (string) ($row['type'] ?? '');
        $channel = (string) ($row['channel'] ?? ($meta['channel'] ?? ''));
        $actorUserId = $row['actor_user_id'] ?? $row['created_by'] ?? ($meta['actor_user_id'] ?? null);
        $actorUsername = $row['actor_username'] ?? ($meta['actor_username'] ?? null);

        $data = [
            'journal_id' => (int) $row['id'],
            'journal_type' => $type,
            'channel' => $channel,
            'direction' => $direction,
            'nominal' => $nominal,
            'signed_amount' => $direction === 'out' ? -$nominal : $nominal,
            'label' => $this->resolveLabel($type, $channel, $meta, $direction),
            'description' => $row['description'] ?? null,
            'reference' => $row['reference'] ?? null,
            'referensi' => $meta['referensi'] ?? null,
            'created_at' => $row['created_at'] ?? null,
            'actor_user_id' => $actorUserId !== null && $actorUserId !== '' ? (int) $actorUserId : null,
            'actor_username' => is_string($actorUsername) && $actorUsername !== '' ? $actorUsername : null,
            'reversal_of_journal_id' => isset($row['reversal_of_journal_id']) ? (int) $row['reversal_of_journal_id'] : null,
            'metode' => isset($meta['metode']) ? (string) $meta['metode'] : null,
            'metode_label' => isset($meta['metode_label']) ? (string) $meta['metode_label'] : null,
            'gateway_payment_id' => isset($meta['gateway_payment_id']) ? (int) $meta['gateway_payment_id'] : null,
            'purchase' => null,
        ];

        if ($type === 'PURCHASE') {
            $data['purchase'] = $this->loadPurchaseDetail($journalId, $santriId);
        }

        return ['success' => true, 'data' => $data];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function loadPurchaseDetail(int $journalId, int $santriId): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT td.id, td.nominal, td.keterangan, td.transaksi_at, td.pedagang_id,
                    p.nama_toko, p.kode_toko
             FROM cashless___transaksi_detail td
             LEFT JOIN cashless___pedagang p ON p.id = td.pedagang_id
             WHERE td.journal_id = ? AND td.santri_id = ?
             LIMIT 1"
        );
        $stmt->execute([$journalId, $santriId]);
        $td = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$td) {
            return null;
        }

        $itemsStmt = $this->db->prepare(
            'SELECT id, barang_id, kode_barang, nama_barang, harga_satuan, qty, subtotal
             FROM cashless___penjualan_item
             WHERE transaksi_detail_id = ?
             ORDER BY id ASC'
        );
        $itemsStmt->execute([(int) $td['id']]);
        $items = [];
        while ($it = $itemsStmt->fetch(\PDO::FETCH_ASSOC)) {
            $items[] = [
                'id' => (int) $it['id'],
                'barang_id' => $it['barang_id'] !== null ? (int) $it['barang_id'] : null,
                'kode_barang' => $it['kode_barang'],
                'nama_barang' => $it['nama_barang'],
                'harga_satuan' => (float) $it['harga_satuan'],
                'qty' => (int) $it['qty'],
                'subtotal' => (float) $it['subtotal'],
            ];
        }

        return [
            'transaksi_detail_id' => (int) $td['id'],
            'nominal' => (float) $td['nominal'],
            'keterangan' => $td['keterangan'],
            'transaksi_at' => $td['transaksi_at'],
            'pedagang_id' => $td['pedagang_id'] !== null ? (int) $td['pedagang_id'] : null,
            'toko_nama' => $td['nama_toko'] ?? null,
            'toko_kode' => $td['kode_toko'] ?? null,
            'items' => $items,
        ];
    }

    /**
     * Detail satu jurnal milik wallet toko/pedagang.
     *
     * @return array{success: bool, message?: string, data?: array<string, mixed>}
     */
    public function detailForPedagang(int $pedagangId, int $journalId): array
    {
        if ($journalId <= 0) {
            return ['success' => false, 'message' => 'ID transaksi tidak valid'];
        }
        $walletId = $this->resolveWalletIdForEntity('PEDAGANG', $pedagangId);
        if ($walletId === null) {
            return ['success' => false, 'message' => 'Belum punya akun wallet'];
        }

        $stmt = $this->db->prepare(
            "SELECT j.id, j.type, j.reference, j.description, j.meta, j.created_at, j.channel,
                    j.created_by, j.actor_user_id, j.reversal_of_journal_id,
                    le.debit, le.credit,
                    COALESCE(u.username, u_pg.username) AS actor_username
             FROM cashless___ledger_entries le
             INNER JOIN cashless___journal j ON j.id = le.journal_id
             LEFT JOIN users u ON u.id = COALESCE(j.actor_user_id, j.created_by)
             LEFT JOIN pengurus pg ON pg.id = COALESCE(j.actor_user_id, j.created_by)
             LEFT JOIN users u_pg ON u_pg.id = pg.id_user
             WHERE le.account_id = ? AND j.id = ?
             LIMIT 1"
        );
        $stmt->execute([$walletId, $journalId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            return ['success' => false, 'message' => 'Transaksi tidak ditemukan'];
        }

        $meta = [];
        if (!empty($row['meta'])) {
            $decoded = json_decode((string) $row['meta'], true);
            if (is_array($decoded)) {
                $meta = $decoded;
            }
        }
        $debit = (float) ($row['debit'] ?? 0);
        $credit = (float) ($row['credit'] ?? 0);
        $direction = $credit > 0 ? 'in' : ($debit > 0 ? 'out' : 'neutral');
        $nominal = $direction === 'in' ? $credit : $debit;
        $type = (string) ($row['type'] ?? '');
        $channel = (string) ($row['channel'] ?? ($meta['channel'] ?? ''));
        $actorUserId = $row['actor_user_id'] ?? $row['created_by'] ?? ($meta['actor_user_id'] ?? null);
        $actorUsername = $row['actor_username'] ?? ($meta['actor_username'] ?? null);

        $data = [
            'journal_id' => (int) $row['id'],
            'journal_type' => $type,
            'channel' => $channel,
            'direction' => $direction,
            'nominal' => $nominal,
            'signed_amount' => $direction === 'out' ? -$nominal : $nominal,
            'label' => $this->resolveLabel($type, $channel, $meta, $direction),
            'description' => $row['description'] ?? null,
            'reference' => $row['reference'] ?? null,
            'referensi' => $meta['referensi'] ?? null,
            'created_at' => $row['created_at'] ?? null,
            'actor_user_id' => $actorUserId !== null && $actorUserId !== '' ? (int) $actorUserId : null,
            'actor_username' => is_string($actorUsername) && $actorUsername !== '' ? $actorUsername : null,
            'reversal_of_journal_id' => isset($row['reversal_of_journal_id']) ? (int) $row['reversal_of_journal_id'] : null,
            'metode' => isset($meta['metode']) ? (string) $meta['metode'] : null,
            'metode_label' => isset($meta['metode_label']) ? (string) $meta['metode_label'] : null,
            'gateway_payment_id' => isset($meta['gateway_payment_id']) ? (int) $meta['gateway_payment_id'] : null,
            'purchase' => null,
        ];

        if ($type === 'PURCHASE') {
            $data['purchase'] = $this->loadPurchaseDetailForPedagang($journalId, $pedagangId);
        }

        return ['success' => true, 'data' => $data];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function loadPurchaseDetailForPedagang(int $journalId, int $pedagangId): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT td.id, td.nominal, td.keterangan, td.transaksi_at, td.pedagang_id, td.santri_id,
                    p.nama_toko, p.kode_toko
             FROM cashless___transaksi_detail td
             LEFT JOIN cashless___pedagang p ON p.id = td.pedagang_id
             WHERE td.journal_id = ? AND td.pedagang_id = ?
             LIMIT 1"
        );
        $stmt->execute([$journalId, $pedagangId]);
        $td = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$td) {
            return null;
        }

        $itemsStmt = $this->db->prepare(
            'SELECT id, barang_id, kode_barang, nama_barang, harga_satuan, qty, subtotal
             FROM cashless___penjualan_item
             WHERE transaksi_detail_id = ?
             ORDER BY id ASC'
        );
        $itemsStmt->execute([(int) $td['id']]);
        $items = [];
        while ($it = $itemsStmt->fetch(\PDO::FETCH_ASSOC)) {
            $items[] = [
                'id' => (int) $it['id'],
                'barang_id' => $it['barang_id'] !== null ? (int) $it['barang_id'] : null,
                'kode_barang' => $it['kode_barang'],
                'nama_barang' => $it['nama_barang'],
                'harga_satuan' => (float) $it['harga_satuan'],
                'qty' => (int) $it['qty'],
                'subtotal' => (float) $it['subtotal'],
            ];
        }

        return [
            'transaksi_detail_id' => (int) $td['id'],
            'nominal' => (float) $td['nominal'],
            'keterangan' => $td['keterangan'],
            'transaksi_at' => $td['transaksi_at'],
            'pedagang_id' => $td['pedagang_id'] !== null ? (int) $td['pedagang_id'] : null,
            'toko_nama' => $td['nama_toko'] ?? null,
            'toko_kode' => $td['kode_toko'] ?? null,
            'items' => $items,
        ];
    }

    private function resolveWalletId(int $santriId): ?int
    {
        return $this->resolveWalletIdForEntity('SANTRI', $santriId);
    }

    private function resolveWalletIdForEntity(string $entityType, int $entityId): ?int
    {
        $stmt = $this->db->prepare(
            'SELECT id FROM cashless___accounts WHERE entity_type = ? AND entity_id = ? LIMIT 1'
        );
        $stmt->execute([$entityType, $entityId]);
        $id = $stmt->fetchColumn();
        return $id ? (int) $id : null;
    }

    /**
     * @param array<string, mixed> $meta
     */
    private function resolveLabel(string $type, string $channel, array $meta, string $direction): string
    {
        if ($type === 'REVERSAL') {
            return 'Pembatalan';
        }
        if ($type === 'TRANSFER' || $channel === 'wallet') {
            return $direction === 'in' ? 'Transfer masuk' : 'Transfer keluar';
        }
        if ($channel === 'gateway') {
            return 'Top-up iPayMu';
        }
        if ($type === 'TOPUP') {
            return (string) ($meta['metode_label'] ?? 'Top-up');
        }
        if ($type === 'PURCHASE') {
            return 'Belanja';
        }
        if ($type === 'WITHDRAWAL') {
            return 'Penarikan';
        }
        return $type !== '' ? $type : 'Transaksi';
    }
}
