import { Link } from 'react-router-dom'
import { getGambarUrl } from '../../config/images'

const APP_FULL_NAME = 'eBeddien'
const APP_DESCRIPTION = 'Digital Service Center - transaksi keuangan santri dan lembaga.'

export default function Tentang() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <div className="max-w-2xl mx-auto px-4 py-8 pb-24">
        <div className="text-center mb-8">
          <img
            src={getGambarUrl('/icon/ebeddian/icon192.png')}
            alt="Logo"
            className="w-20 h-20 mx-auto mb-4 rounded-2xl object-contain"
          />
          <h1 className="text-2xl font-bold text-primary-600 dark:text-primary-400">{APP_FULL_NAME}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{APP_DESCRIPTION}</p>
        </div>

        <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Informasi umum</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Aplikasi ini mendukung pembayaran syahriah, tunggakan, pembayaran khusus, pendaftaran santri baru (PSB),
            pengelolaan keuangan (pemasukan, pengeluaran, aktivitas), umroh, ijin, kalender, dan berbagai fitur
            lain untuk operasional pondok dan lembaga.
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mt-3">
            Santri dan wali dapat mengakses data biodata, pembayaran, dan layanan terkait melalui tampilan public
            tanpa login. Pengurus mengakses fitur lengkap sesuai peran masing-masing.
          </p>
        </section>

        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            to="/version"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-medium hover:bg-primary-200 dark:hover:bg-primary-800/40"
          >
            Catatan versi
          </Link>
          <Link
            to="/info-aplikasi"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Info aplikasi
          </Link>
        </div>

        <div className="text-center mt-8">
          <Link to="/" className="text-primary-600 dark:text-primary-400 hover:underline text-sm">
            Kembali ke beranda
          </Link>
        </div>
      </div>
    </div>
  )
}
