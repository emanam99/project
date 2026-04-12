<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\PengurusHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Endpoint mesin absensi ZKTeco / iClock (HTTP push). Tanpa login JWT.
 * PIN pada mesin = NIP pengurus (pengurus.nip); disimpan sebagai id_pengurus (pengurus.id).
 *
 * Konfigurasi mesin: Server URL = {API_PUBLIC_URL}/api (api.alutsmani.id/api)  → mesin memanggil .../api/iclock/cdata
 * Opsional .env: ABSEN_FINGERPRINT_ALLOWED_SN=SN1,SN2 | ABSEN_FINGERPRINT_SECRET=... (&key=... di URL)
 */
class AbsenFingerprintController
{
    private function textResponse(Response $response, string $body, int $code = 200): Response
    {
        $response->getBody()->write($body);
        return $response
            ->withStatus($code)
            ->withHeader('Content-Type', 'text/plain; charset=utf-8');
    }

    /**
     * @return Response|null null jika lolos
     */
    private function gateRequest(Request $request, Response $response): ?Response
    {
        $config = require dirname(__DIR__, 2) . '/config.php';
        $cfg = $config['absen_fingerprint'] ?? [];
        $allowedSn = $cfg['allowed_serial_numbers'] ?? [];
        $params = $request->getQueryParams();
        $sn = isset($params['SN']) ? trim((string) $params['SN']) : '';

        if ($allowedSn !== [] && ($sn === '' || !in_array($sn, $allowedSn, true))) {
            error_log('absen_fingerprint: ditolak SN tidak diizinkan: ' . ($sn !== '' ? $sn : '(kosong)'));
            return $this->textResponse($response, "FAIL\n", 403);
        }

        $secret = (string) ($cfg['shared_secret'] ?? '');
        if ($secret !== '') {
            $key = isset($params['key']) ? (string) $params['key'] : '';
            if ($key === '') {
                $key = $request->getHeaderLine('X-Absen-Fingerprint-Key');
            }
            if ($key === '' || !hash_equals($secret, $key)) {
                error_log('absen_fingerprint: ditolak secret tidak cocok');
                return $this->textResponse($response, "FAIL\n", 403);
            }
        }

        return null;
    }

    /**
     * GET/POST /api/iclock/cdata — heartbeat / upload ATTLOG & OPERLOG (OPLOG).
     */
    public function cdata(Request $request, Response $response): Response
    {
        $deny = $this->gateRequest($request, $response);
        if ($deny !== null) {
            return $deny;
        }

        if ($request->getMethod() === 'GET') {
            return $this->textResponse($response, "OK\n");
        }

        $params = $request->getQueryParams();
        $table = isset($params['table']) ? trim((string) $params['table']) : '';
        $data = (string) $request->getBody()->getContents();

        $pdo = Database::getInstance()->getConnection();
        $inserted = 0;
        $skippedUnknownNip = 0;

        if ($table === 'ATTLOG' && $data !== '') {
            foreach (explode("\n", $data) as $line) {
                $line = trim($line);
                if ($line === '') {
                    continue;
                }
                $parts = explode("\t", $line);
                if (count($parts) < 3) {
                    continue;
                }
                $pinRaw = trim($parts[0]);
                $dateTime = trim($parts[1]);
                $statusCode = trim($parts[2]);
                $verified = (int) (trim($parts[3] ?? '0') ?: '0');
                $workCode = trim($parts[4] ?? '0') ?: '0';
                $statusText = ($statusCode === '0' || $statusCode === '') ? 'Masuk' : 'Keluar';

                $idPengurus = PengurusHelper::resolveIdByNip($pdo, $pinRaw);
                if ($idPengurus === null) {
                    $skippedUnknownNip++;
                    error_log("absen_fingerprint ATTLOG: NIP/PIN tidak ada di pengurus: {$pinRaw} @ {$dateTime}");
                    continue;
                }

                try {
                    // Kolom `timestamp` = waktu kejadian dari mesin (ATTLOG), bukan waktu server.
                    // `tanggal_dibuat` otomatis = saat baris masuk DB (metadata); UI & rekap mengutamakan timestamp.
                    $stmt = $pdo->prepare(
                        'INSERT INTO absen___pengurus (`timestamp`, id_pengurus, sumber_absen, id_absen_lokasi, status, verified, work_code, raw_data) VALUES (?, ?, \'sidik_jari\', NULL, ?, ?, ?, ?)'
                    );
                    $stmt->execute([$dateTime, $idPengurus, $statusText, $verified, $workCode, $line]);
                    $inserted++;
                } catch (\PDOException $e) {
                    error_log('absen_fingerprint INSERT ATTLOG: ' . $e->getMessage());
                }
            }
        } elseif ($table === 'OPERLOG' && $data !== '') {
            foreach (explode("\n", $data) as $line) {
                $line = trim($line);
                if ($line === '' || strpos($line, 'OPLOG') !== 0) {
                    continue;
                }
                $parts = explode("\t", $line);
                if (count($parts) < 4) {
                    continue;
                }
                $pinRaw = trim($parts[1]);
                $dateTime = trim($parts[2]);
                $status = trim($parts[3]);
                $verified = (int) (trim($parts[4] ?? '0') ?: '0');
                $workCode = trim($parts[5] ?? '0') ?: '0';

                $idPengurus = PengurusHelper::resolveIdByNip($pdo, $pinRaw);
                if ($idPengurus === null) {
                    $skippedUnknownNip++;
                    error_log("absen_fingerprint OPERLOG: NIP/PIN tidak ada di pengurus: {$pinRaw} @ {$dateTime}");
                    continue;
                }

                try {
                    $stmt = $pdo->prepare(
                        'INSERT INTO absen___pengurus (`timestamp`, id_pengurus, sumber_absen, id_absen_lokasi, status, verified, work_code, raw_data) VALUES (?, ?, \'sidik_jari\', NULL, ?, ?, ?, ?)'
                    );
                    $stmt->execute([$dateTime, $idPengurus, $status, $verified, $workCode, $line]);
                    $inserted++;
                } catch (\PDOException $e) {
                    error_log('absen_fingerprint INSERT OPERLOG: ' . $e->getMessage());
                }
            }
        }

        if ($inserted > 0 || $skippedUnknownNip > 0) {
            error_log("absen_fingerprint table={$table} inserted={$inserted} skipped_unknown_nip={$skippedUnknownNip}");
        }

        return $this->textResponse($response, "OK\n");
    }

    /**
     * GET /api/iclock/getrequest — polling mesin.
     */
    public function getrequest(Request $request, Response $response): Response
    {
        $deny = $this->gateRequest($request, $response);
        if ($deny !== null) {
            return $deny;
        }

        return $this->textResponse($response, "OK\n");
    }
}
