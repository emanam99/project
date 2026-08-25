const APP_FULL_NAME = 'eBeddien'

export default function Tentang() {
  return (
    <div className="p-6 sm:p-8 space-y-6 text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{APP_FULL_NAME}</h2>
        <p>
          eBeddien menjadi pusat kerja harian pengurus: dari <strong className="font-medium text-gray-900 dark:text-white">beranda</strong> dan{' '}
          <strong className="font-medium text-gray-900 dark:text-white">profil</strong>, pengaturan tahun ajaran, hingga{' '}
          <strong className="font-medium text-gray-900 dark:text-white">chat</strong> dan{' '}
          <strong className="font-medium text-gray-900 dark:text-white">asisten Chat AI</strong> yang mengikuti hak akses
          fitur Anda.
        </p>
      </div>

      <section className="rounded-xl border border-gray-200/80 dark:border-gray-600/60 bg-gray-50/80 dark:bg-gray-900/50 px-4 py-3.5 space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-primary-700 dark:text-primary-300">Pembayaran &amp; PSB</h3>
        <p>
          Modul <strong className="text-gray-900 dark:text-white">pendaftaran (PSB)</strong>: data pendaftar, item &amp;
          kondisi registrasi, padukan data, hingga pembayaran dan cetak kwitansi. Modul{' '}
          <strong className="text-gray-900 dark:text-white">UWABA</strong> (tagihan bulanan santri/wali),{' '}
          <strong className="text-gray-900 dark:text-white">tunggakan</strong> dan{' '}
          <strong className="text-gray-900 dark:text-white">khusus</strong>, <strong className="text-gray-900 dark:text-white">kelola data</strong> pembayaran, impor/ekspor, kirim pemberitahuan massal (termasuk WhatsApp bila dihubungkan), dan laporan.
          Integrasi <strong className="text-gray-900 dark:text-white">Payment Gateway / iPayMu</strong> untuk transaksi online.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200/80 dark:border-gray-600/60 bg-gray-50/80 dark:bg-gray-900/50 px-4 py-3.5 space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-primary-700 dark:text-primary-300">Keuangan &amp; aktivitas</h3>
        <p>
          <strong className="text-gray-900 dark:text-white">Pemasukan</strong>, <strong className="text-gray-900 dark:text-white">pengeluaran</strong> beserta rencana,{' '}
          <strong className="text-gray-900 dark:text-white">aktivitas tahun ajaran</strong>, ringkasan header saldo, dan alur approval yang selaras role Anda.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200/80 dark:border-gray-600/60 bg-gray-50/80 dark:bg-gray-900/50 px-4 py-3.5 space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-primary-700 dark:text-primary-300">Santri, lembaga &amp; UGT</h3>
        <p>
          <strong className="text-gray-900 dark:text-white">Data santri</strong>, rombel, tarbiyah, berkas, juara, ijin &amp; boyong, editor massal, dan pencarian terintegrasi.
          <strong className="text-gray-900 dark:text-white"> Unit Gemilang Tarbiyah (UGT)</strong>: data madrasah, koordinator, laporan PJGT &amp; koordinator, guru tugas, serta penyesuaian struktur tingkatan/kegiatan belajar.
          Pengaturan <strong className="text-gray-900 dark:text-white">lembaga, jabatan, pengurus, role &amp; fitur</strong>, modul{' '}
          <strong className="text-gray-900 dark:text-white">ujian</strong> (bank soal &amp; penjadwalan), serta{' '}
          <strong className="text-gray-900 dark:text-white">website pesantren</strong> (konten publik).
        </p>
      </section>

      <section className="rounded-xl border border-gray-200/80 dark:border-gray-600/60 bg-gray-50/80 dark:bg-gray-900/50 px-4 py-3.5 space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-primary-700 dark:text-primary-300">Portal &amp; publik</h3>
        <p>
          <strong className="text-gray-900 dark:text-white">Mybeddian</strong> menghubungkan akun pengurus ke Aplikasi santri/wali/toko.{' '}
          <strong className="text-gray-900 dark:text-white">Tampilan publik</strong> (tanpa login) untuk biodata santri, UWABA, khusus, tunggakan, PSB, ijin, shohifah &amp; kalender.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200/80 dark:border-gray-600/60 bg-gray-50/80 dark:bg-gray-900/50 px-4 py-3.5 space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-primary-700 dark:text-primary-300">Lainnya</h3>
        <p>
          Kalender &amp; hari penting; <strong className="text-gray-900 dark:text-white">Umroh</strong> (jamaah &amp; tabungan); modul{' '}
          <strong className="text-gray-900 dark:text-white">cashless/toko</strong> bila diaktifkan; konverter tanggal; backup aktivitas; tema terang/gelap; serta pembaruan berkelanjutan lewat{' '}
          <strong className="text-gray-900 dark:text-white">halaman Versi</strong> dan info aplikasi.
        </p>
      </section>
    </div>
  )
}
