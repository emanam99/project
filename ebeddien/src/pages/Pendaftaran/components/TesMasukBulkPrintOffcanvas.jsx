import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import PrintRaporTesMadin from '../print/PrintRaporTesMadin'
import '../print/PrintPendaftaran.css'

function pendaftarToBiodata(pendaftar) {
  if (!pendaftar) return {}
  return {
    id: pendaftar.id,
    nis: pendaftar.nis,
    nama: pendaftar.nama,
    nik: pendaftar.nik,
    gender: pendaftar.gender,
    tempat_lahir: pendaftar.tempat_lahir,
    tanggal_lahir: pendaftar.tanggal_lahir,
    formal: pendaftar.daftar_formal ?? pendaftar.formal,
    diniyah: pendaftar.daftar_diniyah ?? pendaftar.diniyah,
    alamat: pendaftar.alamat,
    dusun: pendaftar.dusun,
    rt: pendaftar.rt,
    rw: pendaftar.rw,
    desa: pendaftar.desa,
    kecamatan: pendaftar.kecamatan,
    kabupaten: pendaftar.kabupaten,
    provinsi: pendaftar.provinsi,
    kode_pos: pendaftar.kode_pos,
    daerah: pendaftar.daerah,
    kamar: pendaftar.kamar,
    id_diniyah: pendaftar.id_diniyah,
    kelas_diniyah: pendaftar.kelas_diniyah,
    kel_diniyah: pendaftar.kel_diniyah,
    diniyah_lembaga_nama: pendaftar.diniyah_lembaga_nama,
    rombel_diniyah: pendaftar.rombel_diniyah,
  }
}

export default function TesMasukBulkPrintOffcanvas({
  isOpen,
  onClose,
  selectedPendaftarList = [],
  tahunHijriyah = '',
  tahunMasehi = '',
}) {
  useEffect(() => {
    if (!isOpen) return undefined

    const style = document.createElement('style')
    style.id = 'dynamic-print-tes-masuk-bulk-page'
    style.textContent = '@page { size: A4 portrait; margin: 0; padding: 0; }'
    document.head.appendChild(style)
    document.body.classList.add('print-tes-masuk-bulk-active')

    return () => {
      document.body.classList.remove('print-tes-masuk-bulk-active')
      const el = document.getElementById('dynamic-print-tes-masuk-bulk-page')
      if (el) el.remove()
    }
  }, [isOpen])

  const handlePrint = () => {
    document.body.classList.add('print-offcanvas-open')
    setTimeout(() => {
      window.print()
      setTimeout(() => {
        document.body.classList.remove('print-offcanvas-open')
      }, 1000)
    }, 300)
  }

  if (typeof document === 'undefined') return null
  if (!isOpen) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="no-print fixed inset-0 bg-black/50 z-[10002]"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="print-offcanvas-wrapper fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl overflow-hidden flex flex-col z-[10003]"
            style={{ maxHeight: '92vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="no-print flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-indigo-600 dark:text-indigo-400">
                  Preview Print Rapor Tes ({selectedPendaftarList.length})
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Rapor tes madin untuk pendaftar terpilih
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={selectedPendaftarList.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                  aria-label="Tutup"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto min-h-0 p-3">
              {selectedPendaftarList.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-sm text-gray-500 dark:text-gray-400">
                  Tidak ada pendaftar yang dipilih
                </div>
              ) : (
                <div className="space-y-6">
                  {selectedPendaftarList.map((pendaftar, index) => (
                    <div
                      key={pendaftar.id_registrasi ?? pendaftar.id}
                      className={`print-rapor-tes-outer ${index > 0 ? 'print-rapor-after-prev' : ''}`}
                    >
                      <PrintRaporTesMadin
                        printOnly
                        idSantri={pendaftar.id}
                        biodata={pendaftarToBiodata(pendaftar)}
                        tahunHijriyah={tahunHijriyah}
                        tahunMasehi={tahunMasehi}
                        tahunAjaranLabel={tahunHijriyah}
                        tahunAjaranRaw={tahunHijriyah}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
