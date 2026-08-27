<?php

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\AuthHelper;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class UserController
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    private function json(Response $response, array $payload, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }

    private function requireSuperAdmin(Request $request, Response $response): ?Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::isSuperAdminRole($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses super admin diperlukan'], 403);
        }
        return null;
    }

    private function mapUserRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'email' => $row['email'],
            'name' => $row['name'],
            'picture' => $row['picture'],
            'google_id' => $row['google_id'],
            'role' => $row['role'],
            'pelanggan_id' => isset($row['pelanggan_id']) && $row['pelanggan_id'] !== null
                ? (int) $row['pelanggan_id']
                : null,
            'pelanggan_nama' => $row['pelanggan_nama'] ?? null,
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
        ];
    }

    /** GET /users — sembunyikan hanya email SUPER_ADMIN_EMAIL */
    public function index(Request $request, Response $response): Response
    {
        if ($denied = $this->requireSuperAdmin($request, $response)) {
            return $denied;
        }

        $hidden = AuthHelper::hiddenSuperAdminEmail();
        $sql = '
            SELECT u.id, u.email, u.name, u.picture, u.google_id, u.role, u.pelanggan_id,
                   p.nama AS pelanggan_nama, u.created_at, u.updated_at
            FROM users u
            LEFT JOIN pelanggan p ON p.id = u.pelanggan_id
        ';
        $bind = [];
        if ($hidden !== '') {
            $sql .= ' WHERE LOWER(u.email) <> :hidden';
            $bind['hidden'] = $hidden;
        }
        $sql .= ' ORDER BY FIELD(u.role, "super_admin", "admin", "user", "pending"), u.name ASC, u.email ASC';

        $stmt = $this->db->prepare($sql);
        $stmt->execute($bind);
        $rows = array_map(fn ($r) => $this->mapUserRow($r), $stmt->fetchAll());

        return $this->json($response, ['success' => true, 'data' => $rows]);
    }

    /** POST /users — pre-register email + role */
    public function create(Request $request, Response $response): Response
    {
        if ($denied = $this->requireSuperAdmin($request, $response)) {
            return $denied;
        }

        $body = json_decode((string) $request->getBody(), true);
        $body = is_array($body) ? $body : [];

        $email = strtolower(trim((string) ($body['email'] ?? '')));
        $role = trim((string) ($body['role'] ?? 'user'));

        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return $this->json($response, ['success' => false, 'message' => 'Email tidak valid'], 422);
        }
        if (!in_array($role, ['user', 'admin', 'super_admin'], true)) {
            return $this->json($response, ['success' => false, 'message' => 'Role tidak valid'], 422);
        }

        if (AuthHelper::isHiddenSuperAdminEmail($email)) {
            return $this->json($response, ['success' => false, 'message' => 'Email ini tidak dapat ditambahkan ke daftar'], 422);
        }

        $check = $this->db->prepare('SELECT id, role FROM users WHERE email = ?');
        $check->execute([$email]);
        $existing = $check->fetch();
        if ($existing) {
            if (AuthHelper::isHiddenSuperAdminEmail($email)) {
                return $this->json($response, ['success' => false, 'message' => 'Email tidak tersedia'], 409);
            }
            if (($existing['role'] ?? '') === 'pending') {
                $upd = $this->db->prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
                $upd->execute([$role, $existing['id']]);
                return $this->json($response, [
                    'success' => true,
                    'data' => AuthHelper::publicUser(AuthHelper::getUserById((int) $existing['id'])),
                ]);
            }
            return $this->json($response, ['success' => false, 'message' => 'Email sudah terdaftar'], 409);
        }

        $ins = $this->db->prepare('INSERT INTO users (email, name, role) VALUES (?, ?, ?)');
        $ins->execute([$email, $email, $role]);

        $user = AuthHelper::getUserById((int) $this->db->lastInsertId());
        return $this->json($response, ['success' => true, 'data' => AuthHelper::publicUser($user)], 201);
    }

    /** PUT /users/{id}/role */
    public function updateRole(Request $request, Response $response, array $args): Response
    {
        if ($denied = $this->requireSuperAdmin($request, $response)) {
            return $denied;
        }

        $actor = $request->getAttribute('user');
        $id = (int) ($args['id'] ?? 0);
        $body = json_decode((string) $request->getBody(), true);
        $body = is_array($body) ? $body : [];
        $role = trim((string) ($body['role'] ?? ''));

        if (!in_array($role, ['user', 'admin', 'super_admin', 'pending'], true)) {
            return $this->json($response, ['success' => false, 'message' => 'Role tidak valid'], 422);
        }

        $target = AuthHelper::getUserById($id);
        if (!$target) {
            return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 404);
        }

        if (AuthHelper::isHiddenSuperAdminEmail($target['email'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak dapat mengubah akun ini'], 403);
        }
        if ((int) $actor['id'] === $id) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak dapat mengubah role diri sendiri'], 422);
        }

        $upd = $this->db->prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        $upd->execute([$role, $id]);

        return $this->json($response, [
            'success' => true,
            'data' => AuthHelper::publicUser(AuthHelper::getUserById($id)),
        ]);
    }

    /** PUT /users/{id}/pelanggan — hubungkan / lepaskan pelanggan */
    public function linkPelanggan(Request $request, Response $response, array $args): Response
    {
        if ($denied = $this->requireSuperAdmin($request, $response)) {
            return $denied;
        }

        $id = (int) ($args['id'] ?? 0);
        $body = json_decode((string) $request->getBody(), true);
        $body = is_array($body) ? $body : [];

        $target = AuthHelper::getUserById($id);
        if (!$target) {
            return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 404);
        }
        if (AuthHelper::isHiddenSuperAdminEmail($target['email'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak dapat mengubah akun ini'], 403);
        }

        $pelangganId = array_key_exists('pelanggan_id', $body)
            ? ($body['pelanggan_id'] === null || $body['pelanggan_id'] === '' ? null : (int) $body['pelanggan_id'])
            : null;

        if ($pelangganId !== null) {
            if ($pelangganId <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'pelanggan_id tidak valid'], 422);
            }
            $check = $this->db->prepare('SELECT id FROM pelanggan WHERE id = ? LIMIT 1');
            $check->execute([$pelangganId]);
            if (!$check->fetch()) {
                return $this->json($response, ['success' => false, 'message' => 'Pelanggan tidak ditemukan'], 404);
            }
        }

        $upd = $this->db->prepare('UPDATE users SET pelanggan_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        $upd->execute([$pelangganId, $id]);

        return $this->json($response, [
            'success' => true,
            'data' => AuthHelper::publicUser(AuthHelper::getUserById($id)),
        ]);
    }

    /** DELETE /users/{id} */
    public function delete(Request $request, Response $response, array $args): Response
    {
        if ($denied = $this->requireSuperAdmin($request, $response)) {
            return $denied;
        }

        $actor = $request->getAttribute('user');
        $id = (int) ($args['id'] ?? 0);
        $target = AuthHelper::getUserById($id);
        if (!$target) {
            return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 404);
        }

        if ((int) ($actor['id'] ?? 0) === $id) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak dapat menghapus akun sendiri'], 422);
        }

        if (AuthHelper::isHiddenSuperAdminEmail($target['email'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak dapat menghapus akun ini'], 403);
        }

        $del = $this->db->prepare('DELETE FROM users WHERE id = ?');
        $del->execute([$id]);

        return $this->json($response, [
            'success' => true,
            'message' => 'Pengguna dihapus',
        ]);
    }
}
