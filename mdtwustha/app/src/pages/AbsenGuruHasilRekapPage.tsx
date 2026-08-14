import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  deleteAbsenGuruRekapPublish,
  getAbsenGuruRekapPublish,
  getKelas,
  listAbsenGuruRekapPublish,
  type AbsenGuruRekapPublishBaris,
  type AbsenGuruRekapPublishRow,
  type KelasRow,
} from '../api/apiClient'
import OffcanvasAbsenGuruRekapPublish from '../components/OffcanvasAbsenGuruRekapPublish'
import MaterialIcon from '../components/MaterialIcon'
import { formatHijriDateDisplay, formatMasehiDateDisplay } from '../components/PickDateHijri/PickDateHijriMasehi'
import { getStoredUser } from '../utils/auth'

function isAdminAkses(akses?: string) {
  return akses === 'super_admin' || akses === 'admin'
}

function formatPublishAt(raw: string) {
  try {
    const d = new Date(raw.replace(' ', 'T'))
    if (Number.isNaN(d.getTime())) return raw
    return d.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return raw
  }
}

function useCountdown(targetAt: string | null | undefined, enabled: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled || !targetAt) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [enabled, targetAt])

  return useMemo(() => {
    if (!targetAt) return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0, done: true }
    const target = new Date(targetAt.replace(' ', 'T')).getTime()
    const total = Math.max(0, Math.floor((target - now) / 1000))
    const days = Math.floor(total / 86400)
    const hours = Math.floor((total % 86400) / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const seconds = total % 60
    return { total, days, hours, minutes, seconds, done: total <= 0 }
  }, [now, targetAt])
}

function CountdownBox({ publishAt }: { publishAt: string }) {
  const c = useCountdown(publishAt, true)
  if (c.done) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
        Rekap sudah tayang.
      </div>
    )
  }
  const parts = [
    { label: 'Hari', value: c.days },
    { label: 'Jam', value: c.hours },
    { label: 'Menit', value: c.minutes },
    { label: 'Detik', value: c.seconds },
  ]
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 space-y-3">
      <p className="text-sm text-amber-900 dark:text-amber-100 font-medium m-0">
        Belum waktunya tayang. Hitung mundur hingga {formatPublishAt(publishAt)}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {parts.map((p) => (
          <div key={p.label} className="text-center rounded-lg bg-white/60 dark:bg-black/20 px-2 py-2">
            <div className="text-xl font-bold tabular-nums text-slate-800 dark:text-slate-50">
              {String(p.value).padStart(2, '0')}
            </div>
            <div className="text-[10px] uppercase tracking-wide ui-text-muted">{p.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AbsenGuruHasilRekapPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const user = getStoredUser()
  const akses = user?.akses || ''
  const isAdmin = isAdminAkses(akses)

  const [kelasList, setKelasList] = useState<KelasRow[]>([])
  const [list, setList] = useState<AbsenGuruRekapPublishRow[]>([])
  const [detail, setDetail] = useState<AbsenGuruRekapPublishRow | null>(null)
  const [baris, setBaris] = useState<AbsenGuruRekapPublishBaris[]>([])
  const [locked, setLocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!user) navigate('/login', { replace: true })
  }, [user, navigate])

  useEffect(() => {
    getKelas().then((res) => {
      if (res.success) setKelasList(res.data)
    })
  }, [])

  const loadList = useCallback(async () => {
    if (!akses) return
    setLoading(true)
    setError('')
    const res = await listAbsenGuruRekapPublish(akses)
    if (!res.success) {
      setList([])
      setError(res.message || 'Gagal memuat daftar')
    } else {
      setList(res.data)
    }
    setLoading(false)
  }, [akses])

  const loadDetail = useCallback(async () => {
    if (!akses || !id) return
    setLoading(true)
    setError('')
    const res = await getAbsenGuruRekapPublish(id, akses)
    if (!res.success || !res.data) {
      setDetail(null)
      setBaris([])
      setError(res.message || 'Gagal memuat detail')
      setLoading(false)
      return
    }
    setDetail(res.data)
    setBaris(res.baris || [])
    setLocked(Boolean(res.meta?.locked) || (!res.data.can_view_content && !isAdmin))
    setLoading(false)
  }, [akses, id, isAdmin])

  useEffect(() => {
    if (id) void loadDetail()
    else void loadList()
  }, [id, loadDetail, loadList])

  const countdown = useCountdown(detail?.publish_at, Boolean(id && detail && !detail.is_live))
  useEffect(() => {
    if (id && detail && !detail.is_live && countdown.done) {
      void loadDetail()
    }
  }, [id, detail, countdown.done, loadDetail])

  const handleDelete = async () => {
    if (!id || !isAdmin) return
    if (!window.confirm('Hapus publish rekap guru ini? Tanggal akan bisa dipakai ulang.')) return
    setDeleting(true)
    const res = await deleteAbsenGuruRekapPublish(id, akses)
    setDeleting(false)
    if (!res.success) {
      setError(res.message || 'Gagal menghapus')
      return
    }
    navigate('/absen-guru/hasil-rekap', { replace: true })
  }

  const showContent = Boolean(detail && (detail.can_view_content || isAdmin) && baris.length > 0)

  if (id) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <Link
              to="/absen-guru/hasil-rekap"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-2 inline-flex items-center gap-1"
            >
              <MaterialIcon name="arrow_back" size={14} /> Daftar Hasil Rekap Guru
            </Link>
            <h1 className="ui-title-lg">{detail?.judul || 'Detail Hasil Rekap Guru'}</h1>
            {detail && (
              <p className="ui-subtitle mt-1">
                {detail.kelas_label || '—'} · {formatMasehiDateDisplay(detail.tanggal_awal)} —{' '}
                {formatMasehiDateDisplay(detail.tanggal_akhir)}
                {detail.hijri_awal || detail.hijri_akhir
                  ? ` (${formatHijriDateDisplay(detail.hijri_awal || '') || '…'} — ${formatHijriDateDisplay(detail.hijri_akhir || '') || '…'})`
                  : ''}
              </p>
            )}
          </div>
          {isAdmin && detail && (
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="px-4 py-2.5 text-sm ui-btn-primary inline-flex items-center gap-1.5"
              >
                <MaterialIcon name="edit" size={18} /> Edit
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="px-4 py-2.5 text-sm ui-btn-secondary text-red-600 dark:text-red-400 disabled:opacity-50"
              >
                {deleting ? 'Menghapus…' : 'Hapus'}
              </button>
            </div>
          )}
        </div>

        {error && <div className="ui-error-box px-4 py-3 text-sm">{error}</div>}
        {loading && <p className="text-sm ui-text-muted">Memuat…</p>}

        {!loading && detail && (
          <div className="space-y-4">
            <div className="ui-card p-4 sm:p-5 space-y-2 text-sm">
              <p className="m-0">
                <span className="ui-text-muted">Tayang:</span>{' '}
                <span className="font-medium text-slate-800 dark:text-slate-100">
                  {formatPublishAt(detail.publish_at)}
                </span>
                {!detail.is_live && (
                  <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-200">
                    Belum tayang
                  </span>
                )}
                {detail.is_live && (
                  <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-200">
                    Live
                  </span>
                )}
              </p>
              {detail.publisher_nama && (
                <p className="m-0 ui-text-muted">Oleh: {detail.publisher_nama}</p>
              )}
              {detail.catatan && (
                <p className="m-0 pt-2 border-t ui-divider text-slate-700 dark:text-slate-200">{detail.catatan}</p>
              )}
            </div>

            {!detail.is_live && <CountdownBox publishAt={detail.publish_at} />}

            {locked && !isAdmin && (
              <p className="text-sm ui-text-muted italic text-center py-6">
                Tabel rekap terkunci sampai waktu publish.
              </p>
            )}

            {showContent && (
              <div className="ui-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm min-w-[420px]">
                    <thead className="ui-table-head">
                      <tr>
                        <th className="px-3 py-2.5">No</th>
                        <th className="px-3 py-2.5">Nama Guru</th>
                        <th className="px-2 py-2.5 text-center">Mengajar</th>
                        <th className="px-2 py-2.5 text-center">Izin</th>
                        <th className="px-2 py-2.5 text-center">Sakit</th>
                      </tr>
                    </thead>
                    <tbody className="ui-table-body">
                      {baris.map((b, idx) => (
                        <tr key={b.pengurus_id} className="ui-table-row">
                          <td className="px-3 py-2 ui-text-muted tabular-nums">{idx + 1}</td>
                          <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">
                            {b.pengurus_nama}
                          </td>
                          <td className="px-2 py-2 text-center tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                            {b.mengajar}
                          </td>
                          <td className="px-2 py-2 text-center tabular-nums font-semibold text-blue-600 dark:text-blue-400">
                            {b.ijin}
                          </td>
                          <td className="px-2 py-2 text-center tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                            {b.sakit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {isAdmin && !detail.is_live && baris.length > 0 && (
              <p className="text-xs ui-text-muted">Admin: tabel di atas sudah bisa dilihat & diedit sebelum tayang.</p>
            )}
          </div>
        )}

        {isAdmin && detail && (
          <OffcanvasAbsenGuruRekapPublish
            open={editOpen}
            onClose={() => setEditOpen(false)}
            onSaved={() => void loadDetail()}
            kelasList={kelasList}
            editRow={detail}
            editBaris={baris}
          />
        )}
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <Link
            to="/absen-guru/rekap"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-2 inline-flex items-center gap-1"
          >
            <MaterialIcon name="arrow_back" size={14} /> Rekap Absen Guru
          </Link>
          <h1 className="ui-title-lg">Hasil Rekap Guru</h1>
          <p className="ui-subtitle mt-1">
            {isAdmin
              ? 'Semua publish rekap guru (termasuk yang belum tayang).'
              : 'Rekap absen guru yang sudah dipublish dan waktunya sudah tiba.'}
          </p>
        </div>
        <Link
          to="/absen-guru/rekap"
          className="px-4 py-2.5 text-sm ui-btn-secondary shrink-0 inline-flex items-center gap-1.5"
        >
          <MaterialIcon name="analytics" size={18} /> Buka Rekap Live
        </Link>
      </div>

      {error && <div className="ui-error-box px-4 py-3 text-sm">{error}</div>}
      {loading && <p className="text-sm ui-text-muted">Memuat…</p>}

      {!loading && list.length === 0 && (
        <div className="ui-card p-8 text-center text-sm ui-text-muted">Belum ada hasil rekap guru.</div>
      )}

      {!loading && list.length > 0 && (
        <ul className="space-y-2 m-0 p-0 list-none">
          {list.map((row) => (
            <li key={row.id}>
              <Link
                to={`/absen-guru/hasil-rekap/${row.id}`}
                className="ui-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 hover:bg-slate-50/80 dark:hover:bg-white/5 transition no-underline"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 dark:text-slate-50 truncate">{row.judul}</div>
                  <div className="text-xs ui-text-muted mt-0.5">
                    {row.kelas_label || '—'} · {formatMasehiDateDisplay(row.tanggal_awal)} —{' '}
                    {formatMasehiDateDisplay(row.tanggal_akhir)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-xs">
                  {!row.is_live ? (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-200">
                      Belum tayang
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-200">
                      Live
                    </span>
                  )}
                  <span className="ui-text-muted">{formatPublishAt(row.publish_at)}</span>
                  <MaterialIcon name="chevron_right" size={18} className="ui-text-muted" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  )
}
