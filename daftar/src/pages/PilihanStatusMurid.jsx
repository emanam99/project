import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const STORAGE_KEY = 'daftar_status_murid'
const STORAGE_FORMAL = 'daftar_formal'

const OPSI_BY_FORMAL = {
  SMP: [
    { value: 'Murid Baru', label: 'Murid Baru' },
    { value: 'Pindahan kelas 7', label: 'Pindahan kelas 7' },
    { value: 'Pindahan kelas 8', label: 'Pindahan kelas 8' },
    { value: 'Pindahan kelas 9', label: 'Pindahan kelas 9' }
  ],
  MTs: [
    { value: 'Murid Baru', label: 'Murid Baru' },
    { value: 'Pindahan kelas 7', label: 'Pindahan kelas 7' },
    { value: 'Pindahan kelas 8', label: 'Pindahan kelas 8' },
    { value: 'Pindahan kelas 9', label: 'Pindahan kelas 9' }
  ],
  SMAI: [
    { value: 'Murid Baru', label: 'Murid Baru' },
    { value: 'Pindahan kelas 10', label: 'Pindahan kelas 10' },
    { value: 'Pindahan kelas 11', label: 'Pindahan kelas 11' },
    { value: 'Pindahan kelas 12', label: 'Pindahan kelas 12' }
  ],
  // Alias jenjang SMA (sama opsi dengan SMAI)
  SMA: [
    { value: 'Murid Baru', label: 'Murid Baru' },
    { value: 'Pindahan kelas 10', label: 'Pindahan kelas 10' },
    { value: 'Pindahan kelas 11', label: 'Pindahan kelas 11' },
    { value: 'Pindahan kelas 12', label: 'Pindahan kelas 12' }
  ],
  STAI: [
    { value: 'Mahasiswa Baru', label: 'Mahasiswa Baru' },
    { value: 'Mahasiswa Pindahan', label: 'Mahasiswa Pindahan' }
  ]
}

const FORMAL_SHOW_STATUS_MURID = ['SMP', 'MTs', 'SMAI', 'SMA', 'STAI']

/** Opsi status murid sesuai daftar formal (hardcode; tidak dari DB kondisi). */
export function getOpsiStatusMuridForFormal(formal) {
  const f = String(formal || '').trim()
  if (!f) return []
  return OPSI_BY_FORMAL[f] || []
}

/** Tampilkan & wajibkan field status murid hanya untuk jenjang ini. */
export function shouldShowStatusMuridForFormal(formal) {
  return FORMAL_SHOW_STATUS_MURID.includes(String(formal || '').trim())
}

// Halaman ini hanya muncul jika daftar formal SMP, MTs, SMAI, atau STAI
function PilihanStatusMurid() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState('')
  const [showPage, setShowPage] = useState(false)
  const [formal, setFormal] = useState('')
  const [options, setOptions] = useState([])

  useEffect(() => {
    const formalVal = localStorage.getItem(STORAGE_FORMAL)
    setFormal(formalVal || '')
    const shouldShow = FORMAL_SHOW_STATUS_MURID.includes(formalVal)
    if (!shouldShow) {
      navigate('/dashboard', { replace: true, state: { direction: 'forward' } })
    } else {
      setOptions(OPSI_BY_FORMAL[formalVal] || [])
      setShowPage(true)
    }
  }, [navigate])

  const handleLanjut = () => {
    if (!selected) return
    try {
      localStorage.setItem(STORAGE_KEY, selected)
    } catch (e) {
      console.warn('localStorage set failed:', e)
    }
    // Jika formal STAI, lanjut ke halaman Prodi; selain itu ke dashboard
    if (formal === 'STAI') {
      navigate('/pilihan-prodi', { replace: true, state: { direction: 'forward' } })
    } else {
      navigate('/dashboard', { replace: true, state: { direction: 'forward' } })
    }
  }

  if (!showPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="w-full max-w-sm space-y-3">
        <h1 className="text-center text-lg font-semibold text-gray-800 dark:text-white mb-4">
          Status Murid {formal ? `(${formal})` : ''}
        </h1>

        <div className="space-y-2">
          {options.map((o) => (
            <label
              key={o.value}
              className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                selected === o.value
                  ? 'border-primary-500 dark:border-primary-500 bg-primary-50/50 dark:bg-primary-900/20'
                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-primary-50/30 dark:hover:bg-primary-900/20'
              }`}
            >
              <input
                type="radio"
                name="statusMurid"
                value={o.value}
                checked={selected === o.value}
                onChange={() => setSelected(o.value)}
                className="mt-1 h-4 w-4 text-primary-600 border-gray-300 dark:border-gray-500 focus:ring-primary-500"
              />
              <span className="font-medium text-gray-800 dark:text-white">{o.label}</span>
            </label>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate('/pilihan-opsi-pendidikan', { replace: true, state: { direction: 'back' } })}
            className="flex-1 py-3 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors"
          >
            Kembali
          </button>
          <button
            type="button"
            onClick={handleLanjut}
            disabled={!selected}
            className="flex-1 py-3 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
          >
            Lanjut
          </button>
        </div>
      </div>
    </div>
  )
}

export default PilihanStatusMurid
export { STORAGE_KEY, OPSI_BY_FORMAL, FORMAL_SHOW_STATUS_MURID }
