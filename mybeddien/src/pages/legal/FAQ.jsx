import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import { useMybeddienToast } from '../../contexts/MybeddienToastContext'

const CONTACT_EMAIL = 'alutsmanipps@gmail.com'
/** Tampil untuk pengguna */
const CONTACT_PHONE_DISPLAY = '085 - 123 - 123 - 399'
/** Digit untuk salin / WA (tanpa spasi) */
const CONTACT_PHONE_DIGITS = '085123123399'
const CONTACT_WA_URL = `https://wa.me/62${CONTACT_PHONE_DIGITS.replace(/^0/, '')}`
const CONTACT_ADDRESS =
  'Kantor UWABA, Beddian RT 29 RW 06 Jambesari, Jambesari Darus Sholah Bondowoso'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}

const itemVariants = {
  hidden: { y: 16, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 100 } },
}

const faqData = [
  {
    id: 1,
    question: 'Apa saja yang bisa dibayar di myBeddien?',
    answer:
      'Anda dapat membayar tagihan terkait santri seperti UWABA/syahriah, khusus, tunggakan, serta fitur terkait cashless (misalnya top-up) sesuai menu yang tersedia di akun Anda.',
  },
  {
    id: 2,
    question: 'Metode pembayaran apa yang tersedia?',
    answer:
      'Tergantung pengaturan pesantren: Virtual Account (bank), QRIS, e-wallet, dan convenience store (Alfamart/Indomaret). Pilih metode di langkah pembayaran sebelum konfirmasi.',
  },
  {
    id: 3,
    question: 'Apa itu biaya admin?',
    answer:
      'Biaya admin adalah biaya layanan gateway pembayaran. Nominal dan total (termasuk admin) ditampilkan di halaman konfirmasi sebelum Anda menekan Bayar.',
  },
  {
    id: 4,
    question: 'Berapa lama batas waktu pembayaran?',
    answer:
      'Setiap transaksi punya waktu kadaluarsa (ditampilkan sebagai hitung mundur). VA biasanya lebih lama; QRIS biasanya lebih singkat. Bayar sebelum waktu habis, atau buat tagihan baru jika sudah kedaluwarsa.',
  },
  {
    id: 5,
    question: 'Bagaimana jika sudah bayar tapi status masih menunggu?',
    answer:
      'Tunggu beberapa saat, lalu gunakan tombol cek status. Jika sudah lewat batas waktu dan status belum berubah, hubungi administrasi dengan menyertakan bukti bayar dari bank/e-wallet.',
  },
  {
    id: 6,
    question: 'Bisakah saya membatalkan tagihan yang belum dibayar?',
    answer:
      'Ya. Tagihan yang masih menunggu biasanya bisa dibatalkan dari layar pembayaran, lalu Anda dapat membuat pembayaran baru dengan metode/nominal lain.',
  },
  {
    id: 7,
    question: 'Bagaimana kebijakan pengembalian dana?',
    answer:
      'Lihat halaman Kebijakan Pengembalian Dana. Refund umumnya untuk kesalahan sistem/double charge atau keputusan administrasi, bukan untuk pembayaran yang sudah sah dialokasikan tanpa kesalahan.',
  },
  {
    id: 8,
    question: 'Mengapa email dan nomor HP wajib diisi?',
    answer:
      'Gateway pembayaran membutuhkan kontak valid. Anda dapat memperbaiki email/HP di langkah konfirmasi sebelum membayar; data disimpan ke biodata.',
  },
  {
    id: 9,
    question: 'Apakah transaksi saya aman?',
    answer:
      'Pembayaran diproses melalui gateway resmi. Jangan bagikan kode VA/QR kepada orang lain. Login myBeddien dilindungi password/passkey — jaga kerahasiaan akun Anda.',
  },
]

async function copyText(text, onNotify, label) {
  try {
    await navigator.clipboard.writeText(text)
    onNotify?.(`${label} disalin`, 'success')
  } catch {
    onNotify?.(`Gagal menyalin ${label.toLowerCase()}`, 'error')
  }
}

function ContactRow({ label, children, copyValue, copyLabel, onNotify }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-4 py-3">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{label}</p>
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="min-w-0 flex-1 text-sm text-gray-900 dark:text-gray-100">{children}</div>
        <button
          type="button"
          onClick={() => copyText(copyValue, onNotify, copyLabel)}
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Salin
        </button>
      </div>
    </div>
  )
}

export default function FAQ() {
  const navigate = useNavigate()
  const location = useLocation()
  const { showToast } = useMybeddienToast()
  const [openItems, setOpenItems] = useState([])

  const toggleItem = (id) => {
    setOpenItems((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const handleBack = () => {
    navigate(location.state?.from || '/', { replace: false })
  }

  const notify = (msg, type) => showToast?.(msg, type)

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
                FAQ Pembayaran
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Pertanyaan yang sering diajukan seputar pembayaran di myBeddien
              </p>
            </motion.div>

            <motion.div variants={itemVariants} className="space-y-3">
              {faqData.map((faq) => (
                <div
                  key={faq.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleItem(faq.id)}
                    className="w-full px-5 py-4 text-left flex items-center justify-between bg-gray-50 dark:bg-gray-700/80 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span className="font-semibold text-gray-900 dark:text-white pr-4 text-sm sm:text-base">
                      {faq.question}
                    </span>
                    <motion.svg
                      className="w-5 h-5 text-primary-600 dark:text-primary-400 shrink-0"
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
                        <div className="px-5 py-4 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                          {faq.answer}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </motion.div>

            <motion.div variants={itemVariants} className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Masih ada pertanyaan?
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4 text-sm">
                Jika belum terjawab di FAQ ini, hubungi administrasi:
              </p>
              <div className="space-y-3">
                <ContactRow label="Email" copyValue={CONTACT_EMAIL} copyLabel="Email" onNotify={notify}>
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="font-medium text-primary-600 dark:text-primary-400 hover:underline break-all"
                  >
                    {CONTACT_EMAIL}
                  </a>
                </ContactRow>
                <ContactRow
                  label="WhatsApp / telepon"
                  copyValue={CONTACT_PHONE_DIGITS}
                  copyLabel="Nomor"
                  onNotify={notify}
                >
                  <a
                    href={CONTACT_WA_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary-600 dark:text-primary-400 hover:underline font-mono"
                  >
                    {CONTACT_PHONE_DISPLAY}
                  </a>
                  <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Ketuk nomor untuk membuka WhatsApp
                  </span>
                </ContactRow>
                <ContactRow label="Alamat" copyValue={CONTACT_ADDRESS} copyLabel="Alamat" onNotify={notify}>
                  <span className="leading-snug">{CONTACT_ADDRESS}</span>
                </ContactRow>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
