<?php

namespace App\Controllers;

use App\Auth\JwtAuth;
use App\Database;
use App\Helpers\AlumniHelper;
use App\Helpers\NikHelper;
use App\Helpers\TextSanitizer;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AlumniController
{
    private $db;
    private JwtAuth $jwt;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $this->jwt = new JwtAuth();
    }

    private function json(Response $response, array $payload, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($status)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    private function requireAlumniUser(Request $request): ?array
    {
        $user = $request->getAttribute('user');
        if (!is_array($user)) {
            return null;
        }
        $role = strtolower(trim((string) ($user['role_key'] ?? '')));
        if ($role !== 'alumni') {
            return null;
        }
        $nik = preg_replace('/\D/', '', (string) ($user['nik'] ?? ''));
        if (strlen($nik) !== 16) {
            return null;
        }
        return $user;
    }

    public function count(Request $request, Response $response): Response
    {
        try {
            $total = (int) $this->db->query('SELECT COUNT(*) FROM alumni')->fetchColumn();
            return $this->json($response, [
                'success' => true,
                'data' => ['total' => $total],
            ]);
        } catch (\Throwable $e) {
            error_log('AlumniController::count ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengambil total alumni'], 500);
        }
    }

    /**
     * Top 5 pasangan kabupaten–kecamatan + top 3 kabupaten terbanyak.
     */
    public function topWilayah(Request $request, Response $response): Response
    {
        try {
            $sqlKec = <<<'SQL'
SELECT kabupaten, kecamatan, COUNT(*) AS total
FROM alumni
WHERE kabupaten IS NOT NULL AND TRIM(kabupaten) <> ''
  AND kecamatan IS NOT NULL AND TRIM(kecamatan) <> ''
GROUP BY kabupaten, kecamatan
ORDER BY total DESC, kabupaten ASC, kecamatan ASC
LIMIT 5
SQL;
            $rowsKec = $this->db->query($sqlKec)->fetchAll(\PDO::FETCH_ASSOC);
            $listKec = array_map(static function (array $r) {
                return [
                    'kabupaten' => (string) $r['kabupaten'],
                    'kecamatan' => (string) $r['kecamatan'],
                    'label' => trim($r['kabupaten'] . ' – ' . $r['kecamatan']),
                    'total' => (int) $r['total'],
                ];
            }, $rowsKec ?: []);

            $sqlKab = <<<'SQL'
SELECT kabupaten, COUNT(*) AS total
FROM alumni
WHERE kabupaten IS NOT NULL AND TRIM(kabupaten) <> ''
GROUP BY kabupaten
ORDER BY total DESC, kabupaten ASC
LIMIT 3
SQL;
            $rowsKab = $this->db->query($sqlKab)->fetchAll(\PDO::FETCH_ASSOC);
            $listKab = array_map(static function (array $r) {
                return [
                    'kabupaten' => (string) $r['kabupaten'],
                    'total' => (int) $r['total'],
                ];
            }, $rowsKab ?: []);

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'items' => $listKec,
                    'kabupaten' => $listKab,
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('AlumniController::topWilayah ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengambil data wilayah'], 500);
        }
    }

    /**
     * Autocomplete alamat (desa/kecamatan/kabupaten) dari master tabel alamat.
     * Query: q, field=desa|kecamatan|kabupaten|provinsi
     */
    public function alamatSuggest(Request $request, Response $response): Response
    {
        $q = trim((string) ($request->getQueryParams()['q'] ?? ''));
        $field = strtolower(trim((string) ($request->getQueryParams()['field'] ?? 'desa')));
        if (strlen($q) < 1) {
            return $this->json($response, ['success' => true, 'data' => ['items' => []]]);
        }
        $allowed = ['desa', 'kecamatan', 'kabupaten', 'provinsi'];
        if (!in_array($field, $allowed, true)) {
            $field = 'desa';
        }

        try {
            if ($field === 'provinsi') {
                $stmt = $this->db->prepare(
                    "SELECT id, nama, tipe, kode_pos FROM alamat
                     WHERE tipe = 'provinsi' AND nama LIKE ?
                     ORDER BY nama ASC LIMIT 15"
                );
                $stmt->execute(['%' . $q . '%']);
                $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
                $items = array_map(static function (array $r) {
                    return [
                        'id' => $r['id'],
                        'desa' => null,
                        'kecamatan' => null,
                        'kabupaten' => null,
                        'provinsi' => $r['nama'],
                        'kode_pos' => $r['kode_pos'],
                        'label' => $r['nama'],
                    ];
                }, $rows);
                return $this->json($response, ['success' => true, 'data' => ['items' => $items]]);
            }

            if ($field === 'kabupaten') {
                $stmt = $this->db->prepare(
                    "SELECT a.id, a.nama AS kabupaten, a.kode_pos, p.nama AS provinsi
                     FROM alamat a
                     LEFT JOIN alamat p ON p.id = SUBSTRING_INDEX(a.id, '.', 1) AND p.tipe = 'provinsi'
                     WHERE a.tipe = 'kabupaten' AND a.nama LIKE ?
                     ORDER BY a.nama ASC LIMIT 15"
                );
                $stmt->execute(['%' . $q . '%']);
                $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
                $items = array_map(static function (array $r) {
                    return [
                        'id' => $r['id'],
                        'desa' => null,
                        'kecamatan' => null,
                        'kabupaten' => $r['kabupaten'],
                        'provinsi' => $r['provinsi'],
                        'kode_pos' => $r['kode_pos'],
                        'label' => trim($r['kabupaten'] . ($r['provinsi'] ? ', ' . $r['provinsi'] : '')),
                    ];
                }, $rows);
                return $this->json($response, ['success' => true, 'data' => ['items' => $items]]);
            }

            if ($field === 'kecamatan') {
                $stmt = $this->db->prepare(
                    "SELECT a.id, a.nama AS kecamatan, a.kode_pos,
                            kab.nama AS kabupaten, p.nama AS provinsi
                     FROM alamat a
                     LEFT JOIN alamat kab ON kab.id = SUBSTRING_INDEX(a.id, '.', 2) AND kab.tipe = 'kabupaten'
                     LEFT JOIN alamat p ON p.id = SUBSTRING_INDEX(a.id, '.', 1) AND p.tipe = 'provinsi'
                     WHERE a.tipe = 'kecamatan' AND a.nama LIKE ?
                     ORDER BY a.nama ASC LIMIT 20"
                );
                $stmt->execute(['%' . $q . '%']);
                $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
                $items = array_map(static function (array $r) {
                    return [
                        'id' => $r['id'],
                        'desa' => null,
                        'kecamatan' => $r['kecamatan'],
                        'kabupaten' => $r['kabupaten'],
                        'provinsi' => $r['provinsi'],
                        'kode_pos' => $r['kode_pos'],
                        'label' => trim($r['kecamatan'] . ', ' . ($r['kabupaten'] ?? '')),
                    ];
                }, $rows);
                return $this->json($response, ['success' => true, 'data' => ['items' => $items]]);
            }

            // desa (default): isi hierarki penuh
            $stmt = $this->db->prepare(
                "SELECT d.id, d.nama AS desa, d.kode_pos,
                        kec.nama AS kecamatan, kab.nama AS kabupaten, p.nama AS provinsi
                 FROM alamat d
                 LEFT JOIN alamat kec ON kec.id = SUBSTRING_INDEX(d.id, '.', 3) AND kec.tipe = 'kecamatan'
                 LEFT JOIN alamat kab ON kab.id = SUBSTRING_INDEX(d.id, '.', 2) AND kab.tipe = 'kabupaten'
                 LEFT JOIN alamat p ON p.id = SUBSTRING_INDEX(d.id, '.', 1) AND p.tipe = 'provinsi'
                 WHERE d.tipe = 'desa' AND d.nama LIKE ?
                 ORDER BY d.nama ASC LIMIT 25"
            );
            $stmt->execute(['%' . $q . '%']);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
            $items = array_map(static function (array $r) {
                return [
                    'id' => $r['id'],
                    'desa' => $r['desa'],
                    'kecamatan' => $r['kecamatan'],
                    'kabupaten' => $r['kabupaten'],
                    'provinsi' => $r['provinsi'],
                    'kode_pos' => $r['kode_pos'],
                    'label' => trim(
                        $r['desa']
                        . ($r['kecamatan'] ? ', ' . $r['kecamatan'] : '')
                        . ($r['kabupaten'] ? ', ' . $r['kabupaten'] : '')
                    ),
                ];
            }, $rows);

            return $this->json($response, ['success' => true, 'data' => ['items' => $items]]);
        } catch (\Throwable $e) {
            error_log('AlumniController::alamatSuggest ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mencari alamat'], 500);
        }
    }

    public function checkNik(Request $request, Response $response): Response
    {
        $nik = preg_replace('/\D/', '', (string) ($request->getQueryParams()['nik'] ?? ''));
        if (strlen($nik) !== 16) {
            return $this->json($response, [
                'success' => false,
                'message' => 'NIK harus terdiri dari 16 angka',
            ], 400);
        }
        try {
            $stmt = $this->db->prepare('SELECT id FROM alumni WHERE nik = ? LIMIT 1');
            $stmt->execute([$nik]);
            $exists = (bool) $stmt->fetch(\PDO::FETCH_ASSOC);
            return $this->json($response, [
                'success' => true,
                'data' => ['exists' => $exists],
            ]);
        } catch (\Throwable $e) {
            error_log('AlumniController::checkNik ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal cek NIK'], 500);
        }
    }

    public function convertTahun(Request $request, Response $response): Response
    {
        $masehi = AlumniHelper::normalizeYear($request->getQueryParams()['masehi'] ?? null);
        if ($masehi === null || strlen($masehi) !== 4) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Parameter masehi harus tahun 4 digit',
            ], 400);
        }
        $hijriyah = AlumniHelper::masehiYearToHijriyahYear($this->db, (int) $masehi);
        if ($hijriyah === null) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal konversi tahun ke Hijriyah',
            ], 422);
        }
        return $this->json($response, [
            'success' => true,
            'data' => [
                'masehi' => $masehi,
                'hijriyah' => $hijriyah,
            ],
        ]);
    }

    public function loginNik(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, ['nik']) : [];
            $nikRaw = (string) ($data['nik'] ?? '');
            $nikCheck = NikHelper::validate($nikRaw);
            if (!$nikCheck['valid'] || $nikCheck['normalized'] === null) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'NIK tidak valid',
                ], 400);
            }
            $nik = $nikCheck['normalized'];
            $identity = NikHelper::parseIdentity($nik) ?? [
                'gender' => null,
                'tanggal_lahir' => null,
                'tempat_lahir' => null,
            ];

            $stmt = $this->db->prepare('SELECT * FROM alumni WHERE nik = ? LIMIT 1');
            $stmt->execute([$nik]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $registered = (bool) $row;
            $alumniPayload = $registered ? $this->formatAlumniSummaryRow($row) : null;

            $tokenPayload = [
                'alumni_id' => $registered ? (int) $row['id'] : null,
                'id_alumni' => $registered ? (int) $row['id_alumni'] : null,
                'user_name' => $registered ? (string) ($row['nama'] ?? '') : '',
                'nik' => $nik,
                'role_key' => 'alumni',
                'role_label' => 'Alumni',
                'allowed_apps' => ['daftar'],
                'permissions' => [],
            ];
            $token = $this->jwt->generateToken($tokenPayload);

            return $this->json($response, [
                'success' => true,
                'message' => $registered
                    ? 'NIK sudah terdaftar sebagai alumni'
                    : 'NIK baru, silakan isi biodata alumni',
                'data' => [
                    'token' => $token,
                    'registered' => $registered,
                    'redirect_url' => $registered ? '/alumni/tercatat' : '/alumni/biodata',
                    // Identity dari parsing NIK (bukan dari DB) — aman untuk prefill form baru
                    'identity' => $registered ? null : $identity,
                    // Sudah terdaftar: hanya id + nama (tanpa PII lain dari server)
                    'alumni' => $alumniPayload,
                    'user' => [
                        'id' => $registered ? (int) $row['id'] : null,
                        'alumni_id' => $registered ? (int) $row['id'] : null,
                        'id_alumni' => $registered ? (int) $row['id_alumni'] : null,
                        'nama' => $registered ? (string) ($row['nama'] ?? '') : '',
                        'nik' => $nik,
                        'gender' => $registered ? null : ($identity['gender'] ?? null),
                        'tanggal_lahir' => $registered ? null : ($identity['tanggal_lahir'] ?? null),
                        'tempat_lahir' => $registered ? null : ($identity['tempat_lahir'] ?? null),
                        'role_key' => 'alumni',
                        'role_label' => 'Alumni',
                        'allowed_apps' => ['daftar'],
                        'registered' => $registered,
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('AlumniController::loginNik ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan saat login'], 500);
        }
    }

    public function me(Request $request, Response $response): Response
    {
        $user = $this->requireAlumniUser($request);
        if ($user === null) {
            return $this->json($response, ['success' => false, 'message' => 'Akses alumni diperlukan'], 403);
        }
        $nik = preg_replace('/\D/', '', (string) ($user['nik'] ?? ''));
        try {
            $stmt = $this->db->prepare('SELECT * FROM alumni WHERE nik = ? LIMIT 1');
            $stmt->execute([$nik]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->json($response, [
                    'success' => true,
                    'data' => [
                        'registered' => false,
                        'nik' => $nik,
                        'alumni' => null,
                    ],
                ]);
            }
            return $this->json($response, [
                'success' => true,
                'data' => [
                    'registered' => true,
                    'nik' => $nik,
                    // Ringkas saja — detail penuh hanya lewat preview client setelah simpan baru
                    'alumni' => $this->formatAlumniSummaryRow($row),
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('AlumniController::me ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengambil data alumni'], 500);
        }
    }

    public function saveBiodata(Request $request, Response $response): Response
    {
        $user = $this->requireAlumniUser($request);
        if ($user === null) {
            return $this->json($response, ['success' => false, 'message' => 'Akses alumni diperlukan'], 403);
        }

        $tokenNik = preg_replace('/\D/', '', (string) ($user['nik'] ?? ''));
        $data = $request->getParsedBody();
        $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, [
            'nama', 'nik', 'gender', 'status', 'nomor_hp', 'tempat_lahir', 'tanggal_lahir',
            'dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kabupaten', 'provinsi', 'kode_pos',
            'ayah', 'ibu', 'tahun_masuk_masehi', 'tahun_boyong_masehi',
        ]) : [];

        $nikBody = preg_replace('/\D/', '', (string) ($data['nik'] ?? $tokenNik));
        if ($nikBody !== $tokenNik) {
            return $this->json($response, [
                'success' => false,
                'message' => 'NIK tidak boleh diubah dari sesi login',
            ], 400);
        }

        $nikCheck = NikHelper::validate($tokenNik);
        if (!$nikCheck['valid']) {
            return $this->json($response, [
                'success' => false,
                'message' => 'NIK tidak valid',
            ], 400);
        }

        $nama = trim((string) ($data['nama'] ?? ''));
        if ($nama === '') {
            return $this->json($response, ['success' => false, 'message' => 'Nama wajib diisi'], 400);
        }

        $gender = AlumniHelper::normalizeGender($data['gender'] ?? null);
        if ($gender === null) {
            return $this->json($response, ['success' => false, 'message' => 'Gender wajib diisi'], 400);
        }

        $statusRaw = strtolower(trim((string) ($data['status'] ?? 'hidup')));
        $status = $statusRaw === 'wafat' ? 'wafat' : 'hidup';

        $tahunBoyongM = AlumniHelper::normalizeYear($data['tahun_boyong_masehi'] ?? null);
        if ($tahunBoyongM === null || strlen($tahunBoyongM) !== 4) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Tahun boyong (Masehi) wajib diisi',
            ], 400);
        }
        $tahunBoyongH = AlumniHelper::masehiYearToHijriyahYear($this->db, (int) $tahunBoyongM);
        if ($tahunBoyongH === null) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal konversi tahun boyong ke Hijriyah',
            ], 422);
        }

        $desa = trim((string) ($data['desa'] ?? ''));
        $kecamatan = trim((string) ($data['kecamatan'] ?? ''));
        $kabupaten = trim((string) ($data['kabupaten'] ?? ''));
        $provinsi = trim((string) ($data['provinsi'] ?? ''));
        if ($desa === '' || $kecamatan === '' || $kabupaten === '' || $provinsi === '') {
            return $this->json($response, [
                'success' => false,
                'message' => 'Desa, kecamatan, kabupaten, dan provinsi wajib diisi',
            ], 400);
        }

        $tahunMasukM = AlumniHelper::normalizeYear($data['tahun_masuk_masehi'] ?? null);
        $tahunMasukH = null;
        if ($tahunMasukM !== null && strlen($tahunMasukM) === 4) {
            $tahunMasukH = AlumniHelper::masehiYearToHijriyahYear($this->db, (int) $tahunMasukM);
        } else {
            $tahunMasukM = null;
        }

        $fields = [
            'nama' => $nama,
            'gender' => $gender,
            'status' => $status,
            'nomor_hp' => $this->nullIfEmpty($data['nomor_hp'] ?? null),
            'tempat_lahir' => $this->nullIfEmpty($data['tempat_lahir'] ?? null),
            'tanggal_lahir' => $this->normalizeDate($data['tanggal_lahir'] ?? null),
            'dusun' => $this->nullIfEmpty($data['dusun'] ?? null),
            'rt' => $this->nullIfEmpty($data['rt'] ?? null),
            'rw' => $this->nullIfEmpty($data['rw'] ?? null),
            'desa' => $desa,
            'kecamatan' => $kecamatan,
            'kabupaten' => $kabupaten,
            'provinsi' => $provinsi,
            'kode_pos' => $this->nullIfEmpty($data['kode_pos'] ?? null),
            'ayah' => $this->nullIfEmpty($data['ayah'] ?? null),
            'ibu' => $this->nullIfEmpty($data['ibu'] ?? null),
            'tahun_masuk_masehi' => $tahunMasukM,
            'tahun_masuk_hijriyah' => $tahunMasukH,
            'tahun_boyong_masehi' => $tahunBoyongM,
            'tahun_boyong_hijriyah' => $tahunBoyongH,
        ];

        try {
            $this->db->beginTransaction();

            $stmt = $this->db->prepare('SELECT * FROM alumni WHERE nik = ? LIMIT 1 FOR UPDATE');
            $stmt->execute([$tokenNik]);
            $existing = $stmt->fetch(\PDO::FETCH_ASSOC);

            if ($existing) {
                $sets = [];
                $params = [];
                foreach ($fields as $col => $val) {
                    $sets[] = "`{$col}` = ?";
                    $params[] = $val;
                }
                $params[] = (int) $existing['id'];
                $sql = 'UPDATE alumni SET ' . implode(', ', $sets) . ' WHERE id = ?';
                $this->db->prepare($sql)->execute($params);
                $id = (int) $existing['id'];
            } else {
                // Pastikan tidak ada race NIK ganda
                $dup = $this->db->prepare('SELECT id FROM alumni WHERE nik = ? LIMIT 1');
                $dup->execute([$tokenNik]);
                if ($dup->fetch(\PDO::FETCH_ASSOC)) {
                    $this->db->rollBack();
                    return $this->json($response, [
                        'success' => false,
                        'message' => 'NIK sudah terdaftar sebagai alumni',
                    ], 409);
                }

                $prefix = AlumniHelper::parsePrefixFromGenderAndTahun($gender, $tahunBoyongH);
                $idAlumni = AlumniHelper::generateNextIdAlumni($this->db, $prefix);

                $insertCols = [
                    'id_alumni', 'nama', 'nik', 'gender', 'status', 'nomor_hp', 'tempat_lahir', 'tanggal_lahir',
                    'dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kabupaten', 'provinsi', 'kode_pos',
                    'ayah', 'ibu', 'tahun_masuk_masehi', 'tahun_masuk_hijriyah',
                    'tahun_boyong_masehi', 'tahun_boyong_hijriyah',
                ];
                $placeholders = implode(', ', array_fill(0, count($insertCols), '?'));
                $sql = 'INSERT INTO alumni (`' . implode('`, `', $insertCols) . '`) VALUES (' . $placeholders . ')';
                $this->db->prepare($sql)->execute([
                    (int) $idAlumni,
                    $nama,
                    $tokenNik,
                    $gender,
                    $status,
                    $fields['nomor_hp'],
                    $fields['tempat_lahir'],
                    $fields['tanggal_lahir'],
                    $fields['dusun'],
                    $fields['rt'],
                    $fields['rw'],
                    $fields['desa'],
                    $fields['kecamatan'],
                    $fields['kabupaten'],
                    $fields['provinsi'],
                    $fields['kode_pos'],
                    $fields['ayah'],
                    $fields['ibu'],
                    $fields['tahun_masuk_masehi'],
                    $fields['tahun_masuk_hijriyah'],
                    $fields['tahun_boyong_masehi'],
                    $fields['tahun_boyong_hijriyah'],
                ]);
                $id = (int) $this->db->lastInsertId();
            }

            $stmtNew = $this->db->prepare('SELECT * FROM alumni WHERE id = ? LIMIT 1');
            $stmtNew->execute([$id]);
            $row = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                // Fallback: baca ulang by NIK bila lastInsertId bermasalah
                $byNik = $this->db->prepare('SELECT * FROM alumni WHERE nik = ? LIMIT 1');
                $byNik->execute([$tokenNik]);
                $row = $byNik->fetch(\PDO::FETCH_ASSOC);
            }
            if (!$row) {
                $this->db->rollBack();
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Data tersimpan tetapi gagal dibaca ulang. Coba login NIK lagi.',
                ], 500);
            }
            $this->db->commit();

            $formatted = $this->formatAlumniSummaryRow($row);
            $tokenPayload = [
                'alumni_id' => (int) $row['id'],
                'id_alumni' => (int) $row['id_alumni'],
                'user_name' => (string) ($row['nama'] ?? ''),
                'nik' => $tokenNik,
                'role_key' => 'alumni',
                'role_label' => 'Alumni',
                'allowed_apps' => ['daftar'],
                'permissions' => [],
            ];
            $token = $this->jwt->generateToken($tokenPayload);

            return $this->json($response, [
                'success' => true,
                'message' => 'Biodata alumni berhasil disimpan',
                'data' => [
                    'token' => $token,
                    'registered' => true,
                    'redirect_url' => '/alumni/tercatat',
                    // Server hanya kirim id+nama; preview lengkap dari form di client
                    'alumni' => $formatted,
                    'user' => [
                        'id' => (int) $row['id'],
                        'alumni_id' => (int) $row['id'],
                        'id_alumni' => (int) $row['id_alumni'],
                        'nama' => (string) ($row['nama'] ?? ''),
                        'nik' => $tokenNik,
                        'role_key' => 'alumni',
                        'role_label' => 'Alumni',
                        'allowed_apps' => ['daftar'],
                        'registered' => true,
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            if ((int) ($e->getCode()) === 23000 || str_contains($e->getMessage(), 'Duplicate')) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'NIK sudah terdaftar sebagai alumni',
                ], 409);
            }
            error_log('AlumniController::saveBiodata ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan biodata alumni'], 500);
        }
    }

    /** Ringkasan aman untuk NIK yang sudah terdaftar (tanpa PII sensitif). */
    private function formatAlumniSummaryRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'id_alumni' => (int) $row['id_alumni'],
            'nama' => (string) ($row['nama'] ?? ''),
        ];
    }

    private function formatAlumniRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'id_alumni' => (int) $row['id_alumni'],
            'nama' => $row['nama'] ?? '',
            'nik' => $row['nik'] ?? '',
            'gender' => $row['gender'] ?? null,
            'status' => (($row['status'] ?? 'hidup') === 'wafat') ? 'wafat' : 'hidup',
            'nomor_hp' => $row['nomor_hp'] ?? null,
            'tempat_lahir' => $row['tempat_lahir'] ?? null,
            'tanggal_lahir' => $row['tanggal_lahir'] ?? null,
            'dusun' => $row['dusun'] ?? null,
            'rt' => $row['rt'] ?? null,
            'rw' => $row['rw'] ?? null,
            'desa' => $row['desa'] ?? null,
            'kecamatan' => $row['kecamatan'] ?? null,
            'kabupaten' => $row['kabupaten'] ?? null,
            'provinsi' => $row['provinsi'] ?? null,
            'kode_pos' => $row['kode_pos'] ?? null,
            'ayah' => $row['ayah'] ?? null,
            'ibu' => $row['ibu'] ?? null,
            'tahun_masuk_masehi' => $row['tahun_masuk_masehi'] ?? null,
            'tahun_masuk_hijriyah' => $row['tahun_masuk_hijriyah'] ?? null,
            'tahun_boyong_masehi' => $row['tahun_boyong_masehi'] ?? null,
            'tahun_boyong_hijriyah' => $row['tahun_boyong_hijriyah'] ?? null,
            'id_santri' => isset($row['id_santri']) && $row['id_santri'] !== null ? (int) $row['id_santri'] : null,
            'tanggal_dibuat' => $row['tanggal_dibuat'] ?? null,
        ];
    }

    private function nullIfEmpty($value): ?string
    {
        if ($value === null) {
            return null;
        }
        $s = trim((string) $value);
        return $s === '' ? null : $s;
    }

    private function normalizeDate($value): ?string
    {
        $s = $this->nullIfEmpty($value);
        if ($s === null) {
            return null;
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) {
            return null;
        }
        return $s;
    }
}
