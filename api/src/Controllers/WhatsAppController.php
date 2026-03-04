<?php

namespace App\Controllers;

use App\Services\WhatsAppService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Controller pengiriman WA terpusat.
 * Sama dengan cara yang dipakai di UWABA (offcanvas kwitansi/biodata).
 * Semua kirim WA lewat backend agar menyatu di sini.
 */
class WhatsAppController
{
    /**
     * Kirim pesan WA.
     * POST /api/wa/send
     * Body: { "phoneNumber": "08xxx atau 62xxx", "message": "teks", "instance": "uwaba1" (opsional) }
     */
    public function send(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $phoneNumber = trim($data['phoneNumber'] ?? $data['phone_number'] ?? '');
            $message = $data['message'] ?? '';
            $instance = isset($data['instance']) ? trim($data['instance']) : null;

            if ($phoneNumber === '') {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WhatsApp harus diisi'], 400);
            }
            if ($message === '') {
                return $this->json($response, ['success' => false, 'message' => 'Pesan harus diisi'], 400);
            }

            $logContext = ['id_santri' => null, 'id_pengurus' => null, 'tujuan' => 'santri', 'id_pengurus_pengirim' => null, 'kategori' => 'custom', 'sumber' => 'api_wa'];
            $user = $request->getAttribute('user');
            if ($user !== null && (isset($user['id_pengurus']) || isset($user['pengurus_id']) || isset($user['id']))) {
                $logContext['id_pengurus_pengirim'] = (int) ($user['id_pengurus'] ?? $user['pengurus_id'] ?? $user['id']);
            }
            $data = $request->getParsedBody();
            if (isset($data['tujuan']) && in_array($data['tujuan'], ['pengurus', 'santri', 'wali_santri'], true)) {
                $logContext['tujuan'] = $data['tujuan'];
            }
            if (!empty($data['id_pengurus'])) {
                $logContext['id_pengurus'] = (int) $data['id_pengurus'];
            }
            if (!empty($data['id_santri'])) {
                $logContext['id_santri'] = (int) $data['id_santri'];
            }
            $result = WhatsAppService::sendMessage($phoneNumber, $message, $instance, $logContext);

            if ($result['success']) {
                return $this->json($response, [
                    'success' => true,
                    'message' => $result['message'] ?? 'Pesan berhasil dikirim',
                ], 200);
            }

            return $this->json($response, [
                'success' => false,
                'message' => $result['message'] ?? 'Gagal mengirim pesan',
            ], 502);
        } catch (\Exception $e) {
            error_log('WhatsAppController::send ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat mengirim pesan',
            ], 500);
        }
    }

    /**
     * Proses antrian WA pending (biodata_terdaftar yang menunggu NIS).
     * POST /api/wa/process-pending
     * Bisa dipanggil cron tiap 5–10 detik.
     */
    public function processPending(Request $request, Response $response): Response
    {
        try {
            $result = WhatsAppService::processPending();
            return $this->json($response, [
                'success' => (bool) ($result['success'] ?? true),
                'sent' => (int) ($result['sent'] ?? 0),
                'skipped' => (int) ($result['skipped'] ?? 0),
            ], 200);
        } catch (\Exception $e) {
            error_log('WhatsAppController::processPending ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal memproses antrian pending',
            ], 500);
        }
    }

    private function json(Response $response, array $data, int $status): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }
}
