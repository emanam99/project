<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Repositories\UsersWebAuthnCredentialRepository;
use App\Services\WebAuthnFactory;
use App\Helpers\TextSanitizer;
use Cose\Algorithms;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Symfony\Component\Uid\Uuid;
use Webauthn\AuthenticationExtensions\ExtensionOutputCheckerHandler;
use Webauthn\AuthenticatorAssertionResponse;
use Webauthn\AuthenticatorAssertionResponseValidator;
use Webauthn\AuthenticatorAttestationResponse;
use Webauthn\AuthenticatorAttestationResponseValidator;
use Webauthn\AuthenticatorSelectionCriteria;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialParameters;
use Webauthn\PublicKeyCredentialRequestOptions;
use Webauthn\PublicKeyCredentialRpEntity;
use Webauthn\PublicKeyCredentialUserEntity;
use Webauthn\TokenBinding\TokenBindingNotSupportedHandler;

final class WebAuthnController
{
    private \PDO $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function json(Response $response, array $data, int $status): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * web-auth/webauthn-lib v4 memakai sintaks PHP 8.1+ (readonly, dll.). Di PHP 8.0 autoload akan ParseError.
     */
    private function requirePhp81ForWebAuthn(Response $response): ?Response
    {
        if (\PHP_VERSION_ID >= 80100) {
            return null;
        }

        return $this->json($response, [
            'success' => false,
            'message' => 'Fitur passkey membutuhkan PHP 8.1 atau lebih baru di server (versi saat ini: ' . PHP_VERSION . '). Perbarui PHP di XAMPP/hosting, lalu coba lagi.',
            'data' => [
                'php_version' => PHP_VERSION,
                'requires_php' => '8.1',
            ],
        ], 503);
    }

    private function getClientIp(Request $request): string
    {
        $params = $request->getServerParams();
        if (!empty($params['HTTP_X_FORWARDED_FOR'])) {
            $ips = explode(',', $params['HTTP_X_FORWARDED_FOR']);

            return trim($ips[0]);
        }

        return $params['REMOTE_ADDR'] ?? 'unknown';
    }

    private function rpEntity(Request $request): PublicKeyCredentialRpEntity
    {
        $name = getenv('WEBAUTHN_RP_NAME') ? trim((string) getenv('WEBAUTHN_RP_NAME')) : 'eBeddien';
        $id = getenv('WEBAUTHN_RP_ID') ? trim((string) getenv('WEBAUTHN_RP_ID')) : null;
        if ($id === null || $id === '') {
            $host = $request->getUri()->getHost();
            $id = $host !== '' ? $host : 'localhost';
        }

        return PublicKeyCredentialRpEntity::create($name, $id);
    }

    /** @return string[] */
    private function securedRpIds(Request $request): array
    {
        $rp = $this->rpEntity($request);
        $id = $rp->getId();

        return $id !== null && $id !== '' ? [$id] : ['localhost'];
    }

    private function deleteExpiredChallenges(): void
    {
        $this->db->exec('DELETE FROM webauthn_challenges WHERE expires_at < NOW()');
    }

    private function getUsersIdFromJwt(Request $request): ?int
    {
        $payload = $request->getAttribute('user');
        if (!is_array($payload)) {
            return null;
        }
        if (isset($payload['users_id']) && (int) $payload['users_id'] > 0) {
            return (int) $payload['users_id'];
        }
        $userIdFromToken = (int) ($payload['user_id'] ?? 0);
        if ($userIdFromToken <= 0) {
            return null;
        }
        $stmt = $this->db->prepare('SELECT id_user FROM pengurus WHERE id = ? LIMIT 1');
        $stmt->execute([$userIdFromToken]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        return $row && !empty($row['id_user']) ? (int) $row['id_user'] : $userIdFromToken;
    }

    private function displayNameForUser(int $usersId, string $username): string
    {
        $stmt = $this->db->prepare('SELECT nama FROM pengurus WHERE id_user = ? LIMIT 1');
        $stmt->execute([$usersId]);
        $p = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($p && !empty($p['nama'])) {
            return (string) $p['nama'];
        }
        $stmt = $this->db->prepare('SELECT nama FROM santri WHERE id_user = ? LIMIT 1');
        $stmt->execute([$usersId]);
        $s = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($s && !empty($s['nama'])) {
            return (string) $s['nama'];
        }

        return $username;
    }

    /**
     * POST /api/v2/auth/webauthn/register/options — butuh JWT (sudah login password).
     */
    public function registerOptions(Request $request, Response $response): Response
    {
        try {
            $early = $this->requirePhp81ForWebAuthn($response);
            if ($early !== null) {
                return $early;
            }
            $this->deleteExpiredChallenges();
            $usersId = $this->getUsersIdFromJwt($request);
            if ($usersId === null || $usersId <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak terautentikasi'], 401);
            }

            $stmt = $this->db->prepare('SELECT id, username FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([$usersId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Pengguna tidak ditemukan'], 404);
            }

            $username = (string) $row['username'];
            $challenge = random_bytes(32);
            $challengeId = (string) Uuid::v4();

            $del = $this->db->prepare('DELETE FROM webauthn_challenges WHERE users_id = ? AND purpose = ?');
            $del->execute([$usersId, 'registration']);

            $ins = $this->db->prepare(
                'INSERT INTO webauthn_challenges (id, users_id, purpose, challenge, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))'
            );
            $ins->execute([$challengeId, $usersId, 'registration', $challenge]);

            $userHandle = UsersWebAuthnCredentialRepository::userHandleForUsersId($usersId);
            $userEntity = PublicKeyCredentialUserEntity::create(
                $username,
                $userHandle,
                $this->displayNameForUser($usersId, $username)
            );

            $pubKeyParams = [
                PublicKeyCredentialParameters::create('public-key', Algorithms::COSE_ALGORITHM_ES256),
            ];
            $rp = $this->rpEntity($request);
            $options = PublicKeyCredentialCreationOptions::create($rp, $userEntity, $challenge, $pubKeyParams)
                ->setAttestation(PublicKeyCredentialCreationOptions::ATTESTATION_CONVEYANCE_PREFERENCE_NONE)
                ->setTimeout(120000);

            $sel = AuthenticatorSelectionCriteria::create()
                ->setAuthenticatorAttachment(AuthenticatorSelectionCriteria::AUTHENTICATOR_ATTACHMENT_NO_PREFERENCE)
                ->setUserVerification(AuthenticatorSelectionCriteria::USER_VERIFICATION_REQUIREMENT_PREFERRED);
            $options = $options->setAuthenticatorSelection($sel);

            $repo = new UsersWebAuthnCredentialRepository($this->db);
            $existing = $repo->findAllForUserEntity($userEntity);
            $exclude = array_map(static fn ($s) => $s->getPublicKeyCredentialDescriptor(), $existing);
            if ($exclude !== []) {
                $options = $options->excludeCredentials(...$exclude);
            }

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'options' => $options,
                    'challengeId' => $challengeId,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('WebAuthnController::registerOptions ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal membuat opsi registrasi'], 500);
        }
    }

    /**
     * POST /api/v2/auth/webauthn/register/verify — butuh JWT.
     */
    public function registerVerify(Request $request, Response $response): Response
    {
        try {
            $early = $this->requirePhp81ForWebAuthn($response);
            if ($early !== null) {
                return $early;
            }
            $this->deleteExpiredChallenges();
            $usersId = $this->getUsersIdFromJwt($request);
            if ($usersId === null || $usersId <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak terautentikasi'], 401);
            }

            $body = $request->getParsedBody();
            $body = is_array($body) ? $body : [];
            $challengeId = isset($body['challengeId']) ? trim((string) $body['challengeId']) : '';
            $credential = $body['credential'] ?? null;
            if ($challengeId === '' || !is_array($credential)) {
                return $this->json($response, ['success' => false, 'message' => 'Data tidak lengkap'], 400);
            }

            $stmt = $this->db->prepare(
                'SELECT challenge FROM webauthn_challenges WHERE id = ? AND users_id = ? AND purpose = ? AND expires_at >= NOW() LIMIT 1'
            );
            $stmt->execute([$challengeId, $usersId, 'registration']);
            $chRow = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$chRow) {
                return $this->json($response, ['success' => false, 'message' => 'Challenge tidak valid atau kedaluwarsa'], 400);
            }
            $expectedChallenge = $chRow['challenge'];
            if (!is_string($expectedChallenge) || $expectedChallenge === '') {
                return $this->json($response, ['success' => false, 'message' => 'Challenge rusak'], 500);
            }

            $stmt = $this->db->prepare('SELECT username FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([$usersId]);
            $uRow = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$uRow) {
                return $this->json($response, ['success' => false, 'message' => 'Pengguna tidak ditemukan'], 404);
            }

            $userHandle = UsersWebAuthnCredentialRepository::userHandleForUsersId($usersId);
            $userEntity = PublicKeyCredentialUserEntity::create(
                (string) $uRow['username'],
                $userHandle,
                $this->displayNameForUser($usersId, (string) $uRow['username'])
            );
            $pubKeyParams = [
                PublicKeyCredentialParameters::create('public-key', Algorithms::COSE_ALGORITHM_ES256),
            ];
            $options = PublicKeyCredentialCreationOptions::create($this->rpEntity($request), $userEntity, $expectedChallenge, $pubKeyParams);

            $loader = WebAuthnFactory::createPublicKeyCredentialLoader();
            $pkc = $loader->loadArray($credential);
            $attResp = $pkc->getResponse();
            if (!$attResp instanceof AuthenticatorAttestationResponse) {
                return $this->json($response, ['success' => false, 'message' => 'Jenis respons tidak valid'], 400);
            }

            $repo = new UsersWebAuthnCredentialRepository($this->db);
            $csm = WebAuthnFactory::createAttestationStatementSupportManager();
            $validator = AuthenticatorAttestationResponseValidator::create(
                $csm,
                $repo,
                TokenBindingNotSupportedHandler::create(),
                ExtensionOutputCheckerHandler::create()
            );

            $source = $validator->check(
                $attResp,
                $options,
                $request,
                $this->securedRpIds($request)
            );

            $repo->saveNewCredentialForUser($usersId, $source);

            $credDbId = (int) $this->db->lastInsertId();

            $del = $this->db->prepare('DELETE FROM webauthn_challenges WHERE id = ?');
            $del->execute([$challengeId]);

            return $this->json($response, [
                'success' => true,
                'message' => 'Passkey berhasil didaftarkan',
                'data' => ['credential_db_id' => $credDbId],
            ], 200);
        } catch (\Throwable $e) {
            error_log('WebAuthnController::registerVerify ' . $e->getMessage());
            error_log($e->getTraceAsString());

            return $this->json($response, ['success' => false, 'message' => 'Verifikasi passkey gagal.'], 400);
        }
    }

    /**
     * POST /api/v2/auth/webauthn/login/options — publik (body: username).
     */
    public function loginOptions(Request $request, Response $response): Response
    {
        try {
            $early = $this->requirePhp81ForWebAuthn($response);
            if ($early !== null) {
                return $early;
            }
            $this->deleteExpiredChallenges();
            $body = $request->getParsedBody();
            $body = is_array($body) ? TextSanitizer::sanitizeStringValues($body, ['username']) : [];
            $username = trim((string) ($body['username'] ?? ''));
            if ($username === '') {
                return $this->json($response, ['success' => false, 'message' => 'Username harus diisi'], 400);
            }

            $stmt = $this->db->prepare(
                'SELECT u.id, u.username FROM users u WHERE u.username = ? AND u.is_active = 1 '
                . 'AND EXISTS (SELECT 1 FROM user___webauthn w WHERE w.users_id = u.id) LIMIT 1'
            );
            $stmt->execute([$username]);
            $user = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$user) {
                return $this->json($response, ['success' => false, 'message' => 'Passkey belum didaftarkan untuk akun ini'], 404);
            }

            $usersId = (int) $user['id'];
            $challenge = random_bytes(32);
            $challengeId = (string) Uuid::v4();

            $del = $this->db->prepare('DELETE FROM webauthn_challenges WHERE users_id = ? AND purpose = ?');
            $del->execute([$usersId, 'authentication']);

            $ins = $this->db->prepare(
                'INSERT INTO webauthn_challenges (id, users_id, purpose, challenge, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))'
            );
            $ins->execute([$challengeId, $usersId, 'authentication', $challenge]);

            $stmt = $this->db->prepare(
                'SELECT credential_json FROM user___webauthn WHERE users_id = ? ORDER BY id ASC'
            );
            $stmt->execute([$usersId]);
            $descriptors = [];
            while ($crow = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                if (empty($crow['credential_json'])) {
                    continue;
                }
                $srcData = json_decode((string) $crow['credential_json'], true, 512, JSON_THROW_ON_ERROR);
                $src = \Webauthn\PublicKeyCredentialSource::createFromArray($srcData);
                $descriptors[] = $src->getPublicKeyCredentialDescriptor();
            }
            if ($descriptors === []) {
                return $this->json($response, ['success' => false, 'message' => 'Data passkey tidak lengkap'], 500);
            }

            $req = PublicKeyCredentialRequestOptions::create($challenge)
                ->setRpId($this->rpEntity($request)->getId())
                ->setTimeout(120000)
                ->setUserVerification(PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_PREFERRED)
                ->allowCredentials(...$descriptors);

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'options' => $req,
                    'challengeId' => $challengeId,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('WebAuthnController::loginOptions ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal membuat opsi login passkey'], 500);
        }
    }

    /**
     * POST /api/v2/auth/webauthn/login/verify — publik.
     */
    public function loginVerify(Request $request, Response $response): Response
    {
        try {
            $early = $this->requirePhp81ForWebAuthn($response);
            if ($early !== null) {
                return $early;
            }
            $this->deleteExpiredChallenges();
            $body = $request->getParsedBody();
            $body = is_array($body) ? TextSanitizer::sanitizeStringValues($body, ['username']) : [];
            $username = trim((string) ($body['username'] ?? ''));
            $challengeId = isset($body['challengeId']) ? trim((string) $body['challengeId']) : '';
            $credential = $body['credential'] ?? null;
            if ($username === '' || $challengeId === '' || !is_array($credential)) {
                return $this->json($response, ['success' => false, 'message' => 'Data tidak lengkap'], 400);
            }

            $stmt = $this->db->prepare('SELECT id FROM users WHERE username = ? AND is_active = 1 LIMIT 1');
            $stmt->execute([$username]);
            $user = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$user) {
                return $this->json($response, ['success' => false, 'message' => 'Pengguna tidak ditemukan'], 401);
            }
            $usersId = (int) $user['id'];

            $stmt = $this->db->prepare(
                'SELECT challenge FROM webauthn_challenges WHERE id = ? AND users_id = ? AND purpose = ? AND expires_at >= NOW() LIMIT 1'
            );
            $stmt->execute([$challengeId, $usersId, 'authentication']);
            $chRow = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$chRow) {
                return $this->json($response, ['success' => false, 'message' => 'Challenge tidak valid atau kedaluwarsa'], 400);
            }
            $expectedChallenge = $chRow['challenge'];
            if (!is_string($expectedChallenge) || $expectedChallenge === '') {
                return $this->json($response, ['success' => false, 'message' => 'Challenge rusak'], 500);
            }

            $stmt = $this->db->prepare(
                'SELECT credential_json FROM user___webauthn WHERE users_id = ? ORDER BY id ASC'
            );
            $stmt->execute([$usersId]);
            $descriptors = [];
            while ($crow = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                if (empty($crow['credential_json'])) {
                    continue;
                }
                $srcData = json_decode((string) $crow['credential_json'], true, 512, JSON_THROW_ON_ERROR);
                $src = \Webauthn\PublicKeyCredentialSource::createFromArray($srcData);
                $descriptors[] = $src->getPublicKeyCredentialDescriptor();
            }
            if ($descriptors === []) {
                return $this->json($response, ['success' => false, 'message' => 'Passkey tidak ada'], 400);
            }

            $requestOptions = PublicKeyCredentialRequestOptions::create($expectedChallenge)
                ->setRpId($this->rpEntity($request)->getId())
                ->setTimeout(120000)
                ->setUserVerification(PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_PREFERRED)
                ->allowCredentials(...$descriptors);

            $loader = WebAuthnFactory::createPublicKeyCredentialLoader();
            $pkc = $loader->loadArray($credential);
            $assertResp = $pkc->getResponse();
            if (!$assertResp instanceof AuthenticatorAssertionResponse) {
                return $this->json($response, ['success' => false, 'message' => 'Jenis respons tidak valid'], 400);
            }

            $repo = new UsersWebAuthnCredentialRepository($this->db);
            $assertValidator = AuthenticatorAssertionResponseValidator::create(
                $repo,
                TokenBindingNotSupportedHandler::create(),
                ExtensionOutputCheckerHandler::create(),
                WebAuthnFactory::createCoseAlgorithmManager()
            );

            $userHandle = UsersWebAuthnCredentialRepository::userHandleForUsersId($usersId);
            $assertValidator->check(
                $pkc->getRawId(),
                $assertResp,
                $requestOptions,
                $request,
                $userHandle,
                $this->securedRpIds($request)
            );

            $del = $this->db->prepare('DELETE FROM webauthn_challenges WHERE id = ?');
            $del->execute([$challengeId]);

            $rawId = $pkc->getRawId();
            $stmtCred = $this->db->prepare('SELECT id FROM user___webauthn WHERE users_id = ? AND credential_id = ? LIMIT 1');
            $stmtCred->execute([$usersId, $rawId]);
            $credRow = $stmtCred->fetch(\PDO::FETCH_ASSOC);
            $credDbId = $credRow && isset($credRow['id']) ? (int) $credRow['id'] : null;

            $auth = new AuthControllerV2();

            return $auth->finalizeLoginForUserId(
                $request,
                $response,
                $usersId,
                null,
                $credDbId !== null ? ['credential_db_id' => $credDbId] : null
            );
        } catch (\Throwable $e) {
            error_log('WebAuthnController::loginVerify ' . $e->getMessage());
            error_log($e->getTraceAsString());

            return $this->json($response, ['success' => false, 'message' => 'Login passkey gagal'], 401);
        }
    }

    /**
     * GET /api/v2/auth/webauthn/status?username= — apakah user punya passkey (publik, untuk UI).
     */
    public function status(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $username = isset($params['username']) ? trim((string) $params['username']) : '';
            if ($username === '') {
                return $this->json($response, ['success' => false, 'message' => 'Parameter username wajib'], 400);
            }
            $stmt = $this->db->prepare(
                'SELECT u.id FROM users u WHERE u.username = ? AND u.is_active = 1 '
                . 'AND EXISTS (SELECT 1 FROM user___webauthn w WHERE w.users_id = u.id) LIMIT 1'
            );
            $stmt->execute([$username]);
            $ok = (bool) $stmt->fetch(\PDO::FETCH_ASSOC);

            return $this->json($response, ['success' => true, 'data' => ['webauthn_registered' => $ok]], 200);
        } catch (\Throwable $e) {
            return $this->json($response, ['success' => false, 'message' => 'Gagal'], 500);
        }
    }

    /**
     * GET /api/v2/auth/webauthn/credentials — daftar passkey (JWT).
     *
     * @return array<int, array<string, mixed>>
     */
    private function buildCredentialListForUser(int $usersId): array
    {
        $stmt = $this->db->prepare(
            'SELECT id, credential_json, created_at FROM user___webauthn WHERE users_id = ? ORDER BY id ASC'
        );
        $stmt->execute([$usersId]);
        $out = [];
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $transports = [];
            $json = $row['credential_json'] ?? '';
            if (is_string($json) && $json !== '') {
                try {
                    $decoded = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
                    if (isset($decoded['transports']) && is_array($decoded['transports'])) {
                        foreach ($decoded['transports'] as $t) {
                            $transports[] = (string) $t;
                        }
                    }
                } catch (\Throwable $e) {
                    $transports = [];
                }
            }
            $out[] = [
                'id' => (int) $row['id'],
                'created_at' => $row['created_at'] !== null ? (string) $row['created_at'] : null,
                'transports' => $transports,
            ];
        }

        return $out;
    }

    public function listCredentials(Request $request, Response $response): Response
    {
        try {
            $early = $this->requirePhp81ForWebAuthn($response);
            if ($early !== null) {
                return $early;
            }
            $usersId = $this->getUsersIdFromJwt($request);
            if ($usersId === null || $usersId <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak terautentikasi'], 401);
            }

            $items = $this->buildCredentialListForUser($usersId);

            return $this->json($response, ['success' => true, 'data' => ['credentials' => $items]], 200);
        } catch (\Throwable $e) {
            error_log('WebAuthnController::listCredentials ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat daftar passkey'], 500);
        }
    }

    /**
     * DELETE /api/v2/auth/webauthn/credentials/{id} — hapus satu passkey (JWT).
     */
    public function deleteCredential(Request $request, Response $response, array $args): Response
    {
        try {
            $early = $this->requirePhp81ForWebAuthn($response);
            if ($early !== null) {
                return $early;
            }
            $usersId = $this->getUsersIdFromJwt($request);
            if ($usersId === null || $usersId <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak terautentikasi'], 401);
            }

            $credId = (int) ($args['id'] ?? 0);
            if ($credId <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID passkey tidak valid'], 400);
            }

            $stmt = $this->db->prepare('DELETE FROM user___webauthn WHERE id = ? AND users_id = ?');
            $stmt->execute([$credId, $usersId]);
            if ($stmt->rowCount() === 0) {
                return $this->json($response, ['success' => false, 'message' => 'Passkey tidak ditemukan'], 404);
            }

            return $this->json($response, ['success' => true, 'message' => 'Passkey telah dihapus'], 200);
        } catch (\Throwable $e) {
            error_log('WebAuthnController::deleteCredential ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal menghapus passkey'], 500);
        }
    }
}
