<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\AiAgentQuotaHelper;

/**
 * Konfirmasi / batalkan usulan agen lewat balasan WA (pengguna no_wa terverifikasi).
 * Menggantikan jawaban LLM palsu «sudah dikonfirmasi» tanpa mengeksekusi tool.
 */
final class AiAgentWaConfirmService
{
    /**
     * @return string|null Balasan WA jika ditangani; null = lanjut ke chat biasa
     */
    public static function tryHandleVerifiedUserMessage(\PDO $db, int $usersId, string $message): ?string
    {
        $jobs = new AiAgentJobRepository($db);
        if (!$jobs->tableExists()) {
            return null;
        }

        $job = $jobs->findLatestPendingForUser($usersId);
        if ($job === null) {
            return null;
        }

        $jobId = (int) ($job['id'] ?? 0);
        $intent = self::classifyReplyIntent($message);
        $summary = trim((string) ($job['summary_for_user'] ?? ''));

        if ($intent === 'affirm') {
            $res = AiAgentConfirmService::executeOwnedPendingJobForVerifiedWa($db, $usersId, $jobId);
            $reply = $res['message'];
            if ($res['ok']) {
                if ($summary !== '') {
                    $reply = 'Konfirmasi diterima. ' . $summary . ' — perubahan sudah diterapkan di sistem.';
                } else {
                    $reply = 'Konfirmasi diterima — perubahan sudah diterapkan di sistem.';
                }
            }
            self::persistWaAgentExchange($db, $usersId, $message, $reply);

            return $reply;
        }

        if ($intent === 'reject') {
            $res = AiAgentConfirmService::discardOwnedPendingJobForVerifiedWa($db, $usersId, $jobId);
            $reply = $res['ok']
                ? 'Usulan dibatalkan. Tidak ada perubahan yang disimpan.'
                : ($res['message'] ?? 'Gagal membatalkan usulan.');
            self::persistWaAgentExchange($db, $usersId, $message, $reply);

            return $reply;
        }

        return null;
    }

    /**
     * Blok peringatan untuk prompt LLM bila masih ada job pending (hindari konfirmasi palsu).
     */
    public static function buildPendingJobPromptBlock(\PDO $db, int $usersId): string
    {
        $jobs = new AiAgentJobRepository($db);
        if (!$jobs->tableExists()) {
            return '';
        }
        $job = $jobs->findLatestPendingForUser($usersId);
        if ($job === null) {
            return '';
        }
        $jobId = (int) ($job['id'] ?? 0);
        $summary = trim((string) ($job['summary_for_user'] ?? ''));
        $exp = trim((string) ($job['confirm_expires_at'] ?? ''));

        return '[PERINGATAN_SISTEM_AGEN] Pengguna punya usulan aksi menunggu konfirmasi (job_id='
            . $jobId
            . ($summary !== '' ? ', ringkasan: ' . $summary : '')
            . ($exp !== '' ? ', berlaku hingga: ' . $exp : '')
            . '). '
            . 'JANGAN mengatakan perubahan sudah dilakukan. '
            . 'Arahkan: tekan tombol Konfirmasi di aplikasi eBeddien, ATAU balas YA/SETUJU/KONFIRMASI di WhatsApp untuk mengeksekusi, atau TIDAK/BATAL untuk membatalkan. '
            . 'Balasan singkat seperti «iya» saja akan diproses server sebagai konfirmasi nyata, bukan oleh Anda.[/PERINGATAN_SISTEM_AGEN]';
    }

    /**
     * @return 'affirm'|'reject'|'neutral'
     */
    public static function classifyReplyIntent(string $message): string
    {
        $t = mb_strtolower(trim($message));
        if ($t === '') {
            return 'neutral';
        }
        $t = preg_replace('/\s+/u', ' ', $t) ?? $t;
        $t = trim($t, " \t\n\r\0\x0B.,!?\"'");

        if (preg_match('/^(tidak|nggak|gak|ga|batal|cancel|tolak|no|nope)\b/u', $t)) {
            return 'reject';
        }
        if (preg_match('/\b(tidak|batal|tolak)\s+(jadi|usul|aksi|ya)?\b/u', $t)) {
            return 'reject';
        }

        if (preg_match('/^(iya|ya|y|ok|oke|okay|setuju|konfirmasi|benar|lanjut|gas|yes|confirm)\b/u', $t)) {
            return 'affirm';
        }
        if (preg_match('/\b(ya|iya)\s+(konfirmasi|setuju)\b/u', $t)) {
            return 'affirm';
        }
        if (preg_match('/^konfirmasi(\s+(ya|iya))?\s*$/u', $t)) {
            return 'affirm';
        }

        return 'neutral';
    }

    private static function persistWaAgentExchange(\PDO $db, int $usersId, string $userMsg, string $reply): void
    {
        try {
            $disp = AiAgentUserHelper::fetchDisplay($db, $usersId);
            AiAgentQuotaHelper::persistAgentExchange(
                $db,
                $usersId,
                $disp['userName'],
                $disp['userEmail'],
                $userMsg,
                $reply . "\n[WA: konfirmasi agen]"
            );
        } catch (\Throwable $e) {
            error_log('AiAgentWaConfirmService::persistWaAgentExchange ' . $e->getMessage());
        }
    }
}
