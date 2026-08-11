<?php

namespace App\Controllers;

use App\Config\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class KelasController {
    public function index(Request $request, Response $response): Response {
        $db = Database::getInstance();
        $stmt = $db->query('
            SELECT k.id, k.nama_kelas, k.kel, k.wali_kelas_id, p.nama AS wali_kelas_nama
            FROM kelas k
            LEFT JOIN pengurus p ON p.id = k.wali_kelas_id
            ORDER BY k.nama_kelas ASC, k.kel ASC
        ');

        return $this->jsonResponse($response, ['success' => true, 'data' => $stmt->fetchAll()]);
    }

    public function create(Request $request, Response $response): Response {
        $data = $this->parseBody($request);
        $namaKelas = trim($data['nama_kelas'] ?? '');
        $kel = trim($data['kel'] ?? '');
        $waliKelasId = $this->normalizeOptionalId($data['wali_kelas_id'] ?? null);

        if ($namaKelas === '') {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Nama kelas wajib diisi']);
        }

        $db = Database::getInstance();

        if ($waliKelasId && !$this->pengurusExists($db, $waliKelasId)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Wali kelas tidak ditemukan']);
        }

        if ($this->kelasExists($db, $namaKelas, $kel)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kombinasi kelas dan kel sudah ada']);
        }

        try {
            $stmt = $db->prepare('INSERT INTO kelas (nama_kelas, kel, wali_kelas_id) VALUES (:nama_kelas, :kel, :wali_kelas_id)');
            $stmt->execute([
                'nama_kelas' => $namaKelas,
                'kel' => $kel,
                'wali_kelas_id' => $waliKelasId,
            ]);
            return $this->jsonResponse($response, ['success' => true, 'message' => 'Kelas ditambah']);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menambah kelas: ' . $e->getMessage()]);
        }
    }

    public function update(Request $request, Response $response, array $args): Response {
        $data = $this->parseBody($request);
        $id = $args['id'] ?? $data['id'] ?? null;
        if (!$id) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID wajib untuk update']);
        }

        $namaKelas = trim($data['nama_kelas'] ?? '');
        $kel = trim($data['kel'] ?? '');
        $waliKelasId = array_key_exists('wali_kelas_id', $data)
            ? $this->normalizeOptionalId($data['wali_kelas_id'])
            : null;
        $waliProvided = array_key_exists('wali_kelas_id', $data);

        if ($namaKelas === '') {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Nama kelas wajib diisi']);
        }

        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT id FROM kelas WHERE id = :id');
        $stmt->execute(['id' => $id]);
        if (!$stmt->fetch()) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kelas tidak ditemukan']);
        }

        if ($waliProvided && $waliKelasId && !$this->pengurusExists($db, $waliKelasId)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Wali kelas tidak ditemukan']);
        }

        if ($this->kelasExists($db, $namaKelas, $kel, (int) $id)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kombinasi kelas dan kel sudah dipakai']);
        }

        try {
            if ($waliProvided) {
                $sql = 'UPDATE kelas SET nama_kelas = :nama_kelas, kel = :kel, wali_kelas_id = :wali_kelas_id WHERE id = :id';
                $params = [
                    'nama_kelas' => $namaKelas,
                    'kel' => $kel,
                    'wali_kelas_id' => $waliKelasId,
                    'id' => $id,
                ];
            } else {
                $sql = 'UPDATE kelas SET nama_kelas = :nama_kelas, kel = :kel WHERE id = :id';
                $params = ['nama_kelas' => $namaKelas, 'kel' => $kel, 'id' => $id];
            }

            $stmt = $db->prepare($sql);
            $stmt->execute($params);

            $stmt = $db->prepare('
                UPDATE santri s
                INNER JOIN santri___kelas sk ON sk.santri_id = s.id AND sk.tanggal_selesai IS NULL
                SET s.kelas = :nama_kelas, s.kel = :kel
                WHERE sk.kelas_id = :id
            ');
            $stmt->execute(['nama_kelas' => $namaKelas, 'kel' => $kel, 'id' => $id]);

            return $this->jsonResponse($response, ['success' => true, 'message' => 'Kelas diperbarui']);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memperbarui kelas: ' . $e->getMessage()]);
        }
    }

    public function delete(Request $request, Response $response, array $args): Response {
        $id = $args['id'] ?? null;
        if (!$id) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID wajib untuk hapus']);
        }

        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT id FROM kelas WHERE id = :id');
        $stmt->execute(['id' => $id]);
        if (!$stmt->fetch()) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kelas tidak ditemukan']);
        }

        $stmt = $db->prepare('
            SELECT COUNT(*) FROM santri___kelas
            WHERE kelas_id = :id AND tanggal_selesai IS NULL
        ');
        $stmt->execute(['id' => $id]);
        if ((int) $stmt->fetchColumn() > 0) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Kelas masih dipakai santri aktif. Pindahkan santri terlebih dahulu.',
            ]);
        }

        try {
            $stmt = $db->prepare('DELETE FROM kelas WHERE id = :id');
            $stmt->execute(['id' => $id]);
            return $this->jsonResponse($response, ['success' => true, 'message' => 'Kelas dihapus']);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menghapus kelas: ' . $e->getMessage()]);
        }
    }

    private function parseBody(Request $request): array {
        $data = json_decode((string) $request->getBody(), true);
        return is_array($data) ? $data : [];
    }

    private function normalizeOptionalId($value): ?int {
        if ($value === null || $value === '') {
            return null;
        }
        $id = (int) $value;
        return $id > 0 ? $id : null;
    }

    private function pengurusExists($db, int $id): bool {
        $stmt = $db->prepare('SELECT id FROM pengurus WHERE id = :id');
        $stmt->execute(['id' => $id]);
        return (bool) $stmt->fetch();
    }

    private function kelasExists($db, string $namaKelas, string $kel, ?int $excludeId = null): bool {
        $sql = 'SELECT id FROM kelas WHERE nama_kelas = :nama_kelas AND kel = :kel';
        $params = ['nama_kelas' => $namaKelas, 'kel' => $kel];
        if ($excludeId) {
            $sql .= ' AND id != :id';
            $params['id'] = $excludeId;
        }
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        return (bool) $stmt->fetch();
    }

    private function jsonResponse(Response $response, array $data, int $status = 200): Response {
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
