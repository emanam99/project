<?php

declare(strict_types=1);

namespace App\Helpers;

use App\Database;
use App\Services\MybeddianAuthWaFlow;
use App\Services\WhatsAppInboundService;
use App\Services\WhatsAppService;
use App\Services\WhatsAppTemplates;
use PDO;

/**
 * Antrian balasan handshake WA di luar webhook masuk (hindari deadlock Node↔PHP).
 * Jika link/username tidak terkirim dalam 15 menit, kirim pesan maaf + ajukan ulang.
 */
final class AuthWaFollowupHelper
{
    public const APOLOGY_MINUTES = 15;

    /** Satu flush mengirim sedikit baris; flush lain (user lain / interval) mengambil sisa. */
    private const FLUSH_BATCH = 5;

    /** Klaim stale (PHP mati di tengah kirim) boleh diambil worker lain. */
    private const CLAIM_STALE_MINUTES = 10;

    private const FLUSH_LOCK_NAME = 'ebeddien_auth_wa_followup_flush';

    /** Jangan kirim link yang sudah terlalu lama mengantri (hindari dump spam saat WA hidup lagi). */
    private const FOLLOWUP_MAX_AGE_SECONDS = 720;

    public const SOURCE_MYBEDDIEN = 'mybeddian_auth_wa';
    public const SOURCE_DAFTAR_SANTRI = 'daftar_santri_wa';

    /**
     * Simpan teks balasan (boleh SPLIT_MARKER) untuk dikirim setelah webhook selesai.
     */
    public static function enqueue(
        string $table,
        int $tokenId,
        string $nomor,
        ?string $jid,
        string $reply,
        string $source,
        ?string $bindTable = null,
        ?int $bindId = null
    ): void {
        $tokenId = (int) $tokenId;
        $reply = trim(WhatsAppTemplates::stripPermintaanSedangDiprosesAckPrefix($reply));
        if ($tokenId < 1 || $reply === '' || !self::isAllowedTable($table)) {
            return;
        }
        try {
            $db = Database::getInstance()->getConnection();
            if (!self::hasFollowupColumns($db, $table)) {
                return;
            }
            self::cancelSiblingQueues($db, $table, $tokenId, $nomor);
            $bindTable = $bindTable !== null && $bindTable !== '' ? $bindTable : null;
            $bindId = $bindId !== null && (int) $bindId > 0 ? (int) $bindId : null;
            $hasBindCols = $table === 'mybeddian_auth_wa_tokens'
                && $db->query("SHOW COLUMNS FROM `{$table}` LIKE 'followup_bind_table'")->rowCount() > 0;
            if ($hasBindCols) {
                $upd = $db->prepare(
                    "UPDATE `{$table}`
                     SET pending_followup = ?,
                         followup_jid = ?,
                         followup_source = ?,
                         apology_after = DATE_ADD(NOW(), INTERVAL ? MINUTE),
                         followup_bind_table = ?,
                         followup_bind_id = ?
                     WHERE id = ? AND followup_sent_at IS NULL"
                );
                $upd->execute([
                    $reply,
                    $jid !== null && $jid !== '' ? $jid : null,
                    $source,
                    self::APOLOGY_MINUTES,
                    $bindTable,
                    $bindId,
                    $tokenId,
                ]);
            } else {
                $upd = $db->prepare(
                    "UPDATE `{$table}`
                     SET pending_followup = ?,
                         followup_jid = ?,
                         followup_source = ?,
                         apology_after = DATE_ADD(NOW(), INTERVAL ? MINUTE)
                     WHERE id = ? AND followup_sent_at IS NULL"
                );
                $upd->execute([
                    $reply,
                    $jid !== null && $jid !== '' ? $jid : null,
                    $source,
                    self::APOLOGY_MINUTES,
                    $tokenId,
                ]);
            }
        } catch (\Throwable $e) {
            error_log('AuthWaFollowupHelper::enqueue ' . $e->getMessage());
        }
    }

    /**
     * Kirim antrian follow-up, lalu pesan maaf yang sudah lewat 15 menit.
     *
     * @return array{followup_sent: int, apology_sent: int}
     */
    public static function flush(): array
    {
        $followupSent = 0;
        $apologySent = 0;
        $db = null;
        $locked = false;
        try {
            $db = Database::getInstance()->getConnection();
            $lockStmt = $db->query('SELECT GET_LOCK(' . $db->quote(self::FLUSH_LOCK_NAME) . ', 0)');
            $locked = $lockStmt !== false && (int) $lockStmt->fetchColumn() === 1;
            if (!$locked) {
                return ['followup_sent' => 0, 'apology_sent' => 0];
            }
            self::expireStalePending($db, 'mybeddian_auth_wa_tokens');
            self::expireStalePending($db, 'daftar_santri_wa_tokens');
            $followupSent += self::flushTable($db, 'mybeddian_auth_wa_tokens', self::SOURCE_MYBEDDIEN);
            $followupSent += self::flushTable($db, 'daftar_santri_wa_tokens', self::SOURCE_DAFTAR_SANTRI);
            $apologySent += self::flushApologies($db, 'mybeddian_auth_wa_tokens', self::SOURCE_MYBEDDIEN);
            $apologySent += self::flushApologies($db, 'daftar_santri_wa_tokens', self::SOURCE_DAFTAR_SANTRI);
        } catch (\Throwable $e) {
            error_log('AuthWaFollowupHelper::flush ' . $e->getMessage());
        } finally {
            if ($locked && $db instanceof PDO) {
                try {
                    $db->query('SELECT RELEASE_LOCK(' . $db->quote(self::FLUSH_LOCK_NAME) . ')');
                } catch (\Throwable $e) {
                    error_log('AuthWaFollowupHelper::flush unlock ' . $e->getMessage());
                }
            }
        }

        return ['followup_sent' => $followupSent, 'apology_sent' => $apologySent];
    }

    public static function pesanMaafAjukanUlang(string $source): string
    {
        $app = $source === self::SOURCE_DAFTAR_SANTRI ? 'aplikasi pendaftaran' : 'aplikasi myBeddien';

        return "Terjadi kesalahan di server kami.\n\n"
            . "Mohon maaf atas ketidaknyamanannya.\n\n"
            . "Silakan ajukan ulang permintaan ini dari {$app}.";
    }

    private static function flushTable(PDO $db, string $table, string $defaultSource): int
    {
        if (!self::hasFollowupColumns($db, $table)) {
            return 0;
        }
        $claim = self::newClaimToken();
        $useClaim = self::hasClaimColumns($db, $table);
        if ($useClaim) {
            $claimed = self::claimRows(
                $db,
                $table,
                $claim,
                "pending_followup IS NOT NULL
                   AND TRIM(pending_followup) <> ''
                   AND followup_sent_at IS NULL
                   AND apology_sent_at IS NULL
                   AND (apology_after IS NULL OR apology_after > NOW())
                   AND (wa_verified_at IS NULL OR wa_verified_at >= DATE_SUB(NOW(), INTERVAL " . self::FOLLOWUP_MAX_AGE_SECONDS . ' SECOND))'
            );
            if ($claimed === 0) {
                return 0;
            }
        }
        $hasBindCols = $table === 'mybeddian_auth_wa_tokens'
            && $db->query("SHOW COLUMNS FROM `{$table}` LIKE 'followup_bind_table'")->rowCount() > 0;
        $bindSelect = $hasBindCols ? ', followup_bind_table, followup_bind_id' : '';
        if ($useClaim) {
            $stmt = $db->prepare(
                "SELECT id, no_wa, sender_wa, pending_followup, followup_jid, followup_source{$bindSelect}
                 FROM `{$table}`
                 WHERE followup_claim = ?
                 ORDER BY id ASC"
            );
            $stmt->execute([$claim]);
        } else {
            $stmt = $db->query(
                "SELECT id, no_wa, sender_wa, pending_followup, followup_jid, followup_source{$bindSelect}
                 FROM `{$table}`
                 WHERE pending_followup IS NOT NULL
                   AND TRIM(pending_followup) <> ''
                   AND followup_sent_at IS NULL
                   AND apology_sent_at IS NULL
                   AND (apology_after IS NULL OR apology_after > NOW())
                   AND (wa_verified_at IS NULL OR wa_verified_at >= DATE_SUB(NOW(), INTERVAL " . self::FOLLOWUP_MAX_AGE_SECONDS . " SECOND))
                 ORDER BY id ASC
                 LIMIT " . self::FLUSH_BATCH
            );
        }
        $sent = 0;
        $sentNomor = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $id = (int) ($row['id'] ?? 0);
            $nomor = WhatsAppService::formatPhoneNumber((string) ($row['sender_wa'] ?: $row['no_wa'] ?? ''));
            $reply = WhatsAppTemplates::stripPermintaanSedangDiprosesAckPrefix(trim((string) ($row['pending_followup'] ?? '')));
            $jid = isset($row['followup_jid']) && trim((string) $row['followup_jid']) !== ''
                ? trim((string) $row['followup_jid'])
                : null;
            $source = trim((string) ($row['followup_source'] ?? '')) ?: $defaultSource;
            if ($id < 1 || strlen($nomor) < 8) {
                self::dropPendingRow($db, $table, $id, $claim, $useClaim, false);
                continue;
            }
            if ($reply === '') {
                self::dropPendingRow($db, $table, $id, $claim, $useClaim, true);
                continue;
            }
            if (isset($sentNomor[$nomor])) {
                self::dropPendingRow($db, $table, $id, $claim, $useClaim, true);
                continue;
            }
            $logContext = [
                'id_santri' => null,
                'id_pengurus' => null,
                'tujuan' => 'wali_santri',
                'id_pengurus_pengirim' => null,
                'kategori' => $source,
                'sumber' => 'auth_wa_followup',
            ];
            $parts = array_values(array_filter(
                AiAssistantReplyStyleHelper::splitFormattedWhatsAppPayload($reply),
                static fn (string $part): bool => trim($part) !== ''
            ));
            $expectedParts = count($parts);
            $ids = WhatsAppInboundService::sendAutomatedReplyText($nomor, $reply, $logContext, $jid, $source);
            if ($ids === [] || ($expectedParts > 0 && count($ids) < $expectedParts)) {
                error_log("AuthWaFollowupHelper: followup gagal table={$table} id={$id} to={$nomor} parts=" . count($ids) . "/{$expectedParts}");
                self::releaseClaim($db, $table, $id, $claim);
                if (count($ids) > 0 && $expectedParts > count($ids)) {
                    $remain = array_slice($parts, count($ids));
                    $remainText = implode("\n" . AiAssistantReplyStyleHelper::SPLIT_MARKER . "\n", $remain);
                    $db->prepare("UPDATE `{$table}` SET pending_followup = ? WHERE id = ?")->execute([$remainText, $id]);
                }
                continue;
            }
            $usedAtSql = $table === 'mybeddian_auth_wa_tokens' ? ', used_at = COALESCE(used_at, NOW())' : '';
            if ($useClaim) {
                $db->prepare(
                    "UPDATE `{$table}`
                     SET followup_sent_at = NOW(), pending_followup = NULL, followup_claim = NULL, followup_claimed_at = NULL{$usedAtSql}
                     WHERE id = ? AND followup_claim = ?"
                )->execute([$id, $claim]);
            } else {
                $db->prepare(
                    "UPDATE `{$table}` SET followup_sent_at = NOW(), pending_followup = NULL{$usedAtSql} WHERE id = ?"
                )->execute([$id]);
            }
            self::settleOtherRowsForNumber($db, $table, $nomor, $id);
            if ($source === self::SOURCE_MYBEDDIEN) {
                $lastId = (string) ($ids[count($ids) - 1] ?? '');
                if ($lastId !== '' && $lastId !== 'ok') {
                    MybeddianAuthWaFlow::bindLinkMessageId(
                        (string) ($row['followup_bind_table'] ?? ''),
                        (int) ($row['followup_bind_id'] ?? 0),
                        $lastId
                    );
                }
            }
            $sentNomor[$nomor] = true;
            $sent++;
        }

        return $sent;
    }

    private static function flushApologies(PDO $db, string $table, string $defaultSource): int
    {
        if (!self::hasFollowupColumns($db, $table)) {
            return 0;
        }
        $claim = self::newClaimToken();
        $useClaim = self::hasClaimColumns($db, $table);
        if ($useClaim) {
            $claimed = self::claimRows(
                $db,
                $table,
                $claim,
                "wa_verified_at IS NOT NULL
                   AND followup_sent_at IS NULL
                   AND apology_sent_at IS NULL
                   AND apology_after IS NOT NULL
                   AND apology_after <= NOW()"
            );
            if ($claimed === 0) {
                return 0;
            }
            $stmt = $db->prepare(
                "SELECT id, no_wa, sender_wa, followup_jid, followup_source
                 FROM `{$table}`
                 WHERE followup_claim = ?
                 ORDER BY id ASC"
            );
            $stmt->execute([$claim]);
        } else {
            $stmt = $db->query(
                "SELECT id, no_wa, sender_wa, followup_jid, followup_source
                 FROM `{$table}`
                 WHERE wa_verified_at IS NOT NULL
                   AND followup_sent_at IS NULL
                   AND apology_sent_at IS NULL
                   AND apology_after IS NOT NULL
                   AND apology_after <= NOW()
                 ORDER BY id ASC
                 LIMIT " . self::FLUSH_BATCH
            );
        }
        $sent = 0;
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $id = (int) ($row['id'] ?? 0);
            $nomor = WhatsAppService::formatPhoneNumber((string) ($row['sender_wa'] ?: $row['no_wa'] ?? ''));
            $jid = isset($row['followup_jid']) && trim((string) $row['followup_jid']) !== ''
                ? trim((string) $row['followup_jid'])
                : null;
            $source = trim((string) ($row['followup_source'] ?? '')) ?: $defaultSource;
            if ($id < 1 || strlen($nomor) < 8) {
                self::releaseClaim($db, $table, $id, $claim);
                continue;
            }
            if (self::numberAlreadyReceivedFollowup($db, $table, $nomor)
                || self::recentAuthFollowupLogged($db, $nomor, 15)) {
                self::suppressApologyRow($db, $table, $id, $claim, $useClaim);
                continue;
            }
            $logContext = [
                'id_santri' => null,
                'id_pengurus' => null,
                'tujuan' => 'wali_santri',
                'id_pengurus_pengirim' => null,
                'kategori' => $source . '_apology',
                'sumber' => 'auth_wa_apology',
            ];
            $result = WhatsAppService::sendMessage($nomor, self::pesanMaafAjukanUlang($source), null, $logContext, $jid);
            if (empty($result['success'])) {
                error_log("AuthWaFollowupHelper: apology gagal table={$table} id={$id} to={$nomor} msg=" . ($result['message'] ?? ''));
                self::releaseClaim($db, $table, $id, $claim);
                continue;
            }
            if ($useClaim) {
                $db->prepare(
                    "UPDATE `{$table}`
                     SET apology_sent_at = NOW(), pending_followup = NULL, followup_claim = NULL, followup_claimed_at = NULL
                     WHERE id = ? AND followup_claim = ?"
                )->execute([$id, $claim]);
            } else {
                $db->prepare(
                    "UPDATE `{$table}` SET apology_sent_at = NOW(), pending_followup = NULL WHERE id = ?"
                )->execute([$id]);
            }
            $sent++;
        }

        return $sent;
    }

    private static function dropPendingRow(PDO $db, string $table, int $id, string $claim, bool $useClaim, bool $markSent): void
    {
        if ($id < 1) {
            return;
        }
        if ($markSent) {
            if ($useClaim) {
                $db->prepare(
                    "UPDATE `{$table}`
                     SET pending_followup = NULL, followup_sent_at = NOW(), followup_claim = NULL, followup_claimed_at = NULL
                     WHERE id = ? AND followup_claim = ?"
                )->execute([$id, $claim]);
            } else {
                $db->prepare(
                    "UPDATE `{$table}` SET pending_followup = NULL, followup_sent_at = NOW() WHERE id = ?"
                )->execute([$id]);
            }

            return;
        }
        self::releaseClaim($db, $table, $id, $claim);
        $db->prepare("UPDATE `{$table}` SET pending_followup = NULL WHERE id = ?")->execute([$id]);
    }

    /**
     * Batalkan antrian link lain untuk nomor yang sama — hanya token terbaru yang dikirim.
     */
    private static function cancelSiblingQueues(PDO $db, string $table, int $keepId, string $nomor): void
    {
        $nomor = WhatsAppService::formatPhoneNumber($nomor);
        if ($keepId < 1 || $nomor === '') {
            return;
        }
        $claimSql = self::hasClaimColumns($db, $table)
            ? ', followup_claim = NULL, followup_claimed_at = NULL'
            : '';
        $stmt = $db->prepare(
            "UPDATE `{$table}`
             SET pending_followup = NULL, apology_after = NULL, apology_sent_at = COALESCE(apology_sent_at, NOW()){$claimSql}
             WHERE id <> ?
               AND followup_sent_at IS NULL
               AND apology_sent_at IS NULL
               AND (no_wa = ? OR sender_wa = ?)"
        );
        $stmt->execute([$keepId, $nomor, $nomor]);
    }

    /**
     * Buang link yang sudah terlalu lama mengantri (tanpa dikirim). Pesan maaf 15 menit tetap jalan.
     */
    private static function expireStalePending(PDO $db, string $table): void
    {
        if (!self::hasFollowupColumns($db, $table)) {
            return;
        }
        $age = self::FOLLOWUP_MAX_AGE_SECONDS;
        $claimSql = self::hasClaimColumns($db, $table)
            ? ', followup_claim = NULL, followup_claimed_at = NULL'
            : '';
        $db->exec(
            "UPDATE `{$table}`
             SET pending_followup = NULL{$claimSql}
             WHERE pending_followup IS NOT NULL
               AND followup_sent_at IS NULL
               AND apology_sent_at IS NULL
               AND wa_verified_at IS NOT NULL
               AND wa_verified_at < DATE_SUB(NOW(), INTERVAL {$age} SECOND)"
        );
    }

    /**
     * Token lain untuk nomor yang sama: jangan kirim link/maaf lagi.
     */
    private static function settleOtherRowsForNumber(PDO $db, string $table, string $nomor, int $keepId): void
    {
        $nomor = WhatsAppService::formatPhoneNumber($nomor);
        if ($nomor === '' || $keepId < 1) {
            return;
        }
        $claimSql = self::hasClaimColumns($db, $table)
            ? ', followup_claim = NULL, followup_claimed_at = NULL'
            : '';
        $db->prepare(
            "UPDATE `{$table}`
             SET pending_followup = NULL,
                 followup_sent_at = COALESCE(followup_sent_at, NOW()),
                 apology_after = NULL,
                 apology_sent_at = COALESCE(apology_sent_at, NOW()){$claimSql}
             WHERE id <> ?
               AND followup_sent_at IS NULL
               AND (no_wa = ? OR sender_wa = ?)"
        )->execute([$keepId, $nomor, $nomor]);
    }

    private static function numberAlreadyReceivedFollowup(PDO $db, string $table, string $nomor): bool
    {
        $nomor = WhatsAppService::formatPhoneNumber($nomor);
        if ($nomor === '') {
            return false;
        }
        $stmt = $db->prepare(
            "SELECT 1 FROM `{$table}`
             WHERE followup_sent_at IS NOT NULL
               AND followup_sent_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
               AND (no_wa = ? OR sender_wa = ?)
             LIMIT 1"
        );
        $stmt->execute([$nomor, $nomor]);

        return $stmt->fetchColumn() !== false;
    }

    /** Ada link handshake yang baru saja tercatat terkirim ke nomor ini. */
    private static function recentAuthFollowupLogged(PDO $db, string $nomor, int $minutes = 3): bool
    {
        $nomor = WhatsAppService::formatPhoneNumber($nomor);
        $minutes = max(1, min(60, $minutes));
        if ($nomor === '') {
            return false;
        }
        try {
            $stmt = $db->prepare(
                "SELECT 1 FROM whatsapp
                 WHERE nomor_tujuan = ?
                   AND kategori IN ('mybeddian_auth_wa', 'daftar_santri_wa', 'auth_wa_followup')
                   AND status IN ('sent', 'terkirim')
                   AND created_at >= DATE_SUB(NOW(), INTERVAL {$minutes} MINUTE)
                 LIMIT 1"
            );
            $stmt->execute([$nomor]);

            return $stmt->fetchColumn() !== false;
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function suppressApologyRow(PDO $db, string $table, int $id, string $claim, bool $useClaim): void
    {
        if ($id < 1) {
            return;
        }
        if ($useClaim) {
            $db->prepare(
                "UPDATE `{$table}`
                 SET apology_sent_at = NOW(), pending_followup = NULL, apology_after = NULL,
                     followup_claim = NULL, followup_claimed_at = NULL
                 WHERE id = ? AND followup_claim = ?"
            )->execute([$id, $claim]);
        } else {
            $db->prepare(
                "UPDATE `{$table}`
                 SET apology_sent_at = NOW(), pending_followup = NULL, apology_after = NULL
                 WHERE id = ?"
            )->execute([$id]);
        }
    }

    private static function newClaimToken(): string
    {
        return bin2hex(random_bytes(8));
    }

    /**
     * Ambil baris secara eksklusif (UPDATE atomik). Worker lain tidak bisa mengambil baris yang sama.
     */
    private static function claimRows(PDO $db, string $table, string $claim, string $whereSql): int
    {
        if (!self::hasClaimColumns($db, $table)) {
            return 0;
        }
        $stale = self::CLAIM_STALE_MINUTES;
        $limit = self::FLUSH_BATCH;
        $sql = "UPDATE `{$table}`
                SET followup_claim = ?, followup_claimed_at = NOW()
                WHERE ({$whereSql})
                  AND (
                        followup_claim IS NULL
                        OR followup_claim = ''
                        OR followup_claimed_at IS NULL
                        OR followup_claimed_at < DATE_SUB(NOW(), INTERVAL {$stale} MINUTE)
                  )
                ORDER BY id ASC
                LIMIT {$limit}";
        $stmt = $db->prepare($sql);
        $stmt->execute([$claim]);

        return $stmt->rowCount();
    }

    private static function releaseClaim(PDO $db, string $table, int $id, string $claim): void
    {
        if ($id < 1 || $claim === '' || !self::hasClaimColumns($db, $table)) {
            return;
        }
        $db->prepare(
            "UPDATE `{$table}`
             SET followup_claim = NULL, followup_claimed_at = NULL
             WHERE id = ? AND followup_claim = ?"
        )->execute([$id, $claim]);
    }

    private static function hasClaimColumns(PDO $db, string $table): bool
    {
        try {
            return $db->query("SHOW COLUMNS FROM `{$table}` LIKE 'followup_claim'")->rowCount() > 0
                && $db->query("SHOW COLUMNS FROM `{$table}` LIKE 'followup_claimed_at'")->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function isAllowedTable(string $table): bool
    {
        return in_array($table, ['mybeddian_auth_wa_tokens', 'daftar_santri_wa_tokens'], true);
    }

    private static function hasFollowupColumns(PDO $db, string $table): bool
    {
        if (!self::isAllowedTable($table)) {
            return false;
        }
        try {
            if ($db->query("SHOW TABLES LIKE " . $db->quote($table))->rowCount() === 0) {
                return false;
            }
            return $db->query("SHOW COLUMNS FROM `{$table}` LIKE 'pending_followup'")->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }
}
