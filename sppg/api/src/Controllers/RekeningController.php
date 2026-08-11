<?php

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\AuthHelper;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class RekeningController
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

    private function parseBody(Request $request): array
    {
        $data = json_decode((string) $request->getBody(), true);
        return is_array($data) ? $data : [];
    }

    /**
     * @return array{ok:bool,message?:string,data?:array}
     */
    private function validatePayload(array $body, bool $partial = false): array
    {
        $nomor = array_key_exists('nomor_rekening', $body) ? trim((string) $body['nomor_rekening']) : null;
        $nama = array_key_exists('nama_penerima', $body) ? trim((string) $body['nama_penerima']) : null;
        $kode = array_key_exists('online_bank_code', $body) ? trim((string) $body['online_bank_code']) : null;
        $bank = array_key_exists('bank_tujuan', $body) ? trim((string) $body['bank_tujuan']) : null;
        $jenis = array_key_exists('jenis', $body) ? strtolower(trim((string) $body['jenis'])) : null;

        if (!$partial) {
            if ($nomor === null || $nomor === '' || $nama === null || $nama === '' || $kode === null || $kode === '' || $bank === null || $bank === '') {
                return ['ok' => false, 'message' => 'Semua field rekening wajib diisi'];
            }
            if ($jenis === null || $jenis === '') {
                $jenis = 'rek';
            }
        }

        if ($nomor !== null && $nomor !== '' && strlen($nomor) > 16) {
            return ['ok' => false, 'message' => 'Nomor rekening maksimal 16 karakter'];
        }
        if ($nama !== null && $nama !== '' && strlen($nama) > 80) {
            return ['ok' => false, 'message' => 'Nama penerima maksimal 80 karakter'];
        }
        if ($kode !== null && $kode !== '' && strlen($kode) > 3) {
            return ['ok' => false, 'message' => 'Online bank code maksimal 3 karakter'];
        }
        if ($bank !== null && $bank !== '' && strlen($bank) > 35) {
            return ['ok' => false, 'message' => 'Bank tujuan maksimal 35 karakter'];
        }
        if ($jenis !== null && $jenis !== '' && !in_array($jenis, ['va', 'rek'], true)) {
            return ['ok' => false, 'message' => 'Jenis rekening harus VA atau Rek'];
        }

        return [
            'ok' => true,
            'data' => [
                'nomor_rekening' => $nomor,
                'nama_penerima' => $nama,
                'online_bank_code' => $kode,
                'bank_tujuan' => $bank,
                'jenis' => $jenis,
                'aktif' => array_key_exists('aktif', $body) ? ((int) $body['aktif'] ? 1 : 0) : null,
            ],
        ];
    }

    private function findById(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM rekening WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /** GET /rekening */
    public function index(Request $request, Response $response): Response
    {
        $q = $request->getQueryParams();
        $sql = 'SELECT * FROM rekening WHERE 1=1';
        $params = [];

        if (($q['aktif'] ?? '') !== 'all') {
            $sql .= ' AND aktif = 1';
        }
        if (!empty($q['q'])) {
            $sql .= ' AND (nomor_rekening LIKE ? OR nama_penerima LIKE ? OR bank_tujuan LIKE ?)';
            $like = '%' . $q['q'] . '%';
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
        }

        $sql .= ' ORDER BY bank_tujuan ASC, nama_penerima ASC';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);

        return $this->json($response, ['success' => true, 'data' => $stmt->fetchAll()]);
    }

    /** POST /rekening */
    public function create(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::canManageData($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat menambah rekening'], 403);
        }

        $check = $this->validatePayload($this->parseBody($request), false);
        if (!$check['ok']) {
            return $this->json($response, ['success' => false, 'message' => $check['message']], 422);
        }
        $data = $check['data'];

        try {
            $ins = $this->db->prepare(
                'INSERT INTO rekening (nomor_rekening, nama_penerima, online_bank_code, bank_tujuan, jenis) VALUES (?, ?, ?, ?, ?)'
            );
            $ins->execute([
                $data['nomor_rekening'],
                $data['nama_penerima'],
                $data['online_bank_code'],
                $data['bank_tujuan'],
                $data['jenis'] ?: 'rek',
            ]);
            $row = $this->findById((int) $this->db->lastInsertId());
            return $this->json($response, ['success' => true, 'data' => $row], 201);
        } catch (\PDOException $e) {
            if ((int) $e->getCode() === 23000) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor rekening sudah ada'], 409);
            }
            throw $e;
        }
    }

    /** PUT /rekening/{id} */
    public function update(Request $request, Response $response, array $args): Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::canManageData($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat mengubah rekening'], 403);
        }

        $id = (int) ($args['id'] ?? 0);
        $existing = $this->findById($id);
        if (!$existing) {
            return $this->json($response, ['success' => false, 'message' => 'Rekening tidak ditemukan'], 404);
        }

        $check = $this->validatePayload($this->parseBody($request), true);
        if (!$check['ok']) {
            return $this->json($response, ['success' => false, 'message' => $check['message']], 422);
        }
        $data = $check['data'];

        $nomor = $data['nomor_rekening'] !== null && $data['nomor_rekening'] !== ''
            ? $data['nomor_rekening']
            : $existing['nomor_rekening'];
        $nama = $data['nama_penerima'] !== null && $data['nama_penerima'] !== ''
            ? $data['nama_penerima']
            : $existing['nama_penerima'];
        $kode = $data['online_bank_code'] !== null && $data['online_bank_code'] !== ''
            ? $data['online_bank_code']
            : $existing['online_bank_code'];
        $bank = $data['bank_tujuan'] !== null && $data['bank_tujuan'] !== ''
            ? $data['bank_tujuan']
            : $existing['bank_tujuan'];
        $jenis = $data['jenis'] !== null && $data['jenis'] !== ''
            ? $data['jenis']
            : ($existing['jenis'] ?? 'rek');
        $aktif = $data['aktif'] !== null ? $data['aktif'] : (int) $existing['aktif'];

        if ($nomor === '' || $nama === '' || $kode === '' || $bank === '') {
            return $this->json($response, ['success' => false, 'message' => 'Semua field rekening wajib diisi'], 422);
        }

        try {
            $upd = $this->db->prepare(
                'UPDATE rekening
                 SET nomor_rekening = ?, nama_penerima = ?, online_bank_code = ?, bank_tujuan = ?, jenis = ?, aktif = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?'
            );
            $upd->execute([$nomor, $nama, $kode, $bank, $jenis, $aktif, $id]);
            return $this->json($response, ['success' => true, 'data' => $this->findById($id)]);
        } catch (\PDOException $e) {
            if ((int) $e->getCode() === 23000) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor rekening sudah dipakai rekening lain'], 409);
            }
            throw $e;
        }
    }

    /** DELETE /rekening/{id} */
    public function delete(Request $request, Response $response, array $args): Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::canManageData($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat menghapus rekening'], 403);
        }

        $id = (int) ($args['id'] ?? 0);
        if (!$this->findById($id)) {
            return $this->json($response, ['success' => false, 'message' => 'Rekening tidak ditemukan'], 404);
        }

        // Lepas referensi belanja agar FK tidak menghalangi hapus
        $this->db->prepare('UPDATE belanja SET rekening_id = NULL WHERE rekening_id = ?')->execute([$id]);
        $stmt = $this->db->prepare('DELETE FROM rekening WHERE id = ?');
        $stmt->execute([$id]);

        return $this->json($response, ['success' => true, 'message' => 'Rekening dihapus']);
    }
}
