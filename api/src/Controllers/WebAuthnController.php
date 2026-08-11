<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Repositories\UsersWebAuthnCredentialRepository;
use App\Services\WebAuthnFactory;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAgentHelper;
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

    /**
     * @return array{access_mybeddian_santri: int, access_mybeddian_toko: int, access_mybeddian_pjgt: int}
     */
    private function fetchPortalMybeddianFlags(int $usersId): array
    {
        try {
            $stmt = $this->db->prepare(
                'SELECT COALESCE(access_mybeddian_santri, 1) AS access_mybeddian_santri, '
                . 'COALESCE(access_mybeddian_toko, 1) AS access_mybeddian_toko, '
                . 'COALESCE(access_mybeddian_pjgt, 1) AS access_mybeddian_pjgt '
                . 'FROM users WHERE id = ? LIMIT 1'
            );
            $stmt->execute([$usersId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return ['access_mybeddian_santri' => 1, 'access_mybeddian_toko' => 1, 'access_mybeddian_pjgt' => 1];
            }

            return [
                'access_mybeddian_santri' => (int)($row['access_mybeddian_santri'] ?? 1),
                'access_mybeddian_toko' => (int)($row['access_mybeddian_toko'] ?? 1),
                'access_mybeddian_pjgt' => (int)($row['access_mybeddian_pjgt'] ?? 1),
            ];
        } catch (\Throwable $e) {
            return ['access_mybeddian_santri' => 1, 'access_mybeddian_toko' => 1, 'access_mybeddian_pjgt' => 1];
        }
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

    /** Host halaman SPA (Origin / Referer), bukan host API. */
    private function pageHostFromRequest(Request $request): string
    {
        $origin = trim($request->getHeaderLine('Origin'));
        if ($origin !== '') {
            $parsed = parse_url($origin);
            if (!empty($parsed['host'])) {
                return strtolower((string) $parsed['host']);
            }
        }
        $referer = trim($request->getHeaderLine('Referer'));
        if ($referer !== '') {
            $parsed = parse_url($referer);
            if (!empty($parsed['host'])) {
                return strtolower((string) $parsed['host']);
            }
        }

        return strtolower($request->getUri()->getHost());
    }

    /**
     * RP ID per portal: host halaman (Origin/Referer), mis. ebeddien.alutsmani.id vs mybeddien.alutsmani.id.
     * WEBAUTHN_RP_ID env hanya dipakai jika valid untuk host halaman (tidak dipaksakan lintas portal).
     */
    private function resolveRpId(Request $request): string
    {
        $pageHost = $this->pageHostFromRequest($request);
        if ($pageHost === 'localhost' || $pageHost === '127.0.0.1') {
            return $pageHost;
        }

        $configured = getenv('WEBAUTHN_RP_ID') ? trim((string) getenv('WEBAUTHN_RP_ID')) : '';
        if ($pageHost !== '') {
            if ($configured !== '' && ($pageHost === $configured || str_ends_with($pageHost, '.' . $configured))) {
                return $configured;
            }

            return $pageHost;
        }

        return $configured !== '' ? $configured : 'localhost';
    }

    private function rpEntity(Request $request): PublicKeyCredentialRpEntity
    {
        $nameEnv = getenv('WEBAUTHN_RP_NAME') ? trim((string) getenv('WEBAUTHN_RP_NAME')) : '';
        if ($nameEnv !== '') {
            $name = $nameEnv;
        } else {
            $host = $this->pageHostFromRequest($request);
            $name = (str_contains($host, 'mybeddian') || str_contains($host, 'mybeddien')) ? 'MyBeddian' : 'eBeddien';
        }

        return PublicKeyCredentialRpEntity::create($name, $this->resolveRpId($request));
    }

    /** @return PublicKeyCredentialParameters[] */
    private function defaultPublicKeyCredentialParameters(): array
    {
        return [
            PublicKeyCredentialParameters::create('public-key', Algorithms::COSE_ALGORITHM_ES256),
            PublicKeyCredentialParameters::create('public-key', Algorithms::COSE_ALGORITHM_RS256),
        ];
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

            $rp = $this->rpEntity($request);
            $options = PublicKeyCredentialCreationOptions::create($rp, $userEntity, $challenge, $this->defaultPublicKeyCredentialParameters())
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
            $options = PublicKeyCredentialCreationOptions::create(
                $this->rpEntity($request),
                $userEntity,
                $expectedChallenge,
                $this->defaultPublicKeyCredentialParameters()
            );

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
            $this->persistCredentialClientMeta($request, $credDbId);

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
            $rawBody = is_array($request->getParsedBody()) ? $request->getParsedBody() : [];
            $body = TextSanitizer::sanitizeStringValues($rawBody, ['username']);
            $username = trim((string) ($body['username'] ?? ''));
            if ($username === '') {
                return $this->json($response, ['success' => false, 'message' => 'Username harus diisi'], 400);
            }
            $mybeddianLogin = filter_var($rawBody['mybeddian_login'] ?? false, FILTER_VALIDATE_BOOLEAN);
            if (!$mybeddianLogin) {
                $clientApp = strtolower(trim($request->getHeaderLine('X-Client-App')));
                $mybeddianLogin = ($clientApp === 'mybeddien' || $clientApp === 'mybeddian');
            }
            $santriIdReq = isset($rawBody['santri_id']) ? (int) $rawBody['santri_id'] : 0;

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

            if ($mybeddianLogin) {
                $flags = $this->fetchPortalMybeddianFlags($usersId);
                if ((int)($flags['access_mybeddian_santri'] ?? 1) === 1) {
                    $stmtS = $this->db->prepare('SELECT id, nama, nis FROM santri WHERE id_user = ? ORDER BY id ASC');
                    $stmtS->execute([$usersId]);
                    /** @var array<int, array<string, mixed>> $santriRows */
                    $santriRows = $stmtS->fetchAll(\PDO::FETCH_ASSOC);
                    if (count($santriRows) > 1) {
                        $ids = [];
                        foreach ($santriRows as $r) {
                            $ids[] = (int) $r['id'];
                        }
                        $pickedOk = $santriIdReq > 0 && in_array($santriIdReq, $ids, true);
                        if (!$pickedOk) {
                            $options = [];
                            foreach ($santriRows as $r) {
                                $options[] = [
                                    'id' => (int) $r['id'],
                                    'nama' => (string) ($r['nama'] ?? ''),
                                    'nis' => $r['nis'] ?? null,
                                ];
                            }

                            return $this->json($response, [
                                'success' => false,
                                'message' => 'Akun ini terhubung ke lebih dari satu data santri. Pilih identitas untuk login passkey Mybeddian.',
                                'code' => 'SANTRI_CHOICE_REQUIRED',
                                'data' => ['santri_options' => $options],
                            ], 200);
                        }
                    }
                }
            }
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
            $rawBody = is_array($request->getParsedBody()) ? $request->getParsedBody() : [];
            $body = TextSanitizer::sanitizeStringValues($rawBody, ['username']);
            $username = trim((string) ($body['username'] ?? ''));
            $challengeId = isset($rawBody['challengeId']) ? trim((string) $rawBody['challengeId']) : '';
            $credential = $rawBody['credential'] ?? null;
            $mybeddianLogin = filter_var($rawBody['mybeddian_login'] ?? false, FILTER_VALIDATE_BOOLEAN);
            if (!$mybeddianLogin) {
                $clientApp = strtolower(trim($request->getHeaderLine('X-Client-App')));
                $mybeddianLogin = ($clientApp === 'mybeddien' || $clientApp === 'mybeddian');
            }
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
                $rawBody,
                $credDbId !== null ? ['credential_db_id' => $credDbId] : null,
                $mybeddianLogin
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
     * POST /api/v2/auth/webauthn/reauth/options — challenge verifikasi ulang (JWT).
     * Dipakai step-up (mis. ubah PIN kartu cashless).
     */
    public function reauthOptions(Request $request, Response $response): Response
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
                return $this->json($response, [
                    'success' => false,
                    'code' => 'no_passkey',
                    'message' => 'Passkey / sidik jari belum didaftarkan di Profil',
                ], 404);
            }

            $challenge = random_bytes(32);
            $challengeId = (string) Uuid::v4();

            $del = $this->db->prepare('DELETE FROM webauthn_challenges WHERE users_id = ? AND purpose = ?');
            $del->execute([$usersId, 'reauth']);

            $ins = $this->db->prepare(
                'INSERT INTO webauthn_challenges (id, users_id, purpose, challenge, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))'
            );
            $ins->execute([$challengeId, $usersId, 'reauth', $challenge]);

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
            error_log('WebAuthnController::reauthOptions ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal membuat opsi verifikasi passkey'], 500);
        }
    }

    /**
     * Verifikasi assertion reauth (dipanggil dari controller lain, bukan HTTP).
     *
     * @param array<string, mixed> $credential
     * @return array{success: bool, message?: string, code?: string, http?: int}
     */
    public function verifyReauthAssertion(Request $request, int $usersId, string $challengeId, array $credential): array
    {
        if (\PHP_VERSION_ID < 80100) {
            return [
                'success' => false,
                'code' => 'php_version',
                'message' => 'Server belum mendukung WebAuthn',
                'http' => 503,
            ];
        }
        if ($usersId <= 0 || $challengeId === '') {
            return ['success' => false, 'message' => 'Data verifikasi tidak lengkap', 'http' => 400];
        }

        try {
            $this->deleteExpiredChallenges();

            $stmt = $this->db->prepare(
                'SELECT challenge FROM webauthn_challenges WHERE id = ? AND users_id = ? AND purpose = ? AND expires_at >= NOW() LIMIT 1'
            );
            $stmt->execute([$challengeId, $usersId, 'reauth']);
            $chRow = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$chRow) {
                return [
                    'success' => false,
                    'code' => 'challenge_invalid',
                    'message' => 'Challenge passkey tidak valid atau kedaluwarsa',
                    'http' => 400,
                ];
            }
            $expectedChallenge = $chRow['challenge'];
            if (!is_string($expectedChallenge) || $expectedChallenge === '') {
                return ['success' => false, 'message' => 'Challenge rusak', 'http' => 500];
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
                return [
                    'success' => false,
                    'code' => 'no_passkey',
                    'message' => 'Passkey tidak ada',
                    'http' => 400,
                ];
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
                return ['success' => false, 'message' => 'Jenis respons tidak valid', 'http' => 400];
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

            return ['success' => true];
        } catch (\Throwable $e) {
            error_log('WebAuthnController::verifyReauthAssertion ' . $e->getMessage());

            return [
                'success' => false,
                'code' => 'webauthn_failed',
                'message' => 'Verifikasi sidik jari / passkey gagal',
                'http' => 401,
            ];
        }
    }

    /**
     * GET /api/v2/auth/webauthn/credentials — daftar passkey (JWT).
     *
     * @return array<int, array<string, mixed>>
     */
    private function buildCredentialListForUser(int $usersId): array
    {
        $hasMeta = $this->webauthnTableHasClientMeta();
        $cols = $hasMeta
            ? 'id, credential_json, created_at, device_type, browser_name, os_name, client_app'
            : 'id, credential_json, created_at';
        $stmt = $this->db->prepare(
            "SELECT {$cols} FROM user___webauthn WHERE users_id = ? ORDER BY id ASC"
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
            $item = [
                'id' => (int) $row['id'],
                'created_at' => $row['created_at'] !== null ? (string) $row['created_at'] : null,
                'transports' => $transports,
                'device_type' => null,
                'browser_name' => null,
                'os_name' => null,
                'client_app' => null,
            ];
            if ($hasMeta) {
                $item['device_type'] = isset($row['device_type']) && $row['device_type'] !== ''
                    ? (string) $row['device_type'] : null;
                $item['browser_name'] = isset($row['browser_name']) && $row['browser_name'] !== ''
                    ? (string) $row['browser_name'] : null;
                $item['os_name'] = isset($row['os_name']) && $row['os_name'] !== ''
                    ? (string) $row['os_name'] : null;
                $item['client_app'] = isset($row['client_app']) && $row['client_app'] !== ''
                    ? (string) $row['client_app'] : null;
            }
            $out[] = $item;
        }

        return $out;
    }

    private function webauthnTableHasClientMeta(): bool
    {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        try {
            $st = $this->db->query("SHOW COLUMNS FROM user___webauthn LIKE 'client_app'");
            $cached = (bool) ($st && $st->fetch(\PDO::FETCH_ASSOC));
        } catch (\Throwable $e) {
            $cached = false;
        }

        return $cached;
    }

    /**
     * Simpan meta perangkat/browser/app saat passkey baru didaftarkan.
     */
    private function persistCredentialClientMeta(Request $request, int $credentialDbId): void
    {
        if ($credentialDbId <= 0 || !$this->webauthnTableHasClientMeta()) {
            return;
        }

        $ua = trim((string) ($request->getHeaderLine('User-Agent') ?: ''));
        if (strlen($ua) > 500) {
            $ua = substr($ua, 0, 500);
        }
        $parsed = UserAgentHelper::parse($ua !== '' ? $ua : null);

        $clientApp = strtolower(trim((string) ($request->getHeaderLine('X-Client-App') ?: '')));
        if (!in_array($clientApp, ['ebeddien', 'mybeddien'], true)) {
            $clientApp = null;
        }

        $upd = $this->db->prepare(
            'UPDATE user___webauthn
             SET device_type = ?, browser_name = ?, os_name = ?, client_app = ?, user_agent = ?
             WHERE id = ?'
        );
        $upd->execute([
            $parsed['device_type'] ?? null,
            $parsed['browser_name'] ?? null,
            $parsed['os_name'] ?? null,
            $clientApp,
            $ua !== '' ? $ua : null,
            $credentialDbId,
        ]);
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
