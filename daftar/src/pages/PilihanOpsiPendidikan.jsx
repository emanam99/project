import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

const STORAGE_DINIYAH = 'daftar_diniyah'
const STORAGE_FORMAL = 'daftar_formal'
const STORAGE_STATUS_PENDAFTAR = 'daftar_status_pendaftar'

const OPSI_DINIYAH = [
  { value: 'Ula', label: 'Ula' },
  { value: 'Wustha', label: 'Wustha' },
  { value: 'Ulya', label: 'Ulya' }
]

const OPSI_FORMAL = [
  { value: 'PAUD', label: 'PAUD' },
  { value: 'SMP', label: 'SMP' },
  { value: 'MTs', label: 'MTs' },
  { value: 'SMAI', label: 'SMAI' },
  { value: 'STAI', label: 'STAI' },
  { value: 'Tidak Sekolah', label: 'Tidak Sekolah' }
]

function PilihanOpsiPendidikan() {
  const navigate = useNavigate()
  const [isSantriBaru, setIsSantriBaru] = useState(false)
  const [diniyahChecked, setDiniyahChecked] = useState(false)
  const [formalChecked, setFormalChecked] = useState(false)
  const [diniyahValue, setDiniyahValue] = useState('')
  const [formalValue, setFormalValue] = useState('')

  useEffect(() => {
    const status = localStorage.getItem(STORAGE_STATUS_PENDAFTAR)
    setIsSantriBaru(status === 'Baru')
  }, [])

  const handleLanjut = () => {
    try {
      const diniyah = isSantriBaru ? 'Tes Masuk' : (diniyahChecked ? diniyahValue : 'Tidak Sekolah')
      const formal = formalChecked ? formalValue : 'Tidak Sekolah'
      localStorage.setItem(STORAGE_DINIYAH, diniyah)
      localStorage.setItem(STORAGE_FORMAL, formal)

      // Halaman status murid hanya jika formal SMP, MTs, SMAI, STAI
      if (formal === 'SMP' || formal === 'MTs' || formal === 'SMAI' || formal === 'STAI') {
        navigate('/pilihan-status-murid', { replace: true, state: { direction: 'forward' } })
        return
      }
      // Halaman status santri hanya untuk Santri Baru + formal PAUD/STAI
      if (!isSantriBaru) {
        localStorage.setItem('daftar_status_santri', 'Mukim')
        navigate('/dashboard', { replace: true, state: { direction: 'forward' } })
        return
      }
      if (formal === 'PAUD' || formal === 'STAI') {
        navigate('/pilihan-status-santri', { replace: true, state: { direction: 'forward' } })
      } else {
        localStorage.setItem('daftar_status_santri', 'Mukim')
        navigate('/dashboard', { replace: true, state: { direction: 'forward' } })
      }
    } catch (e) {
      console.warn('localStorage set failed:', e)
    }
  }

  const canLanjut =
    (formalChecked ? !!formalValue : true) &&
    (isSantriBaru || !diniyahChecked || !!diniyahValue)

  return (
    <div
      className="flex flex-col bg-gray-100 dark:bg-gray-900 overflow-hidden"
      style={{ position: 'fixed', inset: 0 }}
    >
      <div
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="min-h-full flex items-center justify-center p-4">
          <div className="w-full max-w-md space-y-3 py-4 pb-8">
          <h1 className="text-center text-lg font-semibold text-gray-800 dark:text-white mb-4">
            Pilih Opsi Pendidikan
          </h1>

          {/* Accordion Daftar Diniyah - disembunyikan jika Santri Baru */}
        {!isSantriBaru && (
          <div className="rounded-lg border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setDiniyahChecked(!diniyahChecked)}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-gray-400 dark:border-gray-500 bg-white dark:bg-gray-700">
                {diniyahChecked && (
                  <svg className="h-3 w-3 text-primary-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </span>
              <span className="font-medium text-gray-800 dark:text-white flex-1">Daftar Diniyah</span>
              {diniyahChecked ? (
                <span className="text-primary-600 dark:text-primary-400 text-sm">Terpilih</span>
              ) : (
                <span className="text-gray-400 text-sm">Sudah Sekolah</span>
              )}
            </button>
            <AnimatePresence initial={false}>
              {diniyahChecked && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-0 border-t border-gray-100 dark:border-gray-700">
                    <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 mt-2">Pilih jenjang Diniyah</span>
                    <div className="space-y-2">
                      {OPSI_DINIYAH.map((o) => (
                        <label key={o.value} className="flex items-center gap-3 p-2 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                          <input
                            type="radio"
                            name="diniyah"
                            value={o.value}
                            checked={diniyahValue === o.value}
                            onChange={() => setDiniyahValue(o.value)}
                            className="h-4 w-4 text-primary-600 border-gray-300 dark:border-gray-500 focus:ring-primary-500"
                          />
                          <span className="text-gray-800 dark:text-gray-200">{o.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {isSantriBaru && (
          <div className="rounded-lg border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-800 dark:text-white">Daftar Diniyah:</span> Tes Masuk (untuk Santri Baru)
            </p>
          </div>
        )}

        {/* Accordion Daftar Formal */}
        <div className="rounded-lg border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 overflow-hidden">
          <button
            type="button"
            onClick={() => setFormalChecked(!formalChecked)}
            className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-gray-400 dark:border-gray-500 bg-white dark:bg-gray-700">
              {formalChecked && (
                <svg className="h-3 w-3 text-primary-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </span>
            <span className="font-medium text-gray-800 dark:text-white flex-1">Daftar Formal</span>
            {formalChecked ? (
              <span className="text-primary-600 dark:text-primary-400 text-sm">{formalValue || '—'}</span>
            ) : (
              <span className="text-gray-400 text-sm">Sudah Sekolah</span>
            )}
          </button>
          <AnimatePresence initial={false}>
            {formalChecked && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 pt-0 border-t border-gray-100 dark:border-gray-700">
                  <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 mt-2">Pilih jenjang Formal</span>
                  <div className="space-y-2">
                    {OPSI_FORMAL.map((o) => (
                      <label key={o.value} className="flex items-center gap-3 p-2 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                        <input
                          type="radio"
                          name="formal"
                          value={o.value}
                          checked={formalValue === o.value}
                          onChange={() => setFormalValue(o.value)}
                          className="h-4 w-4 text-primary-600 border-gray-300 dark:border-gray-500 focus:ring-primary-500"
                        />
                        <span className="text-gray-800 dark:text-gray-200">{o.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate('/pilihan-status', { replace: true, state: { direction: 'back' } })}
              className="flex-1 py-3 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors"
            >
              Kembali
            </button>
            <button
              type="button"
              onClick={handleLanjut}
              disabled={!canLanjut}
              className="flex-1 py-3 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
            >
              Lanjut
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}

export default PilihanOpsiPendidikan
export { STORAGE_DINIYAH, STORAGE_FORMAL }
