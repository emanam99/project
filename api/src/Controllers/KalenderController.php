<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class KalenderController
{
    /** @var \PDO|null Lazy-initialized agar error koneksi tidak bikin 500 untuk action=today */
    private $db = null;

    public function __construct()
    {
        // Jangan panggil getConnection() di sini: jika DB gagal, constructor throw → 500.
        // Koneksi dipanggil di getDb() saat dipakai; jika gagal, get() catch dan return fallback untuk action=today.
    }

    private function getDb(): \PDO
    {
        if ($this->db === null) {
            $this->db = Database::getInstance()->getConnection();
        }
        return $this->db;
    }

    /**
     * GET /api/kalender?action=all|year|today|convert|convert_range|to_masehi
     * Public - tidak perlu auth.
     * - convert: Masehi → Hijriyah (tanggal=Y-m-d Masehi, optional waktu untuk setelah Maghrib).
     * - convert_range: Masehi → Hijriyah untuk range (tanggal_awal, tanggal_akhir Y-m-d). Satu panggilan untuk banyak tanggal.
     * - to_masehi: Hijriyah → Masehi (tanggal=Y-m-d Hijriyah).
     */
    public function get(Request $request, Response $response): Response
    {
        $params = $request->getQueryParams();
        $action = $params['action'] ?? 'all';

        // action=today: selalu return 200 (fallback jika DB/query gagal), agar frontend tidak dapat 500
        if ($action === 'today') {
            $tanggal = $params['tanggal'] ?? date('Y-m-d');
            $waktu = $params['waktu'] ?? date('H:i:s');
            try {
                return $this->getToday($response, $tanggal, $waktu);
            } catch (\Throwable $e) {
                error_log("Kalender getToday error: " . $e->getMessage());
                return $this->json($response, ['masehi' => $tanggal, 'hijriyah' => '0000-00-00', 'waktu' => $waktu]);
            }
        }

        try {
            if ($action === 'year' && isset($params['tahun'])) {
                return $this->getByYear($response, (int) $params['tahun'], $params['waktu'] ?? null);
            }
            if ($action === 'convert' && isset($params['tanggal'])) {
                return $this->convert($response, $params['tanggal'], $params['waktu'] ?? '00:00:00');
            }
            if ($action === 'convert_range' && isset($params['tanggal_awal']) && isset($params['tanggal_akhir'])) {
                return $this->convertRange($response, $params['tanggal_awal'], $params['tanggal_akhir'], $params['waktu'] ?? '00:00:00');
            }
            if ($action === 'to_masehi' && isset($params['tanggal'])) {
                return $this->hijriToMasehi($response, $params['tanggal']);
            }

            return $this->getAll($response, $params['waktu'] ?? null);
        } catch (\Throwable $e) {
            error_log("Kalender get error: " . $e->getMessage());
            return $this->json($response, ['error' => $e->getMessage()], 500);
        }
    }

    private function getAll(Response $response, ?string $waktu): Response
    {
        $sql = "SELECT k.* FROM psa___kalender k ORDER BY k.tahun, k.id_bulan";
        if ($waktu && $this->isAfterMaghrib($waktu)) {
            $sql = "SELECT k.*,
                    DATE_ADD(k.mulai, INTERVAL 1 DAY) as mulai_adj,
                    DATE_ADD(k.akhir, INTERVAL 1 DAY) as akhir_adj
                    FROM psa___kalender k
                    ORDER BY k.tahun, k.id_bulan";
        }
        $stmt = $this->getDb()->query($sql);
        $rows = $stmt ? $stmt->fetchAll(\PDO::FETCH_ASSOC) : [];
        return $this->json($response, $rows);
    }

    private function getByYear(Response $response, int $tahun, ?string $waktu): Response
    {
        $sql = "SELECT k.* FROM psa___kalender k WHERE k.tahun = ? ORDER BY k.id_bulan";
        if ($waktu && $this->isAfterMaghrib($waktu)) {
            $sql = "SELECT k.*,
                    DATE_ADD(k.mulai, INTERVAL 1 DAY) as mulai_adj,
                    DATE_ADD(k.akhir, INTERVAL 1 DAY) as akhir_adj
                    FROM psa___kalender k
                    WHERE k.tahun = ?
                    ORDER BY k.id_bulan";
        }
        $stmt = $this->getDb()->prepare($sql);
        $stmt->execute([$tahun]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        return $this->json($response, $rows);
    }

    private function getToday(Response $response, string $tanggal, string $waktu): Response
    {
        $safeFallback = ['masehi' => $tanggal, 'hijriyah' => '0000-00-00', 'waktu' => $waktu];
        try {
            $tanggalHijriyah = $tanggal;
            if ($this->isAfterMaghrib($waktu)) {
                $d = new \DateTime($tanggal);
                $d->add(new \DateInterval('P1D'));
                $tanggalHijriyah = $d->format('Y-m-d');
            }
            $stmt = $this->getDb()->prepare("SELECT tahun, id_bulan, mulai, akhir FROM psa___kalender WHERE mulai <= ? AND akhir >= ? LIMIT 1");
            $stmt->execute([$tanggalHijriyah, $tanggalHijriyah]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row || empty($row['mulai']) || empty($row['akhir'])) {
                return $this->json($response, $safeFallback);
            }
            $date1 = new \DateTime($row['mulai']);
            $date2 = new \DateTime($tanggalHijriyah);
            $diff = $date1->diff($date2)->days;
            $hijriyahTanggal = 1 + (int) $diff;
            $hijriyah = $row['tahun'] . '-' . str_pad((string) $row['id_bulan'], 2, '0', STR_PAD_LEFT) . '-' . str_pad((string) $hijriyahTanggal, 2, '0', STR_PAD_LEFT);
            return $this->json($response, ['masehi' => $tanggal, 'hijriyah' => $hijriyah, 'waktu' => $waktu]);
        } catch (\Throwable $e) {
            error_log("Kalender getToday error: " . $e->getMessage());
            return $this->json($response, $safeFallback);
        }
    }

    private function convert(Response $response, string $tanggal, string $waktu): Response
    {
        $tanggalHijriyah = $tanggal;
        if ($this->isAfterMaghrib($waktu)) {
            $d = new \DateTime($tanggal);
            $d->add(new \DateInterval('P1D'));
            $tanggalHijriyah = $d->format('Y-m-d');
        }
        $stmt = $this->getDb()->prepare("SELECT tahun, id_bulan, mulai, akhir FROM psa___kalender WHERE mulai <= ? AND akhir >= ? LIMIT 1");
        $stmt->execute([$tanggalHijriyah, $tanggalHijriyah]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            return $this->json($response, ['masehi' => $tanggal, 'hijriyah' => '0000-00-00', 'waktu' => $waktu]);
        }
        $date1 = new \DateTime($row['mulai']);
        $date2 = new \DateTime($tanggalHijriyah);
        $diff = $date1->diff($date2)->days;
        $hijriyahTanggal = 1 + $diff;
        $hijriyah = $row['tahun'] . '-' . str_pad($row['id_bulan'], 2, '0', STR_PAD_LEFT) . '-' . str_pad($hijriyahTanggal, 2, '0', STR_PAD_LEFT);
        return $this->json($response, ['masehi' => $tanggal, 'hijriyah' => $hijriyah, 'waktu' => $waktu]);
    }

    /**
     * Konversi range tanggal Masehi → Hijriyah dalam satu panggilan.
     * GET /api/kalender?action=convert_range&tanggal_awal=2025-03-01&tanggal_akhir=2025-03-31&waktu=00:00:00
     * Response: { data: { "2025-03-01": "1446-09-01", ... } }
     */
    private function convertRange(Response $response, string $tanggalAwal, string $tanggalAkhir, string $waktu): Response
    {
        $start = \DateTime::createFromFormat('Y-m-d', $tanggalAwal);
        $end = \DateTime::createFromFormat('Y-m-d', $tanggalAkhir);
        if (!$start || !$end || $start > $end) {
            return $this->json($response, ['data' => [], 'error' => 'tanggal_awal dan tanggal_akhir harus format Y-m-d dan awal <= akhir']);
        }
        $data = [];
        $stmt = $this->getDb()->prepare("SELECT tahun, id_bulan, mulai, akhir FROM psa___kalender WHERE mulai <= ? AND akhir >= ? LIMIT 1");
        $current = clone $start;
        $interval = new \DateInterval('P1D');
        while ($current <= $end) {
            $tanggal = $current->format('Y-m-d');
            $tanggalHijriyah = $tanggal;
            if ($this->isAfterMaghrib($waktu)) {
                $d = clone $current;
                $d->add(new \DateInterval('P1D'));
                $tanggalHijriyah = $d->format('Y-m-d');
            }
            $stmt->execute([$tanggalHijriyah, $tanggalHijriyah]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row && !empty($row['mulai']) && !empty($row['akhir'])) {
                $date1 = new \DateTime($row['mulai']);
                $date2 = new \DateTime($tanggalHijriyah);
                $diff = $date1->diff($date2)->days;
                $hijriyahTanggal = 1 + (int) $diff;
                $data[$tanggal] = $row['tahun'] . '-' . str_pad((string) $row['id_bulan'], 2, '0', STR_PAD_LEFT) . '-' . str_pad((string) $hijriyahTanggal, 2, '0', STR_PAD_LEFT);
            } else {
                $data[$tanggal] = '0000-00-00';
            }
            $current->add($interval);
        }
        return $this->json($response, ['data' => $data]);
    }

    /**
     * Konversi tanggal Hijriyah ke Masehi (public API).
     * GET /api/kalender?action=to_masehi&tanggal=1446-05-15 (format Y-m-d Hijriyah).
     */
    private function hijriToMasehi(Response $response, string $tanggalHijri): Response
    {
        $parts = explode('-', substr($tanggalHijri, 0, 10));
        if (count($parts) !== 3) {
            return $this->json($response, ['error' => 'Format tanggal Hijriyah harus Y-m-d (contoh: 1446-05-15)'], 400);
        }
        $tahun = (int) $parts[0];
        $bulan = (int) $parts[1];
        $hari = (int) $parts[2];
        if ($tahun < 1 || $bulan < 1 || $bulan > 12 || $hari < 1 || $hari > 30) {
            return $this->json($response, ['error' => 'Tanggal Hijriyah tidak valid'], 400);
        }
        $stmt = $this->getDb()->prepare("SELECT mulai, akhir FROM psa___kalender WHERE tahun = ? AND id_bulan = ? LIMIT 1");
        $stmt->execute([$tahun, $bulan]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            return $this->json($response, ['hijriyah' => $tanggalHijri, 'masehi' => null, 'error' => 'Data kalender untuk tahun/bulan tersebut tidak ditemukan']);
        }
        $mulai = new \DateTime($row['mulai']);
        $mulai->add(new \DateInterval('P' . ($hari - 1) . 'D'));
        $masehi = $mulai->format('Y-m-d');
        return $this->json($response, ['hijriyah' => $tanggalHijri, 'masehi' => $masehi]);
    }

    private function isAfterMaghrib(string $waktu): bool
    {
        $parts = explode(':', substr($waktu, 0, 5));
        $jam = (int) ($parts[0] ?? 0);
        $menit = (int) ($parts[1] ?? 0);
        return ($jam * 60 + $menit) >= (17 * 60 + 30);
    }

    /**
     * POST /api/kalender - bulk insert/update (admin_kalender only)
     */
    public function postBulk(Request $request, Response $response): Response
    {
        try {
            $body = $request->getBody()->getContents();
            $input = json_decode($body, true);
            if (!is_array($input)) {
                return $this->json($response, ['error' => 'Input harus array JSON'], 400);
            }
            $stmt = $this->getDb()->prepare("INSERT INTO psa___kalender (id, tahun, id_bulan, mulai, akhir) VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE mulai = VALUES(mulai), akhir = VALUES(akhir)");
            foreach ($input as $item) {
                $tahun = $item['tahun'] ?? null;
                $idBulan = $item['id_bulan'] ?? null;
                $mulai = $item['mulai'] ?? null;
                $akhir = $item['akhir'] ?? null;
                if (!$tahun || !$idBulan || !$mulai || !$akhir) {
                    continue;
                }
                $idBulan2 = str_pad((string) $idBulan, 2, '0', STR_PAD_LEFT);
                $id = $tahun . '-' . $idBulan2;
                $stmt->execute([$id, $tahun, $idBulan, $mulai, $akhir]);
            }
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'psa___kalender', 'bulk', null, ['count' => count(array_filter($input, fn($i) => !empty($i['tahun']) && !empty($i['id_bulan']) && !empty($i['mulai']) && !empty($i['akhir'])))], $request);
            }
            return $this->json($response, ['message' => 'Data kalender berhasil diproses.']);
        } catch (\Exception $e) {
            error_log("Kalender postBulk error: " . $e->getMessage());
            return $this->json($response, ['error' => $e->getMessage()], 500);
        }
    }

    private function json(Response $response, $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
