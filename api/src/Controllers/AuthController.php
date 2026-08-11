<?php

namespace App\Controllers;

use App\Database;
use App\Auth\JwtAuth;
use App\Auth\PasswordHelper;
use App\Helpers\LoginSuspiciousHelper;
use App\Helpers\TextSanitizer;
use App\Helpers\RoleHelper;
use App\Helpers\NikHelper;
use App\Services\WhatsAppService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AuthController
{
    private $db = null;
    private $jwt = null;

    public function __construct()
    {
        // DB dan JWT di-inisialisasi lazy agar endpoint csrf-token/verify tidak 500 saat DB down
    }

    private function getDb(): \PDO
    {
        if ($this->db === null) {
            $this->db = Database::getInstance()->getConnection();
        }
        return $this->db;
    }

    private function getJwt(): JwtAuth
    {
        if ($this->jwt === null) {
            $this->jwt = new JwtAuth();
        }
        return $this->jwt;
    }

    public function login(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, ['id', 'username', 'role_key', 'nik']) : [];

            // CATATAN: log "Parsed body" + content-type sebelumnya membocorkan
            // password plaintext ke api/error.log. Dihapus per audit Mei 2026.
            
            // Validasi input
            $id = $data['id'] ?? '';
            $password = $data['password'] ?? '';

            if (empty($id) || empty($password)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID dan password harus diisi'
                ], 400);
            }

            // Query user dari database - password di tabel users (kolom pw/level sudah dihapus dari pengurus)
            $stmt = $this->getDb()->prepare("SELECT p.id, p.nama, p.status, p.id_user, u.password FROM pengurus p LEFT JOIN users u ON u.id = p.id_user WHERE p.id = ?");
            $stmt->execute([$id]);
            $user = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$user) {
                $ip = $this->getClientIp($request);
                LoginSuspiciousHelper::notifyIfThirdFailure($this->getDb(), $ip, LoginSuspiciousHelper::ENDPOINT_V1, (string) $id);
                error_log("Login failed: User not found - ID: $id");
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID atau password salah'
                ], 401);
            }

            // Cek status user
            if (isset($user['status']) && strtolower($user['status']) !== 'aktif' && strtolower($user['status']) !== 'active') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Akun Anda tidak aktif'
                ], 403);
            }

            // Harus punya akun users (id_user) untuk login
            if (empty($user['id_user'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Belum mengaktifkan aplikasi. Silakan daftar/aktivasi akun terlebih dahulu.'
                ], 403);
            }

            $userId = (int) $user['id_user'];
            $storedPassword = $user['password'] ?? null;

            // Handle password kosong (set password baru - first time setup)
            if ($storedPassword === null || $storedPassword === '') {
                $newHash = PasswordHelper::hashPassword($password);
                $updateStmt = $this->getDb()->prepare("UPDATE users SET password = ? WHERE id = ?");
                $updateStmt->execute([$newHash, $userId]);
                error_log("Password set for new user - ID: $id (users.id: $userId)");
                $storedPassword = $newHash;
            }

            // Verify password
            if (!PasswordHelper::verifyPassword($password, $storedPassword)) {
                $ip = $this->getClientIp($request);
                LoginSuspiciousHelper::notifyIfThirdFailure($this->getDb(), $ip, LoginSuspiciousHelper::ENDPOINT_V1, (string) $id);
                error_log("Login failed: Invalid password for ID: $id");
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID atau password salah'
                ], 401);
            }

            // Upgrade password jika masih menggunakan SHA256
            if (PasswordHelper::shouldUpgradePassword($storedPassword)) {
                $newHash = PasswordHelper::hashPassword($password);
                $this->getDb()->prepare("UPDATE users SET password = ? WHERE id = ?")->execute([$newHash, $userId]);
                error_log("Password upgraded to bcrypt for user ID: $id");
            }

            // Ambil role dari database (dengan error handling)
            try {
                $roleInfo = RoleHelper::getRoleInfoForToken($user['id']);
                
                // Semua role (unik, urutan stabil) — hak akses gabungan, tidak tergantung urutan di DB
                $allRoleKeys = RoleHelper::getAllRoleKeysNormalizedForPengurus((int) $user['id']);
                
                // Log untuk debugging
                error_log("AuthController::login - Role info retrieved: " . json_encode([
                    'role_key' => $roleInfo['role_key'] ?? 'null',
                    'all_role_keys' => $allRoleKeys,
                    'allowed_apps' => $roleInfo['allowed_apps'] ?? []
                ]));
                
                // Jika role_key null atau kosong, log warning
                if (empty($roleInfo['role_key'])) {
                    error_log("AuthController::login - WARNING: role_key is empty for user ID: {$user['id']}. User mungkin belum memiliki role di tabel pengurus___role.");
                }
            } catch (\Exception $e) {
                error_log("Error getting role info: " . $e->getMessage());
                error_log("Error stack trace: " . $e->getTraceAsString());
                // Fallback jika ada error mengambil role
                $roleInfo = [
                    'role_key' => 'user',
                    'role_label' => 'User',
                    'allowed_apps' => [],
                    'permissions' => [],
                    'lembaga_id' => null,
                    'lembaga_scope_all' => false,
                    'lembaga_ids' => [],
                ];
                $allRoleKeys = ['user'];
            }
            
            // Generate JWT token dengan informasi role lengkap
            $isRealSuperAdmin = RoleHelper::pengurusHasSuperAdminRole((int) $user['id']);
            $tokenPayload = [
                'user_id' => $user['id'],
                'user_name' => $user['nama'],
                'user_role' => $roleInfo['role_key'] ?? 'user',
                'role_key' => $roleInfo['role_key'] ?? 'user',
                'role_label' => $roleInfo['role_label'] ?? 'User',
                'all_roles' => $allRoleKeys ?? [], // Array semua role keys user
                'allowed_apps' => $roleInfo['allowed_apps'] ?? [],
                'permissions' => $roleInfo['permissions'] ?? [],
                'lembaga_id' => $roleInfo['lembaga_id'] ?? null,
                'lembaga_scope_all' => (bool)($roleInfo['lembaga_scope_all'] ?? false),
                'lembaga_ids' => $roleInfo['lembaga_ids'] ?? [],
                'is_real_super_admin' => $isRealSuperAdmin,
            ];

            $token = $this->getJwt()->generateToken($tokenPayload);

            // Log successful login (tanpa nama)
            error_log('Login successful for pengurus_id=' . (int) $user['id'] . ', role=' . ($roleInfo['role_key'] ?? ''));

            // Pastikan allowed_apps selalu array (tidak null)
            $allowedApps = $roleInfo['allowed_apps'] ?? [];
            if (!is_array($allowedApps)) {
                $allowedApps = [];
            }
            
            // Return success response
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Login berhasil',
                'data' => [
                    'token' => $token,
                    'user' => [
                        'id' => $user['id'],
                        'nama' => $user['nama'],
                        'role_key' => $roleInfo['role_key'] ?? 'user',
                        'role_label' => $roleInfo['role_label'] ?? 'User',
                        'all_roles' => $allRoleKeys ?? [],
                        'allowed_apps' => $allowedApps,
                        'permissions' => $roleInfo['permissions'] ?? [],
                        'lembaga_id' => $roleInfo['lembaga_id'] ?? null,
                        'lembaga_scope_all' => (bool)($roleInfo['lembaga_scope_all'] ?? false),
                        'lembaga_ids' => $roleInfo['lembaga_ids'] ?? [],
                        'level' => $roleInfo['role_key'] ?? 'user',
                        'is_real_super_admin' => $isRealSuperAdmin,
                    ],
                    'redirect_url' => '/'
                ]
            ], 200);

        } catch (\Exception $e) {
            error_log("Login error: " . $e->getMessage());
            error_log("Stack trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat login'
            ], 500);
        }
    }

    public function verify(Request $request, Response $response): Response
    {
        try {
            $authHeader = $request->getHeaderLine('Authorization');
            
            if (empty($authHeader) || !preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Token tidak ditemukan'
                ], 401);
            }

            $token = $matches[1];
            $payload = $this->getJwt()->validateToken($token);

            if (!$payload) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Token tidak valid'
                ], 401);
            }

            // Ambil user ID dari payload
            $userId = $payload['user_id'] ?? $payload['id'] ?? null;
            $payloadArr = is_array($payload) ? $payload : [];
            $isSantriDaftar = RoleHelper::tokenIsSantriDaftarContext($payloadArr);

            if ($userId) {
                if ($isSantriDaftar) {
                    // Konteks login NIK / aplikasi daftar: jangan refresh role sebagai pengurus (user_id = santri.id)
                    $payload['is_real_super_admin'] = false;
                    try {
                        $sid = (int) $userId;
                        $stmt = $this->getDb()->prepare('SELECT nis FROM santri WHERE id = ? LIMIT 1');
                        $stmt->execute([$sid]);
                        $sr = $stmt->fetch(\PDO::FETCH_ASSOC);
                        $payload['nis'] = ($sr && isset($sr['nis']) && trim((string) $sr['nis']) !== '') ? (string) $sr['nis'] : null;
                        $payload['id_registrasi'] = $this->findPsbRegistrasiIdForSantriTahunAktif($sid);
                    } catch (\Exception $e) {
                        error_log('AuthController::verify santri enrich: ' . $e->getMessage());
                    }
                } else {
                    // Refresh role info dari database untuk mendapatkan all_roles terbaru
                    try {
                        $roleInfo = RoleHelper::getRoleInfoForToken((int) $userId);
                        $allRoleKeys = RoleHelper::getAllRoleKeysNormalizedForPengurus((int) $userId);

                        // Update payload dengan data terbaru
                        $payload['role_key'] = $roleInfo['role_key'] ?? $payload['role_key'] ?? 'user';
                        $payload['role_label'] = $roleInfo['role_label'] ?? $payload['role_label'] ?? 'User';
                        $payload['all_roles'] = $allRoleKeys ?? [];
                        $payload['allowed_apps'] = $roleInfo['allowed_apps'] ?? [];
                        $payload['permissions'] = $roleInfo['permissions'] ?? [];
                        $payload['lembaga_id'] = $roleInfo['lembaga_id'] ?? null;
                        $payload['lembaga_scope_all'] = (bool) ($roleInfo['lembaga_scope_all'] ?? false);
                        $payload['lembaga_ids'] = $roleInfo['lembaga_ids'] ?? [];
                        $payload['is_real_super_admin'] = RoleHelper::pengurusHasSuperAdminRole((int) $userId);
                    } catch (\Exception $e) {
                        error_log("Error refreshing role info in verify: " . $e->getMessage());
                        // Continue with existing payload if refresh fails
                    }
                    // NIP dan id_pengurus dari tabel pengurus (user_id di token = pengurus.id untuk role pengurus)
                    try {
                        $stmt = $this->getDb()->prepare("SELECT id, nip FROM pengurus WHERE id = ? LIMIT 1");
                        $stmt->execute([$userId]);
                        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                        if ($row && !empty($row['id'])) {
                            $payload['id_pengurus'] = (int) $row['id'];
                            if (isset($row['nip']) && trim((string) $row['nip']) !== '') {
                                $payload['pengurus'] = ['nip' => (string) $row['nip']];
                            }
                        }
                    } catch (\Exception $e) {
                        // ignore
                    }
                    // Email & verifikasi: ambil dari users.id = JWT users_id (sama dengan postVerifyEmail).
                    // Jangan hanya INNER JOIN pengurus↔users — bila id_user pengurus kosong/salah, status verifikasi tidak ikut ke klien.
                    try {
                        $usersFk = isset($payload['users_id']) ? (int) $payload['users_id'] : 0;
                        if ($usersFk <= 0 && $userId) {
                            $stmtPid = $this->getDb()->prepare('SELECT id_user FROM pengurus WHERE id = ? LIMIT 1');
                            $stmtPid->execute([(int) $userId]);
                            $pu = $stmtPid->fetch(\PDO::FETCH_ASSOC);
                            if ($pu && isset($pu['id_user']) && (int) $pu['id_user'] > 0) {
                                $usersFk = (int) $pu['id_user'];
                            }
                        }
                        if ($usersFk > 0) {
                            $stmtUe = $this->getDb()->prepare(
                                'SELECT email, email_verified_at, email_reminder_snoozed_until FROM users WHERE id = ? LIMIT 1'
                            );
                            $stmtUe->execute([$usersFk]);
                            $uer = $stmtUe->fetch(\PDO::FETCH_ASSOC);
                            if ($uer) {
                                $payload['email'] = trim((string) ($uer['email'] ?? ''));
                                $ev = $uer['email_verified_at'] ?? null;
                                if ($ev !== null && $ev !== '') {
                                    $evs = trim((string) $ev);
                                    if ($evs === '' || str_starts_with($evs, '0000-00-00')) {
                                        $ev = null;
                                    } else {
                                        $ev = $evs;
                                    }
                                } else {
                                    $ev = null;
                                }
                                $payload['email_verified_at'] = $ev;
                                $payload['email_reminder_snoozed_until'] = $uer['email_reminder_snoozed_until'] ?? null;
                            }
                        }
                    } catch (\Exception $e) {
                        error_log('AuthController::verify email fields: ' . $e->getMessage());
                    }
                }
            }

            if (!isset($payload['is_real_super_admin']) && $userId && !$isSantriDaftar) {
                try {
                    $payload['is_real_super_admin'] = RoleHelper::pengurusHasSuperAdminRole((int) $userId);
                } catch (\Exception $e) {
                    $payload['is_real_super_admin'] = false;
                }
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $payload
            ], 200);

        } catch (\Exception $e) {
            error_log("Token verification error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat verifikasi token'
            ], 500);
        }
    }

    public function getCsrfToken(Request $request, Response $response): Response
    {
        try {
            $token = \App\Middleware\CsrfMiddleware::getToken();
            
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'token' => $token,
                    'header_name' => 'X-CSRF-Token'
                ]
            ], 200);
        } catch (\Exception $e) {
            error_log("CSRF token generation error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghasilkan CSRF token'
            ], 500);
        }
    }

    /**
     * psb___registrasi.id untuk santri pada tahun ajaran aktif (psb___pengaturan), atau null.
     * Pencocokan tahun = / LIKE prefix (selaras get-registrasi / login flow).
     */
    private function findPsbRegistrasiIdForSantriTahunAktif(int $idSantri): ?int
    {
        try {
            $tahunHijriyah = null;
            $tahunMasehi = null;
            $stmtPeng = $this->getDb()->query("SELECT `key`, value FROM psb___pengaturan WHERE `key` IN ('tahun_hijriyah', 'tahun_masehi')");
            if ($stmtPeng) {
                while ($row = $stmtPeng->fetch(\PDO::FETCH_ASSOC)) {
                    $val = isset($row['value']) ? trim((string) $row['value']) : '';
                    if ($row['key'] === 'tahun_hijriyah' && $val !== '') {
                        $tahunHijriyah = $val;
                    }
                    if ($row['key'] === 'tahun_masehi' && $val !== '') {
                        $tahunMasehi = $val;
                    }
                }
            }
            if ($tahunHijriyah === null || $tahunHijriyah === '' || $tahunMasehi === null || $tahunMasehi === '') {
                return null;
            }
            $normHijriyah = trim(explode('-', $tahunHijriyah)[0] ?? $tahunHijriyah);
            $normMasehi = trim(explode('-', $tahunMasehi)[0] ?? $tahunMasehi);
            if ($normHijriyah === '' || $normMasehi === '') {
                return null;
            }
            $stmtReg = $this->getDb()->prepare(
                'SELECT id FROM psb___registrasi WHERE id_santri = ? ' .
                'AND (tahun_hijriyah = ? OR tahun_hijriyah LIKE ?) ' .
                'AND (tahun_masehi = ? OR tahun_masehi LIKE ?) LIMIT 1'
            );
            $stmtReg->execute([$idSantri, $normHijriyah, $normHijriyah . '%', $normMasehi, $normMasehi . '%']);
            $rowReg = $stmtReg->fetch(\PDO::FETCH_ASSOC);
            if ($rowReg !== false && isset($rowReg['id'])) {
                return (int) $rowReg['id'];
            }
        } catch (\Throwable $e) {
            error_log('AuthController::findPsbRegistrasiIdForSantriTahunAktif: ' . $e->getMessage());
        }

        return null;
    }

    /**
     * Catat nomor WA form + pengirim token ke baris psb___registrasi (acuan pendaftar).
     */
    private function persistWaToPsbRegistrasi(int $idRegistrasi, string $noWaTercatat, string $noWaPengirim): void
    {
        if ($idRegistrasi <= 0) {
            return;
        }
        try {
            $db = $this->getDb();
            $cols = $db->query("SHOW COLUMNS FROM psb___registrasi LIKE 'no_wa_tercatat'");
            if (!$cols || $cols->rowCount() === 0) {
                return;
            }
            $stmt = $db->prepare(
                'UPDATE psb___registrasi SET
                    no_wa_tercatat = COALESCE(NULLIF(?, \'\'), no_wa_tercatat),
                    no_wa_pengirim = COALESCE(NULLIF(?, \'\'), no_wa_pengirim)
                 WHERE id = ?'
            );
            $stmt->execute([$noWaTercatat, $noWaPengirim, $idRegistrasi]);
        } catch (\Throwable $e) {
            error_log('AuthController::persistWaToPsbRegistrasi: ' . $e->getMessage());
        }
    }

    /**
     * Login dengan NIK untuk aplikasi pendaftaran.
     * NIK baru → JWT langsung.
     * NIK sudah ada → wajib tanggal_lahir + nama ibu (santri.ibu) cocok.
     * POST /api/auth/login-nik  Body: { nik, tanggal_lahir?, nama_ibu? | ibu? }
     */
    public function loginNik(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data)
                ? TextSanitizer::sanitizeStringValues($data, ['nik', 'tanggal_lahir', 'nama_ibu', 'ibu'])
                : [];

            $nikRaw = (string) ($data['nik'] ?? '');
            $nikCheck = NikHelper::validate($nikRaw);
            if (!$nikCheck['valid'] || $nikCheck['normalized'] === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => $nikCheck['message'] !== '' ? $nikCheck['message'] : 'NIK harus terdiri dari 16 angka',
                ], 400);
            }
            $nik = $nikCheck['normalized'];

            $stmt = $this->getDb()->prepare(
                'SELECT id, nama, nik, nis, gender, tempat_lahir, tanggal_lahir, ibu FROM santri WHERE nik = ? LIMIT 1'
            );
            $stmt->execute([$nik]);
            $santri = $stmt->fetch(\PDO::FETCH_ASSOC);

            $isNewSantri = false;
            if (!$santri) {
                $isNewSantri = true;
                $santri = [
                    'id' => null,
                    'nama' => '',
                    'nik' => $nik,
                    'nis' => null,
                    'gender' => null,
                    'tempat_lahir' => null,
                    'tanggal_lahir' => null,
                    'ibu' => null,
                ];
            } else {
                $dbTtl = $this->normalizeDateYmd((string) ($santri['tanggal_lahir'] ?? ''));
                $dbIbu = $this->normalizePersonName((string) ($santri['ibu'] ?? ''));
                if ($dbTtl === null || $dbIbu === '') {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Data tanggal lahir / nama ibu di sistem belum lengkap. Hubungi admin lewat WhatsApp untuk bantuan pendaftaran.',
                        'code' => 'need_help',
                    ], 403);
                }
                $inputTtl = $this->normalizeDateYmd((string) ($data['tanggal_lahir'] ?? ''));
                if ($inputTtl === null) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Tanggal lahir wajib diisi (format YYYY-MM-DD)',
                        'code' => 'ttl_required',
                    ], 400);
                }
                $inputIbuRaw = (string) ($data['nama_ibu'] ?? $data['ibu'] ?? '');
                $inputIbu = $this->normalizePersonName($inputIbuRaw);
                if ($inputIbu === '') {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Nama ibu wajib diisi',
                        'code' => 'ibu_required',
                    ], 400);
                }
                if ($inputTtl !== $dbTtl || $inputIbu !== $dbIbu) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'NIK, tanggal lahir, atau nama ibu tidak cocok. Hubungi admin lewat WhatsApp untuk bantuan pendaftaran.',
                        'code' => 'verify_mismatch',
                    ], 401);
                }
            }

            $showPilihanStatus = true;
            $idRegistrasiLogin = null;
            if (!$isNewSantri && !empty($santri['id'])) {
                $idRegTahun = $this->findPsbRegistrasiIdForSantriTahunAktif((int) $santri['id']);
                if ($idRegTahun !== null) {
                    $showPilihanStatus = false;
                    $idRegistrasiLogin = $idRegTahun;
                }
            }

            $redirectUrl = $showPilihanStatus ? '/pilihan-status' : '/dashboard';
            $nisLogin = isset($santri['nis']) && trim((string) $santri['nis']) !== ''
                ? trim((string) $santri['nis'])
                : null;

            $tokenPayload = [
                'user_id' => $santri['id'],
                'user_name' => $santri['nama'] ?: '',
                'nik' => $santri['nik'],
                'nis' => $nisLogin,
                'id_registrasi' => $idRegistrasiLogin,
                'role_key' => 'santri',
                'role_label' => 'Santri',
                'allowed_apps' => ['daftar'],
                'permissions' => [],
                'lembaga_id' => null,
            ];
            $token = $this->getJwt()->generateToken($tokenPayload);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $isNewSantri ? 'NIK baru, silakan isi formulir pendaftaran' : 'Login berhasil',
                'data' => [
                    'token' => $token,
                    'user' => [
                        'id' => $santri['id'],
                        'nama' => $santri['nama'] ?: '',
                        'nik' => $santri['nik'],
                        'nis' => $nisLogin,
                        'id_registrasi' => $idRegistrasiLogin,
                        'gender' => $santri['gender'] ?? null,
                        'tempat_lahir' => $santri['tempat_lahir'] ?? null,
                        'tanggal_lahir' => $santri['tanggal_lahir'] ?? null,
                        'role_key' => 'santri',
                        'role_label' => 'Santri',
                        'allowed_apps' => ['daftar'],
                        'permissions' => [],
                    ],
                    'redirect_url' => $redirectUrl,
                    'show_pilihan_status' => $showPilihanStatus,
                    'is_new' => $isNewSantri,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('Login NIK error: ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat login',
            ], 500);
        }
    }

    /** Normalisasi tanggal lahir input/DB ke Y-m-d, atau null jika tidak valid. */
    private function normalizeDateYmd(string $raw): ?string
    {
        $raw = trim($raw);
        if ($raw === '' || $raw === '0000-00-00' || str_starts_with($raw, '0000-00-00')) {
            return null;
        }
        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $raw, $m)) {
            $y = (int) $m[1];
            $mo = (int) $m[2];
            $d = (int) $m[3];
            if ($y >= 1900 && checkdate($mo, $d, $y)) {
                return sprintf('%04d-%02d-%02d', $y, $mo, $d);
            }
            return null;
        }
        if (preg_match('/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/', $raw, $m)) {
            $d = (int) $m[1];
            $mo = (int) $m[2];
            $y = (int) $m[3];
            if ($y >= 1900 && checkdate($mo, $d, $y)) {
                return sprintf('%04d-%02d-%02d', $y, $mo, $d);
            }
            return null;
        }
        $ts = strtotime($raw);
        if ($ts === false) {
            return null;
        }
        return date('Y-m-d', $ts);
    }

    /** Normalisasi nama orang untuk perbandingan (case/spasi/tanda baca). */
    private function normalizePersonName(string $raw): string
    {
        $s = mb_strtolower(trim($raw), 'UTF-8');
        if ($s === '' || $s === 'array') {
            return '';
        }
        $s = preg_replace('/[^\p{L}\p{N}\s]/u', ' ', $s) ?? '';
        $s = preg_replace('/\s+/u', ' ', $s) ?? '';
        return trim($s);
    }

    /**
     * POST /api/auth/daftar-wa-prepare
     * Body: { nik, no_wa } → token sekali pakai + teks/URL wa.me (user kirim manual ke nomor pesantren).
     */
    public function prepareDaftarWa(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, ['nik', 'no_wa']) : [];
            $nikRaw = (string) ($data['nik'] ?? '');
            $nikCheck = NikHelper::validate($nikRaw);
            if (!$nikCheck['valid'] || $nikCheck['normalized'] === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'NIK tidak valid',
                ], 400);
            }
            $nik = $nikCheck['normalized'];
            $noWa = WhatsAppService::formatPhoneNumber((string) ($data['no_wa'] ?? ''));
            if (strlen($noWa) < 10 || strlen($noWa) > 16) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nomor WhatsApp tidak valid',
                ], 400);
            }

            $db = $this->getDb();
            if ($db->query("SHOW TABLES LIKE 'daftar_santri_wa_tokens'")->rowCount() === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Fitur verifikasi WA belum siap (migrasi belum dijalankan)',
                ], 503);
            }

            // Nonaktifkan token lama yang belum dipakai untuk NIK ini
            $db->prepare(
                'UPDATE daftar_santri_wa_tokens SET used_at = NOW()
                 WHERE nik = ? AND used_at IS NULL AND expires_at > NOW()'
            )->execute([$nik]);

            $plain = bin2hex(random_bytes(32));
            $hash = hash('sha256', $plain);
            $ttlMinutes = 30;
            $expires = (new \DateTimeImmutable('now'))->modify('+' . $ttlMinutes . ' minutes')->format('Y-m-d H:i:s');
            $db->prepare(
                'INSERT INTO daftar_santri_wa_tokens (token_hash, nik, no_wa, expires_at)
                 VALUES (?, ?, ?, ?)'
            )->execute([$hash, $nik, $noWa, $expires]);

            $config = require __DIR__ . '/../../config.php';
            $qr = preg_replace('/\D/', '', (string) ($config['app']['daftar_santri_wa_qr_number'] ?? '6285123123399')) ?: '6285123123399';
            $message = "Daftar Santri\nNIK: {$nik}\nNomor WA: {$noWa}\nToken: {$plain}";
            $waMeUrl = 'https://wa.me/' . $qr . '?text=' . rawurlencode($message);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Silakan kirim pesan lewat WhatsApp untuk mendapatkan link masuk',
                'data' => [
                    'token' => $plain,
                    'nik' => $nik,
                    'no_wa' => $noWa,
                    'wa_number' => $qr,
                    'wa_message' => $message,
                    'wa_me_url' => $waMeUrl,
                    'expires_in_minutes' => $ttlMinutes,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('AuthController::prepareDaftarWa ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyiapkan verifikasi WhatsApp',
            ], 500);
        }
    }

    /**
     * POST /api/auth/daftar-wa-consume
     * Body: { token } — token dari link WA (sekali pakai) → JWT login daftar.
     */
    public function consumeDaftarWaToken(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            if (!is_array($data)) {
                $data = [];
            }
            $params = $request->getQueryParams();
            $plain = strtolower(trim((string) ($data['token'] ?? $params['token'] ?? $params['wa_token'] ?? '')));
            if (!preg_match('/^[a-f0-9]{64}$/', $plain)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Token tidak valid',
                ], 400);
            }

            $db = $this->getDb();
            if ($db->query("SHOW TABLES LIKE 'daftar_santri_wa_tokens'")->rowCount() === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Fitur verifikasi WA belum siap',
                ], 503);
            }

            $hash = hash('sha256', $plain);
            $db->beginTransaction();
            $stmt = $db->prepare(
                'SELECT * FROM daftar_santri_wa_tokens WHERE token_hash = ? LIMIT 1 FOR UPDATE'
            );
            $stmt->execute([$hash]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                $db->rollBack();
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Token tidak dikenali',
                ], 404);
            }
            if (!empty($row['used_at'])) {
                $db->rollBack();
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Token sudah dipakai. Buat tautan WhatsApp baru dari halaman login.',
                ], 410);
            }
            $expiresAt = strtotime((string) ($row['expires_at'] ?? ''));
            if ($expiresAt === false || $expiresAt < time()) {
                $db->rollBack();
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Token sudah kedaluwarsa',
                ], 410);
            }
            if (empty($row['wa_verified_at'])) {
                $db->rollBack();
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Token belum diverifikasi lewat WhatsApp. Kirim pesan dari aplikasi ke nomor pesantren dulu.',
                ], 403);
            }
            $storedWaConsume = WhatsAppService::formatPhoneNumber((string) ($row['no_wa'] ?? ''));
            $senderWaConsume = WhatsAppService::formatPhoneNumber((string) ($row['sender_wa'] ?? ''));
            if ($storedWaConsume === '' || $senderWaConsume === '' || $storedWaConsume !== $senderWaConsume) {
                $db->rollBack();
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Verifikasi WA tidak valid: nomor pengirim harus sama dengan nomor yang didaftarkan. Buat tautan baru dari aplikasi.',
                ], 403);
            }

            $db->prepare('UPDATE daftar_santri_wa_tokens SET used_at = NOW() WHERE id = ?')->execute([(int) $row['id']]);
            $db->commit();

            $nik = (string) ($row['nik'] ?? '');
            $stmtS = $db->prepare(
                'SELECT id, nama, nik, nis, gender, tempat_lahir, tanggal_lahir FROM santri WHERE nik = ? LIMIT 1'
            );
            $stmtS->execute([$nik]);
            $santri = $stmtS->fetch(\PDO::FETCH_ASSOC);
            $isNewSantri = !$santri;
            if ($isNewSantri) {
                $santri = [
                    'id' => null,
                    'nama' => '',
                    'nik' => $nik,
                    'nis' => null,
                    'gender' => null,
                    'tempat_lahir' => null,
                    'tanggal_lahir' => null,
                ];
            }

            $showPilihanStatus = true;
            $idRegistrasiLogin = null;
            if (!$isNewSantri && !empty($santri['id'])) {
                $idRegTahun = $this->findPsbRegistrasiIdForSantriTahunAktif((int) $santri['id']);
                if ($idRegTahun !== null) {
                    $showPilihanStatus = false;
                    $idRegistrasiLogin = $idRegTahun;
                }
            }
            $noWaTercatat = WhatsAppService::formatPhoneNumber((string) ($row['no_wa'] ?? ''));
            $noWaPengirim = WhatsAppService::formatPhoneNumber((string) ($row['sender_wa'] ?? ''));
            if ($noWaPengirim === '') {
                $noWaPengirim = $noWaTercatat;
            }
            if ($idRegistrasiLogin !== null) {
                $this->persistWaToPsbRegistrasi($idRegistrasiLogin, $noWaTercatat, $noWaPengirim);
            }
            $redirectUrl = $showPilihanStatus ? '/pilihan-status' : '/dashboard';
            $nisLogin = isset($santri['nis']) && trim((string) $santri['nis']) !== ''
                ? trim((string) $santri['nis'])
                : null;

            $tokenPayload = [
                'user_id' => $santri['id'],
                'user_name' => $santri['nama'] ?: '',
                'nik' => $santri['nik'],
                'nis' => $nisLogin,
                'id_registrasi' => $idRegistrasiLogin,
                'role_key' => 'santri',
                'role_label' => 'Santri',
                'allowed_apps' => ['daftar'],
                'permissions' => [],
                'lembaga_id' => null,
                'wa_verified' => true,
                'no_wa' => $noWaTercatat,
                'sender_wa' => $noWaPengirim,
            ];
            $jwt = $this->getJwt()->generateToken($tokenPayload);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $isNewSantri ? 'NIK baru, silakan isi formulir pendaftaran' : 'Login berhasil',
                'data' => [
                    'token' => $jwt,
                    'user' => [
                        'id' => $santri['id'],
                        'nama' => $santri['nama'] ?: '',
                        'nik' => $santri['nik'],
                        'nis' => $nisLogin,
                        'id_registrasi' => $idRegistrasiLogin,
                        'gender' => $santri['gender'] ?? null,
                        'tempat_lahir' => $santri['tempat_lahir'] ?? null,
                        'tanggal_lahir' => $santri['tanggal_lahir'] ?? null,
                        'role_key' => 'santri',
                        'role_label' => 'Santri',
                        'allowed_apps' => ['daftar'],
                        'permissions' => [],
                        'no_wa' => $noWaTercatat,
                        'sender_wa' => $noWaPengirim,
                    ],
                    'redirect_url' => $redirectUrl,
                    'show_pilihan_status' => $showPilihanStatus,
                    'is_new' => $isNewSantri,
                ],
            ], 200);
        } catch (\Throwable $e) {
            if ($this->getDb()->inTransaction()) {
                $this->getDb()->rollBack();
            }
            error_log('AuthController::consumeDaftarWaToken ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memverifikasi token',
            ], 500);
        }
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

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }
}

