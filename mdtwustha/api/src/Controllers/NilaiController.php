<?php

namespace App\Controllers;

use App\Config\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class NilaiController {
    private const VALID_ABSEN = ['H', 'S', 'I', 'A'];

    public function index(Request $request, Response $response): Response {
        $params = $request->getQueryParams();
        $kelasId = trim($params['kelas_id'] ?? '');
        $mapelId = trim($params['mapel_id'] ?? '');
        $tanggal = trim($params['tanggal'] ?? '');

        if ($kelasId === '') {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Filter kelas wajib']);
        }
        if ($mapelId === '') {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Filter mapel wajib']);
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'tanggal harus format YYYY-MM-DD (masehi)']);
        }

        $db = Database::getInstance();

        if (!$this->kelasExists($db, (int) $kelasId)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kelas tidak ditemukan']);
        }
        if (!$this->mapelAssignedToKelas($db, (int) $kelasId, (int) $mapelId)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Mapel tidak terhubung ke rombel ini']);
        }

        $stmt = $db->prepare('
            SELECT s.id AS santri_id,
                   s.nomer_induk,
                   s.nama,
                   sk.urutan,
                   COALESCE(n.absen, \'H\') AS absen,
                   n.nilai,
                   n.id AS nilai_id
            FROM santri s
            INNER JOIN santri___kelas sk ON sk.santri_id = s.id AND sk.tanggal_selesai IS NULL
            LEFT JOIN santri___nilai n
                ON n.santri_id = s.id
               AND n.kelas_id = :kelas_id
               AND n.mapel_id = :mapel_id
               AND n.tanggal_ujian = :tanggal
            WHERE sk.kelas_id = :kelas_id2
            ORDER BY sk.urutan ASC, s.nama ASC
        ');
        $stmt->execute([
            'kelas_id' => $kelasId,
            'mapel_id' => $mapelId,
            'tanggal' => $tanggal,
            'kelas_id2' => $kelasId,
        ]);
        $rows = $stmt->fetchAll();

        foreach ($rows as &$row) {
            $row['nilai'] = $row['nilai'] === null ? null : (float) $row['nilai'];
        }
        unset($row);

        return $this->jsonResponse($response, [
            'success' => true,
            'data' => $rows,
            'meta' => [
                'kelas_id' => $kelasId,
                'mapel_id' => $mapelId,
                'tanggal' => $tanggal,
            ],
        ]);
    }

    public function save(Request $request, Response $response): Response {
        $data = $this->parseBody($request);
        $kelasId = trim((string) ($data['kelas_id'] ?? ''));
        $mapelId = trim((string) ($data['mapel_id'] ?? ''));
        $santriId = trim((string) ($data['santri_id'] ?? ''));
        $tanggal = trim((string) ($data['tanggal'] ?? ''));
        $absen = strtoupper(trim((string) ($data['absen'] ?? 'H')));
        $idp = $data['idp'] ?? null;

        if ($kelasId === '' || $mapelId === '' || $santriId === '') {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'kelas_id, mapel_id, dan santri_id wajib']);
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'tanggal harus format YYYY-MM-DD (masehi)']);
        }
        if (!in_array($absen, self::VALID_ABSEN, true)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Status absen tidak valid']);
        }

        $nilai = null;
        $hasNilai = array_key_exists('nilai', $data);
        if ($hasNilai) {
            if ($data['nilai'] === null || $data['nilai'] === '') {
                $nilai = null;
            } else {
                if (!is_numeric($data['nilai'])) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'Nilai harus angka']);
                }
                $nilai = round((float) $data['nilai'], 2);
                if ($nilai < 0 || $nilai > 100) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'Nilai harus antara 0–100']);
                }
            }
        }

        $db = Database::getInstance();

        if (!$this->kelasExists($db, (int) $kelasId)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kelas tidak ditemukan']);
        }
        if (!$this->mapelAssignedToKelas($db, (int) $kelasId, (int) $mapelId)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Mapel tidak terhubung ke rombel ini']);
        }
        if (!$this->santriInKelas($db, (int) $santriId, (int) $kelasId)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Santri tidak ada di rombel ini']);
        }

        $stmt = $db->prepare('
            SELECT id, absen, nilai FROM santri___nilai
            WHERE kelas_id = :kelas_id AND mapel_id = :mapel_id AND santri_id = :santri_id AND tanggal_ujian = :tanggal
        ');
        $stmt->execute([
            'kelas_id' => $kelasId,
            'mapel_id' => $mapelId,
            'santri_id' => $santriId,
            'tanggal' => $tanggal,
        ]);
        $existing = $stmt->fetch();

        if ($existing) {
            $nextAbsen = array_key_exists('absen', $data) ? $absen : $existing['absen'];
            $nextNilai = $hasNilai ? $nilai : $existing['nilai'];
            $stmt = $db->prepare('
                UPDATE santri___nilai
                SET absen = :absen, nilai = :nilai, idp = :idp
                WHERE id = :id
            ');
            $stmt->execute([
                'absen' => $nextAbsen,
                'nilai' => $nextNilai,
                'idp' => $idp,
                'id' => $existing['id'],
            ]);
            $nilaiId = (int) $existing['id'];
        } else {
            $stmt = $db->prepare('
                INSERT INTO santri___nilai (kelas_id, mapel_id, santri_id, tanggal_ujian, absen, nilai, idp)
                VALUES (:kelas_id, :mapel_id, :santri_id, :tanggal, :absen, :nilai, :idp)
            ');
            $stmt->execute([
                'kelas_id' => $kelasId,
                'mapel_id' => $mapelId,
                'santri_id' => $santriId,
                'tanggal' => $tanggal,
                'absen' => $absen,
                'nilai' => $hasNilai ? $nilai : null,
                'idp' => $idp,
            ]);
            $nilaiId = (int) $db->lastInsertId();
            $nextAbsen = $absen;
            $nextNilai = $hasNilai ? $nilai : null;
        }

        return $this->jsonResponse($response, [
            'success' => true,
            'message' => 'Nilai disimpan',
            'data' => [
                'id' => $nilaiId,
                'santri_id' => $santriId,
                'absen' => $nextAbsen,
                'nilai' => $nextNilai === null ? null : (float) $nextNilai,
                'tanggal' => $tanggal,
            ],
        ]);
    }

    public function ubahTanggal(Request $request, Response $response): Response {
        $data = $this->parseBody($request);
        $kelasId = trim((string) ($data['kelas_id'] ?? ''));
        $mapelId = trim((string) ($data['mapel_id'] ?? ''));
        $tanggalLama = trim((string) ($data['tanggal_lama'] ?? ''));
        $tanggalBaru = trim((string) ($data['tanggal_baru'] ?? ''));

        if ($kelasId === '' || $mapelId === '') {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'kelas_id dan mapel_id wajib']);
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggalLama) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggalBaru)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'tanggal harus format YYYY-MM-DD (masehi)']);
        }
        if ($tanggalLama === $tanggalBaru) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Tanggal baru sama dengan tanggal lama']);
        }

        $db = Database::getInstance();
        if (!$this->kelasExists($db, (int) $kelasId)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kelas tidak ditemukan']);
        }
        if (!$this->mapelAssignedToKelas($db, (int) $kelasId, (int) $mapelId)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Mapel tidak terhubung ke rombel ini']);
        }

        $stmt = $db->prepare('
            SELECT COUNT(*) FROM santri___nilai
            WHERE kelas_id = :kelas_id AND mapel_id = :mapel_id AND tanggal_ujian = :tanggal
        ');
        $stmt->execute(['kelas_id' => $kelasId, 'mapel_id' => $mapelId, 'tanggal' => $tanggalLama]);
        $countLama = (int) $stmt->fetchColumn();
        if ($countLama === 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Tidak ada data nilai pada tanggal ini']);
        }

        $stmt->execute(['kelas_id' => $kelasId, 'mapel_id' => $mapelId, 'tanggal' => $tanggalBaru]);
        $countBaru = (int) $stmt->fetchColumn();
        if ($countBaru > 0) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Sudah ada data nilai untuk tanggal tujuan. Hapus atau pilih tanggal lain.',
            ]);
        }

        try {
            $stmt = $db->prepare('
                UPDATE santri___nilai
                SET tanggal_ujian = :tanggal_baru
                WHERE kelas_id = :kelas_id AND mapel_id = :mapel_id AND tanggal_ujian = :tanggal_lama
            ');
            $stmt->execute([
                'tanggal_baru' => $tanggalBaru,
                'kelas_id' => $kelasId,
                'mapel_id' => $mapelId,
                'tanggal_lama' => $tanggalLama,
            ]);
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Tanggal ujian diperbarui (' . $countLama . ' baris)',
                'data' => [
                    'tanggal_lama' => $tanggalLama,
                    'tanggal_baru' => $tanggalBaru,
                    'updated' => $countLama,
                ],
            ]);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengubah tanggal: ' . $e->getMessage(),
            ]);
        }
    }

    public function hapusBatch(Request $request, Response $response): Response {
        $data = $this->parseBody($request);
        $kelasId = trim((string) ($data['kelas_id'] ?? ''));
        $mapelId = trim((string) ($data['mapel_id'] ?? ''));
        $tanggal = trim((string) ($data['tanggal'] ?? ''));

        if ($kelasId === '' || $mapelId === '') {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'kelas_id dan mapel_id wajib']);
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'tanggal harus format YYYY-MM-DD (masehi)']);
        }

        $db = Database::getInstance();
        if (!$this->kelasExists($db, (int) $kelasId)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kelas tidak ditemukan']);
        }

        try {
            $stmt = $db->prepare('
                DELETE FROM santri___nilai
                WHERE kelas_id = :kelas_id AND mapel_id = :mapel_id AND tanggal_ujian = :tanggal
            ');
            $stmt->execute([
                'kelas_id' => $kelasId,
                'mapel_id' => $mapelId,
                'tanggal' => $tanggal,
            ]);
            $deleted = $stmt->rowCount();
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $deleted > 0
                    ? 'Data nilai dihapus (' . $deleted . ' baris)'
                    : 'Tidak ada data nilai untuk dihapus',
                'data' => ['deleted' => $deleted],
            ]);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus data nilai: ' . $e->getMessage(),
            ]);
        }
    }

    public function rekap(Request $request, Response $response): Response {
        $params = $request->getQueryParams();
        $tanggalAwal = trim($params['tanggal_awal'] ?? '');
        $tanggalAkhir = trim($params['tanggal_akhir'] ?? '');

        $kelasIdsRaw = trim($params['kelas_ids'] ?? ($params['kelas_id'] ?? ''));
        $kelasIds = [];
        foreach (preg_split('/[,\s]+/', $kelasIdsRaw) as $part) {
            $id = (int) trim($part);
            if ($id > 0) {
                $kelasIds[$id] = $id;
            }
        }
        $kelasIds = array_values($kelasIds);

        if (empty($kelasIds)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Filter kelas wajib']);
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggalAwal) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggalAkhir)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'tanggal harus format YYYY-MM-DD (masehi)']);
        }
        if ($tanggalAwal > $tanggalAkhir) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'tanggal_awal tidak boleh setelah tanggal_akhir']);
        }

        $db = Database::getInstance();
        foreach ($kelasIds as $kid) {
            if (!$this->kelasExists($db, $kid)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Kelas tidak ditemukan: ' . $kid]);
            }
        }

        $placeholders = implode(',', array_fill(0, count($kelasIds), '?'));

        $stmt = $db->prepare("
            SELECT DISTINCT mp.id,
                   mp.kitab_id,
                   mp.dari,
                   mp.sampai,
                   k.fan,
                   k.nama AS kitab_nama,
                   k.musonnif
            FROM mapel mp
            INNER JOIN kitab k ON k.id = mp.kitab_id
            INNER JOIN kelas___mapel km ON km.mapel_id = mp.id
            WHERE km.kelas_id IN ($placeholders)
            ORDER BY k.fan ASC, k.nama ASC, mp.dari ASC
        ");
        $stmt->execute($kelasIds);
        $mapelList = $stmt->fetchAll();

        $stmt = $db->prepare("
            SELECT s.id AS santri_id,
                   s.nomer_induk,
                   s.nama,
                   sk.urutan,
                   sk.kelas_id,
                   kl.nama_kelas,
                   kl.kel
            FROM santri s
            INNER JOIN santri___kelas sk ON sk.santri_id = s.id AND sk.tanggal_selesai IS NULL
            INNER JOIN kelas kl ON kl.id = sk.kelas_id
            WHERE sk.kelas_id IN ($placeholders)
            ORDER BY kl.nama_kelas ASC, kl.kel ASC, sk.urutan ASC, s.nama ASC
        ");
        $stmt->execute($kelasIds);
        $santriList = $stmt->fetchAll();

        $stmt = $db->prepare("
            SELECT n.santri_id,
                   n.kelas_id,
                   n.mapel_id,
                   n.tanggal_ujian,
                   n.absen,
                   n.nilai
            FROM santri___nilai n
            WHERE n.kelas_id IN ($placeholders)
              AND n.tanggal_ujian BETWEEN ? AND ?
            ORDER BY n.tanggal_ujian ASC, n.id ASC
        ");
        $stmt->execute(array_merge($kelasIds, [$tanggalAwal, $tanggalAkhir]));
        $nilaiRows = $stmt->fetchAll();

        // Entri terakhir per santri+kelas+mapel dalam rentang
        $cellMap = [];
        foreach ($nilaiRows as $row) {
            $sid = (string) $row['santri_id'];
            $kid = (string) $row['kelas_id'];
            $mid = (string) $row['mapel_id'];
            $cellMap[$sid][$kid][$mid] = [
                'nilai' => $row['nilai'] === null ? null : (float) $row['nilai'],
                'absen' => $row['absen'],
                'tanggal' => $row['tanggal_ujian'],
            ];
        }

        $data = [];
        foreach ($santriList as $s) {
            $sid = (string) $s['santri_id'];
            $kid = (string) $s['kelas_id'];
            $cells = [];
            foreach ($mapelList as $m) {
                $mid = (string) $m['id'];
                $cells[$mid] = $cellMap[$sid][$kid][$mid] ?? null;
            }
            $data[] = [
                'santri_id' => $sid,
                'nomer_induk' => $s['nomer_induk'],
                'nama' => $s['nama'],
                'urutan' => (int) $s['urutan'],
                'kelas_id' => $kid,
                'nama_kelas' => $s['nama_kelas'],
                'kel' => $s['kel'],
                'cells' => $cells,
            ];
        }

        return $this->jsonResponse($response, [
            'success' => true,
            'mapel' => $mapelList,
            'data' => $data,
            'meta' => [
                'kelas_ids' => array_map('strval', $kelasIds),
                'tanggal_awal' => $tanggalAwal,
                'tanggal_akhir' => $tanggalAkhir,
            ],
        ]);
    }

    public function reorder(Request $request, Response $response): Response {
        $data = $this->parseBody($request);
        $kelasId = trim((string) ($data['kelas_id'] ?? ''));
        $santriIds = $data['santri_ids'] ?? null;

        if ($kelasId === '') {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'kelas_id wajib']);
        }
        if (!is_array($santriIds) || empty($santriIds)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'santri_ids harus array tidak kosong']);
        }

        $db = Database::getInstance();
        if (!$this->kelasExists($db, (int) $kelasId)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kelas tidak ditemukan']);
        }

        $stmt = $db->prepare('
            SELECT santri_id FROM santri___kelas
            WHERE kelas_id = :kelas_id AND tanggal_selesai IS NULL
        ');
        $stmt->execute(['kelas_id' => $kelasId]);
        $currentIds = array_map('strval', array_column($stmt->fetchAll(), 'santri_id'));
        sort($currentIds);

        $cleanIds = [];
        foreach ($santriIds as $sid) {
            $id = (string) (int) $sid;
            if ($id === '0') {
                continue;
            }
            if (!in_array($id, $cleanIds, true)) {
                $cleanIds[] = $id;
            }
        }
        $sortedClean = $cleanIds;
        sort($sortedClean);

        if ($sortedClean !== $currentIds) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Daftar santri tidak cocok dengan rombel aktif',
            ]);
        }

        try {
            $db->beginTransaction();
            $update = $db->prepare('
                UPDATE santri___kelas
                SET urutan = :urutan
                WHERE kelas_id = :kelas_id AND santri_id = :santri_id AND tanggal_selesai IS NULL
            ');
            foreach ($cleanIds as $index => $santriId) {
                $update->execute([
                    'urutan' => $index + 1,
                    'kelas_id' => $kelasId,
                    'santri_id' => $santriId,
                ]);
            }
            $db->commit();
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Urutan santri disimpan',
                'data' => array_map(static function ($id, $i) {
                    return ['santri_id' => $id, 'urutan' => $i + 1];
                }, $cleanIds, array_keys($cleanIds)),
            ]);
        } catch (\Exception $e) {
            $db->rollBack();
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan urutan: ' . $e->getMessage(),
            ]);
        }
    }

    private function kelasExists($db, int $id): bool {
        $stmt = $db->prepare('SELECT id FROM kelas WHERE id = :id');
        $stmt->execute(['id' => $id]);
        return (bool) $stmt->fetch();
    }

    private function mapelAssignedToKelas($db, int $kelasId, int $mapelId): bool {
        $stmt = $db->prepare('SELECT 1 FROM kelas___mapel WHERE kelas_id = :kelas_id AND mapel_id = :mapel_id');
        $stmt->execute(['kelas_id' => $kelasId, 'mapel_id' => $mapelId]);
        return (bool) $stmt->fetch();
    }

    private function santriInKelas($db, int $santriId, int $kelasId): bool {
        $stmt = $db->prepare('
            SELECT 1 FROM santri___kelas
            WHERE santri_id = :santri_id AND kelas_id = :kelas_id AND tanggal_selesai IS NULL
        ');
        $stmt->execute(['santri_id' => $santriId, 'kelas_id' => $kelasId]);
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
