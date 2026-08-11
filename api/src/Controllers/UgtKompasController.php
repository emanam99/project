<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\FileUploadValidator;
use App\Helpers\RoleHelper;
use App\Helpers\TextSanitizer;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * UGT KOMMPAS: CRUD lomba, pendaftaran madrasah, upload berkas peserta.
 */
class UgtKompasController
{
    private \PDO $db;
    private string $uploadsBasePath;

    private const PATH_KK_PATTERN = '#^uploads/ugt/kompas/[^/]+$#';
    private const PATH_FOTO_PATTERN = '#^uploads/ugt/kompas/[^/]+$#';

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $config = require __DIR__ . '/../../config.php';
        $root = rtrim($config['uploads_base_path'] ?? __DIR__ . '/../..', '/\\');
        $folder = $config['uploads_folder'] ?? 'uploads';
        $uploadsDir = $root . DIRECTORY_SEPARATOR . trim($folder, '/\\');
        $this->uploadsBasePath = rtrim(realpath($uploadsDir) ?: $uploadsDir, DIRECTORY_SEPARATOR . '/');
    }

    private function json(Response $response, array $data, int $status): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /** @return array{user: array, pengurus_id: int, apply_koordinator: bool, users_id: ?int} */
    private function authContext(Request $request): array
    {
        $user = $request->getAttribute('user');
        $userArr = is_array($user) ? $user : [];
        $pengurusId = isset($userArr['user_id']) ? (int) $userArr['user_id'] : 0;
        $usersId = isset($userArr['users_id']) ? (int) $userArr['users_id'] : 0;
        if ($usersId <= 0 && $pengurusId > 0) {
            $st = $this->db->prepare('SELECT id_user FROM pengurus WHERE id = ? LIMIT 1');
            $st->execute([$pengurusId]);
            $row = $st->fetch(\PDO::FETCH_ASSOC);
            $usersId = $row && !empty($row['id_user']) ? (int) $row['id_user'] : 0;
        }
        $apply = RoleHelper::tokenMadrasahDataApplyKoordinatorScope($this->db, $userArr);

        return [
            'user' => $userArr,
            'pengurus_id' => $pengurusId,
            'apply_koordinator' => $apply,
            'users_id' => $usersId > 0 ? $usersId : null,
        ];
    }

    private function userMayAccessMadrasah(Request $request, int $madrasahId): bool
    {
        if ($madrasahId <= 0) {
            return false;
        }
        $ctx = $this->authContext($request);
        if (!$ctx['apply_koordinator']) {
            return true;
        }
        $stmt = $this->db->prepare('SELECT 1 FROM madrasah WHERE id = ? AND id_koordinator = ? LIMIT 1');
        $stmt->execute([$madrasahId, $ctx['pengurus_id']]);

        return (bool) $stmt->fetchColumn();
    }

    private function getKompasDir(): string
    {
        $dir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'ugt' . DIRECTORY_SEPARATOR . 'kompas';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        return $dir;
    }

    private function normalizeNik(string $nik): string
    {
        return preg_replace('/\D+/', '', $nik) ?? '';
    }

    /** Usia penuh tahun pada tanggal cutoff. */
    private function ageYears(string $tanggalLahir, string $cutoffYmd): int
    {
        try {
            $birth = new \DateTimeImmutable($tanggalLahir);
            $cutoff = new \DateTimeImmutable($cutoffYmd);
        } catch (\Throwable $e) {
            return -1;
        }
        $age = (int) $birth->diff($cutoff)->y;
        if ($birth > $cutoff) {
            return -1;
        }

        return $age;
    }

    private function usiaCutoffForTahunAjaran(string $tahunAjaran): string
    {
        $st = $this->db->prepare('SELECT `dari` FROM tahun_ajaran WHERE tahun_ajaran = ? LIMIT 1');
        $st->execute([$tahunAjaran]);
        $dari = $st->fetchColumn();
        if ($dari && preg_match('/^\d{4}-\d{2}-\d{2}/', (string) $dari)) {
            return substr((string) $dari, 0, 10);
        }

        return (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d');
    }

    /** @param array<string, mixed> $row */
    private function buildAlamatMadrasah(array $row): string
    {
        $pick = static function (string ...$vals): string {
            foreach ($vals as $v) {
                $t = trim($v);
                if ($t !== '') {
                    return $t;
                }
            }

            return '';
        };

        $parts = array_values(array_filter([
            $pick((string) ($row['desa'] ?? ''), (string) ($row['alamat_desa_nama'] ?? '')),
            $pick((string) ($row['kecamatan'] ?? ''), (string) ($row['alamat_kecamatan_nama'] ?? '')),
            $pick((string) ($row['kabupaten'] ?? ''), (string) ($row['alamat_kabupaten_nama'] ?? '')),
        ], static fn (string $p): bool => $p !== ''));
        if ($parts !== []) {
            return implode(', ', $parts);
        }

        $rtPart = trim((string) ($row['rt'] ?? ''));
        $rwPart = trim((string) ($row['rw'] ?? ''));
        $rtRwLabel = '';
        if ($rtPart !== '' && $rwPart !== '') {
            $rtRwLabel = 'RT ' . $rtPart . '/RW ' . $rwPart;
        } elseif ($rtPart !== '') {
            $rtRwLabel = $rtPart;
        } elseif ($rwPart !== '') {
            $rtRwLabel = $rwPart;
        }

        $dusunParts = array_values(array_filter([
            trim((string) ($row['dusun'] ?? '')),
            $rtRwLabel,
        ], static fn (string $p): bool => $p !== ''));
        if ($dusunParts !== []) {
            return implode(', ', $dusunParts);
        }

        $alamatNama = trim((string) ($row['alamat_nama'] ?? ''));
        if ($alamatNama !== '') {
            return $alamatNama;
        }

        return trim((string) ($row['sektor'] ?? ''));
    }

    private function assertTahunAjaranExists(string $tahunAjaran): bool
    {
        $st = $this->db->prepare('SELECT 1 FROM tahun_ajaran WHERE tahun_ajaran = ? LIMIT 1');
        $st->execute([$tahunAjaran]);

        return (bool) $st->fetchColumn();
    }

    private function countDaftarForLomba(int $idLomba): int
    {
        $st = $this->db->prepare('SELECT COUNT(*) FROM ugt___kompas_daftar WHERE id_lomba = ?');
        $st->execute([$idLomba]);

        return (int) $st->fetchColumn();
    }

    /** @return array{tahun_ajaran: string, batas_pendaftaran: ?string, catatan: ?string, pendaftaran_terbuka: bool} */
    public function fetchAturanState(string $tahunAjaran): array
    {
        $st = $this->db->prepare(
            'SELECT tahun_ajaran, batas_pendaftaran, catatan FROM ugt___kompas_aturan WHERE tahun_ajaran = ? LIMIT 1'
        );
        $st->execute([$tahunAjaran]);
        $row = $st->fetch(\PDO::FETCH_ASSOC);
        $batas = null;
        $catatan = null;
        if ($row) {
            $raw = $row['batas_pendaftaran'] ?? null;
            $batas = $raw ? substr((string) $raw, 0, 10) : null;
            $catatan = $row['catatan'] !== null && $row['catatan'] !== '' ? (string) $row['catatan'] : null;
        }
        $today = (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d');
        // Null batas = belum diset → masih terbuka (staf bisa set). Setelah tanggal lewat → terkunci.
        $terbuka = $batas === null || $batas === '' || $batas >= $today;

        return [
            'tahun_ajaran' => $tahunAjaran,
            'batas_pendaftaran' => $batas,
            'catatan' => $catatan,
            'pendaftaran_terbuka' => $terbuka,
        ];
    }

    /** @return Response|null response 403 jika terkunci */
    private function rejectIfPendaftaranTerkunci(Response $response, string $tahunAjaran): ?Response
    {
        $state = $this->fetchAturanState($tahunAjaran);
        if ($state['pendaftaran_terbuka']) {
            return null;
        }
        $batas = $state['batas_pendaftaran'] ?? '';

        return $this->json($response, [
            'success' => false,
            'code' => 'pendaftaran_ditutup',
            'message' => 'Pendaftaran sudah ditutup'
                . ($batas !== '' ? " (batas {$batas})" : '')
                . '. Data hanya bisa dilihat.',
            'data' => $state,
        ], 403);
    }

    /**
     * GET /api/ugt/kompas/dashboard?tahun_ajaran=
     * Ringkasan KPI + per lomba + pendaftaran terbaru (menghormati filter koordinator).
     */
    public function dashboard(Request $request, Response $response): Response
    {
        try {
            $ta = trim((string) ($request->getQueryParams()['tahun_ajaran'] ?? ''));
            if ($ta === '') {
                return $this->json($response, ['success' => false, 'message' => 'Parameter tahun_ajaran wajib'], 400);
            }
            if (!$this->assertTahunAjaranExists($ta)) {
                return $this->json($response, ['success' => false, 'message' => 'Tahun ajaran tidak ditemukan'], 404);
            }

            $ctx = $this->authContext($request);
            $aturan = $this->fetchAturanState($ta);
            $filterKoord = $ctx['apply_koordinator'] && $ctx['pengurus_id'] > 0;

            $joinKoord = $filterKoord
                ? ' INNER JOIN madrasah m ON m.id = d.id_madrasah AND m.id_koordinator = ? '
                : '';
            $bindScoped = $filterKoord ? [(int) $ctx['pengurus_id'], $ta] : [$ta];

            $subCountDaftar = $filterKoord
                ? '(SELECT COUNT(*) FROM ugt___kompas_daftar d
                    INNER JOIN madrasah m ON m.id = d.id_madrasah AND m.id_koordinator = ?
                    WHERE d.id_lomba = l.id)'
                : '(SELECT COUNT(*) FROM ugt___kompas_daftar d WHERE d.id_lomba = l.id)';
            $stLomba = $this->db->prepare(
                "SELECT l.id, l.nama, l.kategori, l.anggota_per_kelompok, l.usia_min, l.usia_max,
                        {$subCountDaftar} AS jumlah_daftar
                 FROM ugt___kompas_lomba l
                 WHERE l.tahun_ajaran = ?
                 ORDER BY jumlah_daftar DESC, l.nama ASC"
            );
            $stLomba->execute($filterKoord ? [(int) $ctx['pengurus_id'], $ta] : [$ta]);
            $lombaRows = $stLomba->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            $stRingkas = $this->db->prepare(
                "SELECT
                    COUNT(DISTINCT d.id) AS total_daftar,
                    COUNT(DISTINCT d.id_madrasah) AS total_madrasah,
                    COUNT(DISTINCT p.id) AS total_peserta
                 FROM ugt___kompas_daftar d
                 {$joinKoord}
                 LEFT JOIN ugt___kompas_peserta p ON p.id_daftar = d.id
                 WHERE d.tahun_ajaran = ?"
            );
            $stRingkas->execute($bindScoped);
            $ringkas = $stRingkas->fetch(\PDO::FETCH_ASSOC) ?: [];

            $stPerKategori = $this->db->prepare(
                "SELECT l.kategori, COUNT(DISTINCT d.id) AS jumlah_daftar
                 FROM ugt___kompas_daftar d
                 INNER JOIN ugt___kompas_lomba l ON l.id = d.id_lomba
                 {$joinKoord}
                 WHERE d.tahun_ajaran = ?
                 GROUP BY l.kategori"
            );
            $stPerKategori->execute($bindScoped);
            $byKat = ['grup' => 0, 'perorangan' => 0];
            foreach ($stPerKategori->fetchAll(\PDO::FETCH_ASSOC) ?: [] as $row) {
                $k = strtolower((string) ($row['kategori'] ?? ''));
                if (isset($byKat[$k])) {
                    $byKat[$k] = (int) ($row['jumlah_daftar'] ?? 0);
                }
            }

            $stRecent = $this->db->prepare(
                'SELECT d.id, d.created_at, d.id_lomba, d.id_madrasah,
                        l.nama AS nama_lomba, l.kategori,
                        m.nama AS nama_madrasah,
                        (SELECT COUNT(*) FROM ugt___kompas_peserta p WHERE p.id_daftar = d.id) AS jumlah_peserta
                 FROM ugt___kompas_daftar d
                 INNER JOIN ugt___kompas_lomba l ON l.id = d.id_lomba
                 INNER JOIN madrasah m ON m.id = d.id_madrasah'
                . ($filterKoord ? ' AND m.id_koordinator = ? ' : '')
                . ' WHERE d.tahun_ajaran = ?
                 ORDER BY d.created_at DESC, d.id DESC
                 LIMIT 8'
            );
            $stRecent->execute($bindScoped);
            $recent = $stRecent->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            $totalLomba = count($lombaRows);
            $lombaDenganPendaftar = 0;
            $maxDaftar = 0;
            $perLomba = [];
            foreach ($lombaRows as $l) {
                $jd = (int) ($l['jumlah_daftar'] ?? 0);
                if ($jd > 0) {
                    $lombaDenganPendaftar++;
                }
                if ($jd > $maxDaftar) {
                    $maxDaftar = $jd;
                }
                $perLomba[] = [
                    'id' => (int) $l['id'],
                    'nama' => (string) $l['nama'],
                    'kategori' => (string) $l['kategori'],
                    'anggota_per_kelompok' => $l['anggota_per_kelompok'] !== null ? (int) $l['anggota_per_kelompok'] : null,
                    'usia_min' => (int) $l['usia_min'],
                    'usia_max' => (int) $l['usia_max'],
                    'jumlah_daftar' => $jd,
                ];
            }

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'tahun_ajaran' => $ta,
                    'aturan' => $aturan,
                    'summary' => [
                        'total_lomba' => $totalLomba,
                        'lomba_dengan_pendaftar' => $lombaDenganPendaftar,
                        'total_daftar' => (int) ($ringkas['total_daftar'] ?? 0),
                        'total_madrasah' => (int) ($ringkas['total_madrasah'] ?? 0),
                        'total_peserta' => (int) ($ringkas['total_peserta'] ?? 0),
                        'daftar_grup' => $byKat['grup'],
                        'daftar_perorangan' => $byKat['perorangan'],
                        'max_daftar_per_lomba' => $maxDaftar,
                    ],
                    'per_lomba' => $perLomba,
                    'recent_daftar' => $recent,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('UgtKompasController::dashboard ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat dashboard'], 500);
        }
    }

    /**
     * GET /api/ugt/kompas/aturan?tahun_ajaran=
     */
    public function getAturan(Request $request, Response $response): Response
    {
        try {
            $ta = trim((string) ($request->getQueryParams()['tahun_ajaran'] ?? ''));
            if ($ta === '') {
                return $this->json($response, ['success' => false, 'message' => 'Parameter tahun_ajaran wajib'], 400);
            }
            if (!$this->assertTahunAjaranExists($ta)) {
                return $this->json($response, ['success' => false, 'message' => 'Tahun ajaran tidak ditemukan'], 404);
            }

            return $this->json($response, ['success' => true, 'data' => $this->fetchAturanState($ta)], 200);
        } catch (\Throwable $e) {
            error_log('UgtKompasController::getAturan ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat aturan'], 500);
        }
    }

    /**
     * PUT /api/ugt/kompas/aturan
     * Body: tahun_ajaran, batas_pendaftaran (Y-m-d|null), catatan?
     */
    public function saveAturan(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? $data : [];
            $ta = trim((string) ($data['tahun_ajaran'] ?? ''));
            if ($ta === '' || !$this->assertTahunAjaranExists($ta)) {
                return $this->json($response, ['success' => false, 'message' => 'Tahun ajaran tidak valid'], 400);
            }
            $batasRaw = $data['batas_pendaftaran'] ?? null;
            $batas = $batasRaw === null || $batasRaw === '' ? null : trim((string) $batasRaw);
            if ($batas !== null && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $batas)) {
                return $this->json($response, ['success' => false, 'message' => 'Format tanggal batas harus YYYY-MM-DD'], 400);
            }
            $catatan = trim((string) ($data['catatan'] ?? ''));
            $catatan = $catatan !== '' ? mb_substr(TextSanitizer::cleanMultilineMessage($catatan), 0, 5000) : null;
            $ctx = $this->authContext($request);

            $st = $this->db->prepare(
                'INSERT INTO ugt___kompas_aturan (tahun_ajaran, batas_pendaftaran, catatan, updated_by)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE batas_pendaftaran = VALUES(batas_pendaftaran), catatan = VALUES(catatan), updated_by = VALUES(updated_by)'
            );
            $st->execute([$ta, $batas, $catatan, $ctx['users_id']]);

            return $this->json($response, [
                'success' => true,
                'message' => 'Aturan umum disimpan',
                'data' => $this->fetchAturanState($ta),
            ], 200);
        } catch (\Throwable $e) {
            error_log('UgtKompasController::saveAturan ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan aturan'], 500);
        }
    }

    /**
     * GET /api/ugt/kompas/lomba?tahun_ajaran=
     */
    public function listLomba(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $ta = trim((string) ($params['tahun_ajaran'] ?? ''));
            if ($ta === '') {
                return $this->json($response, ['success' => false, 'message' => 'Parameter tahun_ajaran wajib'], 400);
            }
            $st = $this->db->prepare(
                'SELECT l.*, (SELECT COUNT(*) FROM ugt___kompas_daftar d WHERE d.id_lomba = l.id) AS jumlah_daftar
                 FROM ugt___kompas_lomba l
                 WHERE l.tahun_ajaran = ?
                 ORDER BY l.nama ASC, l.id ASC'
            );
            $st->execute([$ta]);
            $rows = $st->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            return $this->json($response, ['success' => true, 'data' => $rows], 200);
        } catch (\Throwable $e) {
            error_log('UgtKompasController::listLomba ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat lomba'], 500);
        }
    }

    /**
     * GET /api/ugt/kompas/lomba/{id}
     */
    public function getLomba(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $st = $this->db->prepare(
                'SELECT l.*, (SELECT COUNT(*) FROM ugt___kompas_daftar d WHERE d.id_lomba = l.id) AS jumlah_daftar
                 FROM ugt___kompas_lomba l WHERE l.id = ? LIMIT 1'
            );
            $st->execute([$id]);
            $row = $st->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Lomba tidak ditemukan'], 404);
            }

            return $this->json($response, ['success' => true, 'data' => $row], 200);
        } catch (\Throwable $e) {
            error_log('UgtKompasController::getLomba ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat lomba'], 500);
        }
    }

    /**
     * @param array<string, mixed> $data
     * @return array{ok:bool,message?:string,payload?:array}
     */
    private function parseLombaBody(array $data, bool $isUpdate): array
    {
        $nama = trim((string) ($data['nama'] ?? ''));
        $deskripsi = trim((string) ($data['deskripsi'] ?? ''));
        $aturan = trim((string) ($data['aturan'] ?? ''));
        $tempatMaps = trim((string) ($data['tempat_maps_url'] ?? ''));
        $tempatCatatan = trim((string) ($data['tempat_catatan'] ?? ''));
        $kategori = strtolower(trim((string) ($data['kategori'] ?? '')));
        $anggota = isset($data['anggota_per_kelompok']) && $data['anggota_per_kelompok'] !== '' && $data['anggota_per_kelompok'] !== null
            ? (int) $data['anggota_per_kelompok']
            : null;
        $usiaMin = (int) ($data['usia_min'] ?? 0);
        $usiaMax = (int) ($data['usia_max'] ?? 0);
        $tahunAjaran = trim((string) ($data['tahun_ajaran'] ?? ''));

        if ($nama === '') {
            return ['ok' => false, 'message' => 'Nama lomba wajib diisi'];
        }
        if (!in_array($kategori, ['grup', 'perorangan'], true)) {
            return ['ok' => false, 'message' => 'Kategori harus grup atau perorangan'];
        }
        if ($kategori === 'grup') {
            if ($anggota === null || $anggota < 2) {
                return ['ok' => false, 'message' => 'Jumlah orang per kelompok minimal 2 untuk kategori grup'];
            }
        } else {
            $anggota = null;
        }
        if ($usiaMin < 0 || $usiaMax < 0 || $usiaMin > 120 || $usiaMax > 120) {
            return ['ok' => false, 'message' => 'Usia min/max tidak valid'];
        }
        if ($usiaMin > $usiaMax) {
            return ['ok' => false, 'message' => 'Usia minimum tidak boleh lebih besar dari usia maksimum'];
        }
        if (!$isUpdate) {
            if ($tahunAjaran === '') {
                return ['ok' => false, 'message' => 'Tahun ajaran wajib'];
            }
            if (!$this->assertTahunAjaranExists($tahunAjaran)) {
                return ['ok' => false, 'message' => 'Tahun ajaran tidak ditemukan'];
            }
        }

        $nama = mb_substr(TextSanitizer::cleanText($nama), 0, 200);
        $deskripsi = TextSanitizer::cleanRichHtmlOrNull($deskripsi);
        $aturan = TextSanitizer::cleanRichHtmlOrNull($aturan);
        $tempatMaps = mb_substr(TextSanitizer::cleanText($tempatMaps), 0, 500);
        $tempatCatatan = mb_substr(TextSanitizer::cleanText($tempatCatatan), 0, 500);

        return [
            'ok' => true,
            'payload' => [
                'tahun_ajaran' => $tahunAjaran,
                'nama' => $nama,
                'deskripsi' => $deskripsi,
                'aturan' => $aturan,
                'tempat_maps_url' => $tempatMaps !== '' ? $tempatMaps : null,
                'tempat_catatan' => $tempatCatatan !== '' ? $tempatCatatan : null,
                'kategori' => $kategori,
                'anggota_per_kelompok' => $anggota,
                'usia_min' => $usiaMin,
                'usia_max' => $usiaMax,
            ],
        ];
    }

    /**
     * POST /api/ugt/kompas/lomba
     */
    public function createLomba(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? $data : [];
            $parsed = $this->parseLombaBody($data, false);
            if (!$parsed['ok']) {
                return $this->json($response, ['success' => false, 'message' => $parsed['message']], 400);
            }
            $p = $parsed['payload'];
            $ctx = $this->authContext($request);
            $st = $this->db->prepare(
                'INSERT INTO ugt___kompas_lomba
                (tahun_ajaran, nama, deskripsi, aturan, tempat_maps_url, tempat_catatan, kategori, anggota_per_kelompok, usia_min, usia_max, created_by)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)'
            );
            $st->execute([
                $p['tahun_ajaran'],
                $p['nama'],
                $p['deskripsi'],
                $p['aturan'],
                $p['tempat_maps_url'],
                $p['tempat_catatan'],
                $p['kategori'],
                $p['anggota_per_kelompok'],
                $p['usia_min'],
                $p['usia_max'],
                $ctx['users_id'],
            ]);
            $id = (int) $this->db->lastInsertId();

            return $this->json($response, ['success' => true, 'message' => 'Lomba dibuat', 'data' => ['id' => $id]], 201);
        } catch (\Throwable $e) {
            error_log('UgtKompasController::createLomba ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal membuat lomba'], 500);
        }
    }

    /**
     * PUT /api/ugt/kompas/lomba/{id}
     */
    public function updateLomba(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $st = $this->db->prepare('SELECT * FROM ugt___kompas_lomba WHERE id = ? LIMIT 1');
            $st->execute([$id]);
            $existing = $st->fetch(\PDO::FETCH_ASSOC);
            if (!$existing) {
                return $this->json($response, ['success' => false, 'message' => 'Lomba tidak ditemukan'], 404);
            }
            $hasDaftar = $this->countDaftarForLomba($id) > 0;

            $data = $request->getParsedBody();
            $data = is_array($data) ? $data : [];

            // Sudah ada pendaftar: hanya deskripsi, aturan, lokasi yang boleh diubah.
            if ($hasDaftar) {
                $deskripsi = TextSanitizer::cleanRichHtmlOrNull(trim((string) ($data['deskripsi'] ?? '')));
                $aturan = TextSanitizer::cleanRichHtmlOrNull(trim((string) ($data['aturan'] ?? '')));
                $tempatMaps = mb_substr(TextSanitizer::cleanText(trim((string) ($data['tempat_maps_url'] ?? ''))), 0, 500);
                $tempatCatatan = mb_substr(TextSanitizer::cleanText(trim((string) ($data['tempat_catatan'] ?? ''))), 0, 500);
                $upd = $this->db->prepare(
                    'UPDATE ugt___kompas_lomba SET deskripsi=?, aturan=?, tempat_maps_url=?, tempat_catatan=? WHERE id=?'
                );
                $upd->execute([
                    $deskripsi,
                    $aturan,
                    $tempatMaps !== '' ? $tempatMaps : null,
                    $tempatCatatan !== '' ? $tempatCatatan : null,
                    $id,
                ]);

                return $this->json($response, [
                    'success' => true,
                    'message' => 'Deskripsi, aturan, dan lokasi diperbarui (field lain terkunci karena sudah ada pendaftar)',
                ], 200);
            }

            $parsed = $this->parseLombaBody($data, true);
            if (!$parsed['ok']) {
                return $this->json($response, ['success' => false, 'message' => $parsed['message']], 400);
            }
            $p = $parsed['payload'];
            $upd = $this->db->prepare(
                'UPDATE ugt___kompas_lomba SET
                 nama=?, deskripsi=?, aturan=?, tempat_maps_url=?, tempat_catatan=?,
                 kategori=?, anggota_per_kelompok=?, usia_min=?, usia_max=?
                 WHERE id=?'
            );
            $upd->execute([
                $p['nama'],
                $p['deskripsi'],
                $p['aturan'],
                $p['tempat_maps_url'],
                $p['tempat_catatan'],
                $p['kategori'],
                $p['anggota_per_kelompok'],
                $p['usia_min'],
                $p['usia_max'],
                $id,
            ]);

            return $this->json($response, ['success' => true, 'message' => 'Lomba diperbarui'], 200);
        } catch (\Throwable $e) {
            error_log('UgtKompasController::updateLomba ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memperbarui lomba'], 500);
        }
    }

    /**
     * DELETE /api/ugt/kompas/lomba/{id}
     */
    public function deleteLomba(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $st = $this->db->prepare('SELECT id FROM ugt___kompas_lomba WHERE id = ? LIMIT 1');
            $st->execute([$id]);
            if (!$st->fetch(\PDO::FETCH_ASSOC)) {
                return $this->json($response, ['success' => false, 'message' => 'Lomba tidak ditemukan'], 404);
            }
            if ($this->countDaftarForLomba($id) > 0) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Lomba sudah ada pendaftar — hapus pendaftaran terlebih dahulu',
                ], 409);
            }
            $this->db->prepare('DELETE FROM ugt___kompas_lomba WHERE id = ?')->execute([$id]);

            return $this->json($response, ['success' => true, 'message' => 'Lomba dihapus'], 200);
        } catch (\Throwable $e) {
            error_log('UgtKompasController::deleteLomba ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal menghapus lomba'], 500);
        }
    }

    /**
     * GET /api/ugt/kompas/daftar?tahun_ajaran=&id_lomba=
     */
    public function listDaftar(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $ta = trim((string) ($params['tahun_ajaran'] ?? ''));
            if ($ta === '') {
                return $this->json($response, ['success' => false, 'message' => 'Parameter tahun_ajaran wajib'], 400);
            }
            $idLomba = isset($params['id_lomba']) && $params['id_lomba'] !== '' ? (int) $params['id_lomba'] : 0;
            $ctx = $this->authContext($request);

            $sql = 'SELECT d.*, l.nama AS nama_lomba, l.kategori, l.anggota_per_kelompok,
                           m.nama AS nama_madrasah, m.identitas AS identitas_madrasah,
                           (SELECT COUNT(*) FROM ugt___kompas_peserta p WHERE p.id_daftar = d.id) AS jumlah_peserta
                    FROM ugt___kompas_daftar d
                    INNER JOIN ugt___kompas_lomba l ON l.id = d.id_lomba
                    INNER JOIN madrasah m ON m.id = d.id_madrasah
                    WHERE d.tahun_ajaran = ?';
            $bind = [$ta];
            if ($idLomba > 0) {
                $sql .= ' AND d.id_lomba = ?';
                $bind[] = $idLomba;
            }
            if ($ctx['apply_koordinator'] && $ctx['pengurus_id'] > 0) {
                $sql .= ' AND m.id_koordinator = ?';
                $bind[] = $ctx['pengurus_id'];
            }
            $sql .= ' ORDER BY l.nama ASC, m.nama ASC, d.id DESC';
            $st = $this->db->prepare($sql);
            $st->execute($bind);
            $rows = $st->fetchAll(\PDO::FETCH_ASSOC) ?: [];
            $aturan = $this->fetchAturanState($ta);
            $cutoff = $this->usiaCutoffForTahunAjaran($ta);

            $ids = [];
            foreach ($rows as $r) {
                $id = (int) ($r['id'] ?? 0);
                if ($id > 0) {
                    $ids[] = $id;
                }
            }
            $usiaByDaftar = [];
            if ($ids !== []) {
                $placeholders = implode(',', array_fill(0, count($ids), '?'));
                $pst = $this->db->prepare(
                    "SELECT id_daftar, tanggal_lahir, urutan
                     FROM ugt___kompas_peserta
                     WHERE id_daftar IN ({$placeholders})
                     ORDER BY id_daftar ASC, urutan ASC, id ASC"
                );
                $pst->execute($ids);
                foreach ($pst->fetchAll(\PDO::FETCH_ASSOC) ?: [] as $pr) {
                    $did = (int) $pr['id_daftar'];
                    $usia = $this->ageYears((string) ($pr['tanggal_lahir'] ?? ''), $cutoff);
                    if (!isset($usiaByDaftar[$did])) {
                        $usiaByDaftar[$did] = [];
                    }
                    $usiaByDaftar[$did][] = $usia >= 0 ? $usia : null;
                }
            }
            foreach ($rows as &$r) {
                $did = (int) ($r['id'] ?? 0);
                $ages = $usiaByDaftar[$did] ?? [];
                $valid = array_values(array_filter($ages, static fn ($a) => $a !== null));
                $r['usia_peserta'] = $valid;
                $r['usia_peserta_label'] = $valid === []
                    ? ''
                    : implode(', ', array_map(static fn ($a) => $a . ' th', $valid));
            }
            unset($r);

            return $this->json($response, [
                'success' => true,
                'data' => $rows,
                'meta' => array_merge($aturan, ['usia_cutoff' => $cutoff]),
            ], 200);
        } catch (\Throwable $e) {
            error_log('UgtKompasController::listDaftar ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat pendaftaran'], 500);
        }
    }

    /**
     * GET /api/ugt/kompas/daftar-export?tahun_ajaran=&id_lomba=
     * Baris flat peserta (satu baris = satu peserta) untuk eksport Excel; filter sama listDaftar.
     */
    public function exportDaftar(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $ta = trim((string) ($params['tahun_ajaran'] ?? ''));
            if ($ta === '') {
                return $this->json($response, ['success' => false, 'message' => 'Parameter tahun_ajaran wajib'], 400);
            }
            $idLomba = isset($params['id_lomba']) && $params['id_lomba'] !== '' ? (int) $params['id_lomba'] : 0;
            $ctx = $this->authContext($request);

            $sql = 'SELECT d.id AS id_daftar, d.tahun_ajaran, d.created_at AS tanggal_daftar,
                           l.id AS id_lomba, l.nama AS nama_lomba, l.kategori, l.anggota_per_kelompok,
                           m.id AS id_madrasah, m.nama AS nama_madrasah, m.identitas AS identitas_madrasah,
                           m.dusun, m.rt, m.rw, m.desa, m.kecamatan, m.kabupaten, m.sektor,
                           pk.nama AS koordinator_nama, pk.nip AS koordinator_nip,
                           a.nama AS alamat_nama, a.tipe AS alamat_tipe,
                           a_desa.nama AS alamat_desa_nama,
                           a_kec.nama AS alamat_kecamatan_nama,
                           a_kab.nama AS alamat_kabupaten_nama,
                           gt.guru_tugas_nama,
                           p.urutan, p.nama AS nama_peserta, p.nik, p.tempat_lahir, p.tanggal_lahir,
                           p.nama_ayah, p.nama_ibu
                    FROM ugt___kompas_peserta p
                    INNER JOIN ugt___kompas_daftar d ON d.id = p.id_daftar
                    INNER JOIN ugt___kompas_lomba l ON l.id = d.id_lomba
                    INNER JOIN madrasah m ON m.id = d.id_madrasah
                    LEFT JOIN pengurus pk ON pk.id = m.id_koordinator
                    LEFT JOIN alamat a ON a.id = m.id_alamat
                    LEFT JOIN alamat a_desa ON a_desa.id = IF(a.tipe IN (\'desa\', \'dusun\'), m.id_alamat, NULL)
                    LEFT JOIN alamat a_kec ON a_kec.id = CASE
                        WHEN a.tipe IN (\'desa\', \'dusun\') AND m.id_alamat LIKE \'%.%.%.%\' THEN SUBSTRING_INDEX(m.id_alamat, \'.\', 3)
                        WHEN a.tipe = \'kecamatan\' THEN m.id_alamat
                        ELSE NULL
                    END
                    LEFT JOIN alamat a_kab ON a_kab.id = CASE
                        WHEN a.tipe IN (\'desa\', \'dusun\') AND m.id_alamat LIKE \'%.%.%\' THEN SUBSTRING_INDEX(m.id_alamat, \'.\', 2)
                        WHEN a.tipe = \'kecamatan\' AND m.id_alamat LIKE \'%.%.%\' THEN SUBSTRING_INDEX(m.id_alamat, \'.\', 2)
                        WHEN a.tipe = \'kabupaten\' THEN m.id_alamat
                        ELSE NULL
                    END
                    LEFT JOIN (
                        SELECT t.id_madrasah,
                               GROUP_CONCAT(DISTINCT s.nama ORDER BY s.nama SEPARATOR \', \') AS guru_tugas_nama
                        FROM ugt___guru_tugas_tugasan t
                        INNER JOIN santri s ON s.id = t.id_santri
                        WHERE t.id_tahun_ajaran = ?
                          AND COALESCE(t.is_aktif, 1) = 1
                        GROUP BY t.id_madrasah
                    ) gt ON gt.id_madrasah = m.id
                    WHERE d.tahun_ajaran = ?';
            $bind = [$ta, $ta];
            if ($idLomba > 0) {
                $sql .= ' AND d.id_lomba = ?';
                $bind[] = $idLomba;
            }
            if ($ctx['apply_koordinator'] && $ctx['pengurus_id'] > 0) {
                $sql .= ' AND m.id_koordinator = ?';
                $bind[] = $ctx['pengurus_id'];
            }
            $sql .= ' ORDER BY l.nama ASC, m.nama ASC, d.id ASC, p.urutan ASC, p.id ASC';
            $st = $this->db->prepare($sql);
            $st->execute($bind);
            $rows = $st->fetchAll(\PDO::FETCH_ASSOC) ?: [];
            $cutoff = $this->usiaCutoffForTahunAjaran($ta);
            foreach ($rows as &$r) {
                $usia = $this->ageYears((string) ($r['tanggal_lahir'] ?? ''), $cutoff);
                $r['usia'] = $usia >= 0 ? $usia : null;
                $r['alamat_madrasah'] = $this->buildAlamatMadrasah($r);
                $r['koordinator_nama'] = (string) ($r['koordinator_nama'] ?? '');
                $r['guru_tugas_nama'] = (string) ($r['guru_tugas_nama'] ?? '');
            }
            unset($r);

            $namaLombaFilter = null;
            if ($idLomba > 0) {
                $ls = $this->db->prepare('SELECT nama, kategori FROM ugt___kompas_lomba WHERE id = ? LIMIT 1');
                $ls->execute([$idLomba]);
                $lr = $ls->fetch(\PDO::FETCH_ASSOC);
                if ($lr) {
                    $namaLombaFilter = (string) ($lr['nama'] ?? '');
                }
            }

            return $this->json($response, [
                'success' => true,
                'data' => $rows,
                'meta' => [
                    'tahun_ajaran' => $ta,
                    'id_lomba' => $idLomba > 0 ? $idLomba : null,
                    'nama_lomba' => $namaLombaFilter,
                    'total_baris' => count($rows),
                    'usia_cutoff' => $cutoff,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('UgtKompasController::exportDaftar ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal menyiapkan data ekspor'], 500);
        }
    }

    /**
     * GET /api/ugt/kompas/daftar/{id}
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
                        m.nama AS nama_madrasah, m.identitas AS identitas_madrasah
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
            if (!$this->userMayAccessMadrasah($request, (int) $row['id_madrasah'])) {
                return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
            }
            $pst = $this->db->prepare(
                'SELECT * FROM ugt___kompas_peserta WHERE id_daftar = ? ORDER BY urutan ASC, id ASC'
            );
            $pst->execute([$id]);
            $peserta = $pst->fetchAll(\PDO::FETCH_ASSOC) ?: [];
            $cutoff = $this->usiaCutoffForTahunAjaran((string) ($row['tahun_ajaran'] ?? ''));
            foreach ($peserta as &$p) {
                $usia = $this->ageYears((string) ($p['tanggal_lahir'] ?? ''), $cutoff);
                $p['usia'] = $usia >= 0 ? $usia : null;
            }
            unset($p);
            $row['peserta'] = $peserta;
            $row['usia_cutoff'] = $cutoff;

            return $this->json($response, ['success' => true, 'data' => $row], 200);
        } catch (\Throwable $e) {
            error_log('UgtKompasController::getDaftar ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat detail'], 500);
        }
    }

    /**
     * POST /api/ugt/kompas/daftar
     * Body: id_lomba, id_madrasah, peserta: [{nama, nik, tempat_lahir, tanggal_lahir, path_kk, path_foto, nama_ayah?, nama_ibu?, nama_file_kk?, nama_file_foto?}]
     */
    public function createDaftar(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? $data : [];
            $idLomba = (int) ($data['id_lomba'] ?? 0);
            $idMadrasah = (int) ($data['id_madrasah'] ?? 0);
            $pesertaList = $data['peserta'] ?? [];
            if (!is_array($pesertaList)) {
                $pesertaList = [];
            }

            if ($idLomba <= 0 || $idMadrasah <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'Lomba dan madrasah wajib dipilih'], 400);
            }
            if (!$this->userMayAccessMadrasah($request, $idMadrasah)) {
                return $this->json($response, ['success' => false, 'message' => 'Madrasah di luar cakupan Anda'], 403);
            }

            $lst = $this->db->prepare('SELECT * FROM ugt___kompas_lomba WHERE id = ? LIMIT 1');
            $lst->execute([$idLomba]);
            $lomba = $lst->fetch(\PDO::FETCH_ASSOC);
            if (!$lomba) {
                return $this->json($response, ['success' => false, 'message' => 'Lomba tidak ditemukan'], 404);
            }
            $tahunAjaran = (string) $lomba['tahun_ajaran'];
            $locked = $this->rejectIfPendaftaranTerkunci($response, $tahunAjaran);
            if ($locked !== null) {
                return $locked;
            }
            $kategori = (string) $lomba['kategori'];
            $expectedCount = $kategori === 'grup' ? (int) ($lomba['anggota_per_kelompok'] ?? 0) : 1;
            if ($expectedCount < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Konfigurasi lomba tidak valid'], 400);
            }
            if (count($pesertaList) !== $expectedCount) {
                return $this->json($response, [
                    'success' => false,
                    'message' => $kategori === 'grup'
                        ? "Jumlah peserta harus tepat {$expectedCount} orang (satu kelompok)"
                        : 'Pendaftaran perorangan memerlukan tepat 1 peserta',
                ], 400);
            }

            $dup = $this->db->prepare('SELECT id FROM ugt___kompas_daftar WHERE id_lomba = ? AND id_madrasah = ? LIMIT 1');
            $dup->execute([$idLomba, $idMadrasah]);
            if ($dup->fetch(\PDO::FETCH_ASSOC)) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Madrasah ini sudah terdaftar di lomba tersebut',
                ], 409);
            }

            $cutoff = $this->usiaCutoffForTahunAjaran($tahunAjaran);
            $usiaMin = (int) $lomba['usia_min'];
            $usiaMax = (int) $lomba['usia_max'];
            $normalizedPeserta = [];
            $seenNik = [];

            foreach ($pesertaList as $i => $raw) {
                if (!is_array($raw)) {
                    return $this->json($response, ['success' => false, 'message' => 'Data peserta tidak valid'], 400);
                }
                $urutan = $i + 1;
                $nama = mb_substr(TextSanitizer::cleanText(trim((string) ($raw['nama'] ?? ''))), 0, 200);
                $nik = $this->normalizeNik((string) ($raw['nik'] ?? ''));
                $tempatLahir = mb_substr(TextSanitizer::cleanText(trim((string) ($raw['tempat_lahir'] ?? ''))), 0, 120);
                $tanggalLahir = trim((string) ($raw['tanggal_lahir'] ?? ''));
                $pathKk = trim((string) ($raw['path_kk'] ?? ''));
                $pathFoto = trim((string) ($raw['path_foto'] ?? ''));
                $namaAyah = trim((string) ($raw['nama_ayah'] ?? ''));
                $namaIbu = trim((string) ($raw['nama_ibu'] ?? ''));
                $namaFileKk = trim((string) ($raw['nama_file_kk'] ?? ''));
                $namaFileFoto = trim((string) ($raw['nama_file_foto'] ?? ''));

                if ($nama === '' || $nik === '' || $tempatLahir === '' || $tanggalLahir === '' || $pathKk === '' || $pathFoto === '') {
                    return $this->json($response, [
                        'success' => false,
                        'message' => "Peserta #{$urutan}: nama, NIK, tempat/tanggal lahir, KK, dan foto wajib diisi",
                    ], 400);
                }
                if (strlen($nik) < 8 || strlen($nik) > 20) {
                    return $this->json($response, [
                        'success' => false,
                        'message' => "Peserta #{$urutan}: NIK tidak valid",
                    ], 400);
                }
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggalLahir)) {
                    return $this->json($response, [
                        'success' => false,
                        'message' => "Peserta #{$urutan}: format tanggal lahir harus YYYY-MM-DD",
                    ], 400);
                }
                if (!preg_match(self::PATH_KK_PATTERN, $pathKk) || !preg_match(self::PATH_FOTO_PATTERN, $pathFoto)) {
                    return $this->json($response, [
                        'success' => false,
                        'message' => "Peserta #{$urutan}: path berkas tidak valid — unggah ulang KK/foto",
                    ], 400);
                }
                if (isset($seenNik[$nik])) {
                    return $this->json($response, [
                        'success' => false,
                        'message' => "NIK {$nik} dipakai dua kali dalam kelompok yang sama",
                    ], 400);
                }
                $seenNik[$nik] = true;

                $age = $this->ageYears($tanggalLahir, $cutoff);
                if ($age < 0) {
                    return $this->json($response, [
                        'success' => false,
                        'message' => "Peserta #{$urutan}: tanggal lahir tidak valid",
                    ], 400);
                }
                if ($age < $usiaMin || $age > $usiaMax) {
                    return $this->json($response, [
                        'success' => false,
                        'message' => "Usia peserta {$nama} {$age} tahun (di luar rentang {$usiaMin}–{$usiaMax})",
                        'code' => 'usia_invalid',
                        'data' => ['urutan' => $urutan, 'usia' => $age, 'usia_min' => $usiaMin, 'usia_max' => $usiaMax],
                    ], 400);
                }

                $chk = $this->db->prepare(
                    'SELECT p.id, d.id_lomba, l.nama AS nama_lomba
                     FROM ugt___kompas_peserta p
                     INNER JOIN ugt___kompas_daftar d ON d.id = p.id_daftar
                     INNER JOIN ugt___kompas_lomba l ON l.id = d.id_lomba
                     WHERE p.tahun_ajaran = ? AND p.nik = ? LIMIT 1'
                );
                $chk->execute([$tahunAjaran, $nik]);
                $existP = $chk->fetch(\PDO::FETCH_ASSOC);
                if ($existP) {
                    return $this->json($response, [
                        'success' => false,
                        'message' => "NIK {$nik} sudah terdaftar di lomba «{$existP['nama_lomba']}» pada tahun ajaran ini",
                        'code' => 'nik_duplicate',
                    ], 409);
                }

                $normalizedPeserta[] = [
                    'urutan' => $urutan,
                    'nama' => $nama,
                    'nik' => $nik,
                    'tempat_lahir' => $tempatLahir,
                    'tanggal_lahir' => $tanggalLahir,
                    'path_kk' => $pathKk,
                    'path_foto' => $pathFoto,
                    'nama_file_kk' => $namaFileKk !== '' ? mb_substr(TextSanitizer::cleanText($namaFileKk), 0, 255) : null,
                    'nama_file_foto' => $namaFileFoto !== '' ? mb_substr(TextSanitizer::cleanText($namaFileFoto), 0, 255) : null,
                    'nama_ayah' => $namaAyah !== '' ? mb_substr(TextSanitizer::cleanText($namaAyah), 0, 200) : null,
                    'nama_ibu' => $namaIbu !== '' ? mb_substr(TextSanitizer::cleanText($namaIbu), 0, 200) : null,
                ];
            }

            $ctx = $this->authContext($request);
            $this->db->beginTransaction();
            try {
                $insD = $this->db->prepare(
                    'INSERT INTO ugt___kompas_daftar (id_lomba, id_madrasah, tahun_ajaran, created_by) VALUES (?,?,?,?)'
                );
                $insD->execute([$idLomba, $idMadrasah, $tahunAjaran, $ctx['users_id']]);
                $idDaftar = (int) $this->db->lastInsertId();

                $insP = $this->db->prepare(
                    'INSERT INTO ugt___kompas_peserta
                    (id_daftar, tahun_ajaran, urutan, nama, nik, tempat_lahir, tanggal_lahir, path_kk, path_foto, nama_file_kk, nama_file_foto, nama_ayah, nama_ibu)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
                );
                foreach ($normalizedPeserta as $p) {
                    $insP->execute([
                        $idDaftar,
                        $tahunAjaran,
                        $p['urutan'],
                        $p['nama'],
                        $p['nik'],
                        $p['tempat_lahir'],
                        $p['tanggal_lahir'],
                        $p['path_kk'],
                        $p['path_foto'],
                        $p['nama_file_kk'],
                        $p['nama_file_foto'],
                        $p['nama_ayah'],
                        $p['nama_ibu'],
                    ]);
                }
                $this->db->commit();
            } catch (\Throwable $e) {
                $this->db->rollBack();
                if ($e instanceof \PDOException && str_contains($e->getMessage(), 'uq_kompas')) {
                    return $this->json($response, [
                        'success' => false,
                        'message' => 'Pendaftaran bentrok (madrasah atau NIK sudah terdaftar)',
                    ], 409);
                }
                throw $e;
            }

            return $this->json($response, [
                'success' => true,
                'message' => 'Pendaftaran berhasil',
                'data' => ['id' => $idDaftar],
            ], 201);
        } catch (\Throwable $e) {
            error_log('UgtKompasController::createDaftar ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan pendaftaran'], 500);
        }
    }

    /**
     * PUT /api/ugt/kompas/daftar/{id}
     * Body: peserta[] (ganti seluruh peserta pendaftaran)
     */
    public function updateDaftar(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $st = $this->db->prepare(
                'SELECT d.*, l.kategori, l.anggota_per_kelompok, l.usia_min, l.usia_max
                 FROM ugt___kompas_daftar d
                 INNER JOIN ugt___kompas_lomba l ON l.id = d.id_lomba
                 WHERE d.id = ? LIMIT 1'
            );
            $st->execute([$id]);
            $daftar = $st->fetch(\PDO::FETCH_ASSOC);
            if (!$daftar) {
                return $this->json($response, ['success' => false, 'message' => 'Pendaftaran tidak ditemukan'], 404);
            }
            if (!$this->userMayAccessMadrasah($request, (int) $daftar['id_madrasah'])) {
                return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
            }
            $tahunAjaran = (string) $daftar['tahun_ajaran'];
            $locked = $this->rejectIfPendaftaranTerkunci($response, $tahunAjaran);
            if ($locked !== null) {
                return $locked;
            }

            $data = $request->getParsedBody();
            $data = is_array($data) ? $data : [];
            $pesertaList = $data['peserta'] ?? [];
            if (!is_array($pesertaList)) {
                $pesertaList = [];
            }
            $kategori = (string) $daftar['kategori'];
            $expectedCount = $kategori === 'grup' ? (int) ($daftar['anggota_per_kelompok'] ?? 0) : 1;
            if ($expectedCount < 1 || count($pesertaList) !== $expectedCount) {
                return $this->json($response, [
                    'success' => false,
                    'message' => "Jumlah peserta harus tepat {$expectedCount}",
                ], 400);
            }

            $cutoff = $this->usiaCutoffForTahunAjaran($tahunAjaran);
            $usiaMin = (int) $daftar['usia_min'];
            $usiaMax = (int) $daftar['usia_max'];
            $normalizedPeserta = [];
            $seenNik = [];
            foreach ($pesertaList as $i => $raw) {
                if (!is_array($raw)) {
                    return $this->json($response, ['success' => false, 'message' => 'Data peserta tidak valid'], 400);
                }
                $urutan = $i + 1;
                $nama = mb_substr(TextSanitizer::cleanText(trim((string) ($raw['nama'] ?? ''))), 0, 200);
                $nik = $this->normalizeNik((string) ($raw['nik'] ?? ''));
                $tempatLahir = mb_substr(TextSanitizer::cleanText(trim((string) ($raw['tempat_lahir'] ?? ''))), 0, 120);
                $tanggalLahir = trim((string) ($raw['tanggal_lahir'] ?? ''));
                $pathKk = trim((string) ($raw['path_kk'] ?? ''));
                $pathFoto = trim((string) ($raw['path_foto'] ?? ''));
                $namaAyah = trim((string) ($raw['nama_ayah'] ?? ''));
                $namaIbu = trim((string) ($raw['nama_ibu'] ?? ''));
                $namaFileKk = trim((string) ($raw['nama_file_kk'] ?? ''));
                $namaFileFoto = trim((string) ($raw['nama_file_foto'] ?? ''));
                if ($nama === '' || $nik === '' || $tempatLahir === '' || $tanggalLahir === '' || $pathKk === '' || $pathFoto === '') {
                    return $this->json($response, [
                        'success' => false,
                        'message' => "Peserta #{$urutan}: field wajib belum lengkap",
                    ], 400);
                }
                if (strlen($nik) < 8 || strlen($nik) > 20 || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggalLahir)) {
                    return $this->json($response, ['success' => false, 'message' => "Peserta #{$urutan}: NIK/tanggal lahir tidak valid"], 400);
                }
                if (!preg_match(self::PATH_KK_PATTERN, $pathKk) || !preg_match(self::PATH_FOTO_PATTERN, $pathFoto)) {
                    return $this->json($response, ['success' => false, 'message' => "Peserta #{$urutan}: path berkas tidak valid"], 400);
                }
                if (isset($seenNik[$nik])) {
                    return $this->json($response, ['success' => false, 'message' => "NIK {$nik} dobel dalam kelompok"], 400);
                }
                $seenNik[$nik] = true;
                $age = $this->ageYears($tanggalLahir, $cutoff);
                if ($age < 0 || $age < $usiaMin || $age > $usiaMax) {
                    return $this->json($response, [
                        'success' => false,
                        'message' => "Usia peserta {$nama} " . ($age < 0 ? '?' : (string) $age) . " tahun (di luar rentang {$usiaMin}–{$usiaMax})",
                        'code' => 'usia_invalid',
                    ], 400);
                }
                $chk = $this->db->prepare(
                    'SELECT p.id, l.nama AS nama_lomba FROM ugt___kompas_peserta p
                     INNER JOIN ugt___kompas_daftar d ON d.id = p.id_daftar
                     INNER JOIN ugt___kompas_lomba l ON l.id = d.id_lomba
                     WHERE p.tahun_ajaran = ? AND p.nik = ? AND p.id_daftar <> ? LIMIT 1'
                );
                $chk->execute([$tahunAjaran, $nik, $id]);
                $existP = $chk->fetch(\PDO::FETCH_ASSOC);
                if ($existP) {
                    return $this->json($response, [
                        'success' => false,
                        'message' => "NIK {$nik} sudah terdaftar di lomba «{$existP['nama_lomba']}»",
                        'code' => 'nik_duplicate',
                    ], 409);
                }
                $normalizedPeserta[] = [
                    'urutan' => $urutan,
                    'nama' => $nama,
                    'nik' => $nik,
                    'tempat_lahir' => $tempatLahir,
                    'tanggal_lahir' => $tanggalLahir,
                    'path_kk' => $pathKk,
                    'path_foto' => $pathFoto,
                    'nama_file_kk' => $namaFileKk !== '' ? mb_substr(TextSanitizer::cleanText($namaFileKk), 0, 255) : null,
                    'nama_file_foto' => $namaFileFoto !== '' ? mb_substr(TextSanitizer::cleanText($namaFileFoto), 0, 255) : null,
                    'nama_ayah' => $namaAyah !== '' ? mb_substr(TextSanitizer::cleanText($namaAyah), 0, 200) : null,
                    'nama_ibu' => $namaIbu !== '' ? mb_substr(TextSanitizer::cleanText($namaIbu), 0, 200) : null,
                ];
            }

            $this->db->beginTransaction();
            try {
                $this->db->prepare('DELETE FROM ugt___kompas_peserta WHERE id_daftar = ?')->execute([$id]);
                $insP = $this->db->prepare(
                    'INSERT INTO ugt___kompas_peserta
                    (id_daftar, tahun_ajaran, urutan, nama, nik, tempat_lahir, tanggal_lahir, path_kk, path_foto, nama_file_kk, nama_file_foto, nama_ayah, nama_ibu)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
                );
                foreach ($normalizedPeserta as $p) {
                    $insP->execute([
                        $id, $tahunAjaran, $p['urutan'], $p['nama'], $p['nik'], $p['tempat_lahir'], $p['tanggal_lahir'],
                        $p['path_kk'], $p['path_foto'], $p['nama_file_kk'], $p['nama_file_foto'], $p['nama_ayah'], $p['nama_ibu'],
                    ]);
                }
                $this->db->prepare('UPDATE ugt___kompas_daftar SET updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$id]);
                $this->db->commit();
            } catch (\Throwable $e) {
                $this->db->rollBack();
                if ($e instanceof \PDOException && str_contains($e->getMessage(), 'uq_kompas')) {
                    return $this->json($response, ['success' => false, 'message' => 'NIK bentrok dengan pendaftaran lain'], 409);
                }
                throw $e;
            }

            return $this->json($response, ['success' => true, 'message' => 'Pendaftaran diperbarui', 'data' => ['id' => $id]], 200);
        } catch (\Throwable $e) {
            error_log('UgtKompasController::updateDaftar ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memperbarui pendaftaran'], 500);
        }
    }

    /**
     * DELETE /api/ugt/kompas/daftar/{id}
     */
    public function deleteDaftar(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $st = $this->db->prepare('SELECT id, id_madrasah, tahun_ajaran FROM ugt___kompas_daftar WHERE id = ? LIMIT 1');
            $st->execute([$id]);
            $row = $st->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Pendaftaran tidak ditemukan'], 404);
            }
            if (!$this->userMayAccessMadrasah($request, (int) $row['id_madrasah'])) {
                return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
            }
            $locked = $this->rejectIfPendaftaranTerkunci($response, (string) $row['tahun_ajaran']);
            if ($locked !== null) {
                return $locked;
            }
            $this->db->prepare('DELETE FROM ugt___kompas_daftar WHERE id = ?')->execute([$id]);

            return $this->json($response, ['success' => true, 'message' => 'Pendaftaran dihapus'], 200);
        } catch (\Throwable $e) {
            error_log('UgtKompasController::deleteDaftar ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal menghapus pendaftaran'], 500);
        }
    }

    /**
     * GET /api/ugt/kompas/check-nik?nik=&tahun_ajaran=&exclude_daftar_id=
     * Cek apakah NIK sudah terdaftar di lomba manapun pada tahun ajaran ini.
     */
    public function checkNik(Request $request, Response $response): Response
    {
        try {
            $q = $request->getQueryParams();
            $nik = $this->normalizeNik((string) ($q['nik'] ?? ''));
            $ta = trim((string) ($q['tahun_ajaran'] ?? ''));
            $excludeDaftarId = (int) ($q['exclude_daftar_id'] ?? 0);

            if (strlen($nik) !== 16) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'NIK harus 16 digit',
                ], 400);
            }
            if ($ta === '') {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Tahun ajaran wajib',
                ], 400);
            }

            $sql = 'SELECT p.id, p.id_daftar, d.id_lomba, l.nama AS nama_lomba
                    FROM ugt___kompas_peserta p
                    INNER JOIN ugt___kompas_daftar d ON d.id = p.id_daftar
                    INNER JOIN ugt___kompas_lomba l ON l.id = d.id_lomba
                    WHERE p.tahun_ajaran = ? AND p.nik = ?';
            $params = [$ta, $nik];
            if ($excludeDaftarId > 0) {
                $sql .= ' AND p.id_daftar <> ?';
                $params[] = $excludeDaftarId;
            }
            $sql .= ' LIMIT 1';
            $st = $this->db->prepare($sql);
            $st->execute($params);
            $row = $st->fetch(\PDO::FETCH_ASSOC);

            if ($row) {
                return $this->json($response, [
                    'success' => true,
                    'data' => [
                        'tersedia' => false,
                        'sudah_terdaftar' => true,
                        'nama_lomba' => (string) ($row['nama_lomba'] ?? ''),
                        'id_lomba' => (int) ($row['id_lomba'] ?? 0),
                        'id_daftar' => (int) ($row['id_daftar'] ?? 0),
                    ],
                ], 200);
            }

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'tersedia' => true,
                    'sudah_terdaftar' => false,
                    'nama_lomba' => null,
                    'id_lomba' => null,
                    'id_daftar' => null,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('UgtKompasController::checkNik ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memeriksa NIK'], 500);
        }
    }

    /**
     * POST /api/ugt/kompas/upload  (multipart: file + jenis=kk|foto)
     */
    public function upload(Request $request, Response $response): Response
    {
        try {
            $uploadedFiles = $request->getUploadedFiles();
            $file = $uploadedFiles['file'] ?? $uploadedFiles['kk'] ?? $uploadedFiles['foto'] ?? null;
            if (!$file || $file->getError() !== UPLOAD_ERR_OK) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak ada file yang diunggah'], 400);
            }

            $body = $request->getParsedBody();
            $body = is_array($body) ? $body : [];
            $jenis = strtolower(trim((string) ($body['jenis'] ?? $request->getQueryParams()['jenis'] ?? 'foto')));
            if (!in_array($jenis, ['kk', 'foto'], true)) {
                return $this->json($response, ['success' => false, 'message' => 'Jenis harus kk atau foto'], 400);
            }

            $allowed = $jenis === 'kk'
                ? ['jpg', 'jpeg', 'png', 'webp', 'pdf']
                : ['jpg', 'jpeg', 'png', 'webp'];
            $maxSize = $jenis === 'kk' ? 5 * 1024 * 1024 : 1 * 1024 * 1024;
            $validated = FileUploadValidator::validate($file, $allowed, $maxSize);
            if (!$validated['success']) {
                return $this->json($response, ['success' => false, 'message' => $validated['message']], 400);
            }

            $ext = $validated['extension'];
            $prefix = $jenis === 'kk' ? 'kk_' : 'foto_';
            $fileName = $prefix . uniqid('', true) . '.' . $ext;
            $dir = $this->getKompasDir();
            $absolute = $dir . DIRECTORY_SEPARATOR . $fileName;
            $file->moveTo($absolute);

            $movedCheck = FileUploadValidator::validateMovedFile($absolute, $ext);
            if (!$movedCheck['success']) {
                @unlink($absolute);

                return $this->json($response, ['success' => false, 'message' => $movedCheck['message']], 400);
            }

            $relative = 'uploads/ugt/kompas/' . $fileName;
            $clientName = $file->getClientFilename() ?: $fileName;

            return $this->json($response, [
                'success' => true,
                'message' => 'Unggah berhasil',
                'data' => [
                    'path' => $relative,
                    'nama_file' => $clientName,
                    'jenis' => $jenis,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('UgtKompasController::upload ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal mengunggah berkas'], 500);
        }
    }

    /**
     * GET .../serve-file?path=uploads/ugt/kompas/xxx — stream KK/foto untuk preview.
     */
    public function serve(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $path = isset($params['path']) ? trim((string) $params['path']) : '';
            if ($path === '' || preg_match('/\.\./', $path)) {
                return $response->withStatus(400);
            }

            $path = str_replace('\\', '/', $path);
            if (!preg_match(self::PATH_KK_PATTERN, $path)) {
                return $response->withStatus(403);
            }

            $relative = preg_replace('#^uploads/#', '', $path);
            $fullPath = $this->uploadsBasePath . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
            $real = realpath($fullPath);
            $allowedBase = realpath($this->getKompasDir());
            if ($real === false || !is_file($real) || $allowedBase === false || strpos($real, $allowedBase) !== 0) {
                return $response->withStatus(404);
            }

            $ext = strtolower((string) pathinfo($real, PATHINFO_EXTENSION));
            $mimeMap = [
                'jpg' => 'image/jpeg',
                'jpeg' => 'image/jpeg',
                'png' => 'image/png',
                'webp' => 'image/webp',
                'gif' => 'image/gif',
                'pdf' => 'application/pdf',
            ];
            $mime = $mimeMap[$ext] ?? (@mime_content_type($real) ?: 'application/octet-stream');
            if (!preg_match('#^(image/|application/pdf)#', $mime)) {
                return $response->withStatus(403);
            }

            $mtime = (int) filemtime($real);
            $etag = '"' . md5($real . (string) $mtime . (string) filesize($real)) . '"';
            $response = $response
                ->withHeader('Content-Type', $mime)
                ->withHeader('Content-Disposition', 'inline; filename="' . basename($real) . '"')
                ->withHeader('Cache-Control', 'private, max-age=3600')
                ->withHeader('ETag', $etag);

            $ifNoneMatch = $request->getHeaderLine('If-None-Match');
            if ($ifNoneMatch !== '' && trim($ifNoneMatch) === $etag) {
                return $response->withStatus(304);
            }

            $response->getBody()->write((string) file_get_contents($real));

            return $response;
        } catch (\Throwable $e) {
            error_log('UgtKompasController::serve ' . $e->getMessage());

            return $response->withStatus(500);
        }
    }
}
