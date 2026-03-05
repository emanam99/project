<?php

namespace App\Controllers;

use App\Database;
use App\Auth\JwtAuth;
use App\Auth\PasswordHelper;
use App\Helpers\LoginSuspiciousHelper;
use App\Helpers\RoleHelper;
use App\Helpers\ViewAsHelper;
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
            
            // Log untuk debugging
            error_log("Login request received");
            error_log("Parsed body: " . json_encode($data));
            error_log("Content-Type: " . $request->getHeaderLine('Content-Type'));
            
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
                
                // Ambil semua role keys user untuk multiple roles support
                $allUserRoles = RoleHelper::getUserRoles($user['id']);
                $allRoleKeys = array_column($allUserRoles, 'role_key');
                
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
                    'lembaga_id' => null
                ];
                $allRoleKeys = ['user'];
            }
            
            // Generate JWT token dengan informasi role lengkap
            $tokenPayload = [
                'user_id' => $user['id'],
                'user_name' => $user['nama'],
                'user_role' => $roleInfo['role_key'] ?? 'user',
                'role_key' => $roleInfo['role_key'] ?? 'user',
                'role_label' => $roleInfo['role_label'] ?? 'User',
                'all_roles' => $allRoleKeys ?? [], // Array semua role keys user
                'allowed_apps' => $roleInfo['allowed_apps'] ?? [],
                'permissions' => $roleInfo['permissions'] ?? [],
                'lembaga_id' => $roleInfo['lembaga_id'] ?? null
            ];

            $token = $this->getJwt()->generateToken($tokenPayload);

            // Log successful login
            error_log("Login successful for ID: {$user['id']}, Name: {$user['nama']}, Role: {$roleInfo['role_key']}");

            // Pastikan allowed_apps selalu array (tidak null)
            $allowedApps = $roleInfo['allowed_apps'] ?? [];
            if (!is_array($allowedApps)) {
                $allowedApps = [];
            }
            
            // Log final data yang dikirim ke frontend
            error_log("AuthController::login - Final response data: " . json_encode([
                'role_key' => $roleInfo['role_key'] ?? 'null',
                'allowed_apps' => $allowedApps,
                'has_uwaba_access' => in_array('uwaba', $allowedApps)
            ]));
            
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
                        'level' => $roleInfo['role_key'] ?? 'user'
                    ],
                    'redirect_url' => '/'
                ]
            ], 200);

        } catch (\Exception $e) {
            error_log("Login error: " . $e->getMessage());
            error_log("Stack trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat login: ' . $e->getMessage()
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
            
            if ($userId) {
                // Refresh role info dari database untuk mendapatkan all_roles terbaru
                try {
                    $roleInfo = RoleHelper::getRoleInfoForToken($userId);
                    $allUserRoles = RoleHelper::getUserRoles($userId);
                    $allRoleKeys = array_column($allUserRoles, 'role_key');
                    
                    // Update payload dengan data terbaru
                    $payload['role_key'] = $roleInfo['role_key'] ?? $payload['role_key'] ?? 'user';
                    $payload['role_label'] = $roleInfo['role_label'] ?? $payload['role_label'] ?? 'User';
                    $payload['all_roles'] = $allRoleKeys ?? [];
                    $payload['allowed_apps'] = $roleInfo['allowed_apps'] ?? [];
                    $payload['permissions'] = $roleInfo['permissions'] ?? [];
                    $payload['lembaga_id'] = $roleInfo['lembaga_id'] ?? null;
                } catch (\Exception $e) {
                    error_log("Error refreshing role info in verify: " . $e->getMessage());
                    // Continue with existing payload if refresh fails
                }
                // NIP dari tabel pengurus (user_id di token = pengurus.id untuk role pengurus)
                try {
                    $stmt = $this->getDb()->prepare("SELECT nip FROM pengurus WHERE id = ? LIMIT 1");
                    $stmt->execute([$userId]);
                    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                    if ($row && $row['nip'] !== null && $row['nip'] !== '') {
                        $payload['pengurus'] = ['nip' => (string) $row['nip']];
                    }
                } catch (\Exception $e) {
                    // ignore
                }
            }

            // Super admin "coba sebagai": ganti role/lembaga/permissions dengan yang efektif
            $payload = ViewAsHelper::mergePayloadWithViewAs($payload);

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

    /**
     * POST /api/auth/view-as — Set atau clear "coba sebagai" role (hanya super_admin).
     * Body: { role_key?: string|null, lembaga_id?: number|null }
     * Jika role_key kosong/null = clear. Setelah set/clear, frontend harus panggil verify lagi.
     */
    public function setViewAs(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            if (!$payload || !is_array($payload)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }
            $roleKey = strtolower(trim($payload['role_key'] ?? $payload['user_role'] ?? ''));
            if ($roleKey !== 'super_admin') {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Hanya Super Admin yang dapat mengatur view as'], 403);
            }
            $pengurusId = (int) ($payload['user_id'] ?? $payload['id'] ?? 0);
            if ($pengurusId <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'User tidak valid'], 403);
            }
            $data = $request->getParsedBody() ?? [];
            $viewAsRole = isset($data['role_key']) ? trim((string) $data['role_key']) : null;
            if ($viewAsRole === '') {
                $viewAsRole = null;
            }
            $viewAsLembagaId = null;
            if (isset($data['lembaga_id']) && $data['lembaga_id'] !== '' && $data['lembaga_id'] !== null) {
                $viewAsLembagaId = (int) $data['lembaga_id'];
            }
            $ok = ViewAsHelper::setViewAs($pengurusId, $viewAsRole, $viewAsLembagaId);
            if (!$ok && $viewAsRole !== null) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Role tidak valid'], 400);
            }
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $viewAsRole ? 'View as diset' : 'View as dikosongkan',
                'data' => ['role_key' => $viewAsRole, 'lembaga_id' => $viewAsLembagaId]
            ], 200);
        } catch (\Exception $e) {
            error_log("AuthController::setViewAs " . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
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
     * Login dengan NIK untuk aplikasi pendaftaran
     * POST /api/auth/login-nik
     */
    public function loginNik(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            
            // Validasi input
            $nik = $data['nik'] ?? '';

            if (empty($nik)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'NIK harus diisi'
                ], 400);
            }

            // Validasi NIK harus 16 karakter
            if (strlen($nik) !== 16 || !ctype_digit($nik)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'NIK harus terdiri dari 16 angka'
                ], 400);
            }

            // Query santri dari database berdasarkan NIK
            $stmt = $this->getDb()->prepare("SELECT id, nama, nik, gender, tempat_lahir, tanggal_lahir FROM santri WHERE nik = ? LIMIT 1");
            $stmt->execute([$nik]);
            $santri = $stmt->fetch(\PDO::FETCH_ASSOC);

            $isNewSantri = false;
            
            // Jika NIK tidak ditemukan, berarti santri baru - tetap izinkan login
            if (!$santri) {
                $isNewSantri = true;
                $santri = [
                    'id' => null, // Belum ada ID, akan dibuat saat save biodata
                    'nama' => '',
                    'nik' => $nik,
                    'gender' => null,
                    'tempat_lahir' => null,
                    'tanggal_lahir' => null
                ];
                error_log("Login NIK (new santri) for NIK: $nik - Santri baru, belum ada di database");
            } else {
                error_log("Login NIK successful for NIK: {$santri['nik']}, Name: {$santri['nama']}, ID: {$santri['id']}");
            }

            // Tentukan apakah perlu tampilkan halaman pilihan status (Santri Baru / Santri Lama)
            // Default: tampilkan flow. Hanya skip (ke dashboard) jika santri SUDAH punya registrasi tahun ini.
            $showPilihanStatus = true;
            if (!$isNewSantri && $santri['id'] !== null && $santri['id'] !== '') {
                $idSantri = (int) $santri['id'];
                $tahunHijriyah = null;
                $tahunMasehi = null;
                try {
                    $stmtPeng = $this->getDb()->query("SELECT `key`, value FROM psb___pengaturan WHERE `key` IN ('tahun_hijriyah', 'tahun_masehi')");
                    if ($stmtPeng) {
                        while ($row = $stmtPeng->fetch(\PDO::FETCH_ASSOC)) {
                            $val = isset($row['value']) ? trim((string)$row['value']) : '';
                            if ($row['key'] === 'tahun_hijriyah' && $val !== '') $tahunHijriyah = $val;
                            if ($row['key'] === 'tahun_masehi' && $val !== '') $tahunMasehi = $val;
                        }
                    }
                } catch (\Throwable $e) {
                    $showPilihanStatus = true;
                }
                // Hanya anggap "sudah terdaftar" jika tahun ajaran ter-set DAN ada baris registrasi yang cocok.
                // Normalisasi tahun: "1446-1447" / "2025-2026" di pengaturan bisa beda format dengan di registrasi ("1446" atau "1446-1447").
                if ($tahunHijriyah !== null && $tahunHijriyah !== '' && $tahunMasehi !== null && $tahunMasehi !== '') {
                    try {
                        $normHijriyah = trim(explode('-', $tahunHijriyah)[0] ?? $tahunHijriyah);
                        $normMasehi = trim(explode('-', $tahunMasehi)[0] ?? $tahunMasehi);
                        if ($normHijriyah !== '' && $normMasehi !== '') {
                            $stmtReg = $this->getDb()->prepare(
                                "SELECT id FROM psb___registrasi WHERE id_santri = ? " .
                                "AND (tahun_hijriyah = ? OR tahun_hijriyah LIKE ?) " .
                                "AND (tahun_masehi = ? OR tahun_masehi LIKE ?) LIMIT 1"
                            );
                            $stmtReg->execute([
                                $idSantri,
                                $normHijriyah,
                                $normHijriyah . '%',
                                $normMasehi,
                                $normMasehi . '%'
                            ]);
                            $rowReg = $stmtReg->fetch(\PDO::FETCH_ASSOC);
                            if ($rowReg !== false && isset($rowReg['id'])) {
                                $showPilihanStatus = false;
                            }
                        }
                    } catch (\Throwable $e) {
                        $showPilihanStatus = true;
                    }
                }
            }

            $redirectUrl = $showPilihanStatus ? '/pilihan-status' : '/dashboard';

            // Generate JWT token untuk santri (baik yang sudah ada maupun yang baru)
            // Untuk aplikasi pendaftaran, kita tidak perlu role seperti pengurus
            $tokenPayload = [
                'user_id' => $santri['id'], // null untuk santri baru
                'user_name' => $santri['nama'] ?: '',
                'nik' => $santri['nik'],
                'role_key' => 'santri',
                'role_label' => 'Santri',
                'allowed_apps' => ['daftar'], // Aplikasi pendaftaran
                'permissions' => [],
                'lembaga_id' => null
            ];

            $token = $this->getJwt()->generateToken($tokenPayload);

            // Return success response
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $isNewSantri ? 'NIK baru, silakan isi formulir pendaftaran' : 'Login berhasil',
                'data' => [
                    'token' => $token,
                    'user' => [
                        'id' => $santri['id'], // null untuk santri baru
                        'nama' => $santri['nama'] ?: '',
                        'nik' => $santri['nik'],
                        'gender' => $santri['gender'] ?? null,
                        'tempat_lahir' => $santri['tempat_lahir'] ?? null,
                        'tanggal_lahir' => $santri['tanggal_lahir'] ?? null,
                        'role_key' => 'santri',
                        'role_label' => 'Santri',
                        'allowed_apps' => ['daftar'],
                        'permissions' => []
                    ],
                    'redirect_url' => $redirectUrl,
                    'show_pilihan_status' => $showPilihanStatus,
                    'is_new' => $isNewSantri // Flag untuk mengetahui santri baru
                ]
            ], 200);

        } catch (\Exception $e) {
            error_log("Login NIK error: " . $e->getMessage());
            error_log("Stack trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat login: ' . $e->getMessage()
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

