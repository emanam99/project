<?php

namespace App\Controllers;

use App\Database;
use App\Auth\PasswordHelper;
use App\Helpers\AuditLogger;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use App\Helpers\RoleHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class UserController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    public function checkUser(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            
            $userId = $data['user_id'] ?? '';
            
            if (empty($userId)) {
                return $this->jsonResponse($response, [
                    'exists' => false,
                    'message' => 'User ID required'
                ], 400);
            }

            $stmt = $this->db->prepare("SELECT id FROM pengurus WHERE id = ?");
            $stmt->execute([$userId]);
            $exists = $stmt->fetch() ? true : false;

            return $this->jsonResponse($response, [
                'exists' => $exists,
                'message' => $exists ? 'User found' : 'User not found'
            ], 200);

        } catch (\Exception $e) {
            error_log("Check user error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'exists' => false,
                'message' => 'Error checking user'
            ], 500);
        }
    }

    /**
     * POST /api/user/update-profile - Update profil user
     */
    public function updateProfile(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $input = TextSanitizer::sanitizeStringValues($input ?? [], []);
            $userId = $input['user_id'] ?? '';
            
            if (empty($userId)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User ID required'
                ], 400);
            }

            $currentUser = $request->getAttribute('user');
            $cu = is_array($currentUser) ? $currentUser : [];
            $currentPengurusId = isset($cu['user_id']) ? (int) $cu['user_id'] : 0;
            $targetPengurusId = (int) $userId;
            $isSuperAdmin = RoleHelper::tokenHasAnyRoleKey($cu, ['super_admin']);
            $isAdminUgt = RoleHelper::tokenHasAnyRoleKey($cu, ['admin_ugt']);
            $canEditAny = $isSuperAdmin || $isAdminUgt;
            if ($targetPengurusId !== $currentPengurusId && !$canEditAny) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Akses ditolak. Hanya dapat mengedit profil sendiri atau butuh role super_admin/admin_ugt.'
                ], 403);
            }
            
            // Check if user exists
            $stmt = $this->db->prepare("SELECT id FROM pengurus WHERE id = ?");
            $stmt->execute([$userId]);
            if (!$stmt->fetch()) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User tidak ditemukan'
                ], 404);
            }
            
            // Build update query
            $updateFields = [];
            $params = [];
            
            // Kolom yang masih ada di tabel pengurus (email/jabatan/no_telpon/whatsapp sudah dipindah/dihapus)
            $fieldsPengurus = [
                'nama', 'gelar_awal', 'gelar_akhir', 'nik', 'no_kk', 'kategori',
                'status_pengurus', 'gender', 'tempat_lahir', 'tanggal_lahir', 'status_nikah',
                'pendidikan_terakhir', 'sekolah', 'tahun_lulus', 's1', 's2', 's3',
                'bidang_studi', 'jurusan_title',
                'pekerjaan', 'tmt', 'niy', 'nidn', 'nuptk', 'npk',
                'dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kabupaten', 'provinsi', 'kode_pos',
                'rekening_jatim', 'an_jatim'
            ];

            foreach ($fieldsPengurus as $field) {
                if (isset($input[$field])) {
                    $updateFields[] = "{$field} = ?";
                    $params[] = $input[$field] === '' ? null : $input[$field];
                }
            }

            // Ambil data pengurus sebelum update untuk log aktivitas
            $oldPengurus = null;
            if (!empty($updateFields) || array_key_exists('email', $input)) {
                $stmtOld = $this->db->prepare("
                    SELECT p.id, p.nama, p.gelar_awal, p.gelar_akhir, p.nik, p.no_kk, p.kategori, p.status_pengurus,
                    p.gender, p.tempat_lahir, p.tanggal_lahir, p.status_nikah,
                    p.pendidikan_terakhir, p.sekolah, p.tahun_lulus, p.s1, p.s2, p.s3, p.bidang_studi, p.jurusan_title,
                    p.pekerjaan, p.tmt, p.niy, p.nidn, p.nuptk, p.npk,
                    p.dusun, p.rt, p.rw, p.desa, p.kecamatan, p.kabupaten, p.provinsi, p.kode_pos,
                    p.rekening_jatim, p.an_jatim,
                    u.email
                    FROM pengurus p
                    LEFT JOIN users u ON u.id = p.id_user
                    WHERE p.id = ?
                ");
                $stmtOld->execute([$userId]);
                $oldPengurus = $stmtOld->fetch(\PDO::FETCH_ASSOC);
            }

            if (!empty($updateFields)) {
                $params[] = $userId;
                $sql = "UPDATE pengurus SET " . implode(", ", $updateFields) . " WHERE id = ?";
                $stmt = $this->db->prepare($sql);
                $stmt->execute($params);
            }

            // Email ada di tabel users (bukan pengurus)
            $emailUpdated = false;
            if (array_key_exists('email', $input)) {
                $stmtU = $this->db->prepare("SELECT id_user FROM pengurus WHERE id = ? LIMIT 1");
                $stmtU->execute([$userId]);
                $rowU = $stmtU->fetch(\PDO::FETCH_ASSOC);
                if ($rowU && !empty($rowU['id_user'])) {
                    $idUser = (int) $rowU['id_user'];
                    $emailVal = TextSanitizer::cleanText($input['email'] ?? '') ?: null;
                    $this->db->prepare("UPDATE users SET email = ? WHERE id = ?")->execute([$emailVal, $idUser]);
                    $emailUpdated = true;
                }
            }

            if (empty($updateFields) && !$emailUpdated) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak ada data yang diubah'
                ], 400);
            }

            // Catat ke log aktivitas (profil = update pengurus oleh diri sendiri)
            $pengurusId = (int) $userId;
            if ($oldPengurus !== false && $pengurusId > 0) {
                $stmtNew = $this->db->prepare("
                    SELECT p.id, p.nama, p.gelar_awal, p.gelar_akhir, p.nik, p.no_kk, p.kategori, p.status_pengurus,
                    p.gender, p.tempat_lahir, p.tanggal_lahir, p.status_nikah,
                    p.pendidikan_terakhir, p.sekolah, p.tahun_lulus, p.s1, p.s2, p.s3, p.bidang_studi, p.jurusan_title,
                    p.pekerjaan, p.tmt, p.niy, p.nidn, p.nuptk, p.npk,
                    p.dusun, p.rt, p.rw, p.desa, p.kecamatan, p.kabupaten, p.provinsi, p.kode_pos,
                    p.rekening_jatim, p.an_jatim,
                    u.email
                    FROM pengurus p
                    LEFT JOIN users u ON u.id = p.id_user
                    WHERE p.id = ?
                ");
                $stmtNew->execute([$userId]);
                $newPengurus = $stmtNew->fetch(\PDO::FETCH_ASSOC);
                if ($newPengurus !== false) {
                    UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'pengurus', $pengurusId, $oldPengurus, $newPengurus, $request);
                }
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Profil berhasil diperbarui'
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Update profile error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memperbarui profil: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/user/verify-password - Verifikasi password
     */
    public function verifyPassword(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $userId = $input['user_id'] ?? '';
            $password = $input['password'] ?? '';
            
            if (empty($userId) || empty($password)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User ID dan password diperlukan'
                ], 400);
            }
            
            // Ambil id_user dari pengurus, lalu password dari users
            $stmt = $this->db->prepare("SELECT p.id_user FROM pengurus p WHERE p.id = ?");
            $stmt->execute([$userId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row || empty($row['id_user'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User tidak ditemukan atau belum punya akun'
                ], 404);
            }
            $idUser = (int) $row['id_user'];
            $stmt = $this->db->prepare("SELECT password FROM users WHERE id = ?");
            $stmt->execute([$idUser]);
            $user = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$user || $user['password'] === null || $user['password'] === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Password belum diatur'
                ], 401);
            }
            if (PasswordHelper::verifyPassword($password, $user['password'])) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Verifikasi password berhasil'
                ], 200);
            }
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Password salah'
            ], 401);
            
        } catch (\Exception $e) {
            error_log("Verify password error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal verifikasi password: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/user/update-password - Update password
     */
    public function updatePassword(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $userId = $input['user_id'] ?? '';
            $newPassword = $input['new_password'] ?? '';
            
            if (empty($userId) || empty($newPassword)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User ID dan password baru diperlukan'
                ], 400);
            }
            
            // Ambil id_user dari pengurus
            $stmt = $this->db->prepare("SELECT id_user FROM pengurus WHERE id = ?");
            $stmt->execute([$userId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row || empty($row['id_user'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User tidak ditemukan atau belum punya akun'
                ], 404);
            }
            $idUser = (int) $row['id_user'];
            $hashedPassword = PasswordHelper::hashPassword($newPassword);
            $stmt = $this->db->prepare("UPDATE users SET password = ? WHERE id = ?");
            $stmt->execute([$hashedPassword, $idUser]);

            $targetUsersId = (string) $idUser;
            $serverParams = $request->getServerParams();
            $ip = $serverParams['REMOTE_ADDR'] ?? '';
            if (!empty($serverParams['HTTP_X_FORWARDED_FOR'])) {
                $ips = explode(',', $serverParams['HTTP_X_FORWARDED_FOR']);
                $ip = trim($ips[0]);
            }
            $actor = $request->getAttribute('user');
            AuditLogger::log($targetUsersId, 'password_changed_profile', [
                'by_pengurus_id' => $actor['user_id'] ?? null,
            ], $ip !== '' ? $ip : null, true);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Password berhasil diubah'
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Update password error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengubah password: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/user/list - Get list of all users with admin roles (super_admin, admin_uwaba, admin_lembaga) with WhatsApp numbers
     */
    public function getAllUsers(Request $request, Response $response): Response
    {
        try {
            // Get all users with admin roles (super_admin, admin_uwaba, admin_lembaga) from role table
            // Only exclude users that are explicitly inactive (case insensitive)
            $stmt = $this->db->prepare("
                SELECT DISTINCT p.id, p.nama, COALESCE(u.no_wa, '') AS whatsapp
                FROM pengurus p
                LEFT JOIN users u ON u.id = p.id_user
                INNER JOIN pengurus___role pr ON p.id = pr.pengurus_id
                INNER JOIN role r ON pr.role_id = r.id
                WHERE r.`key` IN ('super_admin', 'admin_uwaba', 'admin_lembaga')
                AND (
                    p.status IS NULL 
                    OR LOWER(TRIM(COALESCE(p.status, ''))) NOT IN ('tidak aktif', 'inactive')
                )
                ORDER BY p.nama ASC
            ");
            $stmt->execute();
            $users = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $users
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Get all users error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Database error: ' . $e->getMessage(),
                'data' => []
            ], 500);
        }
    }

    /**
     * GET /api/user/list-super-admin-uwaba - Get list of users with admin_uwaba role only
     * Hanya menampilkan admin yang punya role admin_uwaba (termasuk yang juga punya super_admin)
     * Digunakan untuk notifikasi rencana pengeluaran yang hanya perlu dikirim ke admin_uwaba
     */
    public function getSuperAdminAndUwabaUsers(Request $request, Response $response): Response
    {
        try {
            // Get only users with admin_uwaba role (bisa juga punya super_admin, tapi harus punya admin_uwaba)
            $stmt = $this->db->prepare("
                SELECT DISTINCT p.id, p.nama, COALESCE(u.no_wa, '') AS whatsapp, 'admin_uwaba' as role_key
                FROM pengurus p
                LEFT JOIN users u ON u.id = p.id_user
                INNER JOIN pengurus___role pr ON p.id = pr.pengurus_id
                INNER JOIN role r ON pr.role_id = r.id
                WHERE r.`key` = 'admin_uwaba'
                AND (
                    p.status IS NULL 
                    OR LOWER(TRIM(COALESCE(p.status, ''))) NOT IN ('tidak aktif', 'inactive')
                )
                ORDER BY p.nama ASC
            ");
            $stmt->execute();
            $users = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $users
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Get admin uwaba users error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Database error: ' . $e->getMessage(),
                'data' => []
            ], 500);
        }
    }

    /**
     * GET /api/user/{id} - Get user data by ID
     * Boleh akses: profil sendiri (id = pengurus id user saat ini), super_admin, atau admin_ugt (untuk edit pengurus/koordinator).
     */
    public function getUserById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? $request->getQueryParams()['id'] ?? '';
            
            if (empty($id)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID parameter required'
                ], 400);
            }

            $currentUser = $request->getAttribute('user');
            $cu = is_array($currentUser) ? $currentUser : [];
            $currentPengurusId = isset($cu['user_id']) ? (int) $cu['user_id'] : 0;
            $requestedId = (int) $id;
            $isSuperAdmin = RoleHelper::tokenHasAnyRoleKey($cu, ['super_admin']);
            $isAdminUgt = RoleHelper::tokenHasAnyRoleKey($cu, ['admin_ugt']);
            $canViewAny = $isSuperAdmin || $isAdminUgt;
            if ($requestedId !== $currentPengurusId && !$canViewAny) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Akses ditolak. Hanya dapat melihat profil sendiri atau butuh role super_admin/admin_ugt.'
                ], 403);
            }
            
            // Email/whatsapp dari users (kolom sudah dihapus dari pengurus); jabatan dari pengurus___jabatan; nip dari tabel pengurus
            $stmt = $this->db->prepare("
                SELECT 
                    p.id, p.nama, p.nip, p.gelar_awal, p.gelar_akhir, p.nik, p.no_kk, p.kategori, p.status_pengurus,
                    p.gender, p.tempat_lahir, p.tanggal_lahir, p.status_nikah,
                    p.pendidikan_terakhir, p.sekolah, p.tahun_lulus, p.s1, p.s2, p.s3, p.bidang_studi, p.jurusan_title,
                    p.pekerjaan, p.tmt, p.niy, p.nidn, p.nuptk, p.npk,
                    u.email, COALESCE(u.no_wa, '') AS whatsapp,
                    p.dusun, p.rt, p.rw, p.desa, p.kecamatan, p.kabupaten, p.provinsi, p.kode_pos,
                    p.rekening_jatim, p.an_jatim, p.foto_profil,
                    u.no_wa_verified_at
                FROM pengurus p
                LEFT JOIN users u ON u.id = p.id_user
                WHERE p.id = ?
            ");
            $stmt->execute([$id]);
            $user = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            if ($user) {
                // Jabatan dari pengurus___jabatan (dengan lembaga: nama, kategori, deskripsi; jabatan: deskripsi)
                $jabatanStmt = $this->db->prepare("
                    SELECT 
                        j.nama AS jabatan_nama,
                        j.kategori AS jabatan_kategori,
                        j.deskripsi AS jabatan_deskripsi,
                        COALESCE(l.nama, l2.nama) AS lembaga_nama,
                        COALESCE(l.kategori, l2.kategori) AS lembaga_kategori,
                        COALESCE(l.deskripsi, l2.deskripsi) AS lembaga_deskripsi,
                        COALESCE(pj.lembaga_id, j.lembaga_id) AS lembaga_id,
                        pj.tanggal_mulai,
                        pj.tanggal_selesai
                    FROM pengurus___jabatan pj
                    INNER JOIN jabatan j ON pj.jabatan_id = j.id
                    LEFT JOIN lembaga l ON l.id = pj.lembaga_id
                    LEFT JOIN lembaga l2 ON l2.id = j.lembaga_id
                    WHERE pj.pengurus_id = ? AND pj.status = 'aktif'
                    ORDER BY pj.tanggal_mulai DESC, j.nama
                ");
                $jabatanStmt->execute([$id]);
                $user['jabatan'] = $jabatanStmt->fetchAll(\PDO::FETCH_ASSOC);
                // Frontend header butuh user.pengurus.nip (NIP dari tabel pengurus)
                $nip = isset($user['nip']) && $user['nip'] !== null && $user['nip'] !== '' ? (string) $user['nip'] : null;
                $user['pengurus'] = ['nip' => $nip];
                return $this->jsonResponse($response, [
                    'success' => true,
                    'user' => $user
                ], 200);
            } else {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User not found'
                ], 404);
            }
            
        } catch (\Exception $e) {
            error_log("Get user by ID error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Database error: ' . $e->getMessage()
            ], 500);
        }
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }
}

