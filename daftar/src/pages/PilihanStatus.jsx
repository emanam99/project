import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const STORAGE_KEY = 'daftar_status_pendaftar'

const OPSI = [
  { value: 'Baru', label: 'Santri Baru', desc: 'Bagi pendaftar santri baru, yang belum pernah terdaftar sama sekali.' },
  { value: 'Lama', label: 'Santri Lama', desc: 'Bagi santri yang sudah terdaftar, dan ingin mendaftar sekolah formal/Diniyah jenjang selanjutnya.' }
]

function PilihanStatus() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [selected, setSelected] = useState('')

  // NIK sudah ada di santri → lewati page ini, set Santri Lama dan langsung ke opsi pendidikan
  const skipPage = !!(user && user.id != null && user.id !== '')
  useEffect(() => {
    if (skipPage) {
      try {
        localStorage.setItem(STORAGE_KEY, 'Lama')
      } catch (e) { /* ignore */ }
      navigate('/pilihan-opsi-pendidikan', { replace: true, state: { direction: 'forward' } })
    }
  }, [skipPage, navigate])

  if (skipPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  const handleLanjut = () => {
    if (!selected) return
    try {
      localStorage.setItem(STORAGE_KEY, selected)
    } catch (e) {
      console.warn('localStorage set failed:', e)
    }
    navigate('/pilihan-opsi-pendidikan', { replace: true, state: { direction: 'forward' } })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="w-full max-w-sm space-y-3">
        <h1 className="text-center text-lg font-semibold text-gray-800 dark:text-white mb-4">
          Pilih Status Pendaftaran
        </h1>

        <div className="space-y-2">
          {OPSI.map((o) => (
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
                name="status"
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

        <button
          type="button"
          onClick={handleLanjut}
          disabled={!selected}
          className="w-full py-3 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
        >
          Lanjut
        </button>
      </div>
    </div>
  )
}

export default PilihanStatus
export { STORAGE_KEY }
