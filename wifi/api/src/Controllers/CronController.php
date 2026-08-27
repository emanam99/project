<?php

namespace App\Controllers;

use App\Helpers\AuthHelper;
use App\Support\TagihanBerulang;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class CronController
{
    private function json(Response $response, array $payload, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }

    private function assertCronKey(Request $request): ?string
    {
        $params = $request->getQueryParams();
        $key = trim((string) ($params['key'] ?? ''));
        if ($key === '') {
            $auth = $request->getHeaderLine('Authorization');
            if (preg_match('/^Bearer\s+(\S+)$/i', $auth, $m)) {
                $key = trim($m[1]);
            }
        }
        $expected = trim((string) ($_ENV['TAGIHAN_CRON_KEY'] ?? ''));
        if ($expected === '') {
            return 'TAGIHAN_CRON_KEY belum dikonfigurasi di server';
        }
        if ($key === '' || !hash_equals($expected, $key)) {
            return 'Kunci cron tidak valid';
        }
        return null;
    }

    /**
     * GET|POST /cron/tagihan-bulanan?key=
     * Buat tagihan dari template berulang untuk bulan berjalan (idempotent).
     * Cron Hostinger: setiap tanggal 1. ?force=1 untuk uji di luar tgl 1.
     */
    public function tagihanBulanan(Request $request, Response $response): Response
    {
        if ($err = $this->assertCronKey($request)) {
            $status = str_contains($err, 'belum dikonfigurasi') ? 503 : 401;
            return $this->json($response, ['success' => false, 'message' => $err], $status);
        }

        $params = $request->getQueryParams();
        $force = in_array(strtolower((string) ($params['force'] ?? '')), ['1', 'true', 'yes'], true);
        $day = (int) (new \DateTimeImmutable('now'))->format('j');
        if ($day !== 1 && !$force) {
            return $this->json($response, [
                'success' => true,
                'skipped' => true,
                'message' => 'Bukan tanggal 1; lewati (pakai force=1 untuk uji)',
                'day' => $day,
            ]);
        }

        $bulan = (int) ($params['periode_bulan'] ?? 0);
        $tahun = (int) ($params['periode_tahun'] ?? 0);
        $now = new \DateTimeImmutable('now');
        if ($bulan < 1 || $bulan > 12) {
            $bulan = (int) $now->format('n');
        }
        if ($tahun < 2000) {
            $tahun = (int) $now->format('Y');
        }

        $result = TagihanBerulang::generateForPeriod($bulan, $tahun);
        return $this->json($response, [
            'success' => true,
            'message' => sprintf(
                'Periode %s: %d dibuat, %d dilewati',
                $result['periode'],
                $result['created'],
                $result['skipped']
            ),
            'data' => $result,
        ]);
    }
}
