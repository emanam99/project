<?php

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\AuthHelper;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class RekapController
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    private function json(Response $response, array $payload, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }

    /** GET /rekap — 1 baris per pelanggan (sum tagihan + sum bayar). */
    public function index(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::canManageData($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
        }

        $params = $request->getQueryParams();
        $bulan = (int) ($params['periode_bulan'] ?? 0);
        $tahun = (int) ($params['periode_tahun'] ?? 0);
        $status = trim((string) ($params['status'] ?? ''));
        $q = trim((string) ($params['q'] ?? ''));

        $sql = '
            SELECT
                p.id AS pelanggan_id,
                p.nama AS nama_pelanggan,
                p.no_hp,
                p.paket,
                COUNT(t.id) AS jumlah_tagihan,
                COALESCE(SUM(t.nominal), 0) AS nominal,
                COALESCE(SUM(COALESCE(bayar.total_bayar, 0)), 0) AS total_bayar,
                MIN(t.jatuh_tempo) AS jatuh_tempo,
                MIN(t.periode_bulan) AS periode_bulan,
                MIN(t.periode_tahun) AS periode_tahun
            FROM tagihan t
            INNER JOIN pelanggan p ON p.id = t.pelanggan_id
            LEFT JOIN (
                SELECT tagihan_id, SUM(nominal) AS total_bayar
                FROM tagihan_bayar
                GROUP BY tagihan_id
            ) bayar ON bayar.tagihan_id = t.id
            WHERE 1=1
        ';
        $bind = [];

        if ($bulan >= 1 && $bulan <= 12) {
            $sql .= ' AND t.periode_bulan = :bulan';
            $bind['bulan'] = $bulan;
        }
        if ($tahun > 0) {
            $sql .= ' AND t.periode_tahun = :tahun';
            $bind['tahun'] = $tahun;
        }
        if ($q !== '') {
            $sql .= ' AND (t.nama LIKE :q OR p.nama LIKE :q)';
            $bind['q'] = '%' . $q . '%';
        }

        $sql .= ' GROUP BY p.id, p.nama, p.no_hp, p.paket';

        if ($status === 'lunas') {
            $sql .= ' HAVING (COALESCE(SUM(t.nominal), 0) - COALESCE(SUM(COALESCE(bayar.total_bayar, 0)), 0)) <= 0.00001';
        } elseif ($status === 'belum') {
            $sql .= ' HAVING (COALESCE(SUM(t.nominal), 0) - COALESCE(SUM(COALESCE(bayar.total_bayar, 0)), 0)) > 0.00001';
        }

        $sql .= ' ORDER BY p.nama ASC';

        $stmt = $this->db->prepare($sql);
        $stmt->execute($bind);
        $rows = $stmt->fetchAll();

        $items = [];
        $totalKewajiban = 0.0;
        $totalTerbayar = 0.0;
        $totalSisa = 0.0;
        $jumlahLunas = 0;
        $jumlahBelum = 0;
        $jumlahTagihan = 0;

        foreach ($rows as $row) {
            $nominal = (float) $row['nominal'];
            $bayar = (float) $row['total_bayar'];
            $sisa = max(0, $nominal - $bayar);
            $lunas = $sisa <= 0.00001;
            $jml = (int) $row['jumlah_tagihan'];
            $totalKewajiban += $nominal;
            $totalTerbayar += $bayar;
            $totalSisa += $sisa;
            $jumlahTagihan += $jml;
            if ($lunas) {
                $jumlahLunas++;
            } else {
                $jumlahBelum++;
            }
            $items[] = [
                'pelanggan_id' => (int) $row['pelanggan_id'],
                'nama_pelanggan' => $row['nama_pelanggan'],
                'no_hp' => $row['no_hp'],
                'paket' => $row['paket'],
                'jumlah_tagihan' => $jml,
                'nominal' => $nominal,
                'total_bayar' => $bayar,
                'sisa' => $sisa,
                'lunas' => $lunas,
                'jatuh_tempo' => $row['jatuh_tempo'],
                'periode_bulan' => (int) $row['periode_bulan'],
                'periode_tahun' => (int) $row['periode_tahun'],
            ];
        }

        return $this->json($response, [
            'success' => true,
            'data' => [
                'items' => $items,
                'summary' => [
                    'jumlah_pelanggan' => count($items),
                    'jumlah_tagihan' => $jumlahTagihan,
                    'jumlah_lunas' => $jumlahLunas,
                    'jumlah_belum' => $jumlahBelum,
                    'total_kewajiban' => $totalKewajiban,
                    'total_terbayar' => $totalTerbayar,
                    'total_sisa' => $totalSisa,
                ],
            ],
        ]);
    }
}
