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
 * Kebijakan pengembalian dana untuk pembayaran di myBeddien.
 */
export default function KebijakanPengembalianDana() {
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
                Kebijakan Pengembalian Dana
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Berlaku untuk pembayaran melalui myBeddien · Terakhir diperbarui:{' '}
                {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </motion.div>

            <motion.div variants={itemVariants} className="space-y-6 text-gray-700 dark:text-gray-300">
              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">1. Umum</h2>
                <p>
                  Kebijakan ini mengatur pengajuan pengembalian dana (refund) untuk transaksi pembayaran yang dilakukan
                  lewat myBeddien (misalnya UWABA/syahriah, khusus, tunggakan, atau top-up terkait), setelah pembayaran
                  tercatat berhasil di sistem.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">2. Kapan refund dapat diajukan</h2>
                <ul className="list-disc list-inside space-y-2 ml-1">
                  <li>Kesalahan teknis sistem/gateway yang menyebabkan double charge atau nominal tidak sesuai.</li>
                  <li>Pembayaran terkonfirmasi padahal tagihan sudah lunas (bukti dari sistem).</li>
                  <li>Keputusan administrasi pesantren yang menyetujui pembatalan/penyesuaian tagihan.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">3. Yang umumnya tidak dapat direfund</h2>
                <ul className="list-disc list-inside space-y-2 ml-1">
                  <li>Pembayaran yang sudah sah dialokasikan ke tagihan dan tidak ada kesalahan sistem.</li>
                  <li>Biaya admin gateway (jika sudah terpotong oleh penyedia pembayaran).</li>
                  <li>Permintaan tanpa bukti transaksi / tanpa alasan yang dapat diverifikasi.</li>
                  <li>Saldo cashless yang sudah dipakai untuk transaksi toko/pembelian.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">4. Cara mengajukan</h2>
                <ol className="list-decimal list-inside space-y-2 ml-1">
                  <li>Siapkan bukti: waktu bayar, metode, nominal, dan (jika ada) ID/referensi transaksi di aplikasi.</li>
                  <li>Hubungi administrasi UWABA / keuangan pesantren (lihat FAQ → Kontak).</li>
                  <li>Menunggu verifikasi; proses dapat memakan waktu hingga 14 hari kerja setelah disetujui.</li>
                </ol>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">5. Metode pengembalian</h2>
                <p>
                  Pengembalian mengikuti kebijakan administrasi (misalnya transfer ke rekening yang sama / penyesuaian
                  tagihan). Metode dapat berbeda tergantung gateway dan jenis pembayaran.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">6. Kontak</h2>
                <ul className="list-disc list-inside space-y-1 ml-1">
                  <li>Email: alutsmanipps@gmail.com</li>
                  <li>Kontak: 085 - 123 - 123 - 399</li>
                  <li>Alamat: Kantor UWABA, Beddian RT 29 RW 06 Jambesari, Jambesari Darus Sholah Bondowoso</li>
                  <li>Jam layanan: setiap hari, pukul 08.00–16.00 WIB</li>
                </ul>
              </section>

              <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Kebijakan dapat berubah. Keputusan akhir refund berada pada administrasi pesantren setelah verifikasi.
                </p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
