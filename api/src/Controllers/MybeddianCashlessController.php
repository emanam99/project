<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Auth\PasswordHelper;
use App\Database;
use App\Helpers\AiAgentUserHelper;
use App\Helpers\CashlessMoneyLimitsHelper;
use App\Helpers\TextSanitizer;
use App\Services\CashlessPurchaseService;
use App\Services\CashlessReconcileService;
use App\Services\CashlessStatementService;
use App\Services\CashlessTopUpService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Cashless wallet santri � myBeddian (baca saldo + riwayat, top-up via payment-transaction/iPayMu).
 */
class MybeddianCashlessController
{
    private \PDO $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    private function resolveSantriId(Request $request): ?int
    {
        $payload = $request->getAttribute('user');
        if (!is_array($payload)) {
            return null;
        }
        $sid = isset($payload['santri_id']) ? (int) $payload['santri_id'] : 0;
        return $sid > 0 ? $sid : null;
    }

    private function resolveTokoId(Request $request): ?int
    {
        $payload = $request->getAttribute('user');
        if (!is_array($payload)) {
            return null;
        }
        $tid = isset($payload['toko_id']) ? (int) $payload['toko_id'] : 0;
        return $tid > 0 ? $tid : null;
    }

    /**
     * Mode wallet: ?akses=toko ? PEDAGANG; selain itu santri bila ada.
     *
     * @return array{mode: 'santri'|'toko', entity_id: int}|null
     */
    private function resolveWalletContext(Request $request): ?array
    {
        $params = $request->getQueryParams();
        $body = $request->getParsedBody();
        $prefer = '';
        if (isset($params['akses'])) {
            $prefer = strtolower(trim((string) $params['akses']));
        } elseif (is_array($body) && isset($body['akses'])) {
            $prefer = strtolower(trim((string) $body['akses']));
        }

        $tokoId = $this->resolveTokoId($request);
        $santriId = $this->resolveSantriId($request);

        if ($prefer === 'toko') {
            if ($tokoId === null) {
                return null;
            }
            return ['mode' => 'toko', 'entity_id' => $tokoId];
        }

        if ($santriId !== null) {
            return ['mode' => 'santri', 'entity_id' => $santriId];
        }
        if ($tokoId !== null) {
            return ['mode' => 'toko', 'entity_id' => $tokoId];
        }

        return null;
    }

    private function resolveActorUserId(Request $request): ?int
    {
        $payload = $request->getAttribute('user');
        if (!is_array($payload)) {
            return null;
        }

        return AiAgentUserHelper::resolveUsersId($payload, $this->db);
    }

    /**
     * GET /api/mybeddian/v2/cashless/wallet
     */
    public function getWallet(Request $request, Response $response): Response
    {
        try {
            $ctx = $this->resolveWalletContext($request);
            if ($ctx === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses wallet tidak tersedia'], 403);
            }

            if ($ctx['mode'] === 'toko') {
                return $this->getWalletToko($request, $response, $ctx['entity_id']);
            }

            return $this->getWalletSantri($request, $response, $ctx['entity_id']);
        } catch (\Throwable $e) {
            error_log('MybeddianCashlessController::getWallet ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat wallet'], 500);
        }
    }

    private function getWalletSantri(Request $request, Response $response, int $santriId): Response
    {
        $stmtSantri = $this->db->prepare('SELECT id, nis, nama FROM santri WHERE id = ? LIMIT 1');
        $stmtSantri->execute([$santriId]);
        $santri = $stmtSantri->fetch(\PDO::FETCH_ASSOC);
        if (!$santri) {
            return $this->json($response, ['success' => false, 'message' => 'Santri tidak ditemukan'], 404);
        }

        $stmtAcc = $this->db->prepare(
            "SELECT a.id, a.code, a.name, a.balance_cached, a.tanggal_update,
                    (SELECT COALESCE(MAX(j.id), 0)
                     FROM cashless___ledger_entries le
                     INNER JOIN cashless___journal j ON j.id = le.journal_id
                     WHERE le.account_id = a.id) AS last_journal_id,
                    (SELECT COUNT(*) FROM cashless___ledger_entries le2 WHERE le2.account_id = a.id) AS ledger_rows
             FROM cashless___accounts a
             WHERE a.entity_type = 'SANTRI' AND a.entity_id = ? LIMIT 1"
        );
        $stmtAcc->execute([$santriId]);
        $account = $stmtAcc->fetch(\PDO::FETCH_ASSOC);

        $reconcileInfo = null;
        if ($account) {
            $reconcile = new CashlessReconcileService($this->db);
            $reconcileInfo = $reconcile->reconcileAccount((int) $account['id']);
            if ($reconcileInfo['fixed'] ?? false) {
                $stmtAcc->execute([$santriId]);
                $account = $stmtAcc->fetch(\PDO::FETCH_ASSOC);
            }
        }

        $purchase = new CashlessPurchaseService($this->db);
        $pinStatus = $purchase->getSantriKartuPinStatus($santriId);
        $usersId = $this->resolveActorUserId($request);
        $hasPasskey = $usersId !== null && $usersId > 0 && $this->userHasPasskey($usersId);

        return $this->json($response, [
            'success' => true,
            'data' => [
                'mode' => 'santri',
                'santri_id' => $santriId,
                'nis' => $santri['nis'] ?? null,
                'nama' => $santri['nama'] ?? null,
                'has_wallet' => (bool) $account,
                'account' => $account ? [
                    'id' => (int) $account['id'],
                    'code' => $account['code'],
                    'name' => $account['name'],
                    'balance_cached' => (float) $account['balance_cached'],
                    'tanggal_update' => $account['tanggal_update'] ?? null,
                    'live_fingerprint' => $this->buildFingerprint($account),
                ] : null,
                'kartu' => [
                    'has_kartu' => (bool) ($pinStatus['has_kartu'] ?? false),
                    'kartu_id' => $pinStatus['kartu_id'] ?? null,
                    'has_pin' => (bool) ($pinStatus['has_pin'] ?? false),
                    'pin_updated_at' => $pinStatus['pin_updated_at'] ?? null,
                ],
                'has_passkey' => $hasPasskey,
                'batas_pin_belanja' => CashlessPurchaseService::getPinThreshold($this->db),
                'reconcile' => $reconcileInfo,
            ],
        ]);
    }

    private function getWalletToko(Request $request, Response $response, int $tokoId): Response
    {
        $stmtToko = $this->db->prepare(
            'SELECT id, nama_toko, kode_toko FROM cashless___pedagang WHERE id = ? LIMIT 1'
        );
        $stmtToko->execute([$tokoId]);
        $toko = $stmtToko->fetch(\PDO::FETCH_ASSOC);
        if (!$toko) {
            return $this->json($response, ['success' => false, 'message' => 'Toko tidak ditemukan'], 404);
        }

        $stmtAcc = $this->db->prepare(
            "SELECT a.id, a.code, a.name, a.balance_cached, a.tanggal_update,
                    (SELECT COALESCE(MAX(j.id), 0)
                     FROM cashless___ledger_entries le
                     INNER JOIN cashless___journal j ON j.id = le.journal_id
                     WHERE le.account_id = a.id) AS last_journal_id,
                    (SELECT COUNT(*) FROM cashless___ledger_entries le2 WHERE le2.account_id = a.id) AS ledger_rows
             FROM cashless___accounts a
             WHERE a.entity_type = 'PEDAGANG' AND a.entity_id = ? LIMIT 1"
        );
        $stmtAcc->execute([$tokoId]);
        $account = $stmtAcc->fetch(\PDO::FETCH_ASSOC);

        $reconcileInfo = null;
        if ($account) {
            $reconcile = new CashlessReconcileService($this->db);
            $reconcileInfo = $reconcile->reconcileAccount((int) $account['id']);
            if ($reconcileInfo['fixed'] ?? false) {
                $stmtAcc->execute([$tokoId]);
                $account = $stmtAcc->fetch(\PDO::FETCH_ASSOC);
            }
        }

        $usersId = $this->resolveActorUserId($request);
        $hasPasskey = $usersId !== null && $usersId > 0 && $this->userHasPasskey($usersId);

        return $this->json($response, [
            'success' => true,
            'data' => [
                'mode' => 'toko',
                'toko_id' => $tokoId,
                'pedagang_id' => $tokoId,
                'kode_toko' => $toko['kode_toko'] ?? null,
                'nama' => $toko['nama_toko'] ?? null,
                'has_wallet' => (bool) $account,
                'account' => $account ? [
                    'id' => (int) $account['id'],
                    'code' => $account['code'],
                    'name' => $account['name'],
                    'balance_cached' => (float) $account['balance_cached'],
                    'tanggal_update' => $account['tanggal_update'] ?? null,
                    'live_fingerprint' => $this->buildFingerprint($account),
                ] : null,
                'kartu' => [
                    'has_kartu' => false,
                    'kartu_id' => null,
                    'has_pin' => false,
                    'pin_updated_at' => null,
                ],
                'has_passkey' => $hasPasskey,
                'reconcile' => $reconcileInfo,
            ],
        ]);
    }

    /**
     * GET /api/mybeddian/v2/cashless/transactions?limit=
     */
    public function getTransactions(Request $request, Response $response): Response
    {
        try {
            $ctx = $this->resolveWalletContext($request);
            if ($ctx === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses wallet tidak tersedia'], 403);
            }

            $params = $request->getQueryParams();
            $limit = isset($params['limit']) ? (int) $params['limit'] : 50;

            $entityType = $ctx['mode'] === 'toko' ? 'PEDAGANG' : 'SANTRI';
            $stmtAcc = $this->db->prepare(
                'SELECT id FROM cashless___accounts WHERE entity_type = ? AND entity_id = ? LIMIT 1'
            );
            $stmtAcc->execute([$entityType, $ctx['entity_id']]);
            $accountId = (int) ($stmtAcc->fetchColumn() ?: 0);
            if ($accountId > 0) {
                $reconcile = new CashlessReconcileService($this->db);
                $reconcile->reconcileAccount($accountId);
            }

            $svc = new CashlessStatementService($this->db);
            $result = $ctx['mode'] === 'toko'
                ? $svc->listForPedagang($ctx['entity_id'], $limit)
                : $svc->listForSantri($ctx['entity_id'], $limit);
            return $this->json($response, $result, ($result['success'] ?? false) ? 200 : 400);
        } catch (\Throwable $e) {
            error_log('MybeddianCashlessController::getTransactions ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat riwayat transaksi'], 500);
        }
    }

    /**
     * GET /api/mybeddian/v2/cashless/transactions/{journalId}
     */
    public function getTransactionDetail(Request $request, Response $response, array $args): Response
    {
        try {
            $ctx = $this->resolveWalletContext($request);
            if ($ctx === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses wallet tidak tersedia'], 403);
            }
            $journalId = (int) ($args['journalId'] ?? $args['id'] ?? 0);
            $svc = new CashlessStatementService($this->db);
            $result = $ctx['mode'] === 'toko'
                ? $svc->detailForPedagang($ctx['entity_id'], $journalId)
                : $svc->detailForSantri($ctx['entity_id'], $journalId);
            $ok = (bool) ($result['success'] ?? false);
            $status = $ok ? 200 : (str_contains((string) ($result['message'] ?? ''), 'tidak ditemukan') ? 404 : 400);
            return $this->json($response, $result, $status);
        } catch (\Throwable $e) {
            error_log('MybeddianCashlessController::getTransactionDetail ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat detail transaksi'], 500);
        }
    }

    /**
     * GET /api/mybeddian/v2/cashless/live-state � polling ringan (tanpa rekonsiliasi penuh).
     */
    public function getLiveState(Request $request, Response $response): Response
    {
        try {
            $ctx = $this->resolveWalletContext($request);
            if ($ctx === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses wallet tidak tersedia'], 403);
            }

            $entityType = $ctx['mode'] === 'toko' ? 'PEDAGANG' : 'SANTRI';
            $stmtAcc = $this->db->prepare(
                "SELECT a.id, a.balance_cached, a.tanggal_update,
                        (SELECT COALESCE(MAX(j.id), 0)
                         FROM cashless___ledger_entries le
                         INNER JOIN cashless___journal j ON j.id = le.journal_id
                         WHERE le.account_id = a.id) AS last_journal_id,
                        (SELECT COUNT(*) FROM cashless___ledger_entries le2 WHERE le2.account_id = a.id) AS ledger_rows
                 FROM cashless___accounts a
                 WHERE a.entity_type = ? AND a.entity_id = ? LIMIT 1"
            );
            $stmtAcc->execute([$entityType, $ctx['entity_id']]);
            $account = $stmtAcc->fetch(\PDO::FETCH_ASSOC);

            if (!$account) {
                return $this->json($response, [
                    'success' => true,
                    'data' => [
                        'has_wallet' => false,
                        'fingerprint' => 'no-wallet',
                    ],
                ]);
            }

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'has_wallet' => true,
                    'account_id' => (int) $account['id'],
                    'balance_cached' => (float) $account['balance_cached'],
                    'tanggal_update' => $account['tanggal_update'] ?? null,
                    'last_journal_id' => (int) ($account['last_journal_id'] ?? 0),
                    'ledger_rows' => (int) ($account['ledger_rows'] ?? 0),
                    'fingerprint' => $this->buildFingerprint($account),
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('MybeddianCashlessController::getLiveState ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat status live'], 500);
        }
    }

    /**
     * GET /api/mybeddian/v2/cashless/kartu-pin
     */
    public function getKartuPin(Request $request, Response $response): Response
    {
        try {
            $santriId = $this->resolveSantriId($request);
            if ($santriId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk santri'], 403);
            }
            $purchase = new CashlessPurchaseService($this->db);
            $pinStatus = $purchase->getSantriKartuPinStatus($santriId);
            $usersId = $this->resolveActorUserId($request);
            $hasPasskey = $usersId !== null && $usersId > 0 && $this->userHasPasskey($usersId);

            return $this->json($response, [
                'success' => true,
                'data' => array_merge($pinStatus, [
                    'has_passkey' => $hasPasskey,
                    'batas_pin_belanja' => CashlessPurchaseService::getPinThreshold($this->db),
                ]),
            ]);
        } catch (\Throwable $e) {
            error_log('MybeddianCashlessController::getKartuPin ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat status PIN'], 500);
        }
    }

    /**
     * POST /api/mybeddian/v2/cashless/kartu-pin � atur PIN pertama.
     * Body: pin, pin_confirm, password? | webauthn_challenge_id + webauthn_credential
     */
    public function setKartuPin(Request $request, Response $response): Response
    {
        try {
            $santriId = $this->resolveSantriId($request);
            if ($santriId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk santri'], 403);
            }
            $usersId = $this->resolveActorUserId($request);
            if ($usersId === null || $usersId <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'Sesi tidak valid'], 401);
            }

            $raw = is_array($request->getParsedBody()) ? $request->getParsedBody() : [];
            $body = TextSanitizer::sanitizeStringValues($raw, ['pin', 'pin_confirm', 'password']);
            $pin = preg_replace('/\D/', '', (string) ($body['pin'] ?? ''));
            $pinConfirm = preg_replace('/\D/', '', (string) ($body['pin_confirm'] ?? $body['pin'] ?? ''));
            if (strlen($pin) !== CashlessPurchaseService::PIN_LENGTH) {
                return $this->json($response, ['success' => false, 'message' => 'PIN harus tepat 6 digit angka'], 400);
            }
            if ($pin !== $pinConfirm) {
                return $this->json($response, ['success' => false, 'message' => 'Konfirmasi PIN tidak cocok'], 400);
            }

            $auth = $this->assertStepUp($request, $usersId, $raw, $body);
            if (!($auth['success'] ?? false)) {
                return $this->json($response, $auth, (int) ($auth['http'] ?? 400));
            }

            $purchase = new CashlessPurchaseService($this->db);
            $status = $purchase->getSantriKartuPinStatus($santriId);
            if (!($status['has_kartu'] ?? false) || empty($status['kartu_id'])) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Kartu santri (CS) aktif belum ada. Hubungi petugas untuk mencetak/aktivasi kartu.',
                ], 400);
            }
            if ($status['has_pin'] ?? false) {
                return $this->json($response, [
                    'success' => false,
                    'code' => 'pin_already_set',
                    'message' => 'PIN sudah ada. Gunakan Ubah PIN.',
                ], 400);
            }

            $result = $purchase->setKartuPin((int) $status['kartu_id'], $pin);
            return $this->json($response, $result, ($result['success'] ?? false) ? 200 : 400);
        } catch (\Throwable $e) {
            error_log('MybeddianCashlessController::setKartuPin ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengatur PIN'], 500);
        }
    }

    /**
     * PUT /api/mybeddian/v2/cashless/kartu-pin � ubah PIN.
     * Body: old_pin, pin, pin_confirm, password? | webauthn...
     */
    public function changeKartuPin(Request $request, Response $response): Response
    {
        try {
            $santriId = $this->resolveSantriId($request);
            if ($santriId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk santri'], 403);
            }
            $usersId = $this->resolveActorUserId($request);
            if ($usersId === null || $usersId <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'Sesi tidak valid'], 401);
            }

            $raw = is_array($request->getParsedBody()) ? $request->getParsedBody() : [];
            $body = TextSanitizer::sanitizeStringValues($raw, ['old_pin', 'pin', 'pin_confirm', 'password']);
            $oldPin = preg_replace('/\D/', '', (string) ($body['old_pin'] ?? ''));
            $pin = preg_replace('/\D/', '', (string) ($body['pin'] ?? ''));
            $pinConfirm = preg_replace('/\D/', '', (string) ($body['pin_confirm'] ?? $body['pin'] ?? ''));
            if (strlen($oldPin) !== CashlessPurchaseService::PIN_LENGTH || strlen($pin) !== CashlessPurchaseService::PIN_LENGTH) {
                return $this->json($response, ['success' => false, 'message' => 'PIN harus tepat 6 digit angka'], 400);
            }
            if ($pin !== $pinConfirm) {
                return $this->json($response, ['success' => false, 'message' => 'Konfirmasi PIN tidak cocok'], 400);
            }

            $auth = $this->assertStepUp($request, $usersId, $raw, $body);
            if (!($auth['success'] ?? false)) {
                return $this->json($response, $auth, (int) ($auth['http'] ?? 400));
            }

            $purchase = new CashlessPurchaseService($this->db);
            $status = $purchase->getSantriKartuPinStatus($santriId);
            if (!($status['has_kartu'] ?? false) || empty($status['kartu_id'])) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Kartu santri (CS) aktif belum ada.',
                ], 400);
            }

            $result = $purchase->changeKartuPin((int) $status['kartu_id'], $oldPin, $pin);
            return $this->json($response, $result, ($result['success'] ?? false) ? 200 : 400);
        } catch (\Throwable $e) {
            error_log('MybeddianCashlessController::changeKartuPin ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengubah PIN'], 500);
        }
    }

    /**
     * GET /api/mybeddian/v2/cashless/wallet-lookup?code=&akses=
     */
    public function lookupWallet(Request $request, Response $response): Response
    {
        try {
            $ctx = $this->resolveWalletContext($request);
            if ($ctx === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses wallet tidak tersedia'], 403);
            }

            $params = $request->getQueryParams();
            $code = isset($params['code']) ? (string) $params['code'] : '';
            $excludeAccountId = $this->resolveWalletAccountId($ctx);
            $svc = new CashlessTopUpService($this->db);
            $result = $svc->lookupWalletByCode($code, $excludeAccountId);
            if (!($result['success'] ?? false)) {
                return $this->json($response, $result, 404);
            }

            $data = $result['data'] ?? [];
            return $this->json($response, [
                'success' => true,
                'data' => [
                    'code' => $data['code'] ?? null,
                    'nama' => $data['nama'] ?? null,
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('MybeddianCashlessController::lookupWallet ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mencari wallet'], 500);
        }
    }

    /**
     * POST /api/mybeddian/v2/cashless/transfer
     * Body: { dest_code, nominal, catatan?, akses? }
     */
    public function transfer(Request $request, Response $response): Response
    {
        try {
            $ctx = $this->resolveWalletContext($request);
            if ($ctx === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses wallet tidak tersedia'], 403);
            }

            $sourceAccountId = $this->resolveWalletAccountId($ctx);
            if ($sourceAccountId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Belum punya akun wallet'], 400);
            }

            $raw = is_array($request->getParsedBody()) ? $request->getParsedBody() : [];
            $body = TextSanitizer::sanitizeStringValues($raw, ['dest_code', 'catatan']);
            $destCode = preg_replace('/\D+/', '', (string) ($body['dest_code'] ?? $body['code'] ?? '')) ?? '';
            $nominal = isset($body['nominal']) ? (float) $body['nominal'] : 0.0;
            $catatan = isset($body['catatan']) ? trim((string) $body['catatan']) : null;
            if ($catatan === '') {
                $catatan = null;
            }

            $actorUserId = $this->resolveActorUserId($request);
            $limits = CashlessMoneyLimitsHelper::getLimits($this->db);
            $idemKey = CashlessMoneyLimitsHelper::resolveIdempotencyKey(
                isset($raw['idempotency_key']) ? (string) $raw['idempotency_key'] : (isset($body['idempotency_key']) ? (string) $body['idempotency_key'] : null),
                'TRANSFER',
                'from:' . $sourceAccountId . '|to:' . $destCode,
                $nominal,
                $actorUserId,
                $limits['duplicate_window_sec']
            );
            $claim = CashlessMoneyLimitsHelper::claimIdempotency($this->db, $idemKey, 'TRANSFER', $actorUserId);
            if (!($claim['claimed'] ?? false) && isset($claim['cached'])) {
                return $this->json($response, $claim['cached']['body'], (int) $claim['cached']['http']);
            }

            $svc = new CashlessTopUpService($this->db);
            $result = $svc->transferByWalletCodeFromAccount(
                $sourceAccountId,
                $destCode,
                $nominal,
                $catatan,
                $actorUserId
            );
            $ok = (bool) ($result['success'] ?? false);
            $status = $ok ? 200 : 400;
            $journalId = isset($result['data']['journal_id']) ? (int) $result['data']['journal_id'] : null;
            CashlessMoneyLimitsHelper::completeIdempotency($this->db, $idemKey, $result, $status, $journalId);
            return $this->json($response, $result, $status);
        } catch (\Throwable $e) {
            error_log('MybeddianCashlessController::transfer ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal transfer'], 500);
        }
    }

    /**
     * @param array{mode: 'santri'|'toko', entity_id: int} $ctx
     */
    private function resolveWalletAccountId(array $ctx): ?int
    {
        $entityType = $ctx['mode'] === 'toko' ? 'PEDAGANG' : 'SANTRI';
        $stmt = $this->db->prepare(
            "SELECT id FROM cashless___accounts
             WHERE entity_type = ? AND entity_id = ? AND type = 'LIABILITY'
             LIMIT 1"
        );
        $stmt->execute([$entityType, $ctx['entity_id']]);
        $id = $stmt->fetchColumn();
        return $id ? (int) $id : null;
    }

    /**
     * Verifikasi password akun atau passkey (WebAuthn reauth).
     *
     * @param array<string, mixed> $raw
     * @param array<string, mixed> $body
     * @return array{success: bool, message?: string, http?: int, code?: string}
     */
    private function assertStepUp(Request $request, int $usersId, array $raw, array $body): array
    {
        $challengeId = isset($raw['webauthn_challenge_id'])
            ? trim((string) $raw['webauthn_challenge_id'])
            : (isset($raw['challengeId']) ? trim((string) $raw['challengeId']) : '');
        $credential = $raw['webauthn_credential'] ?? $raw['credential'] ?? null;

        if ($challengeId !== '' && is_array($credential)) {
            $wa = new WebAuthnController();
            $verified = $wa->verifyReauthAssertion($request, $usersId, $challengeId, $credential);
            if (!($verified['success'] ?? false)) {
                return [
                    'success' => false,
                    'code' => $verified['code'] ?? 'webauthn_failed',
                    'message' => $verified['message'] ?? 'Verifikasi sidik jari / passkey gagal',
                    'http' => (int) ($verified['http'] ?? 401),
                ];
            }
            return ['success' => true];
        }

        $password = (string) ($body['password'] ?? '');
        if ($password === '') {
            return [
                'success' => false,
                'code' => 'auth_required',
                'message' => 'Masukkan password myBeddien atau verifikasi dengan sidik jari / passkey',
                'http' => 400,
            ];
        }

        $stmt = $this->db->prepare('SELECT password FROM users WHERE id = ? AND is_active = 1 LIMIT 1');
        $stmt->execute([$usersId]);
        $hash = $stmt->fetchColumn();
        if ($hash === false || $hash === null || $hash === '') {
            return [
                'success' => false,
                'message' => 'Akun belum punya password. Gunakan passkey atau atur password di Profil.',
                'http' => 400,
            ];
        }
        if (!PasswordHelper::verifyPassword($password, (string) $hash)) {
            return [
                'success' => false,
                'code' => 'password_invalid',
                'message' => 'Password myBeddien salah',
                'http' => 401,
            ];
        }
        if (PasswordHelper::shouldUpgradePassword((string) $hash)) {
            $newHash = PasswordHelper::hashPassword($password);
            $this->db->prepare('UPDATE users SET password = ? WHERE id = ?')->execute([$newHash, $usersId]);
        }

        return ['success' => true];
    }

    private function userHasPasskey(int $usersId): bool
    {
        $stmt = $this->db->prepare('SELECT 1 FROM user___webauthn WHERE users_id = ? LIMIT 1');
        $stmt->execute([$usersId]);
        return (bool) $stmt->fetchColumn();
    }

    /**
     * @param array<string, mixed>|null $account
     */
    private function buildFingerprint(?array $account): ?string
    {
        if (!$account) {
            return null;
        }
        $balance = sprintf('%.2f', (float) ($account['balance_cached'] ?? 0));
        $lastJournal = (int) ($account['last_journal_id'] ?? 0);
        $ledgerRows = (int) ($account['ledger_rows'] ?? 0);

        return $balance . '|' . $lastJournal . '|' . $ledgerRows;
    }
}
