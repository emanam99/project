/**
 * Konfigurasi ringkasan header kanan atas per grup menu.
 *
 * Default (jika grup tidak termasuk daftar ini):
 * - tampilkan "Aktivitas User Terakhir".
 *
 * Grup dalam daftar ini akan memakai ringkasan khusus yang sudah ada:
 * - Keuangan: saldo
 * - Pendaftaran: pendapatan pendaftaran hari ini
 * - Kalender: subtitle kalender (tanpa kartu ringkasan kanan)
 * - UWABA: ringkasan pembayaran hari ini
 */
export const HEADER_SPECIAL_SUMMARY_GROUPS = {
  pembayaran: ['UWABA']
}

