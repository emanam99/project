import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  UWABA_DISKON_OPTIONS,
  UWABA_PAKET_OPTIONS,
  buildUwabaJsonFromPaket,
  hitungWajibPaket,
  inferUwabaPaketFromJson,
  resolveUwabaDiskonFromBiodata,
  resolveUwabaPaketFromBiodata,
} from '../../../utils/uwabaCalculator'

const offcanvasTransition = { type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }

function GreenCheck() {
  return (
    <svg className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function RadioRow({ name, value, checked, onChange, title, subtitle }) {
  return (
    <label
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer ${
        checked
          ? 'border-green-500 bg-green-50 dark:bg-green-900/20 dark:border-green-600'
          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="w-4 h-4 accent-green-600 shrink-0"
      />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">{title}</span>
        {subtitle ? (
          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</span>
        ) : null}
      </span>
      {checked ? <GreenCheck /> : <span className="w-5 h-5 shrink-0" />}
    </label>
  )
}

function UwabaPaketOffcanvas({
  isOpen,
  onClose,
  title,
  bulanData,
  biodata,
  initialPaket,
  initialDiskon,
  onApply,
}) {
  const [paket, setPaket] = useState(initialPaket || '185')
  const [diskonKode, setDiskonKode] = useState(initialDiskon || '0')

  useEffect(() => {
    if (!isOpen) return
    if (initialPaket) {
      setPaket(initialPaket)
      setDiskonKode(initialDiskon || '0')
      return
    }
    const inferred = inferUwabaPaketFromJson(bulanData?.jsonData, bulanData?.wajib)
    if (inferred) {
      setPaket(inferred.paket)
      setDiskonKode(inferred.diskonKode)
      return
    }
    setPaket(resolveUwabaPaketFromBiodata(biodata))
    setDiskonKode(resolveUwabaDiskonFromBiodata(biodata))
  }, [isOpen, bulanData, biodata, initialPaket, initialDiskon])

  const heading = title || (bulanData?.namaBulan ? `Wajib ${bulanData.namaBulan}` : 'Wajib')
  const total = hitungWajibPaket(paket, diskonKode)

  const handleSubmit = (e) => {
    e.preventDefault()
    const jsonData = buildUwabaJsonFromPaket(paket, diskonKode)
    onApply({
      paket,
      diskonKode,
      wajib: jsonData.total_wajib,
      jsonData,
    })
    onClose()
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="uwaba-paket-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 bg-black bg-opacity-40 z-[60]"
        />
      )}
      {isOpen && (
        <motion.div
          key="uwaba-paket-panel"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={offcanvasTransition}
          className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[60] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="flex justify-between items-start gap-2">
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 pr-2">
                {heading}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl leading-none shrink-0"
                aria-label="Tutup"
              >
                ×
              </button>
            </div>
            <p className="mt-2 text-2xl font-bold text-teal-700 dark:text-teal-300">
              Rp {total.toLocaleString('id-ID')}
            </p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Total setelah diskon
            </p>
          </div>
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-5">
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                Paket
              </legend>
              {UWABA_PAKET_OPTIONS.map((opt) => (
                <RadioRow
                  key={opt.id}
                  name="uwaba-paket"
                  value={opt.id}
                  checked={paket === opt.id}
                  onChange={() => setPaket(opt.id)}
                  title={opt.label}
                  subtitle={`Rp ${hitungWajibPaket(opt.id, diskonKode).toLocaleString('id-ID')}`}
                />
              ))}
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                Diskon saudara
              </legend>
              {UWABA_DISKON_OPTIONS.map((opt) => (
                <RadioRow
                  key={opt.kode}
                  name="uwaba-diskon"
                  value={opt.kode}
                  checked={diskonKode === opt.kode}
                  onChange={() => setDiskonKode(opt.kode)}
                  title={opt.label}
                  subtitle={opt.pct ? `−${opt.pct}%` : 'Tanpa potongan'}
                />
              ))}
            </fieldset>
            <div className="flex gap-2 pt-2 pb-6">
              <button
                type="submit"
                className="flex-1 bg-teal-600 text-white px-3 py-2.5 text-sm font-medium rounded-lg hover:bg-teal-700"
              >
                Simpan
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 px-3 py-2.5 text-sm font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500"
              >
                Batal
              </button>
            </div>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default UwabaPaketOffcanvas
