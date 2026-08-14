import { useCallback, useEffect, useMemo, useState, Fragment } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  deleteNilaiRekapPublish,
  getKelas,
  getNilaiRekapPublish,
  listNilaiRekapPublish,
  type AbsenStatus,
  type KelasRow,
  type MapelRow,
  type NilaiRekapPublishRow,
  type NilaiRekapRow,
  type NilaiRekapTampil,
} from '../api/apiClient'
import OffcanvasNilaiRekapPublish from '../components/OffcanvasNilaiRekapPublish'
import MaterialIcon from '../components/MaterialIcon'
import { formatHijriDateDisplay, formatMasehiDateDisplay } from '../components/PickDateHijri/PickDateHijriMasehi'
import { formatMapelLabel } from '../utils/formatMapel'
import { getStoredUser } from '../utils/auth'

function isAdminAkses(akses?: string) {
  return akses === 'super_admin' || akses === 'admin'
}

function formatKelasLabel(nama?: string | null, kel?: string | null) {
  if (!nama) return '—'
  return kel ? `${nama} · ${kel}` : nama
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

function shortMapelHeader(m: MapelRow) {
  const fan = m.fan || ''
  const kitab = m.kitab_nama || ''
  if (fan && kitab) return `${fan}\n${kitab}`
  return fan || kitab || formatMapelLabel(m)
}

const ABSEN_CLASS: Record<AbsenStatus, string> = {
  H: 'text-emerald-600 dark:text-emerald-400 font-semibold',
  S: 'text-amber-600 dark:text-amber-400 font-semibold',
  I: 'text-blue-600 dark:text-blue-400 font-semibold',
  A: 'text-red-600 dark:text-red-400 font-semibold',
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

export default function NilaiHasilRekapPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const user = getStoredUser()
  const akses = user?.akses || ''
  const isAdmin = isAdminAkses(akses)

  const [kelasList, setKelasList] = useState<KelasRow[]>([])
  const [list, setList] = useState<NilaiRekapPublishRow[]>([])
  const [detail, setDetail] = useState<NilaiRekapPublishRow | null>(null)
  const [mapel, setMapel] = useState<MapelRow[]>([])
  const [baris, setBaris] = useState<NilaiRekapRow[]>([])
  const [locked, setLocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [tampil, setTampil] = useState<NilaiRekapTampil>('nilai')

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
    const res = await listNilaiRekapPublish(akses)
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
    const res = await getNilaiRekapPublish(id, akses)
    if (!res.success || !res.data) {
      setDetail(null)
      setMapel([])
      setBaris([])
      setError(res.message || 'Gagal memuat detail')
      setLoading(false)
      return
    }
    setDetail(res.data)
    setMapel(res.mapel || [])
    setBaris(res.baris || [])
    setTampil((res.data.tampil as NilaiRekapTampil) || 'nilai')
    setLocked(Boolean(res.meta?.locked) || (!res.data.can_view_content && !isAdmin))
    setLoading(false)
  }, [akses, id, isAdmin])

  useEffect(() => {
    if (id) void loadDetail()
    else void loadList()
  }, [id, loadDetail, loadList])

  const countdown = useCountdown(detail?.publish_at, Boolean(id && detail && !detail.is_live))
  useEffect(() => {
    if (id && detail && !detail.is_live && countdown.done) void loadDetail()
  }, [id, detail, countdown.done, loadDetail])

  const handleDelete = async () => {
    if (!id || !isAdmin) return
    if (!window.confirm('Hapus publish rekap nilai ini?')) return
    setDeleting(true)
    const res = await deleteNilaiRekapPublish(id, akses)
    setDeleting(false)
    if (!res.success) {
      setError(res.message || 'Gagal menghapus')
      return
    }
    navigate('/nilai/hasil-rekap', { replace: true })
  }

  const showNilai = tampil === 'nilai' || tampil === 'keduanya'
  const showKelasCol = useMemo(() => {
    const ids = new Set(baris.map((b) => b.kelas_id).filter(Boolean))
    return ids.size > 1
  }, [baris])
  const showContent = Boolean(detail && (detail.can_view_content || isAdmin) && baris.length > 0)

  if (id) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-4 text-sm"
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <Link
              to="/nilai/hasil-rekap"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline mb-1 inline-flex items-center gap-1"
            >
              <MaterialIcon name="arrow_back" size={14} /> Daftar Hasil Rekap Nilai
            </Link>
            <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {detail?.judul || 'Detail Hasil Rekap Nilai'}
            </h1>
            {detail && (
              <p className="text-xs ui-text-muted mt-0.5">
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
                className="px-3 py-2 text-xs ui-btn-primary inline-flex items-center gap-1"
              >
                <MaterialIcon name="edit" size={16} /> Edit
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="px-3 py-2 text-xs ui-btn-secondary text-red-600 dark:text-red-400 disabled:opacity-50"
              >
                {deleting ? 'Menghapus…' : 'Hapus'}
              </button>
            </div>
          )}
        </div>

        {error && <div className="ui-error-box px-3 py-2 text-xs">{error}</div>}
        {loading && <p className="text-xs ui-text-muted">Memuat…</p>}

        {!loading && detail && (
          <div className="space-y-3">
            <div className="ui-card p-3 space-y-1 text-xs">
              <p className="m-0">
                <span className="ui-text-muted">Tayang:</span>{' '}
                <span className="font-medium">{formatPublishAt(detail.publish_at)}</span>
                {!detail.is_live ? (
                  <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-200">
                    Belum tayang
                  </span>
                ) : (
                  <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-200">
                    Live
                  </span>
                )}
              </p>
              {detail.publisher_nama && <p className="m-0 ui-text-muted">Oleh: {detail.publisher_nama}</p>}
              {detail.catatan && <p className="m-0 pt-2 border-t ui-divider">{detail.catatan}</p>}
            </div>

            {!detail.is_live && <CountdownBox publishAt={detail.publish_at} />}

            {locked && !isAdmin && (
              <p className="text-xs ui-text-muted italic text-center py-6">
                Tabel rekap terkunci sampai waktu publish.
              </p>
            )}

            {showContent && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ['nilai', 'Nilai'],
                      ['absen', 'Absen'],
                      ['keduanya', 'Nilai & Absen'],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setTampil(v)}
                      className={`px-2.5 py-1 text-xs rounded-md border transition ${
                        tampil === v
                          ? 'border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300 font-medium'
                          : 'ui-divider ui-text-muted'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="ui-table-wrap">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                      <thead className="ui-table-head">
                        <tr>
                          <th className="px-1 py-1.5 text-center w-8" rowSpan={tampil === 'keduanya' ? 2 : 1}>
                            No
                          </th>
                          {showKelasCol && (
                            <th className="px-2 py-1.5" rowSpan={tampil === 'keduanya' ? 2 : 1}>
                              Kelas
                            </th>
                          )}
                          <th
                            className="px-2 py-1.5 sticky left-0 bg-inherit"
                            rowSpan={tampil === 'keduanya' ? 2 : 1}
                          >
                            Nama
                          </th>
                          {mapel.map((m) =>
                            tampil === 'keduanya' ? (
                              <th
                                key={m.id}
                                className="px-1 py-1.5 text-center border-l ui-divider whitespace-pre-line leading-tight"
                                colSpan={2}
                              >
                                {shortMapelHeader(m)}
                              </th>
                            ) : (
                              <th
                                key={m.id}
                                className="px-1 py-1.5 text-center border-l ui-divider whitespace-pre-line leading-tight"
                              >
                                {shortMapelHeader(m)}
                              </th>
                            )
                          )}
                        </tr>
                        {tampil === 'keduanya' && (
                          <tr>
                            {mapel.map((m) => (
                              <Fragment key={m.id}>
                                <th className="px-1 py-1 text-center border-l ui-divider ui-text-muted">N</th>
                                <th className="px-1 py-1 text-center ui-text-muted">A</th>
                              </Fragment>
                            ))}
                          </tr>
                        )}
                      </thead>
                      <tbody className="ui-table-body">
                        {baris.map((row, idx) => (
                          <tr key={`${row.santri_id}-${row.kelas_id}`} className="ui-table-row">
                            <td className="px-1 py-1.5 text-center ui-text-muted tabular-nums">{idx + 1}</td>
                            {showKelasCol && (
                              <td className="px-2 py-1.5">{formatKelasLabel(row.nama_kelas, row.kel)}</td>
                            )}
                            <td className="px-2 py-1.5 sticky left-0 bg-inherit font-medium">{row.nama}</td>
                            {mapel.map((m) => {
                              const cell = row.cells?.[m.id]
                              if (tampil === 'keduanya') {
                                return (
                                  <Fragment key={m.id}>
                                    <td className="px-1 py-1.5 text-center border-l ui-divider tabular-nums">
                                      {cell?.nilai != null ? cell.nilai : '—'}
                                    </td>
                                    <td className="px-1 py-1.5 text-center">
                                      {cell?.absen ? (
                                        <span className={ABSEN_CLASS[cell.absen as AbsenStatus] || ''}>
                                          {cell.absen}
                                        </span>
                                      ) : (
                                        '—'
                                      )}
                                    </td>
                                  </Fragment>
                                )
                              }
                              if (showNilai) {
                                return (
                                  <td key={m.id} className="px-1 py-1.5 text-center border-l ui-divider tabular-nums">
                                    {cell?.nilai != null ? cell.nilai : '—'}
                                  </td>
                                )
                              }
                              return (
                                <td key={m.id} className="px-1 py-1.5 text-center border-l ui-divider">
                                  {cell?.absen ? (
                                    <span className={ABSEN_CLASS[cell.absen as AbsenStatus] || ''}>{cell.absen}</span>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {isAdmin && detail && (
          <OffcanvasNilaiRekapPublish
            open={editOpen}
            onClose={() => setEditOpen(false)}
            onSaved={() => void loadDetail()}
            kelasList={kelasList}
            editRow={detail}
            editMapel={mapel}
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
      className="space-y-4 text-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <Link
            to="/nilai/rekap"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline mb-1 inline-flex items-center gap-1"
          >
            <MaterialIcon name="arrow_back" size={14} /> Rekap Nilai
          </Link>
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Hasil Rekap Nilai</h1>
          <p className="text-xs ui-text-muted mt-0.5">
            {isAdmin
              ? 'Semua publish rekap nilai (termasuk belum tayang).'
              : 'Rekap nilai yang sudah dipublish beserta nilai per mapel.'}
          </p>
        </div>
        <Link to="/nilai/rekap" className="px-3 py-2 text-xs ui-btn-secondary shrink-0 inline-flex items-center gap-1">
          <MaterialIcon name="analytics" size={16} /> Rekap Live
        </Link>
      </div>

      {error && <div className="ui-error-box px-3 py-2 text-xs">{error}</div>}
      {loading && <p className="text-xs ui-text-muted">Memuat…</p>}

      {!loading && list.length === 0 && (
        <div className="ui-card p-8 text-center text-xs ui-text-muted">Belum ada hasil rekap nilai.</div>
      )}

      {!loading && list.length > 0 && (
        <ul className="space-y-2 m-0 p-0 list-none">
          {list.map((row) => (
            <li key={row.id}>
              <Link
                to={`/nilai/hasil-rekap/${row.id}`}
                className="ui-card p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 hover:bg-slate-50/80 dark:hover:bg-white/5 transition no-underline"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 dark:text-slate-50 truncate text-sm">{row.judul}</div>
                  <div className="text-[11px] ui-text-muted mt-0.5">
                    {row.kelas_label || '—'} · {formatMasehiDateDisplay(row.tanggal_awal)} —{' '}
                    {formatMasehiDateDisplay(row.tanggal_akhir)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-[11px]">
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
                  <MaterialIcon name="chevron_right" size={16} className="ui-text-muted" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  )
}
