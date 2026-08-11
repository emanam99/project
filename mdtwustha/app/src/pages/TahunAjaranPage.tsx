import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getTahunAjaran,
  createTahunAjaran,
  setTahunAjaranAktif,
  type TahunAjaranRow,
} from '../api/apiClient'
import { getStoredUser } from '../utils/auth'
import MaterialIcon from '../components/MaterialIcon'
import { ContentSkeleton } from '../components/LazyFallback'

function isAdminAkses(akses?: string) {
  return akses === 'super_admin' || akses === 'admin'
}

export default function TahunAjaranPage() {
  const navigate = useNavigate()
  const user = getStoredUser()
  const akses = user?.akses || ''

  const [tahunList, setTahunList] = useState<TahunAjaranRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newTahun, setNewTahun] = useState('1447')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  useEffect(() => {
    if (!user || !isAdminAkses(user.akses)) {
      navigate('/dashboard', { replace: true })
    }
  }, [user, navigate])

  const loadTahun = useCallback(async () => {
    if (!akses) return
    setLoading(true)
    const res = await getTahunAjaran(akses)
    if (res.success) setTahunList(res.data)
    else setError(res.message || 'Gagal memuat tahun ajaran')
    setLoading(false)
  }, [akses])

  useEffect(() => {
    void loadTahun()
  }, [loadTahun])

  const handleCreate = async () => {
    setOkMsg('')
    setError('')
    const y = Number(newTahun)
    if (!y || y < 1400) {
      setError('Tahun Hijriyah tidak valid')
      return
    }
    setCreating(true)
    const res = await createTahunAjaran(akses, {
      tahun_hijri_awal: y,
      aktif: tahunList.length === 0,
    })
    setCreating(false)
    if (res.success) {
      setOkMsg(res.message || 'Tahun ajaran ditambahkan')
      await loadTahun()
    } else {
      setError(res.message || 'Gagal menambah')
    }
  }

  const handleSetAktif = async (id: string | number) => {
    setOkMsg('')
    setError('')
    const res = await setTahunAjaranAktif(akses, id)
    if (res.success) {
      setOkMsg('Tahun ajaran diaktifkan')
      await loadTahun()
    } else {
      setError(res.message || 'Gagal mengaktifkan')
    }
  }

  if (!isAdminAkses(akses)) return null

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="ui-title flex items-center gap-2">
          <MaterialIcon name="calendar_month" size={24} />
          Tahun Ajaran
        </h1>
        <p className="ui-subtitle mt-1">
          Kelola tahun ajaran akademik (Dzulqa&apos;dah–Sya&apos;ban). Hanya admin.
        </p>
      </div>

      {error && <div className="ui-error-box px-3 py-2 text-sm">{error}</div>}
      {okMsg && (
        <div className="px-3 py-2 text-sm rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200">
          {okMsg}
        </div>
      )}

      <div className="ui-card p-4 sm:p-5 space-y-3">
        <h2 className="ui-text-strong text-sm">Tambah tahun ajaran</h2>
        <p className="text-xs ui-text-muted">
          Tahun Hijriyah awal Dzulqa&apos;dah. Contoh <strong>1447</strong> → label 1447/1448.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            value={newTahun}
            onChange={(e) => setNewTahun(e.target.value)}
            className="ui-input max-w-[10rem] !py-2 !text-sm"
            placeholder="1447"
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating}
            className="ui-btn-primary px-4 py-2 text-sm disabled:opacity-60"
          >
            {creating ? 'Menyimpan…' : 'Tambah'}
          </button>
        </div>
      </div>

      <div className="ui-card p-4 sm:p-5 space-y-3">
        <h2 className="ui-text-strong text-sm">Daftar tahun ajaran</h2>
        {loading ? (
          <ContentSkeleton rows={3} />
        ) : tahunList.length === 0 ? (
          <p className="text-sm ui-text-muted">Belum ada tahun ajaran</p>
        ) : (
          <ul className="space-y-2">
            {tahunList.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border ui-divider"
              >
                <span>
                  <span className="ui-text-strong">{t.label}</span>
                  {Number(t.aktif) === 1 && (
                    <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">Aktif</span>
                  )}
                </span>
                {Number(t.aktif) !== 1 && (
                  <button
                    type="button"
                    onClick={() => void handleSetAktif(t.id)}
                    className="text-xs text-blue-600 dark:text-blue-400 font-medium"
                  >
                    Jadikan aktif
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
