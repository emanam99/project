<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\PengurusHelper;
use App\Helpers\RoleHelper;
use App\Helpers\UserAktivitasLogger;
use App\Helpers\SantriHelper;
use App\Services\WhatsAppService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class ManageUsersController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    /**
     * GET /api/manage-users - Get all users with pagination and filters
     */
    public function getAllUsers(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            
            // Pagination
            $page = isset($queryParams['page']) ? (int)$queryParams['page'] : 1;
            $limit = isset($queryParams['limit']) ? (int)$queryParams['limit'] : 10;
            $offset = ($page - 1) * $limit;
            
            // Filters: status, kategori lembaga, lembaga (jabatan_lembaga_id), jabatan (jabatan_id), role_id (hanya pengurus yang punya role ini)
            $search = $queryParams['search'] ?? '';
            $statusFilter = $queryParams['status'] ?? '';
            $jabatanLembagaFilter = isset($queryParams['jabatan_lembaga_id']) ? trim($queryParams['jabatan_lembaga_id']) : '';
            $lembagaKategoriFilter = isset($queryParams['lembaga_kategori']) ? trim($queryParams['lembaga_kategori']) : '';
            $jabatanIdFilter = isset($queryParams['jabatan_id']) ? (int)$queryParams['jabatan_id'] : 0;
            $roleIdFilter = isset($queryParams['role_id']) ? (int)$queryParams['role_id'] : 0;
            
            // Build WHERE clause
            $whereConditions = [];
            $params = [];
            
            // Hanya join lembaga dan jabatan (tanpa join role).
            $joinUsers = "LEFT JOIN users u ON u.id = p.id_user";
            // Filter by role: hanya pengurus yang punya role ini (untuk halaman Koordinator = hanya koordinator)
            $joinRoleFilter = '';
            if ($roleIdFilter > 0) {
                $joinRoleFilter = "INNER JOIN pengurus___role pr_filter ON p.id = pr_filter.pengurus_id AND pr_filter.role_id = ?";
                $params[] = $roleIdFilter;
            }
            // Join jabatan + lembaga (sertakan kolom kategori lembaga)
            $joinJabatan = "LEFT JOIN pengurus___jabatan pj ON p.id = pj.pengurus_id AND pj.status = 'aktif'
                    LEFT JOIN jabatan j ON pj.jabatan_id = j.id
                    LEFT JOIN lembaga l ON l.id = COALESCE(pj.lembaga_id, j.lembaga_id)";
            if ($jabatanLembagaFilter !== '') {
                $joinJabatan = "INNER JOIN pengurus___jabatan pj ON p.id = pj.pengurus_id AND pj.status = 'aktif'
                        INNER JOIN jabatan j ON pj.jabatan_id = j.id AND j.lembaga_id = ?
                        LEFT JOIN lembaga l ON l.id = COALESCE(pj.lembaga_id, j.lembaga_id)";
                $params[] = $jabatanLembagaFilter;
            }
            
            // Filter kategori lembaga (pengurus yang punya jabatan/lembaga dengan kategori tersebut)
            if ($lembagaKategoriFilter !== '') {
                $whereConditions[] = "EXISTS (SELECT 1 FROM pengurus___jabatan pj2 INNER JOIN jabatan j2 ON pj2.jabatan_id = j2.id LEFT JOIN lembaga l2 ON l2.id = COALESCE(pj2.lembaga_id, j2.lembaga_id) WHERE pj2.pengurus_id = p.id AND pj2.status = 'aktif' AND l2.kategori = ?)";
                $params[] = $lembagaKategoriFilter;
            }
            
            // Filter jabatan (pengurus yang punya jabatan ini)
            if ($jabatanIdFilter > 0) {
                $whereConditions[] = "EXISTS (SELECT 1 FROM pengurus___jabatan pj2 WHERE pj2.pengurus_id = p.id AND pj2.jabatan_id = ? AND pj2.status = 'aktif')";
                $params[] = $jabatanIdFilter;
            }
            
            if (!empty($search)) {
                $whereConditions[] = "(p.id LIKE ? OR p.nip LIKE ? OR p.nama LIKE ? OR u.username LIKE ? OR u.email LIKE ?)";
                $searchParam = "%{$search}%";
                $params[] = $searchParam;
                $params[] = $searchParam;
                $params[] = $searchParam;
                $params[] = $searchParam;
                $params[] = $searchParam;
            }
            
            if (!empty($statusFilter)) {
                // Handle both 'active'/'aktif' and 'inactive'/'tidak aktif'
                if (strtolower($statusFilter) === 'active') {
                    $whereConditions[] = "(p.status = ? OR p.status = ?)";
                    $params[] = 'active';
                    $params[] = 'aktif';
                } elseif (strtolower($statusFilter) === 'inactive') {
                    $whereConditions[] = "(p.status = ? OR p.status = ?)";
                    $params[] = 'inactive';
                    $params[] = 'tidak aktif';
                } else {
                    $whereConditions[] = "p.status = ?";
                    $params[] = $statusFilter;
                }
            }
            
            $whereClause = !empty($whereConditions) ? "WHERE " . implode(" AND ", $whereConditions) : "";
            
            // Get total count (without pagination params)
            $countParams = $params;
            $countSql = "SELECT COUNT(DISTINCT p.id) as total FROM pengurus p {$joinUsers} {$joinRoleFilter} {$joinJabatan} {$whereClause}";
            $countStmt = $this->db->prepare($countSql);
            $countStmt->execute($countParams);
            $total = $countStmt->fetch(\PDO::FETCH_ASSOC)['total'];
            
            // Get users with pagination - join role filter jika role_id diset. Lembaga sertakan kategori.
            $sql = "SELECT 
                        p.id, p.nip, p.grup, p.id_user, p.gelar_awal, p.nama, p.gelar_akhir,
                        p.nik, p.no_kk, p.kategori, p.status_pengurus,
                        p.gender, p.tempat_lahir, p.tanggal_lahir, p.pendidikan_terakhir, p.sekolah, p.tahun_lulus,
                        p.s1, p.s2, p.s3, p.tmt, p.bidang_studi, p.jurusan_title, p.status_nikah, p.pekerjaan,
                        p.niy, p.nidn, p.nuptk, p.npk,
                        p.dusun, p.rt, p.rw, p.desa, p.kecamatan, p.kabupaten, p.provinsi, p.kode_pos,
                        p.status,
                        p.sejak, p.mengajar, p.nyabang, p.hijriyah, p.masehi,
                        p.tanggal_dibuat, p.tanggal_update, p.rekening_jatim,
                        u.email, u.no_wa AS whatsapp, COALESCE(u.no_wa, '') AS no_telpon,
                        GROUP_CONCAT(DISTINCT CASE WHEN l.id IS NOT NULL THEN CONCAT(l.id, '|', COALESCE(l.nama, ''), '|', COALESCE(l.kategori, '')) END SEPARATOR '||') as lembaga_data,
                        GROUP_CONCAT(DISTINCT CONCAT(COALESCE(pj.lembaga_id, ''), ':', j.id, ':', j.nama) SEPARATOR '||') as jabatan_data
                    FROM pengurus p 
                    {$joinUsers}
                    {$joinRoleFilter}
                    {$joinJabatan}
                    {$whereClause}
                    GROUP BY p.id, p.nip, p.grup, p.id_user, p.gelar_awal, p.nama, p.gelar_akhir, p.nik, p.no_kk, p.kategori, p.status_pengurus,
                        p.gender, p.tempat_lahir, p.tanggal_lahir, p.pendidikan_terakhir, p.sekolah, p.tahun_lulus,
                        p.s1, p.s2, p.s3, p.tmt, p.bidang_studi, p.jurusan_title, p.status_nikah, p.pekerjaan,
                        p.niy, p.nidn, p.nuptk, p.npk, p.dusun, p.rt, p.rw, p.desa, p.kecamatan, p.kabupaten, p.provinsi, p.kode_pos,
                        p.status, p.sejak, p.mengajar, p.nyabang, p.hijriyah, p.masehi, p.tanggal_dibuat, p.tanggal_update, p.rekening_jatim,
                        u.email, u.no_wa
                    ORDER BY p.nama ASC 
                    LIMIT ? OFFSET ?";
            
            $params[] = $limit;
            $params[] = $offset;
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $users = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            $pengurusIds = array_map(function ($u) {
                return (int) $u['id'];
            }, $users);
            $rolesByPengurus = [];
            if (!empty($pengurusIds)) {
                $placeholders = implode(',', array_fill(0, count($pengurusIds), '?'));
                $roleSql = "SELECT pr.pengurus_id, r.id as role_id, r.`key` as role_key, r.label as role_label, pr.id as pengurus_role_id
                    FROM pengurus___role pr
                    INNER JOIN role r ON pr.role_id = r.id
                    WHERE pr.pengurus_id IN ({$placeholders})
                    ORDER BY pr.pengurus_id, pr.tanggal_dibuat DESC";
                $roleStmt = $this->db->prepare($roleSql);
                $roleStmt->execute($pengurusIds);
                while ($row = $roleStmt->fetch(\PDO::FETCH_ASSOC)) {
                    $pid = (int) $row['pengurus_id'];
                    if (!isset($rolesByPengurus[$pid])) {
                        $rolesByPengurus[$pid] = [];
                    }
                    $rolesByPengurus[$pid][] = [
                        'role_id' => (int) $row['role_id'],
                        'role_key' => $row['role_key'],
                        'role_label' => $row['role_label'],
                        'pengurus_role_id' => (int) $row['pengurus_role_id'],
                    ];
                }
            }
            
            // Parse lembaga data (id|nama|kategori) dan jabatan data untuk setiap user. Isi roles dari rolesByPengurus.
            foreach ($users as &$user) {
                $user['roles'] = $rolesByPengurus[(int) $user['id']] ?? [];
                $lembagaList = [];
                if (!empty($user['lembaga_data'])) {
                    $lembagaArray = array_filter(explode('||', $user['lembaga_data']));
                    foreach ($lembagaArray as $lembagaStr) {
                        $parts = explode('|', $lembagaStr, 3);
                        if (!empty($parts[0])) {
                            $lembagaList[] = [
                                'id' => $parts[0],
                                'nama' => $parts[1] ?? '',
                                'kategori' => $parts[2] ?? ''
                            ];
                        }
                    }
                }
                $user['lembaga'] = $lembagaList;
                $user['lembaga_ids'] = array_map(function ($l) {
                    return $l['id'];
                }, $lembagaList);

                $jabatan = [];
                if (!empty($user['jabatan_data'])) {
                    $jabatanArray = explode('||', $user['jabatan_data']);
                    foreach ($jabatanArray as $jabatanStr) {
                        if (!empty($jabatanStr)) {
                            $parts = explode(':', $jabatanStr, 3);
                            if (count($parts) >= 3) {
                                $jabatan[] = [
                                    'lembaga_id' => $parts[0] ?: null,
                                    'jabatan_id' => (int) $parts[1],
                                    'jabatan_nama' => $parts[2]
                                ];
                            } elseif (count($parts) >= 2) {
                                $jabatan[] = [
                                    'lembaga_id' => $parts[0] ?: null,
                                    'jabatan_id' => null,
                                    'jabatan_nama' => $parts[1]
                                ];
                            }
                        }
                    }
                }
                $user['jabatan'] = $jabatan;

                unset($user['lembaga_data'], $user['jabatan_data']);
            }
            
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'users' => $users,
                    'pagination' => [
                        'current_page' => $page,
                        'per_page' => $limit,
                        'total' => (int)$total,
                        'total_pages' => ceil($total / $limit)
                    ]
                ]
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Get all users error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data users: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/manage-users - Create new user
     */
    public function createUser(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            
            // NIP: bisa diisi manual atau di-generate (sama seperti NIS santri; digit 1 = 3 L / 4 P, 2–3 = tahun hijriyah, 4–7 = urutan)
            $nip = isset($data['nip']) ? trim((string)$data['nip']) : (isset($data['id']) ? trim((string)$data['id']) : null);
            $nama = $data['nama'] ?? '';
            $status = $data['status'] ?? 'active';
            $email = $data['email'] ?? null;
            $whatsapp = $data['whatsapp'] ?? null;
            $grup = $data['grup'] ?? 1; // Default grup = 1
            $gender = isset($data['gender']) ? trim((string)$data['gender']) : null;
            $tahun_hijriyah = isset($data['tahun_hijriyah']) ? trim((string)$data['tahun_hijriyah']) : null;
            
            if (empty($nama)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nama harus diisi'
                ], 400);
            }
            
            $nipInt = null;
            if ($nip !== null && $nip !== '') {
                if (!ctype_digit($nip) || strlen($nip) > 7) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'NIP harus angka, maksimal 7 digit'
                    ], 400);
                }
                $nipInt = (int) $nip;
                $checkStmt = $this->db->prepare("SELECT id FROM pengurus WHERE nip = ?");
                $checkStmt->execute([$nipInt]);
                if ($checkStmt->fetch()) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'NIP Pengurus sudah digunakan'
                    ], 400);
                }
            } else {
                // Auto-generate NIP (metode sama dengan NIS: 3/4 + tahun hijriyah + urutan)
                if (empty($gender) || empty($tahun_hijriyah)) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Untuk generate NIP otomatis, gender dan tahun_hijriyah wajib diisi'
                    ], 400);
                }
                $normalizedGender = SantriHelper::normalizeGender($gender);
                if ($normalizedGender === null) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Gender tidak valid (gunakan L/P atau Laki-laki/Perempuan)'
                    ], 400);
                }
                $prefix = PengurusHelper::parsePrefixFromGenderAndTahun($normalizedGender, $tahun_hijriyah);
                $this->db->beginTransaction();
                try {
                    $nipStr = PengurusHelper::generateNextNip($this->db, $prefix);
                    $nipInt = (int) $nipStr;
                } catch (\Exception $e) {
                    $this->db->rollBack();
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Gagal generate NIP: ' . $e->getMessage()
                    ], 500);
                }
            }
            
            // Validate status
            $allowedStatuses = ['active', 'inactive', 'pending', 'aktif', 'tidak aktif'];
            if (!in_array(strtolower($status), array_map('strtolower', $allowedStatuses))) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Status tidak valid'
                ], 400);
            }
            
            // Normalize status
            $normalizedStatus = strtolower($status);
            if ($normalizedStatus === 'aktif') {
                $normalizedStatus = 'active';
            } elseif ($normalizedStatus === 'tidak aktif') {
                $normalizedStatus = 'inactive';
            }
            
            // Insert pengurus: id AUTO_INCREMENT, nip dari input atau hasil generate (transaksi sudah aktif bila NIP di-generate)
            try {
                $sql = "INSERT INTO pengurus (nip, nama, status, grup) VALUES (?, ?, ?, ?)";
                $stmt = $this->db->prepare($sql);
                $stmt->execute([$nipInt, $nama, $normalizedStatus, $grup]);
                $newUserId = (int) $this->db->lastInsertId();
                if ($this->db->inTransaction()) {
                    $this->db->commit();
                }
            } catch (\Exception $e) {
                if ($this->db->inTransaction()) {
                    $this->db->rollBack();
                }
                throw $e;
            }
            
            // Handle roles creation if provided
            if (isset($data['roles']) && is_array($data['roles']) && !empty($data['roles'])) {
                // Get current user from request for id_admin
                $currentUser = $request->getAttribute('user');
                $idAdmin = $currentUser['user_id'] ?? $newUserId;
                
                $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
                $insertRoleSql = "INSERT INTO pengurus___role (pengurus_id, role_id, lembaga_id, id_admin, tanggal_dibuat)
                                 VALUES (?, ?, ?, ?, ?)";
                $insertRoleStmt = $this->db->prepare($insertRoleSql);
                
                foreach ($data['roles'] as $roleData) {
                    if (isset($roleData['role_id']) && $roleData['role_id'] !== '' && $roleData['role_id'] !== null) {
                        $roleId = (int)$roleData['role_id'];
                        $lembagaId = isset($roleData['lembaga_id']) && $roleData['lembaga_id'] !== '' ? $roleData['lembaga_id'] : null;
                        $insertRoleStmt->execute([$newUserId, $roleId, $lembagaId, $idAdmin, $waktuIndonesia]);
                    }
                }
            }
            $newRow = $this->db->prepare("SELECT id, nip, nama, status, grup FROM pengurus WHERE id = ?");
            $newRow->execute([$newUserId]);
            $newRow = $newRow->fetch(\PDO::FETCH_ASSOC);
            $actor = $request->getAttribute('user');
            $pengurusId = isset($actor['user_id']) ? (int) $actor['user_id'] : (isset($actor['id']) ? (int) $actor['id'] : null);
            if ($newRow && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_CREATE, 'pengurus', $newUserId, null, $newRow, $request);
            }
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'User berhasil dibuat',
                'data' => [
                    'id' => $newUserId,
                    'nip' => (string) $nipInt,
                    'nama' => $nama,
                    'status' => $normalizedStatus,
                    'grup' => $grup
                ]
            ], 201);
            
        } catch (\Exception $e) {
            error_log("Create user error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal membuat user: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * PUT /api/manage-users/{id} - Update user
     */
    public function updateUser(Request $request, Response $response, array $args): Response
    {
        try {
            $userId = $args['id'] ?? '';
            $data = $request->getParsedBody();
            
            // Log untuk debugging
            error_log("Update user request - User ID: $userId");
            error_log("Update user request - Data: " . json_encode($data));
            error_log("Update user request - Parsed body type: " . gettype($data));
            
            if (empty($userId)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User ID diperlukan'
                ], 400);
            }
            
            // userId dari URL bisa id atau NIP; resolve ke id untuk relasi
            $userIdResolved = is_numeric($userId) ? PengurusHelper::resolveIdByNip($this->db, $userId) : null;
            if ($userIdResolved === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User tidak ditemukan'
                ], 404);
            }
            $userId = $userIdResolved;
            
            $checkStmt = $this->db->prepare("SELECT id, nip, nama, status, grup FROM pengurus WHERE id = ?");
            $checkStmt->execute([$userId]);
            $oldPengurus = $checkStmt->fetch(\PDO::FETCH_ASSOC);
            if (!$oldPengurus) {
                error_log("Update user error: User not found with ID: $userId");
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User tidak ditemukan'
                ], 404);
            }
            
            // Ambil id_user untuk update email/whatsapp/password di tabel users
            $idUserStmt = $this->db->prepare("SELECT id_user FROM pengurus WHERE id = ?");
            $idUserStmt->execute([$userId]);
            $idUserRow = $idUserStmt->fetch(\PDO::FETCH_ASSOC);
            $idUser = $idUserRow && !empty($idUserRow['id_user']) ? (int)$idUserRow['id_user'] : null;
            
            // Build update query untuk pengurus (tanpa email/whatsapp/pw - sudah di users)
            $updateFields = [];
            $params = [];
            
            // Validate and add nama (required)
            if (!isset($data['nama']) || trim($data['nama']) === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nama tidak boleh kosong'
                ], 400);
            }
            $updateFields[] = "nama = ?";
            $params[] = trim($data['nama']);
            
            // Validate and add status (required)
            if (!isset($data['status']) || $data['status'] === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Status harus dipilih'
                ], 400);
            }
            $allowedStatuses = ['active', 'inactive', 'pending', 'aktif', 'tidak aktif'];
            $statusLower = strtolower($data['status']);
            if (!in_array($statusLower, array_map('strtolower', $allowedStatuses))) {
                error_log("Update user error: Invalid status - " . $data['status']);
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Status tidak valid: ' . $data['status']
                ], 400);
            }
            $normalizedStatus = $statusLower;
            if ($normalizedStatus === 'aktif') {
                $normalizedStatus = 'active';
            } elseif ($normalizedStatus === 'tidak aktif') {
                $normalizedStatus = 'inactive';
            }
            $updateFields[] = "status = ?";
            $params[] = $normalizedStatus;
            
            $params[] = $userId;
            $sql = "UPDATE pengurus SET " . implode(", ", $updateFields) . " WHERE id = ?";
            error_log("Update user SQL: $sql");
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            
            // Update email/whatsapp di tabel users jika ada id_user
            if ($idUser !== null) {
                $userUpdates = [];
                $userParams = [];
                if (isset($data['email'])) {
                    $userUpdates[] = "email = ?";
                    $userParams[] = trim($data['email']) !== '' ? trim($data['email']) : null;
                }
                if (isset($data['whatsapp'])) {
                    $userUpdates[] = "no_wa = ?";
                    $userParams[] = trim($data['whatsapp']) !== '' ? trim($data['whatsapp']) : null;
                }
                if (!empty($userUpdates)) {
                    $userParams[] = $idUser;
                    $this->db->prepare("UPDATE users SET " . implode(", ", $userUpdates) . " WHERE id = ?")->execute($userParams);
                }
                // Reset password (users.password = NULL)
                if (isset($data['reset_password']) && $data['reset_password'] === true) {
                    $this->db->prepare("UPDATE users SET password = NULL WHERE id = ?")->execute([$idUser]);
                } elseif (isset($data['password']) && $data['password'] !== '') {
                    if (strlen($data['password']) < 6) {
                        return $this->jsonResponse($response, [
                            'success' => false,
                            'message' => 'Password minimal 6 karakter'
                        ], 400);
                    }
                    $hashedPassword = password_hash($data['password'], PASSWORD_DEFAULT);
                    $this->db->prepare("UPDATE users SET password = ? WHERE id = ?")->execute([$hashedPassword, $idUser]);
                }
            }
            
            // Handle roles update (array of roles)
            if (isset($data['roles']) && is_array($data['roles'])) {
                // Get current user from request for id_admin
                $currentUser = $request->getAttribute('user');
                $idAdmin = $currentUser['user_id'] ?? $userId;
                
                // Delete all existing roles first
                $deleteRolesStmt = $this->db->prepare("DELETE FROM pengurus___role WHERE pengurus_id = ?");
                $deleteRolesStmt->execute([$userId]);
                
                // Insert new roles
                if (!empty($data['roles'])) {
                    $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
                    $insertRoleSql = "INSERT INTO pengurus___role (pengurus_id, role_id, lembaga_id, id_admin, tanggal_dibuat)
                                     VALUES (?, ?, ?, ?, ?)";
                    $insertRoleStmt = $this->db->prepare($insertRoleSql);
                    
                    foreach ($data['roles'] as $roleData) {
                        if (isset($roleData['role_id']) && $roleData['role_id'] !== '' && $roleData['role_id'] !== null) {
                            $roleId = (int)$roleData['role_id'];
                            $lembagaId = isset($roleData['lembaga_id']) && $roleData['lembaga_id'] !== '' ? $roleData['lembaga_id'] : null;
                            $insertRoleStmt->execute([$userId, $roleId, $lembagaId, $idAdmin, $waktuIndonesia]);
                        }
                    }
                }
            }
            $stmtNew = $this->db->prepare("SELECT id, nip, nama, status, grup FROM pengurus WHERE id = ?");
            $stmtNew->execute([$userId]);
            $newPengurus = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            $actor = $request->getAttribute('user');
            $pengurusId = isset($actor['user_id']) ? (int) $actor['user_id'] : (isset($actor['id']) ? (int) $actor['id'] : null);
            if ($newPengurus && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'pengurus', $userId, $oldPengurus, $newPengurus, $request);
            }
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'User berhasil diperbarui'
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Update user error: " . $e->getMessage());
            error_log("Update user stack trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memperbarui user: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * DELETE /api/manage-users/{id} - Delete user
     */
    public function deleteUser(Request $request, Response $response, array $args): Response
    {
        try {
            $userId = $args['id'] ?? '';
            
            if (empty($userId)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User ID atau NIP diperlukan'
                ], 400);
            }
            
            $userIdResolved = is_numeric($userId) ? PengurusHelper::resolveIdByNip($this->db, $userId) : null;
            if ($userIdResolved === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User tidak ditemukan'
                ], 404);
            }
            $userId = $userIdResolved;
            
            $checkStmt = $this->db->prepare("SELECT id, nip, nama, status, grup FROM pengurus WHERE id = ?");
            $checkStmt->execute([$userId]);
            $oldPengurus = $checkStmt->fetch(\PDO::FETCH_ASSOC);
            
            if (!$oldPengurus) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User tidak ditemukan'
                ], 404);
            }
            
            // Prevent deleting super_admin (optional safety check)
            // Cek apakah user memiliki role super_admin menggunakan RoleHelper
            $userRoles = RoleHelper::getUserRoles((int)$userId);
            $hasSuperAdminRole = false;
            foreach ($userRoles as $role) {
                if (isset($role['role_key']) && $role['role_key'] === 'super_admin') {
                    $hasSuperAdminRole = true;
                    break;
                }
            }
            
            if ($hasSuperAdminRole) {
                // Get current user from request
                $currentUser = $request->getAttribute('user');
                $currentUserId = $currentUser['user_id'] ?? '';
                
                // Convert to same type for comparison
                if (is_numeric($currentUserId)) {
                    $currentUserId = (int)$currentUserId;
                }
                
                // Only allow if deleting own account (or remove this check if you want to allow)
                if ($currentUserId !== $userId) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Tidak dapat menghapus akun dengan role super_admin'
                    ], 403);
                }
            }
            
            $stmt = $this->db->prepare("DELETE FROM pengurus WHERE id = ?");
            $stmt->execute([$userId]);
            $actor = $request->getAttribute('user');
            $pengurusId = isset($actor['user_id']) ? (int) $actor['user_id'] : (isset($actor['id']) ? (int) $actor['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_DELETE, 'pengurus', $userId, $oldPengurus, null, $request);
            }
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'User berhasil dihapus'
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Delete user error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus user: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/manage-users/{id} - Get user by ID
     */
    public function getUserById(Request $request, Response $response, array $args): Response
    {
        try {
            $userId = $args['id'] ?? '';
            
            if (empty($userId)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User ID atau NIP diperlukan'
                ], 400);
            }
            
            $userIdResolved = is_numeric($userId) ? PengurusHelper::resolveIdByNip($this->db, $userId) : null;
            if ($userIdResolved === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User tidak ditemukan'
                ], 404);
            }
            $userId = $userIdResolved;
            
            // Get user by id - tampilkan nip untuk frontend
            $sql = "SELECT p.id, p.nip, p.id_user, p.nama, p.status, p.tanggal_dibuat, p.tanggal_update, u.email, u.no_wa AS whatsapp, u.username 
                    FROM pengurus p 
                    LEFT JOIN users u ON u.id = p.id_user 
                    WHERE p.id = ?";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$userId]);
            $user = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            if (!$user) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User tidak ditemukan'
                ], 404);
            }
            
            // Get all roles data from pengurus___role
            $roleSql = "SELECT 
                        r.id as role_id,
                        r.`key` as role_key,
                        r.label as role_label,
                        pr.lembaga_id,
                        pr.id as pengurus_role_id,
                        pr.tanggal_dibuat
                    FROM pengurus___role pr
                    INNER JOIN `role` r ON pr.role_id = r.id
                    WHERE pr.pengurus_id = ?
                    ORDER BY pr.tanggal_dibuat DESC";
            
            $roleStmt = $this->db->prepare($roleSql);
            $roleStmt->execute([$userId]);
            $rolesData = $roleStmt->fetchAll(\PDO::FETCH_ASSOC);
            
            // Auto-set nonaktif jabatan yang tanggal_selesai sudah terlewat
            $autoNonaktifStmt = $this->db->prepare("
                UPDATE pengurus___jabatan 
                SET status = 'nonaktif' 
                WHERE pengurus_id = ? AND status = 'aktif' 
                AND tanggal_selesai IS NOT NULL AND tanggal_selesai < CURDATE()
            ");
            $autoNonaktifStmt->execute([$userId]);
            
            // Get all jabatan data from pengurus___jabatan
            $jabatanSql = "SELECT 
                        j.id as jabatan_id,
                        j.nama as jabatan_nama,
                        j.kategori as jabatan_kategori,
                        pj.lembaga_id,
                        pj.tanggal_mulai,
                        pj.tanggal_selesai,
                        pj.status as jabatan_status,
                        pj.id as pengurus_jabatan_id,
                        pj.tanggal_dibuat
                    FROM pengurus___jabatan pj
                    INNER JOIN jabatan j ON pj.jabatan_id = j.id
                    WHERE pj.pengurus_id = ?
                    ORDER BY pj.tanggal_dibuat DESC";
            
            $jabatanStmt = $this->db->prepare($jabatanSql);
            $jabatanStmt->execute([$userId]);
            $jabatanData = $jabatanStmt->fetchAll(\PDO::FETCH_ASSOC);
            // Normalisasi jabatan_status ke 'aktif' atau 'nonaktif' agar frontend tampil konsisten
            // NULL/kosong di DB dianggap 'aktif' (default di schema)
            foreach ($jabatanData as &$row) {
                $raw = $row['jabatan_status'] ?? null;
                $s = ($raw !== null && $raw !== '') ? strtolower(trim((string) $raw)) : 'aktif';
                $row['jabatan_status'] = ($s === 'aktif' || $s === 'active') ? 'aktif' : 'nonaktif';
            }
            unset($row);

            // Add roles and jabatan arrays to user
            $user['roles'] = $rolesData ?: [];
            $user['jabatan'] = $jabatanData ?: [];
            
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'user' => $user
                ]
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Get user by ID error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data user: ' . $e->getMessage()
            ], 500);
        }
    }
    
    /**
     * GET /api/manage-users/roles/list - Get list of all roles
     */
    public function getRolesList(Request $request, Response $response): Response
    {
        try {
            $sql = "SELECT id, `key`, label FROM `role` ORDER BY id ASC";
            $stmt = $this->db->prepare($sql);
            $stmt->execute();
            $roles = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $roles
            ], 200);
        } catch (\Exception $e) {
            error_log("Get roles list error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data roles: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/manage-users/roles - Create new role
     */
    public function createRole(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            
            $key = $data['key'] ?? '';
            $label = $data['label'] ?? '';
            
            if (empty($key) || empty($label)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Key dan label role harus diisi'
                ], 400);
            }
            
            // Validate key format (lowercase, underscore, no spaces)
            $key = strtolower(trim($key));
            if (!preg_match('/^[a-z0-9_]+$/', $key)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Key role hanya boleh mengandung huruf kecil, angka, dan underscore'
                ], 400);
            }
            
            // Check if key already exists
            $checkStmt = $this->db->prepare("SELECT id FROM `role` WHERE `key` = ?");
            $checkStmt->execute([$key]);
            if ($checkStmt->fetch()) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Key role sudah digunakan'
                ], 400);
            }
            
            // Insert new role
            $sql = "INSERT INTO `role` (`key`, label) VALUES (?, ?)";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$key, trim($label)]);
            
            $newRoleId = (int) $this->db->lastInsertId();
            $newRow = ['id' => $newRoleId, 'key' => $key, 'label' => trim($label)];
            $actor = $request->getAttribute('user');
            $pengurusId = isset($actor['user_id']) ? (int) $actor['user_id'] : (isset($actor['id']) ? (int) $actor['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_CREATE, 'role', $newRoleId, null, $newRow, $request);
            }
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Role berhasil dibuat',
                'data' => [
                    'id' => $newRoleId,
                    'key' => $key,
                    'label' => trim($label)
                ]
            ], 201);
            
        } catch (\Exception $e) {
            error_log("Create role error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal membuat role: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * PUT /api/manage-users/roles/{id} - Update role
     */
    public function updateRole(Request $request, Response $response, array $args): Response
    {
        try {
            $roleId = $args['id'] ?? '';
            $data = $request->getParsedBody();
            
            if (empty($roleId)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Role ID diperlukan'
                ], 400);
            }
            
            $roleId = (int)$roleId;
            
            // Check if role exists
            $checkStmt = $this->db->prepare("SELECT id, `key`, label FROM `role` WHERE id = ?");
            $checkStmt->execute([$roleId]);
            $existingRole = $checkStmt->fetch(\PDO::FETCH_ASSOC);
            
            if (!$existingRole) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Role tidak ditemukan'
                ], 404);
            }
            
            // Build update query
            $updateFields = [];
            $params = [];
            
            // Update key if provided
            if (isset($data['key']) && $data['key'] !== '') {
                $key = strtolower(trim($data['key']));
                if (!preg_match('/^[a-z0-9_]+$/', $key)) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Key role hanya boleh mengandung huruf kecil, angka, dan underscore'
                    ], 400);
                }
                
                // Check if new key already exists (excluding current role)
                $checkKeyStmt = $this->db->prepare("SELECT id FROM `role` WHERE `key` = ? AND id != ?");
                $checkKeyStmt->execute([$key, $roleId]);
                if ($checkKeyStmt->fetch()) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Key role sudah digunakan oleh role lain'
                    ], 400);
                }
                
                $updateFields[] = "`key` = ?";
                $params[] = $key;
            }
            
            // Update label if provided
            if (isset($data['label']) && $data['label'] !== '') {
                $updateFields[] = "label = ?";
                $params[] = trim($data['label']);
            }
            
            if (empty($updateFields)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak ada data yang diubah'
                ], 400);
            }
            
            $params[] = $roleId;
            $sql = "UPDATE `role` SET " . implode(", ", $updateFields) . " WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            
            $updatedStmt = $this->db->prepare("SELECT id, `key`, label FROM `role` WHERE id = ?");
            $updatedStmt->execute([$roleId]);
            $updatedRole = $updatedStmt->fetch(\PDO::FETCH_ASSOC);
            $actor = $request->getAttribute('user');
            $pengurusId = isset($actor['user_id']) ? (int) $actor['user_id'] : (isset($actor['id']) ? (int) $actor['id'] : null);
            if ($updatedRole && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'role', $roleId, $existingRole, $updatedRole, $request);
            }
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Role berhasil diperbarui',
                'data' => $updatedRole
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Update role error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memperbarui role: ' . $e->getMessage()
            ], 500);
        }
    }
    
    /**
     * POST /api/manage-users/{id}/roles - Add role to user
     */
    public function addUserRole(Request $request, Response $response, array $args): Response
    {
        try {
            $userId = $args['id'] ?? '';
            $data = $request->getParsedBody();
            
            if (empty($userId)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User ID atau NIP diperlukan'
                ], 400);
            }
            
            $userIdResolved = is_numeric($userId) ? PengurusHelper::resolveIdByNip($this->db, $userId) : null;
            if ($userIdResolved === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User tidak ditemukan'
                ], 404);
            }
            $userId = $userIdResolved;
            
            $roleId = $data['role_id'] ?? null;
            $lembagaId = isset($data['lembaga_id']) && $data['lembaga_id'] !== '' ? $data['lembaga_id'] : null;
            
            if (!$roleId) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Role ID diperlukan'
                ], 400);
            }
            
            // Check if user exists
            $checkStmt = $this->db->prepare("SELECT id FROM pengurus WHERE id = ?");
            $checkStmt->execute([$userId]);
            if (!$checkStmt->fetch()) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User tidak ditemukan'
                ], 404);
            }
            
            // Check if role already exists for this user
            $checkRoleStmt = $this->db->prepare("SELECT id FROM pengurus___role WHERE pengurus_id = ? AND role_id = ?");
            $checkRoleStmt->execute([$userId, $roleId]);
            if ($checkRoleStmt->fetch()) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Role sudah ada untuk user ini'
                ], 400);
            }
            
            // Get current user from request for id_admin
            $currentUser = $request->getAttribute('user');
            $idAdmin = $currentUser['user_id'] ?? $userId;
            
            // Insert new role
            $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            $insertRoleSql = "INSERT INTO pengurus___role (pengurus_id, role_id, lembaga_id, id_admin, tanggal_dibuat)
                             VALUES (?, ?, ?, ?, ?)";
            $insertRoleStmt = $this->db->prepare($insertRoleSql);
            $insertRoleStmt->execute([$userId, $roleId, $lembagaId, $idAdmin, $waktuIndonesia]);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Role berhasil ditambahkan'
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Add user role error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan role: ' . $e->getMessage()
            ], 500);
        }
    }
    
    /**
     * DELETE /api/manage-users/{id}/roles/{pengurusRoleId} - Remove role from user
     */
    public function removeUserRole(Request $request, Response $response, array $args): Response
    {
        try {
            $userId = $args['id'] ?? '';
            $pengurusRoleId = $args['pengurusRoleId'] ?? '';
            
            if (empty($userId) || empty($pengurusRoleId)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User ID/NIP dan Pengurus Role ID diperlukan'
                ], 400);
            }
            
            $userIdResolved = is_numeric($userId) ? PengurusHelper::resolveIdByNip($this->db, $userId) : null;
            if ($userIdResolved === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User tidak ditemukan'
                ], 404);
            }
            $userId = $userIdResolved;
            if (is_numeric($pengurusRoleId)) {
                $pengurusRoleId = (int)$pengurusRoleId;
            }
            
            // Check if role exists
            $checkStmt = $this->db->prepare("SELECT id FROM pengurus___role WHERE id = ? AND pengurus_id = ?");
            $checkStmt->execute([$pengurusRoleId, $userId]);
            if (!$checkStmt->fetch()) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Role tidak ditemukan'
                ], 404);
            }
            
            // Delete role
            $deleteStmt = $this->db->prepare("DELETE FROM pengurus___role WHERE id = ? AND pengurus_id = ?");
            $deleteStmt->execute([$pengurusRoleId, $userId]);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Role berhasil dihapus'
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Remove user role error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus role: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/manage-users/{id}/jabatan - Add jabatan to user
     */
    public function addUserJabatan(Request $request, Response $response, array $args): Response
    {
        try {
            $userId = $args['id'] ?? '';
            $data = $request->getParsedBody();
            $user = $request->getAttribute('user');
            
            if (empty($userId)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User ID atau NIP diperlukan'
                ], 400);
            }
            
            if (empty($data['jabatan_id'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Jabatan ID diperlukan'
                ], 400);
            }
            
            $userIdResolved = is_numeric($userId) ? PengurusHelper::resolveIdByNip($this->db, $userId) : null;
            if ($userIdResolved === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User tidak ditemukan'
                ], 404);
            }
            $userId = $userIdResolved;
            
            // Check if user exists
            $checkUserStmt = $this->db->prepare("SELECT id FROM pengurus WHERE id = ?");
            $checkUserStmt->execute([$userId]);
            if (!$checkUserStmt->fetch()) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User tidak ditemukan'
                ], 404);
            }
            
            // Check if jabatan exists
            $checkJabatanStmt = $this->db->prepare("SELECT id FROM jabatan WHERE id = ?");
            $checkJabatanStmt->execute([$data['jabatan_id']]);
            if (!$checkJabatanStmt->fetch()) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Jabatan tidak ditemukan'
                ], 404);
            }
            
            // Check if jabatan already assigned to user
            $checkExistingStmt = $this->db->prepare("SELECT id FROM pengurus___jabatan WHERE pengurus_id = ? AND jabatan_id = ? AND status = 'aktif'");
            $checkExistingStmt->execute([$userId, $data['jabatan_id']]);
            if ($checkExistingStmt->fetch()) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Jabatan sudah ditetapkan untuk user ini'
                ], 400);
            }
            
            // Insert jabatan
            $insertSql = "INSERT INTO pengurus___jabatan (pengurus_id, jabatan_id, lembaga_id, tanggal_mulai, tanggal_selesai, status, id_admin) 
                         VALUES (?, ?, ?, ?, ?, ?, ?)";
            
            $insertStmt = $this->db->prepare($insertSql);
            $statusJabatan = isset($data['status']) ? trim((string) $data['status']) : 'aktif';
            if ($statusJabatan !== 'aktif' && $statusJabatan !== 'nonaktif') {
                $statusJabatan = 'aktif';
            }
            $insertStmt->execute([
                $userId,
                $data['jabatan_id'],
                $data['lembaga_id'] ?? null,
                $data['tanggal_mulai'] ?? null,
                $data['tanggal_selesai'] ?? null,
                $statusJabatan,
                $user['user_id'] ?? $userId
            ]);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Jabatan berhasil ditambahkan'
            ], 201);
            
        } catch (\Exception $e) {
            error_log("Add user jabatan error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan jabatan: ' . $e->getMessage()
            ], 500);
        }
    }
    
    /**
     * DELETE /api/manage-users/{id}/jabatan/{pengurusJabatanId} - Remove jabatan from user
     */
    public function removeUserJabatan(Request $request, Response $response, array $args): Response
    {
        try {
            $userId = $args['id'] ?? '';
            $pengurusJabatanId = $args['pengurusJabatanId'] ?? '';
            
            if (empty($userId) || empty($pengurusJabatanId)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User ID/NIP dan Pengurus Jabatan ID diperlukan'
                ], 400);
            }
            
            $userIdResolved = is_numeric($userId) ? PengurusHelper::resolveIdByNip($this->db, $userId) : null;
            if ($userIdResolved === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User tidak ditemukan'
                ], 404);
            }
            $userId = $userIdResolved;
            if (is_numeric($pengurusJabatanId)) {
                $pengurusJabatanId = (int)$pengurusJabatanId;
            }
            
            // Check if jabatan exists
            $checkStmt = $this->db->prepare("SELECT id FROM pengurus___jabatan WHERE id = ? AND pengurus_id = ?");
            $checkStmt->execute([$pengurusJabatanId, $userId]);
            if (!$checkStmt->fetch()) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Jabatan tidak ditemukan'
                ], 404);
            }
            
            // Delete jabatan
            $deleteStmt = $this->db->prepare("DELETE FROM pengurus___jabatan WHERE id = ? AND pengurus_id = ?");
            $deleteStmt->execute([$pengurusJabatanId, $userId]);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Jabatan berhasil dihapus'
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Remove user jabatan error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus jabatan: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * PUT /api/manage-users/{id}/jabatan/{pengurusJabatanId} - Update status jabatan (aktif / nonaktif)
     */
    public function updateUserJabatanStatus(Request $request, Response $response, array $args): Response
    {
        try {
            $userId = $args['id'] ?? '';
            $pengurusJabatanId = $args['pengurusJabatanId'] ?? '';
            $body = $request->getParsedBody() ?: [];
            $status = isset($body['status']) ? trim((string) $body['status']) : '';

            if (empty($userId) || empty($pengurusJabatanId)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User ID/NIP dan Pengurus Jabatan ID diperlukan'
                ], 400);
            }
            if ($status !== 'aktif' && $status !== 'nonaktif') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Status harus aktif atau nonaktif'
                ], 400);
            }

            $userIdResolved = is_numeric($userId) ? PengurusHelper::resolveIdByNip($this->db, $userId) : null;
            if ($userIdResolved === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User tidak ditemukan'
                ], 404);
            }
            $userId = $userIdResolved;
            $pengurusJabatanId = (int) $pengurusJabatanId;

            $checkStmt = $this->db->prepare("SELECT id FROM pengurus___jabatan WHERE id = ? AND pengurus_id = ?");
            $checkStmt->execute([$pengurusJabatanId, $userId]);
            if (!$checkStmt->fetch()) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Jabatan tidak ditemukan'
                ], 404);
            }

            $updateStmt = $this->db->prepare("UPDATE pengurus___jabatan SET status = ? WHERE id = ? AND pengurus_id = ?");
            $updateStmt->execute([$status, $pengurusJabatanId, $userId]);
            $rowCount = $updateStmt->rowCount();

            if ($rowCount === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak ada baris jabatan yang diupdate. Pastikan id jabatan dan pengurus benar.'
                ], 404);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Status jabatan berhasil diperbarui'
            ], 200);
        } catch (\Exception $e) {
            error_log("Update user jabatan status error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memperbarui status jabatan: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/v2/manage-users - List users dari tabel users (super_admin only).
     * Query: type=santri|pengurus|all, search=, limit=, page=, role_id=, lembaga_id= (dari role), jabatan_lembaga_id= (lembaga dari tabel jabatan).
     * Return: users dengan is_santri, is_pengurus, pengurus_id, santri_id, nama (dari pengurus/santri/username).
     */
    public function getAllUsersV2(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $typeFilter = $queryParams['type'] ?? 'all'; // santri | pengurus | all
            $search = trim($queryParams['search'] ?? '');
            $roleId = isset($queryParams['role_id']) ? (int)$queryParams['role_id'] : 0;
            $lembagaId = isset($queryParams['lembaga_id']) ? trim($queryParams['lembaga_id']) : '';
            $jabatanLembagaId = isset($queryParams['jabatan_lembaga_id']) ? trim($queryParams['jabatan_lembaga_id']) : '';
            $limit = isset($queryParams['limit']) ? (int)$queryParams['limit'] : 10000;
            $limit = min(max(1, $limit), 10000);
            $page = isset($queryParams['page']) ? (int)$queryParams['page'] : 1;
            $page = max(1, $page);
            $offset = ($page - 1) * $limit;

            $whereConditions = ["1=1"];
            $params = [];

            // Join untuk filter role / lembaga (dari pengurus___role)
            $joinRole = '';
            if ($roleId > 0 || $lembagaId !== '') {
                $joinRole = " INNER JOIN pengurus___role pr ON p.id = pr.pengurus_id";
            }
            // Join untuk filter lembaga dari tabel jabatan (pengurus___jabatan -> jabatan.lembaga_id)
            $joinJabatan = '';
            if ($jabatanLembagaId !== '') {
                $joinJabatan = " INNER JOIN pengurus___jabatan pj ON p.id = pj.pengurus_id AND pj.status = 'aktif' INNER JOIN jabatan j ON pj.jabatan_id = j.id AND j.lembaga_id = ?";
                $params[] = $jabatanLembagaId;
            }

            if ($roleId > 0) {
                $whereConditions[] = "pr.role_id = ?";
                $params[] = $roleId;
            }
            if ($lembagaId !== '') {
                $whereConditions[] = "pr.lembaga_id = ?";
                $params[] = $lembagaId;
            }

            // Filter tipe: santri = hanya user yang punya record di santri; pengurus = hanya yang punya di pengurus; all = semua
            if ($typeFilter === 'santri') {
                $whereConditions[] = "s.id IS NOT NULL";
            } elseif ($typeFilter === 'pengurus') {
                $whereConditions[] = "p.id IS NOT NULL";
            }

            if ($search !== '') {
                $whereConditions[] = "(u.username LIKE ? OR u.email LIKE ? OR u.no_wa LIKE ? OR p.nama LIKE ? OR s.nama LIKE ?)";
                $searchParam = '%' . $search . '%';
                $params[] = $searchParam;
                $params[] = $searchParam;
                $params[] = $searchParam;
                $params[] = $searchParam;
                $params[] = $searchParam;
            }

            $whereClause = implode(' AND ', $whereConditions);

            // Subquery / join: users LEFT JOIN pengurus, santri; optional INNER JOIN role/jabatan untuk filter
            $countSql = "SELECT COUNT(DISTINCT u.id) AS total
                FROM users u
                LEFT JOIN pengurus p ON p.id_user = u.id
                LEFT JOIN santri s ON s.id_user = u.id
                {$joinRole}
                {$joinJabatan}
                WHERE {$whereClause}";
            $countStmt = $this->db->prepare($countSql);
            $countStmt->execute($params);
            $total = (int) $countStmt->fetch(\PDO::FETCH_ASSOC)['total'];

            $sql = "SELECT DISTINCT
                    u.id,
                    u.username,
                    u.no_wa,
                    u.email,
                    u.role AS user_role,
                    u.tanggal_dibuat,
                    u.tanggal_update,
                    p.id AS pengurus_id,
                    p.nama AS pengurus_nama,
                    p.status AS pengurus_status,
                    s.id AS santri_id,
                    s.nis AS santri_nis,
                    s.nama AS santri_nama
                FROM users u
                LEFT JOIN pengurus p ON p.id_user = u.id
                LEFT JOIN santri s ON s.id_user = u.id
                {$joinRole}
                {$joinJabatan}
                WHERE {$whereClause}
                ORDER BY COALESCE(p.nama, s.nama, u.username) ASC
                LIMIT ? OFFSET ?";
            $params[] = $limit;
            $params[] = $offset;
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $users = [];
            foreach ($rows as $row) {
                $users[] = [
                    'id' => (int) $row['id'],
                    'username' => $row['username'],
                    'no_wa' => $row['no_wa'],
                    'email' => $row['email'],
                    'user_role' => $row['user_role'],
                    'tanggal_dibuat' => $row['tanggal_dibuat'],
                    'tanggal_update' => $row['tanggal_update'],
                    'is_santri' => !empty($row['santri_id']),
                    'is_pengurus' => !empty($row['pengurus_id']),
                    'pengurus_id' => $row['pengurus_id'] ? (int) $row['pengurus_id'] : null,
                    'santri_id' => $row['santri_id'] ? (int) $row['santri_id'] : null,
                    'santri_nis' => $row['santri_nis'] ?? null,
                    'nama' => $row['pengurus_nama'] ?: ($row['santri_nama'] ?: $row['username']),
                    'pengurus_nama' => $row['pengurus_nama'],
                    'santri_nama' => $row['santri_nama'],
                    'status' => $row['pengurus_status'] ?? 'active', // untuk tampilan; users tidak punya status
                ];
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'users' => $users,
                    'pagination' => [
                        'current_page' => $page,
                        'per_page' => $limit,
                        'total' => $total,
                        'total_pages' => (int) ceil($total / $limit),
                    ],
                ],
            ], 200);
        } catch (\Exception $e) {
            error_log('ManageUsersController::getAllUsersV2 ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data users: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /api/v2/manage-users/santri-options - Daftar santri untuk dropdown "Set Akses Mybeddian". Super_admin only.
     * Query: search=, limit= (default 30). Return: id, nis, nama, id_user (jika sudah terhubung akun).
     */
    public function getSantriOptions(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $search = trim($queryParams['search'] ?? '');
            $limit = isset($queryParams['limit']) ? (int) $queryParams['limit'] : 30;
            $limit = min(max(1, $limit), 100);

            $where = ['1=1'];
            $params = [];
            if ($search !== '') {
                $where[] = '(s.nis LIKE ? OR s.nama LIKE ?)';
                $searchParam = '%' . $search . '%';
                $params[] = $searchParam;
                $params[] = $searchParam;
            }
            $params[] = $limit;

            $sql = "SELECT s.id, s.nis, s.nama, s.id_user
                FROM santri s
                WHERE " . implode(' AND ', $where) . "
                ORDER BY s.nama ASC
                LIMIT ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $list = [];
            foreach ($rows as $row) {
                $list[] = [
                    'id' => (int) $row['id'],
                    'nis' => $row['nis'] ?? null,
                    'nama' => $row['nama'] ?? '',
                    'id_user' => $row['id_user'] ? (int) $row['id_user'] : null,
                ];
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $list,
            ], 200);
        } catch (\Exception $e) {
            error_log('ManageUsersController::getSantriOptions ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data santri',
            ], 500);
        }
    }

    /**
     * PUT /api/v2/manage-users/{id}/mybeddian-access - Set atau hapus akses Mybeddian (role santri) untuk user.
     * Body: { santri_id: number | null }. Jika santri_id angka: link santri ke user (user bisa login Mybeddian).
     * Jika santri_id null: lepaskan santri yang saat ini terhubung ke user.
     * Super_admin only.
     */
    public function setMybeddianAccess(Request $request, Response $response, array $args): Response
    {
        try {
            $userId = (int) ($args['id'] ?? 0);
            if ($userId <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID user tidak valid'], 400);
            }

            $data = $request->getParsedBody();
            $santriIdRaw = isset($data['santri_id']) ? $data['santri_id'] : null;
            $santriId = $santriIdRaw === null || $santriIdRaw === '' ? null : (int) $santriIdRaw;

            $stmt = $this->db->prepare("SELECT id FROM users WHERE id = ?");
            $stmt->execute([$userId]);
            if (!$stmt->fetch()) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'User tidak ditemukan'], 404);
            }

            if ($santriId !== null) {
                if ($santriId <= 0) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'ID santri tidak valid'], 400);
                }
                $stmt = $this->db->prepare("SELECT id, id_user FROM santri WHERE id = ?");
                $stmt->execute([$santriId]);
                $santri = $stmt->fetch(\PDO::FETCH_ASSOC);
                if (!$santri) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'Santri tidak ditemukan'], 404);
                }
                // Link santri ke user (boleh overwrite id_user lain - super_admin)
                $this->db->prepare("UPDATE santri SET id_user = ? WHERE id = ?")->execute([$userId, $santriId]);
                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Akses Mybeddian berhasil diaktifkan. User dapat login ke aplikasi Mybeddian dengan akun ini.',
                ], 200);
            }

            // Unlink: lepaskan santri yang terhubung ke user ini
            $upd = $this->db->prepare("UPDATE santri SET id_user = NULL WHERE id_user = ?");
            $upd->execute([$userId]);
            $affected = $upd->rowCount();
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $affected > 0
                    ? 'Akses Mybeddian berhasil dinonaktifkan. User tidak dapat login ke Mybeddian dengan akun ini.'
                    : 'Tidak ada santri yang terhubung ke user ini.',
            ], 200);
        } catch (\Exception $e) {
            error_log('ManageUsersController::setMybeddianAccess ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengubah akses Mybeddian',
            ], 500);
        }
    }

    /**
     * GET /api/v2/manage-users/{id} - Get user by users.id (super_admin only). Return user + pengurus + santri.
     */
    public function getUserByIdV2(Request $request, Response $response, array $args): Response
    {
        try {
            $userId = (int) ($args['id'] ?? 0);
            if ($userId <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }

            $stmt = $this->db->prepare("SELECT u.id, u.username, u.no_wa, u.email, u.role AS user_role, u.email_verified_at, u.no_wa_verified_at, u.tanggal_dibuat, u.tanggal_update
                FROM users u WHERE u.id = ?");
            $stmt->execute([$userId]);
            $user = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$user) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'User tidak ditemukan'], 404);
            }

            $user['id'] = (int) $user['id'];
            $user['pengurus'] = null;
            $user['santri'] = null;

            $pengurusStmt = $this->db->prepare("SELECT p.id, p.nip, p.nama, p.status, p.tanggal_dibuat, p.tanggal_update, u.email, u.no_wa AS whatsapp FROM pengurus p LEFT JOIN users u ON u.id = p.id_user WHERE p.id_user = ?");
            $pengurusStmt->execute([$userId]);
            $pengurus = $pengurusStmt->fetch(\PDO::FETCH_ASSOC);
            if ($pengurus) {
                $pengurus['id'] = (int) $pengurus['id'];
                $user['pengurus'] = $pengurus;
                $user['pengurus_id'] = $pengurus['id'];
            }

            $santriStmt = $this->db->prepare("SELECT id, nis, nama FROM santri WHERE id_user = ?");
            $santriStmt->execute([$userId]);
            $santri = $santriStmt->fetch(\PDO::FETCH_ASSOC);
            if ($santri) {
                $santri['id'] = (int) $santri['id'];
                $user['santri'] = $santri;
                $user['santri_id'] = $santri['id'];
                $user['santri_nis'] = $santri['nis'] ?? null;
            }

            $user['toko'] = [];
            $tokoStmt = $this->db->prepare("SELECT id, nama_toko, kode_toko, id_users, tanggal_dibuat FROM cashless___pedagang WHERE id_users = ?");
            $tokoStmt->execute([$userId]);
            while ($row = $tokoStmt->fetch(\PDO::FETCH_ASSOC)) {
                $row['id'] = (int) $row['id'];
                $user['toko'][] = $row;
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => ['user' => $user],
            ], 200);
        } catch (\Exception $e) {
            error_log('ManageUsersController::getUserByIdV2 ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data user: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * PUT /api/v2/manage-users/{id} - Update no_wa dan email user (tabel users). Super_admin only. Untuk jaga-jaga user ganti nomor WA.
     */
    public function updateUserProfileV2(Request $request, Response $response, array $args): Response
    {
        try {
            $userId = (int) ($args['id'] ?? 0);
            if ($userId <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $data = $request->getParsedBody();
            $noWa = isset($data['no_wa']) ? trim($data['no_wa']) : null;
            $email = isset($data['email']) ? trim($data['email']) : null;

            $stmt = $this->db->prepare("SELECT id FROM users WHERE id = ?");
            $stmt->execute([$userId]);
            if (!$stmt->fetch()) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'User tidak ditemukan'], 404);
            }

            $updates = [];
            $params = [];
            if ($noWa !== null) {
                $updates[] = "no_wa = ?";
                $params[] = $noWa === '' ? null : $noWa;
            }
            if ($email !== null) {
                $updates[] = "email = ?";
                $params[] = $email === '' ? null : $email;
            }
            if (empty($updates)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tidak ada data yang diubah'], 400);
            }
            $params[] = $userId;
            $sql = "UPDATE users SET " . implode(', ', $updates) . " WHERE id = ?";
            $this->db->prepare($sql)->execute($params);

            return $this->jsonResponse($response, ['success' => true, 'message' => 'No WA dan/atau email berhasil diperbarui'], 200);
        } catch (\Exception $e) {
            error_log('ManageUsersController::updateUserProfileV2 ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memperbarui'], 500);
        }
    }

    /**
     * DELETE /api/v2/manage-users/{id} - Hapus akun user (users.id). Unlink santri & pengurus, hapus session, hapus baris users.
     * Super_admin only. Untuk user yang daftar sebagai santri saja (tanpa pengurus) atau siapa pun yang diedit via users.id.
     */
    public function deleteUserV2(Request $request, Response $response, array $args): Response
    {
        try {
            $userId = (int) ($args['id'] ?? 0);
            if ($userId <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID user tidak valid'], 400);
            }

            $stmt = $this->db->prepare("SELECT id, username FROM users WHERE id = ?");
            $stmt->execute([$userId]);
            $user = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$user) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'User tidak ditemukan'], 404);
            }

            // Unlink santri dan pengurus (hapus kaitan login; data santri/pengurus tetap ada)
            $this->db->prepare("UPDATE santri SET id_user = NULL WHERE id_user = ?")->execute([$userId]);
            $this->db->prepare("UPDATE pengurus SET id_user = NULL WHERE id_user = ?")->execute([$userId]);
            // Hapus session
            try {
                $this->db->prepare("DELETE FROM user___sessions WHERE user_id = ?")->execute([$userId]);
            } catch (\Throwable $e) {
                // ignore if table/column missing
            }
            // Hapus baris users
            $this->db->prepare("DELETE FROM users WHERE id = ?")->execute([$userId]);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Akun user berhasil dihapus. Data santri/pengurus tetap tersimpan dan dapat ditautkan ke akun lain.',
            ], 200);
        } catch (\Exception $e) {
            error_log('ManageUsersController::deleteUserV2 ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus user',
            ], 500);
        }
    }

    /**
     * GET /api/v2/manage-users/{id}/sessions - Daftar session aktif user (users.id). Super_admin only.
     */
    public function getUserSessions(Request $request, Response $response, array $args): Response
    {
        try {
            $userId = (int) ($args['id'] ?? 0);
            if ($userId <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $stmt = $this->db->prepare("SELECT id, session_token_hash, ip_address, user_agent, device_type, browser_name, browser_version, os_name, os_version, device_fingerprint, device_id, platform, timezone, language, screen, last_activity_at, created_at
                FROM user___sessions WHERE user_id = ? ORDER BY last_activity_at DESC");
            $stmt->execute([$userId]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            $list = [];
            foreach ($rows as $row) {
                unset($row['session_token_hash']);
                $list[] = [
                    'id' => (int) $row['id'],
                    'ip_address' => $row['ip_address'],
                    'user_agent' => $row['user_agent'],
                    'device_type' => $row['device_type'],
                    'browser_name' => $row['browser_name'],
                    'browser_version' => $row['browser_version'],
                    'os_name' => $row['os_name'],
                    'os_version' => $row['os_version'],
                    'device_fingerprint' => $row['device_fingerprint'],
                    'device_id' => $row['device_id'] ?? null,
                    'platform' => $row['platform'] ?? null,
                    'timezone' => $row['timezone'] ?? null,
                    'language' => $row['language'] ?? null,
                    'screen' => $row['screen'] ?? null,
                    'last_activity_at' => $row['last_activity_at'],
                    'created_at' => $row['created_at'],
                    'current' => false,
                ];
            }
            return $this->jsonResponse($response, ['success' => true, 'data' => $list], 200);
        } catch (\Exception $e) {
            error_log('ManageUsersController::getUserSessions ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil sessions'], 500);
        }
    }

    /**
     * DELETE /api/v2/manage-users/{id}/sessions/{sessionId} - Revoke session user (logout perangkat). Super_admin only.
     */
    public function revokeUserSession(Request $request, Response $response, array $args): Response
    {
        try {
            $userId = (int) ($args['id'] ?? 0);
            $sessionId = (int) ($args['sessionId'] ?? 0);
            if ($userId <= 0 || $sessionId <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $stmt = $this->db->prepare("DELETE FROM user___sessions WHERE id = ? AND user_id = ?");
            $stmt->execute([$sessionId, $userId]);
            if ($stmt->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Session tidak ditemukan'], 404);
            }
            return $this->jsonResponse($response, ['success' => true, 'message' => 'Session telah logout'], 200);
        } catch (\Exception $e) {
            error_log('ManageUsersController::revokeUserSession ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal revoke session'], 500);
        }
    }

    /**
     * POST /api/v2/manage-users/{id}/send-reset-password-link - Kirim link WA untuk buat password baru (super_admin).
     * id = pengurus.id. Tanpa konfirmasi nomor.
     */
    public function sendResetPasswordLink(Request $request, Response $response, array $args): Response
    {
        try {
            $pengurusIdRaw = $args['id'] ?? 0;
            $pengurusId = is_numeric($pengurusIdRaw) ? PengurusHelper::resolveIdByNip($this->db, $pengurusIdRaw) : null;
            if ($pengurusId === null || $pengurusId <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID/NIP tidak valid'], 400);
            }
            $stmt = $this->db->prepare("SELECT p.id_user, p.nama, u.no_wa FROM pengurus p LEFT JOIN users u ON u.id = p.id_user WHERE p.id = ?");
            $stmt->execute([$pengurusId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Pengurus tidak ditemukan'], 404);
            }
            if (empty($row['id_user'])) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'User belum punya akun (users). Minta user daftar dulu.'], 400);
            }
            $userId = (int)$row['id_user'];
            $noWa = isset($row['no_wa']) ? trim($row['no_wa']) : '';
            $noWa = trim($noWa);
            if ($noWa === '') {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Nomor WA pengurus belum diisi'], 400);
            }
            $plainToken = bin2hex(random_bytes(32));
            $tokenHash = hash('sha256', $plainToken);
            $expiresAt = date('Y-m-d H:i:s', time() + 900); // 15 menit
            $ins = $this->db->prepare("INSERT INTO user___password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)");
            $ins->execute([$userId, $tokenHash, $expiresAt]);
            $config = require __DIR__ . '/../../config.php';
            // Gunakan domain yang dipakai user (X-Frontend-Base-URL) agar link production, bukan localhost
            $baseUrl = $this->getFrontendBaseUrl($request, $config);
            $link = $baseUrl . '/ubah-password?token=' . urlencode($plainToken);
            $message = "Link buat password baru (aktif 15 menit):\n" . $link;
            $logContext = ['id_santri' => null, 'id_pengurus' => $pengurusId, 'tujuan' => 'pengurus', 'id_pengurus_pengirim' => null, 'kategori' => 'password_reset', 'sumber' => 'manage_users'];
            $currentUser = $request->getAttribute('user');
            if ($currentUser !== null && (isset($currentUser['id_pengurus']) || isset($currentUser['pengurus_id']) || isset($currentUser['id']))) {
                $logContext['id_pengurus_pengirim'] = (int) ($currentUser['id_pengurus'] ?? $currentUser['pengurus_id'] ?? $currentUser['id']);
            }
            $sendResult = WhatsAppService::sendMessage($noWa, $message, null, $logContext);
            if (!$sendResult['success']) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengirim WA: ' . ($sendResult['message'] ?? '')], 502);
            }
            return $this->jsonResponse($response, ['success' => true, 'message' => 'Link reset password telah dikirim ke WhatsApp user.'], 200);
        } catch (\Exception $e) {
            error_log('ManageUsersController::sendResetPasswordLink ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * Base URL frontend untuk link WA (reset password).
     * Prioritas: X-Frontend-Base-URL → Origin (bukan localhost) → config app.url.
     */
    private function getFrontendBaseUrl(Request $request, array $config): string
    {
        $header = $request->getHeaderLine('X-Frontend-Base-URL');
        $header = trim($header);
        if ($header !== '' && (strpos($header, 'http://') === 0 || strpos($header, 'https://') === 0)) {
            return rtrim($header, '/');
        }
        $origin = trim($request->getHeaderLine('Origin'));
        if ($origin !== '' && (strpos($origin, 'http://') === 0 || strpos($origin, 'https://') === 0)) {
            $host = parse_url($origin, PHP_URL_HOST);
            if ($host && $host !== 'localhost' && $host !== '127.0.0.1') {
                return rtrim($origin, '/');
            }
        }
        return rtrim($config['app']['url'] ?? 'http://localhost:5173', '/');
    }

    /**
     * GET /api/v2/manage-users/toko-options - Daftar toko yang belum punya user (id_users IS NULL) untuk dropdown link. Super_admin only.
     */
    public function getTokoOptions(Request $request, Response $response): Response
    {
        try {
            $stmt = $this->db->prepare("SELECT id, nama_toko, kode_toko FROM cashless___pedagang WHERE id_users IS NULL ORDER BY nama_toko ASC");
            $stmt->execute();
            $list = [];
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $row['id'] = (int) $row['id'];
                $list[] = $row;
            }
            return $this->jsonResponse($response, ['success' => true, 'data' => $list], 200);
        } catch (\Exception $e) {
            error_log('ManageUsersController::getTokoOptions ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * GET /api/v2/manage-users/{id}/toko - Daftar toko yang terhubung ke user (users.id). Super_admin only.
     */
    public function getTokoForUser(Request $request, Response $response, array $args): Response
    {
        try {
            $userId = (int) ($args['id'] ?? 0);
            if ($userId <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID user tidak valid'], 400);
            }
            $stmt = $this->db->prepare("SELECT id, nama_toko, kode_toko, id_users, tanggal_dibuat FROM cashless___pedagang WHERE id_users = ? ORDER BY id ASC");
            $stmt->execute([$userId]);
            $list = [];
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $row['id'] = (int) $row['id'];
                $list[] = $row;
            }
            return $this->jsonResponse($response, ['success' => true, 'data' => $list], 200);
        } catch (\Exception $e) {
            error_log('ManageUsersController::getTokoForUser ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST /api/v2/manage-users/{id}/toko - Beri akses toko ke user: buat toko baru (nama_toko, kode_toko) atau link toko existing (pedagang_id).
     */
    public function addTokoToUser(Request $request, Response $response, array $args): Response
    {
        try {
            $userId = (int) ($args['id'] ?? 0);
            if ($userId <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID user tidak valid'], 400);
            }
            $stmt = $this->db->prepare("SELECT id FROM users WHERE id = ?");
            $stmt->execute([$userId]);
            if (!$stmt->fetch()) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'User tidak ditemukan'], 404);
            }
            $data = $request->getParsedBody() ?? [];
            $pedagangId = isset($data['pedagang_id']) ? (int) $data['pedagang_id'] : 0;
            if ($pedagangId > 0) {
                $up = $this->db->prepare("UPDATE cashless___pedagang SET id_users = ? WHERE id = ?");
                $up->execute([$userId, $pedagangId]);
                if ($up->rowCount() === 0) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'Toko tidak ditemukan'], 404);
                }
                return $this->jsonResponse($response, ['success' => true, 'message' => 'Akses toko berhasil dihubungkan ke user'], 200);
            }
            $namaToko = trim((string) ($data['nama_toko'] ?? ''));
            $kodeToko = trim((string) ($data['kode_toko'] ?? ''));
            if ($namaToko === '' || $kodeToko === '') {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'nama_toko dan kode_toko wajib diisi'], 400);
            }
            $chk = $this->db->prepare("SELECT id FROM cashless___pedagang WHERE kode_toko = ?");
            $chk->execute([$kodeToko]);
            if ($chk->fetch()) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Kode toko sudah dipakai'], 400);
            }
            $ins = $this->db->prepare("INSERT INTO cashless___pedagang (nama_toko, kode_toko, id_users) VALUES (?, ?, ?)");
            $ins->execute([$namaToko, $kodeToko, $userId]);
            $newId = (int) $this->db->lastInsertId();
            return $this->jsonResponse($response, ['success' => true, 'message' => 'Toko berhasil dibuat dan terhubung ke user', 'data' => ['id' => $newId]], 201);
        } catch (\Exception $e) {
            error_log('ManageUsersController::addTokoToUser ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * DELETE /api/v2/manage-users/{id}/toko/{pedagangId} - Cabut akses toko dari user (set id_users = null).
     */
    public function removeTokoFromUser(Request $request, Response $response, array $args): Response
    {
        try {
            $userId = (int) ($args['id'] ?? 0);
            $pedagangId = (int) ($args['pedagangId'] ?? 0);
            if ($userId <= 0 || $pedagangId <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $up = $this->db->prepare("UPDATE cashless___pedagang SET id_users = NULL WHERE id = ? AND id_users = ?");
            $up->execute([$pedagangId, $userId]);
            if ($up->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Toko tidak ditemukan atau tidak terhubung ke user ini'], 404);
            }
            return $this->jsonResponse($response, ['success' => true, 'message' => 'Akses toko berhasil dicabut'], 200);
        } catch (\Exception $e) {
            error_log('ManageUsersController::removeTokoFromUser ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
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

