<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\AiAssistantReplyStyleHelper;
use App\Helpers\NisPengajuanHelper;
use App\Helpers\TextSanitizer;

/**
 * Template pesan WA pengajuan NIS.
 */
final class NisPengajuanWaHelper
{
    /** @var list<string> */
    private const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

    /** @var array<int, string> */
    private const BULAN = [
        1 => 'Januari',
        2 => 'Februari',
        3 => 'Maret',
        4 => 'April',
        5 => 'Mei',
        6 => 'Juni',
        7 => 'Juli',
        8 => 'Agustus',
        9 => 'September',
        10 => 'Oktober',
        11 => 'November',
        12 => 'Desember',
    ];

    public static function ebeddienBaseUrl(): string
    {
        return RencanaPengeluaranWaHelper::ebeddienBaseUrl();
    }

    /**
     * Setelah verifikasi token WA: naikkan status ke menunggu_review.
     *
     * @param array<string, mixed> $payload
     * @return array{
     *   reply_body: string,
     *   admin_notif: array{
     *     pengajuan_id: int,
     *     nama: string,
     *     nik_masked: string,
     *     lembaga_id: ?string
     *   }|null
     * }
     */
    public static function finalizeAfterWaVerify(\PDO $db, array $payload): array
    {
        $pengajuanId = (int) ($payload['pengajuan_id'] ?? 0);
        if ($pengajuanId < 1) {
            throw new \RuntimeException('payload pengajuan_nis tanpa pengajuan_id');
        }

        $stmt = $db->prepare('SELECT * FROM mybeddian___nis_pengajuan WHERE id = ? LIMIT 1 FOR UPDATE');
        $stmt->execute([$pengajuanId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            throw new \RuntimeException('Pengajuan NIS tidak ditemukan');
        }

        $status = (string) ($row['status'] ?? '');
        if ($status === NisPengajuanHelper::STATUS_MENUNGGU_REVIEW) {
            $nama = (string) ($row['nama'] ?? '');
            $config = require __DIR__ . '/../../config.php';
            $adminContact = trim((string) (($config['security'] ?? [])['nis_pengajuan_pemohon_contact_wa'] ?? '08223299991'));

            return [
                'reply_body' => self::buildPemohonDiterimaReviewMessage($nama, $adminContact),
                'admin_notif' => null,
            ];
        }

        if ($status !== NisPengajuanHelper::STATUS_MENUNGGU_WA) {
            throw new \RuntimeException('Status pengajuan tidak menunggu verifikasi WA');
        }

        if (empty($row['path_file'])) {
            throw new \RuntimeException('Berkas KK belum ada pada pengajuan');
        }

        $upd = $db->prepare(
            'UPDATE mybeddian___nis_pengajuan
             SET status = ?, updated_at = NOW()
             WHERE id = ? AND status = ?'
        );
        $upd->execute([
            NisPengajuanHelper::STATUS_MENUNGGU_REVIEW,
            $pengajuanId,
            NisPengajuanHelper::STATUS_MENUNGGU_WA,
        ]);
        if ($upd->rowCount() < 1) {
            throw new \RuntimeException('Pengajuan sudah diproses');
        }

        $nama = (string) ($row['nama'] ?? '');
        $nikMasked = self::maskNik((string) ($row['nik'] ?? ''));
        $idSantri = isset($row['id_santri']) ? (int) $row['id_santri'] : 0;
        $lembagaId = NisPengajuanHelper::resolveLembagaIdForSantri($db, $idSantri > 0 ? $idSantri : null);
        $config = require __DIR__ . '/../../config.php';
        $adminContact = trim((string) (($config['security'] ?? [])['nis_pengajuan_pemohon_contact_wa'] ?? '08223299991'));

        return [
            'reply_body' => self::buildPemohonDiterimaReviewMessage($nama, $adminContact),
            'admin_notif' => [
                'pengajuan_id' => $pengajuanId,
                'nama' => $nama,
                'nik_masked' => $nikMasked,
                'lembaga_id' => $lembagaId,
            ],
        ];
    }

    /**
     * @param array{
     *   pengajuan_id: int,
     *   nama: string,
     *   nik_masked: string,
     *   lembaga_id: ?string
     * } $adminNotif
     */
    public static function sendAdminNotifFromVerify(array $adminNotif): void
    {
        try {
            $config = require __DIR__ . '/../../config.php';
            $wa = trim((string) (($config['security'] ?? [])['nis_pengajuan_alert_wa'] ?? ''));
            if ($wa === '') {
                return;
            }
            $pengajuanId = (int) ($adminNotif['pengajuan_id'] ?? 0);
            $namaPemohon = (string) ($adminNotif['nama'] ?? '');
            $nikMasked = (string) ($adminNotif['nik_masked'] ?? '');
            WhatsAppService::wakeWaServer();
            $message = self::buildAdminNotifMessage($namaPemohon, $nikMasked, $pengajuanId);
            $message = TextSanitizer::cleanMultilineMessage($message);
            WhatsAppService::sendMessage($wa, $message, null, [
                'kategori' => 'nis_pengajuan_admin_notif',
                'tujuan' => 'admin',
                'id_pengajuan' => $pengajuanId,
                'sumber' => 'mybeddian_wa_verify',
            ]);
        } catch (\Throwable $e) {
            error_log('NisPengajuanWaHelper::sendAdminNotifFromVerify ' . $e->getMessage());
        }
    }

    public static function buildAdminNotifMessage(
        string $namaPemohon,
        string $nikMasked,
        int $pengajuanId
    ): string {
        $base = self::ebeddienBaseUrl();
        $link = $base !== ''
            ? $base . '/pendaftaran/pengajuan-nis?id=' . $pengajuanId
            : '';

        $lines = [
            '*Pengajuan NIS myBeddien*',
            '',
            'Ada pengajuan verifikasi NIS dengan upload KK.',
            'Nama: ' . $namaPemohon,
            'NIK: ' . $nikMasked,
        ];
        if ($link !== '') {
            $lines[] = '';
            $lines[] = 'Buka di eBeddien:';
            $lines[] = $link;
        }

        return implode("\n", $lines);
    }

    /**
     * Detail ke pemohon setelah WA terverifikasi (tanpa Assalamualaikum — ack terpisah).
     * Ringkas: KK diterima + antrean review + estimasi + kontak admin.
     */
    public static function buildPemohonDiterimaReviewMessage(
        string $nama,
        string $adminContactWa = '08223299991',
        ?\DateTimeInterface $prosesAt = null
    ): string {
        $contact = trim($adminContactWa) !== '' ? trim($adminContactWa) : '08223299991';

        return implode("\n", [
            'Kartu Keluarga (KK) Anda telah kami terima. Pengajuan NIS *sedang ditinjau* admin.',
            'Estimasi *1–2 hari kerja*.',
            '',
            'Jika lebih dari 2 hari kerja NIS belum diterima, hubungi admin myBeddien:',
            $contact,
        ]);
    }

    /**
     * Payload (opsional ack + detail) — ack «Terima kasih…» max 1×/nomor/bulan.
     */
    public static function buildPemohonDiterimaReviewPayload(
        string $nama,
        string $adminContactWa = '08223299991',
        ?\DateTimeInterface $prosesAt = null,
        ?\PDO $db = null,
        string $noWa = ''
    ): string {
        $detail = self::buildPemohonDiterimaReviewMessage($nama, $adminContactWa, $prosesAt);
        if ($db instanceof \PDO && trim($noWa) !== '') {
            return WhatsAppTemplates::prependPermintaanSedangDiprosesAck($db, $noWa, $detail);
        }

        return WhatsAppTemplates::permintaanSedangDiprosesAck()
            . "\n" . AiAssistantReplyStyleHelper::SPLIT_MARKER . "\n"
            . $detail;
    }

    /**
     * Pemberitahuan penolakan ke pemohon — ajukan ulang setelah perbaiki data/KK.
     */
    public static function buildPemohonDitolakMessage(
        string $nama,
        ?\DateTimeInterface $prosesAt = null
    ): string {
        $greet = trim($nama) !== '' ? trim($nama) : 'Bapak/Ibu';
        $waktu = self::formatProsesWaktu($prosesAt);

        $lines = [
            'Pengajuan NIS atas nama *' . $greet . '* belum dapat kami setujui.',
            'Catatan proses: *' . $waktu . '*.',
            '',
            'Mohon *cek kembali data* (nama, NIK, tanggal lahir) dan Kartu Keluarga (KK), lalu *ajukan ulang* melalui Aplikasi myBeddian (menu Lupa NIS).',
            '',
        ];

        return implode("\n", $lines);
    }

    public static function buildNisToPemohonMessage(
        string $nama,
        string $nis,
        bool $alreadyRegistered,
        ?\DateTimeInterface $prosesAt = null
    ): string {
        $greet = trim($nama) !== '' ? trim($nama) : 'Bapak/Ibu';
        $waktu = self::formatProsesWaktu($prosesAt);

        $lines = [
            'Permintaan NIS Anda telah diproses.',
            'Catatan proses: *' . $waktu . '*.',
            '',
            'Nama: *' . $greet . '*',
            'NIS santri: *' . $nis . '*',
        ];
        if ($alreadyRegistered) {
            $lines[] = '';
            $lines[] = 'Akun myBeddien sudah terdaftar. Silakan login dengan username dan password Anda.';
        } else {
            $lines[] = '';
            $lines[] = 'Gunakan NIS ini untuk mendaftar di Aplikasi myBeddien.';
        }

        return implode("\n", $lines);
    }

    /**
     * Contoh: Senin, 3 Agustus 2026 pukul 09:50 WIB
     */
    public static function formatProsesWaktu(?\DateTimeInterface $at = null): string
    {
        $tz = new \DateTimeZone('Asia/Jakarta');
        $dt = $at !== null
            ? \DateTimeImmutable::createFromInterface($at)->setTimezone($tz)
            : new \DateTimeImmutable('now', $tz);

        $hari = self::HARI[(int) $dt->format('w')] ?? $dt->format('l');
        $bulan = self::BULAN[(int) $dt->format('n')] ?? $dt->format('F');

        return $hari . ', ' . ((int) $dt->format('j')) . ' ' . $bulan . ' ' . $dt->format('Y')
            . ' pukul ' . $dt->format('H:i') . ' WIB';
    }

    public static function maskNik(string $nik): string
    {
        if (strlen($nik) < 8) {
            return '****';
        }

        return substr($nik, 0, 4) . '********' . substr($nik, -4);
    }
}
