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

function KebijakanPengembalianDana() {
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
              Kebijakan Pengembalian Dana (Refund Policy)
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
                  1. Umum
                </h2>
                <p className="mb-4">
                  Kebijakan Pengembalian Dana ini mengatur prosedur dan ketentuan pengembalian dana untuk biaya pendaftaran yang telah dibayarkan oleh calon santri. Kebijakan ini berlaku untuk semua transaksi pembayaran yang dilakukan melalui sistem pendaftaran online.
                </p>
              </section>

              {/* Section 2 */}
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                  2. Ketentuan Pengembalian Dana
                </h2>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      2.1. Pengembalian Penuh (100%)
                    </h3>
                    <p className="mb-2">
                      Pengembalian dana penuh dapat dilakukan dalam kondisi berikut:
                    </p>
                    <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                      <li>Pembatalan pendaftaran dilakukan dalam waktu maksimal 3 (tiga) hari setelah pembayaran dilakukan</li>
                      <li>Pembatalan karena kesalahan sistem atau kesalahan teknis dari pihak lembaga</li>
                      <li>Pembatalan karena kuota pendaftaran telah penuh sebelum pembayaran diverifikasi</li>
                      <li>Pembatalan karena alasan kesehatan yang dibuktikan dengan surat keterangan dokter</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      2.2. Pengembalian Sebagian (50%)
                    </h3>
                    <p className="mb-2">
                      Pengembalian dana sebagian dapat dilakukan dalam kondisi berikut:
                    </p>
                    <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                      <li>Pembatalan pendaftaran dilakukan setelah 3 (tiga) hari tetapi sebelum 7 (tujuh) hari setelah pembayaran</li>
                      <li>Pembatalan karena alasan pribadi yang dapat dibuktikan dengan dokumen resmi</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      2.3. Tidak Dapat Dikembalikan
                    </h3>
                    <p className="mb-2">
                      Pengembalian dana tidak dapat dilakukan dalam kondisi berikut:
                    </p>
                    <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                      <li>Pembatalan setelah 7 (tujuh) hari dari tanggal pembayaran</li>
                      <li>Pembatalan setelah proses verifikasi data dan dokumen selesai dilakukan</li>
                      <li>Pembatalan karena data atau dokumen yang tidak valid atau palsu</li>
                      <li>Pembatalan karena pelanggaran terhadap syarat dan ketentuan pendaftaran</li>
                      <li>Pembatalan karena alasan yang tidak dapat dibuktikan</li>
                    </ul>
                  </div>
                </div>
              </section>

              {/* Section 3 */}
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                  3. Prosedur Pengajuan Pengembalian Dana
                </h2>
                <p className="mb-4">
                  Untuk mengajukan pengembalian dana, calon santri atau wali harus:
                </p>
                <ol className="list-decimal list-inside space-y-2 ml-4 mb-4">
                  <li>Mengisi formulir pengajuan pengembalian dana yang tersedia di sistem atau menghubungi bagian administrasi</li>
                  <li>Menyertakan bukti pembayaran asli atau fotokopi yang telah dilegalisir</li>
                  <li>Menyertakan dokumen pendukung sesuai dengan alasan pembatalan (jika diperlukan)</li>
                  <li>Mengisi formulir dengan lengkap dan benar</li>
                  <li>Menunggu proses verifikasi dari pihak administrasi (maksimal 14 hari kerja)</li>
                </ol>
              </section>

              {/* Section 4 */}
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                  4. Proses Pengembalian Dana
                </h2>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      4.1. Verifikasi
                    </h3>
                    <p className="mb-4">
                      Setelah pengajuan diterima, pihak administrasi akan melakukan verifikasi terhadap:
                    </p>
                    <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                      <li>Keabsahan bukti pembayaran</li>
                      <li>Status pendaftaran calon santri</li>
                      <li>Alasan pembatalan dan dokumen pendukung</li>
                      <li>Kesesuaian dengan ketentuan pengembalian dana</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      4.2. Persetujuan
                    </h3>
                    <p className="mb-4">
                      Jika pengajuan disetujui, pihak administrasi akan:
                    </p>
                    <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                      <li>Mengirimkan konfirmasi persetujuan melalui WhatsApp</li>
                      <li>Memproses pengembalian dana sesuai dengan ketentuan yang berlaku</li>
                      <li>Memberikan informasi mengenai metode dan waktu pengembalian dana</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      4.3. Waktu Pengembalian
                    </h3>
                    <p className="mb-4">
                      Pengembalian dana akan diproses dalam waktu maksimal 14 (empat belas) hari kerja setelah pengajuan disetujui. Waktu pengembalian dapat bervariasi tergantung pada metode pembayaran yang digunakan.
                    </p>
                  </div>
                </div>
              </section>

              {/* Section 5 */}
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                  5. Metode Pengembalian Dana
                </h2>
                <p className="mb-4">
                  Pengembalian dana akan dilakukan melalui metode yang sama dengan metode pembayaran awal, kecuali ada kesepakatan lain. Jika pembayaran dilakukan melalui transfer bank, pengembalian akan dilakukan ke rekening yang sama.
                </p>
              </section>

              {/* Section 6 */}
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                  6. Biaya Administrasi
                </h2>
                <p className="mb-4">
                  Untuk pengembalian dana sebagian (50%), biaya administrasi sebesar 10% dari total pembayaran akan dikenakan. Biaya administrasi ini digunakan untuk menutupi biaya proses verifikasi dan administrasi.
                </p>
              </section>

              {/* Section 7 */}
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                  7. Penolakan Pengembalian Dana
                </h2>
                <p className="mb-4">
                  Pihak lembaga berhak menolak pengajuan pengembalian dana jika:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                  <li>Pengajuan tidak memenuhi ketentuan yang berlaku</li>
                  <li>Dokumen yang disertakan tidak lengkap atau tidak valid</li>
                  <li>Alasan pembatalan tidak dapat dibuktikan</li>
                  <li>Pembatalan dilakukan setelah batas waktu yang ditentukan</li>
                </ul>
              </section>

              {/* Section 8 */}
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                  8. Kontak
                </h2>
                <p className="mb-4">
                  Untuk pertanyaan atau bantuan terkait pengembalian dana, silakan hubungi:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                  <li>Email: alutsmanipps@gmail.com</li>
                  <li>Kontak: 085 - 123 - 123 - 399</li>
                  <li>Alamat: Kantor UWABA, Beddian RT 29 RW 06 Jambesari, Jambesari Darus Sholah Bondowoso</li>
                  <li>Jam Layanan: Setiap hari, dari jam 8 sampai 16 WIB</li>
                </ul>
              </section>

              {/* Footer */}
              <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Kebijakan ini dapat berubah sewaktu-waktu. Perubahan akan diumumkan melalui website resmi. Dengan menggunakan layanan ini, Anda dianggap telah membaca dan menyetujui kebijakan pengembalian dana ini.
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

export default KebijakanPengembalianDana
