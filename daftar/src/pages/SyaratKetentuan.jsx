import { motion } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
}

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 100
    }
  }
}

function SyaratKetentuan() {
  const navigate = useNavigate()
  const location = useLocation()

  const handleBack = () => {
    // Cek apakah ada state dari navigasi sebelumnya
    const from = location.state?.from || '/pembayaran'
    navigate(from)
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-primary-50 via-white to-primary-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 overflow-y-auto">
      <div className="min-h-full py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 lg:p-10"
          >
          {/* Header */}
          <motion.div variants={itemVariants} className="mb-8">
            <button
              onClick={handleBack}
              className="inline-flex items-center text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 mb-4 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Kembali
            </button>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
              Syarat & Ketentuan
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Terakhir diperbarui: {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </motion.div>

          {/* Content */}
          <motion.div variants={itemVariants} className="prose prose-lg dark:prose-invert max-w-none">
            <div className="space-y-6 text-gray-700 dark:text-gray-300">
              {/* Section 1 */}
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                  1. Penerimaan Syarat
                </h2>
                <p className="mb-4">
                  Dengan mengakses dan menggunakan layanan pendaftaran online ini, Anda menyetujui untuk terikat oleh syarat dan ketentuan yang tercantum di bawah ini. Jika Anda tidak setuju dengan syarat dan ketentuan ini, mohon untuk tidak menggunakan layanan ini.
                </p>
              </section>

              {/* Section 2 */}
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                  2. Informasi Pendaftaran
                </h2>
                <p className="mb-4">
                  Calon santri diwajibkan untuk:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                  <li>Mengisi semua data biodata dengan lengkap dan benar sesuai dengan dokumen resmi</li>
                  <li>Mengupload semua dokumen yang dipersyaratkan dengan format yang sesuai</li>
                  <li>Melakukan pembayaran sesuai dengan ketentuan yang berlaku</li>
                  <li>Memastikan semua informasi yang diberikan adalah akurat dan dapat dipertanggungjawabkan</li>
                </ul>
              </section>

              {/* Section 3 */}
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                  3. Kewajiban Pengguna
                </h2>
                <p className="mb-4">
                  Pengguna bertanggung jawab untuk:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                  <li>Menjaga kerahasiaan akun dan password yang digunakan untuk mengakses sistem</li>
                  <li>Segera melaporkan jika terjadi penyalahgunaan akun atau aktivitas mencurigakan</li>
                  <li>Menggunakan layanan ini sesuai dengan tujuan yang semestinya</li>
                  <li>Tidak melakukan tindakan yang dapat merusak atau mengganggu sistem</li>
                </ul>
              </section>

              {/* Section 4 */}
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                  4. Pembayaran
                </h2>
                <p className="mb-4">
                  Ketentuan pembayaran:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                  <li>Pembayaran harus dilakukan sesuai dengan nominal yang telah ditentukan</li>
                  <li>Bukti pembayaran harus diupload melalui sistem dalam waktu yang telah ditentukan</li>
                  <li>Verifikasi pembayaran akan dilakukan oleh pihak administrasi</li>
                  <li>Pembayaran yang tidak valid atau tidak sesuai akan ditolak</li>
                </ul>
              </section>

              {/* Section 5 */}
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                  5. Verifikasi Data
                </h2>
                <p className="mb-4">
                  Pihak lembaga berhak untuk:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                  <li>Melakukan verifikasi terhadap semua data dan dokumen yang diupload</li>
                  <li>Meminta dokumen tambahan jika diperlukan</li>
                  <li>Menolak pendaftaran jika data tidak valid atau tidak lengkap</li>
                  <li>Membatalkan pendaftaran jika ditemukan ketidaksesuaian data</li>
                </ul>
              </section>

              {/* Section 6 */}
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                  6. Privasi dan Keamanan Data
                </h2>
                <p className="mb-4">
                  Kami berkomitmen untuk melindungi privasi dan keamanan data pribadi Anda. Semua data yang dikumpulkan akan digunakan hanya untuk keperluan proses pendaftaran dan administrasi. Data tidak akan dibagikan kepada pihak ketiga tanpa persetujuan Anda, kecuali diwajibkan oleh hukum.
                </p>
              </section>

              {/* Section 7 */}
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                  7. Pembatalan Pendaftaran
                </h2>
                <p className="mb-4">
                  Pendaftaran dapat dibatalkan oleh calon santri atau pihak lembaga dengan alasan yang jelas. Ketentuan pembatalan dan pengembalian dana mengikuti kebijakan yang telah ditetapkan.
                </p>
              </section>

              {/* Section 8 */}
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                  8. Perubahan Syarat & Ketentuan
                </h2>
                <p className="mb-4">
                  Kami berhak untuk mengubah, memodifikasi, atau memperbarui syarat dan ketentuan ini kapan saja tanpa pemberitahuan sebelumnya. Perubahan akan berlaku efektif setelah dipublikasikan di halaman ini. Penggunaan layanan setelah perubahan berarti Anda menyetujui syarat dan ketentuan yang baru.
                </p>
              </section>

              {/* Section 9 */}
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                  9. Kontak
                </h2>
                <p className="mb-4">
                  Jika Anda memiliki pertanyaan atau membutuhkan bantuan terkait syarat dan ketentuan ini, silakan hubungi kami melalui:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                  <li>Email: alutsmanipps@gmail.com</li>
                  <li>Kontak: 085 - 123 - 123 - 399</li>
                  <li>Alamat: Kantor UWABA, Beddian RT 29 RW 06 Jambesari, Jambesari Darus Sholah Bondowoso</li>
                </ul>
              </section>

              {/* Footer */}
              <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Dengan menggunakan layanan ini, Anda dianggap telah membaca, memahami, dan menyetujui semua syarat dan ketentuan yang berlaku.
                </p>
              </div>
            </div>
          </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default SyaratKetentuan
