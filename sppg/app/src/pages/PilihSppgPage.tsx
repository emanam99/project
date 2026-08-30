import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { completeTenantPick, fetchPickOptions, type TenantPickOption } from '../api/apiClient'
import { saveSession } from '../utils/auth'

export default function PilihSppgPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const pick = params.get('pick') || ''
  const [options, setOptions] = useState<TenantPickOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!pick) {
      setError('Sesi pilihan tidak valid')
      setLoading(false)
      return
    }
    void fetchPickOptions(pick).then((res) => {
      if (res.success && Array.isArray(res.data)) setOptions(res.data)
      else setError(res.message || 'Gagal memuat daftar SPPG')
      setLoading(false)
    })
  }, [pick])

  const choose = async (sppgId: number) => {
    setSubmitting(true)
    setError('')
    const res = await completeTenantPick(pick, sppgId)
    setSubmitting(false)
    if (!res.success || !res.data?.token || !res.data.user) {
      setError(res.message || 'Gagal masuk ke SPPG')
      return
    }
    saveSession(res.data.token, res.data.user)
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="min-h-dvh bg-canvas px-4 py-10">
      <div className="max-w-md mx-auto space-y-4">
        <h1 className="font-display text-2xl font-bold text-center">Pilih SPPG</h1>
        <p className="text-sm text-muted text-center">Akun Google Anda terdaftar di beberapa SPPG.</p>

        {loading ? <p className="text-center text-muted">Memuat…</p> : null}
        {error ? <p className="text-sm text-red-600 text-center">{error}</p> : null}

        <div className="space-y-2">
          {options.map((opt) => (
            <button
              key={opt.sppg_id}
              type="button"
              disabled={submitting}
              className="ui-card w-full p-4 text-left hover:border-[var(--accent)] transition"
              onClick={() => void choose(opt.sppg_id)}
            >
              <div className="font-semibold text-ink">{opt.nama_unit}</div>
              <div className="text-sm text-muted">{opt.nama_yayasan}</div>
              <div className="text-xs text-faint mt-1">{opt.slug}</div>
            </button>
          ))}
        </div>

        <p className="text-center text-sm">
          <Link to="/login" className="text-[var(--accent)]">Kembali ke login</Link>
        </p>
      </div>
    </div>
  )
}
