import { motion, AnimatePresence } from 'framer-motion'

/**
 * Info Modal Component - Dinamis untuk berbagai field
 */
function InfoModal({ isOpen, onClose, fieldType }) {

  // Data info untuk setiap field type
  const infoData = {
    nik: {
      title: 'Informasi NIK',
      image: '/images/info/nik.jpg',
      description: (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            <b>NIK (Nomor Induk Kependudukan)</b> adalah nomor identitas tunggal yang diberikan kepada setiap penduduk Indonesia. NIK tercantum dalam Kartu Tanda Penduduk (KTP) dan bersifat unik, berlaku seumur hidup, dan tidak berubah meskipun pindah domisili.
          </p>
          <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-3">
            <p className="text-xs font-semibold text-teal-800 dark:text-teal-200 mb-1">Contoh NIK:</p>
            <p className="text-sm text-teal-700 dark:text-teal-300 font-mono">
              3201010101010001
            </p>
            <p className="text-xs text-teal-600 dark:text-teal-400 mt-2">
              NIK terdiri dari 16 digit angka yang dapat ditemukan di:
            </p>
            <ul className="text-xs text-teal-600 dark:text-teal-400 mt-1 list-disc list-inside space-y-1">
              <li>Kartu Tanda Penduduk (KTP)</li>
              <li>Kartu Keluarga (KK)</li>
              <li>Dokumen kependudukan lainnya</li>
            </ul>
            <p className="text-xs text-teal-600 dark:text-teal-400 mt-2">
              Pastikan yang dimasukkan adalah <b>NIK santri</b> yang mau mendaftar, sesuai dengan Kartu Keluarga (KK).
            </p>
          </div>
        </>
      )
    },
    no_kk: {
      title: 'Informasi No. KK',
      image: '/images/info/no_kk.jpg',
      description: (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            <b>No. KK (Nomor Kartu Keluarga)</b> adalah nomor identitas yang diberikan kepada setiap keluarga di Indonesia. Nomor ini tercantum dalam Kartu Keluarga (KK) yang dikeluarkan oleh Dinas Kependudukan dan Pencatatan Sipil (Dukcapil).
          </p>
          <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-3">
            <p className="text-xs font-semibold text-teal-800 dark:text-teal-200 mb-1">Contoh No. KK:</p>
            <p className="text-sm text-teal-700 dark:text-teal-300 font-mono">
              3201010101010001
            </p>
            <p className="text-xs text-teal-600 dark:text-teal-400 mt-2">
              No. KK terdiri dari 16 digit angka yang dapat ditemukan di:
            </p>
            <ul className="text-xs text-teal-600 dark:text-teal-400 mt-1 list-disc list-inside space-y-1">
              <li>Kartu Keluarga (KK) fisik</li>
              <li>E-KTP</li>
              <li>Dokumen kependudukan lainnya</li>
            </ul>
          </div>
        </>
      )
    },
    npsn: {
      title: 'Informasi NPSN',
      image: '/images/info/npsn.jpg',
      description: (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            <b>NPSN (Nomor Pokok Sekolah Nasional)</b> adalah kode pengenal sekolah yang bersifat unik dan standar di seluruh Indonesia. NPSN diberikan kepada setiap satuan pendidikan (sekolah/madrasah) yang terdaftar di Kementerian Pendidikan dan Kebudayaan.
          </p>
          <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-3">
            <p className="text-xs font-semibold text-teal-800 dark:text-teal-200 mb-1">Contoh NPSN:</p>
            <p className="text-sm text-teal-700 dark:text-teal-300 font-mono">
              20212345
            </p>
            <p className="text-xs text-teal-600 dark:text-teal-400 mt-2">
              NPSN terdiri dari 8 digit angka yang dapat ditemukan di:
            </p>
            <ul className="text-xs text-teal-600 dark:text-teal-400 mt-1 list-disc list-inside space-y-1">
              <li>Ijazah atau Sertifikat</li>
              <li>Dokumen sekolah resmi</li>
              <li>
                <a 
                  href="https://referensi.data.kemdikbud.go.id/index11.php" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-teal-700 dark:text-teal-300 hover:text-teal-800 dark:hover:text-teal-200 underline font-medium"
                >
                  Website Referensi Data Kemdikbud
                </a>
              </li>
            </ul>
          </div>
        </>
      )
    },
    kip: {
      title: 'Informasi KIP',
      image: '/images/info/kip.jpg',
      description: (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            <b>KIP (Kartu Indonesia Pintar)</b> adalah kartu yang diberikan kepada anak-anak usia sekolah (6-21 tahun) dari keluarga kurang mampu untuk mendapatkan bantuan pendidikan. KIP memungkinkan penerima untuk mendapatkan bantuan biaya pendidikan.
          </p>
          <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-3">
            <p className="text-xs font-semibold text-teal-800 dark:text-teal-200 mb-1">Contoh Nomor KIP:</p>
            <p className="text-sm text-teal-700 dark:text-teal-300 font-mono">
              1234-5678-9012-3456
            </p>
            <p className="text-xs text-teal-600 dark:text-teal-400 mt-2">
              Nomor KIP dapat ditemukan di:
            </p>
            <ul className="text-xs text-teal-600 dark:text-teal-400 mt-1 list-disc list-inside space-y-1">
              <li>Kartu KIP fisik</li>
              <li>Surat pemberitahuan dari sekolah</li>
              <li>Website KIP Kemdikbud</li>
            </ul>
          </div>
        </>
      )
    },
    kks: {
      title: 'Informasi KKS',
      image: '/images/info/kks.jpg',
      description: (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            <b>KKS (Kartu Keluarga Sejahtera)</b> adalah kartu yang diberikan kepada keluarga penerima bantuan sosial dari pemerintah. KKS digunakan untuk mengakses berbagai program bantuan sosial termasuk bantuan pendidikan.
          </p>
          <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-3">
            <p className="text-xs font-semibold text-teal-800 dark:text-teal-200 mb-1">Contoh Nomor KKS:</p>
            <p className="text-sm text-teal-700 dark:text-teal-300 font-mono">
              1234567890123456
            </p>
            <p className="text-xs text-teal-600 dark:text-teal-400 mt-2">
              Nomor KKS dapat ditemukan di:
            </p>
            <ul className="text-xs text-teal-600 dark:text-teal-400 mt-1 list-disc list-inside space-y-1">
              <li>Kartu KKS fisik</li>
              <li>Kartu Keluarga (KK)</li>
              <li>Dokumen bantuan sosial</li>
            </ul>
          </div>
        </>
      )
    },
    kepala_keluarga: {
      title: 'Informasi Kepala Keluarga',
      image: '/images/info/kepala_keluarga.jpg',
      description: (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            <b>Kepala Keluarga</b> adalah orang yang bertanggung jawab atas suatu keluarga dan tercantum dalam Kartu Keluarga (KK). Kepala keluarga biasanya adalah suami/ayah, atau bisa juga istri/ibu jika suami tidak ada atau tidak mampu.
          </p>
          <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-3">
            <p className="text-xs font-semibold text-teal-800 dark:text-teal-200 mb-1">Contoh:</p>
            <p className="text-sm text-teal-700 dark:text-teal-300">
              Nama kepala keluarga sesuai dengan yang tercantum di Kartu Keluarga (KK)
            </p>
            <p className="text-xs text-teal-600 dark:text-teal-400 mt-2">
              Kepala keluarga dapat ditemukan di:
            </p>
            <ul className="text-xs text-teal-600 dark:text-teal-400 mt-1 list-disc list-inside space-y-1">
              <li>Kartu Keluarga (KK) - baris pertama</li>
              <li>Dokumen kependudukan resmi</li>
              <li>Surat keterangan dari kelurahan/desa</li>
            </ul>
          </div>
        </>
      )
    }
  }

  const currentInfo = infoData[fieldType]

  if (!currentInfo) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col my-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                {currentInfo.title}
              </h3>
              <button
                onClick={onClose}
                className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body - Scrollable */}
            <div className="p-4 overflow-y-auto flex-1">
              <img
                src={currentInfo.image}
                alt={currentInfo.title}
                className="w-full h-auto rounded-lg shadow-sm"
                onError={(e) => {
                  e.target.style.display = 'none'
                }}
              />
              <div className="mt-4">
                {currentInfo.description}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 flex justify-end flex-shrink-0">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Mengerti
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default InfoModal
