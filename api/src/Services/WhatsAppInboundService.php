<?php

declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Helpers\AiAssistantReplyStyleHelper;
use App\Helpers\AuthWaFollowupHelper;

/**
 * Alur balasan otomatis untuk pesan WA masuk (webhook Node WA, WatZap, atau Evolution).
 */
final class WhatsAppInboundService
{
    /**
     * @param 'api_wa'|'evolution'|'watzap' $sumberMasuk sumber baris pesan masuk di DB (jejak audit)
     */
    /**
     * @param list<array{mime_type: string, data: string}> $attachments
     * @return array{immediate_ack?: string, immediate_jid?: string}
     */
    public static function runAutomatedReplies(
        \PDO $db,
        string $nomorTujuan,
        string $message,
        ?string $jid,
        ?bool $incomingIsGroup,
        string $sumberMasuk = 'api_wa',
        array $attachments = []
    ): array {
        $immediateAck = '';
        $reply = DaftarNotifFlow::handle($nomorTujuan, $message, $jid);
        $isDaftarNotif = $reply !== null && $reply !== '';
        $replySource = $isDaftarNotif ? 'daftar_notif' : null;
        $skipOtherIncomingFlows = $isDaftarNotif;
        $queuedAuthFollowup = false;
        if (!$skipOtherIncomingFlows) {
            $reply = DaftarSantriWaFlow::handle($nomorTujuan, $message, $jid);
            $notice = DaftarSantriWaFlow::takeImmediateNotice();
            if ($notice !== null && $notice !== '') {
                $immediateAck = $notice;
                $skipOtherIncomingFlows = true;
                $reply = null;
            } elseif ($reply !== null && $reply !== '') {
                $replySource = 'daftar_santri_wa';
                $tokenId = DaftarSantriWaFlow::lastHandledTokenId();
                if ($tokenId !== null && $tokenId > 0) {
                    AuthWaFollowupHelper::enqueue(
                        'daftar_santri_wa_tokens',
                        $tokenId,
                        $nomorTujuan,
                        $jid,
                        $reply,
                        AuthWaFollowupHelper::SOURCE_DAFTAR_SANTRI
                    );
                    $reply = null;
                    $replySource = null;
                    $queuedAuthFollowup = true;
                    $skipOtherIncomingFlows = true;
                }
            } elseif (DaftarSantriWaFlow::lastConsumed()) {
                $skipOtherIncomingFlows = true;
            }
        }
        if (!$skipOtherIncomingFlows && ($reply === null || $reply === '')) {
            $reply = MybeddianAuthWaFlow::handle($nomorTujuan, $message, $jid);
            if ($reply !== null && $reply !== '') {
                $replySource = 'mybeddian_auth_wa';
                $tokenId = MybeddianAuthWaFlow::lastHandledTokenId();
                if ($tokenId !== null && $tokenId > 0) {
                    $bind = MybeddianAuthWaFlow::peekPendingLinkBind();
                    AuthWaFollowupHelper::enqueue(
                        'mybeddian_auth_wa_tokens',
                        $tokenId,
                        $nomorTujuan,
                        $jid,
                        $reply,
                        AuthWaFollowupHelper::SOURCE_MYBEDDIEN,
                        is_array($bind) ? (string) ($bind['table'] ?? '') : null,
                        is_array($bind) ? (int) ($bind['id'] ?? 0) : null
                    );
                    $reply = null;
                    $replySource = null;
                    $queuedAuthFollowup = true;
                    $skipOtherIncomingFlows = true;
                }
            }
        }
        if (!$skipOtherIncomingFlows && ($reply === null || $reply === '')) {
            $reply = EbeddienDaftarWaFlow::handle($nomorTujuan, $message, $jid);
            if ($reply !== null && $reply !== '') {
                $replySource = 'ebeddien_daftar_wa';
            }
        }
        if (!$skipOtherIncomingFlows && ($reply === null || $reply === '')) {
            $reply = AiWhatsappBridgeService::tryHandle($db, $nomorTujuan, $message, $jid, $incomingIsGroup, $attachments);
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
            if (in_array($replySource, ['daftar_santri_wa', 'mybeddian_auth_wa'], true)) {
                $immediateAck = $reply;
            } else {
                $messageIds = self::sendAutomatedReplyText($nomorTujuan, $reply, $logContext, $jid, $replySource ?? 'auto_reply');
                if ($replySource === 'mybeddian_auth_wa' && $messageIds !== []) {
                    MybeddianAuthWaFlow::bindPendingLinkMessageId($messageIds[count($messageIds) - 1]);
                }
            }
        } elseif ($queuedAuthFollowup) {
            error_log('WhatsAppInboundService: auth followup diantrikan from=' . $nomorTujuan);
            if ($immediateAck === '') {
                $claimed = WhatsAppTemplates::claimPermintaanSedangDiprosesAck($db, $nomorTujuan);
                if ($claimed !== null && $claimed !== '') {
                    $immediateAck = $claimed;
                }
            }
        } else {
            error_log('WhatsAppInboundService: no auto reply. from=' . $nomorTujuan . ' preview=' . substr($message, 0, 60));
            if (!$skipOtherIncomingFlows) {
                error_log(
                    'WhatsAppInboundService hint: Menu interaktif tidak mengembalikan teks. '
                    . 'AI instansi butuh master aktif + terima semua + kuota valid.'
                );
            }
        }

        $out = [];
        if ($immediateAck !== '') {
            $out['immediate_ack'] = $immediateAck;
            if ($jid !== null && trim($jid) !== '') {
                $out['immediate_jid'] = trim($jid);
            }
        }

        return $out;
    }

    /**
     * Simpan pesan masuk lalu jalankan alur balasan (satu entri DB).
     *
     * @param 'api_wa'|'evolution'|'watzap' $sumber
     * @return array{success: bool, message: string, id?: int, immediate_ack?: string, immediate_jid?: string}
     */
    /**
     * @param list<array{mime_type: string, data: string}> $attachments
     */
    public static function persistInboundAndRun(
        string $nomorTujuan,
        string $messageText,
        ?string $messageId,
        ?string $fromJid,
        ?bool $incomingIsGroup,
        string $sumber = 'api_wa',
        array $attachments = []
    ): array {
        $db = Database::getInstance()->getConnection();

        if ($messageId !== null && $messageId !== '') {
            $stmt = $db->prepare('SELECT id FROM whatsapp WHERE arah = ? AND wa_message_id = ? LIMIT 1');
            $stmt->execute(['masuk', $messageId]);
            if ($stmt->fetch(\PDO::FETCH_ASSOC)) {
                if ($incomingIsGroup !== true && $fromJid !== null && trim($fromJid) !== '') {
                    AiWaInstansiSettingsService::upsertInboundContact($db, $fromJid, $nomorTujuan);
                }

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

        if ($incomingIsGroup !== true && $fromJid !== null && trim($fromJid) !== '') {
            AiWaInstansiSettingsService::upsertInboundContact($db, $fromJid, $nomorTujuan);
        }

        WhatsAppService::syncKontakLidFromIncomingMeta($nomorTujuan, $fromJid);
        $auto = self::runAutomatedReplies($db, $nomorTujuan, $messageText, $fromJid, $incomingIsGroup, $sumber, $attachments);

        return array_merge(['success' => true, 'message' => 'OK', 'id' => $id], $auto);
    }

    /**
     * Kirim satu atau beberapa pesan WA (AI bisa memisah dengan SPLIT_MARKER).
     *
     * @param array<string, mixed> $logContext
     * @return list<string> messageId yang berhasil dikirim (urutan sama dengan bagian)
     */
    public static function sendAutomatedReplyText(
        string $nomorTujuan,
        string $reply,
        array $logContext,
        ?string $jid,
        string $replySourceLabel = 'auto_reply'
    ): array {
        $parts = AiAssistantReplyStyleHelper::splitFormattedWhatsAppPayload($reply);
        if ($parts === []) {
            return [];
        }
        $messageIds = [];
        foreach ($parts as $i => $part) {
            $part = trim($part);
            if ($part === '') {
                continue;
            }
            error_log(
                'WhatsAppInboundService::sendAutomatedReplyText '
                . $replySourceLabel
                . ' to '
                . $nomorTujuan
                . ' part='
                . ($i + 1)
                . '/'
                . count($parts)
                . ' len='
                . strlen($part)
                . ($jid ? ' jid=' . $jid : '')
            );
            $sendResult = WhatsAppService::sendMessage($nomorTujuan, $part, null, $logContext, $jid);
            if (!empty($sendResult['success'])) {
                $mid = isset($sendResult['messageId']) ? trim((string) $sendResult['messageId']) : '';
                $messageIds[] = $mid !== '' ? $mid : 'ok';
            }
            error_log(
                'WhatsAppInboundService sendMessage success='
                . ($sendResult['success'] ? '1' : '0')
                . ' msg='
                . ($sendResult['message'] ?? '')
            );
            if ($i < count($parts) - 1) {
                // Flow daftar santri: jeda 2 detik antar pesan (sesuai spesifikasi)
                $delayUs = in_array($replySourceLabel, [
                    'daftar_santri_wa',
                    'mybeddian_auth_wa',
                    'nis_pengajuan_pemohon_diterima',
                ], true) ? 2000000 : 450000;
                usleep($delayUs);
            }
        }

        return $messageIds;
    }
}
