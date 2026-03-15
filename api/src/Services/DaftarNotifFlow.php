<?php

declare(strict_types=1);

namespace App\Services;

use App\Database;

/**
 * Flow balas otomatis "Daftar Notifikasi" via WA.
 * Step 1: user kirim "Daftar Notifikasi" (+ Nama, NIK) -> balas tanya sudah simpan nomor?
 * Step 2: user jawab iya/sudah -> balas tanya mau aktifkan notif?
 * Step 3: user jawab iya -> insert/update kontak notif ON; tidak -> OFF.
 */
class DaftarNotifFlow
{
    private const MSG_SUDAH_SIMPAN = "Apakah anda sudah menyimpan nomor ini?? [iya/belum]... jika belum silahkan save nomor ini lebih dulu.";
    private const MSG_MAU_AKTIFKAN = "Apakah anda ingin mengaktifkan notifikasi whatsapp atas nama santri tersebut? [iya/tidak]";
    private const MSG_AKTIF = "Notifikasi WhatsApp telah diaktifkan untuk nomor ini.";
    private const MSG_NONAKTIF = "Notifikasi WhatsApp untuk nomor ini dimatikan.";

    /**
     * Handle pesan masuk; kembalikan teks balasan atau null jika tidak ada balasan.
     *
     * @param string $nomor Nomor WA (62xxx) dari payload
     * @param string $message Isi pesan
     * @param string|null $fromJid JID asli dari WA (xxx@c.us atau xxx@lid); dipakai untuk lookup agar balasan "iya" tetap ketemu row yang sama
     * @return string|null Teks yang akan dikirim balik ke pengirim
     */
    public static function handle(string $nomor, string $message, ?string $fromJid = null): ?string
    {
        $nomor = WhatsAppService::formatPhoneNumber($nomor);
        if (strlen($nomor) < 10) {
            error_log('DaftarNotifFlow: nomor too short after format: ' . $nomor);
            return null;
        }
        $message = trim($message);
        $fromJid = $fromJid !== null && $fromJid !== '' ? trim($fromJid) : null;
        $db = Database::getInstance()->getConnection();

        $tableCheck = $db->query("SHOW TABLES LIKE 'daftar_notif_pending'");
        if ($tableCheck->rowCount() === 0) {
            error_log('DaftarNotifFlow: table daftar_notif_pending does not exist');
            return null;
        }

        // Lookup: by from_jid dulu (agar balasan "iya" ketemu meski nomor beda format), lalu fallback nomor
        $row = false;
        $hasFromJidCol = self::tableHasFromJidColumn($db);
        $hasNomorKanonikCol = self::tableHasColumn($db, 'daftar_notif_pending', 'nomor_kanonik');
        $selectCols = $hasNomorKanonikCol ? 'nomor, step, nama, nik, nomor_kanonik' : 'nomor, step, nama, nik';
        if ($hasFromJidCol && $fromJid !== null) {
            $stmt = $db->prepare('SELECT ' . $selectCols . ' FROM daftar_notif_pending WHERE from_jid = ? LIMIT 1');
            $stmt->execute([$fromJid]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        }
        if ($row === false && $nomor !== '') {
            $stmt = $db->prepare('SELECT ' . $selectCols . ' FROM daftar_notif_pending WHERE nomor = ? LIMIT 1');
            $stmt->execute([$nomor]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        }
        $pendingNomor = $row !== false ? trim((string) ($row['nomor'] ?? '')) : null;
        $nomorKanonik = ($row !== false && $hasNomorKanonikCol && isset($row['nomor_kanonik'])) ? trim((string) $row['nomor_kanonik']) : null;
        if ($nomorKanonik !== null && $nomorKanonik !== '') {
            $nomorKanonik = WhatsAppService::formatPhoneNumber($nomorKanonik);
            if (strlen($nomorKanonik) < 10) {
                $nomorKanonik = null;
            }
        } else {
            $nomorKanonik = null;
        }

        if ($row !== false && $pendingNomor !== '') {
            $step = (int) ($row['step'] ?? 1);
            error_log('DaftarNotifFlow: pending found nomor=' . $pendingNomor . ' step=' . $step . ' message_preview=' . substr($message, 0, 40));
            if ($step === 1) {
                $isYa = self::isJawabanYa($message);
                if ($isYa) {
                    $stmtUp = $db->prepare('UPDATE daftar_notif_pending SET step = 2, updated_at = NOW() WHERE nomor = ?');
                    $stmtUp->execute([$pendingNomor]);
                    error_log('DaftarNotifFlow: step 1 -> ya, updated to step 2, replying MSG_MAU_AKTIFKAN');
                    return self::MSG_MAU_AKTIFKAN;
                }
                return self::MSG_SUDAH_SIMPAN;
            }
            if ($step === 2) {
                $stmtDel = $db->prepare('DELETE FROM daftar_notif_pending WHERE nomor = ?');
                $stmtDel->execute([$pendingNomor]);
                $aktif = self::isJawabanYa($message) ? 1 : 0;
                error_log('DaftarNotifFlow: step 2 setKontakNotif pendingNomor=' . $pendingNomor . ' nomor_kanonik=' . ($nomorKanonik ?? 'null') . ' aktif=' . $aktif);
                // Baris LID (dari WA): update siap_terima_notif saja, tidak isi nomor_kanonik
                WhatsAppService::setKontakNotif($pendingNomor, $aktif);
                // Baris nomor asli (dari form): update dan simpan LID di kolom nomor_kanonik (agar nomor=asli, nomor_kanonik=ID WA)
                if ($nomorKanonik !== null && $nomorKanonik !== $pendingNomor) {
                    error_log('DaftarNotifFlow: step 2 setKontakNotif juga untuk nomor asli=' . $nomorKanonik . ' dengan nomor_kanonik=' . $pendingNomor);
                    WhatsAppService::setKontakNotif($nomorKanonik, $aktif, $pendingNomor);
                }
                return $aktif === 1 ? self::MSG_AKTIF : self::MSG_NONAKTIF;
            }
            return null;
        }

        if (stripos($message, 'Daftar Notifikasi') === false) {
            error_log('DaftarNotifFlow: no pending for nomor=' . $nomor . ($fromJid ? ' from_jid=' . $fromJid : '') . ', message does not contain "Daftar Notifikasi". preview=' . substr($message, 0, 80));
            return null;
        }

        $nama = null;
        $nik = null;
        $nomorKanonikFromMessage = null;
        $lines = preg_split('/\r?\n/', $message, -1, PREG_SPLIT_NO_EMPTY);
        foreach ($lines as $line) {
            $line = trim($line);
            if (preg_match('/^Nama\s*:\s*(.+)$/i', $line, $m)) {
                $nama = trim($m[1]);
            }
            if (preg_match('/^NIK\s*:\s*(.+)$/i', $line, $m)) {
                $nik = trim($m[1]);
            }
            if (preg_match('/^No\s*\.?\s*WA\s*:\s*(\S.+)$/i', $line, $m)) {
                $raw = preg_replace('/\D/', '', trim($m[1]));
                if (strlen($raw) >= 10) {
                    $nomorKanonikFromMessage = WhatsAppService::formatPhoneNumber(trim($m[1]));
                    if (strlen($nomorKanonikFromMessage) < 10) {
                        $nomorKanonikFromMessage = null;
                    }
                }
            }
        }

        if ($hasNomorKanonikCol && $nomorKanonikFromMessage !== null) {
            WhatsAppService::ensureKontak($nomorKanonikFromMessage, 0);
        }
        if ($hasFromJidCol && $fromJid !== null) {
            if ($hasNomorKanonikCol && $nomorKanonikFromMessage !== null) {
                $stmtIns = $db->prepare('INSERT INTO daftar_notif_pending (nomor, from_jid, step, nama, nik, nomor_kanonik) VALUES (?, ?, 1, ?, ?, ?) ON DUPLICATE KEY UPDATE step = 1, from_jid = VALUES(from_jid), nama = VALUES(nama), nik = VALUES(nik), nomor_kanonik = VALUES(nomor_kanonik), updated_at = NOW()');
                $stmtIns->execute([$nomor, $fromJid, $nama, $nik, $nomorKanonikFromMessage]);
            } else {
                $stmtIns = $db->prepare('INSERT INTO daftar_notif_pending (nomor, from_jid, step, nama, nik) VALUES (?, ?, 1, ?, ?) ON DUPLICATE KEY UPDATE step = 1, from_jid = VALUES(from_jid), nama = VALUES(nama), nik = VALUES(nik), updated_at = NOW()');
                $stmtIns->execute([$nomor, $fromJid, $nama, $nik]);
            }
        } else {
            if ($hasNomorKanonikCol && $nomorKanonikFromMessage !== null) {
                $stmtIns = $db->prepare('INSERT INTO daftar_notif_pending (nomor, step, nama, nik, nomor_kanonik) VALUES (?, 1, ?, ?, ?) ON DUPLICATE KEY UPDATE step = 1, nama = VALUES(nama), nik = VALUES(nik), nomor_kanonik = VALUES(nomor_kanonik), updated_at = NOW()');
                $stmtIns->execute([$nomor, $nama, $nik, $nomorKanonikFromMessage]);
            } else {
                $stmtIns = $db->prepare('INSERT INTO daftar_notif_pending (nomor, step, nama, nik) VALUES (?, 1, ?, ?) ON DUPLICATE KEY UPDATE step = 1, nama = VALUES(nama), nik = VALUES(nik), updated_at = NOW()');
                $stmtIns->execute([$nomor, $nama, $nik]);
            }
        }
        error_log('DaftarNotifFlow: new daftar_notif entry for ' . $nomor . ($nomorKanonikFromMessage ? ' nomor_kanonik=' . $nomorKanonikFromMessage : ' (pesan tanpa No WA:)') . ', replying MSG_SUDAH_SIMPAN');
        return self::MSG_SUDAH_SIMPAN;
    }

    private static function tableHasFromJidColumn(\PDO $db): bool
    {
        return self::tableHasColumn($db, 'daftar_notif_pending', 'from_jid');
    }

    private static function tableHasColumn(\PDO $db, string $table, string $column): bool
    {
        try {
            $stmt = $db->query("SHOW COLUMNS FROM `{$table}` LIKE " . $db->quote($column));
            return $stmt !== false && $stmt->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function isJawabanYa(string $msg): bool
    {
        $msg = preg_replace('/\s+/', ' ', trim(strtolower($msg)));
        return in_array($msg, ['iya', 'ya', 'sudah', 'y', 'ok', 'oke', 'yes'], true)
            || preg_match('/^(iya|ya|sudah)\s*[\.\!]?$/i', trim($msg));
    }
}
