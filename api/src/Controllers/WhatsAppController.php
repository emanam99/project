<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use App\Services\AiWhatsappBridgeService;
use App\Services\DaftarNotifFlow;
use App\Services\EbeddienDaftarWaFlow;
use App\Services\WaInteractiveMenuService;
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
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            $phoneNumber = trim($data['phoneNumber'] ?? $data['phone_number'] ?? '');
            $message = TextSanitizer::cleanText($data['message'] ?? '');
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
                $payload = ['success' => true, 'message' => $result['message'] ?? 'Pesan berhasil dikirim'];
                if (!empty($result['messageId'])) {
                    $payload['messageId'] = $result['messageId'];
                }
                if (!empty($result['senderPhoneNumber'])) {
                    $payload['senderPhoneNumber'] = $result['senderPhoneNumber'];
                }
                return $this->json($response, $payload, 200);
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
     * Edit pesan WA yang sudah dikirim (hanya dalam 15 menit setelah kirim).
     * POST /api/wa/edit-message
     * Body: { "phoneNumber": "08xxx atau 62xxx", "messageId": "xxx", "newMessage": "teks baru" }
     */
    public function edit(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $phoneNumber = trim($data['phoneNumber'] ?? $data['phone_number'] ?? '');
            $messageId = isset($data['messageId']) ? trim((string) $data['messageId']) : '';
            $newMessage = $data['newMessage'] ?? $data['new_message'] ?? '';

            if ($phoneNumber === '') {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WhatsApp harus diisi'], 400);
            }
            if ($messageId === '') {
                return $this->json($response, ['success' => false, 'message' => 'messageId wajib'], 400);
            }
            if (trim((string) $newMessage) === '') {
                return $this->json($response, ['success' => false, 'message' => 'Isi pesan baru tidak boleh kosong'], 400);
            }

            $result = WhatsAppService::editMessage($phoneNumber, $messageId, (string) $newMessage);

            if ($result['success']) {
                $db = \App\Database::getInstance()->getConnection();
                $hasWaMessageId = $db->query("SHOW COLUMNS FROM whatsapp LIKE 'wa_message_id'")->rowCount() > 0;
                if ($hasWaMessageId) {
                    $stmt = $db->prepare("UPDATE whatsapp SET isi_pesan = ? WHERE wa_message_id = ? AND (arah = 'keluar' OR arah IS NULL)");
                    $stmt->execute([trim((string) $newMessage), $messageId]);
                }
                return $this->json($response, [
                    'success' => true,
                    'message' => $result['message'] ?? 'Pesan berhasil diedit',
                    'messageId' => $result['messageId'] ?? $messageId,
                ], 200);
            }

            return $this->json($response, [
                'success' => false,
                'message' => $result['message'] ?? 'Gagal mengedit pesan',
            ], 400);
        } catch (\Exception $e) {
            error_log('WhatsAppController::edit ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat mengedit pesan',
            ], 500);
        }
    }

    /**
     * Cek nomor WA (apakah terdaftar di WhatsApp).
     * POST /api/wa/check
     * Body: { "phoneNumber": "08xxx atau 62xxx", "sessionId": "default|wa2|..." (opsional) }
     */
    public function check(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $phoneNumber = trim($data['phoneNumber'] ?? $data['phone_number'] ?? '');
            $sessionId = isset($data['sessionId']) ? trim((string) $data['sessionId']) : (isset($data['session_id']) ? trim((string) $data['session_id']) : '');
            $sessionId = $sessionId !== '' ? $sessionId : null;

            if ($phoneNumber === '') {
                return $this->json($response, [
                    'success' => false,
                    'data' => ['phoneNumber' => '', 'isRegistered' => false],
                    'message' => 'Nomor WhatsApp harus diisi',
                ], 400);
            }

            $result = WhatsAppService::checkNumber($phoneNumber, $sessionId);

            // Selalu HTTP 200 bila respons terstruktur: axios/frontend membaca `success` di body.
            // Jangan pakai 502 di sini — itu untuk proxy/upstream HTTP; membingungkan klien dan
            // UI salah menampilkan "nomor tidak terdaftar" saat layanan WA/Node tidak terjangkau.
            return $this->json($response, [
                'success' => $result['success'],
                'data' => $result['data'] ?? ['phoneNumber' => WhatsAppService::formatPhoneNumber($phoneNumber), 'isRegistered' => false],
                'message' => $result['message'] ?? '',
            ], 200);
        } catch (\Exception $e) {
            error_log('WhatsAppController::check ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'data' => ['phoneNumber' => '', 'isRegistered' => false],
                'message' => 'Terjadi kesalahan saat mengecek nomor',
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

    /**
     * Terima pesan masuk dari WA (webhook). Public, tanpa auth. CSRF di-exclude di CsrfMiddleware.
     * WA mengirim ke sini dan kirim ulang sampai dapat 200. Simpan ke tabel whatsapp (arah=masuk).
     * POST /api/wa/incoming
     * Body: { "from": "62xxx", "message": "isi", "messageId": "optional" } — from bisa juga phoneNumber, phone_number; message bisa body, text.
     */
    public function incoming(Request $request, Response $response): Response
    {
        try {
            $rawBody = (string) $request->getBody();
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = json_decode($rawBody, true) ?? [];
            }
            if (!is_array($body)) {
                $body = [];
            }
            $from = trim((string) ($body['from'] ?? $body['phoneNumber'] ?? $body['phone_number'] ?? $body['sender'] ?? ''));
            $message = trim((string) ($body['message'] ?? $body['body'] ?? $body['text'] ?? $body['content'] ?? ''));
            $messageId = isset($body['messageId']) ? trim((string) $body['messageId']) : null;
            $canonicalNumber = trim((string) ($body['canonicalNumber'] ?? $body['canonical_number'] ?? $body['phone'] ?? ''));
            $fromJid = isset($body['from_jid']) ? trim((string) $body['from_jid']) : '';

            if ($from === '') {
                error_log('WhatsAppController::incoming rejected: from kosong. Body keys: ' . implode(',', array_keys($body)));
                return $this->json($response, ['success' => false, 'message' => 'from wajib'], 400);
            }

            $nomorFrom = WhatsAppService::normalizeWebhookFrom($from, $fromJid);
            if (strlen($nomorFrom) < 10) {
                error_log('WhatsAppController::incoming rejected: nomor tidak valid. from=' . substr($from, 0, 20));
                return $this->json($response, ['success' => false, 'message' => 'Nomor tidak valid'], 400);
            }
            // Untuk tampilan/riwayat: pakai nomor kanonik (62xxx asli) jika dikirim WA client (mis. dari getContactLidAndPhone), agar cocok dengan nomor pendaftar
            $nomorTujuan = $canonicalNumber !== ''
                ? WhatsAppService::normalizeWebhookDestination($canonicalNumber)
                : $nomorFrom;
            if (strlen($nomorTujuan) < 10) {
                $nomorTujuan = $nomorFrom;
            }

            $db = Database::getInstance()->getConnection();

            if ($messageId !== null && $messageId !== '') {
                $stmt = $db->prepare('SELECT id FROM whatsapp WHERE arah = ? AND wa_message_id = ? LIMIT 1');
                $stmt->execute(['masuk', $messageId]);
                if ($stmt->fetch(\PDO::FETCH_ASSOC)) {
                    return $this->json($response, ['success' => true, 'message' => 'OK'], 200);
                }
            }

            $isiPesan = $message === '' ? '(tanpa teks)' : $message;
            $stmt = $db->prepare(
                'INSERT INTO whatsapp (arah, nomor_tujuan, isi_pesan, wa_message_id, tujuan, kategori, sumber, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                'masuk',
                $nomorTujuan,
                $isiPesan,
                $messageId ?: null,
                'wali_santri',
                'incoming',
                'api_wa',
                'terkirim',
            ]);
            $id = (int) $db->lastInsertId();
            error_log('WhatsAppController::incoming saved id=' . $id . ' from=' . $nomorTujuan);

            $jid = $fromJid !== '' ? $fromJid : null;

            $incomingIsGroup = null;
            if (array_key_exists('is_group', $body)) {
                $incomingIsGroup = filter_var($body['is_group'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            } elseif (array_key_exists('isGroup', $body)) {
                $incomingIsGroup = filter_var($body['isGroup'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            }
            if ($incomingIsGroup === null && isset($body['chat_type'])) {
                $ct = strtolower(trim((string) $body['chat_type']));
                if (in_array($ct, ['group', 'grp', 'g'], true)) {
                    $incomingIsGroup = true;
                } elseif (in_array($ct, ['private', 'personal', 'direct', 'dm'], true)) {
                    $incomingIsGroup = false;
                }
            }
            if ($incomingIsGroup === null && $jid !== null && $jid !== '') {
                $jl = strtolower($jid);
                if (str_ends_with($jl, '@g.us')) {
                    $incomingIsGroup = true;
                }
            }

            // Jika provider mengirim chat @lid, simpan LID ke kontak agar pengiriman berikutnya bisa pakai chatId @lid.
            // Ini membantu kasus nomor sudah tersimpan tapi balasan/kirim berikutnya tidak sampai karena identitas chat berubah.
            WhatsAppService::syncKontakLidFromIncomingMeta($nomorTujuan, $jid);
            $reply = DaftarNotifFlow::handle($nomorTujuan, $message, $jid);
            $isDaftarNotif = $reply !== null && $reply !== '';
            $replySource = $isDaftarNotif ? 'daftar_notif' : null;
            $skipOtherIncomingFlows = $isDaftarNotif;
            if (!$skipOtherIncomingFlows) {
                $reply = EbeddienDaftarWaFlow::handle($nomorTujuan, $message, $jid);
                if ($reply !== null && $reply !== '') {
                    $replySource = 'ebeddien_daftar_wa';
                }
            }
            if (!$skipOtherIncomingFlows && ($reply === null || $reply === '')) {
                // AI instansi (master + terima semua): AI dulu, baru menu interaktif.
                $reply = AiWhatsappBridgeService::tryHandle($db, $nomorTujuan, $message, $jid, $incomingIsGroup);
                if ($reply !== null && $reply !== '') {
                    $replySource = 'ai_whatsapp';
                }
            }
            if (!$skipOtherIncomingFlows && ($reply === null || $reply === '')) {
                $reply = WaInteractiveMenuService::handle($nomorTujuan, $message, $jid);
                if ($reply !== null && $reply !== '') {
                    $replySource = 'wa_interactive_menu';
                }
            }
            if ($reply !== null && $reply !== '') {
                $logContext = [
                    'id_santri' => null,
                    'id_pengurus' => null,
                    'tujuan' => 'wali_santri',
                    'id_pengurus_pengirim' => null,
                    'kategori' => $replySource ?? 'custom',
                    'sumber' => 'api_wa',
                ];
                error_log('WhatsAppController::incoming ' . ($replySource ?? 'auto_reply') . ' reply to ' . $nomorTujuan . ' len=' . strlen($reply) . ($jid ? ' jid=' . $jid : ''));
                $sendResult = WhatsAppService::sendMessage($nomorTujuan, $reply, null, $logContext, $jid);
                error_log('WhatsAppController::incoming sendMessage result: success=' . ($sendResult['success'] ? '1' : '0') . ' msg=' . ($sendResult['message'] ?? ''));
            } else {
                error_log('WhatsAppController::incoming: no auto reply. from=' . $nomorTujuan . ' message_preview=' . substr($message, 0, 60));
                if (!$skipOtherIncomingFlows) {
                    error_log(
                        'WhatsAppController::incoming hint: Menu interaktif tidak mengembalikan teks (mati/tidak cocok). '
                        . 'AI instansi butuh master aktif + terima semua + kuota valid (lihat log AiWhatsappBridgeService).'
                    );
                }
            }

            return $this->json($response, ['success' => true, 'message' => 'OK', 'id' => $id], 200);
        } catch (\Throwable $e) {
            error_log('WhatsAppController::incoming ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan pesan masuk'], 500);
        }
    }

    /**
     * Update status pesan oleh WA server (message_ack). Public dengan validasi X-API-Key.
     * POST /api/wa/message-status
     * Header: X-API-Key (harus sama dengan WA_API_KEY di config/wa).
     * Body: { "messageId": "xxx", "status": "sent"|"delivered"|"read" }
     */
    public function messageStatus(Request $request, Response $response): Response
    {
        $apiKey = $request->getHeaderLine('X-API-Key');
        $config = require __DIR__ . '/../../config.php';
        $expectedKey = getenv('WA_API_KEY') ?: ($config['whatsapp']['api_key'] ?? '');
        if ($expectedKey === '' || $apiKey !== $expectedKey) {
            $response->getBody()->write(json_encode(['success' => false, 'message' => 'Unauthorized'], JSON_UNESCAPED_UNICODE));
            return $response->withStatus(401)->withHeader('Content-Type', 'application/json; charset=utf-8');
        }
        try {
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = json_decode((string) $request->getBody(), true) ?? [];
            }
            $messageId = trim((string) ($body['messageId'] ?? $body['message_id'] ?? ''));
            $status = trim((string) ($body['status'] ?? ''));
            if ($messageId === '') {
                return $this->json($response, ['success' => false, 'message' => 'messageId wajib'], 400);
            }
            if (!in_array($status, ['sent', 'delivered', 'read'], true)) {
                return $this->json($response, ['success' => false, 'message' => 'status harus sent, delivered, atau read'], 400);
            }
            $db = Database::getInstance()->getConnection();
            $hasWa = $db->query("SHOW TABLES LIKE 'whatsapp'")->rowCount() > 0;
            $hasWaMessageId = $hasWa && $db->query("SHOW COLUMNS FROM whatsapp LIKE 'wa_message_id'")->rowCount() > 0;
            if ($hasWaMessageId) {
                $stmt = $db->prepare("UPDATE whatsapp SET status = ? WHERE wa_message_id = ? AND (arah = 'keluar' OR arah IS NULL)");
                $stmt->execute([$status, $messageId]);
            }
            return $this->json($response, ['success' => true, 'message' => 'OK'], 200);
        } catch (\Throwable $e) {
            error_log('WhatsAppController::messageStatus ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal update status'], 500);
        }
    }

    /**
     * Hentikan stack WA di host: docker compose down (container mati & dihapus; bind mount whatsapp-sessions tetap).
     * Hanya jika WA_DOCKER_CONTROL_ENABLED + WA_DOCKER_COMPOSE_DIR di api/.env.
     */
    public function dockerStop(Request $request, Response $response): Response
    {
        try {
            if (!$this->waDockerControlEnabled()) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Kontrol Docker WA tidak diaktifkan. Set WA_DOCKER_CONTROL_ENABLED=true dan WA_DOCKER_COMPOSE_DIR di api/.env.',
                ], 503);
            }
            $dir = $this->resolveWaDockerComposeDir();
            if ($dir === null) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'WA_DOCKER_COMPOSE_DIR tidak valid atau tidak berisi docker-compose.yml.',
                ], 400);
            }
            $run = $this->runDockerCompose($dir, ['down', '--remove-orphans']);
            if (!$run['ok']) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Gagal menghentikan stack Docker WA: ' . ($run['output'] !== '' ? $run['output'] : ('kode keluar ' . $run['code'])),
                    'data' => ['exitCode' => $run['code']],
                ], 502);
            }

            return $this->json($response, [
                'success' => true,
                'message' => 'Stack Docker WA dihentikan (container off). Data sesi di volume host tetap; saat start, proses Node berjalan baru dari awal.',
                'data' => ['waEngineEnabled' => false],
            ], 200);
        } catch (\Throwable $e) {
            error_log('WhatsAppController::dockerStop ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan saat menghentikan Docker'], 500);
        }
    }

    /**
     * Jalankan ulang stack WA: docker compose up -d (container baru setelah down).
     */
    public function dockerStart(Request $request, Response $response): Response
    {
        try {
            if (!$this->waDockerControlEnabled()) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Kontrol Docker WA tidak diaktifkan. Set WA_DOCKER_CONTROL_ENABLED=true dan WA_DOCKER_COMPOSE_DIR di api/.env.',
                ], 503);
            }
            $dir = $this->resolveWaDockerComposeDir();
            if ($dir === null) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'WA_DOCKER_COMPOSE_DIR tidak valid atau tidak berisi docker-compose.yml.',
                ], 400);
            }
            $run = $this->runDockerCompose($dir, ['up', '-d', '--remove-orphans']);
            if (!$run['ok']) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Gagal menjalankan stack Docker WA: ' . ($run['output'] !== '' ? $run['output'] : ('kode keluar ' . $run['code'])),
                    'data' => ['exitCode' => $run['code']],
                ], 502);
            }

            return $this->json($response, [
                'success' => true,
                'message' => 'Stack Docker WA dijalankan kembali (container segar, sesi Baileys dari disk).',
                'data' => ['waEngineEnabled' => true],
            ], 200);
        } catch (\Throwable $e) {
            error_log('WhatsAppController::dockerStart ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan saat menjalankan Docker'], 500);
        }
    }

    private function waDockerControlEnabled(): bool
    {
        $v = getenv('WA_DOCKER_CONTROL_ENABLED');

        return $v === '1' || strcasecmp((string) $v, 'true') === 0;
    }

    /** @return non-falsy-string|null */
    private function resolveWaDockerComposeDir(): ?string
    {
        $raw = trim((string) (getenv('WA_DOCKER_COMPOSE_DIR') ?: ''));
        if ($raw === '') {
            return null;
        }
        $real = realpath($raw);
        if ($real === false || !is_dir($real)) {
            return null;
        }
        $yml = $real . DIRECTORY_SEPARATOR . 'docker-compose.yml';
        $yaml = $real . DIRECTORY_SEPARATOR . 'docker-compose.yaml';
        if (!is_file($yml) && !is_file($yaml)) {
            return null;
        }

        return $real;
    }

    /**
     * @param list<string> $composeArgs contoh: ['down','--remove-orphans']
     * @return array{ok: bool, code: int, output: string}
     */
    private function runDockerCompose(string $workDir, array $composeArgs): array
    {
        $timeout = (int) (getenv('WA_DOCKER_COMPOSE_TIMEOUT_SEC') ?: '180');
        if ($timeout < 30) {
            $timeout = 30;
        }
        if ($timeout > 600) {
            $timeout = 600;
        }

        $escapedPieces = [];
        foreach ($composeArgs as $a) {
            $escapedPieces[] = escapeshellarg((string) $a);
        }
        $dockerLine = 'docker compose ' . implode(' ', $escapedPieces) . ' 2>&1';

        $isWin = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
        if ($isWin) {
            $inner = 'cd /d ' . escapeshellarg($workDir) . ' && ' . $dockerLine;
            $command = 'cmd /C ' . escapeshellarg($inner);
        } else {
            $inner = 'cd ' . escapeshellarg($workDir) . ' && ' . $dockerLine;
            $command = 'sh -c ' . escapeshellarg($inner);
        }

        return $this->runShellCommand($command, $timeout);
    }

    /**
     * @return array{ok: bool, code: int, output: string}
     */
    private function runShellCommand(string $command, int $timeoutSec): array
    {
        $descriptorspec = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];
        $proc = @proc_open($command, $descriptorspec, $pipes, null, null);
        if (!is_resource($proc)) {
            return ['ok' => false, 'code' => -1, 'output' => 'Tidak bisa menjalankan perintah shell'];
        }
        fclose($pipes[0]);
        if (is_resource($pipes[1])) {
            stream_set_blocking($pipes[1], false);
        }
        if (is_resource($pipes[2])) {
            stream_set_blocking($pipes[2], false);
        }
        $output = '';
        $start = time();
        while (true) {
            $out1 = is_resource($pipes[1]) ? (string) stream_get_contents($pipes[1]) : '';
            $out2 = is_resource($pipes[2]) ? (string) stream_get_contents($pipes[2]) : '';
            $output .= $out1 . $out2;
            $st = proc_get_status($proc);
            if (!$st['running']) {
                break;
            }
            if (time() - $start > $timeoutSec) {
                proc_terminate($proc);
                if (is_resource($pipes[1])) {
                    fclose($pipes[1]);
                }
                if (is_resource($pipes[2])) {
                    fclose($pipes[2]);
                }
                proc_close($proc);

                return ['ok' => false, 'code' => -2, 'output' => trim($output) . "\n[timeout {$timeoutSec}s]"];
            }
            usleep(150000);
        }
        if (is_resource($pipes[1])) {
            fclose($pipes[1]);
        }
        if (is_resource($pipes[2])) {
            fclose($pipes[2]);
        }
        $code = proc_close($proc);

        return ['ok' => $code === 0, 'code' => $code, 'output' => trim($output)];
    }

    private function json(Response $response, array $data, int $status): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }
}
