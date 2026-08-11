<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\CashlessMoneyLimitsHelper;

/**
 * Tarik tunai / penarikan wallet (double-entry) — kebalikan top-up eksternal.
 *
 * Debit wallet (LIABILITY ↓), kredit Kas SYSTEM (ASSET ↓).
 * Channel counter (petugas eBeddien).
 */
class CashlessWithdrawService
{
    private \PDO $db;

    private CashlessLedgerService $ledger;

    private const CODE_KAS = '1000001';

    /** @var array<string, string> */
    private const METODE_LABELS = [
        'tunai' => 'Cash',
        'transfer' => 'TF',
        'qris' => 'QRIS',
        'lainnya' => 'Lainnya',
    ];

    public function __construct(\PDO $db)
    {
        $this->db = $db;
        $this->ledger = new CashlessLedgerService($db);
    }

    /**
     * @return array{success: bool, message?: string, data?: array}
     */
    public function withdrawSantri(
        int $santriId,
        float $nominal,
        ?string $referensi,
        string $metode,
        ?int $actorUserId
    ): array {
        $metode = $this->normalizeMetode($metode);
        $limits = CashlessMoneyLimitsHelper::getLimits($this->db);
        $chk = CashlessMoneyLimitsHelper::assertMaxPerTx($nominal, $limits['withdraw_max_per_tx'], 'Tarik tunai');
        if (!($chk['ok'] ?? false)) {
            return ['success' => false, 'message' => $chk['message'] ?? 'Nominal tidak valid'];
        }

        $stmtSantri = $this->db->prepare('SELECT id, nama FROM santri WHERE id = ? LIMIT 1');
        $stmtSantri->execute([$santriId]);
        $santri = $stmtSantri->fetch(\PDO::FETCH_ASSOC);
        if (!$santri) {
            return ['success' => false, 'message' => 'Santri tidak ditemukan'];
        }

        return $this->withdrawEntity(
            'SANTRI',
            $santriId,
            (string) ($santri['nama'] ?? 'Santri #' . $santriId),
            $nominal,
            $referensi,
            $metode,
            $actorUserId,
            ['santri_id' => $santriId]
        );
    }

    /**
     * @return array{success: bool, message?: string, data?: array}
     */
    public function withdrawPedagang(
        int $pedagangId,
        float $nominal,
        ?string $referensi,
        string $metode,
        ?int $actorUserId
    ): array {
        $metode = $this->normalizeMetode($metode);
        $limits = CashlessMoneyLimitsHelper::getLimits($this->db);
        $chk = CashlessMoneyLimitsHelper::assertMaxPerTx($nominal, $limits['withdraw_max_per_tx'], 'Tarik tunai');
        if (!($chk['ok'] ?? false)) {
            return ['success' => false, 'message' => $chk['message'] ?? 'Nominal tidak valid'];
        }

        $stmt = $this->db->prepare('SELECT id, nama_toko, kode_toko FROM cashless___pedagang WHERE id = ? LIMIT 1');
        $stmt->execute([$pedagangId]);
        $toko = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$toko) {
            return ['success' => false, 'message' => 'Toko tidak ditemukan'];
        }

        $label = trim((string) ($toko['nama_toko'] ?? ''));
        if ($label === '') {
            $label = 'Toko #' . $pedagangId;
        }

        return $this->withdrawEntity(
            'PEDAGANG',
            $pedagangId,
            $label,
            $nominal,
            $referensi,
            $metode,
            $actorUserId,
            [
                'pedagang_id' => $pedagangId,
                'kode_toko' => $toko['kode_toko'] ?? null,
            ]
        );
    }

    /**
     * @param array<string, mixed> $metaExtra
     * @return array{success: bool, message?: string, data?: array}
     */
    private function withdrawEntity(
        string $entityType,
        int $entityId,
        string $entityLabel,
        float $nominal,
        ?string $referensi,
        string $metode,
        ?int $actorUserId,
        array $metaExtra
    ): array {
        $kasId = $this->resolveKasAccountId();
        if ($kasId === null) {
            return ['success' => false, 'message' => 'Akun kas cashless belum dikonfigurasi'];
        }

        $nominal = round($nominal, 2);
        $prefix = $entityType === 'PEDAGANG' ? 'WD-TOKO' : 'WD-SANTRI';
        $reference = $prefix . '-' . $entityId . '-' . date('YmdHis');
        $description = 'Tarik tunai ' . $entityLabel;

        try {
            $this->db->beginTransaction();

            $stmtWallet = $this->db->prepare(
                "SELECT id, code, name, balance_cached FROM cashless___accounts
                 WHERE entity_type = ? AND entity_id = ? AND type = 'LIABILITY'
                 LIMIT 1
                 FOR UPDATE"
            );
            $stmtWallet->execute([$entityType, $entityId]);
            $wallet = $stmtWallet->fetch(\PDO::FETCH_ASSOC);
            if (!$wallet) {
                $this->db->rollBack();
                return [
                    'success' => false,
                    'message' => $entityType === 'PEDAGANG'
                        ? 'Toko belum punya akun wallet'
                        : 'Santri belum punya akun wallet',
                ];
            }

            $walletId = (int) $wallet['id'];
            $walletBalance = (float) $wallet['balance_cached'];
            if ($walletBalance + 0.001 < $nominal) {
                $this->db->rollBack();
                return ['success' => false, 'message' => 'Saldo wallet tidak mencukupi'];
            }

            $stmtKas = $this->db->prepare(
                "SELECT id, balance_cached FROM cashless___accounts WHERE id = ? AND type = 'ASSET' LIMIT 1 FOR UPDATE"
            );
            $stmtKas->execute([$kasId]);
            $kas = $stmtKas->fetch(\PDO::FETCH_ASSOC);
            if (!$kas) {
                $this->db->rollBack();
                return ['success' => false, 'message' => 'Akun kas cashless tidak ditemukan'];
            }
            $kasBalance = (float) $kas['balance_cached'];
            if ($kasBalance + 0.001 < $nominal) {
                $this->db->rollBack();
                return ['success' => false, 'message' => 'Saldo kas sistem tidak mencukupi untuk tarik tunai'];
            }

            $meta = $this->buildMeta($metode, $referensi, $actorUserId, $metaExtra);

            $posted = $this->ledger->postJournal(
                'WITHDRAWAL',
                $reference,
                $description,
                [
                    ['account_id' => $walletId, 'debit' => $nominal, 'credit' => 0.0],
                    ['account_id' => $kasId, 'debit' => 0.0, 'credit' => $nominal],
                ],
                $actorUserId,
                $walletId,
                $kasId,
                'counter',
                $meta
            );

            if (!($posted['success'] ?? false)) {
                $this->db->rollBack();
                return ['success' => false, 'message' => $posted['message'] ?? 'Gagal posting jurnal'];
            }

            $journalId = (int) ($posted['journal_id'] ?? 0);

            if ($entityType === 'PEDAGANG') {
                $insPen = $this->db->prepare(
                    'INSERT INTO cashless___penarikan
                        (pedagang_id, journal_id, nominal, metode, rekening, status, requested_at, processed_at, catatan)
                     VALUES (?, ?, ?, ?, NULL, \'selesai\', NOW(), NOW(), ?)'
                );
                $insPen->execute([
                    $entityId,
                    $journalId > 0 ? $journalId : null,
                    $nominal,
                    $metode,
                    $referensi !== null && $referensi !== '' ? $referensi : null,
                ]);
            }

            $this->db->commit();

            $newBalance = round($walletBalance - $nominal, 2);

            return [
                'success' => true,
                'message' => 'Tarik tunai berhasil',
                'data' => [
                    'journal_id' => $journalId,
                    'journal_type' => 'WITHDRAWAL',
                    'channel' => 'counter',
                    'entity_type' => $entityType,
                    'entity_id' => $entityId,
                    'santri_id' => $entityType === 'SANTRI' ? $entityId : null,
                    'pedagang_id' => $entityType === 'PEDAGANG' ? $entityId : null,
                    'account_id' => $walletId,
                    'actor_user_id' => $actorUserId,
                    'nominal' => $nominal,
                    'metode' => $metode,
                    'metode_label' => self::METODE_LABELS[$metode] ?? $metode,
                    'balance_cached' => $newBalance,
                    'kas_balance_after' => round($kasBalance - $nominal, 2),
                    'reference' => $reference,
                ],
            ];
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('CashlessWithdrawService::withdrawEntity ' . $e->getMessage());
            return ['success' => false, 'message' => 'Gagal melakukan tarik tunai'];
        }
    }

    /**
     * @return array{success: bool, message?: string, data?: list<array>}
     */
    public function listHistorySantri(int $santriId, int $limit = 50): array
    {
        return $this->listHistoryByEntity('SANTRI', $santriId, $limit);
    }

    /**
     * @return array{success: bool, message?: string, data?: list<array>}
     */
    public function listHistoryPedagang(int $pedagangId, int $limit = 50): array
    {
        return $this->listHistoryByEntity('PEDAGANG', $pedagangId, $limit);
    }

    /**
     * @return array{success: bool, message?: string, data?: list<array>}
     */
    private function listHistoryByEntity(string $entityType, int $entityId, int $limit): array
    {
        $stmtAcc = $this->db->prepare(
            "SELECT id FROM cashless___accounts WHERE entity_type = ? AND entity_id = ? LIMIT 1"
        );
        $stmtAcc->execute([$entityType, $entityId]);
        $walletId = (int) ($stmtAcc->fetchColumn() ?: 0);
        if ($walletId <= 0) {
            return ['success' => true, 'data' => []];
        }

        $limit = min(100, max(1, $limit));
        $sql = "SELECT j.id, j.type, j.reference, j.description, j.meta, j.created_at,
                       j.created_by, j.actor_user_id, j.source_account_id, j.dest_account_id, j.channel,
                       le.debit AS nominal,
                       COALESCE(u.username, u_pg.username) AS actor_username
                FROM cashless___journal j
                INNER JOIN cashless___ledger_entries le ON le.journal_id = j.id AND le.account_id = ? AND le.debit > 0
                LEFT JOIN users u ON u.id = COALESCE(j.actor_user_id, j.created_by)
                LEFT JOIN pengurus pg ON pg.id = COALESCE(j.actor_user_id, j.created_by)
                LEFT JOIN users u_pg ON u_pg.id = pg.id_user
                WHERE j.type = 'WITHDRAWAL'
                ORDER BY j.created_at DESC, j.id DESC
                LIMIT $limit";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$walletId]);
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
            $metode = (string) ($meta['metode'] ?? 'tunai');
            $actorUserId = $row['actor_user_id'] ?? $row['created_by'] ?? ($meta['actor_user_id'] ?? null);
            $data[] = [
                'id' => (int) $row['id'],
                'journal_type' => (string) $row['type'],
                'channel' => (string) ($row['channel'] ?? 'counter'),
                'nominal' => (float) $row['nominal'],
                'metode' => $metode,
                'metode_label' => (string) ($meta['metode_label'] ?? (self::METODE_LABELS[$metode] ?? $metode)),
                'referensi' => $meta['referensi'] ?? null,
                'reference' => (string) ($row['reference'] ?? ''),
                'actor_user_id' => $actorUserId !== null ? (int) $actorUserId : null,
                'actor_username' => $row['actor_username'] ?? ($meta['actor_username'] ?? null),
                'created_at' => $row['created_at'] ?? null,
            ];
        }

        return ['success' => true, 'data' => $data];
    }

    /**
     * @param array<string, mixed> $extra
     * @return array<string, mixed>
     */
    private function buildMeta(string $metode, ?string $referensi, ?int $actorUserId, array $extra): array
    {
        $meta = array_merge([
            'metode' => $metode,
            'metode_label' => self::METODE_LABELS[$metode] ?? $metode,
            'channel' => 'counter',
            'kind' => 'withdraw',
        ], $extra);
        if ($actorUserId !== null && $actorUserId > 0) {
            $meta['actor_user_id'] = $actorUserId;
            $uname = $this->resolveActorUsername($actorUserId);
            if ($uname !== null) {
                $meta['actor_username'] = $uname;
            }
        }
        if ($referensi !== null && $referensi !== '') {
            $meta['referensi'] = $referensi;
        }
        return $meta;
    }

    private function resolveActorUsername(int $actorUserId): ?string
    {
        if ($actorUserId <= 0) {
            return null;
        }
        $stmt = $this->db->prepare('SELECT username FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$actorUserId]);
        $username = $stmt->fetchColumn();
        return is_string($username) && $username !== '' ? $username : null;
    }

    private function resolveKasAccountId(): ?int
    {
        $stmt = $this->db->prepare(
            "SELECT id FROM cashless___accounts WHERE code IN ('1000', '1000000000000001', ?) AND type = 'ASSET' ORDER BY id ASC LIMIT 1"
        );
        $stmt->execute([self::CODE_KAS]);
        $id = $stmt->fetchColumn();
        return $id ? (int) $id : null;
    }

    private function normalizeMetode(string $metode): string
    {
        $m = strtolower(trim($metode));
        $aliases = [
            'cash' => 'tunai',
            'tunai' => 'tunai',
            'tf' => 'transfer',
            'transfer' => 'transfer',
            'qris' => 'qris',
            'lainnya' => 'lainnya',
            'other' => 'lainnya',
        ];
        return $aliases[$m] ?? 'tunai';
    }
}
