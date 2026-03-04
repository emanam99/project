import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const STORAGE_KEY = 'daftar_prodi'
const STORAGE_FORMAL = 'daftar_formal'

const OPSI_PRODI = [
  { value: 'MPI', label: 'MPI', desc: 'Manajemen Pendidikan Islam' },
  { value: 'ES', label: 'ES', desc: 'Ekonomi Syariah' },
  { value: 'PGMI', label: 'PGMI', desc: 'Pendidikan Guru Madrasah Ibtidaiyah' }
]

// Halaman ini hanya muncul jika daftar formal STAI
function PilihanProdi() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState('')
  const [showPage, setShowPage] = useState(false)

  useEffect(() => {
    const formal = localStorage.getItem(STORAGE_FORMAL)
    if (formal !== 'STAI') {
      navigate('/dashboard', { replace: true, state: { direction: 'forward' } })
    } else {
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
    // STAI: setelah pilih prodi, lanjut ke Pilihan Status Santri (Mukim/Khoriji)
    navigate('/pilihan-status-santri', { replace: true, state: { direction: 'forward' } })
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
          Pilih Prodi (STAI)
        </h1>

        <div className="space-y-2">
          {OPSI_PRODI.map((o) => (
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
                name="prodi"
                value={o.value}
                checked={selected === o.value}
                onChange={() => setSelected(o.value)}
                className="mt-1 h-4 w-4 text-primary-600 border-gray-300 dark:border-gray-500 focus:ring-primary-500"
              />
              <div>
                <span className="font-medium text-gray-800 dark:text-white block">{o.label}</span>
                <span className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 block">{o.desc}</span>
              </div>
            </label>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate('/pilihan-status-murid', { replace: true, state: { direction: 'back' } })}
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

export default PilihanProdi
export { STORAGE_KEY, OPSI_PRODI }
