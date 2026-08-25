<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\CashlessCardTokenHelper;

/**
 * Checkout kasir toko: potong wallet santri (kartu CS) → kredit wallet pedagang,
 * snapshot item + mutasi stok terjual.
 */
class CashlessPurchaseService
{
    /** Default jika config `batas_pin_belanja` belum ada. */
    public const PIN_THRESHOLD = 10000.0;

    public const CONFIG_PIN_THRESHOLD_KEY = 'batas_pin_belanja';

    public const PIN_LENGTH = 6;

    private \PDO $db;

    private CashlessLedgerService $ledger;

    private CashlessKartuService $kartuSvc;

    public function __construct(\PDO $db)
    {
        $this->db = $db;
        $this->ledger = new CashlessLedgerService($db);
        $this->kartuSvc = new CashlessKartuService($db);
    }

    /**
     * @param list<array{barang_id: int, qty: int}> $items
     * @return array{success: bool, message?: string, code?: string, data?: array}
     */
    public function checkout(
        int $pedagangId,
        string $cardToken,
        array $items,
        ?string $pin,
        ?int $actorUserId
    ): array {
        if ($pedagangId <= 0) {
            return ['success' => false, 'message' => 'Toko tidak valid'];
        }

        $card = $this->kartuSvc->resolveActiveToken($cardToken, CashlessCardTokenHelper::TYPE_SANTRI);
        if ($card === null) {
            return [
                'success' => false,
                'code' => 'invalid_card',
                'message' => 'Kartu tidak valid, belum aktif, atau mode pemeliharaan aktif',
            ];
        }

        $santriId = (int) $card['santri_id'];
        $santriAccountId = (int) ($card['account_id'] ?? 0);
        $kartuId = (int) $card['kartu_id'];
        if ($santriAccountId <= 0) {
            return ['success' => false, 'message' => 'Kartu tidak terhubung ke wallet santri'];
        }

        $normalized = $this->normalizeItems($items);
        if ($normalized === []) {
            return ['success' => false, 'message' => 'Keranjang kosong'];
        }

        $lines = $this->loadAndPriceLines($pedagangId, $normalized);
        if (!$lines['success']) {
            return $lines;
        }
        /** @var list<array{barang_id: int, kode_barang: string, nama_barang: string, harga_satuan: float, qty: int, subtotal: float, stok: int}> $priced */
        $priced = $lines['data'];
        $total = 0.0;
        foreach ($priced as $line) {
            $total += $line['subtotal'];
        }
        $total = round($total, 2);
        if ($total <= 0) {
            return ['success' => false, 'message' => 'Total belanja tidak valid'];
        }

        $pinCheck = $this->verifyPinIfRequired($kartuId, $total, $pin);
        if (!$pinCheck['success']) {
            return $pinCheck;
        }

        $batas = $this->checkDailyLimit($santriId, $total);
        if (!$batas['success']) {
            return $batas;
        }

        $stmtPedAcc = $this->db->prepare(
            "SELECT id, balance_cached FROM cashless___accounts
             WHERE entity_type = 'PEDAGANG' AND entity_id = ? LIMIT 1"
        );
        $stmtPedAcc->execute([$pedagangId]);
        $pedAcc = $stmtPedAcc->fetch(\PDO::FETCH_ASSOC);
        if (!$pedAcc) {
            return ['success' => false, 'message' => 'Toko belum punya akun wallet cashless'];
        }
        $pedagangAccountId = (int) $pedAcc['id'];

        $stmtSanAcc = $this->db->prepare(
            'SELECT id, balance_cached FROM cashless___accounts WHERE id = ? LIMIT 1 FOR UPDATE'
        );

        $tokoNama = $this->resolveTokoNama($pedagangId);
        $santriNama = (string) ($card['santri_nama'] ?? '');

        try {
            $this->db->beginTransaction();

            $stmtSanAcc->execute([$santriAccountId]);
            $sanAcc = $stmtSanAcc->fetch(\PDO::FETCH_ASSOC);
            if (!$sanAcc) {
                $this->db->rollBack();
                return ['success' => false, 'message' => 'Wallet santri tidak ditemukan'];
            }
            $saldo = (float) $sanAcc['balance_cached'];
            if ($saldo + 0.001 < $total) {
                $this->db->rollBack();
                return [
                    'success' => false,
                    'code' => 'insufficient_balance',
                    'message' => 'Saldo tidak cukup (tersedia Rp ' . number_format($saldo, 0, ',', '.') . ')',
                ];
            }

            // Lock & re-check stok
            foreach ($priced as &$line) {
                $lock = $this->db->prepare(
                    'SELECT id, stok, harga, kode_barang, nama_barang, aktif FROM cashless___barang
                     WHERE id = ? AND pedagang_id = ? FOR UPDATE'
                );
                $lock->execute([$line['barang_id'], $pedagangId]);
                $row = $lock->fetch(\PDO::FETCH_ASSOC);
                if (!$row || !(int) $row['aktif']) {
                    $this->db->rollBack();
                    return ['success' => false, 'message' => 'Barang tidak tersedia: ' . $line['nama_barang']];
                }
                $stok = (int) $row['stok'];
                if ($stok < $line['qty']) {
                    $this->db->rollBack();
                    return [
                        'success' => false,
                        'code' => 'insufficient_stock',
                        'message' => 'Stok tidak cukup untuk ' . $row['nama_barang'] . ' (tersedia ' . $stok . ')',
                    ];
                }
                $harga = round((float) $row['harga'], 2);
                $line['harga_satuan'] = $harga;
                $line['kode_barang'] = (string) ($row['kode_barang'] ?? '');
                $line['nama_barang'] = (string) $row['nama_barang'];
                $line['subtotal'] = round($harga * $line['qty'], 2);
                $line['stok'] = $stok;
            }
            unset($line);

            $total = 0.0;
            foreach ($priced as $line) {
                $total += $line['subtotal'];
            }
            $total = round($total, 2);

            if ($saldo + 0.001 < $total) {
                $this->db->rollBack();
                return [
                    'success' => false,
                    'code' => 'insufficient_balance',
                    'message' => 'Saldo tidak cukup',
                ];
            }

            $pinCheckLocked = $this->verifyPinIfRequired($kartuId, $total, $pin);
            if (!$pinCheckLocked['success']) {
                $this->db->rollBack();
                return $pinCheckLocked;
            }

            $batasLocked = $this->checkDailyLimit($santriId, $total);
            if (!$batasLocked['success']) {
                $this->db->rollBack();
                return $batasLocked;
            }

            $reference = 'PURCHASE-' . $pedagangId . '-' . $santriId . '-' . date('YmdHis') . '-' . bin2hex(random_bytes(2));
            $description = 'Belanja di ' . $tokoNama . ' — ' . $santriNama;
            $meta = [
                'pedagang_id' => $pedagangId,
                'santri_id' => $santriId,
                'kartu_id' => $kartuId,
                'pin_required' => $this->totalRequiresPin($total),
            ];

            $posted = $this->ledger->postJournal(
                'PURCHASE',
                $reference,
                $description,
                [
                    ['account_id' => $santriAccountId, 'debit' => $total, 'credit' => 0.0],
                    ['account_id' => $pedagangAccountId, 'debit' => 0.0, 'credit' => $total],
                ],
                $actorUserId,
                $santriAccountId,
                $pedagangAccountId,
                'kasir',
                $meta
            );
            if (!($posted['success'] ?? false) || empty($posted['journal_id'])) {
                $this->db->rollBack();
                return ['success' => false, 'message' => $posted['message'] ?? 'Gagal posting jurnal'];
            }
            $journalId = (int) $posted['journal_id'];

            $insDetail = $this->db->prepare(
                'INSERT INTO cashless___transaksi_detail
                    (journal_id, santri_id, pedagang_id, nominal, keterangan)
                 VALUES (?, ?, ?, ?, ?)'
            );
            $insDetail->execute([
                $journalId,
                $santriId,
                $pedagangId,
                $total,
                'Belanja ' . count($priced) . ' item',
            ]);
            $transaksiDetailId = (int) $this->db->lastInsertId();

            $insItem = $this->db->prepare(
                'INSERT INTO cashless___penjualan_item
                    (transaksi_detail_id, barang_id, kode_barang, nama_barang, harga_satuan, qty, subtotal)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            $updStok = $this->db->prepare(
                'UPDATE cashless___barang SET stok = ? WHERE id = ? AND pedagang_id = ?'
            );
            $insStok = $this->db->prepare(
                'INSERT INTO cashless___barang_stok
                    (barang_id, pedagang_id, jumlah, stok_setelah, jenis, keterangan, referensi_tipe, referensi_id, users_id)
                 VALUES (?, ?, ?, ?, \'terjual\', ?, \'penjualan_item\', ?, ?)'
            );

            $itemOut = [];
            foreach ($priced as $line) {
                $insItem->execute([
                    $transaksiDetailId,
                    $line['barang_id'],
                    $line['kode_barang'],
                    $line['nama_barang'],
                    $line['harga_satuan'],
                    $line['qty'],
                    $line['subtotal'],
                ]);
                $itemId = (int) $this->db->lastInsertId();
                $stokSetelah = $line['stok'] - $line['qty'];
                $updStok->execute([$stokSetelah, $line['barang_id'], $pedagangId]);
                $insStok->execute([
                    $line['barang_id'],
                    $pedagangId,
                    -$line['qty'],
                    $stokSetelah,
                    'Terjual #' . $transaksiDetailId,
                    $itemId,
                    $actorUserId,
                ]);
                $itemOut[] = [
                    'id' => $itemId,
                    'barang_id' => $line['barang_id'],
                    'kode_barang' => $line['kode_barang'],
                    'nama_barang' => $line['nama_barang'],
                    'harga_satuan' => $line['harga_satuan'],
                    'qty' => $line['qty'],
                    'subtotal' => $line['subtotal'],
                ];
            }

            $this->db->commit();

            $saldoBaru = $saldo - $total;
            return [
                'success' => true,
                'message' => 'Pembayaran berhasil',
                'data' => [
                    'transaksi_detail_id' => $transaksiDetailId,
                    'journal_id' => $journalId,
                    'reference' => $reference,
                    'nominal' => $total,
                    'santri_id' => $santriId,
                    'santri_nama' => $santriNama,
                    'santri_nis' => $card['santri_nis'] ?? null,
                    'saldo_sebelum' => $saldo,
                    'saldo_sesudah' => $saldoBaru,
                    'toko' => $tokoNama,
                    'items' => $itemOut,
                    'pin_used' => $this->totalRequiresPin($total),
                ],
            ];
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('CashlessPurchaseService::checkout ' . $e->getMessage());
            return ['success' => false, 'message' => 'Gagal memproses penjualan'];
        }
    }

    /**
     * @param list<array{barang_id?: mixed, qty?: mixed}> $items
     * @return list<array{barang_id: int, qty: int}>
     */
    private function normalizeItems(array $items): array
    {
        $map = [];
        foreach ($items as $row) {
            if (!is_array($row)) {
                continue;
            }
            $id = (int) ($row['barang_id'] ?? 0);
            $qty = (int) ($row['qty'] ?? 0);
            if ($id <= 0 || $qty <= 0) {
                continue;
            }
            $map[$id] = ($map[$id] ?? 0) + $qty;
        }
        $out = [];
        foreach ($map as $id => $qty) {
            $out[] = ['barang_id' => (int) $id, 'qty' => (int) $qty];
        }
        return $out;
    }

    /**
     * @param list<array{barang_id: int, qty: int}> $items
     * @return array{success: bool, message?: string, data?: list}
     */
    private function loadAndPriceLines(int $pedagangId, array $items): array
    {
        $ids = array_column($items, 'barang_id');
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $this->db->prepare(
            "SELECT id, kode_barang, nama_barang, harga, stok, aktif
             FROM cashless___barang
             WHERE pedagang_id = ? AND id IN ($placeholders)"
        );
        $stmt->execute(array_merge([$pedagangId], $ids));
        $byId = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [] as $row) {
            $byId[(int) $row['id']] = $row;
        }

        $priced = [];
        foreach ($items as $item) {
            $row = $byId[$item['barang_id']] ?? null;
            if ($row === null) {
                return ['success' => false, 'message' => 'Barang tidak ditemukan di toko ini'];
            }
            if (!(int) $row['aktif']) {
                return ['success' => false, 'message' => 'Barang nonaktif: ' . $row['nama_barang']];
            }
            $harga = round((float) $row['harga'], 2);
            $qty = $item['qty'];
            $stok = (int) $row['stok'];
            if ($stok < $qty) {
                return [
                    'success' => false,
                    'code' => 'insufficient_stock',
                    'message' => 'Stok tidak cukup untuk ' . $row['nama_barang'] . ' (tersedia ' . $stok . ')',
                ];
            }
            $priced[] = [
                'barang_id' => (int) $row['id'],
                'kode_barang' => (string) ($row['kode_barang'] ?? ''),
                'nama_barang' => (string) $row['nama_barang'],
                'harga_satuan' => $harga,
                'qty' => $qty,
                'subtotal' => round($harga * $qty, 2),
                'stok' => $stok,
            ];
        }
        return ['success' => true, 'data' => $priced];
    }

    /**
     * Ambang belanja wajib PIN (Rp). 0 = setiap belanja wajib PIN.
     */
    public static function getPinThreshold(\PDO $db): float
    {
        try {
            $stmt = $db->prepare(
                'SELECT nilai FROM cashless___config WHERE kunci = ? LIMIT 1'
            );
            $stmt->execute([self::CONFIG_PIN_THRESHOLD_KEY]);
            $val = $stmt->fetchColumn();
            if ($val !== false && $val !== null && trim((string) $val) !== '') {
                return max(0.0, (float) str_replace(',', '.', (string) $val));
            }
        } catch (\Throwable $e) {
            // Config belum ada — pakai default.
        }

        return self::PIN_THRESHOLD;
    }

    private function totalRequiresPin(float $total): bool
    {
        return $total >= self::getPinThreshold($this->db);
    }

    /**
     * Kartu tanpa PIN tidak boleh dipakai transaksi sama sekali.
     * Input PIN 6 digit wajib jika total ≥ ambang dari pengaturan cashless.
     *
     * @return array{success: bool, message?: string, code?: string}
     */
    private function verifyPinIfRequired(int $kartuId, float $total, ?string $pin): array
    {
        $stmt = $this->db->prepare('SELECT pin_hash FROM cashless___kartu WHERE id = ? LIMIT 1');
        $stmt->execute([$kartuId]);
        $hash = $stmt->fetchColumn();
        if ($hash === false || $hash === null || $hash === '') {
            return [
                'success' => false,
                'code' => 'pin_not_set',
                'message' => 'PIN kartu belum diatur. Atur PIN di myBeddien (Cashless → Atur PIN) sebelum kartu bisa dipakai transaksi',
            ];
        }

        if (!$this->totalRequiresPin($total)) {
            return ['success' => true];
        }

        $pin = preg_replace('/\D/', '', (string) $pin);
        if (strlen($pin) !== self::PIN_LENGTH) {
            return [
                'success' => false,
                'code' => 'pin_required',
                'message' => 'Masukkan PIN 6 digit',
            ];
        }
        if (!password_verify($pin, (string) $hash)) {
            return [
                'success' => false,
                'code' => 'pin_invalid',
                'message' => 'PIN salah',
            ];
        }
        return ['success' => true];
    }

    /**
     * Status PIN kartu CS aktif milik santri.
     *
     * @return array{has_kartu: bool, kartu_id: ?int, has_pin: bool, pin_updated_at: ?string}
     */
    public function getSantriKartuPinStatus(int $santriId): array
    {
        $stmt = $this->db->prepare(
            "SELECT id, pin_hash, pin_updated_at FROM cashless___kartu
             WHERE santri_id = ? AND card_type = ? AND status = 'active'
             ORDER BY id DESC LIMIT 1"
        );
        $stmt->execute([$santriId, CashlessCardTokenHelper::TYPE_SANTRI]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            return [
                'has_kartu' => false,
                'kartu_id' => null,
                'has_pin' => false,
                'pin_updated_at' => null,
            ];
        }

        return [
            'has_kartu' => true,
            'kartu_id' => (int) $row['id'],
            'has_pin' => !empty($row['pin_hash']),
            'pin_updated_at' => $row['pin_updated_at'] !== null ? (string) $row['pin_updated_at'] : null,
        ];
    }

    /**
     * Ganti PIN: verifikasi PIN lama dulu.
     *
     * @return array{success: bool, message?: string, code?: string}
     */
    public function changeKartuPin(int $kartuId, string $oldPin, string $newPin): array
    {
        $oldPin = preg_replace('/\D/', '', $oldPin);
        $newPin = preg_replace('/\D/', '', $newPin);
        if (strlen($oldPin) !== self::PIN_LENGTH || strlen($newPin) !== self::PIN_LENGTH) {
            return ['success' => false, 'message' => 'PIN harus tepat 6 digit angka'];
        }
        if ($oldPin === $newPin) {
            return ['success' => false, 'message' => 'PIN baru harus berbeda dari PIN lama'];
        }

        $stmt = $this->db->prepare(
            "SELECT id, card_type, status, pin_hash FROM cashless___kartu WHERE id = ? LIMIT 1"
        );
        $stmt->execute([$kartuId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            return ['success' => false, 'message' => 'Kartu tidak ditemukan'];
        }
        if ($row['card_type'] !== CashlessCardTokenHelper::TYPE_SANTRI) {
            return ['success' => false, 'message' => 'PIN hanya untuk kartu santri (CS)'];
        }
        if (($row['status'] ?? '') !== 'active') {
            return ['success' => false, 'message' => 'Kartu tidak aktif'];
        }
        if (empty($row['pin_hash'])) {
            return [
                'success' => false,
                'code' => 'pin_not_set',
                'message' => 'PIN belum diatur. Gunakan Atur PIN terlebih dahulu',
            ];
        }
        if (!password_verify($oldPin, (string) $row['pin_hash'])) {
            return ['success' => false, 'code' => 'pin_invalid', 'message' => 'PIN lama salah'];
        }

        return $this->setKartuPin($kartuId, $newPin);
    }

    /**
     * @return array{success: bool, code?: string, message?: string}
     */
    private function checkDailyLimit(int $santriId, float $total): array
    {
        $batas = $this->resolveEffectiveDailyLimit($santriId);
        if ($batas <= 0) {
            return ['success' => true];
        }

        $used = $this->sumBelanjaHariIni($santriId);
        if ($used + $total > $batas + 0.001) {
            $sisa = max(0, $batas - $used);
            return [
                'success' => false,
                'code' => 'daily_limit',
                'message' => 'Melebihi batas belanja harian (sisa Rp ' . number_format($sisa, 0, ',', '.') . ')',
            ];
        }
        return ['success' => true];
    }

    /**
     * Limit efektif: override per-santri (aktif) menang; jika tidak, pakai limit masal global.
     */
    private function resolveEffectiveDailyLimit(int $santriId): float
    {
        try {
            $stmt = $this->db->prepare(
                'SELECT batas_per_hari, aktif FROM cashless___batas_harian_santri WHERE santri_id = ? LIMIT 1'
            );
            $stmt->execute([$santriId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row && (int) ($row['aktif'] ?? 0) === 1) {
                $per = (float) ($row['batas_per_hari'] ?? 0);
                if ($per > 0) {
                    return $per;
                }
            }
        } catch (\Throwable $e) {
            // tabel belum ada
        }

        return $this->getGlobalDailyLimit();
    }

    private function getGlobalDailyLimit(): float
    {
        try {
            $stmt = $this->db->prepare(
                "SELECT nilai FROM cashless___config WHERE kunci = 'batas_harian_global' LIMIT 1"
            );
            $stmt->execute();
            $v = $stmt->fetchColumn();
            if ($v === false || $v === null) {
                return 0.0;
            }
            return max(0.0, (float) str_replace(',', '.', (string) $v));
        } catch (\Throwable $e) {
            return 0.0;
        }
    }

    private function sumBelanjaHariIni(int $santriId): float
    {
        try {
            $sum = $this->db->prepare(
                'SELECT COALESCE(SUM(nominal), 0) FROM cashless___transaksi_detail
                 WHERE santri_id = ? AND DATE(transaksi_at) = CURDATE()'
            );
            $sum->execute([$santriId]);
            return (float) $sum->fetchColumn();
        } catch (\Throwable $e) {
            return 0.0;
        }
    }

    private function resolveTokoNama(int $pedagangId): string
    {
        $stmt = $this->db->prepare('SELECT nama_toko FROM cashless___pedagang WHERE id = ? LIMIT 1');
        $stmt->execute([$pedagangId]);
        $nama = $stmt->fetchColumn();
        return $nama ? (string) $nama : ('Toko #' . $pedagangId);
    }

    /**
     * Set / ganti PIN kartu SANTRI.
     *
     * @return array{success: bool, message?: string}
     */
    public function setKartuPin(int $kartuId, string $pin): array
    {
        $pin = preg_replace('/\D/', '', $pin);
        if (strlen($pin) !== self::PIN_LENGTH) {
            return ['success' => false, 'message' => 'PIN harus tepat 6 digit angka'];
        }

        $stmt = $this->db->prepare(
            "SELECT id, card_type, status FROM cashless___kartu WHERE id = ? LIMIT 1"
        );
        $stmt->execute([$kartuId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            return ['success' => false, 'message' => 'Kartu tidak ditemukan'];
        }
        if ($row['card_type'] !== CashlessCardTokenHelper::TYPE_SANTRI) {
            return ['success' => false, 'message' => 'PIN hanya untuk kartu santri (CS)'];
        }

        $hash = password_hash($pin, PASSWORD_DEFAULT);
        $upd = $this->db->prepare(
            'UPDATE cashless___kartu SET pin_hash = ?, pin_updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        );
        $upd->execute([$hash, $kartuId]);
        return ['success' => true, 'message' => 'PIN berhasil disimpan'];
    }
}
