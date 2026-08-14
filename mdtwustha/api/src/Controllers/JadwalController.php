<?php

namespace App\Controllers;

use App\Config\Database;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class JadwalController {
    private const HARI = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'ahad'];

    public function index(Request $request, Response $response): Response {
        $params = $request->getQueryParams();
        $akses = (string) ($params['akses'] ?? '');
        $isAdmin = $this->isAdminAkses($akses);

        $kelasId = (int) ($params['kelas_id'] ?? 0);
        $mapelId = (int) ($params['mapel_id'] ?? 0);
        $pengurusId = (int) ($params['pengurus_id'] ?? 0);
        $hari = strtolower(trim((string) ($params['hari'] ?? '')));
        $aktifFilter = strtolower(trim((string) ($params['aktif'] ?? '')));

        // Non-admin hanya melihat jadwal aktif
        if (!$isAdmin) {
            $aktifFilter = '1';
        }

        $db = Database::getInstance();
        $sql = '
            SELECT j.id, j.kelas_id, j.mapel_id, j.pengurus_id, j.hari,
                   j.jam_dari, j.jam_sampai, j.ket_jam, j.aktif,
                   j.created_at, j.updated_at,
                   kl.nama_kelas, kl.kel,
                   pg.nama AS pengurus_nama, pg.nip AS pengurus_nip,
                   m.dari AS mapel_dari, m.sampai AS mapel_sampai,
                   k.fan AS mapel_fan, k.nama AS mapel_kitab, k.musonnif AS mapel_musonnif
            FROM jadwal j
            INNER JOIN kelas kl ON kl.id = j.kelas_id
            INNER JOIN pengurus pg ON pg.id = j.pengurus_id
            INNER JOIN mapel m ON m.id = j.mapel_id
            LEFT JOIN kitab k ON k.id = m.kitab_id
            WHERE 1=1
        ';
        $bind = [];

        if ($kelasId > 0) {
            $sql .= ' AND j.kelas_id = :kelas_id';
            $bind['kelas_id'] = $kelasId;
        }
        if ($mapelId > 0) {
            $sql .= ' AND j.mapel_id = :mapel_id';
            $bind['mapel_id'] = $mapelId;
        }
        if ($pengurusId > 0) {
            $sql .= ' AND j.pengurus_id = :pengurus_id';
            $bind['pengurus_id'] = $pengurusId;
        }
        if ($hari !== '' && in_array($hari, self::HARI, true)) {
            $sql .= ' AND j.hari = :hari';
            $bind['hari'] = $hari;
        }
        if ($aktifFilter === '1' || $aktifFilter === 'aktif') {
            $sql .= ' AND j.aktif = 1';
        } elseif ($aktifFilter === '0' || $aktifFilter === 'nonaktif') {
            $sql .= ' AND j.aktif = 0';
        }

        $sql .= ' ORDER BY
            FIELD(j.hari, \'senin\', \'selasa\', \'rabu\', \'kamis\', \'jumat\', \'sabtu\', \'ahad\'),
            j.ket_jam ASC, j.jam_dari ASC, kl.nama_kelas ASC, kl.kel ASC';

        $stmt = $db->prepare($sql);
        $stmt->execute($bind);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            $row = $this->formatRow($row);
        }
        unset($row);

        return $this->jsonResponse($response, ['success' => true, 'data' => $rows]);
    }

    public function show(Request $request, Response $response, array $args): Response {
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID wajib'], 400);
        }
        $params = $request->getQueryParams();
        $akses = (string) ($params['akses'] ?? '');
        $isAdmin = $this->isAdminAkses($akses);

        $db = Database::getInstance();
        $row = $this->fetchOne($db, $id);
        if (!$row) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Jadwal tidak ditemukan'], 404);
        }
        if (!$isAdmin && !(int) $row['aktif']) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Jadwal tidak ditemukan'], 404);
        }

        return $this->jsonResponse($response, ['success' => true, 'data' => $this->formatRow($row)]);
    }

    public function create(Request $request, Response $response): Response {
        if ($err = $this->requireAdmin($request, true)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $data = $this->parseBody($request);
        $parsed = $this->parsePayload($data);
        if (isset($parsed['error'])) {
            return $this->jsonResponse($response, ['success' => false, 'message' => $parsed['error']], 400);
        }

        $db = Database::getInstance();
        if ($msg = $this->validateRefs($db, $parsed)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => $msg], 400);
        }
        if ((int) $parsed['aktif'] === 1) {
            $conflict = $this->findConflict($db, $parsed, null);
            if ($conflict) {
                return $this->jsonResponse($response, ['success' => false, 'message' => $conflict], 409);
            }
        }

        $stmt = $db->prepare('
            INSERT INTO jadwal
                (kelas_id, mapel_id, pengurus_id, hari, jam_dari, jam_sampai, ket_jam, aktif)
            VALUES
                (:kelas_id, :mapel_id, :pengurus_id, :hari, :jam_dari, :jam_sampai, :ket_jam, :aktif)
        ');
        $stmt->execute([
            'kelas_id' => $parsed['kelas_id'],
            'mapel_id' => $parsed['mapel_id'],
            'pengurus_id' => $parsed['pengurus_id'],
            'hari' => $parsed['hari'],
            'jam_dari' => $parsed['jam_dari'],
            'jam_sampai' => $parsed['jam_sampai'],
            'ket_jam' => $parsed['ket_jam'],
            'aktif' => $parsed['aktif'],
        ]);
        $id = (int) $db->lastInsertId();
        $row = $this->fetchOne($db, $id);

        return $this->jsonResponse($response, [
            'success' => true,
            'message' => 'Jadwal ditambahkan',
            'data' => $row ? $this->formatRow($row) : ['id' => (string) $id],
        ]);
    }

    public function update(Request $request, Response $response, array $args): Response {
        if ($err = $this->requireAdmin($request, true)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID wajib'], 400);
        }

        $db = Database::getInstance();
        $existing = $this->fetchOne($db, $id);
        if (!$existing) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Jadwal tidak ditemukan'], 404);
        }

        $data = $this->parseBody($request);
        // Partial: hanya toggle aktif
        if (array_key_exists('aktif', $data) && count(array_diff(array_keys($data), ['aktif', 'akses'])) === 0) {
            $aktif = !empty($data['aktif']) ? 1 : 0;
            if ($aktif === 1) {
                $check = [
                    'kelas_id' => (int) $existing['kelas_id'],
                    'pengurus_id' => (int) $existing['pengurus_id'],
                    'hari' => (string) $existing['hari'],
                    'ket_jam' => (int) $existing['ket_jam'],
                    'jam_dari' => substr((string) $existing['jam_dari'], 0, 8),
                    'jam_sampai' => substr((string) $existing['jam_sampai'], 0, 8),
                    'aktif' => 1,
                ];
                $conflict = $this->findConflict($db, $check, $id);
                if ($conflict) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => $conflict], 409);
                }
            }
            $stmt = $db->prepare('UPDATE jadwal SET aktif = :aktif WHERE id = :id');
            $stmt->execute(['aktif' => $aktif, 'id' => $id]);
            $row = $this->fetchOne($db, $id);
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $aktif ? 'Jadwal diaktifkan' : 'Jadwal dinonaktifkan',
                'data' => $row ? $this->formatRow($row) : null,
            ]);
        }

        $parsed = $this->parsePayload($data);
        if (isset($parsed['error'])) {
            return $this->jsonResponse($response, ['success' => false, 'message' => $parsed['error']], 400);
        }
        if ($msg = $this->validateRefs($db, $parsed)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => $msg], 400);
        }
        if ((int) $parsed['aktif'] === 1) {
            $conflict = $this->findConflict($db, $parsed, $id);
            if ($conflict) {
                return $this->jsonResponse($response, ['success' => false, 'message' => $conflict], 409);
            }
        }

        $stmt = $db->prepare('
            UPDATE jadwal SET
                kelas_id = :kelas_id,
                mapel_id = :mapel_id,
                pengurus_id = :pengurus_id,
                hari = :hari,
                jam_dari = :jam_dari,
                jam_sampai = :jam_sampai,
                ket_jam = :ket_jam,
                aktif = :aktif
            WHERE id = :id
        ');
        $stmt->execute([
            'kelas_id' => $parsed['kelas_id'],
            'mapel_id' => $parsed['mapel_id'],
            'pengurus_id' => $parsed['pengurus_id'],
            'hari' => $parsed['hari'],
            'jam_dari' => $parsed['jam_dari'],
            'jam_sampai' => $parsed['jam_sampai'],
            'ket_jam' => $parsed['ket_jam'],
            'aktif' => $parsed['aktif'],
            'id' => $id,
        ]);
        $row = $this->fetchOne($db, $id);

        return $this->jsonResponse($response, [
            'success' => true,
            'message' => 'Jadwal diperbarui',
            'data' => $row ? $this->formatRow($row) : null,
        ]);
    }

    public function delete(Request $request, Response $response, array $args): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID wajib'], 400);
        }
        $db = Database::getInstance();
        $stmt = $db->prepare('DELETE FROM jadwal WHERE id = :id');
        $stmt->execute(['id' => $id]);
        if ($stmt->rowCount() === 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Jadwal tidak ditemukan'], 404);
        }
        return $this->jsonResponse($response, ['success' => true, 'message' => 'Jadwal dihapus']);
    }

    /** @return array{error?:string}|array */
    private function parsePayload(array $data): array {
        $kelasId = (int) ($data['kelas_id'] ?? 0);
        $mapelId = (int) ($data['mapel_id'] ?? 0);
        $pengurusId = (int) ($data['pengurus_id'] ?? 0);
        $hari = strtolower(trim((string) ($data['hari'] ?? '')));
        $jamDari = $this->normalizeTime((string) ($data['jam_dari'] ?? ''));
        $jamSampai = $this->normalizeTime((string) ($data['jam_sampai'] ?? ''));
        $ketJam = (int) ($data['ket_jam'] ?? 0);
        $aktif = array_key_exists('aktif', $data) ? (!empty($data['aktif']) ? 1 : 0) : 1;

        if ($kelasId <= 0) {
            return ['error' => 'Kelas wajib dipilih'];
        }
        if ($mapelId <= 0) {
            return ['error' => 'Pelajaran wajib dipilih'];
        }
        if ($pengurusId <= 0) {
            return ['error' => 'Guru wajib dipilih'];
        }
        if (!in_array($hari, self::HARI, true)) {
            return ['error' => 'Hari tidak valid'];
        }
        if ($jamDari === null || $jamSampai === null) {
            return ['error' => 'Jam dari & sampai wajib (format HH:MM)'];
        }
        if ($jamDari >= $jamSampai) {
            return ['error' => 'Jam dari harus sebelum jam sampai'];
        }
        if ($ketJam < 1 || $ketJam > 5) {
            return ['error' => 'Ket jam harus 1–5'];
        }

        return [
            'kelas_id' => $kelasId,
            'mapel_id' => $mapelId,
            'pengurus_id' => $pengurusId,
            'hari' => $hari,
            'jam_dari' => $jamDari,
            'jam_sampai' => $jamSampai,
            'ket_jam' => $ketJam,
            'aktif' => $aktif,
        ];
    }

    private function normalizeTime(string $raw): ?string {
        $raw = trim($raw);
        if (preg_match('/^\d{2}:\d{2}:\d{2}$/', $raw)) {
            return $raw;
        }
        if (preg_match('/^\d{2}:\d{2}$/', $raw)) {
            return $raw . ':00';
        }
        return null;
    }

    /** @return string|null error message */
    private function validateRefs(PDO $db, array $parsed): ?string {
        $stmt = $db->prepare('SELECT 1 FROM kelas WHERE id = :id');
        $stmt->execute(['id' => $parsed['kelas_id']]);
        if (!$stmt->fetchColumn()) {
            return 'Kelas tidak ditemukan';
        }
        $stmt = $db->prepare('SELECT 1 FROM pengurus WHERE id = :id');
        $stmt->execute(['id' => $parsed['pengurus_id']]);
        if (!$stmt->fetchColumn()) {
            return 'Guru tidak ditemukan';
        }
        $stmt = $db->prepare('SELECT 1 FROM mapel WHERE id = :id');
        $stmt->execute(['id' => $parsed['mapel_id']]);
        if (!$stmt->fetchColumn()) {
            return 'Pelajaran tidak ditemukan';
        }
        // Mapel sebaiknya terhubung ke kelas (jika ada relasi)
        $stmt = $db->prepare('SELECT 1 FROM kelas___mapel WHERE kelas_id = :k AND mapel_id = :m');
        $stmt->execute(['k' => $parsed['kelas_id'], 'm' => $parsed['mapel_id']]);
        if (!$stmt->fetchColumn()) {
            return 'Pelajaran tidak terdaftar di kelas yang dipilih';
        }
        return null;
    }

    /** Cek bentrok jadwal aktif: slot kelas atau slot guru. */
    private function findConflict(PDO $db, array $parsed, ?int $excludeId): ?string {
        $sqlKelas = '
            SELECT id FROM jadwal
            WHERE aktif = 1 AND kelas_id = :kelas AND hari = :hari AND ket_jam = :ket
        ';
        $bindKelas = [
            'kelas' => $parsed['kelas_id'],
            'hari' => $parsed['hari'],
            'ket' => $parsed['ket_jam'],
        ];
        if ($excludeId) {
            $sqlKelas .= ' AND id <> :ex';
            $bindKelas['ex'] = $excludeId;
        }
        $stmt = $db->prepare($sqlKelas);
        $stmt->execute($bindKelas);
        if ($stmt->fetch()) {
            return 'Sudah ada jadwal aktif di kelas ini untuk hari & ket jam yang sama';
        }

        $sqlGuru = '
            SELECT id FROM jadwal
            WHERE aktif = 1 AND pengurus_id = :guru AND hari = :hari AND ket_jam = :ket
        ';
        $bindGuru = [
            'guru' => $parsed['pengurus_id'],
            'hari' => $parsed['hari'],
            'ket' => $parsed['ket_jam'],
        ];
        if ($excludeId) {
            $sqlGuru .= ' AND id <> :ex';
            $bindGuru['ex'] = $excludeId;
        }
        $stmt = $db->prepare($sqlGuru);
        $stmt->execute($bindGuru);
        if ($stmt->fetch()) {
            return 'Guru sudah punya jadwal aktif di hari & ket jam yang sama';
        }

        // Bentrok rentang jam di kelas yang sama (hari sama, aktif)
        $sqlJam = '
            SELECT id FROM jadwal
            WHERE aktif = 1 AND kelas_id = :kelas AND hari = :hari
              AND jam_dari < :sampai AND jam_sampai > :dari
        ';
        $bindJam = [
            'kelas' => $parsed['kelas_id'],
            'hari' => $parsed['hari'],
            'dari' => $parsed['jam_dari'],
            'sampai' => $parsed['jam_sampai'],
        ];
        if ($excludeId) {
            $sqlJam .= ' AND id <> :ex';
            $bindJam['ex'] = $excludeId;
        }
        $stmt = $db->prepare($sqlJam);
        $stmt->execute($bindJam);
        if ($stmt->fetch()) {
            return 'Rentang jam bentrok dengan jadwal aktif lain di kelas & hari yang sama';
        }

        return null;
    }

    private function fetchOne(PDO $db, int $id): ?array {
        $stmt = $db->prepare('
            SELECT j.id, j.kelas_id, j.mapel_id, j.pengurus_id, j.hari,
                   j.jam_dari, j.jam_sampai, j.ket_jam, j.aktif,
                   j.created_at, j.updated_at,
                   kl.nama_kelas, kl.kel,
                   pg.nama AS pengurus_nama, pg.nip AS pengurus_nip,
                   m.dari AS mapel_dari, m.sampai AS mapel_sampai,
                   k.fan AS mapel_fan, k.nama AS mapel_kitab, k.musonnif AS mapel_musonnif
            FROM jadwal j
            INNER JOIN kelas kl ON kl.id = j.kelas_id
            INNER JOIN pengurus pg ON pg.id = j.pengurus_id
            INNER JOIN mapel m ON m.id = j.mapel_id
            LEFT JOIN kitab k ON k.id = m.kitab_id
            WHERE j.id = :id
        ');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    private function formatRow(array $row): array {
        $jamDari = substr((string) $row['jam_dari'], 0, 5);
        $jamSampai = substr((string) $row['jam_sampai'], 0, 5);
        return [
            'id' => (string) $row['id'],
            'kelas_id' => (string) $row['kelas_id'],
            'mapel_id' => (string) $row['mapel_id'],
            'pengurus_id' => (string) $row['pengurus_id'],
            'hari' => $row['hari'],
            'jam_dari' => $jamDari,
            'jam_sampai' => $jamSampai,
            'ket_jam' => (int) $row['ket_jam'],
            'aktif' => (int) $row['aktif'] === 1,
            'nama_kelas' => $row['nama_kelas'] ?? null,
            'kel' => $row['kel'] ?? null,
            'pengurus_nama' => $row['pengurus_nama'] ?? null,
            'pengurus_nip' => $row['pengurus_nip'] ?? null,
            'mapel_fan' => $row['mapel_fan'] ?? null,
            'mapel_kitab' => $row['mapel_kitab'] ?? null,
            'mapel_musonnif' => $row['mapel_musonnif'] ?? null,
            'mapel_dari' => $row['mapel_dari'] ?? null,
            'mapel_sampai' => $row['mapel_sampai'] ?? null,
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
        ];
    }

    private function isAdminAkses(string $akses): bool {
        return in_array($akses, ['super_admin', 'admin'], true);
    }

    /** @return array{success:bool,message:string}|null */
    private function requireAdmin(Request $request, bool $fromBody = false): ?array {
        $params = $request->getQueryParams();
        $akses = (string) ($params['akses'] ?? '');
        if ($akses === '' && $fromBody) {
            $data = $this->parseBody($request);
            $akses = (string) ($data['akses'] ?? '');
        }
        if (!$this->isAdminAkses($akses)) {
            return ['success' => false, 'message' => 'Akses ditolak (admin saja)'];
        }
        return null;
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
