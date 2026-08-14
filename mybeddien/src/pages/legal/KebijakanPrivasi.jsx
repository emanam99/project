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
 * Kebijakan Privasi myBeddien (web + aplikasi Android).
 * Versi publik tanpa login: /kebijakan-privasi.html
 */
export default function KebijakanPrivasi() {
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
                Kebijakan Privasi
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Portal web &amp; aplikasi Android myBeddien · Terakhir diperbarui:{' '}
                {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </motion.div>

            <motion.div variants={itemVariants} className="space-y-6 text-gray-700 dark:text-gray-300">
              <p>
                Kebijakan ini menjelaskan bagaimana Pondok Pesantren Al-Utsmani mengumpulkan, menggunakan,
                menyimpan, dan melindungi data pribadi pada layanan{' '}
                <a className="text-primary-600 dark:text-primary-400 underline" href="https://mybeddien.alutsmani.id/">
                  myBeddien
                </a>{' '}
                serta aplikasi Android (<code className="text-sm">com.mybeddien</code>).
              </p>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">1. Data yang dikumpulkan</h2>
                <ul className="list-disc list-inside space-y-2 ml-1">
                  <li>Data akun (username, kontak, passkey) dan biodata administrasi pesantren</li>
                  <li>Data transaksi pembayaran &amp; cashless sesuai layanan yang digunakan</li>
                  <li>Data operasional (ijin, rapor, PJGT, toko, dll.) sesuai hak akses</li>
                  <li>Data teknis perangkat/sesi untuk keamanan dan kelancaran layanan</li>
                  <li>Izin kamera/unggah berkas/biometrik hanya saat fitur terkait dipakai</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">2. Tujuan penggunaan</h2>
                <p>
                  Data dipakai untuk menyediakan layanan portal, administrasi pesantren, autentikasi,
                  pemrosesan pembayaran, keamanan sistem, komunikasi layanan, dan kepatuhan hukum.
                  Kami tidak menjual data pribadi.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">3. Berbagi data</h2>
                <p>
                  Data dapat dibagikan terbatas kepada penyedia hosting, gateway pembayaran, atau otoritas
                  berwenang sejauh diperlukan. Versi lengkap tersedia di halaman publik kebijakan privasi.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">4. Kontak</h2>
                <ul className="list-disc list-inside space-y-1 ml-1">
                  <li>Email: alutsmanipps@gmail.com</li>
                  <li>Kontak: 085-123-123-399</li>
                  <li>
                    Halaman publik:{' '}
                    <a
                      className="text-primary-600 dark:text-primary-400 underline"
                      href="https://mybeddien.alutsmani.id/kebijakan-privasi"
                      target="_blank"
                      rel="noreferrer"
                    >
                      mybeddien.alutsmani.id/kebijakan-privasi
                    </a>
                  </li>
                </ul>
              </section>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
