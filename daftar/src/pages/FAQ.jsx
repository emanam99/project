import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
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

const faqData = [
  {
    id: 1,
    question: 'Bagaimana cara mendaftar sebagai calon santri?',
    answer: 'Untuk mendaftar, Anda perlu mengakses halaman login dan memasukkan NIK. Setelah itu, ikuti langkah-langkah pendaftaran yang tersedia: mengisi biodata, mengupload dokumen, dan melakukan pembayaran.'
  },
  {
    id: 2,
    question: 'Dokumen apa saja yang diperlukan untuk pendaftaran?',
    answer: 'Dokumen yang diperlukan meliputi: Akta Kelahiran, Kartu Keluarga (KK), KTP Orang Tua/Wali, Surat Keterangan Sehat, Foto, dan dokumen lainnya sesuai dengan persyaratan yang ditentukan. Semua dokumen harus dalam format yang valid dan dapat dibaca dengan jelas.'
  },
  {
    id: 3,
    question: 'Berapa biaya pendaftaran yang harus dibayar?',
    answer: 'Biaya pendaftaran dapat dilihat di halaman pembayaran setelah Anda login. Pastikan untuk melakukan pembayaran sesuai dengan nominal yang tertera dan upload bukti pembayaran melalui sistem.'
  },
  {
    id: 4,
    question: 'Bagaimana cara mengupload dokumen?',
    answer: 'Setelah login, masuk ke halaman Berkas. Di sana Anda dapat melihat daftar dokumen yang diperlukan dan mengupload masing-masing dokumen. Pastikan file dalam format yang sesuai (PDF, JPG, PNG) dan ukuran tidak melebihi batas yang ditentukan.'
  },
  {
    id: 5,
    question: 'Berapa lama proses verifikasi pendaftaran?',
    answer: 'Proses verifikasi biasanya memakan waktu 3-7 hari kerja setelah semua dokumen dan pembayaran telah lengkap dan diverifikasi. Anda akan mendapat notifikasi melalui sistem atau kontak yang terdaftar.'
  },
  {
    id: 6,
    question: 'Apa yang harus dilakukan jika lupa password?',
    answer: 'Jika Anda lupa password, silakan hubungi bagian administrasi melalui email atau telepon yang tersedia. Tim administrasi akan membantu proses reset password Anda.'
  },
  {
    id: 7,
    question: 'Bisakah saya mengubah data yang sudah diisi?',
    answer: 'Ya, Anda dapat mengubah data yang sudah diisi sebelum proses verifikasi selesai. Setelah verifikasi, perubahan data harus dilakukan melalui bagian administrasi dengan menyertakan dokumen pendukung.'
  },
  {
    id: 8,
    question: 'Bagaimana cara mengetahui status pendaftaran saya?',
    answer: 'Status pendaftaran dapat dilihat di halaman Dashboard setelah Anda login. Status akan diperbarui secara real-time sesuai dengan progress pendaftaran Anda.'
  },
  {
    id: 9,
    question: 'Apa yang terjadi jika pembayaran saya ditolak?',
    answer: 'Jika pembayaran ditolak, Anda akan mendapat notifikasi melalui sistem. Pastikan bukti pembayaran yang diupload jelas dan sesuai dengan nominal yang ditentukan. Anda dapat mengupload ulang bukti pembayaran yang benar.'
  },
  {
    id: 10,
    question: 'Bisakah saya membatalkan pendaftaran?',
    answer: 'Ya, Anda dapat membatalkan pendaftaran. Namun, ketentuan pengembalian dana mengikuti Kebijakan Pengembalian Dana yang berlaku. Silakan baca halaman Kebijakan Pengembalian Dana untuk informasi lebih lanjut.'
  },
  {
    id: 11,
    question: 'Bagaimana jika dokumen saya hilang atau rusak?',
    answer: 'Jika dokumen hilang atau rusak, Anda perlu mengurus dokumen pengganti terlebih dahulu. Setelah itu, upload dokumen pengganti melalui sistem. Pastikan dokumen yang diupload adalah dokumen resmi yang masih berlaku.'
  },
  {
    id: 12,
    question: 'Apakah ada batas waktu untuk menyelesaikan pendaftaran?',
    answer: 'Ya, ada batas waktu pendaftaran yang ditentukan. Pastikan untuk menyelesaikan semua tahapan pendaftaran sebelum batas waktu berakhir. Informasi batas waktu dapat dilihat di halaman Dashboard atau diumumkan melalui website resmi.'
  },
  {
    id: 13,
    question: 'Bagaimana cara menghubungi bagian administrasi?',
    answer: 'Anda dapat menghubungi bagian administrasi melalui email alutsmanipps@gmail.com, kontak 085 - 123 - 123 - 399, atau datang langsung ke Kantor UWABA, Beddian RT 29 RW 06 Jambesari, Jambesari Darus Sholah Bondowoso pada jam kerja.'
  },
  {
    id: 14,
    question: 'Apakah sistem pendaftaran ini aman?',
    answer: 'Ya, kami menggunakan teknologi keamanan terkini untuk melindungi data pribadi Anda. Semua data dienkripsi dan hanya dapat diakses oleh pihak yang berwenang. Silakan baca halaman Syarat & Ketentuan untuk informasi lebih detail tentang privasi dan keamanan data.'
  }
]

function FAQ() {
  const navigate = useNavigate()
  const location = useLocation()
  const [openItems, setOpenItems] = useState([])

  const toggleItem = (id) => {
    setOpenItems(prev => 
      prev.includes(id) 
        ? prev.filter(item => item !== id)
        : [...prev, id]
    )
  }

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
              Frequently Asked Questions (FAQ)
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Pertanyaan yang sering diajukan seputar pendaftaran
            </p>
          </motion.div>

          {/* FAQ Items */}
          <motion.div variants={itemVariants} className="space-y-4">
            {faqData.map((faq) => (
              <div
                key={faq.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => toggleItem(faq.id)}
                  className="w-full px-6 py-4 text-left flex items-center justify-between bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  <span className="font-semibold text-gray-900 dark:text-white pr-4">
                    {faq.question}
                  </span>
                  <motion.svg
                    className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    animate={{ rotate: openItems.includes(faq.id) ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </motion.svg>
                </button>
                <AnimatePresence>
                  {openItems.includes(faq.id) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 py-4 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </motion.div>

          {/* Contact Section */}
          <motion.div variants={itemVariants} className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Masih ada pertanyaan?
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Jika pertanyaan Anda belum terjawab di FAQ ini, silakan hubungi kami:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4 text-gray-700 dark:text-gray-300">
              <li>Email: alutsmanipps@gmail.com</li>
              <li>Kontak: 085 - 123 - 123 - 399</li>
              <li>Alamat: Kantor UWABA, Beddian RT 29 RW 06 Jambesari, Jambesari Darus Sholah Bondowoso</li>
            </ul>
          </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default FAQ
