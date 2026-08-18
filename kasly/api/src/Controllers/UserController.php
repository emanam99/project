<?php

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\AuthHelper;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class UserController
{
    private const ROLES = ['user', 'admin', 'super_admin', 'pending'];

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

    /** GET /users */
    public function index(Request $request, Response $response): Response
    {
        if ($denied = $this->requireSuperAdmin($request, $response)) {
            return $denied;
        }

        $rows = $this->db->query(
            'SELECT id, email, name, picture, google_id, role, created_at, updated_at
             FROM users
             ORDER BY FIELD(role, "super_admin", "admin", "user", "pending"), name ASC, email ASC'
        )->fetchAll();

        return $this->json($response, ['success' => true, 'data' => $rows]);
    }

    /** POST /users — pre-register email + role */
    public function create(Request $request, Response $response): Response
    {
        if ($denied = $this->requireSuperAdmin($request, $response)) {
            return $denied;
        }

        $actor = $request->getAttribute('user');
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
        if ($role === 'super_admin' && ($actor['role'] ?? '') !== 'super_admin') {
            return $this->json($response, ['success' => false, 'message' => 'Hanya super admin yang dapat menambah super admin'], 403);
        }

        $check = $this->db->prepare('SELECT id, role FROM users WHERE email = ?');
        $check->execute([$email]);
        $existing = $check->fetch();
        if ($existing) {
            if (($existing['role'] ?? '') === 'pending') {
                $upd = $this->db->prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
                $upd->execute([$role, $existing['id']]);
                return $this->json($response, [
                    'success' => true,
                    'data' => AuthHelper::getUserById((int) $existing['id']),
                ]);
            }
            return $this->json($response, ['success' => false, 'message' => 'Email sudah terdaftar'], 409);
        }

        $ins = $this->db->prepare('INSERT INTO users (email, name, role) VALUES (?, ?, ?)');
        $ins->execute([$email, $email, $role]);

        $user = AuthHelper::getUserById((int) $this->db->lastInsertId());
        return $this->json($response, ['success' => true, 'data' => $user], 201);
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

        if (!in_array($role, self::ROLES, true)) {
            return $this->json($response, ['success' => false, 'message' => 'Role tidak valid'], 422);
        }

        $target = AuthHelper::getUserById($id);
        if (!$target) {
            return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 404);
        }

        if ((int) $actor['id'] === $id) {
            $demotingSelf = $role === 'pending' || ($role === 'user' && AuthHelper::isAdminRole($actor['role'] ?? null));
            if ($demotingSelf) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak dapat menurunkan role diri sendiri'], 422);
            }
        }

        $upd = $this->db->prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        $upd->execute([$role, $id]);

        return $this->json($response, [
            'success' => true,
            'data' => AuthHelper::getUserById($id),
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

        if (($target['role'] ?? '') === 'super_admin') {
            $count = (int) $this->db->query(
                "SELECT COUNT(*) FROM users WHERE role = 'super_admin'"
            )->fetchColumn();
            if ($count <= 1) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Tidak dapat menghapus super admin terakhir',
                ], 422);
            }
        }

        $del = $this->db->prepare('DELETE FROM users WHERE id = ?');
        $del->execute([$id]);

        return $this->json($response, [
            'success' => true,
            'message' => 'Pengguna dihapus',
        ]);
    }
}
