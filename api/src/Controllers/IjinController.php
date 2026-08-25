<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\KalenderHelper;
use App\Helpers\LiveIjinNotifier;
use App\Helpers\PublicSantriViewTokenHelper;
use App\Helpers\SantriJwtAccessHelper;
use App\Helpers\SantriHelper;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class IjinController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function resolveIdPengurus(?array $user): ?int
    {
        if (!$user) {
            return null;
        }
        $raw = $user['id_pengurus'] ?? $user['user_id'] ?? $user['id'] ?? null;
        if ($raw === null || $raw === '') {
            return null;
        }

        return (int) $raw > 0 ? (int) $raw : null;
    }

    private function ijinSelectWithAdminSql(): string
    {
        return 'SELECT i.*,
                pi.nama AS admin_ijin_nama,
                pk.nama AS admin_kembali_nama
                FROM santri___ijin i
                LEFT JOIN pengurus pi ON i.admin_ijin = pi.id
                LEFT JOIN pengurus pk ON i.admin_kembali = pk.id';
    }

    private function fetchIjinRowWithAdmin(int $id): ?array
    {
        $sql = $this->ijinSelectWithAdminSql() . ' WHERE i.id = ? LIMIT 1';
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$id]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    public function getIjin(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idSantri = $queryParams['id_santri'] ?? null;
            $tahunAjaran = $queryParams['tahun_ajaran'] ?? null;
            $tanggal = isset($queryParams['tanggal']) ? trim((string) $queryParams['tanggal']) : '';
            $tanggalDari = isset($queryParams['tanggal_dari']) ? trim((string) $queryParams['tanggal_dari']) : '';
            $tanggalSampai = isset($queryParams['tanggal_sampai']) ? trim((string) $queryParams['tanggal_sampai']) : '';
            $telatOnly = isset($queryParams['telat'])
                && in_array(strtolower(trim((string) $queryParams['telat'])), ['1', 'true', 'yes'], true);

            // Daftar ijin per rentang / tanggal dicatat (meja input)
            // Status: subquery 1 baris agar tidak dobel jika santri punya >1 status aktif (sampai IS NULL)
            $ymdOk = static function (string $v): bool {
                return $v !== '' && (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $v);
            };
            $useRange = $ymdOk($tanggalDari) && $ymdOk($tanggalSampai);
            $useSingle = !$useRange && $ymdOk($tanggal);

            $listSelectSql = 'SELECT i.*,
                        pi.nama AS admin_ijin_nama,
                        pk.nama AS admin_kembali_nama,
                        s.nama AS nama_santri,
                        s.nis AS nis,
                        s.gender AS gender,
                        COALESCE(
                            (
                                SELECT ss.status_santri
                                FROM santri___status ss
                                WHERE ss.id_santri = s.id AND ss.sampai IS NULL
                                ORDER BY ss.id DESC
                                LIMIT 1
                            ),
                            s.status_santri,
                            \'\'
                        ) AS status_santri,
                        d.daerah AS daerah,
                        dk.kamar AS kamar,
                        ld.nama AS diniyah,
                        rd.kelas AS kelas_diniyah,
                        rd.kel AS kel_diniyah,
                        lf.nama AS formal,
                        rf.kelas AS kelas_formal,
                        rf.kel AS kel_formal
                        FROM santri___ijin i
                        INNER JOIN santri s ON s.id = i.id_santri
                        LEFT JOIN pengurus pi ON i.admin_ijin = pi.id
                        LEFT JOIN pengurus pk ON i.admin_kembali = pk.id
                        LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                        LEFT JOIN daerah d ON d.id = dk.id_daerah
                        LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                        LEFT JOIN lembaga ld ON ld.id = rd.lembaga_id
                        LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                        LEFT JOIN lembaga lf ON lf.id = rf.lembaga_id
                        WHERE ';

            $deadlineExpr = "COALESCE(NULLIF(TRIM(i.perpanjang_masehi), ''), NULLIF(TRIM(i.sampai_masehi), ''), NULLIF(TRIM(i.dari_masehi), ''))";

            // Mode telat: belum kembali & deadline Masehi sudah lewat (abaikan filter tanggal_dibuat)
            if ($telatOnly) {
                $sql = $listSelectSql . " i.tanggal_kembali IS NULL
                        AND {$deadlineExpr} IS NOT NULL
                        AND {$deadlineExpr} <> ''
                        AND {$deadlineExpr} REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                        AND {$deadlineExpr} < CURDATE()";
                $params = [];
                if ($tahunAjaran) {
                    $sql .= ' AND i.tahun_ajaran = ?';
                    $params[] = $tahunAjaran;
                }
                $sql .= ' ORDER BY ' . $deadlineExpr . ' ASC, i.tanggal_dibuat DESC';
                $stmt = $this->db->prepare($sql);
                $stmt->execute($params);
                $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => $data,
                    'meta' => ['mode' => 'telat', 'count' => count($data)],
                ], 200);
            }

            if ($useRange || $useSingle) {
                $sql = $listSelectSql;
                $params = [];

                if ($useRange) {
                    $dari = $tanggalDari <= $tanggalSampai ? $tanggalDari : $tanggalSampai;
                    $sampai = $tanggalDari <= $tanggalSampai ? $tanggalSampai : $tanggalDari;
                    $sql .= 'DATE(i.tanggal_dibuat) BETWEEN ? AND ?';
                    $params[] = $dari;
                    $params[] = $sampai;
                } else {
                    $sql .= 'DATE(i.tanggal_dibuat) = ?';
                    $params[] = $tanggal;
                }

                if ($tahunAjaran) {
                    $sql .= ' AND i.tahun_ajaran = ?';
                    $params[] = $tahunAjaran;
                }

                $sql .= ' ORDER BY i.tanggal_dibuat DESC, i.id DESC';

                $stmt = $this->db->prepare($sql);
                $stmt->execute($params);
                $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => $data,
                ], 200);
            }

            $sql = $this->ijinSelectWithAdminSql() . ' WHERE 1=1';
            $params = [];

            if ($idSantri) {
                $sql .= ' AND i.id_santri = ?';
                $params[] = $idSantri;
            }

            if ($tahunAjaran) {
                $sql .= ' AND i.tahun_ajaran = ?';
                $params[] = $tahunAjaran;
            }

            $sql .= ' ORDER BY i.tahun_ajaran DESC, i.urutan ASC';

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data
            ], 200);

        } catch (\Exception $e) {
            error_log("Get ijin error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan'
            ], 500);
        }
    }

    /**
     * POST /api/ijin/scan-kartu — resolve QR kartu santri (CS) atau mahrom (CM) ke data santri.
     */
    public function scanKartu(Request $request, Response $response): Response
    {
        try {
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = [];
            }
            $token = trim((string) ($body['token'] ?? ''));
            if ($token === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'code' => 'empty',
                    'message' => 'Token QR kosong',
                ], 400);
            }

            $kartuSvc = new \App\Services\CashlessKartuService($this->db);
            $resolved = $kartuSvc->resolveTokenForIjin($token);
            if (empty($resolved['ok'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'code' => $resolved['code'] ?? 'invalid',
                    'message' => $resolved['message'] ?? 'Kartu tidak valid',
                ], 400);
            }

            $card = $resolved['card'];
            $santriId = (int) ($card['santri_id'] ?? 0);
            if ($santriId <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'code' => 'no_santri',
                    'message' => 'Kartu tidak terhubung ke santri',
                ], 400);
            }

            $stmt = $this->db->prepare(
                'SELECT s.id, s.nis, s.nama, s.gender,
                        COALESCE(
                            (
                                SELECT ss.status_santri
                                FROM santri___status ss
                                WHERE ss.id_santri = s.id AND ss.sampai IS NULL
                                ORDER BY ss.id DESC
                                LIMIT 1
                            ),
                            s.status_santri,
                            \'\'
                        ) AS status_santri,
                        COALESCE(d.kategori, \'\') AS kategori,
                        d.daerah AS daerah,
                        dk.kamar AS kamar,
                        ld.nama AS diniyah, rd.kelas AS kelas_diniyah, rd.kel AS kel_diniyah,
                        lf.nama AS formal, rf.kelas AS kelas_formal, rf.kel AS kel_formal,
                        s.id_kamar, s.id_diniyah, s.id_formal
                 FROM santri s
                 LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                 LEFT JOIN daerah d ON d.id = dk.id_daerah
                 LEFT JOIN rombel rd ON rd.id = s.id_diniyah
                 LEFT JOIN lembaga ld ON ld.id = rd.lembaga_id
                 LEFT JOIN rombel rf ON rf.id = s.id_formal
                 LEFT JOIN lembaga lf ON lf.id = rf.lembaga_id
                 WHERE s.id = ?
                 LIMIT 1'
            );
            $stmt->execute([$santriId]);
            $santri = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$santri) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'code' => 'santri_not_found',
                    'message' => 'Data santri tidak ditemukan',
                ], 404);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'santri' => $santri,
                    'card' => $card,
                ],
            ], 200);
        } catch (\Exception $e) {
            error_log('Ijin scanKartu error: ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat memindai kartu',
            ], 500);
        }
    }

    /**
     * Normalisasi jam ke H:i:s atau null.
     */
    private function normalizeJamTime($raw): ?string
    {
        if ($raw === null) {
            return null;
        }
        $s = trim((string) $raw);
        if ($s === '') {
            return null;
        }
        if (preg_match('/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/', $s, $m)) {
            $h = (int) $m[1];
            $i = (int) $m[2];
            $sec = isset($m[3]) ? (int) $m[3] : 0;
            if ($h < 0 || $h > 23 || $i < 0 || $i > 59 || $sec < 0 || $sec > 59) {
                return null;
            }

            return sprintf('%02d:%02d:%02d', $h, $i, $sec);
        }

        return null;
    }

    private function isTruthyIjinSehari($raw): bool
    {
        if (is_bool($raw)) {
            return $raw;
        }
        if (is_int($raw) || is_float($raw)) {
            return (int) $raw === 1;
        }
        $s = strtolower(trim((string) $raw));

        return in_array($s, ['1', 'true', 'yes', 'on'], true);
    }

    /** Label lama dari selisih jam, contoh: "3 Jam", "2 Jam 30 Menit". */
    private function formatLamaJam(string $jamDariHms, string $jamSampaiHms): string
    {
        $toMin = static function (string $t): ?int {
            if (!preg_match('/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/', $t, $m)) {
                return null;
            }

            return ((int) $m[1]) * 60 + (int) $m[2];
        };
        $a = $toMin($jamDariHms);
        $b = $toMin($jamSampaiHms);
        if ($a === null || $b === null || $b <= $a) {
            return '';
        }
        $mins = $b - $a;
        $h = intdiv($mins, 60);
        $m = $mins % 60;
        if ($h > 0 && $m > 0) {
            return $h . ' Jam ' . $m . ' Menit';
        }
        if ($h > 0) {
            return $h . ' Jam';
        }

        return $m . ' Menit';
    }

    /**
     * @param array<string, mixed> $data
     * @return array{ok: true, ijin_sehari: int, dari: mixed, sampai: mixed, perpanjang: mixed, lama: mixed, jam_dari: ?string, jam_sampai: ?string}|array{ok: false, message: string}
     */
    private function resolveIjinSehariFields(array $data): array
    {
        $ijinSehari = $this->isTruthyIjinSehari($data['ijin_sehari'] ?? false);
        $dari = $data['dari'] ?? null;
        $sampai = $data['sampai'] ?? null;
        $perpanjang = $data['perpanjang'] ?? null;
        $lama = $data['lama'] ?? null;

        if ($ijinSehari) {
            if ($dari === null || trim((string) $dari) === '') {
                return ['ok' => false, 'message' => 'Tanggal ijin sehari wajib diisi'];
            }
            $jamDari = $this->normalizeJamTime($data['jam_dari'] ?? null);
            $jamSampai = $this->normalizeJamTime($data['jam_sampai'] ?? null);
            if ($jamDari === null || $jamSampai === null) {
                return ['ok' => false, 'message' => 'Jam dari dan jam sampai wajib diisi untuk ijin sehari'];
            }
            if ($jamSampai <= $jamDari) {
                return ['ok' => false, 'message' => 'Jam sampai harus setelah jam dari'];
            }

            $lamaJam = $this->formatLamaJam($jamDari, $jamSampai);
            $lamaClient = is_string($lama) ? trim($lama) : '';

            return [
                'ok' => true,
                'ijin_sehari' => 1,
                'dari' => $dari,
                'sampai' => $dari,
                'perpanjang' => null,
                'lama' => $lamaJam !== '' ? $lamaJam : ($lamaClient !== '' ? $lamaClient : null),
                'jam_dari' => $jamDari,
                'jam_sampai' => $jamSampai,
            ];
        }

        if ($dari === null || trim((string) $dari) === '') {
            return ['ok' => false, 'message' => 'Tanggal dari wajib diisi'];
        }
        if ($sampai === null || trim((string) $sampai) === '') {
            return ['ok' => false, 'message' => 'Tanggal sampai wajib diisi'];
        }

        return [
            'ok' => true,
            'ijin_sehari' => 0,
            'dari' => $dari,
            'sampai' => $sampai,
            'perpanjang' => $perpanjang === '' ? null : $perpanjang,
            'lama' => $lama,
            'jam_dari' => null,
            'jam_sampai' => null,
        ];
    }

    public function createIjin(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            if (!is_array($data)) {
                $data = [];
            }

            if (!isset($data['id_santri']) || !isset($data['tahun_ajaran'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'id_santri dan tahun_ajaran wajib diisi'
                ], 400);
            }

            $alasan = TextSanitizer::cleanTextOrNull($data['alasan'] ?? null);
            if ($alasan === null || $alasan === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Alasan wajib diisi',
                ], 400);
            }

            $resolved = $this->resolveIjinSehariFields($data);
            if (empty($resolved['ok'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => $resolved['message'] ?? 'Data ijin tidak valid',
                ], 400);
            }

            $user = $request->getAttribute('user');
            $idPengurus = $this->resolveIdPengurus($user);

            $dari = $resolved['dari'];
            $sampai = $resolved['sampai'];
            $perpanjang = $resolved['perpanjang'];
            $masehi = $this->computeMasehiTriplet($dari, $sampai, $perpanjang);

            $sql = 'INSERT INTO santri___ijin (id_santri, urutan, tahun_ajaran, alasan, dari, sampai, perpanjang, lama, ijin_sehari, jam_dari, jam_sampai, tanggal_kembali, dari_masehi, sampai_masehi, perpanjang_masehi, admin_ijin, admin_kembali)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL)';

            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                $data['id_santri'],
                $data['urutan'] ?? null,
                $data['tahun_ajaran'],
                $alasan,
                $dari,
                $sampai,
                $perpanjang,
                $resolved['lama'],
                $resolved['ijin_sehari'],
                $resolved['jam_dari'],
                $resolved['jam_sampai'],
                $masehi['dari_masehi'],
                $masehi['sampai_masehi'],
                $masehi['perpanjang_masehi'],
                $idPengurus,
            ]);
            $id = (int) $this->db->lastInsertId();
            $newIjin = $this->fetchIjinRowWithAdmin($id);
            if ($newIjin && $idPengurus) {
                UserAktivitasLogger::log(null, $idPengurus, UserAktivitasLogger::ACTION_CREATE, 'santri___ijin', $id, null, $newIjin, $request);
            }

            LiveIjinNotifier::ping([
                'id_santri' => (int) $data['id_santri'],
                'tahun_ajaran' => (string) $data['tahun_ajaran'],
                'action' => 'create',
            ]);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data ijin berhasil ditambahkan',
                'data' => ['id' => $id]
            ], 201);

        } catch (\Exception $e) {
            error_log("Create ijin error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan'
            ], 500);
        }
    }

    public function updateIjin(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID ijin wajib diisi'
                ], 400);
            }

            $data = $request->getParsedBody();
            if (!is_array($data)) {
                $data = [];
            }

            // Cek apakah data ada dan ambil old row untuk audit
            $stmtOld = $this->db->prepare("SELECT * FROM santri___ijin WHERE id = ?");
            $stmtOld->execute([$id]);
            $oldIjin = $stmtOld->fetch(\PDO::FETCH_ASSOC);
            if (!$oldIjin) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data ijin tidak ditemukan'
                ], 404);
            }

            $fields = [];
            $params = [];

            // Urutan tidak bisa diupdate (tetap null)
            if (isset($data['tahun_ajaran'])) {
                $fields[] = "tahun_ajaran = ?";
                $params[] = $data['tahun_ajaran'];
            }
            if (isset($data['alasan'])) {
                $alasanUp = TextSanitizer::cleanTextOrNull($data['alasan']);
                if ($alasanUp === null || $alasanUp === '') {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Alasan wajib diisi',
                    ], 400);
                }
                $fields[] = "alasan = ?";
                $params[] = $alasanUp;
            }

            $touchSehari = array_key_exists('ijin_sehari', $data)
                || array_key_exists('jam_dari', $data)
                || array_key_exists('jam_sampai', $data)
                || isset($data['dari'])
                || isset($data['sampai'])
                || isset($data['perpanjang'])
                || isset($data['lama']);

            if ($touchSehari) {
                $mergedForSehari = [
                    'ijin_sehari' => array_key_exists('ijin_sehari', $data)
                        ? $data['ijin_sehari']
                        : ($oldIjin['ijin_sehari'] ?? 0),
                    'dari' => array_key_exists('dari', $data) ? $data['dari'] : ($oldIjin['dari'] ?? null),
                    'sampai' => array_key_exists('sampai', $data) ? $data['sampai'] : ($oldIjin['sampai'] ?? null),
                    'perpanjang' => array_key_exists('perpanjang', $data) ? $data['perpanjang'] : ($oldIjin['perpanjang'] ?? null),
                    'lama' => array_key_exists('lama', $data) ? $data['lama'] : ($oldIjin['lama'] ?? null),
                    'jam_dari' => array_key_exists('jam_dari', $data) ? $data['jam_dari'] : ($oldIjin['jam_dari'] ?? null),
                    'jam_sampai' => array_key_exists('jam_sampai', $data) ? $data['jam_sampai'] : ($oldIjin['jam_sampai'] ?? null),
                ];
                $resolved = $this->resolveIjinSehariFields($mergedForSehari);
                if (empty($resolved['ok'])) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => $resolved['message'] ?? 'Data ijin tidak valid',
                    ], 400);
                }
                $fields[] = 'dari = ?';
                $params[] = $resolved['dari'];
                $fields[] = 'sampai = ?';
                $params[] = $resolved['sampai'];
                $fields[] = 'perpanjang = ?';
                $params[] = $resolved['perpanjang'];
                $fields[] = 'lama = ?';
                $params[] = $resolved['lama'];
                $fields[] = 'ijin_sehari = ?';
                $params[] = $resolved['ijin_sehari'];
                $fields[] = 'jam_dari = ?';
                $params[] = $resolved['jam_dari'];
                $fields[] = 'jam_sampai = ?';
                $params[] = $resolved['jam_sampai'];

                $m = $this->computeMasehiTriplet($resolved['dari'], $resolved['sampai'], $resolved['perpanjang']);
                $fields[] = 'dari_masehi = ?';
                $params[] = $m['dari_masehi'];
                $fields[] = 'sampai_masehi = ?';
                $params[] = $m['sampai_masehi'];
                $fields[] = 'perpanjang_masehi = ?';
                $params[] = $m['perpanjang_masehi'];
            }

            if (array_key_exists('tanggal_kembali', $data)) {
                $fields[] = 'tanggal_kembali = ?';
                $v = $data['tanggal_kembali'];
                $params[] = ($v === '' || $v === null) ? null : $v;
                $user = $request->getAttribute('user');
                $idPengurus = $this->resolveIdPengurus($user);
                $fields[] = 'admin_kembali = ?';
                $params[] = ($v === '' || $v === null) ? null : $idPengurus;
            }

            if (empty($fields)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak ada data yang diupdate'
                ], 400);
            }

            $params[] = $id;
            $sql = "UPDATE santri___ijin SET " . implode(', ', $fields) . " WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $user = $request->getAttribute('user');
            $idPengurus = $this->resolveIdPengurus($user);
            $newIjin = $this->fetchIjinRowWithAdmin($id);
            if ($idPengurus && $newIjin) {
                UserAktivitasLogger::log(null, $idPengurus, UserAktivitasLogger::ACTION_UPDATE, 'santri___ijin', $id, $oldIjin, $newIjin, $request);
            }
            $pingTa = (string) (($newIjin['tahun_ajaran'] ?? null) !== null && (string) $newIjin['tahun_ajaran'] !== ''
                ? $newIjin['tahun_ajaran']
                : ($oldIjin['tahun_ajaran'] ?? ''));
            LiveIjinNotifier::ping([
                'id_santri' => (int) ($oldIjin['id_santri'] ?? 0),
                'tahun_ajaran' => $pingTa,
                'action' => 'update',
            ]);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data ijin berhasil diupdate'
            ], 200);

        } catch (\Exception $e) {
            error_log("Update ijin error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan'
            ], 500);
        }
    }

    public function deleteIjin(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID ijin wajib diisi'
                ], 400);
            }

            // Cek apakah data ada dan ambil old row untuk audit
            $stmtOld = $this->db->prepare("SELECT * FROM santri___ijin WHERE id = ?");
            $stmtOld->execute([$id]);
            $oldIjin = $stmtOld->fetch(\PDO::FETCH_ASSOC);
            if (!$oldIjin) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data ijin tidak ditemukan'
                ], 404);
            }
            $user = $request->getAttribute('user');
            $idPengurus = $this->resolveIdPengurus($user);

            $stmt = $this->db->prepare("DELETE FROM santri___ijin WHERE id = ?");
            $stmt->execute([$id]);
            if ($stmt->rowCount() > 0 && $idPengurus) {
                UserAktivitasLogger::log(null, $idPengurus, UserAktivitasLogger::ACTION_DELETE, 'santri___ijin', $id, $oldIjin, null, $request);
            }
            if ($stmt->rowCount() > 0) {
                LiveIjinNotifier::ping([
                    'id_santri' => (int) ($oldIjin['id_santri'] ?? 0),
                    'tahun_ajaran' => (string) ($oldIjin['tahun_ajaran'] ?? ''),
                    'action' => 'delete',
                ]);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data ijin berhasil dihapus'
            ], 200);

        } catch (\Exception $e) {
            error_log("Delete ijin error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan'
            ], 500);
        }
    }

    /**
     * @return array{dari_masehi: ?string, sampai_masehi: ?string, perpanjang_masehi: ?string}
     */
    private function computeMasehiTriplet(?string $dari, ?string $sampai, ?string $perpanjang): array
    {
        return [
            'dari_masehi' => KalenderHelper::hijriyahToMasehi($this->db, $this->normalizeHijriForConvert($dari)),
            'sampai_masehi' => KalenderHelper::hijriyahToMasehi($this->db, $this->normalizeHijriForConvert($sampai)),
            'perpanjang_masehi' => KalenderHelper::hijriyahToMasehi($this->db, $this->normalizeHijriForConvert($perpanjang)),
        ];
    }

    private function normalizeHijriForConvert($v): ?string
    {
        if ($v === null || $v === '') {
            return null;
        }
        $s = trim((string) $v);

        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $s) ? $s : null;
    }

    public function markKembali(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID ijin wajib diisi',
                ], 400);
            }

            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = [];
            }
            $set = array_key_exists('set', $body) ? (bool) $body['set'] : true;

            $stmtOld = $this->db->prepare('SELECT * FROM santri___ijin WHERE id = ?');
            $stmtOld->execute([$id]);
            $oldIjin = $stmtOld->fetch(\PDO::FETCH_ASSOC);
            if (!$oldIjin) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data ijin tidak ditemukan',
                ], 404);
            }

            $tanggal = $set ? date('Y-m-d') : null;
            $user = $request->getAttribute('user');
            $idPengurus = $this->resolveIdPengurus($user);
            $adminKembali = $set ? $idPengurus : null;
            $stmt = $this->db->prepare('UPDATE santri___ijin SET tanggal_kembali = ?, admin_kembali = ? WHERE id = ?');
            $stmt->execute([$tanggal, $adminKembali, $id]);

            if ($idPengurus) {
                $newIjin = $this->fetchIjinRowWithAdmin($id);
                if ($newIjin) {
                    UserAktivitasLogger::log(null, $idPengurus, UserAktivitasLogger::ACTION_UPDATE, 'santri___ijin', $id, $oldIjin, $newIjin, $request);
                }
            }

            LiveIjinNotifier::ping([
                'id_santri' => (int) ($oldIjin['id_santri'] ?? 0),
                'tahun_ajaran' => (string) ($oldIjin['tahun_ajaran'] ?? ''),
                'action' => 'markKembali',
            ]);

            $updated = $this->fetchIjinRowWithAdmin($id);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $set ? 'Tanggal kembali dicatat' : 'Status kembali dibatalkan',
                'data' => [
                    'tanggal_kembali' => $tanggal,
                    'admin_kembali' => $adminKembali,
                    'admin_kembali_nama' => $updated['admin_kembali_nama'] ?? null,
                ],
            ], 200);
        } catch (\Exception $e) {
            error_log('Mark kembali error: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan',
            ], 500);
        }
    }

    public function getPublicIjin(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idSantri = $queryParams['id_santri'] ?? null;

            if (!$idSantri) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID santri wajib diisi'
                ], 400);
            }

            $resolvedId = SantriHelper::resolveId($this->db, $idSantri);
            if ($resolvedId === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan'
                ], 404);
            }

            // Tidak lagi publik anonim — wajib JWT/view_token (riwayat santri: myBeddien /v2/ijin).
            $fullAccess = SantriJwtAccessHelper::canAccessFullSantriData(
                $this->db,
                $request,
                (int) $resolvedId,
                PublicSantriViewTokenHelper::SCOPE_IJIN
            );
            if (!$fullAccess) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Wajib login myBeddien atau view_token untuk melihat riwayat ijin',
                    'redirect' => 'mybeddien:/santri/riwayat-ijin',
                ], 401);
            }

            $sql = $this->ijinSelectWithAdminSql() . ' WHERE i.id_santri = ? ORDER BY i.tahun_ajaran DESC, i.urutan ASC';
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$resolvedId]);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data,
                'redacted' => false,
            ], 200);

        } catch (\Exception $e) {
            error_log("Get public ijin error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan'
            ], 500);
        }
    }

    public function getDashboard(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $tahunAjaran = $queryParams['tahun_ajaran'] ?? null; // Tahun hijriyah

            // Build WHERE clause untuk filter tahun ajaran
            $whereClause = '';
            $params = [];
            if ($tahunAjaran) {
                $whereClause = 'WHERE tahun_ajaran = ?';
                $params[] = $tahunAjaran;
            }

            // Statistik Ijin
            // Total ijin
            $sqlTotalIjin = "SELECT COUNT(DISTINCT id) as total FROM santri___ijin" . ($whereClause ? " $whereClause" : "");
            $stmt = $this->db->prepare($sqlTotalIjin);
            $stmt->execute($params);
            $totalIjin = (int)($stmt->fetch(\PDO::FETCH_ASSOC)['total'] ?? 0);

            // Total santri yang punya ijin
            $sqlSantriIjin = "SELECT COUNT(DISTINCT id_santri) as total FROM santri___ijin" . ($whereClause ? " $whereClause" : "");
            $stmt = $this->db->prepare($sqlSantriIjin);
            $stmt->execute($params);
            $totalSantriIjin = (int)($stmt->fetch(\PDO::FETCH_ASSOC)['total'] ?? 0);

            // Ijin per bulan (berdasarkan tanggal_dibuat)
            $sqlIjinPerBulan = "SELECT 
                DATE_FORMAT(tanggal_dibuat, '%Y-%m') as bulan,
                COUNT(*) as jumlah
                FROM santri___ijin" . ($whereClause ? " $whereClause" : "") . "
                GROUP BY DATE_FORMAT(tanggal_dibuat, '%Y-%m')
                ORDER BY bulan DESC
                LIMIT 12";
            $stmt = $this->db->prepare($sqlIjinPerBulan);
            $stmt->execute($params);
            $ijinPerBulan = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $sqlTotalSantri = 'SELECT COUNT(*) as total FROM santri';
            $stmt = $this->db->prepare($sqlTotalSantri);
            $stmt->execute();
            $totalSantri = (int) ($stmt->fetch(\PDO::FETCH_ASSOC)['total'] ?? 0);

            // Ijin terbaru (5 terakhir)
            $sqlIjinTerbaru = "SELECT 
                i.*,
                s.nama as nama_santri
                FROM santri___ijin i
                INNER JOIN santri s ON i.id_santri = s.id" . ($whereClause ? " $whereClause" : "") . "
                ORDER BY i.tanggal_dibuat DESC
                LIMIT 5";
            $stmt = $this->db->prepare($sqlIjinTerbaru);
            $stmt->execute($params);
            $ijinTerbaru = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Statistik Pelanggaran
            $stmtPelTotal = $this->db->query('SELECT COUNT(*) AS total FROM santri___pelanggaran');
            $pelanggaranTotal = (int) ($stmtPelTotal->fetch(\PDO::FETCH_ASSOC)['total'] ?? 0);
            $stmtPelHariIni = $this->db->query(
                'SELECT COUNT(*) AS total FROM santri___pelanggaran WHERE DATE(tanggal_dibuat) = CURDATE()'
            );
            $pelanggaranHariIni = (int) ($stmtPelHariIni->fetch(\PDO::FETCH_ASSOC)['total'] ?? 0);

            $stmtPelKat = $this->db->query(
                "SELECT pg.kategori, COUNT(*) AS jumlah
                 FROM santri___pelanggaran sp
                 INNER JOIN pelanggaran pg ON pg.id = sp.id_pelanggaran
                 GROUP BY pg.kategori
                 ORDER BY FIELD(pg.kategori, 'berat', 'sedang', 'ringan', 'buku_hitam'), pg.kategori"
            );
            $pelanggaranPerKategori = $stmtPelKat->fetchAll(\PDO::FETCH_ASSOC);

            $stmtPelBulan = $this->db->query(
                "SELECT DATE_FORMAT(tanggal_dibuat, '%Y-%m') AS bulan, COUNT(*) AS jumlah
                 FROM santri___pelanggaran
                 GROUP BY DATE_FORMAT(tanggal_dibuat, '%Y-%m')
                 ORDER BY bulan DESC
                 LIMIT 12"
            );
            $pelanggaranPerBulan = $stmtPelBulan->fetchAll(\PDO::FETCH_ASSOC);

            $stmtPelTerbaru = $this->db->query(
                "SELECT sp.id, sp.tanggal_dibuat, sp.catatan, s.nama AS nama_santri, s.nis,
                        pg.nama AS pelanggaran_nama, pg.kategori AS pelanggaran_kategori
                 FROM santri___pelanggaran sp
                 INNER JOIN santri s ON s.id = sp.id_santri
                 INNER JOIN pelanggaran pg ON pg.id = sp.id_pelanggaran
                 ORDER BY sp.tanggal_dibuat DESC
                 LIMIT 5"
            );
            $pelanggaranTerbaru = $stmtPelTerbaru->fetchAll(\PDO::FETCH_ASSOC);

            // Statistik Boyong
            $boyongTahunIni = 0;
            if ($tahunAjaran) {
                $stmtBoyong = $this->db->prepare('SELECT COUNT(*) as total FROM santri___boyong WHERE tahun_hijriyah = ?');
                $stmtBoyong->execute([$tahunAjaran]);
                $boyongTahunIni = (int) ($stmtBoyong->fetch(\PDO::FETCH_ASSOC)['total'] ?? 0);
            }
            $stmtBoyongHariIni = $this->db->prepare('SELECT COUNT(*) as total FROM santri___boyong WHERE DATE(tanggal_dibuat) = CURDATE()');
            $stmtBoyongHariIni->execute();
            $boyongHariIni = (int) ($stmtBoyongHariIni->fetch(\PDO::FETCH_ASSOC)['total'] ?? 0);

            $stmtBoyongBulan = $this->db->query(
                "SELECT DATE_FORMAT(tanggal_dibuat, '%Y-%m') AS bulan, COUNT(*) AS jumlah
                 FROM santri___boyong
                 GROUP BY DATE_FORMAT(tanggal_dibuat, '%Y-%m')
                 ORDER BY bulan DESC
                 LIMIT 12"
            );
            $boyongPerBulan = $stmtBoyongBulan->fetchAll(\PDO::FETCH_ASSOC);

            $stmtBoyongTerbaru = $this->db->query(
                "SELECT b.id, b.tanggal_dibuat, b.tahun_hijriyah, b.diniyah, b.formal, s.nama AS nama_santri, s.nis
                 FROM santri___boyong b
                 INNER JOIN santri s ON s.id = b.id_santri
                 ORDER BY b.tanggal_dibuat DESC
                 LIMIT 5"
            );
            $boyongTerbaru = $stmtBoyongTerbaru->fetchAll(\PDO::FETCH_ASSOC);

            // Domisili: daerah / kamar / okupansi Mukim
            $stmtDaerah = $this->db->query(
                "SELECT COUNT(*) AS total FROM daerah WHERE LOWER(TRIM(status)) = 'aktif'"
            );
            $jumlahDaerah = (int) ($stmtDaerah->fetch(\PDO::FETCH_ASSOC)['total'] ?? 0);
            $stmtKamar = $this->db->query(
                "SELECT COUNT(*) AS total FROM daerah___kamar WHERE LOWER(TRIM(status)) = 'aktif'"
            );
            $jumlahKamar = (int) ($stmtKamar->fetch(\PDO::FETCH_ASSOC)['total'] ?? 0);

            $statusJoin = \App\Helpers\SantriStatusHelper::currentStatusJoinSql('s', 'st');
            $statusExpr = \App\Helpers\SantriStatusHelper::statusSelectSql('st', 's');
            $sqlTopDaerah = "SELECT d.id, d.daerah AS nama, d.kategori, COUNT(s.id) AS jumlah_santri
                FROM daerah d
                INNER JOIN daerah___kamar dk ON dk.id_daerah = d.id AND LOWER(TRIM(dk.status)) = 'aktif'
                INNER JOIN santri s ON s.id_kamar = dk.id
                {$statusJoin}
                WHERE LOWER(TRIM(d.status)) = 'aktif'
                  AND LOWER(TRIM({$statusExpr})) = 'mukim'
                GROUP BY d.id, d.daerah, d.kategori
                ORDER BY jumlah_santri DESC
                LIMIT 8";
            $stmtTop = $this->db->query($sqlTopDaerah);
            $topDaerah = $stmtTop ? $stmtTop->fetchAll(\PDO::FETCH_ASSOC) : [];

            $sqlKamarOkupansi = "SELECT
                COUNT(DISTINCT dk.id) AS kamar_terisi,
                (
                  SELECT COUNT(*) FROM daerah___kamar dk2 WHERE LOWER(TRIM(dk2.status)) = 'aktif'
                ) AS kamar_aktif
                FROM daerah___kamar dk
                INNER JOIN santri s ON s.id_kamar = dk.id
                {$statusJoin}
                WHERE LOWER(TRIM(dk.status)) = 'aktif'
                  AND LOWER(TRIM({$statusExpr})) = 'mukim'";
            $stmtOk = $this->db->query($sqlKamarOkupansi);
            $okRow = $stmtOk ? $stmtOk->fetch(\PDO::FETCH_ASSOC) : [];
            $kamarAktif = (int) ($okRow['kamar_aktif'] ?? $jumlahKamar);
            $kamarTerisi = (int) ($okRow['kamar_terisi'] ?? 0);
            $kamarKosong = max(0, $kamarAktif - $kamarTerisi);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'ijin' => [
                        'total' => $totalIjin,
                        'total_santri' => $totalSantriIjin,
                        'per_bulan' => $ijinPerBulan,
                        'terbaru' => $ijinTerbaru,
                    ],
                    'pelanggaran' => [
                        'total' => $pelanggaranTotal,
                        'hari_ini' => $pelanggaranHariIni,
                        'per_kategori' => $pelanggaranPerKategori,
                        'per_bulan' => $pelanggaranPerBulan,
                        'terbaru' => $pelanggaranTerbaru,
                    ],
                    'boyong' => [
                        'tahun_ini' => $boyongTahunIni,
                        'hari_ini' => $boyongHariIni,
                        'per_bulan' => $boyongPerBulan,
                        'terbaru' => $boyongTerbaru,
                    ],
                    'domisili' => [
                        'jumlah_daerah' => $jumlahDaerah,
                        'jumlah_kamar' => $jumlahKamar,
                        'kamar_terisi' => $kamarTerisi,
                        'kamar_kosong' => $kamarKosong,
                        'top_daerah' => $topDaerah,
                    ],
                    'total_santri' => $totalSantri,
                ],
            ], 200);

        } catch (\Exception $e) {
            error_log("Get dashboard ijin error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan'
            ], 500);
        }
    }

    /**
     * GET /api/ijin/kamar-options — daftar kamar untuk dropdown id_kamar (admin_ijin / petugas_ijin).
     * Query: id_daerah (opsional), status (opsional). Tanpa filter status: hanya aktif.
     */
    public function getKamarOptions(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $idDaerah = isset($params['id_daerah']) ? (int) $params['id_daerah'] : null;
            $status = isset($params['status']) && $params['status'] !== '' ? trim((string) $params['status']) : null;

            $sql = 'SELECT dk.id, dk.id_daerah, dk.kamar, dk.keterangan, dk.status,
                    d.daerah AS daerah_nama, d.kategori AS daerah_kategori
                    FROM daerah___kamar dk
                    LEFT JOIN daerah d ON d.id = dk.id_daerah
                    WHERE 1=1';
            $bind = [];
            if ($idDaerah !== null && $idDaerah > 0) {
                $sql .= ' AND dk.id_daerah = ?';
                $bind[] = $idDaerah;
            }
            if ($status !== null) {
                $sql .= ' AND dk.status = ?';
                $bind[] = $status;
            } else {
                $sql .= " AND (dk.status IS NULL OR dk.status = 'aktif')";
            }
            $sql .= ' ORDER BY d.kategori, d.daerah, dk.kamar';

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows
            ], 200);
        } catch (\Exception $e) {
            error_log('IjinController::getKamarOptions ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data kamar',
                'data' => []
            ], 500);
        }
    }

    /**
     * GET /api/ijin/rombel-options?jenis=diniyah|formal — sama dengan pendaftaran/rombel-options.
     */
    public function getRombelOptions(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $jenis = isset($params['jenis']) ? trim((string) $params['jenis']) : '';
            if ($jenis === '' || !in_array(strtolower($jenis), ['diniyah', 'formal'], true)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter jenis wajib: diniyah atau formal',
                    'data' => []
                ], 400);
            }
            $kategoriLembaga = ucfirst(strtolower($jenis));

            $sql = 'SELECT r.id, r.lembaga_id, l.nama AS lembaga_nama, r.kelas, r.kel
                    FROM lembaga___rombel r
                    INNER JOIN lembaga l ON l.id = r.lembaga_id
                    WHERE l.kategori = ? AND (r.status IS NULL OR r.status = \'aktif\')
                    ORDER BY l.nama, r.kelas, r.kel';
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$kategoriLembaga]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows
            ], 200);
        } catch (\Exception $e) {
            error_log('IjinController::getRombelOptions ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data rombel',
                'data' => []
            ], 500);
        }
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json');
    }
}
