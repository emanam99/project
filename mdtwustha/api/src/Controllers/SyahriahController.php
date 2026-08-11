<?php

namespace App\Controllers;

use App\Config\Database;
use DateTimeImmutable;
use DateTimeZone;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class SyahriahController {
    private const TIMEZONE = 'Asia/Jakarta';
    /** Urutan bulan akademik: Dzulqa'dah → Sya'ban */
    private const BULAN_AKADEMIK = [11, 12, 1, 2, 3, 4, 5, 6, 7, 8];

    public function listTahunAjaran(Request $request, Response $response): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $db = Database::getInstance();
        $rows = $db->query('SELECT id, tahun_hijri_awal, label, aktif, created_at FROM tahun_ajaran ORDER BY tahun_hijri_awal DESC')->fetchAll();
        return $this->jsonResponse($response, ['success' => true, 'data' => $rows]);
    }

    public function createTahunAjaran(Request $request, Response $response): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $data = $this->parseBody($request);
        $tahun = (int) ($data['tahun_hijri_awal'] ?? 0);
        if ($tahun < 1400 || $tahun > 1600) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Tahun Hijriyah awal tidak valid']);
        }
        $label = trim((string) ($data['label'] ?? ''));
        if ($label === '') {
            $label = $tahun . '/' . ($tahun + 1);
        }
        $setAktif = !empty($data['aktif']);

        $db = Database::getInstance();
        try {
            $db->beginTransaction();
            if ($setAktif) {
                $db->exec('UPDATE tahun_ajaran SET aktif = 0');
            }
            $stmt = $db->prepare('INSERT INTO tahun_ajaran (tahun_hijri_awal, label, aktif) VALUES (:y, :label, :aktif)');
            $stmt->execute([
                'y' => $tahun,
                'label' => $label,
                'aktif' => $setAktif ? 1 : 0,
            ]);
            $id = (int) $db->lastInsertId();
            $db->commit();
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Tahun ajaran ditambahkan',
                'data' => ['id' => $id, 'tahun_hijri_awal' => $tahun, 'label' => $label, 'aktif' => $setAktif ? 1 : 0],
            ]);
        } catch (\PDOException $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            if ((int) $e->getCode() === 23000) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tahun ajaran sudah ada']);
            }
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menyimpan: ' . $e->getMessage()]);
        }
    }

    public function updateTahunAjaran(Request $request, Response $response, array $args): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID wajib']);
        }
        $data = $this->parseBody($request);
        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT id FROM tahun_ajaran WHERE id = :id');
        $stmt->execute(['id' => $id]);
        if (!$stmt->fetch()) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Tahun ajaran tidak ditemukan']);
        }

        try {
            $db->beginTransaction();
            if (array_key_exists('aktif', $data) && !empty($data['aktif'])) {
                $db->exec('UPDATE tahun_ajaran SET aktif = 0');
                $stmt = $db->prepare('UPDATE tahun_ajaran SET aktif = 1 WHERE id = :id');
                $stmt->execute(['id' => $id]);
            }
            if (isset($data['label'])) {
                $label = trim((string) $data['label']);
                if ($label !== '') {
                    $stmt = $db->prepare('UPDATE tahun_ajaran SET label = :label WHERE id = :id');
                    $stmt->execute(['label' => $label, 'id' => $id]);
                }
            }
            $db->commit();
            return $this->jsonResponse($response, ['success' => true, 'message' => 'Tahun ajaran diperbarui']);
        } catch (\Exception $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            return $this->jsonResponse($response, ['success' => false, 'message' => $e->getMessage()]);
        }
    }

    public function bulanAkademik(Request $request, Response $response): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $params = $request->getQueryParams();
        $taId = (int) ($params['tahun_ajaran_id'] ?? 0);
        $db = Database::getInstance();
        $ta = $this->getTahunAjaran($db, $taId);
        if (!$ta) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Tahun ajaran tidak ditemukan']);
        }
        return $this->jsonResponse($response, [
            'success' => true,
            'data' => $this->buildBulanList((int) $ta['tahun_hijri_awal']),
        ]);
    }

    public function ringkas(Request $request, Response $response): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $params = $request->getQueryParams();
        $taId = (int) ($params['tahun_ajaran_id'] ?? 0);
        $santriIdFilter = trim((string) ($params['santri_id'] ?? ''));
        $kelasId = trim((string) ($params['kelas_id'] ?? ''));
        $kelasIdsRaw = trim((string) ($params['kelas_ids'] ?? ''));
        $kelasIds = [];
        if ($kelasIdsRaw !== '') {
            foreach (preg_split('/[,\s]+/', $kelasIdsRaw) as $part) {
                $id = (int) trim($part);
                if ($id > 0) {
                    $kelasIds[$id] = $id;
                }
            }
            $kelasIds = array_values($kelasIds);
        } elseif ($kelasId !== '') {
            $kelasIds = [(int) $kelasId];
        }

        $db = Database::getInstance();
        $ta = $this->getTahunAjaran($db, $taId);
        if (!$ta) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Tahun ajaran tidak ditemukan']);
        }

        $bulanList = $this->buildBulanList((int) $ta['tahun_hijri_awal']);

        $bind = [];
        if ($santriIdFilter !== '') {
            $sql = '
                SELECT s.id AS santri_id, s.nomer_induk, s.nama,
                       sk.kelas_id, k.nama_kelas, k.kel
                FROM santri s
                LEFT JOIN santri___kelas sk ON sk.santri_id = s.id AND sk.tanggal_selesai IS NULL
                LEFT JOIN kelas k ON k.id = sk.kelas_id
                WHERE s.id = :sid
                LIMIT 1
            ';
            $bind['sid'] = $santriIdFilter;
        } else {
            $sql = '
                SELECT s.id AS santri_id, s.nomer_induk, s.nama,
                       sk.kelas_id, k.nama_kelas, k.kel
                FROM santri s
                INNER JOIN santri___kelas sk ON sk.santri_id = s.id AND sk.tanggal_selesai IS NULL
                INNER JOIN kelas k ON k.id = sk.kelas_id
            ';
            if (!empty($kelasIds)) {
                $placeholders = [];
                foreach ($kelasIds as $i => $kid) {
                    $key = 'kelas_' . $i;
                    $placeholders[] = ':' . $key;
                    $bind[$key] = $kid;
                }
                $sql .= ' WHERE sk.kelas_id IN (' . implode(',', $placeholders) . ')';
            }
            $sql .= ' ORDER BY k.nama_kelas ASC, k.kel ASC, sk.urutan ASC, s.nama ASC';
        }
        $stmt = $db->prepare($sql);
        $stmt->execute($bind);
        $santriRows = $stmt->fetchAll();

        $stmt = $db->prepare('
            SELECT w.id, w.santri_id, w.bulan_hijri, w.tahun_hijri, w.nominal,
                   COALESCE(SUM(a.nominal), 0) AS terbayar
            FROM santri___syahriah_wajib w
            LEFT JOIN santri___syahriah_alokasi a ON a.wajib_id = w.id
            WHERE w.tahun_ajaran_id = :ta
            GROUP BY w.id, w.santri_id, w.bulan_hijri, w.tahun_hijri, w.nominal
        ');
        $stmt->execute(['ta' => $taId]);
        $wajibMap = [];
        foreach ($stmt->fetchAll() as $w) {
            $key = ((string) $w['santri_id']) . ':' . $w['bulan_hijri'] . ':' . $w['tahun_hijri'];
            $nominal = (float) $w['nominal'];
            $terbayar = (float) $w['terbayar'];
            // Kewajiban 0 = tidak termasuk (disabled)
            if ($nominal <= 0) {
                $wajibMap[$key] = [
                    'wajib_id' => (int) $w['id'],
                    'nominal' => 0,
                    'terbayar' => 0,
                    'sisa' => null,
                    'disabled' => true,
                ];
                continue;
            }
            $wajibMap[$key] = [
                'wajib_id' => (int) $w['id'],
                'nominal' => $nominal,
                'terbayar' => $terbayar,
                'sisa' => max(0, $nominal - $terbayar),
                'disabled' => false,
            ];
        }

        $stmt = $db->prepare('
            SELECT santri_id, COALESCE(SUM(nominal), 0) AS total_bayar
            FROM santri___syahriah_bayar
            WHERE tahun_ajaran_id = :ta
            GROUP BY santri_id
        ');
        $stmt->execute(['ta' => $taId]);
        $totalBayarMap = [];
        foreach ($stmt->fetchAll() as $r) {
            $totalBayarMap[(string) $r['santri_id']] = (float) $r['total_bayar'];
        }

        $data = [];
        foreach ($santriRows as $s) {
            $sid = (string) $s['santri_id'];
            $bulan = [];
            $totalWajib = 0.0;
            $totalTerbayar = 0.0;
            foreach ($bulanList as $b) {
                $key = $sid . ':' . $b['bulan_hijri'] . ':' . $b['tahun_hijri'];
                $cell = $wajibMap[$key] ?? null;
                if ($cell) {
                    if (empty($cell['disabled']) && ($cell['nominal'] ?? 0) > 0) {
                        $totalWajib += $cell['nominal'];
                        $totalTerbayar += $cell['terbayar'];
                    }
                    $bulan[] = array_merge($b, $cell);
                } else {
                    $bulan[] = array_merge($b, [
                        'wajib_id' => null,
                        'nominal' => null,
                        'terbayar' => 0,
                        'sisa' => null,
                        'disabled' => true,
                    ]);
                }
            }
            $sumBayar = $totalBayarMap[$sid] ?? 0.0;
            $saldo = max(0, $sumBayar - $totalTerbayar);
            $data[] = [
                'santri_id' => $sid,
                'nomer_induk' => $s['nomer_induk'],
                'nama' => $s['nama'],
                'kelas_id' => $s['kelas_id'] !== null ? (string) $s['kelas_id'] : '',
                'nama_kelas' => $s['nama_kelas'] ?? '',
                'kel' => $s['kel'] ?? '',
                'bulan' => $bulan,
                'total_wajib' => $totalWajib,
                'total_terbayar' => $totalTerbayar,
                'total_sisa' => max(0, $totalWajib - $totalTerbayar),
                'total_bayar' => $sumBayar,
                'saldo' => $saldo,
            ];
        }

        return $this->jsonResponse($response, [
            'success' => true,
            'data' => $data,
            'meta' => [
                'tahun_ajaran' => $ta,
                'bulan' => $bulanList,
            ],
        ]);
    }

    public function batchWajib(Request $request, Response $response): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $data = $this->parseBody($request);
        $taId = (int) ($data['tahun_ajaran_id'] ?? 0);
        $santriIds = $data['santri_ids'] ?? [];
        $bulanInput = $data['bulan'] ?? [];
        $nominal = isset($data['nominal']) ? (float) $data['nominal'] : null;
        $nominalPerBulan = $data['nominal_per_bulan'] ?? null;

        if (!is_array($santriIds) || count($santriIds) === 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Pilih minimal satu santri']);
        }
        if (!is_array($bulanInput) || count($bulanInput) === 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Pilih minimal satu bulan']);
        }

        try {
            $db = Database::getInstance();
        } catch (\PDOException $e) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Database tidak tersambung. Pastikan MySQL di XAMPP sudah dinyalakan.',
            ], 503);
        }
        $ta = $this->getTahunAjaran($db, $taId);
        if (!$ta) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Tahun ajaran tidak ditemukan']);
        }

        $bulanValid = [];
        foreach ($bulanInput as $b) {
            $bh = (int) ($b['bulan_hijri'] ?? 0);
            $th = (int) ($b['tahun_hijri'] ?? 0);
            if (!in_array($bh, self::BULAN_AKADEMIK, true) || $th <= 0) {
                continue;
            }
            $bulanValid[] = ['bulan_hijri' => $bh, 'tahun_hijri' => $th];
        }
        if (!$bulanValid) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Bulan tidak valid']);
        }

        $santriIds = array_values(array_unique(array_map('strval', $santriIds)));
        $upserted = 0;

        try {
            $db->beginTransaction();
            $stmt = $db->prepare('
                INSERT INTO santri___syahriah_wajib (tahun_ajaran_id, santri_id, bulan_hijri, tahun_hijri, nominal)
                VALUES (:ta, :sid, :bulan, :tahun, :nominal)
                ON DUPLICATE KEY UPDATE nominal = VALUES(nominal), updated_at = CURRENT_TIMESTAMP
            ');
            foreach ($santriIds as $sid) {
                foreach ($bulanValid as $b) {
                    $key = $b['bulan_hijri'] . '_' . $b['tahun_hijri'];
                    $nom = $nominal;
                    if (is_array($nominalPerBulan) && isset($nominalPerBulan[$key])) {
                        $nom = (float) $nominalPerBulan[$key];
                    } elseif (is_array($nominalPerBulan) && isset($nominalPerBulan[(string) $b['bulan_hijri']])) {
                        $nom = (float) $nominalPerBulan[(string) $b['bulan_hijri']];
                    }
                    if ($nom === null || $nom < 0) {
                        continue;
                    }
                    $stmt->execute([
                        'ta' => $taId,
                        'sid' => $sid,
                        'bulan' => $b['bulan_hijri'],
                        'tahun' => $b['tahun_hijri'],
                        'nominal' => $nom,
                    ]);
                    $upserted++;
                }
            }

            foreach ($santriIds as $sid) {
                $this->realokasiSantri($db, $taId, $sid);
            }
            $db->commit();
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => "Kewajiban disimpan ($upserted baris)",
                'data' => ['upserted' => $upserted],
            ]);
        } catch (\Exception $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            return $this->jsonResponse($response, ['success' => false, 'message' => $e->getMessage()]);
        }
    }

    public function updateWajib(Request $request, Response $response, array $args): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $id = (int) ($args['id'] ?? 0);
        $data = $this->parseBody($request);
        $nominal = (float) ($data['nominal'] ?? -1);
        if ($id <= 0 || $nominal < 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Data tidak valid']);
        }
        $db = Database::getInstance();
        $stmt = $db->prepare('SELECT id, tahun_ajaran_id, santri_id FROM santri___syahriah_wajib WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kewajiban tidak ditemukan']);
        }
        $stmt = $db->prepare('UPDATE santri___syahriah_wajib SET nominal = :n WHERE id = :id');
        $stmt->execute(['n' => $nominal, 'id' => $id]);
        $this->realokasiSantri($db, (int) $row['tahun_ajaran_id'], (string) $row['santri_id']);
        return $this->jsonResponse($response, ['success' => true, 'message' => 'Kewajiban diperbarui']);
    }

    public function listBayar(Request $request, Response $response): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $params = $request->getQueryParams();
        $taId = (int) ($params['tahun_ajaran_id'] ?? 0);
        $santriId = trim((string) ($params['santri_id'] ?? ''));
        if ($taId <= 0 || $santriId === '') {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'tahun_ajaran_id dan santri_id wajib', 'data' => []]);
        }
        $db = Database::getInstance();
        $stmt = $db->prepare('
            SELECT b.id, b.nominal, b.tanggal, b.keterangan, b.via, b.pengurus_id, b.created_at,
                   p.nama AS pengurus_nama
            FROM santri___syahriah_bayar b
            LEFT JOIN pengurus p ON p.id = b.pengurus_id
            WHERE b.tahun_ajaran_id = :ta AND b.santri_id = :sid
            ORDER BY b.tanggal DESC, b.id DESC
        ');
        $stmt->execute(['ta' => $taId, 'sid' => $santriId]);
        $rows = $stmt->fetchAll();

        $stmtA = $db->prepare('
            SELECT a.bayar_id, a.nominal, w.bulan_hijri, w.tahun_hijri
            FROM santri___syahriah_alokasi a
            INNER JOIN santri___syahriah_wajib w ON w.id = a.wajib_id
            WHERE a.bayar_id = :bid
            ORDER BY FIELD(w.bulan_hijri, 11,12,1,2,3,4,5,6,7,8), w.tahun_hijri
        ');
        foreach ($rows as &$r) {
            $stmtA->execute(['bid' => $r['id']]);
            $r['alokasi'] = $stmtA->fetchAll();
            $r['nominal'] = (float) $r['nominal'];
        }
        unset($r);

        return $this->jsonResponse($response, ['success' => true, 'data' => $rows]);
    }

    public function createBayar(Request $request, Response $response): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $data = $this->parseBody($request);
        $taId = (int) ($data['tahun_ajaran_id'] ?? 0);
        $santriId = trim((string) ($data['santri_id'] ?? ''));
        $nominal = (float) ($data['nominal'] ?? 0);
        $tanggal = trim((string) ($data['tanggal'] ?? ''));
        $keterangan = trim((string) ($data['keterangan'] ?? ''));
        $via = strtolower(trim((string) ($data['via'] ?? 'cash')));
        if (!in_array($via, ['cash', 'tf'], true)) {
            $via = 'cash';
        }
        $pengurusId = $this->normalizeOptionalId($data['pengurus_id'] ?? null);

        if ($taId <= 0 || $santriId === '') {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Tahun ajaran dan santri wajib']);
        }
        if ($nominal <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Nominal pembayaran harus > 0']);
        }
        if ($pengurusId === null) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Pencatat (pengurus) wajib diisi']);
        }
        if ($tanggal === '') {
            $tanggal = $this->todayString();
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Format tanggal tidak valid']);
        }

        $db = Database::getInstance();
        if (!$this->getTahunAjaran($db, $taId)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Tahun ajaran tidak ditemukan']);
        }
        $stmtP = $db->prepare('SELECT id FROM pengurus WHERE id = :id');
        $stmtP->execute(['id' => $pengurusId]);
        if (!$stmtP->fetch()) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Pencatat tidak ditemukan']);
        }

        $sisaTa = $this->getSyahriahSisaTa($db, $taId, $santriId);
        if ($sisaTa <= 0) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Tidak ada sisa kewajiban syahriah tahun ajaran ini',
            ]);
        }
        if ($nominal - $sisaTa > 0.009) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Nominal melebihi sisa kewajiban tahun ajaran (maksimal ' . number_format($sisaTa, 0, ',', '.') . ')',
            ]);
        }

        try {
            $db->beginTransaction();
            $stmt = $db->prepare('
                INSERT INTO santri___syahriah_bayar (tahun_ajaran_id, santri_id, nominal, tanggal, keterangan, via, pengurus_id)
                VALUES (:ta, :sid, :nominal, :tanggal, :ket, :via, :pid)
            ');
            $stmt->execute([
                'ta' => $taId,
                'sid' => $santriId,
                'nominal' => $nominal,
                'tanggal' => $tanggal,
                'ket' => $keterangan !== '' ? $keterangan : null,
                'via' => $via,
                'pid' => $pengurusId,
            ]);
            $bayarId = (int) $db->lastInsertId();
            $result = $this->realokasiSantri($db, $taId, $santriId);
            $db->commit();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pembayaran dicatat',
                'data' => [
                    'bayar_id' => $bayarId,
                    'alokasi' => $result['alokasi_preview'] ?? [],
                    'saldo' => $result['saldo'] ?? 0,
                ],
            ]);
        } catch (\Exception $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            return $this->jsonResponse($response, ['success' => false, 'message' => $e->getMessage()]);
        }
    }

    public function deleteBayar(Request $request, Response $response, array $args): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID wajib']);
        }
        $db = Database::getInstance();
        $stmt = $db->prepare('SELECT id, tahun_ajaran_id, santri_id FROM santri___syahriah_bayar WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Pembayaran tidak ditemukan']);
        }
        $stmt = $db->prepare('DELETE FROM santri___syahriah_bayar WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $this->realokasiSantri($db, (int) $row['tahun_ajaran_id'], (string) $row['santri_id']);
        return $this->jsonResponse($response, ['success' => true, 'message' => 'Pembayaran dihapus']);
    }

    public function previewAlokasi(Request $request, Response $response): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $data = $this->parseBody($request);
        $taId = (int) ($data['tahun_ajaran_id'] ?? 0);
        $santriId = trim((string) ($data['santri_id'] ?? ''));
        $nominal = (float) ($data['nominal'] ?? 0);
        if ($taId <= 0 || $santriId === '' || $nominal <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Data tidak lengkap']);
        }
        $db = Database::getInstance();
        $preview = $this->simulateAlokasi($db, $taId, $santriId, $nominal);
        return $this->jsonResponse($response, ['success' => true, 'data' => $preview]);
    }

    public function listKhusus(Request $request, Response $response): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $params = $request->getQueryParams();
        $taId = (int) ($params['tahun_ajaran_id'] ?? 0);
        $santriIdFilter = trim((string) ($params['santri_id'] ?? ''));
        $kelasIdsRaw = trim((string) ($params['kelas_ids'] ?? ''));
        $kelasIds = [];
        if ($kelasIdsRaw !== '') {
            foreach (preg_split('/[,\s]+/', $kelasIdsRaw) as $part) {
                $id = (int) trim($part);
                if ($id > 0) {
                    $kelasIds[$id] = $id;
                }
            }
            $kelasIds = array_values($kelasIds);
        }

        if ($taId <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'tahun_ajaran_id wajib', 'data' => []]);
        }

        $db = Database::getInstance();
        if (!$this->getTahunAjaran($db, $taId)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Tahun ajaran tidak ditemukan', 'data' => []]);
        }

        $bind = ['ta' => $taId];
        $sql = '
            SELECT k.id, k.tahun_ajaran_id, k.santri_id, k.nama, k.nominal, k.terakhir_pembayaran, k.keterangan, k.created_at,
                   s.nomer_induk, s.nama AS nama_santri,
                   sk.kelas_id, kl.nama_kelas, kl.kel,
                   COALESCE(SUM(b.nominal), 0) AS total_bayar,
                   COUNT(b.id) AS jumlah_bayar,
                   MAX(b.tanggal) AS tanggal_bayar_terakhir
            FROM santri___syahriah_khusus k
            INNER JOIN santri s ON s.id = k.santri_id
            LEFT JOIN santri___kelas sk ON sk.santri_id = s.id AND sk.tanggal_selesai IS NULL
            LEFT JOIN kelas kl ON kl.id = sk.kelas_id
            LEFT JOIN santri___syahriah_khusus_bayar b ON b.khusus_id = k.id
            WHERE k.tahun_ajaran_id = :ta
        ';
        if ($santriIdFilter !== '') {
            $sql .= ' AND k.santri_id = :sid';
            $bind['sid'] = $santriIdFilter;
        } elseif (!empty($kelasIds)) {
            $placeholders = [];
            foreach ($kelasIds as $i => $kid) {
                $key = 'kelas_' . $i;
                $placeholders[] = ':' . $key;
                $bind[$key] = $kid;
            }
            $sql .= ' AND sk.kelas_id IN (' . implode(',', $placeholders) . ')';
        }
        $sql .= '
            GROUP BY k.id, k.tahun_ajaran_id, k.santri_id, k.nama, k.nominal, k.terakhir_pembayaran, k.keterangan, k.created_at,
                     s.nomer_induk, s.nama, sk.kelas_id, kl.nama_kelas, kl.kel
            ORDER BY kl.nama_kelas ASC, kl.kel ASC, s.nama ASC, k.terakhir_pembayaran ASC, k.id ASC
        ';
        $stmt = $db->prepare($sql);
        $stmt->execute($bind);
        $rows = $stmt->fetchAll();

        $includeBayar = $santriIdFilter !== '';
        $bayarByKhusus = [];
        if ($includeBayar && $rows) {
            $ids = array_map(static fn($r) => (int) $r['id'], $rows);
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $stmtB = $db->prepare("
                SELECT b.id, b.khusus_id, b.nominal, b.tanggal, b.keterangan, b.via, b.pengurus_id, b.created_at,
                       p.nama AS pengurus_nama
                FROM santri___syahriah_khusus_bayar b
                LEFT JOIN pengurus p ON p.id = b.pengurus_id
                WHERE b.khusus_id IN ($placeholders)
                ORDER BY b.tanggal DESC, b.id DESC
            ");
            $stmtB->execute($ids);
            foreach ($stmtB->fetchAll() as $b) {
                $kid = (int) $b['khusus_id'];
                if (!isset($bayarByKhusus[$kid])) {
                    $bayarByKhusus[$kid] = [];
                }
                $bayarByKhusus[$kid][] = $b;
            }
        }

        foreach ($rows as &$r) {
            $wajib = (float) $r['nominal'];
            $terbayar = (float) $r['total_bayar'];
            $sisa = max(0, $wajib - $terbayar);
            $r['nominal'] = $wajib;
            $r['total_bayar'] = $terbayar;
            $r['jumlah_bayar'] = (int) $r['jumlah_bayar'];
            $r['sisa'] = $sisa;
            $r['sudah_bayar'] = $terbayar > 0;
            $r['lunas'] = $sisa <= 0.009;
            if ($includeBayar) {
                $r['bayar'] = $bayarByKhusus[(int) $r['id']] ?? [];
            }
        }
        unset($r);

        return $this->jsonResponse($response, ['success' => true, 'data' => $rows]);
    }

    public function batchKhusus(Request $request, Response $response): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $data = $this->parseBody($request);
        $taId = (int) ($data['tahun_ajaran_id'] ?? 0);
        $nama = trim((string) ($data['nama'] ?? ''));
        $nominal = (float) ($data['nominal'] ?? 0);
        $terakhir = trim((string) ($data['terakhir_pembayaran'] ?? ''));
        $keterangan = trim((string) ($data['keterangan'] ?? ''));
        $santriIds = $data['santri_ids'] ?? [];
        if (!is_array($santriIds)) {
            $santriIds = [];
        }
        $santriIds = array_values(array_unique(array_filter(array_map(static fn($id) => trim((string) $id), $santriIds))));

        if ($taId <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'tahun_ajaran_id wajib']);
        }
        if ($nama === '') {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Nama pembayaran wajib']);
        }
        if ($nominal <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Nominal wajib harus > 0']);
        }
        if ($terakhir === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $terakhir)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Tanggal terakhir pembayaran tidak valid']);
        }
        if (count($santriIds) === 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Pilih minimal satu santri']);
        }

        $db = Database::getInstance();
        if (!$this->getTahunAjaran($db, $taId)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Tahun ajaran tidak ditemukan']);
        }

        try {
            $db->beginTransaction();
            $stmt = $db->prepare('
                INSERT INTO santri___syahriah_khusus (tahun_ajaran_id, santri_id, nama, nominal, terakhir_pembayaran, keterangan)
                VALUES (:ta, :sid, :nama, :nominal, :deadline, :ket)
            ');
            $count = 0;
            foreach ($santriIds as $sid) {
                $stmt->execute([
                    'ta' => $taId,
                    'sid' => $sid,
                    'nama' => $nama,
                    'nominal' => $nominal,
                    'deadline' => $terakhir,
                    'ket' => $keterangan !== '' ? $keterangan : null,
                ]);
                $count++;
            }
            $db->commit();
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => "Pembayaran khusus ditambahkan ($count santri)",
            ]);
        } catch (\Exception $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            return $this->jsonResponse($response, ['success' => false, 'message' => $e->getMessage()]);
        }
    }

    public function deleteKhusus(Request $request, Response $response, array $args): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID wajib']);
        }
        $db = Database::getInstance();
        $stmt = $db->prepare('SELECT id FROM santri___syahriah_khusus WHERE id = :id');
        $stmt->execute(['id' => $id]);
        if (!$stmt->fetch()) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Pembayaran khusus tidak ditemukan']);
        }
        $stmt = $db->prepare('DELETE FROM santri___syahriah_khusus WHERE id = :id');
        $stmt->execute(['id' => $id]);
        return $this->jsonResponse($response, ['success' => true, 'message' => 'Pembayaran khusus dihapus']);
    }

    public function batchDeleteKhusus(Request $request, Response $response): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $data = $this->parseBody($request);
        $ids = $data['ids'] ?? [];
        if (!is_array($ids)) {
            $ids = [];
        }
        $ids = array_values(array_unique(array_filter(array_map(static fn($id) => (int) $id, $ids), static fn($id) => $id > 0)));
        if (count($ids) === 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Pilih minimal satu pembayaran khusus']);
        }

        $db = Database::getInstance();
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $db->prepare("DELETE FROM santri___syahriah_khusus WHERE id IN ($placeholders)");
        $stmt->execute($ids);
        $count = $stmt->rowCount();
        return $this->jsonResponse($response, [
            'success' => true,
            'message' => "Pembayaran khusus dihapus ($count)",
        ]);
    }

    public function batchUpdateKhusus(Request $request, Response $response): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $data = $this->parseBody($request);
        $ids = $data['ids'] ?? [];
        if (!is_array($ids)) {
            $ids = [];
        }
        $ids = array_values(array_unique(array_filter(array_map(static fn($id) => (int) $id, $ids), static fn($id) => $id > 0)));
        if (count($ids) === 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Pilih minimal satu pembayaran khusus']);
        }

        $hasNama = array_key_exists('nama', $data);
        $hasNominal = array_key_exists('nominal', $data);
        $hasDeadline = array_key_exists('terakhir_pembayaran', $data);
        $hasKet = array_key_exists('keterangan', $data);
        if (!$hasNama && !$hasNominal && !$hasDeadline && !$hasKet) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Tidak ada data yang diubah']);
        }

        $nama = $hasNama ? trim((string) $data['nama']) : null;
        $nominal = $hasNominal ? (float) $data['nominal'] : null;
        $terakhir = $hasDeadline ? trim((string) $data['terakhir_pembayaran']) : null;
        $keterangan = $hasKet ? trim((string) $data['keterangan']) : null;

        if ($hasNama && $nama === '') {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Nama pembayaran wajib']);
        }
        if ($hasNominal && ($nominal === null || $nominal <= 0)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Nominal wajib harus > 0']);
        }
        if ($hasDeadline && ($terakhir === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $terakhir))) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Tanggal terakhir pembayaran tidak valid']);
        }

        $db = Database::getInstance();
        $placeholders = implode(',', array_fill(0, count($ids), '?'));

        if ($hasNominal) {
            $stmtCheck = $db->prepare("
                SELECT k.id, k.nama, COALESCE(SUM(b.nominal), 0) AS total_bayar
                FROM santri___syahriah_khusus k
                LEFT JOIN santri___syahriah_khusus_bayar b ON b.khusus_id = k.id
                WHERE k.id IN ($placeholders)
                GROUP BY k.id, k.nama
            ");
            $stmtCheck->execute($ids);
            foreach ($stmtCheck->fetchAll() as $row) {
                if ((float) $row['total_bayar'] - (float) $nominal > 0.009) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Nominal baru lebih kecil dari yang sudah terbayar pada "' . $row['nama'] . '"',
                    ]);
                }
            }
        }

        $sets = [];
        $bind = [];
        if ($hasNama) {
            $sets[] = 'nama = :nama';
            $bind['nama'] = $nama;
        }
        if ($hasNominal) {
            $sets[] = 'nominal = :nominal';
            $bind['nominal'] = $nominal;
        }
        if ($hasDeadline) {
            $sets[] = 'terakhir_pembayaran = :deadline';
            $bind['deadline'] = $terakhir;
        }
        if ($hasKet) {
            $sets[] = 'keterangan = :ket';
            $bind['ket'] = $keterangan !== '' ? $keterangan : null;
        }

        try {
            $namedPlaceholders = [];
            $params = $bind;
            foreach ($ids as $idx => $id) {
                $key = 'id' . $idx;
                $namedPlaceholders[] = ':' . $key;
                $params[$key] = $id;
            }
            $sql = 'UPDATE santri___syahriah_khusus SET ' . implode(', ', $sets)
                . ' WHERE id IN (' . implode(',', $namedPlaceholders) . ')';
            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pembayaran khusus diperbarui (' . count($ids) . ')',
            ]);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, ['success' => false, 'message' => $e->getMessage()]);
        }
    }

    public function createKhususBayar(Request $request, Response $response): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $data = $this->parseBody($request);
        $khususId = (int) ($data['khusus_id'] ?? 0);
        $nominal = (float) ($data['nominal'] ?? 0);
        $tanggal = trim((string) ($data['tanggal'] ?? ''));
        $keterangan = trim((string) ($data['keterangan'] ?? ''));
        $via = strtolower(trim((string) ($data['via'] ?? 'cash')));
        if (!in_array($via, ['cash', 'tf'], true)) {
            $via = 'cash';
        }
        $pengurusId = $this->normalizeOptionalId($data['pengurus_id'] ?? null);

        if ($khususId <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'khusus_id wajib']);
        }
        if ($nominal <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Nominal pembayaran harus > 0']);
        }
        if ($pengurusId === null) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Pencatat (pengurus) wajib diisi']);
        }
        if ($tanggal === '') {
            $tanggal = $this->todayString();
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Format tanggal tidak valid']);
        }

        $db = Database::getInstance();
        $stmt = $db->prepare('
            SELECT k.id, k.tahun_ajaran_id, k.santri_id, k.nominal,
                   COALESCE(SUM(b.nominal), 0) AS total_bayar
            FROM santri___syahriah_khusus k
            LEFT JOIN santri___syahriah_khusus_bayar b ON b.khusus_id = k.id
            WHERE k.id = :id
            GROUP BY k.id, k.tahun_ajaran_id, k.santri_id, k.nominal
        ');
        $stmt->execute(['id' => $khususId]);
        $khusus = $stmt->fetch();
        if (!$khusus) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Pembayaran khusus tidak ditemukan']);
        }

        $sisa = max(0, (float) $khusus['nominal'] - (float) $khusus['total_bayar']);
        if ($sisa <= 0) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Pembayaran khusus ini sudah lunas',
            ]);
        }
        if ($nominal - $sisa > 0.009) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Nominal melebihi sisa pembayaran khusus (maksimal ' . number_format($sisa, 0, ',', '.') . ')',
            ]);
        }

        $stmtP = $db->prepare('SELECT id FROM pengurus WHERE id = :id');
        $stmtP->execute(['id' => $pengurusId]);
        if (!$stmtP->fetch()) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Pencatat tidak ditemukan']);
        }

        try {
            $stmt = $db->prepare('
                INSERT INTO santri___syahriah_khusus_bayar
                    (khusus_id, tahun_ajaran_id, santri_id, nominal, tanggal, keterangan, via, pengurus_id)
                VALUES (:kid, :ta, :sid, :nominal, :tanggal, :ket, :via, :pid)
            ');
            $stmt->execute([
                'kid' => $khususId,
                'ta' => (int) $khusus['tahun_ajaran_id'],
                'sid' => (string) $khusus['santri_id'],
                'nominal' => $nominal,
                'tanggal' => $tanggal,
                'ket' => $keterangan !== '' ? $keterangan : null,
                'via' => $via,
                'pid' => $pengurusId,
            ]);
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pembayaran khusus dicatat',
                'data' => ['bayar_id' => (int) $db->lastInsertId()],
            ]);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, ['success' => false, 'message' => $e->getMessage()]);
        }
    }

    public function deleteKhususBayar(Request $request, Response $response, array $args): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID wajib']);
        }
        $db = Database::getInstance();
        $stmt = $db->prepare('SELECT id FROM santri___syahriah_khusus_bayar WHERE id = :id');
        $stmt->execute(['id' => $id]);
        if (!$stmt->fetch()) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Pembayaran tidak ditemukan']);
        }
        $stmt = $db->prepare('DELETE FROM santri___syahriah_khusus_bayar WHERE id = :id');
        $stmt->execute(['id' => $id]);
        return $this->jsonResponse($response, ['success' => true, 'message' => 'Pembayaran dihapus']);
    }

    /**
     * Hapus alokasi lama, sebar ulang semua pembayaran santri di TA (FIFO per bayar).
     * @return array{saldo: float, alokasi_preview: array}
     */
    private function realokasiSantri(PDO $db, int $taId, string $santriId): array {
        $stmt = $db->prepare('
            SELECT id FROM santri___syahriah_bayar
            WHERE tahun_ajaran_id = :ta AND santri_id = :sid
            ORDER BY tanggal ASC, id ASC
        ');
        $stmt->execute(['ta' => $taId, 'sid' => $santriId]);
        $bayarIds = array_column($stmt->fetchAll(), 'id');

        if ($bayarIds) {
            $placeholders = implode(',', array_fill(0, count($bayarIds), '?'));
            $del = $db->prepare("DELETE FROM santri___syahriah_alokasi WHERE bayar_id IN ($placeholders)");
            $del->execute($bayarIds);
        }

        $wajibList = $this->getWajibOrdered($db, $taId, $santriId);
        $filled = [];
        foreach ($wajibList as $w) {
            $filled[(int) $w['id']] = 0.0;
        }

        $ins = $db->prepare('INSERT INTO santri___syahriah_alokasi (bayar_id, wajib_id, nominal) VALUES (:bid, :wid, :n)');
        $lastPreview = [];

        $stmt = $db->prepare('
            SELECT id, nominal FROM santri___syahriah_bayar
            WHERE tahun_ajaran_id = :ta AND santri_id = :sid
            ORDER BY tanggal ASC, id ASC
        ');
        $stmt->execute(['ta' => $taId, 'sid' => $santriId]);
        $bayars = $stmt->fetchAll();

        $totalBayar = 0.0;
        $totalAlokasi = 0.0;

        foreach ($bayars as $bayar) {
            $sisa = (float) $bayar['nominal'];
            $totalBayar += $sisa;
            $preview = [];
            foreach ($wajibList as $w) {
                if ($sisa <= 0) {
                    break;
                }
                $wid = (int) $w['id'];
                $kurang = (float) $w['nominal'] - $filled[$wid];
                if ($kurang <= 0) {
                    continue;
                }
                $ambil = min($sisa, $kurang);
                if ($ambil <= 0) {
                    continue;
                }
                $ins->execute(['bid' => $bayar['id'], 'wid' => $wid, 'n' => $ambil]);
                $filled[$wid] += $ambil;
                $sisa -= $ambil;
                $totalAlokasi += $ambil;
                $preview[] = [
                    'wajib_id' => $wid,
                    'bulan_hijri' => (int) $w['bulan_hijri'],
                    'tahun_hijri' => (int) $w['tahun_hijri'],
                    'nominal' => $ambil,
                ];
            }
            $lastPreview = $preview;
        }

        return [
            'saldo' => max(0, $totalBayar - $totalAlokasi),
            'alokasi_preview' => $lastPreview,
        ];
    }

    private function simulateAlokasi(PDO $db, int $taId, string $santriId, float $nominalBaru): array {
        $wajibList = $this->getWajibOrdered($db, $taId, $santriId);
        $stmt = $db->prepare('
            SELECT wajib_id, COALESCE(SUM(a.nominal), 0) AS terbayar
            FROM santri___syahriah_alokasi a
            INNER JOIN santri___syahriah_wajib w ON w.id = a.wajib_id
            WHERE w.tahun_ajaran_id = :ta AND w.santri_id = :sid
            GROUP BY wajib_id
        ');
        $stmt->execute(['ta' => $taId, 'sid' => $santriId]);
        $filled = [];
        foreach ($stmt->fetchAll() as $r) {
            $filled[(int) $r['wajib_id']] = (float) $r['terbayar'];
        }

        $sisa = $nominalBaru;
        $alokasi = [];
        foreach ($wajibList as $w) {
            if ($sisa <= 0) {
                break;
            }
            $wid = (int) $w['id'];
            $kurang = (float) $w['nominal'] - ($filled[$wid] ?? 0);
            if ($kurang <= 0) {
                continue;
            }
            $ambil = min($sisa, $kurang);
            $alokasi[] = [
                'wajib_id' => $wid,
                'bulan_hijri' => (int) $w['bulan_hijri'],
                'tahun_hijri' => (int) $w['tahun_hijri'],
                'nominal' => $ambil,
            ];
            $sisa -= $ambil;
        }
        return ['alokasi' => $alokasi, 'saldo' => max(0, $sisa)];
    }

    /** @return array<int, array> */
    private function getWajibOrdered(PDO $db, int $taId, string $santriId): array {
        $order = implode(',', self::BULAN_AKADEMIK);
        $stmt = $db->prepare("
            SELECT id, bulan_hijri, tahun_hijri, nominal
            FROM santri___syahriah_wajib
            WHERE tahun_ajaran_id = :ta AND santri_id = :sid AND nominal > 0
            ORDER BY FIELD(bulan_hijri, $order), tahun_hijri ASC
        ");
        $stmt->execute(['ta' => $taId, 'sid' => $santriId]);
        return $stmt->fetchAll();
    }

    /** @return list<array{bulan_hijri:int,tahun_hijri:int,urut:int}> */
    private function buildBulanList(int $tahunAwal): array {
        $list = [];
        $urut = 0;
        foreach (self::BULAN_AKADEMIK as $bulan) {
            $tahun = $bulan >= 11 ? $tahunAwal : $tahunAwal + 1;
            $list[] = [
                'bulan_hijri' => $bulan,
                'tahun_hijri' => $tahun,
                'urut' => $urut++,
            ];
        }
        return $list;
    }

    private function getTahunAjaran(PDO $db, int $id): ?array {
        if ($id <= 0) {
            return null;
        }
        $stmt = $db->prepare('SELECT id, tahun_hijri_awal, label, aktif FROM tahun_ajaran WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /** Sisa kewajiban syahriah santri di satu tahun ajaran (total wajib − teralokasi). */
    private function getSyahriahSisaTa(PDO $db, int $taId, string $santriId): float {
        $stmt = $db->prepare('
            SELECT w.nominal, COALESCE(SUM(a.nominal), 0) AS terbayar
            FROM santri___syahriah_wajib w
            LEFT JOIN santri___syahriah_alokasi a ON a.wajib_id = w.id
            WHERE w.tahun_ajaran_id = :ta AND w.santri_id = :sid AND w.nominal > 0
            GROUP BY w.id, w.nominal
        ');
        $stmt->execute(['ta' => $taId, 'sid' => $santriId]);
        $sisa = 0.0;
        foreach ($stmt->fetchAll() as $w) {
            $sisa += max(0, (float) $w['nominal'] - (float) $w['terbayar']);
        }
        return $sisa;
    }

    /** @return array{success:bool,message:string}|null */
    private function requireAdmin(Request $request, bool $fromBody = false): ?array {
        $params = $request->getQueryParams();
        $akses = (string) ($params['akses'] ?? '');
        // Body hanya dibaca jika query kosong dan caller meminta (hati-hati: stream body sekali)
        if ($akses === '' && $fromBody) {
            $data = $this->parseBody($request);
            $akses = (string) ($data['akses'] ?? '');
        }
        if (!$this->isAdminAkses($akses)) {
            return ['success' => false, 'message' => 'Akses ditolak (admin saja)'];
        }
        return null;
    }

    private function isAdminAkses(string $akses): bool {
        return in_array($akses, ['super_admin', 'admin'], true);
    }

    private function todayString(): string {
        return (new DateTimeImmutable('now', new DateTimeZone(self::TIMEZONE)))->format('Y-m-d');
    }

    private function normalizeOptionalId($value): ?string {
        if ($value === null || $value === '') {
            return null;
        }
        return (string) $value;
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
