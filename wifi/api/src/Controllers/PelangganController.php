<?php

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\AuthHelper;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class PelangganController
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

    private function denyUnlessManage(Request $request, Response $response): ?Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::canManageData($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
        }
        return null;
    }

    private function parseBody(Request $request): array
    {
        $body = json_decode((string) $request->getBody(), true);
        return is_array($body) ? $body : [];
    }

    private function rowToPublic(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'nama' => $row['nama'],
            'no_hp' => $row['no_hp'],
            'alamat' => $row['alamat'],
            'paket' => $row['paket'],
            'aktif' => (int) $row['aktif'] === 1,
            'keterangan' => $row['keterangan'],
            'user_email' => $row['user_email'] ?? null,
            'user_id' => isset($row['user_id']) && $row['user_id'] !== null ? (int) $row['user_id'] : null,
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
        ];
    }

    private function fetchPublicById(int $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT p.*, u.email AS user_email, u.id AS user_id
             FROM pelanggan p
             LEFT JOIN users u ON u.pelanggan_id = p.id
             WHERE p.id = ?
             LIMIT 1'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ? $this->rowToPublic($row) : null;
    }

    /**
     * Hubungkan / buat user dari email pelanggan.
     * @return string|null pesan error
     */
    private function syncLinkedUser(int $pelangganId, string $nama, ?string $emailInput): ?string
    {
        $email = strtolower(trim((string) $emailInput));

        $unlink = $this->db->prepare(
            'UPDATE users SET pelanggan_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE pelanggan_id = ?'
        );

        if ($email === '') {
            $unlink->execute([$pelangganId]);
            return null;
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return 'Email tidak valid';
        }
        if (AuthHelper::isHiddenSuperAdminEmail($email)) {
            return 'Email ini tidak dapat dihubungkan';
        }

        $unlink->execute([$pelangganId]);

        $find = $this->db->prepare('SELECT id, role FROM users WHERE email = ? LIMIT 1');
        $find->execute([$email]);
        $user = $find->fetch();

        if ($user) {
            if (($user['role'] ?? '') === 'pending') {
                $upd = $this->db->prepare(
                    'UPDATE users SET pelanggan_id = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
                );
                $upd->execute([$pelangganId, 'user', (int) $user['id']]);
            } else {
                $upd = $this->db->prepare(
                    'UPDATE users SET pelanggan_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
                );
                $upd->execute([$pelangganId, (int) $user['id']]);
            }
            return null;
        }

        $ins = $this->db->prepare(
            'INSERT INTO users (email, name, role, pelanggan_id) VALUES (?, ?, ?, ?)'
        );
        $ins->execute([$email, $nama !== '' ? $nama : $email, 'user', $pelangganId]);
        return null;
    }

    /** GET /pelanggan */
    public function index(Request $request, Response $response): Response
    {
        if ($denied = $this->denyUnlessManage($request, $response)) {
            return $denied;
        }
        $params = $request->getQueryParams();
        $q = trim((string) ($params['q'] ?? ''));
        $aktif = $params['aktif'] ?? null;

        $sql = '
            SELECT p.*, u.email AS user_email, u.id AS user_id
            FROM pelanggan p
            LEFT JOIN users u ON u.pelanggan_id = p.id
            WHERE 1=1
        ';
        $bind = [];

        if ($q !== '') {
            $sql .= ' AND (p.nama LIKE :q OR p.no_hp LIKE :q OR p.alamat LIKE :q OR p.paket LIKE :q OR u.email LIKE :q)';
            $bind['q'] = '%' . $q . '%';
        }
        if ($aktif === '1' || $aktif === '0') {
            $sql .= ' AND p.aktif = :aktif';
            $bind['aktif'] = (int) $aktif;
        }

        $sql .= ' ORDER BY p.aktif DESC, p.nama ASC';

        $stmt = $this->db->prepare($sql);
        $stmt->execute($bind);
        $rows = array_map(fn ($r) => $this->rowToPublic($r), $stmt->fetchAll());

        return $this->json($response, ['success' => true, 'data' => $rows]);
    }

    /** GET /pelanggan/{id} */
    public function show(Request $request, Response $response, array $args): Response
    {
        if ($denied = $this->denyUnlessManage($request, $response)) {
            return $denied;
        }
        $id = (int) ($args['id'] ?? 0);
        $data = $this->fetchPublicById($id);
        if (!$data) {
            return $this->json($response, ['success' => false, 'message' => 'Pelanggan tidak ditemukan'], 404);
        }
        return $this->json($response, ['success' => true, 'data' => $data]);
    }

    /** POST /pelanggan */
    public function create(Request $request, Response $response): Response
    {
        if ($denied = $this->denyUnlessManage($request, $response)) {
            return $denied;
        }
        $body = $this->parseBody($request);
        $nama = trim((string) ($body['nama'] ?? ''));
        if ($nama === '') {
            return $this->json($response, ['success' => false, 'message' => 'Nama wajib diisi'], 422);
        }

        $email = array_key_exists('email', $body) ? trim((string) $body['email']) : '';

        $this->db->beginTransaction();
        try {
            $ins = $this->db->prepare(
                'INSERT INTO pelanggan (nama, no_hp, alamat, paket, aktif, keterangan)
                 VALUES (?, ?, ?, ?, ?, ?)'
            );
            $ins->execute([
                $nama,
                trim((string) ($body['no_hp'] ?? '')) ?: null,
                trim((string) ($body['alamat'] ?? '')) ?: null,
                trim((string) ($body['paket'] ?? '')) ?: null,
                !empty($body['aktif']) || !array_key_exists('aktif', $body) ? 1 : 0,
                trim((string) ($body['keterangan'] ?? '')) ?: null,
            ]);
            $id = (int) $this->db->lastInsertId();

            $syncErr = $this->syncLinkedUser($id, $nama, $email);
            if ($syncErr !== null) {
                throw new \RuntimeException($syncErr);
            }

            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 422);
        }

        return $this->json($response, [
            'success' => true,
            'data' => $this->fetchPublicById($id),
        ], 201);
    }

    /**
     * POST /pelanggan/import
     * Body: { items: [{ nama, email?, no_hp?, alamat?, paket?, keterangan?, aktif? }] }
     */
    public function import(Request $request, Response $response): Response
    {
        if ($denied = $this->denyUnlessManage($request, $response)) {
            return $denied;
        }
        $body = $this->parseBody($request);
        $items = $body['items'] ?? null;
        if (!is_array($items) || count($items) === 0) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak ada data untuk diimpor'], 422);
        }
        if (count($items) > 500) {
            return $this->json($response, ['success' => false, 'message' => 'Maksimal 500 baris per impor'], 422);
        }

        $created = [];
        $failed = [];
        $seenEmails = [];

        $emailLinked = $this->db->prepare(
            'SELECT id, pelanggan_id FROM users WHERE email = ? LIMIT 1'
        );
        $ins = $this->db->prepare(
            'INSERT INTO pelanggan (nama, no_hp, alamat, paket, aktif, keterangan)
             VALUES (?, ?, ?, ?, ?, ?)'
        );

        $this->db->beginTransaction();
        try {
            foreach ($items as $index => $raw) {
                if (!is_array($raw)) {
                    $failed[] = ['index' => (int) $index, 'message' => 'Baris tidak valid'];
                    continue;
                }
                $nama = trim((string) ($raw['nama'] ?? ''));
                if ($nama === '') {
                    $failed[] = ['index' => (int) $index, 'message' => 'Nama wajib diisi'];
                    continue;
                }

                $email = strtolower(trim((string) ($raw['email'] ?? '')));
                if ($email !== '') {
                    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                        $failed[] = ['index' => (int) $index, 'message' => 'Email tidak valid'];
                        continue;
                    }
                    if (isset($seenEmails[$email])) {
                        $failed[] = [
                            'index' => (int) $index,
                            'message' => 'Email duplikat dalam file (baris sebelumnya)',
                        ];
                        continue;
                    }
                    $emailLinked->execute([$email]);
                    $u = $emailLinked->fetch();
                    if ($u && $u['pelanggan_id'] !== null && (int) $u['pelanggan_id'] > 0) {
                        $failed[] = [
                            'index' => (int) $index,
                            'message' => 'Email sudah terhubung ke pelanggan lain',
                        ];
                        continue;
                    }
                    $seenEmails[$email] = true;
                }

                try {
                    $this->db->exec('SAVEPOINT sp_import_row');
                    $ins->execute([
                        $nama,
                        trim((string) ($raw['no_hp'] ?? '')) ?: null,
                        trim((string) ($raw['alamat'] ?? '')) ?: null,
                        trim((string) ($raw['paket'] ?? '')) ?: null,
                        !empty($raw['aktif']) || !array_key_exists('aktif', $raw) ? 1 : 0,
                        trim((string) ($raw['keterangan'] ?? '')) ?: null,
                    ]);
                    $id = (int) $this->db->lastInsertId();
                    $syncErr = $this->syncLinkedUser($id, $nama, $email);
                    if ($syncErr !== null) {
                        throw new \RuntimeException($syncErr);
                    }
                    $this->db->exec('RELEASE SAVEPOINT sp_import_row');
                    $row = $this->fetchPublicById($id);
                    if ($row) {
                        $created[] = $row;
                    }
                } catch (\Throwable $e) {
                    try {
                        $this->db->exec('ROLLBACK TO SAVEPOINT sp_import_row');
                    } catch (\Throwable $ignored) {
                    }
                    $failed[] = ['index' => (int) $index, 'message' => $e->getMessage()];
                }
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 422);
        }

        return $this->json($response, [
            'success' => count($failed) === 0,
            'created' => count($created),
            'failed' => $failed,
            'data' => $created,
            'message' => sprintf(
                '%d berhasil%s',
                count($created),
                count($failed) > 0 ? ', ' . count($failed) . ' gagal' : ''
            ),
        ], count($created) > 0 ? 201 : 422);
    }

    /** PUT /pelanggan/{id} */
    public function update(Request $request, Response $response, array $args): Response
    {
        if ($denied = $this->denyUnlessManage($request, $response)) {
            return $denied;
        }
        $id = (int) ($args['id'] ?? 0);
        $stmt = $this->db->prepare('SELECT * FROM pelanggan WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $existing = $stmt->fetch();
        if (!$existing) {
            return $this->json($response, ['success' => false, 'message' => 'Pelanggan tidak ditemukan'], 404);
        }

        $body = $this->parseBody($request);
        $nama = array_key_exists('nama', $body) ? trim((string) $body['nama']) : $existing['nama'];
        if ($nama === '') {
            return $this->json($response, ['success' => false, 'message' => 'Nama wajib diisi'], 422);
        }

        $this->db->beginTransaction();
        try {
            $upd = $this->db->prepare(
                'UPDATE pelanggan SET nama = ?, no_hp = ?, alamat = ?, paket = ?, aktif = ?, keterangan = ?,
                 updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            );
            $upd->execute([
                $nama,
                array_key_exists('no_hp', $body) ? (trim((string) $body['no_hp']) ?: null) : $existing['no_hp'],
                array_key_exists('alamat', $body) ? (trim((string) $body['alamat']) ?: null) : $existing['alamat'],
                array_key_exists('paket', $body) ? (trim((string) $body['paket']) ?: null) : $existing['paket'],
                array_key_exists('aktif', $body) ? (!empty($body['aktif']) ? 1 : 0) : (int) $existing['aktif'],
                array_key_exists('keterangan', $body)
                    ? (trim((string) $body['keterangan']) ?: null)
                    : $existing['keterangan'],
                $id,
            ]);

            if (array_key_exists('email', $body)) {
                $syncErr = $this->syncLinkedUser($id, $nama, trim((string) $body['email']));
                if ($syncErr !== null) {
                    throw new \RuntimeException($syncErr);
                }
            }

            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 422);
        }

        return $this->json($response, [
            'success' => true,
            'data' => $this->fetchPublicById($id),
        ]);
    }

    /** DELETE /pelanggan/{id} */
    public function delete(Request $request, Response $response, array $args): Response
    {
        if ($denied = $this->denyUnlessManage($request, $response)) {
            return $denied;
        }
        $id = (int) ($args['id'] ?? 0);
        $stmt = $this->db->prepare('SELECT id FROM pelanggan WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            return $this->json($response, ['success' => false, 'message' => 'Pelanggan tidak ditemukan'], 404);
        }

        // Lepas user terkait (FK SET NULL jika ada; pastikan eksplisit)
        $unlink = $this->db->prepare(
            'UPDATE users SET pelanggan_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE pelanggan_id = ?'
        );
        $unlink->execute([$id]);

        $del = $this->db->prepare('DELETE FROM pelanggan WHERE id = ?');
        $del->execute([$id]);

        return $this->json($response, ['success' => true, 'message' => 'Pelanggan dihapus']);
    }
}
