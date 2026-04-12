<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Pengaturan instansi AI WhatsApp + buku kontak pengirim (JID vs nomor terpisah).
 */
final class AiWaInstansiSettingsService
{
    /** Batas atas nilai limit (selaras kolom INT UNSIGNED MySQL). */
    public const WA_GLOBAL_HARIAN_MAX = 4294967295;

    public static function tableExists(\PDO $db): bool
    {
        try {
            $st = $db->query("SHOW TABLES LIKE 'ai___wa_instansi_pengaturan'");

            return $st !== false && $st->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    public static function contactsTableExists(\PDO $db): bool
    {
        try {
            $st = $db->query("SHOW TABLES LIKE 'ai___wa_obrolan_kontak'");

            return $st !== false && $st->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function hasGlobalLimitColumn(\PDO $db): bool
    {
        try {
            $st = $db->query("SHOW COLUMNS FROM ai___wa_instansi_pengaturan LIKE 'wa_global_harian_per_pengirim'");

            return $st !== false && $st->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * @return array{ai_wa_aktif: bool, terima_semua_pengirim: bool, kuota_users_id: int|null, wa_global_harian_per_pengirim: int}
     */
    public static function getSettings(\PDO $db): array
    {
        $defaultGlobal = 10;
        if (!self::tableExists($db)) {
            return [
                'ai_wa_aktif' => true,
                'terima_semua_pengirim' => false,
                'kuota_users_id' => null,
                'wa_global_harian_per_pengirim' => $defaultGlobal,
            ];
        }
        try {
            $limCol = self::hasGlobalLimitColumn($db) ? ', wa_global_harian_per_pengirim' : '';
            $stmt = $db->query(
                'SELECT ai_wa_aktif, terima_semua_pengirim, kuota_users_id' . $limCol . ' FROM ai___wa_instansi_pengaturan WHERE id = 1 LIMIT 1'
            );
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                self::ensureDefaultRow($db);

                return self::getSettings($db);
            }
            $kid = $row['kuota_users_id'] ?? null;
            $glim = $defaultGlobal;
            if (self::hasGlobalLimitColumn($db) && isset($row['wa_global_harian_per_pengirim'])) {
                $glim = max(1, min(500, (int) $row['wa_global_harian_per_pengirim']));
            }

            return [
                'ai_wa_aktif' => ((int) ($row['ai_wa_aktif'] ?? 1)) === 1,
                'terima_semua_pengirim' => ((int) ($row['terima_semua_pengirim'] ?? 0)) === 1,
                'kuota_users_id' => $kid !== null && (int) $kid > 0 ? (int) $kid : null,
                'wa_global_harian_per_pengirim' => $glim,
            ];
        } catch (\Throwable $e) {
            error_log('AiWaInstansiSettingsService::getSettings ' . $e->getMessage());

            return [
                'ai_wa_aktif' => true,
                'terima_semua_pengirim' => false,
                'kuota_users_id' => null,
                'wa_global_harian_per_pengirim' => $defaultGlobal,
            ];
        }
    }

    public static function ensureDefaultRow(\PDO $db): void
    {
        try {
            $db->exec(
                'INSERT IGNORE INTO ai___wa_instansi_pengaturan (id, ai_wa_aktif, terima_semua_pengirim, kuota_users_id) '
                . 'VALUES (1, 1, 0, NULL)'
            );
        } catch (\Throwable $e) {
            error_log('AiWaInstansiSettingsService::ensureDefaultRow ' . $e->getMessage());
        }
    }

    /**
     * @return array{ok: bool, message?: string}
     */
    public static function saveSettings(\PDO $db, bool $aiWaAktif, bool $terimaSemua, ?int $kuotaUsersId, int $waGlobalHarianPerPengirim): array
    {
        if (!self::tableExists($db)) {
            return ['ok' => false, 'message' => 'Tabel pengaturan belum ada. Jalankan migrasi database.'];
        }
        if ($terimaSemua && ($kuotaUsersId === null || $kuotaUsersId < 1)) {
            return ['ok' => false, 'message' => 'Aktifkan "terima semua" membutuhkan akun kuota (users id) yang valid.'];
        }
        $glim = max(0, min(self::WA_GLOBAL_HARIAN_MAX, $waGlobalHarianPerPengirim));
        try {
            self::ensureDefaultRow($db);
            if (self::hasGlobalLimitColumn($db)) {
                $stmt = $db->prepare(
                    'UPDATE ai___wa_instansi_pengaturan SET ai_wa_aktif = ?, terima_semua_pengirim = ?, kuota_users_id = ?, '
                    . 'wa_global_harian_per_pengirim = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1'
                );
                $stmt->execute([
                    $aiWaAktif ? 1 : 0,
                    $terimaSemua ? 1 : 0,
                    $terimaSemua ? $kuotaUsersId : null,
                    $glim,
                ]);
            } else {
                $stmt = $db->prepare(
                    'UPDATE ai___wa_instansi_pengaturan SET ai_wa_aktif = ?, terima_semua_pengirim = ?, kuota_users_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1'
                );
                $stmt->execute([
                    $aiWaAktif ? 1 : 0,
                    $terimaSemua ? 1 : 0,
                    $terimaSemua ? $kuotaUsersId : null,
                ]);
            }

            return ['ok' => true];
        } catch (\Throwable $e) {
            error_log('AiWaInstansiSettingsService::saveSettings ' . $e->getMessage());

            return ['ok' => false, 'message' => 'Gagal menyimpan pengaturan'];
        }
    }

    /**
     * Nomor kanonik hanya dari JID @s.whatsapp.net — tidak pernah menyimpan JID di kolom nomor.
     */
    public static function canonicalPhoneDigitsFromJid(?string $jid): ?string
    {
        if ($jid === null) {
            return null;
        }
        $jid = trim($jid);
        if ($jid === '' || !preg_match('/^(\d+)@s\.whatsapp\.net$/i', $jid, $m)) {
            return null;
        }
        $d = WhatsAppService::formatPhoneNumber($m[1]);

        return strlen($d) >= 10 ? $d : null;
    }

    public static function upsertInboundContact(\PDO $db, ?string $fromJid): void
    {
        if (!self::contactsTableExists($db) || $fromJid === null) {
            return;
        }
        $jid = trim($fromJid);
        if ($jid === '' || strlen($jid) > 185) {
            return;
        }
        $phone = self::canonicalPhoneDigitsFromJid($jid);
        try {
            $stmt = $db->prepare(
                'INSERT INTO ai___wa_obrolan_kontak (wa_jid, phone_normalized, first_seen_at, last_seen_at) VALUES (?, ?, NOW(), NOW()) '
                . 'ON DUPLICATE KEY UPDATE last_seen_at = NOW(), '
                . 'phone_normalized = COALESCE(VALUES(phone_normalized), phone_normalized)'
            );
            $stmt->execute([$jid, $phone]);
        } catch (\Throwable $e) {
            error_log('AiWaInstansiSettingsService::upsertInboundContact ' . $e->getMessage());
        }
    }

    /**
     * @return list<array{wa_jid: string, phone_normalized: string|null, first_seen_at: string, last_seen_at: string}>
     */
    public static function listContacts(\PDO $db, int $limit = 200): array
    {
        if (!self::contactsTableExists($db)) {
            return [];
        }
        $lim = max(1, min(500, $limit));
        try {
            $sql = 'SELECT wa_jid, phone_normalized, first_seen_at, last_seen_at FROM ai___wa_obrolan_kontak '
                . 'ORDER BY last_seen_at DESC LIMIT ' . (int) $lim;
            $stmt = $db->query($sql);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            return array_map(static function (array $r): array {
                return [
                    'wa_jid' => (string) ($r['wa_jid'] ?? ''),
                    'phone_normalized' => isset($r['phone_normalized']) && $r['phone_normalized'] !== ''
                        ? (string) $r['phone_normalized'] : null,
                    'first_seen_at' => (string) ($r['first_seen_at'] ?? ''),
                    'last_seen_at' => (string) ($r['last_seen_at'] ?? ''),
                ];
            }, $rows);
        } catch (\Throwable $e) {
            error_log('AiWaInstansiSettingsService::listContacts ' . $e->getMessage());

            return [];
        }
    }

    /**
     * Pastikan user kuota boleh memakai AI (untuk ember pengunjung).
     */
    public static function isValidQuotaUser(\PDO $db, int $usersId): bool
    {
        if ($usersId < 1) {
            return false;
        }
        try {
            $stmt = $db->prepare('SELECT COALESCE(ai_enabled, 1) AS ai_enabled FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([$usersId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            return $row && ((int) ($row['ai_enabled'] ?? 1)) === 1;
        } catch (\Throwable $e) {
            return false;
        }
    }
}
