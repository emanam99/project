<?php

declare(strict_types=1);

namespace App\Services;

use App\Database;

/**
 * Alur balasan otomatis untuk pesan WA masuk (webhook Node WA, WatZap, atau Evolution).
 */
final class WhatsAppInboundService
{
    /**
     * @param 'api_wa'|'evolution'|'watzap' $sumberMasuk sumber baris pesan masuk di DB (jejak audit)
     */
    public static function runAutomatedReplies(
        \PDO $db,
        string $nomorTujuan,
        string $message,
        ?string $jid,
        ?bool $incomingIsGroup,
        string $sumberMasuk = 'api_wa'
    ): void {
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
                'sumber' => $sumberMasuk,
            ];
            error_log('WhatsAppInboundService::runAutomatedReplies ' . ($replySource ?? 'auto_reply') . ' to ' . $nomorTujuan . ' len=' . strlen($reply) . ($jid ? ' jid=' . $jid : ''));
            $sendResult = WhatsAppService::sendMessage($nomorTujuan, $reply, null, $logContext, $jid);
            error_log('WhatsAppInboundService sendMessage success=' . ($sendResult['success'] ? '1' : '0') . ' msg=' . ($sendResult['message'] ?? ''));
        } else {
            error_log('WhatsAppInboundService: no auto reply. from=' . $nomorTujuan . ' preview=' . substr($message, 0, 60));
            if (!$skipOtherIncomingFlows) {
                error_log(
                    'WhatsAppInboundService hint: Menu interaktif tidak mengembalikan teks. '
                    . 'AI instansi butuh master aktif + terima semua + kuota valid.'
                );
            }
        }
    }

    /**
     * Simpan pesan masuk lalu jalankan alur balasan (satu entri DB).
     *
     * @param 'api_wa'|'evolution'|'watzap' $sumber
     * @return array{success: bool, message: string, id?: int}
     */
    public static function persistInboundAndRun(
        string $nomorTujuan,
        string $messageText,
        ?string $messageId,
        ?string $fromJid,
        ?bool $incomingIsGroup,
        string $sumber = 'api_wa'
    ): array {
        $db = Database::getInstance()->getConnection();

        if ($messageId !== null && $messageId !== '') {
            $stmt = $db->prepare('SELECT id FROM whatsapp WHERE arah = ? AND wa_message_id = ? LIMIT 1');
            $stmt->execute(['masuk', $messageId]);
            if ($stmt->fetch(\PDO::FETCH_ASSOC)) {
                return ['success' => true, 'message' => 'OK', 'duplicate' => true];
            }
        }

        $isiPesan = $messageText === '' ? '(tanpa teks)' : $messageText;
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
            $sumber,
            'terkirim',
        ]);
        $id = (int) $db->lastInsertId();
        error_log('WhatsAppInboundService::persistInbound id=' . $id . ' from=' . $nomorTujuan . ' sumber=' . $sumber);

        WhatsAppService::syncKontakLidFromIncomingMeta($nomorTujuan, $fromJid);
        self::runAutomatedReplies($db, $nomorTujuan, $messageText, $fromJid, $incomingIsGroup, $sumber);

        return ['success' => true, 'message' => 'OK', 'id' => $id];
    }
}
