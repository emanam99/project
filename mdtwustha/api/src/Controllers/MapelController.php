<?php

namespace App\Controllers;

use App\Config\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class MapelController {
    private const MAPEL_SELECT = '
        SELECT mp.id,
               mp.kitab_id,
               mp.dari,
               mp.sampai,
               k.fan,
               k.nama AS kitab_nama,
               k.musonnif
        FROM mapel mp
        INNER JOIN kitab k ON k.id = mp.kitab_id
    ';

    public function index(Request $request, Response $response): Response {
        $params = $request->getQueryParams();
        $kelasId = trim($params['kelas_id'] ?? '');

        $db = Database::getInstance();

        if ($kelasId !== '') {
            $stmt = $db->prepare(self::MAPEL_SELECT . '
                INNER JOIN kelas___mapel km ON km.mapel_id = mp.id
                WHERE km.kelas_id = :kelas_id
                ORDER BY k.fan ASC, k.nama ASC, mp.dari ASC
            ');
            $stmt->execute(['kelas_id' => $kelasId]);
        } else {
            $stmt = $db->query(self::MAPEL_SELECT . '
                ORDER BY k.fan ASC, k.nama ASC, mp.dari ASC
            ');
        }

        return $this->jsonResponse($response, ['success' => true, 'data' => $stmt->fetchAll()]);
    }

    public function show(Request $request, Response $response, array $args): Response {
        $id = $args['id'] ?? null;
        if (!$id) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID wajib']);
        }

        $db = Database::getInstance();
        $stmt = $db->prepare(self::MAPEL_SELECT . ' WHERE mp.id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Mapel tidak ditemukan']);
        }

        $stmt = $db->prepare('SELECT kelas_id FROM kelas___mapel WHERE mapel_id = :mapel_id');
        $stmt->execute(['mapel_id' => $id]);
        $kelasIds = array_column($stmt->fetchAll(), 'kelas_id');
        $kelasIds = array_values(array_unique(array_map('strval', $kelasIds)));

        return $this->jsonResponse($response, [
            'success' => true,
            'data' => array_merge($row, ['kelas_ids' => $kelasIds]),
        ]);
    }

    public function create(Request $request, Response $response): Response {
        $data = $this->parseBody($request);
        $kitabId = trim($data['kitab_id'] ?? '');
        $dari = trim($data['dari'] ?? '');
        $sampai = trim($data['sampai'] ?? '');
        $kelasIds = $data['kelas_ids'] ?? [];

        if ($kitabId === '') {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kitab wajib dipilih']);
        }
        if (!is_array($kelasIds)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'kelas_ids harus array']);
        }

        $db = Database::getInstance();
        if (!$this->kitabExists($db, (int) $kitabId)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kitab tidak ditemukan']);
        }

        try {
            $db->beginTransaction();
            $stmt = $db->prepare('INSERT INTO mapel (kitab_id, dari, sampai) VALUES (:kitab_id, :dari, :sampai)');
            $stmt->execute(['kitab_id' => $kitabId, 'dari' => $dari, 'sampai' => $sampai]);
            $mapelId = (int) $db->lastInsertId();
            $this->syncMapelKelas($db, $mapelId, $kelasIds);
            $db->commit();
            return $this->jsonResponse($response, ['success' => true, 'message' => 'Mapel ditambah']);
        } catch (\Exception $e) {
            $db->rollBack();
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menambah mapel: ' . $e->getMessage()]);
        }
    }

    public function update(Request $request, Response $response, array $args): Response {
        $id = $args['id'] ?? null;
        if (!$id) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID wajib untuk update']);
        }

        $data = $this->parseBody($request);
        $kitabId = trim($data['kitab_id'] ?? '');
        $dari = trim($data['dari'] ?? '');
        $sampai = trim($data['sampai'] ?? '');
        $kelasIds = $data['kelas_ids'] ?? null;

        if ($kitabId === '') {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kitab wajib dipilih']);
        }

        $db = Database::getInstance();
        if (!$this->mapelExists($db, (int) $id)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Mapel tidak ditemukan']);
        }
        if (!$this->kitabExists($db, (int) $kitabId)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kitab tidak ditemukan']);
        }
        if ($kelasIds !== null && !is_array($kelasIds)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'kelas_ids harus array']);
        }

        try {
            $db->beginTransaction();
            $stmt = $db->prepare('UPDATE mapel SET kitab_id = :kitab_id, dari = :dari, sampai = :sampai WHERE id = :id');
            $stmt->execute(['kitab_id' => $kitabId, 'dari' => $dari, 'sampai' => $sampai, 'id' => $id]);
            if (is_array($kelasIds)) {
                $this->syncMapelKelas($db, (int) $id, $kelasIds);
            }
            $db->commit();
            return $this->jsonResponse($response, ['success' => true, 'message' => 'Mapel diperbarui']);
        } catch (\Exception $e) {
            $db->rollBack();
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memperbarui mapel: ' . $e->getMessage()]);
        }
    }

    public function delete(Request $request, Response $response, array $args): Response {
        $id = $args['id'] ?? null;
        if (!$id) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID wajib untuk hapus']);
        }

        $db = Database::getInstance();
        if (!$this->mapelExists($db, (int) $id)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Mapel tidak ditemukan']);
        }

        try {
            $stmt = $db->prepare('DELETE FROM mapel WHERE id = :id');
            $stmt->execute(['id' => $id]);
            return $this->jsonResponse($response, ['success' => true, 'message' => 'Mapel dihapus']);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menghapus mapel: ' . $e->getMessage()]);
        }
    }

    public function listForKelas(Request $request, Response $response, array $args): Response {
        $kelasId = $args['id'] ?? null;
        if (!$kelasId) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID kelas wajib']);
        }

        $db = Database::getInstance();
        $stmt = $db->prepare('SELECT id FROM kelas WHERE id = :id');
        $stmt->execute(['id' => $kelasId]);
        if (!$stmt->fetch()) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kelas tidak ditemukan']);
        }

        $stmt = $db->prepare(self::MAPEL_SELECT . '
            INNER JOIN kelas___mapel km ON km.mapel_id = mp.id
            WHERE km.kelas_id = :kelas_id
            ORDER BY k.fan ASC, k.nama ASC, mp.dari ASC
        ');
        $stmt->execute(['kelas_id' => $kelasId]);

        return $this->jsonResponse($response, ['success' => true, 'data' => $stmt->fetchAll()]);
    }

    public function syncKelasMapel(Request $request, Response $response, array $args): Response {
        $kelasId = $args['id'] ?? null;
        if (!$kelasId) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID kelas wajib']);
        }

        $data = $this->parseBody($request);
        $mapelIds = $data['mapel_ids'] ?? [];
        if (!is_array($mapelIds)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'mapel_ids harus array']);
        }

        $db = Database::getInstance();
        $stmt = $db->prepare('SELECT id FROM kelas WHERE id = :id');
        $stmt->execute(['id' => $kelasId]);
        if (!$stmt->fetch()) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kelas tidak ditemukan']);
        }

        $cleanIds = [];
        foreach ($mapelIds as $mid) {
            $id = (int) $mid;
            if ($id > 0 && $this->mapelExists($db, $id)) {
                $cleanIds[$id] = $id;
            }
        }

        try {
            $db->beginTransaction();

            $stmt = $db->prepare('DELETE FROM kelas___mapel WHERE kelas_id = :kelas_id');
            $stmt->execute(['kelas_id' => $kelasId]);

            if (!empty($cleanIds)) {
                $insert = $db->prepare('INSERT INTO kelas___mapel (kelas_id, mapel_id) VALUES (:kelas_id, :mapel_id)');
                foreach ($cleanIds as $mapelId) {
                    $insert->execute(['kelas_id' => $kelasId, 'mapel_id' => $mapelId]);
                }
            }

            $db->commit();
            return $this->jsonResponse($response, ['success' => true, 'message' => 'Mapel rombel diperbarui']);
        } catch (\Exception $e) {
            $db->rollBack();
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menyimpan mapel rombel: ' . $e->getMessage()]);
        }
    }

    private function kelasExists($db, int $id): bool {
        $stmt = $db->prepare('SELECT id FROM kelas WHERE id = :id');
        $stmt->execute(['id' => $id]);
        return (bool) $stmt->fetch();
    }

    /** @param mixed $kelasIds */
    private function syncMapelKelas($db, int $mapelId, $kelasIds): void {
        if (!is_array($kelasIds)) {
            return;
        }

        $wanted = [];
        foreach ($kelasIds as $kelasId) {
            $kid = (int) $kelasId;
            if ($kid > 0 && $this->kelasExists($db, $kid)) {
                $wanted[$kid] = $kid;
            }
        }

        $stmt = $db->prepare('SELECT kelas_id FROM kelas___mapel WHERE mapel_id = :mapel_id');
        $stmt->execute(['mapel_id' => $mapelId]);
        $current = [];
        foreach ($stmt->fetchAll() as $row) {
            $current[(int) $row['kelas_id']] = true;
        }

        $delete = $db->prepare('DELETE FROM kelas___mapel WHERE mapel_id = :mapel_id AND kelas_id = :kelas_id');
        foreach (array_keys($current) as $kid) {
            if (!isset($wanted[$kid])) {
                $delete->execute(['mapel_id' => $mapelId, 'kelas_id' => $kid]);
            }
        }

        $insert = $db->prepare('INSERT INTO kelas___mapel (kelas_id, mapel_id) VALUES (:kelas_id, :mapel_id)');
        foreach ($wanted as $kid) {
            if (!isset($current[$kid])) {
                $insert->execute(['kelas_id' => $kid, 'mapel_id' => $mapelId]);
            }
        }
    }

    private function mapelExists($db, int $id): bool {
        $stmt = $db->prepare('SELECT id FROM mapel WHERE id = :id');
        $stmt->execute(['id' => $id]);
        return (bool) $stmt->fetch();
    }

    private function kitabExists($db, int $id): bool {
        $stmt = $db->prepare('SELECT id FROM kitab WHERE id = :id');
        $stmt->execute(['id' => $id]);
        return (bool) $stmt->fetch();
    }

    private function parseBody(Request $request): array {
        $data = json_decode((string) $request->getBody(), true);
        return is_array($data) ? $data : [];
    }

    private function jsonResponse(Response $response, array $data, int $status = 200): Response {
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
