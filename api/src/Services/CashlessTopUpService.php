<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\CashlessMoneyLimitsHelper;
use App\Helpers\CashlessUserAccountResolver;
use App\Helpers\SantriStatusHelper;

/**
 * Top-up / transfer masuk ke wallet santri (double-entry).
 *
 * - Uang masuk eksternal (counter/gateway): debit Kas, kredit wallet (type TOPUP, channel counter|gateway).
 * - Transfer antar wallet: debit wallet sumber, kredit wallet tujuan (type TRANSFER, channel wallet).
 */
class CashlessTopUpService
{
    private \PDO $db;

    private CashlessLedgerService $ledger;

    private CashlessUserAccountResolver $accountResolver;

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
        $this->accountResolver = new CashlessUserAccountResolver($db);
    }

    /**
     * Cari wallet santri by kode (7 digit) — untuk transfer P2P.
     *
     * @return array{success: bool, message?: string, data?: array{code: string, nama: string, santri_id: int, account_id: int}}
     */
    public function lookupSantriWalletByCode(string $code, ?int $excludeSantriId = null): array
    {
        $code = preg_replace('/\D+/', '', $code) ?? '';
        if (strlen($code) !== 7) {
            return ['success' => false, 'message' => 'No Wallet harus 7 digit'];
        }

        $stmt = $this->db->prepare(
            "SELECT a.id AS account_id, a.code, a.entity_id AS santri_id, s.nama
             FROM cashless___accounts a
             INNER JOIN santri s ON s.id = a.entity_id
             WHERE a.entity_type = 'SANTRI' AND a.type = 'LIABILITY' AND a.code = ?
             LIMIT 1"
        );
        $stmt->execute([$code]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            return ['success' => false, 'message' => 'No Wallet tidak ditemukan'];
        }

        $santriId = (int) $row['santri_id'];
        if ($excludeSantriId !== null && $excludeSantriId > 0 && $santriId === $excludeSantriId) {
            return ['success' => false, 'message' => 'Tidak bisa transfer ke wallet sendiri'];
        }

        return [
            'success' => true,
            'data' => [
                'code' => (string) $row['code'],
                'nama' => (string) ($row['nama'] ?? '—'),
                'santri_id' => $santriId,
                'account_id' => (int) $row['account_id'],
            ],
        ];
    }

    /**
     * Transfer antar wallet santri (sumber = fromSantriId, tujuan = No Wallet).
     *
     * @return array{success: bool, message?: string, data?: array}
     */
    public function transferByWalletCode(
        int $fromSantriId,
        string $destCode,
        float $nominal,
        ?string $catatan,
        ?int $actorUserId
    ): array {
        if ($fromSantriId <= 0) {
            return ['success' => false, 'message' => 'Santri pengirim tidak valid'];
        }
        $limits = CashlessMoneyLimitsHelper::getLimits($this->db);
        $chk = CashlessMoneyLimitsHelper::assertMaxPerTx(
            $nominal,
            $limits['transfer_max_per_tx'],
            'Transfer'
        );
        if (!($chk['ok'] ?? false)) {
            return ['success' => false, 'message' => $chk['message'] ?? 'Nominal tidak valid'];
        }

        $lookup = $this->lookupSantriWalletByCode($destCode, $fromSantriId);
        if (!($lookup['success'] ?? false)) {
            return $lookup;
        }
        $dest = $lookup['data'];
        $destSantriId = (int) $dest['santri_id'];

        if (SantriStatusHelper::isBoyong($this->db, $destSantriId)) {
            return ['success' => false, 'message' => 'Wallet tujuan tidak aktif (santri Boyong)'];
        }
        if (SantriStatusHelper::isBoyong($this->db, $fromSantriId)) {
            return ['success' => false, 'message' => 'Wallet Anda tidak aktif untuk transfer'];
        }

        $stmtSource = $this->db->prepare(
            "SELECT id, balance_cached FROM cashless___accounts
             WHERE entity_type = 'SANTRI' AND entity_id = ? AND type = 'LIABILITY'
             LIMIT 1"
        );
        $stmtSource->execute([$fromSantriId]);
        $sourceRow = $stmtSource->fetch(\PDO::FETCH_ASSOC);
        $sourceAccountId = (int) ($sourceRow['id'] ?? 0);
        if ($sourceAccountId <= 0) {
            return ['success' => false, 'message' => 'Anda belum punya akun wallet'];
        }

        $daily = CashlessMoneyLimitsHelper::assertTransferDaily(
            $this->db,
            $sourceAccountId,
            $nominal,
            $limits['transfer_daily_max']
        );
        if (!($daily['ok'] ?? false)) {
            return ['success' => false, 'message' => $daily['message'] ?? 'Limit transfer harian terlampaui'];
        }

        $stmtBal = $this->db->prepare('SELECT balance_cached FROM cashless___accounts WHERE id = ? LIMIT 1');
        $stmtBal->execute([(int) $dest['account_id']]);
        $destBal = (float) ($stmtBal->fetchColumn() ?: 0);
        $cap = CashlessMoneyLimitsHelper::assertWalletSaldoCap($destBal, $nominal, $limits['wallet_saldo_max']);
        if (!($cap['ok'] ?? false)) {
            return ['success' => false, 'message' => $cap['message'] ?? 'Saldo tujuan melebihi batas'];
        }

        $catatan = $catatan !== null ? trim($catatan) : null;
        if ($catatan === '') {
            $catatan = null;
        }
        if ($catatan !== null && mb_strlen($catatan) > 200) {
            return ['success' => false, 'message' => 'Catatan maksimal 200 karakter'];
        }

        return $this->topUp(
            $destSantriId,
            $nominal,
            $catatan,
            'transfer',
            $actorUserId,
            $sourceAccountId
        );
    }

    /**
     * @param int|null $sourceAccountId Akun wallet pengirim (opsional). Jika diisi → transfer P2P.
     * @return array{success: bool, message?: string, data?: array}
     */
    public function topUp(
        int $santriId,
        float $nominal,
        ?string $referensi,
        string $metode,
        ?int $actorUserId,
        ?int $sourceAccountId = null
    ): array {
        $metode = $this->normalizeMetode($metode);
        $limits = CashlessMoneyLimitsHelper::getLimits($this->db);
        $isWalletTransfer = $sourceAccountId !== null && $sourceAccountId > 0;
        $chk = CashlessMoneyLimitsHelper::assertMaxPerTx(
            $nominal,
            $isWalletTransfer ? $limits['transfer_max_per_tx'] : $limits['topup_max_per_tx'],
            $isWalletTransfer ? 'Transfer' : 'Top-up'
        );
        if (!($chk['ok'] ?? false)) {
            return ['success' => false, 'message' => $chk['message'] ?? 'Nominal tidak valid'];
        }

        $stmtSantri = $this->db->prepare('SELECT id, nama FROM santri WHERE id = ? LIMIT 1');
        $stmtSantri->execute([$santriId]);
        $santri = $stmtSantri->fetch(\PDO::FETCH_ASSOC);
        if (!$santri) {
            return ['success' => false, 'message' => 'Santri tidak ditemukan'];
        }

        if (!$isWalletTransfer && SantriStatusHelper::isBoyong($this->db, $santriId)) {
            return ['success' => false, 'message' => 'Tidak bisa top-up: santri berstatus Boyong'];
        }

        $stmtAcc = $this->db->prepare(
            "SELECT id, code, name, balance_cached FROM cashless___accounts
             WHERE entity_type = 'SANTRI' AND entity_id = ? LIMIT 1"
        );
        $stmtAcc->execute([$santriId]);
        $wallet = $stmtAcc->fetch(\PDO::FETCH_ASSOC);
        if (!$wallet) {
            return ['success' => false, 'message' => 'Santri belum punya akun wallet'];
        }

        $cap = CashlessMoneyLimitsHelper::assertWalletSaldoCap(
            (float) ($wallet['balance_cached'] ?? 0),
            $nominal,
            $limits['wallet_saldo_max']
        );
        if (!($cap['ok'] ?? false)) {
            return ['success' => false, 'message' => $cap['message'] ?? 'Saldo melebihi batas'];
        }

        if ($isWalletTransfer) {
            $daily = CashlessMoneyLimitsHelper::assertTransferDaily(
                $this->db,
                (int) $sourceAccountId,
                $nominal,
                $limits['transfer_daily_max']
            );
            if (!($daily['ok'] ?? false)) {
                return ['success' => false, 'message' => $daily['message'] ?? 'Limit transfer harian terlampaui'];
            }

            return $this->transferFromWallet(
                $santriId,
                $santri,
                $wallet,
                $nominal,
                $referensi,
                $metode,
                $actorUserId,
                $sourceAccountId
            );
        }

        return $this->externalTopUp($santriId, $santri, $wallet, $nominal, $referensi, $metode, $actorUserId);
    }

    /**
     * Top-up wallet toko/pedagang (counter) — debit Kas, kredit wallet.
     *
     * @return array{success: bool, message?: string, data?: array}
     */
    public function topUpPedagang(
        int $pedagangId,
        float $nominal,
        ?string $referensi,
        string $metode,
        ?int $actorUserId
    ): array {
        $metode = $this->normalizeMetode($metode);
        $limits = CashlessMoneyLimitsHelper::getLimits($this->db);
        $chk = CashlessMoneyLimitsHelper::assertMaxPerTx($nominal, $limits['topup_max_per_tx'], 'Top-up');
        if (!($chk['ok'] ?? false)) {
            return ['success' => false, 'message' => $chk['message'] ?? 'Nominal tidak valid'];
        }

        $stmt = $this->db->prepare('SELECT id, nama_toko, kode_toko FROM cashless___pedagang WHERE id = ? LIMIT 1');
        $stmt->execute([$pedagangId]);
        $toko = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$toko) {
            return ['success' => false, 'message' => 'Toko tidak ditemukan'];
        }

        $stmtAcc = $this->db->prepare(
            "SELECT id, code, name, balance_cached FROM cashless___accounts
             WHERE entity_type = 'PEDAGANG' AND entity_id = ? LIMIT 1"
        );
        $stmtAcc->execute([$pedagangId]);
        $wallet = $stmtAcc->fetch(\PDO::FETCH_ASSOC);
        if (!$wallet) {
            return ['success' => false, 'message' => 'Toko belum punya akun wallet'];
        }

        $cap = CashlessMoneyLimitsHelper::assertWalletSaldoCap(
            (float) ($wallet['balance_cached'] ?? 0),
            $nominal,
            $limits['wallet_saldo_max']
        );
        if (!($cap['ok'] ?? false)) {
            return ['success' => false, 'message' => $cap['message'] ?? 'Saldo melebihi batas'];
        }

        $label = trim((string) ($toko['nama_toko'] ?? ''));
        if ($label === '') {
            $label = 'Toko #' . $pedagangId;
        }

        $kasId = $this->resolveKasAccountId();
        if ($kasId === null) {
            return ['success' => false, 'message' => 'Akun kas cashless belum dikonfigurasi'];
        }

        $walletId = (int) $wallet['id'];
        $nominal = round($nominal, 2);
        $meta = [
            'pedagang_id' => $pedagangId,
            'kode_toko' => $toko['kode_toko'] ?? null,
            'metode' => $metode,
            'metode_label' => self::METODE_LABELS[$metode] ?? $metode,
            'channel' => 'counter',
        ];
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

        $description = 'Top-up wallet ' . $label;
        $reference = 'TOPUP-TOKO-' . $pedagangId . '-' . date('YmdHis');

        try {
            $this->db->beginTransaction();

            $posted = $this->ledger->postJournal(
                'TOPUP',
                $reference,
                $description,
                [
                    ['account_id' => $kasId, 'debit' => $nominal, 'credit' => 0.0],
                    ['account_id' => $walletId, 'debit' => 0.0, 'credit' => $nominal],
                ],
                $actorUserId,
                null,
                $walletId,
                'counter',
                $meta
            );

            if (!($posted['success'] ?? false)) {
                $this->db->rollBack();
                return ['success' => false, 'message' => $posted['message'] ?? 'Gagal posting jurnal'];
            }

            $this->db->commit();

            return [
                'success' => true,
                'message' => 'Top-up berhasil',
                'data' => [
                    'journal_id' => (int) ($posted['journal_id'] ?? 0),
                    'journal_type' => 'TOPUP',
                    'channel' => 'counter',
                    'pedagang_id' => $pedagangId,
                    'account_id' => $walletId,
                    'actor_user_id' => $actorUserId,
                    'nominal' => $nominal,
                    'metode' => $metode,
                    'metode_label' => self::METODE_LABELS[$metode] ?? $metode,
                    'balance_cached' => (float) $wallet['balance_cached'] + $nominal,
                    'reference' => $reference,
                ],
            ];
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('CashlessTopUpService::topUpPedagang ' . $e->getMessage());
            return ['success' => false, 'message' => 'Gagal melakukan top-up'];
        }
    }

    /**
     * Top-up setelah pembayaran gateway (iPayMu) berhasil — idempoten per payment.id.
     *
     * @return array{success: bool, message?: string, data?: array, skipped?: bool}
     */
    public function topUpViaGateway(
        int $santriId,
        float $nominal,
        int $actorUserId,
        int $paymentId,
        ?string $viaLabel = null
    ): array {
        if ($paymentId <= 0) {
            return ['success' => false, 'message' => 'payment_id tidak valid'];
        }
        if ($nominal <= 0) {
            return ['success' => false, 'message' => 'Nominal harus lebih dari 0'];
        }

        $reference = 'TOPUP-GW-' . $paymentId;
        $chk = $this->db->prepare('SELECT id FROM cashless___journal WHERE reference = ? LIMIT 1');
        $chk->execute([$reference]);
        $existingId = (int) ($chk->fetchColumn() ?: 0);
        if ($existingId > 0) {
            return [
                'success' => true,
                'skipped' => true,
                'message' => 'Top-up gateway sudah diproses',
                'data' => ['journal_id' => $existingId, 'reference' => $reference],
            ];
        }

        $stmtSantri = $this->db->prepare('SELECT id, nama FROM santri WHERE id = ? LIMIT 1');
        $stmtSantri->execute([$santriId]);
        $santri = $stmtSantri->fetch(\PDO::FETCH_ASSOC);
        if (!$santri) {
            return ['success' => false, 'message' => 'Santri tidak ditemukan'];
        }

        $stmtAcc = $this->db->prepare(
            "SELECT id, balance_cached FROM cashless___accounts WHERE entity_type = 'SANTRI' AND entity_id = ? LIMIT 1"
        );
        $stmtAcc->execute([$santriId]);
        $wallet = $stmtAcc->fetch(\PDO::FETCH_ASSOC);
        if (!$wallet) {
            return ['success' => false, 'message' => 'Santri belum punya akun wallet'];
        }

        $limits = CashlessMoneyLimitsHelper::getLimits($this->db);
        $chk = CashlessMoneyLimitsHelper::assertMaxPerTx($nominal, $limits['topup_max_per_tx'], 'Top-up');
        if (!($chk['ok'] ?? false)) {
            return ['success' => false, 'message' => $chk['message'] ?? 'Nominal tidak valid'];
        }
        $cap = CashlessMoneyLimitsHelper::assertWalletSaldoCap(
            (float) ($wallet['balance_cached'] ?? 0),
            $nominal,
            $limits['wallet_saldo_max']
        );
        if (!($cap['ok'] ?? false)) {
            return ['success' => false, 'message' => $cap['message'] ?? 'Saldo melebihi batas'];
        }

        $metode = 'gateway';
        $extra = [
            'gateway_payment_id' => $paymentId,
            'metode_label' => $viaLabel ?: 'iPayMu',
        ];
        if ($viaLabel) {
            $extra['via'] = $viaLabel;
        }

        return $this->externalTopUp(
            $santriId,
            $santri,
            $wallet,
            $nominal,
            'Pembayaran gateway #' . $paymentId,
            $metode,
            $actorUserId > 0 ? $actorUserId : null,
            'gateway',
            $extra,
            $reference
        );
    }

    /**
     * Top-up wallet toko setelah pembayaran gateway (iPayMu) — idempoten per payment.id.
     *
     * @return array{success: bool, message?: string, data?: array, skipped?: bool}
     */
    public function topUpPedagangViaGateway(
        int $pedagangId,
        float $nominal,
        int $actorUserId,
        int $paymentId,
        ?string $viaLabel = null
    ): array {
        if ($paymentId <= 0) {
            return ['success' => false, 'message' => 'payment_id tidak valid'];
        }
        if ($nominal <= 0) {
            return ['success' => false, 'message' => 'Nominal harus lebih dari 0'];
        }

        $reference = 'TOPUP-GW-' . $paymentId;
        $chk = $this->db->prepare('SELECT id FROM cashless___journal WHERE reference = ? LIMIT 1');
        $chk->execute([$reference]);
        $existingId = (int) ($chk->fetchColumn() ?: 0);
        if ($existingId > 0) {
            return [
                'success' => true,
                'skipped' => true,
                'message' => 'Top-up gateway sudah diproses',
                'data' => ['journal_id' => $existingId, 'reference' => $reference],
            ];
        }

        $stmt = $this->db->prepare('SELECT id, nama_toko, kode_toko FROM cashless___pedagang WHERE id = ? LIMIT 1');
        $stmt->execute([$pedagangId]);
        $toko = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$toko) {
            return ['success' => false, 'message' => 'Toko tidak ditemukan'];
        }

        $stmtAcc = $this->db->prepare(
            "SELECT id, code, name, balance_cached FROM cashless___accounts
             WHERE entity_type = 'PEDAGANG' AND entity_id = ? LIMIT 1"
        );
        $stmtAcc->execute([$pedagangId]);
        $wallet = $stmtAcc->fetch(\PDO::FETCH_ASSOC);
        if (!$wallet) {
            return ['success' => false, 'message' => 'Toko belum punya akun wallet'];
        }

        $limits = CashlessMoneyLimitsHelper::getLimits($this->db);
        $chkMax = CashlessMoneyLimitsHelper::assertMaxPerTx($nominal, $limits['topup_max_per_tx'], 'Top-up');
        if (!($chkMax['ok'] ?? false)) {
            return ['success' => false, 'message' => $chkMax['message'] ?? 'Nominal tidak valid'];
        }
        $cap = CashlessMoneyLimitsHelper::assertWalletSaldoCap(
            (float) ($wallet['balance_cached'] ?? 0),
            $nominal,
            $limits['wallet_saldo_max']
        );
        if (!($cap['ok'] ?? false)) {
            return ['success' => false, 'message' => $cap['message'] ?? 'Saldo melebihi batas'];
        }

        $kasId = $this->resolveKasAccountId();
        if ($kasId === null) {
            return ['success' => false, 'message' => 'Akun kas cashless belum dikonfigurasi'];
        }

        $walletId = (int) $wallet['id'];
        $nominal = round($nominal, 2);
        $label = trim((string) ($toko['nama_toko'] ?? ''));
        if ($label === '') {
            $label = 'Toko #' . $pedagangId;
        }

        $meta = [
            'pedagang_id' => $pedagangId,
            'kode_toko' => $toko['kode_toko'] ?? null,
            'metode' => 'gateway',
            'metode_label' => $viaLabel ?: 'iPayMu',
            'channel' => 'gateway',
            'gateway_payment_id' => $paymentId,
        ];
        if ($viaLabel) {
            $meta['via'] = $viaLabel;
        }
        if ($actorUserId > 0) {
            $meta['actor_user_id'] = $actorUserId;
            $uname = $this->resolveActorUsername($actorUserId);
            if ($uname !== null) {
                $meta['actor_username'] = $uname;
            }
        }

        $description = 'Top-up gateway ' . $label;

        try {
            $this->db->beginTransaction();

            $posted = $this->ledger->postJournal(
                'TOPUP',
                $reference,
                $description,
                [
                    ['account_id' => $kasId, 'debit' => $nominal, 'credit' => 0.0],
                    ['account_id' => $walletId, 'debit' => 0.0, 'credit' => $nominal],
                ],
                $actorUserId > 0 ? $actorUserId : null,
                null,
                $walletId,
                'gateway',
                $meta
            );

            if (!($posted['success'] ?? false)) {
                $this->db->rollBack();
                return ['success' => false, 'message' => $posted['message'] ?? 'Gagal posting jurnal'];
            }

            $this->db->commit();

            return [
                'success' => true,
                'message' => 'Top-up berhasil',
                'data' => [
                    'journal_id' => (int) ($posted['journal_id'] ?? 0),
                    'journal_type' => 'TOPUP',
                    'channel' => 'gateway',
                    'pedagang_id' => $pedagangId,
                    'account_id' => $walletId,
                    'actor_user_id' => $actorUserId > 0 ? $actorUserId : null,
                    'nominal' => $nominal,
                    'metode' => 'gateway',
                    'metode_label' => $viaLabel ?: 'iPayMu',
                    'balance_cached' => (float) $wallet['balance_cached'] + $nominal,
                    'reference' => $reference,
                ],
            ];
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('CashlessTopUpService::topUpPedagangViaGateway ' . $e->getMessage());
            return ['success' => false, 'message' => 'Gagal melakukan top-up'];
        }
    }

    /**
     * @return array{success: bool, message?: string, data?: array}
     */
    private function externalTopUp(
        int $santriId,
        array $santri,
        array $wallet,
        float $nominal,
        ?string $referensi,
        string $metode,
        ?int $actorUserId,
        string $channel = 'counter',
        ?array $metaExtra = null,
        ?string $referenceOverride = null
    ): array {
        $kasId = $this->resolveKasAccountId();
        if ($kasId === null) {
            return ['success' => false, 'message' => 'Akun kas cashless belum dikonfigurasi'];
        }

        $walletId = (int) $wallet['id'];
        $meta = $this->buildMeta($santriId, $metode, $referensi, $actorUserId, $metaExtra, $channel);
        $description = ($channel === 'gateway' ? 'Top-up gateway ' : 'Top-up wallet ')
            . ($santri['nama'] ?? 'Santri #' . $santriId);
        $reference = $referenceOverride ?? ('TOPUP-' . $santriId . '-' . date('YmdHis'));

        try {
            $this->db->beginTransaction();

            $posted = $this->ledger->postJournal(
                'TOPUP',
                $reference,
                $description,
                [
                    ['account_id' => $kasId, 'debit' => $nominal, 'credit' => 0.0],
                    ['account_id' => $walletId, 'debit' => 0.0, 'credit' => $nominal],
                ],
                $actorUserId,
                null,
                $walletId,
                $channel,
                $meta
            );

            if (!($posted['success'] ?? false)) {
                $this->db->rollBack();
                return ['success' => false, 'message' => $posted['message'] ?? 'Gagal posting jurnal'];
            }

            $this->db->commit();

            $newBalance = (float) $wallet['balance_cached'] + $nominal;

            return [
                'success' => true,
                'message' => 'Top-up berhasil',
                'data' => [
                    'journal_id' => (int) ($posted['journal_id'] ?? 0),
                    'journal_type' => 'TOPUP',
                    'channel' => $channel,
                    'santri_id' => $santriId,
                    'account_id' => $walletId,
                    'actor_user_id' => $actorUserId,
                    'nominal' => $nominal,
                    'metode' => $metode,
                    'metode_label' => self::METODE_LABELS[$metode] ?? $metode,
                    'balance_cached' => $newBalance,
                    'reference' => $reference,
                ],
            ];
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('CashlessTopUpService::externalTopUp ' . $e->getMessage());
            return ['success' => false, 'message' => 'Gagal melakukan top-up'];
        }
    }

    /**
     * @return array{success: bool, message?: string, data?: array}
     */
    private function transferFromWallet(
        int $santriId,
        array $santri,
        array $destWallet,
        float $nominal,
        ?string $referensi,
        string $metode,
        ?int $actorUserId,
        int $sourceAccountId
    ): array {
        $destWalletId = (int) $destWallet['id'];
        if ($sourceAccountId === $destWalletId) {
            return ['success' => false, 'message' => 'Akun sumber dan tujuan tidak boleh sama'];
        }

        $source = $this->ledger->getAccountById($sourceAccountId);
        if ($source === null) {
            return ['success' => false, 'message' => 'Akun sumber tidak ditemukan'];
        }

        $stmtSource = $this->db->prepare(
            'SELECT id, type, entity_type, entity_id, balance_cached, name, code FROM cashless___accounts WHERE id = ? LIMIT 1'
        );
        $stmtSource->execute([$sourceAccountId]);
        $sourceRow = $stmtSource->fetch(\PDO::FETCH_ASSOC);
        if (!$sourceRow || ($sourceRow['type'] ?? '') !== 'LIABILITY') {
            return ['success' => false, 'message' => 'Akun sumber harus wallet (LIABILITY)'];
        }

        if ((float) $sourceRow['balance_cached'] < $nominal) {
            return ['success' => false, 'message' => 'Saldo akun sumber tidak mencukupi'];
        }

        if ($actorUserId !== null && $actorUserId > 0) {
            $actorWallet = $this->accountResolver->resolveWalletByUserId($actorUserId);
            // Jika user punya wallet tertaut, wajib sama dengan sumber. Jika belum tertaut, biarkan (sumber sudah diverifikasi pemanggil).
            if ($actorWallet !== null && (int) $actorWallet['id'] !== $sourceAccountId) {
                return ['success' => false, 'message' => 'Akun sumber harus milik pengguna yang login'];
            }
        }

        $meta = $this->buildMeta(
            $santriId,
            $metode,
            $referensi,
            $actorUserId,
            [
                'source_account_id' => $sourceAccountId,
                'source_entity_type' => $sourceRow['entity_type'] ?? null,
                'source_entity_id' => isset($sourceRow['entity_id']) ? (int) $sourceRow['entity_id'] : null,
                'source_name' => $sourceRow['name'] ?? null,
                'source_code' => $sourceRow['code'] ?? null,
                'dest_code' => $destWallet['code'] ?? null,
                'dest_nama' => $santri['nama'] ?? null,
            ],
            'wallet'
        );

        $description = 'Transfer ke wallet ' . ($santri['nama'] ?? 'Santri #' . $santriId)
            . ' dari ' . ($sourceRow['name'] ?? 'wallet #' . $sourceAccountId);
        $reference = 'XFER-' . $sourceAccountId . '-' . $santriId . '-' . date('YmdHis');

        try {
            $this->db->beginTransaction();

            $posted = $this->ledger->postJournal(
                'TRANSFER',
                $reference,
                $description,
                [
                    ['account_id' => $sourceAccountId, 'debit' => $nominal, 'credit' => 0.0],
                    ['account_id' => $destWalletId, 'debit' => 0.0, 'credit' => $nominal],
                ],
                $actorUserId,
                $sourceAccountId,
                $destWalletId,
                'wallet',
                $meta
            );

            if (!($posted['success'] ?? false)) {
                $this->db->rollBack();
                return ['success' => false, 'message' => $posted['message'] ?? 'Gagal posting transfer'];
            }

            $this->db->commit();

            return [
                'success' => true,
                'message' => 'Transfer berhasil',
                'data' => [
                    'journal_id' => (int) ($posted['journal_id'] ?? 0),
                    'journal_type' => 'TRANSFER',
                    'channel' => 'wallet',
                    'santri_id' => $santriId,
                    'account_id' => $destWalletId,
                    'source_account_id' => $sourceAccountId,
                    'actor_user_id' => $actorUserId,
                    'nominal' => $nominal,
                    'metode' => $metode,
                    'metode_label' => self::METODE_LABELS[$metode] ?? $metode,
                    'balance_cached' => (float) $destWallet['balance_cached'] + $nominal,
                    'reference' => $reference,
                ],
            ];
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('CashlessTopUpService::transferFromWallet ' . $e->getMessage());
            return ['success' => false, 'message' => 'Gagal melakukan transfer'];
        }
    }

    /**
     * @return array{success: bool, message?: string, data?: list<array>}
     */
    public function listHistory(int $santriId, int $limit = 50): array
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
    private function listHistoryByEntity(string $entityType, int $entityId, int $limit = 50): array
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
                       le.credit AS nominal,
                       COALESCE(u.username, u_pg.username) AS actor_username,
                       src.name AS source_account_name
                FROM cashless___journal j
                INNER JOIN cashless___ledger_entries le ON le.journal_id = j.id AND le.account_id = ? AND le.credit > 0
                LEFT JOIN users u ON u.id = COALESCE(j.actor_user_id, j.created_by)
                LEFT JOIN pengurus pg ON pg.id = COALESCE(j.actor_user_id, j.created_by)
                LEFT JOIN users u_pg ON u_pg.id = pg.id_user
                LEFT JOIN cashless___accounts src ON src.id = j.source_account_id
                WHERE j.type IN ('TOPUP', 'TRANSFER')
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
            $actorUsername = $row['actor_username'] ?? ($meta['actor_username'] ?? null);
            $channel = (string) ($row['channel'] ?? ($meta['channel'] ?? 'counter'));
            $journalType = (string) ($row['type'] ?? 'TOPUP');

            $data[] = [
                'id' => (int) $row['id'],
                'journal_type' => $journalType,
                'channel' => $channel,
                'nominal' => (float) ($row['nominal'] ?? 0),
                'metode' => $metode,
                'metode_label' => $this->resolveHistoryLabel($journalType, $channel, $metode, $meta),
                'referensi' => $meta['referensi'] ?? null,
                'description' => $row['description'] ?? null,
                'reference' => $row['reference'] ?? null,
                'created_at' => $row['created_at'] ?? null,
                'actor_user_id' => $actorUserId !== null && $actorUserId !== '' ? (int) $actorUserId : null,
                'actor_username' => is_string($actorUsername) && $actorUsername !== '' ? $actorUsername : null,
                'source_account_id' => isset($row['source_account_id']) ? (int) $row['source_account_id'] : null,
                'source_account_name' => $row['source_account_name'] ?? ($meta['source_name'] ?? null),
            ];
        }

        return ['success' => true, 'data' => $data];
    }

    /**
     * @param array<string, mixed> $extra
     * @return array<string, mixed>
     */
    private function buildMeta(
        int $santriId,
        string $metode,
        ?string $referensi,
        ?int $actorUserId,
        ?array $extra,
        string $channel
    ): array {
        $meta = [
            'santri_id' => $santriId,
            'metode' => $metode,
            'metode_label' => self::METODE_LABELS[$metode] ?? $metode,
            'channel' => $channel,
        ];
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
        if ($extra !== null) {
            $meta = array_merge($meta, $extra);
        }
        return $meta;
    }

    /**
     * @param array<string, mixed> $meta
     */
    private function resolveHistoryLabel(string $journalType, string $channel, string $metode, array $meta): string
    {
        if ($journalType === 'TRANSFER' || $channel === 'wallet') {
            return 'Transfer';
        }
        if ($channel === 'gateway') {
            return 'Gateway';
        }
        return (string) ($meta['metode_label'] ?? (self::METODE_LABELS[$metode] ?? $metode));
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
