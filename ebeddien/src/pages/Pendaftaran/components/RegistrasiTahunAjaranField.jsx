import { useState, useEffect } from 'react'
import TahunAjaranPageFilterBar from '../../../components/TahunAjaran/TahunAjaranPageFilterBar'

/**
 * Baris tahun hijriyah & masehi di accordion pembayaran — tampilan label + edit inline.
 */
function RegistrasiTahunAjaranField({
  hijriyah = '',
  masehi = '',
  hijriyahOptions = [],
  masehiOptions = [],
  canEdit = false,
  saving = false,
  onSave
}) {
  const [editing, setEditing] = useState(false)
  const [draftH, setDraftH] = useState(hijriyah)
  const [draftM, setDraftM] = useState(masehi)

  useEffect(() => {
    if (!editing) {
      setDraftH(hijriyah)
      setDraftM(masehi)
    }
  }, [hijriyah, masehi, editing])

  const cancel = () => {
    setDraftH(hijriyah)
    setDraftM(masehi)
    setEditing(false)
  }

  const handleSave = async () => {
    const h = String(draftH || '').trim()
    const m = String(draftM || '').trim()
    if (!h || !m) return
    const ok = await onSave?.(h, m)
    if (ok !== false) {
      setEditing(false)
    }
  }

  const showH = hijriyah || '–'
  const showM = masehi || '–'

  return (
    <div className="flex gap-1.5 items-start">
      <div className="flex-1 space-y-2 min-w-0">
        {!editing ? (
          <>
            <div className="flex justify-between items-center text-xs gap-2">
              <span className="text-gray-500 dark:text-gray-400 shrink-0">Tahun Hijriyah</span>
              <span className="text-gray-700 dark:text-gray-300 text-right truncate">{showH}</span>
            </div>
            <div className="flex justify-between items-center text-xs gap-2">
              <span className="text-gray-500 dark:text-gray-400 shrink-0">Tahun Masehi</span>
              <span className="text-gray-700 dark:text-gray-300 text-right truncate">{showM}</span>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <TahunAjaranPageFilterBar
              variant="dual"
              hideLabels
              inlineToolbar
              showHint={false}
              selectedHijriyah={draftH}
              selectedMasehi={draftM}
              onHijriyahChange={setDraftH}
              onMasehiChange={setDraftM}
              hijriyahOptions={hijriyahOptions}
              masehiOptions={masehiOptions}
              className="!flex-wrap"
            />
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={cancel}
                disabled={saving}
                className="px-2 py-1 text-[11px] rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !String(draftH || '').trim() || !String(draftM || '').trim()}
                className="px-2 py-1 text-[11px] rounded-md bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </div>
        )}
      </div>

      {canEdit && !editing ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="p-1 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-teal-600 dark:hover:text-teal-400 flex-shrink-0 mt-0.5"
          title="Ubah tahun ajaran registrasi"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
      ) : null}
    </div>
  )
}

export default RegistrasiTahunAjaranField
