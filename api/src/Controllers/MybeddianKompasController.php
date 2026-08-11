<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\SantriStatusHelper;
use App\Helpers\TahunAjaranActiveHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * KOMMPAS di myBeddien: PJGT (madrasah_id token) dan santri Guru Tugas (penugasan aktif).
 * Menulis lewat UgtKompasController (deadline, validasi peserta).
 */
class MybeddianKompasController
{
    private \PDO $db;
    private UgtKompasController $core;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $this->core = new UgtKompasController();
    }

    private function json(Response $response, array $data, int $status): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    private function resolveActiveTahunAjaran(): ?string
    {
        $today = (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d');
        $row = TahunAjaranActiveHelper::fetchActiveHijriyahRowForMasehiDate($this->db, $today);
        if ($row && !empty($row['tahun_ajaran'])) {
            return trim((string) $row['tahun_ajaran']);
        }
        $st = $this->db->query(
            "SELECT tahun_ajaran FROM tahun_ajaran WHERE kategori = 'hijriyah' ORDER BY dari DESC LIMIT 1"
        );
        $ta = $st ? $st->fetchColumn() : false;

        return $ta ? trim((string) $ta) : null;
    }

    private function santriIsGuruTugas(int $santriId): bool
    {
        if ($santriId <= 0) {
            return false;
        }
        $labels = SantriStatusHelper::currentStatusLabels($this->db, $santriId);

        return strtolower(trim($labels['status_santri'] ?? '')) === 'guru tugas';
    }

    /**
     * @return array{ok:bool,message?:string,id_madrasah?:int,nama_madrasah?:string,mode?:string}
     */
    private function resolveMadrasahContext(Request $request, string $tahunAjaran): array
    {
        $user = $request->getAttribute('user');
        $userArr = is_array($user) ? $user : [];
        $madrasahId = isset($userArr['madrasah_id']) ? (int) $userArr['madrasah_id'] : 0;
        if ($madrasahId > 0) {
            $st = $this->db->prepare('SELECT id, nama FROM madrasah WHERE id = ? LIMIT 1');
            $st->execute([$madrasahId]);
            $m = $st->fetch(\PDO::FETCH_ASSOC);
            if (!$m) {
                return ['ok' => false, 'message' => 'Madrasah tidak ditemukan'];
            }

            return [
                'ok' => true,
                'id_madrasah' => (int) $m['id'],
                'nama_madrasah' => (string) $m['nama'],
                'mode' => 'pjgt',
            ];
        }

        $santriId = isset($userArr['santri_id']) ? (int) $userArr['santri_id'] : 0;
        if ($santriId <= 0 || !$this->santriIsGuruTugas($santriId)) {
            return ['ok' => false, 'message' => 'Akses KOMMPAS hanya untuk PJGT atau Guru Tugas'];
        }
        $st = $this->db->prepare(
            'SELECT t.id_madrasah, m.nama AS nama_madrasah
             FROM ugt___guru_tugas_tugasan t
             INNER JOIN madrasah m ON m.id = t.id_madrasah
             WHERE t.id_santri = ? AND t.id_tahun_ajaran = ?
             AND (t.is_aktif IS NULL OR t.is_aktif = 1)
             ORDER BY t.id ASC LIMIT 1'
        );
        $st->execute([$santriId, $tahunAjaran]);
        $row = $st->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            return ['ok' => false, 'message' => 'Tidak ada penugasan Guru Tugas aktif untuk tahun ajaran ini'];
        }

        return [
            'ok' => true,
            'id_madrasah' => (int) $row['id_madrasah'],
            'nama_madrasah' => (string) $row['nama_madrasah'],
            'mode' => 'guru_tugas',
        ];
    }

    /**
     * GET /api/mybeddian/v2/kompas
     */
    public function overview(Request $request, Response $response): Response
    {
        try {
            $q = $request->getQueryParams();
            $ta = trim((string) ($q['tahun_ajaran'] ?? ''));
            if ($ta === '') {
                $ta = $this->resolveActiveTahunAjaran() ?? '';
            }
            if ($ta === '') {
                return $this->json($response, ['success' => false, 'message' => 'Tahun ajaran tidak tersedia'], 400);
            }
            $ctx = $this->resolveMadrasahContext($request, $ta);
            if (!$ctx['ok']) {
                return $this->json($response, ['success' => false, 'message' => $ctx['message']], 403);
            }
            $idMadrasah = (int) $ctx['id_madrasah'];
            $aturan = $this->core->fetchAturanState($ta);

            $st = $this->db->prepare(
                'SELECT l.*,
                        d.id AS id_daftar,
                        (SELECT COUNT(*) FROM ugt___kompas_peserta p WHERE p.id_daftar = d.id) AS jumlah_peserta
                 FROM ugt___kompas_lomba l
                 LEFT JOIN ugt___kompas_daftar d ON d.id_lomba = l.id AND d.id_madrasah = ?
                 WHERE l.tahun_ajaran = ?
                 ORDER BY l.nama ASC, l.id ASC'
            );
            $st->execute([$idMadrasah, $ta]);
            $rows = $st->fetchAll(\PDO::FETCH_ASSOC) ?: [];
            $lomba = [];
            foreach ($rows as $r) {
                $idDaftar = $r['id_daftar'] !== null ? (int) $r['id_daftar'] : null;
                $lomba[] = [
                    'id' => (int) $r['id'],
                    'nama' => $r['nama'],
                    'deskripsi' => $r['deskripsi'],
                    'aturan' => $r['aturan'],
                    'tempat_maps_url' => $r['tempat_maps_url'],
                    'tempat_catatan' => $r['tempat_catatan'],
                    'kategori' => $r['kategori'],
                    'anggota_per_kelompok' => $r['anggota_per_kelompok'] !== null ? (int) $r['anggota_per_kelompok'] : null,
                    'usia_min' => (int) $r['usia_min'],
                    'usia_max' => (int) $r['usia_max'],
                    'sudah_daftar' => $idDaftar !== null && $idDaftar > 0,
                    'id_daftar' => $idDaftar,
                    'jumlah_peserta' => (int) ($r['jumlah_peserta'] ?? 0),
                ];
            }

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'tahun_ajaran' => $ta,
                    'id_madrasah' => $idMadrasah,
                    'nama_madrasah' => $ctx['nama_madrasah'],
                    'mode' => $ctx['mode'],
                    'batas_pendaftaran' => $aturan['batas_pendaftaran'],
                    'pendaftaran_terbuka' => $aturan['pendaftaran_terbuka'],
                    'catatan_aturan' => $aturan['catatan'],
                    'lomba' => $lomba,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('MybeddianKompasController::overview ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat KOMMPAS'], 500);
        }
    }

    /**
     * Proxy: GET daftar detail — pastikan milik madrasah konteks.
     */
    public function getDaftar(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $st = $this->db->prepare(
                'SELECT d.*, l.nama AS nama_lomba, l.kategori, l.anggota_per_kelompok, l.usia_min, l.usia_max,
                        l.deskripsi, l.aturan, l.tempat_maps_url, l.tempat_catatan,
                        m.nama AS nama_madrasah
                 FROM ugt___kompas_daftar d
                 INNER JOIN ugt___kompas_lomba l ON l.id = d.id_lomba
                 INNER JOIN madrasah m ON m.id = d.id_madrasah
                 WHERE d.id = ? LIMIT 1'
            );
            $st->execute([$id]);
            $row = $st->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Pendaftaran tidak ditemukan'], 404);
            }
            $ctx = $this->resolveMadrasahContext($request, (string) $row['tahun_ajaran']);
            if (!$ctx['ok'] || (int) $ctx['id_madrasah'] !== (int) $row['id_madrasah']) {
                return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
            }
            $pst = $this->db->prepare(
                'SELECT * FROM ugt___kompas_peserta WHERE id_daftar = ? ORDER BY urutan ASC, id ASC'
            );
            $pst->execute([$id]);
            $row['peserta'] = $pst->fetchAll(\PDO::FETCH_ASSOC) ?: [];
            $aturan = $this->core->fetchAturanState((string) $row['tahun_ajaran']);
            $row['pendaftaran_terbuka'] = $aturan['pendaftaran_terbuka'];
            $row['batas_pendaftaran'] = $aturan['batas_pendaftaran'];

            return $this->json($response, ['success' => true, 'data' => $row], 200);
        } catch (\Throwable $e) {
            error_log('MybeddianKompasController::getDaftar ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat detail'], 500);
        }
    }

    public function createDaftar(Request $request, Response $response): Response
    {
        $data = $request->getParsedBody();
        $data = is_array($data) ? $data : [];
        $idLomba = (int) ($data['id_lomba'] ?? 0);
        $lst = $this->db->prepare('SELECT tahun_ajaran FROM ugt___kompas_lomba WHERE id = ? LIMIT 1');
        $lst->execute([$idLomba]);
        $lomba = $lst->fetch(\PDO::FETCH_ASSOC);
        if (!$lomba) {
            return $this->json($response, ['success' => false, 'message' => 'Lomba tidak ditemukan'], 404);
        }
        $ta = (string) $lomba['tahun_ajaran'];
        $ctx = $this->resolveMadrasahContext($request, $ta);
        if (!$ctx['ok']) {
            return $this->json($response, ['success' => false, 'message' => $ctx['message']], 403);
        }
        $data['id_madrasah'] = (int) $ctx['id_madrasah'];
        $request = $request->withParsedBody($data);

        // Patch request attribute so core userMayAccessMadrasah allows (apply_koordinator false for non-admin)
        // Core uses RoleHelper::tokenMadrasahDataApplyKoordinatorScope — PJGT typically not koordinator_ugt, so apply=false → allow all.
        return $this->core->createDaftar($request, $response);
    }

    public function updateDaftar(Request $request, Response $response, array $args): Response
    {
        $id = (int) ($args['id'] ?? 0);
        $st = $this->db->prepare('SELECT id, id_madrasah, tahun_ajaran FROM ugt___kompas_daftar WHERE id = ? LIMIT 1');
        $st->execute([$id]);
        $row = $st->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            return $this->json($response, ['success' => false, 'message' => 'Pendaftaran tidak ditemukan'], 404);
        }
        $ctx = $this->resolveMadrasahContext($request, (string) $row['tahun_ajaran']);
        if (!$ctx['ok'] || (int) $ctx['id_madrasah'] !== (int) $row['id_madrasah']) {
            return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
        }

        return $this->core->updateDaftar($request, $response, $args);
    }

    public function checkNik(Request $request, Response $response): Response
    {
        $q = $request->getQueryParams();
        $ta = trim((string) ($q['tahun_ajaran'] ?? ''));
        if ($ta === '') {
            $ta = $this->resolveActiveTahunAjaran() ?? '';
        }
        if ($ta === '') {
            return $this->json($response, ['success' => false, 'message' => 'Tahun ajaran tidak tersedia'], 400);
        }
        $ctx = $this->resolveMadrasahContext($request, $ta);
        if (!$ctx['ok']) {
            return $this->json($response, ['success' => false, 'message' => $ctx['message']], 403);
        }
        // Pastikan tahun ajaran ikut di query untuk core
        $params = $request->getQueryParams();
        $params['tahun_ajaran'] = $ta;
        $request = $request->withQueryParams($params);

        return $this->core->checkNik($request, $response);
    }

    public function upload(Request $request, Response $response): Response
    {
        $ta = $this->resolveActiveTahunAjaran() ?? '';
        if ($ta === '') {
            return $this->json($response, ['success' => false, 'message' => 'Tahun ajaran tidak tersedia'], 400);
        }
        $ctx = $this->resolveMadrasahContext($request, $ta);
        if (!$ctx['ok']) {
            return $this->json($response, ['success' => false, 'message' => $ctx['message']], 403);
        }
        $state = $this->core->fetchAturanState($ta);
        if (!$state['pendaftaran_terbuka']) {
            return $this->json($response, [
                'success' => false,
                'code' => 'pendaftaran_ditutup',
                'message' => 'Pendaftaran sudah ditutup',
            ], 403);
        }

        return $this->core->upload($request, $response);
    }

    public function serve(Request $request, Response $response): Response
    {
        $ta = $this->resolveActiveTahunAjaran() ?? '';
        if ($ta === '') {
            return $response->withStatus(400);
        }
        $ctx = $this->resolveMadrasahContext($request, $ta);
        if (!$ctx['ok']) {
            return $response->withStatus(403);
        }

        return $this->core->serve($request, $response);
    }
}
