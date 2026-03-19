<?php

namespace App\Services;

use App\Helpers\TextSanitizer;

/**
 * Template pesan WhatsApp per fungsi.
 * Satu method = satu template. Isi pesan dirapikan per kegunaan.
 * Semua data dari pendaftar (nama, nik, dll) di-sanitasi agar teks selalu bersih di WA.
 */
class WhatsAppTemplates
{
    private const FOOTER_NOMOR_RESMI = "\n\n> Mohon simpan nomor ini. Informasi resmi pesantren akan disampaikan melalui nomor ini.";

    /** Link grup WhatsApp mahasiswa baru (jika formal = STAI). */
    private const LINK_GRUP_MAHASISWA_BARU = 'https://chat.whatsapp.com/FWC1C6n6Nkc4XxWrQMgzOp?mode=gi_t';

    /**
     * Template: Biodata santri tersimpan (setelah simpan biodata PSB).
     * Dipakai oleh: sendPsbBiodataTerdaftar
     * Judul: Santri Baru = "Pendaftaran Santri Baru". Santri Lama = dari daftar_formal: STAI → "Pendaftaran Mahasiswa Baru", selain itu → "Pendaftaran Murid Baru" (tanpa Pindahan).
     */
    public static function biodataTerdaftar(array $santriData, string $linkPendaftaran): string
    {
        $nama = TextSanitizer::cleanText($santriData['nama'] ?? '') ?: '-';
        $nik = TextSanitizer::cleanText($santriData['nik'] ?? '') ?: '-';
        $nisRaw = $santriData['nis'] ?? $santriData['id'] ?? '';
        $nis = (trim((string) $nisRaw) !== '') ? (string) $nisRaw : (string) ($santriData['id'] ?? '-');
        $email = TextSanitizer::cleanText($santriData['email'] ?? '') ?: '-';
        $statusPendaftar = TextSanitizer::cleanText($santriData['status_pendaftar'] ?? '');
        $daftarFormal = TextSanitizer::cleanText($santriData['daftar_formal'] ?? '');
        $daftarDiniyah = TextSanitizer::cleanText($santriData['daftar_diniyah'] ?? '');
        $statusMurid = TextSanitizer::cleanText($santriData['status_murid'] ?? '');

        $isSantriLama = strtolower($statusPendaftar) === 'lama';
        if ($isSantriLama && strtoupper($daftarFormal) === 'STAI') {
            $msg = "📋 *Pendaftaran Mahasiswa Baru – Biodata Tersimpan*\n\n";
        } elseif ($isSantriLama) {
            $msg = "📋 *Pendaftaran Murid Baru – Biodata Tersimpan*\n\n";
        } elseif (strtoupper($daftarFormal) === 'STAI') {
            $msg = "📋 *Pendaftaran Mahasiswa Baru – Biodata Tersimpan*\n\n";
        } elseif ($daftarFormal !== '') {
            $msg = "📋 *Pendaftaran Murid Baru – Biodata Tersimpan*\n\n";
        } else {
            $msg = "📋 *Pendaftaran Santri Baru – Biodata Tersimpan*\n\n";
        }

        $msg .= "Santri berikut telah terdaftar dan biodata telah disimpan:\n\n";
        $msg .= "• *Nama:* " . $nama . "\n";
        $msg .= "• *NIK:* " . $nik . "\n";
        $msg .= "• *NIS:* " . $nis . "\n";
        $msg .= "• *Email:* " . $email . "\n";

        if ($isSantriLama && ($daftarFormal !== '' || $daftarDiniyah !== '')) {
            $keteranganParts = [];
            if ($daftarFormal !== '' && $statusMurid !== '') {
                $keteranganParts[] = 'Daftar Formal: ' . $daftarFormal . ' – ' . $statusMurid;
            } elseif ($daftarFormal !== '') {
                $keteranganParts[] = 'Daftar Formal: ' . $daftarFormal;
            }
            if ($daftarDiniyah !== '') {
                $keteranganParts[] = 'Daftar Diniyah: ' . $daftarDiniyah;
            }
            if (!empty($keteranganParts)) {
                $msg .= "• *Keterangan:* " . implode(' | ', $keteranganParts) . "\n";
            }
        }

        $msg .= "\nSilakan lengkapi berkas dan pembayaran di aplikasi pendaftaran.";
        if ($linkPendaftaran !== '') {
            $msg .= "\n\n🔗 Link pendaftaran:\n" . $linkPendaftaran;
        }
        if (strtoupper($daftarFormal) === 'STAI') {
            $msg .= "\n\nSilahkan bergabung di grup mahasiswa baru dengan link berikut ini:\n" . self::LINK_GRUP_MAHASISWA_BARU;
        }
        $msg .= self::FOOTER_NOMOR_RESMI;
        return $msg;
    }

    /**
     * Template: Berkas pendaftaran lengkap (semua upload/tandai tidak ada).
     * Dipakai oleh: sendPsbBerkasLengkap
     */
    public static function berkasLengkap(array $santriData, array $listAda, array $listTidakAda): string
    {
        $nama = TextSanitizer::cleanText($santriData['nama'] ?? '') ?: '-';
        $nis = $santriData['nis'] ?? $santriData['id'] ?? '-';

        $msg = "📁 *Berkas Pendaftaran Lengkap*\n\n";
        $msg .= "Santri: *" . $nama . "* (NIS: " . $nis . ")\n\n";
        $msg .= "Semua berkas sudah ditangani (upload atau tandai tidak ada).\n\n";
        $msg .= "*Berkas yang ada:*\n";
        if (!empty($listAda)) {
            foreach ($listAda as $item) {
                $msg .= "✓ " . TextSanitizer::cleanText((string) $item) . "\n";
            }
        } else {
            $msg .= "—\n";
        }
        $msg .= "\n*Berkas tidak ada (dicentang):*\n";
        if (!empty($listTidakAda)) {
            foreach ($listTidakAda as $item) {
                $msg .= "○ " . TextSanitizer::cleanText((string) $item) . "\n";
            }
        } else {
            $msg .= "—\n";
        }
        $msg .= "\nLanjutkan ke tahap pembayaran di aplikasi pendaftaran.";
        $msg .= self::FOOTER_NOMOR_RESMI;
        return $msg;
    }

    /**
     * Template: Link halaman pembayaran — hanya untuk alur upload bukti pembayaran (TF manual).
     * Dipakai oleh: sendPsbPembayaranLink dengan mode 'open'.
     * Untuk pesanan iPayMu (VA/CStore) notifikasi sudah di-handle oleh pembayaranIpaymuOrder.
     */
    public static function pembayaranLink(string $nama, string $link): string
    {
        $sapaan = TextSanitizer::cleanText($nama) ?: 'Calon Santri';
        $msg = "💳 *Pembayaran Pendaftaran*\n\n";
        $msg .= "Hai, " . $sapaan . ".\n\n";
        $msg .= "Anda dapat menyelesaikan pembayaran atau melihat status di aplikasi pendaftaran.\n\n";
        $msg .= "🔗 Link pembayaran:\n" . $link;
        $msg .= self::FOOTER_NOMOR_RESMI;
        return $msg;
    }

    /**
     * Template: Pembayaran berhasil (nominal sudah terbayar).
     * Dipakai oleh: sendPsbPembayaranBerhasil
     */
    public static function pembayaranBerhasil(string $nama, string $nominalFormatted): string
    {
        $sapaan = TextSanitizer::cleanText($nama) ?: 'Calon Santri';
        $msg = "✅ *Pembayaran Diterima*\n\n";
        $msg .= "Hai, " . $sapaan . ".\n\n";
        $msg .= "Pembayaran Anda sebesar *" . $nominalFormatted . "* telah tercatat, silahkan menunggu, Admin Akan mengecek DATA dan KELENGKAPAN BERKAS. Setelah selesai dicek oleh admin, anda akan mendapatkan notifikasi veriifikasi.\n\n";
        $msg .= "Terima kasih.";
        $msg .= self::FOOTER_NOMOR_RESMI;
        return $msg;
    }

    /** Teks fallback bila biaya admin belum didapat dari iPayMu. */
    private const ADMIN_FEE_FALLBACK_LABEL = 'sesuai merchant / admin bank';

    /**
     * Template: Pesanan pembayaran iPayMu berhasil dibuat (VA atau CStore).
     * Dipakai oleh: sendPsbPembayaranIpaymuOrder
     *
     * @param string $nama Nama santri
     * @param string $amountFormatted Nominal (Rp ...)
     * @param string|null $adminFeeFormatted Biaya admin (Rp ...) atau null = tampilkan "sesuai merchant / admin bank"
     * @param string|null $totalFormatted Total (Rp ...) atau null bila belum ada
     * @param string $channelLabel Nama bank/store (BCA, Alfamart, Indomaret, dll)
     * @param string $vaOrCode Nomor VA atau kode pembayaran CStore
     * @param string $instruksi Langkah-langkah pembayaran (bisa multi baris)
     * @param string $link Url pembayaran atau halaman daftar
     */
    public static function pembayaranIpaymuOrder(string $nama, string $amountFormatted, ?string $adminFeeFormatted, ?string $totalFormatted, string $channelLabel, string $vaOrCode, string $instruksi, string $link = ''): string
    {
        $sapaan = TextSanitizer::cleanText($nama) ?: 'Calon Santri';
        $msg = "💳 *Pesanan Pembayaran Berhasil Dibuat*\n\n";
        $msg .= "Hai, " . $sapaan . ".\n\n";
        $msg .= "Nominal: *" . $amountFormatted . "*\n";
        $msg .= "Biaya admin: *" . ($adminFeeFormatted !== null && $adminFeeFormatted !== '' ? $adminFeeFormatted : self::ADMIN_FEE_FALLBACK_LABEL) . "*\n";
        $msg .= "Total: *" . ($totalFormatted !== null && $totalFormatted !== '' ? $totalFormatted : self::ADMIN_FEE_FALLBACK_LABEL) . "*\n\n";
        $msg .= "Metode: *" . $channelLabel . "*\n\n";
        $msg .= "Nomor VA / Kode Pembayaran:\n*" . $vaOrCode . "*\n\n";
        if ($instruksi !== '') {
            $msg .= "Cara bayar:\n" . $instruksi . "\n\n";
        }
        if ($link !== '') {
            $msg .= "🔗 " . $link;
        }
        $msg .= self::FOOTER_NOMOR_RESMI;
        return $msg;
    }

    /**
     * Template: Pesanan pembayaran iPayMu QRIS berhasil dibuat (caption untuk gambar QR).
     * Dipakai oleh: sendPsbPembayaranIpaymuQris
     *
     * @param string $nama Nama santri
     * @param string $amountFormatted Nominal (Rp ...)
     * @param string|null $adminFeeFormatted Biaya admin (Rp ...) atau null = "sesuai merchant / admin bank"
     * @param string|null $totalFormatted Total (Rp ...) atau null bila belum ada
     * @param string $link Url pembayaran atau halaman daftar
     */
    public static function pembayaranIpaymuQris(string $nama, string $amountFormatted, ?string $adminFeeFormatted, ?string $totalFormatted, string $link = ''): string
    {
        $sapaan = TextSanitizer::cleanText($nama) ?: 'Calon Santri';
        $msg = "💳 *Pesanan Pembayaran QRIS Berhasil Dibuat*\n\n";
        $msg .= "Hai, " . $sapaan . ".\n\n";
        $msg .= "Nominal: *" . $amountFormatted . "*\n";
        $msg .= "Biaya admin: *" . ($adminFeeFormatted !== null && $adminFeeFormatted !== '' ? $adminFeeFormatted : self::ADMIN_FEE_FALLBACK_LABEL) . "*\n";
        $msg .= "Total: *" . ($totalFormatted !== null && $totalFormatted !== '' ? $totalFormatted : self::ADMIN_FEE_FALLBACK_LABEL) . "*\n\n";
        $msg .= "Scan gambar QR di bawah ini untuk membayar (Dana, GoPay, OVO, ShopeePay, dll).\n\n";
        if ($link !== '') {
            $msg .= "🔗 " . $link;
        }
        $msg .= self::FOOTER_NOMOR_RESMI;
        return $msg;
    }

    /**
     * Template: Pesanan pembayaran iPayMu dibatalkan.
     * Dipakai oleh: sendPsbPembayaranDibatalkan
     */
    public static function pembayaranDibatalkan(string $nama): string
    {
        $sapaan = TextSanitizer::cleanText($nama) ?: 'Calon Santri';
        $msg = "❌ *Pesanan Pembayaran Dibatalkan*\n\n";
        $msg .= "Hai, " . $sapaan . ".\n\n";
        $msg .= "Pesanan pembayaran Anda telah dibatalkan. Jika ingin melanjutkan, silakan buat pesanan pembayaran baru di aplikasi pendaftaran.";
        $msg .= self::FOOTER_NOMOR_RESMI;
        return $msg;
    }

    /**
     * Template: Pembayaran iPayMu gagal (dari callback).
     * Dipakai oleh: sendPsbPembayaranGagal
     */
    public static function pembayaranGagal(string $nama): string
    {
        $sapaan = TextSanitizer::cleanText($nama) ?: 'Calon Santri';
        $msg = "❌ *Pembayaran Gagal*\n\n";
        $msg .= "Hai, " . $sapaan . ".\n\n";
        $msg .= "Transaksi pembayaran Anda tidak berhasil. Silakan coba lagi atau gunakan metode pembayaran lain di aplikasi pendaftaran.";
        $msg .= self::FOOTER_NOMOR_RESMI;
        return $msg;
    }

    /**
     * Template: Pesanan pembayaran iPayMu kadaluarsa.
     * Dipakai oleh: sendPsbPembayaranKadaluarsa
     */
    public static function pembayaranKadaluarsa(string $nama): string
    {
        $sapaan = TextSanitizer::cleanText($nama) ?: 'Calon Santri';
        $msg = "⏱ *Pesanan Pembayaran Kadaluarsa*\n\n";
        $msg .= "Hai, " . $sapaan . ".\n\n";
        $msg .= "Waktu pembayaran pesanan Anda telah habis. Silakan buat pesanan pembayaran baru di aplikasi pendaftaran jika masih ingin melanjutkan.";
        $msg .= self::FOOTER_NOMOR_RESMI;
        return $msg;
    }

    /**
     * Template: Keterangan status sudah diverifikasi (icon centang hijau).
     * Dipakai oleh: sendPsbSudahDiverifikasi (saat admin uwaba klik Verifikasi).
     * Jika formal = STAI → teks Mahasiswa + link grup mahasiswa saja. Selain itu → Santri, tanpa link.
     *
     * @param array $biodata ['id' => ..., 'nis' => ..., 'nama' => ..., 'formal' => ...] (tampilan pakai NIS)
     */
    public static function sudahDiverifikasi(array $biodata): string
    {
        $nama = TextSanitizer::cleanText($biodata['nama'] ?? '') ?: 'Calon Santri';
        $nis = $biodata['nis'] ?? $biodata['id'] ?? '-';
        $daftarFormal = TextSanitizer::cleanText($biodata['formal'] ?? '');
        $isStai = strtoupper($daftarFormal) === 'STAI';

        if ($isStai) {
            $msg = "✅ *Mahasiswa Sudah di verifikasi*\n\n";
            $msg .= "_________________\n\n";
            $msg .= "Pendaftaran Mahasiswa Baru Anda telah diverifikasi oleh admin.\n\n";
            $msg .= "• *NIS:* " . $nis . "\n";
            $msg .= "• *Nama:* " . $nama . "\n\n";
            $msg .= "Silahkan bergabung di grup mahasiswa baru dengan link berikut ini:\n" . self::LINK_GRUP_MAHASISWA_BARU;
        } else {
            $msg = "✅ *Pendaftaran Santri Sudah Diverifikasi*\n\n";
            $msg .= "_________________\n\n";
            $msg .= "Pendaftaran Santri Baru Anda telah diverifikasi oleh admin.\n\n";
            $msg .= "• *NIS:* " . $nis . "\n";
            $msg .= "• *Nama:* " . $nama . "\n\n";
            $msg .= "Terima kasih.";
        }
        $msg .= self::FOOTER_NOMOR_RESMI;
        return $msg;
    }
}
