<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Deteksi niat agen otomasi dari teks pengguna (selaras DeepseekChat/index.jsx).
 */
final class AiAgentIntentHelper
{
    public static function suggestsAgentIntent(string $rawText, bool $hasAttachments): bool
    {
        if ($hasAttachments) {
            return true;
        }
        $t = mb_strtolower(trim($rawText));
        if ($t === '') {
            return false;
        }
        if (self::suggestsGeneralChatOnly($t)) {
            return false;
        }

        if (preg_match('/\b(tolong|mohon|silakan|bantu|bantu\s+buat|buatkan|buatin|bikin|inputkan|catatkan|simpan|ajukan|tambahkan|usulkan|lengkapi|isi\s+data|isi\s+rencana|perbarui\s+rencana|revisi|perbaiki|sisipkan|hapus\s+item|tambah\s+item|setujui|tolak\s+rencana|hapus\s+draft|konfirmasi\s+(aksi|perubahan|penyimpanan))\b/u', $t)) {
            if (preg_match('/\b(rencana\s+pengeluaran|draft\s+pengeluaran|pengadaan|anggaran(\s+belanja)?|rab\b|realisasi\s+pengeluaran|item\s+pengeluaran|rincian\s+pengeluaran|kwitansi|nota\s+belanja|daftar\s+belanja|pengeluaran\s+rutin)\b/u', $t)) {
                return true;
            }
        }
        if (preg_match('/\b(buat|bikin|buatkan|buatin)\b\s*.{0,48}\b(rencana|draft|pengeluaran)\b/u', $t)) {
            return true;
        }
        if (preg_match('/\bbuatkan\s+rencana|rencana\s+baru|draft\s+baru|simpan\s+sebagai\s+draft|ajukan\s+pending\b/u', $t)) {
            return true;
        }
        if (preg_match('/\b(kirim|jangan\s+kirim|tanpa|matikan)\b\s*.{0,16}(notif|notifikasi).{0,20}draft\b|\bnotifikasi\s+draft\b|\bkirim_notifikasi\b/u', $t)) {
            return true;
        }
        if (preg_match('/\b(oke|okay|ya|sip|yoi|gas|lanjut)\b\s*[,]?\s*(simpan|proses|eksekusi|kirim|ajukan)\b|\b(silakan|tolong)\s+(simpan|proses|eksekusi|lanjut)\b|\bproses\s+(sekarang|langsung)\b/u', $t)) {
            return true;
        }
        if (preg_match('/\b(buat|input|ambil|baca)\b\s*.{0,40}\b(dari\s+)?(lampiran|gambar|foto|scan|excel|spreadsheet|pdf|csv|word)\b/u', $t)) {
            return true;
        }
        if (mb_strlen($t) <= 120
            && preg_match('/\b(\d{1,7})\s*[x×]\s*(rp\.?\s?)?[\d.,]+|rp\.?\s*[\d.,]+\s*(\/|per)\s*(unit|pcs|buah|orang|siswa)|subtotal|total\s+belanja\b/ui', $t)
            && preg_match('/\b(item|barang|qty|jumlah|harga|lembaga|kategori)\b/u', $t)) {
            return true;
        }
        if (preg_match('/\b(ubah|ganti|update|perbarui)\b\s*.{0,24}\b(profil|email|username|foto\s+profil|whatsapp|no\.?\s*wa)\b/u', $t)) {
            return true;
        }
        if (preg_match('/\b(pakai|gunakan|aktifkan|buka|pindah)\b\s*.{0,28}\b(mode\s+)?(proxy|alternatif)\b|\bganti\s+ke\s+proxy\b/u', $t)) {
            return true;
        }
        if (preg_match('/\b(nonaktifkan|matikan)\s+proxy|\bmode\s+api\b|\bkembali\s+ke\s+mode\s+(api|normal|bawaan|utama)\b/u', $t)) {
            return true;
        }

        return false;
    }

    public static function suggestsGeneralChatOnly(string $t): bool
    {
        return (bool) preg_match(
            '/\b(apa\s+itu|apa\s+adalah|jelaskan|penjelasan|definisi|maksudnya|artinya|contohnya|bagaimana\s+cara|cara\s+membuat|tutorial)\b/u',
            $t
        );
    }
}
