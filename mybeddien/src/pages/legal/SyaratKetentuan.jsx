import { motion } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
}

const itemVariants = {
  hidden: { y: 16, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 100 } },
}

/**
 * Syarat & ketentuan layanan pembayaran / portal myBeddien.
 */
export default function SyaratKetentuan() {
  const navigate = useNavigate()
  const location = useLocation()

  const handleBack = () => {
    navigate(location.state?.from || '/', { replace: false })
  }

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-primary-50 via-white to-primary-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 overflow-y-auto">
      <div className="min-h-full py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 lg:p-10"
          >
            <motion.div variants={itemVariants} className="mb-8">
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 mb-4 transition-colors"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Kembali
              </button>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
                Syarat &amp; Ketentuan
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Berlaku untuk layanan pembayaran dan portal myBeddien · Terakhir diperbarui:{' '}
                {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </motion.div>

            <motion.div variants={itemVariants} className="space-y-6 text-gray-700 dark:text-gray-300">
              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">1. Penerimaan syarat</h2>
                <p>
                  Dengan menggunakan myBeddien (pembayaran syahriah/UWABA, khusus, tunggakan, cashless, dan fitur terkait),
                  Anda menyetujui syarat &amp; ketentuan ini. Jika tidak setuju, mohon tidak melanjutkan transaksi.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">2. Akun &amp; data pengguna</h2>
                <ul className="list-disc list-inside space-y-2 ml-1">
                  <li>Anda bertanggung jawab menjaga kerahasiaan akun, password, dan passkey.</li>
                  <li>Email dan nomor HP yang dipakai untuk pembayaran harus valid dan dapat dihubungi.</li>
                  <li>Segera laporkan jika ada dugaan penyalahgunaan akun.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">3. Pembayaran</h2>
                <ul className="list-disc list-inside space-y-2 ml-1">
                  <li>Pembayaran melalui gateway (VA, QRIS, e-wallet, convenience store) mengikuti nominal, biaya admin, dan batas waktu yang ditampilkan.</li>
                  <li>Status lunas mengikuti konfirmasi otomatis dari gateway / sistem pesantren.</li>
                  <li>Jangan membagikan kode VA/QR/kode bayar kepada pihak yang tidak berkepentingan.</li>
                  <li>Top-up atau transaksi cashless mengikuti saldo dan aturan wallet yang berlaku.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">4. Privasi &amp; keamanan</h2>
                <p>
                  Data dipakai untuk administrasi keuangan pesantren dan layanan portal. Kami tidak membagikan data
                  kepada pihak ketiga di luar kebutuhan operasional/kepatuhan hukum tanpa dasar yang sah.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">5. Perubahan ketentuan</h2>
                <p>
                  Ketentuan dapat diperbarui sewaktu-waktu. Penggunaan layanan setelah pembaruan berarti Anda menyetujui
                  versi terbaru yang ditampilkan di halaman ini.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">6. Kontak</h2>
                <p className="mb-2">Pertanyaan seputar syarat &amp; ketentuan atau pembayaran:</p>
                <ul className="list-disc list-inside space-y-1 ml-1">
                  <li>Email: alutsmanipps@gmail.com</li>
                  <li>Kontak: 085 - 123 - 123 - 399</li>
                  <li>Alamat: Kantor UWABA, Beddian RT 29 RW 06 Jambesari, Jambesari Darus Sholah Bondowoso</li>
                </ul>
              </section>

              <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Dengan melanjutkan pembayaran di myBeddien, Anda dianggap telah membaca dan menyetujui syarat &amp; ketentuan ini.
                </p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
