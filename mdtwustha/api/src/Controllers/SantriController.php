<?php

namespace App\Controllers;

use App\Config\Database;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class SantriController {
    private const SANTRI_FIELDS = [
        'nomer_induk', 'nama', 'kamar', 'no_kk', 'nik', 'tempat_lahir',
        'tanggal_lahir', 'jenis_kelamin', 'dusun', 'rt', 'rw', 'desa',
        'kecamatan', 'kabupaten', 'provinsi', 'ayah', 'ibu', 'saudara_di_pesantren', 'idp'
    ];

    public function index(Request $request, Response $response): Response {
        $db = Database::getInstance();
        $stmt = $db->query('
            SELECT s.*,
                   k.id AS kelas_id,
                   k.nama_kelas,
                   k.kel AS kelas_kel,
                   p.nama AS wali_kelas_nama
            FROM santri s
            LEFT JOIN santri___kelas sk ON sk.santri_id = s.id AND sk.tanggal_selesai IS NULL
            LEFT JOIN kelas k ON k.id = sk.kelas_id
            LEFT JOIN pengurus p ON p.id = k.wali_kelas_id
            ORDER BY s.nama ASC
        ');
        $santri = $stmt->fetchAll();

        return $this->jsonResponse($response, ['success' => true, 'data' => $santri]);
    }

    public function kelasRiwayat(Request $request, Response $response, array $args): Response {
        $santriId = $args['id'] ?? null;
        if (!$santriId) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID santri wajib']);
        }

        $db = Database::getInstance();
        $stmt = $db->prepare('
            SELECT sk.id, sk.kelas_id, sk.tanggal_mulai, sk.tanggal_selesai,
                   k.nama_kelas, k.kel, p.nama AS wali_kelas_nama
            FROM santri___kelas sk
            INNER JOIN kelas k ON k.id = sk.kelas_id
            LEFT JOIN pengurus p ON p.id = k.wali_kelas_id
            WHERE sk.santri_id = :santri_id
            ORDER BY sk.tanggal_mulai DESC, sk.id DESC
        ');
        $stmt->execute(['santri_id' => $santriId]);
        $riwayat = $stmt->fetchAll();

        return $this->jsonResponse($response, ['success' => true, 'data' => $riwayat]);
    }

    public function create(Request $request, Response $response): Response {
        $data = $this->parseBody($request);
        $kelasId = $this->normalizeKelasId($data['kelas_id'] ?? null);

        $insertData = $this->extractSantriFields($data);
        if (empty($insertData)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Data kosong']);
        }

        $columns = array_keys($insertData);
        $placeholders = array_map(fn($col) => ":$col", $columns);
        $sql = 'INSERT INTO santri (' . implode(', ', $columns) . ') VALUES (' . implode(', ', $placeholders) . ')';

        try {
            $db = Database::getInstance();
            $db->beginTransaction();

            $stmt = $db->prepare($sql);
            $stmt->execute($insertData);
            $santriId = (int) $db->lastInsertId();

            if ($kelasId) {
                $this->assignKelas($db, $santriId, $kelasId, $data['idp'] ?? null);
            }

            $db->commit();
            return $this->jsonResponse($response, ['success' => true, 'message' => 'Santri ditambah']);
        } catch (\Exception $e) {
            if (isset($db) && $db->inTransaction()) {
                $db->rollBack();
            }
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menambah santri: ' . $e->getMessage()]);
        }
    }

    public function update(Request $request, Response $response, array $args): Response {
        $data = $this->parseBody($request);
        $id = $args['id'] ?? $data['id'] ?? null;
        if (!$id) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID wajib untuk update']);
        }

        $kelasIdProvided = array_key_exists('kelas_id', $data);
        $kelasId = $kelasIdProvided ? $this->normalizeKelasId($data['kelas_id']) : null;

        $updateData = $this->extractSantriFields($data);
        $hasSantriUpdate = !empty($updateData);

        if (!$hasSantriUpdate && !$kelasIdProvided) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Tidak ada data untuk diupdate']);
        }

        try {
            $db = Database::getInstance();
            $db->beginTransaction();

            if ($hasSantriUpdate) {
                $setClauses = array_map(fn($field) => "$field = :$field", array_keys($updateData));
                $updateData['id'] = $id;
                $sql = 'UPDATE santri SET ' . implode(', ', $setClauses) . ' WHERE id = :id';
                $stmt = $db->prepare($sql);
                $stmt->execute($updateData);
            }

            if ($kelasIdProvided) {
                if ($kelasId) {
                    $this->assignKelas($db, (int) $id, $kelasId, $data['idp'] ?? null);
                } else {
                    $this->closeActiveKelas($db, (int) $id);
                    $stmt = $db->prepare('UPDATE santri SET kelas = NULL, kel = NULL WHERE id = :id');
                    $stmt->execute(['id' => $id]);
                }
            }

            $db->commit();
            return $this->jsonResponse($response, ['success' => true, 'message' => 'Santri diperbarui']);
        } catch (\Exception $e) {
            if (isset($db) && $db->inTransaction()) {
                $db->rollBack();
            }
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memperbarui santri: ' . $e->getMessage()]);
        }
    }

    private function parseBody(Request $request): array {
        $data = json_decode((string) $request->getBody(), true);
        if (!is_array($data)) {
            return [];
        }
        if (isset($data['data']) && is_array($data['data'])) {
            return $data['data'];
        }
        return $data;
    }

    private function extractSantriFields(array $data): array {
        $result = [];
        foreach (self::SANTRI_FIELDS as $field) {
            if (array_key_exists($field, $data)) {
                $result[$field] = $data[$field];
            }
        }
        return $result;
    }

    private function normalizeKelasId($kelasId): ?int {
        if ($kelasId === null || $kelasId === '') {
            return null;
        }
        $id = (int) $kelasId;
        return $id > 0 ? $id : null;
    }

    private function assignKelas(PDO $db, int $santriId, int $kelasId, $idp): void {
        $stmt = $db->prepare('SELECT id, nama_kelas, kel FROM kelas WHERE id = :id');
        $stmt->execute(['id' => $kelasId]);
        $kelas = $stmt->fetch();
        if (!$kelas) {
            throw new \RuntimeException('Kelas tidak ditemukan');
        }

        $stmt = $db->prepare('
            SELECT id, kelas_id FROM santri___kelas
            WHERE santri_id = :santri_id AND tanggal_selesai IS NULL
            LIMIT 1
        ');
        $stmt->execute(['santri_id' => $santriId]);
        $active = $stmt->fetch();

        if ($active && (int) $active['kelas_id'] === $kelasId) {
            $this->syncSantriKelasColumn($db, $santriId, $kelasId);
            return;
        }

        if ($active) {
            $stmt = $db->prepare('
                UPDATE santri___kelas
                SET tanggal_selesai = CURDATE()
                WHERE id = :id
            ');
            $stmt->execute(['id' => $active['id']]);
        }

        $stmt = $db->prepare('
            SELECT COALESCE(MAX(urutan), 0) + 1 AS next_urutan
            FROM santri___kelas
            WHERE kelas_id = :kelas_id AND tanggal_selesai IS NULL
        ');
        $stmt->execute(['kelas_id' => $kelasId]);
        $nextUrutan = (int) ($stmt->fetchColumn() ?: 1);

        $stmt = $db->prepare('
            INSERT INTO santri___kelas (santri_id, kelas_id, urutan, tanggal_mulai, idp)
            VALUES (:santri_id, :kelas_id, :urutan, CURDATE(), :idp)
        ');
        $stmt->execute([
            'santri_id' => $santriId,
            'kelas_id' => $kelasId,
            'urutan' => $nextUrutan,
            'idp' => $idp ?: null,
        ]);

        $this->syncSantriKelasColumn($db, $santriId, $kelasId);
    }

    private function closeActiveKelas(PDO $db, int $santriId): void {
        $stmt = $db->prepare('
            UPDATE santri___kelas
            SET tanggal_selesai = CURDATE()
            WHERE santri_id = :santri_id AND tanggal_selesai IS NULL
        ');
        $stmt->execute(['santri_id' => $santriId]);
    }

    private function syncSantriKelasColumn(PDO $db, int $santriId, int $kelasId): void {
        $stmt = $db->prepare('
            UPDATE santri s
            INNER JOIN kelas k ON k.id = :kelas_id
            SET s.kelas = k.nama_kelas,
                s.kel = k.kel
            WHERE s.id = :santri_id
        ');
        $stmt->execute([
            'santri_id' => $santriId,
            'kelas_id' => $kelasId,
        ]);
    }

    private function jsonResponse(Response $response, array $data, int $status = 200): Response {
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
