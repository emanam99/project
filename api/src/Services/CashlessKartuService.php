<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\CashlessCardTokenHelper;
use App\Helpers\CashlessMaintenanceHelper;
use PDO;

/**
 * Terbitkan, cabut, dan resolve kartu cashless (CS santri, CM mahrom).
 */
class CashlessKartuService
{
    private PDO $db;
    private MahromService $mahromSvc;

    public function __construct(PDO $db)
    {
        $this->db = $db;
        $this->mahromSvc = new MahromService($db);
    }

    /**
     * @return array{success: bool, message?: string, data?: array{santri: array<string, mixed>, card: array<string, mixed>}}
     */
    public function issueSingle(int $santriId, string $cardType, ?int $createdBy = null, ?int $mahromId = null): array
    {
        if ($santriId <= 0) {
            return ['success' => false, 'message' => 'santri_id tidak valid'];
        }
        if (!in_array($cardType, [
            CashlessCardTokenHelper::TYPE_SANTRI,
            CashlessCardTokenHelper::TYPE_MAHROM,
        ], true)) {
            return ['success' => false, 'message' => 'card_type tidak valid'];
        }

        $ctx = $this->loadSantriIssueContext($santriId, $cardType === CashlessCardTokenHelper::TYPE_SANTRI);
        if (!$ctx['success']) {
            return $ctx;
        }

        ['santri' => $santri, 'account' => $account] = $ctx['data'];

        $mahromRow = null;
        if ($cardType === CashlessCardTokenHelper::TYPE_MAHROM) {
            $resolvedId = $mahromId ?? $this->mahromSvc->defaultMahromIdForSantri($santriId);
            if ($resolvedId === null || $resolvedId <= 0) {
                return ['success' => false, 'message' => 'Belum ada mahrom terhubung ke santri. Daftarkan di Cashless → Data Mahrom.'];
            }
            $mahromRow = $this->mahromSvc->getLinkedMahrom($santriId, $resolvedId);
            if ($mahromRow === null) {
                return ['success' => false, 'message' => 'Mahrom tidak terhubung dengan santri ini'];
            }
        }

        try {
            $this->db->beginTransaction();
            $card = $this->insertCardForType($santriId, $cardType, $santri, $account, $createdBy, $mahromRow);
            if ($card === null) {
                $this->db->rollBack();
                return ['success' => false, 'message' => 'Gagal menerbitkan kartu'];
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('CashlessKartuService::issueSingle ' . $e->getMessage());
            return ['success' => false, 'message' => 'Gagal menerbitkan kartu'];
        }

        return [
            'success' => true,
            'data' => [
                'santri' => $this->formatSantriResponse($santri),
                'card' => $card,
            ],
        ];
    }

    /**
     * @return array{success: bool, message?: string, data?: array{cards: list<array<string, mixed>>, santri: array<string, mixed>}}
     */
    public function issueBundle(int $santriId, ?int $createdBy = null, ?int $mahromId = null): array
    {
        if ($santriId <= 0) {
            return ['success' => false, 'message' => 'santri_id tidak valid'];
        }

        $ctx = $this->loadSantriIssueContext($santriId, true);
        if (!$ctx['success']) {
            return $ctx;
        }

        ['santri' => $santri, 'account' => $account] = $ctx['data'];

        $resolvedMahromId = $mahromId ?? $this->mahromSvc->defaultMahromIdForSantri($santriId);
        if ($resolvedMahromId === null || $resolvedMahromId <= 0) {
            return ['success' => false, 'message' => 'Belum ada mahrom terhubung ke santri untuk kartu CM'];
        }
        $mahromRow = $this->mahromSvc->getLinkedMahrom($santriId, $resolvedMahromId);
        if ($mahromRow === null) {
            return ['success' => false, 'message' => 'Mahrom tidak terhubung dengan santri ini'];
        }

        $types = [CashlessCardTokenHelper::TYPE_SANTRI, CashlessCardTokenHelper::TYPE_MAHROM];
        $issued = [];
        try {
            $this->db->beginTransaction();
            foreach ($types as $type) {
                $mRow = $type === CashlessCardTokenHelper::TYPE_MAHROM ? $mahromRow : null;
                $card = $this->insertCardForType($santriId, $type, $santri, $account, $createdBy, $mRow);
                if ($card === null) {
                    $this->db->rollBack();
                    return ['success' => false, 'message' => 'Gagal menerbitkan kartu'];
                }
                $issued[] = $card;
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('CashlessKartuService::issueBundle ' . $e->getMessage());
            return ['success' => false, 'message' => 'Gagal menerbitkan kartu'];
        }

        return [
            'success' => true,
            'data' => [
                'santri' => $this->formatSantriResponse($santri),
                'cards' => $issued,
            ],
        ];
    }

    /**
     * @return array{success: bool, message?: string, data?: array{santri: array<string, mixed>, account: array<string, mixed>}}
     */
    private function loadSantriIssueContext(int $santriId, bool $requireAccount = true): array
    {
        $stmt = $this->db->prepare('SELECT id, nama, nis FROM santri WHERE id = ? LIMIT 1');
        $stmt->execute([$santriId]);
        $santri = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$santri) {
            return ['success' => false, 'message' => 'Santri tidak ditemukan'];
        }

        $account = null;
        if ($requireAccount) {
            $accStmt = $this->db->prepare(
                "SELECT id, code, name FROM cashless___accounts WHERE entity_type = 'SANTRI' AND entity_id = ? LIMIT 1"
            );
            $accStmt->execute([$santriId]);
            $account = $accStmt->fetch(PDO::FETCH_ASSOC);
            if (!$account) {
                return ['success' => false, 'message' => 'Santri belum punya akun wallet. Buat dulu di Akun Cashless.'];
            }
        }

        return [
            'success' => true,
            'data' => [
                'santri' => $santri,
                'account' => $account ?: ['id' => null, 'code' => null, 'name' => null],
            ],
        ];
    }

    /**
     * @param array<string, mixed> $santri
     * @param array<string, mixed> $account
     * @param array<string, mixed>|null $mahromRow
     * @return array<string, mixed>|null
     */
    private function insertCardForType(
        int $santriId,
        string $type,
        array $santri,
        array $account,
        ?int $createdBy,
        ?array $mahromRow = null
    ): ?array {
        $mahromId = ($type === CashlessCardTokenHelper::TYPE_MAHROM && $mahromRow !== null)
            ? (int) $mahromRow['mahrom_id']
            : null;

        $this->deletePendingForSlot($santriId, $type, $mahromId);

        $tokenData = CashlessCardTokenHelper::issue($type);
        if ($tokenData === null) {
            return null;
        }

        $accountId = ($type === CashlessCardTokenHelper::TYPE_SANTRI && !empty($account['id']))
            ? (int) $account['id']
            : null;

        $ins = $this->db->prepare(
            'INSERT INTO cashless___kartu (card_type, santri_id, account_id, mahrom_id, token_hash, token_prefix, secret_version, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, \'pending\', ?)'
        );
        $ins->execute([
            $type,
            $santriId,
            $accountId,
            $mahromId,
            $tokenData['token_hash'],
            $tokenData['token_prefix'],
            $tokenData['secret_version'],
            $createdBy,
        ]);

        $kartuId = (int) $this->db->lastInsertId();

        return $this->formatCardResponse($type, $tokenData['token'], $santri, $kartuId, $mahromRow, 'pending');
    }

    /**
     * @param array<string, mixed> $santri
     * @return array<string, mixed>
     */
    private function formatSantriResponse(array $santri): array
    {
        return [
            'id' => (int) $santri['id'],
            'nama' => $santri['nama'] ?? '',
            'nis' => $santri['nis'] ?? null,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function resolveActiveToken(string $token, ?string $requiredType = null): ?array
    {
        if (CashlessMaintenanceHelper::isBlockingScans($this->db)) {
            return null;
        }

        $parsed = CashlessCardTokenHelper::verifyFormat($token);
        if ($parsed === null) {
            return null;
        }
        if ($requiredType !== null && $parsed['card_type'] !== $requiredType) {
            return null;
        }

        $currentVersion = CashlessCardTokenHelper::getSecretVersion();
        if ($parsed['secret_version'] !== $currentVersion) {
            return null;
        }

        $stmt = $this->db->prepare(
            "SELECT k.id, k.card_type, k.santri_id, k.account_id, k.mahrom_id, k.token_prefix, k.status,
                    s.nama AS santri_nama, s.nis AS santri_nis,
                    a.code AS account_code, a.balance_cached,
                    m.nim AS mahrom_nim, m.nama AS mahrom_nama,
                    sm.hubungan AS mahrom_hubungan
             FROM cashless___kartu k
             INNER JOIN santri s ON s.id = k.santri_id
             LEFT JOIN cashless___accounts a ON a.id = k.account_id
             LEFT JOIN mahrom m ON m.id = k.mahrom_id
             LEFT JOIN santri___mahrom sm ON sm.id_santri = k.santri_id AND sm.id_mahrom = k.mahrom_id
             WHERE k.token_hash = ? AND k.status = 'active' AND k.secret_version = ?
             LIMIT 1"
        );
        $stmt->execute([$parsed['token_hash'], $currentVersion]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }

        return [
            'kartu_id' => (int) $row['id'],
            'card_type' => $row['card_type'],
            'santri_id' => (int) $row['santri_id'],
            'account_id' => $row['account_id'] !== null ? (int) $row['account_id'] : null,
            'mahrom_id' => $row['mahrom_id'] !== null ? (int) $row['mahrom_id'] : null,
            'token_prefix' => $row['token_prefix'],
            'santri_nama' => $row['santri_nama'],
            'santri_nis' => $row['santri_nis'],
            'mahrom_nim' => $row['mahrom_nim'],
            'mahrom_nama' => $row['mahrom_nama'],
            'mahrom_hubungan' => $row['mahrom_hubungan'],
            'account_code' => $row['account_code'],
            'balance_cached' => $row['balance_cached'] !== null ? (float) $row['balance_cached'] : null,
        ];
    }

    /**
     * Diagnosa token CS/CM untuk meja input ijin.
     *
     * @return array{ok: true, card: array<string, mixed>}|array{ok: false, code: string, message: string}
     */
    public function resolveTokenForIjin(string $token): array
    {
        $token = trim($token);
        if ($token === '') {
            return ['ok' => false, 'code' => 'empty', 'message' => 'Token QR kosong'];
        }

        $maintenance = CashlessMaintenanceHelper::scanBlockPayload($this->db);
        if ($maintenance !== null) {
            return ['ok' => false, 'code' => $maintenance['code'], 'message' => $maintenance['message']];
        }

        $parsed = CashlessCardTokenHelper::verifyFormat($token);
        if ($parsed === null) {
            return [
                'ok' => false,
                'code' => 'invalid_format',
                'message' => 'QR tidak valid. Pindai kartu santri (CS) atau kartu mahrom (CM).',
            ];
        }

        $allowed = [CashlessCardTokenHelper::TYPE_SANTRI, CashlessCardTokenHelper::TYPE_MAHROM];
        if (!in_array($parsed['card_type'], $allowed, true)) {
            return [
                'ok' => false,
                'code' => 'wrong_card_type',
                'message' => 'Jenis kartu tidak didukung. Gunakan kartu santri (CS) atau mahrom (CM).',
            ];
        }

        $currentVersion = CashlessCardTokenHelper::getSecretVersion();
        if ($parsed['secret_version'] !== $currentVersion) {
            return [
                'ok' => false,
                'code' => 'expired',
                'message' => 'Kartu sudah kadaluarsa. Minta penerbitan kartu baru.',
            ];
        }

        $stmt = $this->db->prepare(
            "SELECT k.id, k.card_type, k.santri_id, k.account_id, k.mahrom_id, k.token_prefix, k.status, k.secret_version,
                    s.nama AS santri_nama, s.nis AS santri_nis,
                    m.nim AS mahrom_nim, m.nama AS mahrom_nama,
                    sm.hubungan AS mahrom_hubungan
             FROM cashless___kartu k
             INNER JOIN santri s ON s.id = k.santri_id
             LEFT JOIN mahrom m ON m.id = k.mahrom_id
             LEFT JOIN santri___mahrom sm ON sm.id_santri = k.santri_id AND sm.id_mahrom = k.mahrom_id
             WHERE k.token_hash = ?
             ORDER BY FIELD(k.status, 'active', 'pending', 'revoked'), k.id DESC
             LIMIT 1"
        );
        $stmt->execute([$parsed['token_hash']]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            return [
                'ok' => false,
                'code' => 'not_registered',
                'message' => 'QR tidak terdaftar di sistem. Kartu mungkin belum diterbitkan.',
            ];
        }

        $status = (string) ($row['status'] ?? '');
        $label = $row['card_type'] === CashlessCardTokenHelper::TYPE_MAHROM ? 'mahrom (CM)' : 'santri (CS)';
        if ($status === 'pending') {
            return [
                'ok' => false,
                'code' => 'not_activated',
                'message' => "Kartu {$label} belum diaktivasi. Cetak lalu scan validasi terlebih dahulu.",
            ];
        }
        if ($status === 'revoked' || (int) ($row['secret_version'] ?? 0) !== $currentVersion) {
            return [
                'ok' => false,
                'code' => 'expired',
                'message' => "Kartu {$label} sudah tidak berlaku. Gunakan kartu terbaru.",
            ];
        }
        if ($status !== 'active') {
            return [
                'ok' => false,
                'code' => 'invalid',
                'message' => "Kartu {$label} tidak dapat digunakan.",
            ];
        }

        return [
            'ok' => true,
            'card' => [
                'kartu_id' => (int) $row['id'],
                'card_type' => $row['card_type'],
                'santri_id' => (int) $row['santri_id'],
                'account_id' => $row['account_id'] !== null ? (int) $row['account_id'] : null,
                'mahrom_id' => $row['mahrom_id'] !== null ? (int) $row['mahrom_id'] : null,
                'token_prefix' => $row['token_prefix'],
                'santri_nama' => $row['santri_nama'],
                'santri_nis' => $row['santri_nis'],
                'mahrom_nim' => $row['mahrom_nim'],
                'mahrom_nama' => $row['mahrom_nama'],
                'mahrom_hubungan' => $row['mahrom_hubungan'],
            ],
        ];
    }

    /**
     * Diagnosa token CM untuk buku tamu — pesan spesifik (belum aktif, kadaluarsa, dll.).
     *
     * @return array{ok: true, card: array<string, mixed>}|array{ok: false, code: string, message: string}
     */
    public function resolveMahromTokenForBukuTamu(string $token): array
    {
        $token = trim($token);
        if ($token === '') {
            return ['ok' => false, 'code' => 'empty', 'message' => 'Token QR kosong'];
        }

        $maintenance = CashlessMaintenanceHelper::scanBlockPayload($this->db);
        if ($maintenance !== null) {
            return ['ok' => false, 'code' => $maintenance['code'], 'message' => $maintenance['message']];
        }

        $parsed = CashlessCardTokenHelper::verifyFormat($token);
        if ($parsed === null) {
            return [
                'ok' => false,
                'code' => 'invalid_format',
                'message' => 'QR tidak valid. Pastikan Anda memindai kartu mahrom (CM) yang benar.',
            ];
        }

        if ($parsed['card_type'] !== CashlessCardTokenHelper::TYPE_MAHROM) {
            return [
                'ok' => false,
                'code' => 'wrong_card_type',
                'message' => 'Bukan kartu mahrom (CM). Gunakan QR pada kartu wali/orang tua.',
            ];
        }

        $currentVersion = CashlessCardTokenHelper::getSecretVersion();
        if ($parsed['secret_version'] !== $currentVersion) {
            return [
                'ok' => false,
                'code' => 'expired',
                'message' => 'Kartu sudah kadaluarsa. Minta penerbitan kartu CM baru.',
            ];
        }

        $stmt = $this->db->prepare(
            "SELECT k.id, k.card_type, k.santri_id, k.account_id, k.mahrom_id, k.token_prefix, k.status, k.secret_version,
                    s.nama AS santri_nama, s.nis AS santri_nis,
                    m.nim AS mahrom_nim, m.nama AS mahrom_nama,
                    sm.hubungan AS mahrom_hubungan
             FROM cashless___kartu k
             INNER JOIN santri s ON s.id = k.santri_id
             LEFT JOIN mahrom m ON m.id = k.mahrom_id
             LEFT JOIN santri___mahrom sm ON sm.id_santri = k.santri_id AND sm.id_mahrom = k.mahrom_id
             WHERE k.token_hash = ?
             ORDER BY FIELD(k.status, 'active', 'pending', 'revoked'), k.id DESC
             LIMIT 1"
        );
        $stmt->execute([$parsed['token_hash']]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            return [
                'ok' => false,
                'code' => 'not_registered',
                'message' => 'QR tidak terdaftar di sistem. Kartu mungkin belum diterbitkan atau tidak dikenali.',
            ];
        }

        $status = (string) ($row['status'] ?? '');
        if ($status === 'pending') {
            return [
                'ok' => false,
                'code' => 'not_activated',
                'message' => 'Kartu belum diaktivasi. Cetak kartu lalu scan QR untuk validasi terlebih dahulu.',
            ];
        }
        if ($status === 'revoked' || (int) ($row['secret_version'] ?? 0) !== $currentVersion) {
            return [
                'ok' => false,
                'code' => 'expired',
                'message' => 'Kartu sudah tidak berlaku (diganti kartu baru). Gunakan kartu CM terbaru.',
            ];
        }
        if ($status !== 'active') {
            return [
                'ok' => false,
                'code' => 'invalid',
                'message' => 'Kartu mahrom tidak dapat digunakan.',
            ];
        }

        return [
            'ok' => true,
            'card' => [
                'kartu_id' => (int) $row['id'],
                'card_type' => $row['card_type'],
                'santri_id' => (int) $row['santri_id'],
                'account_id' => $row['account_id'] !== null ? (int) $row['account_id'] : null,
                'mahrom_id' => $row['mahrom_id'] !== null ? (int) $row['mahrom_id'] : null,
                'token_prefix' => $row['token_prefix'],
                'santri_nama' => $row['santri_nama'],
                'santri_nis' => $row['santri_nis'],
                'mahrom_nim' => $row['mahrom_nim'],
                'mahrom_nama' => $row['mahrom_nama'],
                'mahrom_hubungan' => $row['mahrom_hubungan'],
                'account_code' => null,
                'balance_cached' => null,
            ],
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function listActiveBySantri(int $santriId): array
    {
        $currentVersion = CashlessCardTokenHelper::getSecretVersion();
        $stmt = $this->db->prepare(
            "SELECT k.id, k.card_type, k.status, k.token_prefix, k.issued_at, k.printed_at, k.printed_by,
                    k.validated_at, k.validated_by, k.mahrom_id, k.pin_hash,
                    m.nim AS mahrom_nim, m.nama AS mahrom_nama,
                    m.dusun AS mahrom_dusun, m.rt AS mahrom_rt, m.rw AS mahrom_rw,
                    m.desa AS mahrom_desa, m.kecamatan AS mahrom_kecamatan, m.kabupaten AS mahrom_kabupaten,
                    sm.hubungan AS mahrom_hubungan
             FROM cashless___kartu k
             LEFT JOIN mahrom m ON m.id = k.mahrom_id
             LEFT JOIN santri___mahrom sm ON sm.id_santri = k.santri_id AND sm.id_mahrom = k.mahrom_id
             WHERE k.santri_id = ? AND k.status IN ('active', 'pending') AND k.secret_version = ?
             ORDER BY FIELD(k.status, 'active', 'pending'), FIELD(k.card_type, 'SANTRI', 'MAHROM')"
        );
        $stmt->execute([$santriId, $currentVersion]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $out = [];
        foreach ($rows as $row) {
            $status = (string) ($row['status'] ?? 'pending');
            $printed = $row['printed_at'] !== null && $row['printed_at'] !== '';
            $item = [
                'kartu_id' => (int) $row['id'],
                'card_type' => $row['card_type'],
                'status' => $status,
                'validated' => $status === 'active',
                'awaiting_validation' => $status === 'pending',
                'token_prefix' => $row['token_prefix'],
                'label' => $this->typeLabel($row['card_type']),
                'issued_at' => $row['issued_at'],
                'printed' => $printed,
                'printed_at' => $row['printed_at'],
                'printed_by' => $row['printed_by'] !== null ? (int) $row['printed_by'] : null,
                'validated_at' => $row['validated_at'],
                'validated_by' => $row['validated_by'] !== null ? (int) $row['validated_by'] : null,
                'mahrom_id' => $row['mahrom_id'] !== null ? (int) $row['mahrom_id'] : null,
                'has_pin' => $row['card_type'] === CashlessCardTokenHelper::TYPE_SANTRI
                    && !empty($row['pin_hash']),
            ];
            if ($row['card_type'] === CashlessCardTokenHelper::TYPE_MAHROM && !empty($row['mahrom_nama'])) {
                $item['mahrom_nim'] = $row['mahrom_nim'];
                $item['mahrom_nama'] = $row['mahrom_nama'];
                $item['mahrom_hubungan'] = $row['mahrom_hubungan'];
                $item['mahrom_dusun'] = $row['mahrom_dusun'];
                $item['mahrom_rt'] = $row['mahrom_rt'];
                $item['mahrom_rw'] = $row['mahrom_rw'];
                $item['mahrom_desa'] = $row['mahrom_desa'];
                $item['mahrom_kecamatan'] = $row['mahrom_kecamatan'];
                $item['mahrom_kabupaten'] = $row['mahrom_kabupaten'];
            }
            $out[] = $item;
        }
        return $out;
    }

    /**
     * Aktifkan kartu pending setelah scan QR post-cetak; cabut kartu aktif lama di slot yang sama.
     *
     * @return array{success: bool, message?: string, data?: array<string, mixed>}
     */
    public function validateAfterPrint(string $token, ?int $userId = null, ?int $kartuId = null): array
    {
        $maintenance = CashlessMaintenanceHelper::scanBlockPayload($this->db);
        if ($maintenance !== null) {
            return ['success' => false, 'code' => $maintenance['code'], 'message' => $maintenance['message']];
        }

        $parsed = CashlessCardTokenHelper::verifyFormat($token);
        if ($parsed === null) {
            return ['success' => false, 'message' => 'Format QR kartu tidak valid'];
        }

        $currentVersion = CashlessCardTokenHelper::getSecretVersion();
        if ($parsed['secret_version'] !== $currentVersion) {
            return ['success' => false, 'message' => 'Versi kartu tidak dikenali'];
        }

        $sql = "SELECT k.id, k.card_type, k.santri_id, k.mahrom_id, k.status
                FROM cashless___kartu k
                WHERE k.token_hash = ? AND k.secret_version = ? AND k.status = 'pending'
                LIMIT 1";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$parsed['token_hash'], $currentVersion]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return ['success' => false, 'message' => 'Kartu tidak ditemukan atau sudah divalidasi'];
        }

        $id = (int) $row['id'];
        if ($kartuId !== null && $kartuId > 0 && $id !== $kartuId) {
            return ['success' => false, 'message' => 'QR tidak cocok dengan kartu yang baru dicetak'];
        }

        $santriId = (int) $row['santri_id'];
        $cardType = (string) $row['card_type'];
        $mahromId = $row['mahrom_id'] !== null ? (int) $row['mahrom_id'] : null;

        try {
            $this->db->beginTransaction();
            $this->revokeActiveCardsForSlot($santriId, $cardType, $mahromId, $id);
            $up = $this->db->prepare(
                "UPDATE cashless___kartu
                 SET status = 'active', validated_at = NOW(), validated_by = ?
                 WHERE id = ? AND status = 'pending'"
            );
            $up->execute([$userId, $id]);
            if ($up->rowCount() === 0) {
                $this->db->rollBack();
                return ['success' => false, 'message' => 'Gagal mengaktifkan kartu'];
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('CashlessKartuService::validateAfterPrint ' . $e->getMessage());
            return ['success' => false, 'message' => 'Gagal memvalidasi kartu'];
        }

        return [
            'success' => true,
            'data' => [
                'kartu_id' => $id,
                'santri_id' => $santriId,
                'card_type' => $cardType,
                'mahrom_id' => $mahromId,
                'cards' => $this->listActiveBySantri($santriId),
            ],
        ];
    }

    /**
     * @return array{success: bool, message?: string, data?: array<string, mixed>}
     */
    public function markPrinted(int $santriId, string $cardTypeOrAll, ?int $userId = null, ?int $mahromId = null, ?int $kartuId = null): array
    {
        if ($santriId <= 0) {
            return ['success' => false, 'message' => 'santri_id tidak valid'];
        }

        $types = [];
        if ($cardTypeOrAll === 'all') {
            $types = [CashlessCardTokenHelper::TYPE_SANTRI, CashlessCardTokenHelper::TYPE_MAHROM];
        } elseif (in_array($cardTypeOrAll, [CashlessCardTokenHelper::TYPE_SANTRI, CashlessCardTokenHelper::TYPE_MAHROM], true)) {
            $types = [$cardTypeOrAll];
        } else {
            return ['success' => false, 'message' => 'card_type tidak valid'];
        }

        if ($cardTypeOrAll === CashlessCardTokenHelper::TYPE_MAHROM && $mahromId !== null && $mahromId <= 0) {
            return ['success' => false, 'message' => 'mahrom_id tidak valid'];
        }

        $currentVersion = CashlessCardTokenHelper::getSecretVersion();
        $updated = 0;
        try {
            if ($kartuId !== null && $kartuId > 0) {
                $upId = $this->db->prepare(
                    "UPDATE cashless___kartu
                     SET printed_at = NOW(), printed_by = ?
                     WHERE id = ? AND santri_id = ? AND status = 'pending' AND secret_version = ?"
                );
                $upId->execute([$userId, $kartuId, $santriId, $currentVersion]);
                $updated = $upId->rowCount();
            } else {
                $upSantri = $this->db->prepare(
                    "UPDATE cashless___kartu
                     SET printed_at = NOW(), printed_by = ?
                     WHERE santri_id = ? AND card_type = ? AND status = 'pending' AND secret_version = ?"
                );
                $upMahrom = $this->db->prepare(
                    "UPDATE cashless___kartu
                     SET printed_at = NOW(), printed_by = ?
                     WHERE santri_id = ? AND card_type = ? AND mahrom_id = ? AND status = 'pending' AND secret_version = ?"
                );
                foreach ($types as $type) {
                    if ($type === CashlessCardTokenHelper::TYPE_MAHROM && $mahromId !== null && $mahromId > 0) {
                        $upMahrom->execute([$userId, $santriId, $type, $mahromId, $currentVersion]);
                        $updated += $upMahrom->rowCount();
                    } elseif ($type === CashlessCardTokenHelper::TYPE_MAHROM) {
                        $upSantri->execute([$userId, $santriId, $type, $currentVersion]);
                        $updated += $upSantri->rowCount();
                    } else {
                        $upSantri->execute([$userId, $santriId, $type, $currentVersion]);
                        $updated += $upSantri->rowCount();
                    }
                }
            }
        } catch (\Throwable $e) {
            error_log('CashlessKartuService::markPrinted ' . $e->getMessage());
            return ['success' => false, 'message' => 'Gagal menyimpan status cetak'];
        }

        if ($updated === 0) {
            return ['success' => false, 'message' => 'Kartu pending tidak ditemukan untuk ditandai cetak'];
        }

        return [
            'success' => true,
            'data' => [
                'santri_id' => $santriId,
                'mahrom_id' => $mahromId,
                'kartu_id' => $kartuId,
                'marked' => $updated,
                'cards' => $this->listActiveBySantri($santriId),
            ],
        ];
    }

    /** @return array<int, array{CS: bool, CM: bool}> */
    public function activeFlagsBySantriIds(array $santriIds): array
    {
        return $this->flagsBySantriIds($santriIds, false);
    }

    /** @return array<int, array{CS: bool, CM: bool}> */
    public function printedFlagsBySantriIds(array $santriIds): array
    {
        return $this->flagsBySantriIds($santriIds, true);
    }

    /**
     * Kartu pending yang sudah dicetak tapi belum divalidasi (bisa validasi dari perangkat lain).
     *
     * @return array<int, array{
     *   flags: array{CS: bool, CM: bool},
     *   slots: list<array{kartu_id: int, card_type: string, mahrom_id: int|null, label: string, hubungan: string|null}>
     * }>
     */
    public function pendingValidationBySantriIds(array $santriIds): array
    {
        if ($santriIds === []) {
            return [];
        }
        $currentVersion = CashlessCardTokenHelper::getSecretVersion();
        $placeholders = implode(',', array_fill(0, count($santriIds), '?'));
        $sql = "SELECT k.id, k.santri_id, k.card_type, k.mahrom_id, k.printed_at,
                       m.nama AS mahrom_nama, sm.hubungan AS mahrom_hubungan
                FROM cashless___kartu k
                LEFT JOIN mahrom m ON m.id = k.mahrom_id
                LEFT JOIN santri___mahrom sm ON sm.id_santri = k.santri_id AND sm.id_mahrom = k.mahrom_id
                WHERE k.santri_id IN ($placeholders)
                  AND k.status = 'pending'
                  AND k.secret_version = ?
                  AND k.printed_at IS NOT NULL
                  AND k.printed_at != ''
                ORDER BY k.santri_id ASC, FIELD(k.card_type, 'SANTRI', 'MAHROM')";
        $stmt = $this->db->prepare($sql);
        $bind = array_map('intval', $santriIds);
        $bind[] = $currentVersion;
        $stmt->execute($bind);

        $out = [];
        foreach ($santriIds as $sid) {
            $out[(int) $sid] = [
                'flags' => ['CS' => false, 'CM' => false],
                'slots' => [],
            ];
        }
        $typeToKey = [
            CashlessCardTokenHelper::TYPE_SANTRI => 'CS',
            CashlessCardTokenHelper::TYPE_MAHROM => 'CM',
        ];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $sid = (int) $row['santri_id'];
            if (!isset($out[$sid])) {
                continue;
            }
            $cardType = (string) $row['card_type'];
            $key = $typeToKey[$cardType] ?? null;
            if ($key !== null) {
                $out[$sid]['flags'][$key] = true;
            }
            $hubungan = $row['mahrom_hubungan'] !== null ? (string) $row['mahrom_hubungan'] : null;
            $label = $cardType === CashlessCardTokenHelper::TYPE_MAHROM
                ? ('CM' . ($hubungan ? ' · ' . $hubungan : ''))
                : 'CS';
            $out[$sid]['slots'][] = [
                'kartu_id' => (int) $row['id'],
                'card_type' => $cardType,
                'mahrom_id' => $row['mahrom_id'] !== null ? (int) $row['mahrom_id'] : null,
                'label' => $label,
                'hubungan' => $hubungan,
                'mahrom_nama' => $row['mahrom_nama'] !== null ? (string) $row['mahrom_nama'] : null,
            ];
        }
        return $out;
    }

    /**
     * Status kartu CM per mahrom untuk tiap santri (ayah/ibu/wali terpisah).
     *
     * @return array<int, list<array{mahrom_id: int, mahrom_nama: string, mahrom_nim: string|null, hubungan: string|null, active: bool, printed: bool, printed_at: string|null}>>
     */
    public function cmMahromDetailBySantriIds(array $santriIds): array
    {
        if ($santriIds === []) {
            return [];
        }
        $currentVersion = CashlessCardTokenHelper::getSecretVersion();
        $placeholders = implode(',', array_fill(0, count($santriIds), '?'));
        $sql = "SELECT k.santri_id, k.mahrom_id, k.printed_at, k.issued_at,
                       m.nama AS mahrom_nama, m.nim AS mahrom_nim,
                       sm.hubungan AS mahrom_hubungan
                FROM cashless___kartu k
                INNER JOIN mahrom m ON m.id = k.mahrom_id
                LEFT JOIN santri___mahrom sm ON sm.id_santri = k.santri_id AND sm.id_mahrom = k.mahrom_id
                WHERE k.santri_id IN ($placeholders)
                  AND k.card_type = ?
                  AND k.status = 'active'
                  AND k.secret_version = ?
                  AND k.mahrom_id IS NOT NULL
                ORDER BY k.santri_id ASC, sm.hubungan ASC, m.nama ASC";
        $stmt = $this->db->prepare($sql);
        $bind = array_map('intval', $santriIds);
        $bind[] = CashlessCardTokenHelper::TYPE_MAHROM;
        $bind[] = $currentVersion;
        $stmt->execute($bind);

        $out = [];
        foreach ($santriIds as $sid) {
            $out[(int) $sid] = [];
        }
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $sid = (int) $row['santri_id'];
            if (!isset($out[$sid])) {
                continue;
            }
            $out[$sid][] = [
                'mahrom_id' => (int) $row['mahrom_id'],
                'mahrom_nama' => (string) ($row['mahrom_nama'] ?? ''),
                'mahrom_nim' => $row['mahrom_nim'] !== null ? (string) $row['mahrom_nim'] : null,
                'hubungan' => $row['mahrom_hubungan'] !== null ? (string) $row['mahrom_hubungan'] : null,
                'active' => true,
                'printed' => $row['printed_at'] !== null && $row['printed_at'] !== '',
                'printed_at' => $row['printed_at'],
            ];
        }
        return $out;
    }

    /**
     * Ringkasan kartu CM per mahrom (untuk halaman Data Mahrom).
     *
     * @return array<int, array{aktif: int, dicetak: int, per_santri: list<array<string, mixed>>}>
     */
    public function cmSummaryByMahromIds(array $mahromIds): array
    {
        if ($mahromIds === []) {
            return [];
        }
        $currentVersion = CashlessCardTokenHelper::getSecretVersion();
        $placeholders = implode(',', array_fill(0, count($mahromIds), '?'));
        $sql = "SELECT k.mahrom_id, k.santri_id, k.printed_at, k.printed_at IS NOT NULL AND k.printed_at != '' AS is_printed,
                       s.nama AS santri_nama, s.nis AS santri_nis,
                       sm.hubungan
                FROM cashless___kartu k
                INNER JOIN santri s ON s.id = k.santri_id
                LEFT JOIN santri___mahrom sm ON sm.id_santri = k.santri_id AND sm.id_mahrom = k.mahrom_id
                WHERE k.mahrom_id IN ($placeholders)
                  AND k.card_type = ?
                  AND k.status = 'active'
                  AND k.secret_version = ?
                ORDER BY k.mahrom_id ASC, s.nama ASC";
        $stmt = $this->db->prepare($sql);
        $bind = array_map('intval', $mahromIds);
        $bind[] = CashlessCardTokenHelper::TYPE_MAHROM;
        $bind[] = $currentVersion;
        $stmt->execute($bind);

        $out = [];
        foreach ($mahromIds as $mid) {
            $out[(int) $mid] = ['aktif' => 0, 'dicetak' => 0, 'per_santri' => []];
        }
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $mid = (int) $row['mahrom_id'];
            if (!isset($out[$mid])) {
                continue;
            }
            $printed = !empty($row['is_printed']);
            $out[$mid]['aktif']++;
            if ($printed) {
                $out[$mid]['dicetak']++;
            }
            $out[$mid]['per_santri'][] = [
                'santri_id' => (int) $row['santri_id'],
                'santri_nama' => (string) ($row['santri_nama'] ?? ''),
                'santri_nis' => $row['santri_nis'] !== null ? (string) $row['santri_nis'] : null,
                'hubungan' => $row['hubungan'] !== null ? (string) $row['hubungan'] : null,
                'printed' => $printed,
                'printed_at' => $row['printed_at'],
            ];
        }
        return $out;
    }

    /** @return array<int, array{CS: bool, CM: bool}> */
    private function flagsBySantriIds(array $santriIds, bool $printedOnly): array
    {
        if ($santriIds === []) {
            return [];
        }
        $currentVersion = CashlessCardTokenHelper::getSecretVersion();
        $placeholders = implode(',', array_fill(0, count($santriIds), '?'));
        $sql = "SELECT santri_id, card_type, printed_at FROM cashless___kartu
                WHERE santri_id IN ($placeholders) AND status = 'active' AND secret_version = ?";
        $stmt = $this->db->prepare($sql);
        $bind = array_map('intval', $santriIds);
        $bind[] = $currentVersion;
        $stmt->execute($bind);
        $flags = [];
        foreach ($santriIds as $sid) {
            $flags[(int) $sid] = ['CS' => false, 'CM' => false];
        }
        $map = [
            CashlessCardTokenHelper::TYPE_SANTRI => 'CS',
            CashlessCardTokenHelper::TYPE_MAHROM => 'CM',
        ];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $sid = (int) $row['santri_id'];
            $key = $map[$row['card_type']] ?? null;
            if ($key === null || !isset($flags[$sid])) {
                continue;
            }
            if ($printedOnly) {
                if ($row['printed_at'] !== null && $row['printed_at'] !== '') {
                    $flags[$sid][$key] = true;
                }
            } else {
                $flags[$sid][$key] = true;
            }
        }
        return $flags;
    }

    private function deletePendingForSlot(int $santriId, string $cardType, ?int $mahromId = null): void
    {
        if ($cardType === CashlessCardTokenHelper::TYPE_MAHROM && $mahromId !== null && $mahromId > 0) {
            $del = $this->db->prepare(
                'DELETE FROM cashless___kartu WHERE santri_id = ? AND card_type = ? AND mahrom_id = ? AND status = \'pending\''
            );
            $del->execute([$santriId, $cardType, $mahromId]);
            return;
        }
        $del = $this->db->prepare(
            'DELETE FROM cashless___kartu WHERE santri_id = ? AND card_type = ? AND status = \'pending\''
        );
        $del->execute([$santriId, $cardType]);
    }

    private function revokeActiveCardsForSlot(int $santriId, string $cardType, ?int $mahromId, int $exceptId): void
    {
        if ($cardType === CashlessCardTokenHelper::TYPE_MAHROM && $mahromId !== null && $mahromId > 0) {
            $rev = $this->db->prepare(
                "UPDATE cashless___kartu SET status = 'revoked', revoked_at = NOW()
                 WHERE santri_id = ? AND card_type = ? AND mahrom_id = ? AND status = 'active' AND id != ?"
            );
            $rev->execute([$santriId, $cardType, $mahromId, $exceptId]);
            return;
        }
        $rev = $this->db->prepare(
            "UPDATE cashless___kartu SET status = 'revoked', revoked_at = NOW()
             WHERE santri_id = ? AND card_type = ? AND status = 'active' AND id != ?"
        );
        $rev->execute([$santriId, $cardType, $exceptId]);
    }

    private function deleteActiveCardsForSantri(int $santriId, string $cardType, ?int $mahromId = null): void
    {
        if ($cardType === CashlessCardTokenHelper::TYPE_MAHROM && $mahromId !== null && $mahromId > 0) {
            $del = $this->db->prepare(
                'DELETE FROM cashless___kartu WHERE santri_id = ? AND card_type = ? AND mahrom_id = ?'
            );
            $del->execute([$santriId, $cardType, $mahromId]);
            return;
        }
        $del = $this->db->prepare('DELETE FROM cashless___kartu WHERE santri_id = ? AND card_type = ?');
        $del->execute([$santriId, $cardType]);
    }

    /**
     * @param array<string, mixed> $santri
     * @param array<string, mixed>|null $mahromRow
     * @return array<string, mixed>
     */
    private function formatCardResponse(
        string $type,
        string $token,
        array $santri,
        int $kartuId = 0,
        ?array $mahromRow = null,
        string $status = 'pending'
    ): array {
        $label = $this->typeLabel($type);
        $namaSantri = trim((string) ($santri['nama'] ?? ''));
        $nis = trim((string) ($santri['nis'] ?? ''));

        $payload = [
            'kartu_id' => $kartuId > 0 ? $kartuId : null,
            'card_type' => $type,
            'card_label' => $label,
            'status' => $status,
            'validated' => $status === 'active',
            'awaiting_validation' => $status === 'pending',
            'token' => $token,
            'token_prefix' => CashlessCardTokenHelper::prefixForType($type),
            'santri_nama' => $namaSantri,
            'santri_nis' => $nis !== '' ? $nis : null,
            'subtitle' => $namaSantri,
            'print_title' => $label,
            'printed' => false,
            'printed_at' => null,
        ];

        if ($type === CashlessCardTokenHelper::TYPE_MAHROM && $mahromRow !== null) {
            $payload['mahrom_id'] = (int) $mahromRow['mahrom_id'];
            $payload['mahrom_nim'] = $mahromRow['nim'] ?? null;
            $payload['mahrom_nama'] = $mahromRow['nama'] ?? '';
            $payload['mahrom_hubungan'] = $mahromRow['hubungan'] ?? '';
            $payload['display_nama'] = $mahromRow['nama'] ?? '';
            $payload['holder_label'] = $mahromRow['hubungan'] ?? 'Mahrom';
            $payload['subtitle'] = $mahromRow['nama'] ?? '';
            $payload['mahrom_dusun'] = $mahromRow['dusun'] ?? null;
            $payload['mahrom_rt'] = $mahromRow['rt'] ?? null;
            $payload['mahrom_rw'] = $mahromRow['rw'] ?? null;
            $payload['mahrom_desa'] = $mahromRow['desa'] ?? null;
            $payload['mahrom_kecamatan'] = $mahromRow['kecamatan'] ?? null;
            $payload['mahrom_kabupaten'] = $mahromRow['kabupaten'] ?? null;
        }

        return $payload;
    }

    private function typeLabel(string $type): string
    {
        return match ($type) {
            CashlessCardTokenHelper::TYPE_SANTRI => 'Kartu Santri',
            CashlessCardTokenHelper::TYPE_MAHROM => 'Kartu Mahrom',
            default => $type,
        };
    }
}
