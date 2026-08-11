import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { pendaftaranAPI } from '../../../services/api'
import { mapTesMadinRowToState } from '../print/raporTesMadinUtils'
import {
  buildTesMasukWorkbookFromPendaftar,
  cloneWorkbookData,
  validateAndExtractTesMasukUpdates,
} from '../utils/tesMasukExcelUtils'
import './TesMasukExcelEditorModal.css'

const Workbook = lazy(async () => {
  await import('@fortune-sheet/react/dist/index.css')
  const mod = await import('@fortune-sheet/react')
  return { default: mod.Workbook }
})

export default function TesMasukExcelEditorModal({
  open,
  pendaftarList,
  tahunHijriyah = '',
  tahunMasehi = '',
  onClose,
  onApply,
  onNotify,
}) {
  const workbookRef = useRef(null)
  const [workbookData, setWorkbookData] = useState([])
  const [editorSessionKey, setEditorSessionKey] = useState(0)
  const [applyErrors, setApplyErrors] = useState([])
  const [applyWarnings, setApplyWarnings] = useState([])
  const [tesFormMap, setTesFormMap] = useState({})
  const [loadingTes, setLoadingTes] = useState(false)

  useEffect(() => {
    if (!open || !pendaftarList?.length) {
      setTesFormMap({})
      return undefined
    }

    const th = String(tahunHijriyah ?? '').trim()
    const tm = String(tahunMasehi ?? '').trim()
    if (!th || !tm) {
      setTesFormMap({})
      return undefined
    }

    let cancelled = false
    setLoadingTes(true)

    ;(async () => {
      const map = {}
      await Promise.all(
        pendaftarList.map(async (p) => {
          const sid = Number(p.id ?? p.id_santri)
          if (!Number.isFinite(sid) || sid <= 0) return
          try {
            const res = await pendaftaranAPI.getTesMadin(sid, th, tm, p.id_registrasi ?? null)
            if (res?.success && res.data) {
              const mapped = mapTesMadinRowToState(res.data)
              if (mapped) map[sid] = mapped
            }
          } catch {
            /* abaikan baris gagal muat */
          }
        })
      )
      if (!cancelled) {
        setTesFormMap(map)
        setLoadingTes(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, pendaftarList, tahunHijriyah, tahunMasehi])

  const { sheets, meta } = useMemo(
    () => buildTesMasukWorkbookFromPendaftar(pendaftarList, tesFormMap),
    [pendaftarList, tesFormMap]
  )

  useEffect(() => {
    if (!open || loadingTes) return
    setEditorSessionKey((k) => k + 1)
    setWorkbookData(cloneWorkbookData(sheets))
    setApplyErrors([])
    setApplyWarnings([])
  }, [open, sheets, loadingTes])

  const handleApply = () => {
    const latest = workbookRef.current?.getAllSheets?.()
    const source = Array.isArray(latest) && latest.length > 0 ? latest : workbookData
    const result = validateAndExtractTesMasukUpdates(source, meta, pendaftarList, tesFormMap)
    setApplyWarnings(result.warnings || [])
    if (!result.ok) {
      setApplyErrors(result.errors)
      return
    }
    setApplyErrors([])
    onApply(result.updates)
    if (result.warnings?.length && typeof onNotify === 'function') {
      const preview = result.warnings.slice(0, 2).join(' ')
      const more = result.warnings.length > 2 ? ` (+${result.warnings.length - 2} lainnya)` : ''
      onNotify(`${preview}${more}`, 'info')
    }
    onClose()
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed left-0 right-0 bottom-0 z-[251] h-[85vh] sm:h-[88vh] bg-white dark:bg-gray-900 rounded-t-2xl border-t border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 flex-shrink-0">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">Excel Editor Tes Masuk</h3>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                  Menampilkan {pendaftarList?.length ?? 0} pendaftar sesuai filter. Nilai tes yang sudah ada ikut dimuat; paste baris baru lewat NIS.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-xs sm:text-sm"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={loadingTes}
                  className="px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs sm:text-sm font-medium"
                >
                  {loadingTes ? 'Memuat data…' : 'Terapkan & Simpan'}
                </button>
              </div>
            </div>

            {(applyErrors.length > 0 || applyWarnings.length > 0) && (
              <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 max-h-[28vh] overflow-y-auto space-y-2">
                {applyErrors.length > 0 && (
                  <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2">
                    <p className="text-xs font-semibold text-red-800 dark:text-red-200 mb-1">Validasi gagal — perbaiki lalu Terapkan lagi</p>
                    <ul className="text-[11px] text-red-700 dark:text-red-300 space-y-0.5 list-disc pl-4">
                      {applyErrors.map((msg, i) => (
                        <li key={`err-${i}`}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {applyWarnings.length > 0 && applyErrors.length === 0 && (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
                    <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 mb-1">Catatan</p>
                    <ul className="text-[11px] text-amber-800 dark:text-amber-300 space-y-0.5 list-disc pl-4">
                      {applyWarnings.map((msg, i) => (
                        <li key={`warn-${i}`}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="excel-tes-masuk-editor flex-1 min-h-0">
              {loadingTes ? (
                <div className="h-full flex items-center justify-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
                </div>
              ) : (
                <Suspense
                  fallback={
                    <div className="h-full flex items-center justify-center">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
                    </div>
                  }
                >
                  <Workbook
                    key={`tes-masuk-excel-editor-${editorSessionKey}`}
                    ref={workbookRef}
                    data={workbookData}
                    onChange={setWorkbookData}
                  />
                </Suspense>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
