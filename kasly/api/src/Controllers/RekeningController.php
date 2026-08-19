<?php

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\AuthHelper;
use App\Helpers\RekeningHelper;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class RekeningController
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
        RekeningHelper::cashId($this->db);
    }

    private function json(Response $response, array $payload, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }

    private function parseBody(Request $request): array
    {
        $data = json_decode((string) $request->getBody(), true);
        return is_array($data) ? $data : [];
    }

    /** GET /rekening */
    public function index(Request $request, Response $response): Response
    {
        $q = $request->getQueryParams();
        $aktifOnly = (($q['aktif'] ?? '') !== 'all');
        $rows = RekeningHelper::listWithSaldo($this->db, $aktifOnly);
        $search = trim((string) ($q['q'] ?? ''));
        if ($search !== '') {
            $like = mb_strtolower($search);
            $rows = array_values(array_filter($rows, static function ($row) use ($like) {
                $hay = mb_strtolower(
                    (string) ($row['nama'] ?? '') . ' ' . (string) ($row['nomor'] ?? '') . ' ' . (string) ($row['tipe'] ?? '')
                );
                return str_contains($hay, $like);
            }));
        }

        return $this->json($response, [
            'success' => true,
            'data' => [
                'rekening' => $rows,
                'ringkas' => RekeningHelper::ringkasByTipe($rows),
            ],
        ]);
    }

    /** POST /rekening */
    public function create(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::canManageData($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat menambah rekening'], 403);
        }

        $body = $this->parseBody($request);
        $nama = trim((string) ($body['nama'] ?? ''));
        $tipe = RekeningHelper::normalizeTipe($body['tipe'] ?? null);
        $nomor = trim((string) ($body['nomor'] ?? ''));

        if ($nama === '') {
            return $this->json($response, ['success' => false, 'message' => 'Nama rekening wajib diisi'], 422);
        }
        if ($tipe === null || $tipe === 'cash') {
            return $this->json($response, ['success' => false, 'message' => 'Tipe harus bank atau e-wallet. Cash sudah tersedia.'], 422);
        }

        try {
            $ins = $this->db->prepare(
                'INSERT INTO rekening (nama, tipe, nomor, is_system, aktif, sort_order) VALUES (?, ?, ?, 0, 1, 10)'
            );
            $ins->execute([$nama, $tipe, $nomor !== '' ? $nomor : null]);
        } catch (\PDOException $e) {
            if ((int) $e->getCode() === 23000) {
                return $this->json($response, ['success' => false, 'message' => 'Nama rekening dengan tipe itu sudah ada'], 409);
            }
            throw $e;
        }

        $id = (int) $this->db->lastInsertId();
        $row = $this->find($id);
        return $this->json($response, ['success' => true, 'data' => $row], 201);
    }

    /** PUT /rekening/{id} */
    public function update(Request $request, Response $response, array $args): Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::canManageData($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat mengubah rekening'], 403);
        }

        $id = (int) ($args['id'] ?? 0);
        $existing = $this->find($id);
        if (!$existing) {
            return $this->json($response, ['success' => false, 'message' => 'Rekening tidak ditemukan'], 404);
        }

        $body = $this->parseBody($request);
        $nama = array_key_exists('nama', $body) ? trim((string) $body['nama']) : (string) $existing['nama'];
        $nomor = array_key_exists('nomor', $body) ? trim((string) $body['nomor']) : (string) ($existing['nomor'] ?? '');
        $aktif = array_key_exists('aktif', $body) ? ((int) $body['aktif'] ? 1 : 0) : (int) $existing['aktif'];

        if ($nama === '') {
            return $this->json($response, ['success' => false, 'message' => 'Nama rekening wajib diisi'], 422);
        }
        if ((int) $existing['is_system'] === 1) {
            $aktif = 1;
        }

        try {
            $upd = $this->db->prepare('UPDATE rekening SET nama = ?, nomor = ?, aktif = ? WHERE id = ?');
            $upd->execute([$nama, $nomor !== '' ? $nomor : null, $aktif, $id]);
        } catch (\PDOException $e) {
            if ((int) $e->getCode() === 23000) {
                return $this->json($response, ['success' => false, 'message' => 'Nama rekening dengan tipe itu sudah ada'], 409);
            }
            throw $e;
        }

        return $this->json($response, ['success' => true, 'data' => $this->find($id)]);
    }

    /** DELETE /rekening/{id} */
    public function delete(Request $request, Response $response, array $args): Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::canManageData($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat menghapus rekening'], 403);
        }

        $id = (int) ($args['id'] ?? 0);
        $existing = $this->find($id);
        if (!$existing) {
            return $this->json($response, ['success' => false, 'message' => 'Rekening tidak ditemukan'], 404);
        }
        if ((int) $existing['is_system'] === 1) {
            return $this->json($response, ['success' => false, 'message' => 'Cash wajib ada dan tidak dapat dihapus'], 422);
        }

        $stmtA = $this->db->prepare('SELECT COUNT(*) FROM belanja_alokasi WHERE rekening_id = ?');
        $stmtA->execute([$id]);
        $stmtT = $this->db->prepare('SELECT COUNT(*) FROM rekening_transfer WHERE dari_rekening_id = ? OR ke_rekening_id = ?');
        $stmtT->execute([$id, $id]);
        if ((int) $stmtA->fetchColumn() > 0 || (int) $stmtT->fetchColumn() > 0) {
            return $this->json($response, ['success' => false, 'message' => 'Rekening sudah terpakai. Nonaktifkan saja jika tidak dipakai lagi.'], 422);
        }

        $this->db->prepare('DELETE FROM rekening WHERE id = ?')->execute([$id]);
        return $this->json($response, ['success' => true, 'message' => 'Rekening dihapus']);
    }

    /** GET /rekening/transfer */
    public function listTransfer(Request $request, Response $response): Response
    {
        $stmt = $this->db->query(
            'SELECT t.*, d.nama AS dari_nama, d.tipe AS dari_tipe, k.nama AS ke_nama, k.tipe AS ke_tipe,
                    u.name AS created_by_name
             FROM rekening_transfer t
             INNER JOIN rekening d ON d.id = t.dari_rekening_id
             INNER JOIN rekening k ON k.id = t.ke_rekening_id
             LEFT JOIN users u ON u.id = t.created_by
             ORDER BY t.tanggal DESC, t.id DESC
             LIMIT 80'
        );
        return $this->json($response, ['success' => true, 'data' => $stmt->fetchAll()]);
    }

    /** POST /rekening/transfer */
    public function createTransfer(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::canManageData($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat memindahkan dana'], 403);
        }

        $body = $this->parseBody($request);
        $tanggal = trim((string) ($body['tanggal'] ?? ''));
        $dari = (int) ($body['dari_rekening_id'] ?? 0);
        $ke = (int) ($body['ke_rekening_id'] ?? 0);
        $jumlah = round((float) ($body['jumlah'] ?? 0), 2);
        $biayaAdmin = round((float) ($body['biaya_admin'] ?? 0), 2);
        $keterangan = trim((string) ($body['keterangan'] ?? ''));

        if ($tanggal === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) {
            return $this->json($response, ['success' => false, 'message' => 'Tanggal wajib diisi'], 422);
        }
        if ($dari <= 0 || $ke <= 0 || $dari === $ke) {
            return $this->json($response, ['success' => false, 'message' => 'Pilih rekening asal dan tujuan yang berbeda'], 422);
        }
        if ($jumlah <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'Jumlah pemindahan harus lebih dari 0'], 422);
        }
        if ($biayaAdmin < 0) {
            return $this->json($response, ['success' => false, 'message' => 'Biaya admin tidak boleh negatif'], 422);
        }
        $dariRow = RekeningHelper::rekeningAktif($this->db, $dari);
        $keRow = RekeningHelper::rekeningAktif($this->db, $ke);
        if (!$dariRow || !$keRow) {
            return $this->json($response, ['success' => false, 'message' => 'Rekening tidak aktif'], 422);
        }

        try {
            $this->db->beginTransaction();

            $belanjaId = null;
            if ($biayaAdmin > 0) {
                $ketBelanja = 'Pindah dana ' . (string) $dariRow['nama'] . ' → ' . (string) $keRow['nama'];
                if ($keterangan !== '') {
                    $ketBelanja .= '. ' . $keterangan;
                }
                $belanjaId = RekeningHelper::createKeluarBiayaAdmin(
                    $this->db,
                    $tanggal,
                    $dari,
                    $biayaAdmin,
                    $ketBelanja,
                    isset($user['id']) ? (int) $user['id'] : null
                );
            }

            $ins = $this->db->prepare(
                'INSERT INTO rekening_transfer
                    (tanggal, dari_rekening_id, ke_rekening_id, jumlah, biaya_admin, keterangan, belanja_id, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $ins->execute([
                $tanggal,
                $dari,
                $ke,
                $jumlah,
                $biayaAdmin,
                $keterangan !== '' ? $keterangan : null,
                $belanjaId,
                $user['id'] ?? null,
            ]);

            $this->db->commit();
        } catch (\InvalidArgumentException $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 500);
        }

        return $this->json($response, ['success' => true, 'message' => 'Dana dipindahkan'], 201);
    }

    private function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM rekening WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            return null;
        }
        $saldo = RekeningHelper::saldoMap($this->db);
        $row['saldo'] = round($saldo[$id] ?? 0, 2);
        return $row;
    }
}
