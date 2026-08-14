import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  deleteRekapPublish,
  getRekapPublish,
  listRekapPublish,
  type AbsenStatus,
  type MapelRow,
  type NilaiRekapRow,
  type NilaiRekapTampil,
  type RekapPublishAbsenBaris,
  type RekapPublishRow,
} from '../api/apiClient'
import MaterialIcon from '../components/MaterialIcon'
import { formatHijriDateDisplay, formatMasehiDateDisplay } from '../components/PickDateHijri/PickDateHijriMasehi'
import { getStoredUser } from '../utils/auth'
import { buildFanColumns, cellForFan, enrichMapelKelasIds } from '../utils/nilaiFanColumns'

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

function formatPeriode(
  awal: string,
  akhir: string,
  hijriAwal?: string | null,
  hijriAkhir?: string | null
) {
  const m = `${formatMasehiDateDisplay(awal)} — ${formatMasehiDateDisplay(akhir)}`
  if (hijriAwal || hijriAkhir) {
    return `${m} (${formatHijriDateDisplay(hijriAwal || '') || '…'} — ${formatHijriDateDisplay(hijriAkhir || '') || '…'})`
  }
  return m
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

export default function RekapHasilPublishPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const user = getStoredUser()
  const akses = user?.akses || ''
  const isAdmin = isAdminAkses(akses)

  const [list, setList] = useState<RekapPublishRow[]>([])
  const [detail, setDetail] = useState<RekapPublishRow | null>(null)
  const [mapel, setMapel] = useState<MapelRow[]>([])
  const [barisNilai, setBarisNilai] = useState<NilaiRekapRow[]>([])
  const [barisAbsen, setBarisAbsen] = useState<RekapPublishAbsenBaris[]>([])
  const [locked, setLocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [tampil, setTampil] = useState<NilaiRekapTampil>('nilai')
  const [filterKelasId, setFilterKelasId] = useState('')

  useEffect(() => {
    if (!user) navigate('/login', { replace: true })
  }, [user, navigate])

  useEffect(() => {
    setFilterKelasId('')
  }, [id])

  const loadList = useCallback(async () => {
    if (!akses) return
    setLoading(true)
    setError('')
    const res = await listRekapPublish(akses)
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
    const res = await getRekapPublish(id, akses)
    if (!res.success || !res.data) {
      setDetail(null)
      setMapel([])
      setBarisNilai([])
      setBarisAbsen([])
      setError(res.message || 'Gagal memuat detail')
      setLoading(false)
      return
    }
    setDetail(res.data)
    setMapel(res.mapel || [])
    setBarisNilai(res.baris_nilai || [])
    setBarisAbsen(res.baris_absen || [])
    setTampil((res.data.tampil_nilai as NilaiRekapTampil) || 'nilai')
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
    if (!window.confirm('Hapus publish rekap gabungan ini? Tanggal akan bisa dipakai ulang.')) return
    setDeleting(true)
    const res = await deleteRekapPublish(id, akses)
    setDeleting(false)
    if (!res.success) {
      setError(res.message || 'Gagal menghapus')
      return
    }
    navigate('/rekap/hasil', { replace: true })
  }

  const showNilai = tampil === 'nilai' || tampil === 'keduanya'
  const showAbsenInNilai = tampil === 'absen' || tampil === 'keduanya'

  const kelasOptions = useMemo(() => {
    const map = new Map<string, string>()
    const ids = (detail?.kelas_ids || []).map(String)
    const labels = detail?.kelas_labels || []
    ids.forEach((kid, i) => {
      if (kid) map.set(kid, labels[i] || kid)
    })
    for (const b of [...barisNilai, ...barisAbsen]) {
      const kid = String(b.kelas_id || '')
      if (!kid || map.has(kid)) continue
      const label = [b.nama_kelas, b.kel].filter(Boolean).join(' · ') || kid
      map.set(kid, label)
    }
    return Array.from(map.entries()).map(([kid, label]) => ({ id: kid, label }))
  }, [detail, barisNilai, barisAbsen])

  const barisNilaiTampil = useMemo(() => {
    if (!filterKelasId) return barisNilai
    const fid = String(filterKelasId)
    return barisNilai.filter((b) => String(b.kelas_id || '') === fid)
  }, [barisNilai, filterKelasId])

  const barisAbsenTampil = useMemo(() => {
    if (!filterKelasId) return barisAbsen
    const fid = String(filterKelasId)
    return barisAbsen.filter((b) => String(b.kelas_id || '') === fid)
  }, [barisAbsen, filterKelasId])

  const showKelasColNilai = !filterKelasId && kelasOptions.length > 1
  const showKelasColAbsen = !filterKelasId && kelasOptions.length > 1
  const showContent = Boolean(
    detail && (detail.can_view_content || isAdmin) && (barisNilai.length > 0 || barisAbsen.length > 0)
  )
  const mapelEnrich = useMemo(
    () => enrichMapelKelasIds(mapel, barisNilai),
    [mapel, barisNilai]
  )
  const fanColumns = useMemo(
    () => buildFanColumns(mapelEnrich, filterKelasId),
    [mapelEnrich, filterKelasId]
  )

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
              to="/rekap/hasil"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline mb-1 inline-flex items-center gap-1"
            >
              <MaterialIcon name="arrow_back" size={14} /> Daftar Hasil Rekap
            </Link>
            <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {detail?.judul || 'Detail Hasil Rekap'}
            </h1>
            {detail && (
              <p className="text-xs ui-text-muted mt-0.5">{detail.kelas_label || '—'}</p>
            )}
          </div>
          {isAdmin && detail && (
            <div className="flex flex-wrap gap-2 shrink-0">
              <Link
                to={`/rekap/publish/${detail.id}`}
                className="px-3 py-2 text-xs ui-btn-primary inline-flex items-center gap-1"
              >
                <MaterialIcon name="edit" size={16} /> Edit
              </Link>
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
            <div className="ui-card p-3 space-y-1.5 text-xs">
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
              <p className="m-0">
                <span className="ui-text-muted">Periode nilai:</span>{' '}
                {formatPeriode(
                  detail.nilai_tanggal_awal,
                  detail.nilai_tanggal_akhir,
                  detail.nilai_hijri_awal,
                  detail.nilai_hijri_akhir
                )}
              </p>
              <p className="m-0">
                <span className="ui-text-muted">Periode absen:</span>{' '}
                {formatPeriode(
                  detail.absen_tanggal_awal,
                  detail.absen_tanggal_akhir,
                  detail.absen_hijri_awal,
                  detail.absen_hijri_akhir
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
                {kelasOptions.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-[11px] ui-text-muted shrink-0">Filter kelas:</span>
                    <button
                      type="button"
                      onClick={() => setFilterKelasId('')}
                      className={`px-2 py-1 text-[11px] rounded-md border transition ${
                        filterKelasId === ''
                          ? 'border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300 font-medium'
                          : 'ui-divider ui-text-muted'
                      }`}
                    >
                      Semua
                    </button>
                    {kelasOptions.map((k) => (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => setFilterKelasId(String(k.id))}
                        className={`px-2 py-1 text-[11px] rounded-md border transition truncate max-w-[10rem] ${
                          filterKelasId === String(k.id)
                            ? 'border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300 font-medium'
                            : 'ui-divider ui-text-muted'
                        }`}
                        title={k.label}
                      >
                        {k.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Nilai */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold m-0 text-slate-800 dark:text-slate-100">
                      Nilai
                      <span className="font-normal ui-text-muted ml-2 text-xs">
                        {formatPeriode(
                          detail.nilai_tanggal_awal,
                          detail.nilai_tanggal_akhir,
                          detail.nilai_hijri_awal,
                          detail.nilai_hijri_akhir
                        )}
                        {' · '}
                        {barisNilaiTampil.length}
                        {filterKelasId ? ` / ${barisNilai.length}` : ''} santri
                      </span>
                    </h2>
                    <div className="flex flex-wrap gap-1">
                      {(
                        [
                          ['nilai', 'Nilai'],
                          ['absen', 'Absen mapel'],
                          ['keduanya', 'Keduanya'],
                        ] as const
                      ).map(([v, label]) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setTampil(v)}
                          className={`px-2 py-1 text-[11px] rounded-md border transition ${
                            tampil === v
                              ? 'border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300 font-medium'
                              : 'ui-divider ui-text-muted'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {barisNilaiTampil.length > 0 && fanColumns.length > 0 ? (
                    <div className="ui-table-wrap">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs whitespace-nowrap">
                          <thead className="ui-table-head">
                            <tr>
                              <th className="px-2 py-1.5 text-left">Nama</th>
                              {showKelasColNilai && <th className="px-2 py-1.5 text-left">Kelas</th>}
                              {fanColumns.map((col) => (
                                <th
                                  key={col.key}
                                  className="px-1 py-1.5 text-center text-[10px] leading-tight max-w-[4.5rem] truncate"
                                  title={col.label}
                                >
                                  {col.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="ui-table-body">
                            {barisNilaiTampil.map((b) => (
                              <tr key={`${b.santri_id}-${b.kelas_id}`} className="ui-table-row">
                                <td className="px-2 py-1.5 font-medium">{b.nama}</td>
                                {showKelasColNilai && (
                                  <td className="px-2 py-1.5 ui-text-muted">
                                    {b.nama_kelas}
                                    {b.kel ? ` · ${b.kel}` : ''}
                                  </td>
                                )}
                                {fanColumns.map((col) => {
                                  const { cell } = cellForFan(b, col, mapelEnrich)
                                  return (
                                    <td key={col.key} className="px-1 py-1.5 text-center tabular-nums">
                                      {showNilai && (
                                        <span>{cell?.nilai != null ? cell.nilai : '—'}</span>
                                      )}
                                      {showAbsenInNilai && cell?.absen && (
                                        <span className={`ml-0.5 ${ABSEN_CLASS[cell.absen as AbsenStatus] || ''}`}>
                                          {tampil === 'keduanya' ? ` (${cell.absen})` : cell.absen}
                                        </span>
                                      )}
                                      {!showNilai && !cell?.absen && '—'}
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs ui-text-muted">Tidak ada data nilai.</p>
                  )}
                </div>

                {/* Absen totals */}
                <div className="space-y-2 pt-2">
                  <h2 className="text-sm font-semibold m-0 text-slate-800 dark:text-slate-100">
                    Absen
                    <span className="font-normal ui-text-muted ml-2 text-xs">
                      {formatPeriode(
                        detail.absen_tanggal_awal,
                        detail.absen_tanggal_akhir,
                        detail.absen_hijri_awal,
                        detail.absen_hijri_akhir
                      )}
                      {' · '}
                      {barisAbsenTampil.length}
                      {filterKelasId ? ` / ${barisAbsen.length}` : ''} santri
                    </span>
                  </h2>
                  {barisAbsenTampil.length > 0 ? (
                    <div className="ui-table-wrap">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs whitespace-nowrap">
                          <thead className="ui-table-head">
                            <tr>
                              <th className="px-2 py-1.5 text-left">Nama</th>
                              {showKelasColAbsen && <th className="px-2 py-1.5 text-left">Kelas</th>}
                              <th className="px-2 py-1.5 text-center text-emerald-700 dark:text-emerald-300">H</th>
                              <th className="px-2 py-1.5 text-center text-amber-700 dark:text-amber-300">S</th>
                              <th className="px-2 py-1.5 text-center text-blue-700 dark:text-blue-300">I</th>
                              <th className="px-2 py-1.5 text-center text-red-700 dark:text-red-300">A</th>
                            </tr>
                          </thead>
                          <tbody className="ui-table-body">
                            {barisAbsenTampil.map((b) => (
                              <tr key={`abs-${b.santri_id}-${b.kelas_id}`} className="ui-table-row">
                                <td className="px-2 py-1.5 font-medium">{b.nama}</td>
                                {showKelasColAbsen && (
                                  <td className="px-2 py-1.5 ui-text-muted">
                                    {b.nama_kelas}
                                    {b.kel ? ` · ${b.kel}` : ''}
                                  </td>
                                )}
                                <td className="px-2 py-1.5 text-center tabular-nums">{b.h}</td>
                                <td className="px-2 py-1.5 text-center tabular-nums">{b.s}</td>
                                <td className="px-2 py-1.5 text-center tabular-nums">{b.i}</td>
                                <td className="px-2 py-1.5 text-center tabular-nums">{b.a}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs ui-text-muted">Tidak ada data absen.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="ui-title-lg">Hasil Rekap</h1>
          <p className="ui-subtitle mt-1 text-sm">
            {isAdmin
              ? 'Publish gabungan nilai + absen (termasuk belum tayang).'
              : 'Rekap nilai & absen yang sudah dipublish dan waktunya sudah tiba.'}
          </p>
        </div>
        {isAdmin && (
          <Link to="/rekap/publish" className="px-3 py-2 text-xs ui-btn-primary inline-flex items-center gap-1 shrink-0">
            <MaterialIcon name="add" size={16} /> Publish baru
          </Link>
        )}
      </div>

      {error && <div className="ui-error-box px-3 py-2 text-sm">{error}</div>}
      {loading && <p className="text-sm ui-text-muted">Memuat…</p>}

      {!loading && list.length === 0 && (
        <p className="text-sm ui-text-muted text-center py-8">Belum ada publish rekap.</p>
      )}

      <div className="grid gap-2">
        {list.map((row) => (
          <Link
            key={row.id}
            to={`/rekap/hasil/${row.id}`}
            className="ui-card p-3 sm:p-4 hover:border-blue-500/30 transition block"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 m-0 truncate">
                  {row.judul}
                </h2>
                <p className="text-xs ui-text-muted m-0 mt-0.5 truncate">{row.kelas_label || '—'}</p>
                <p className="text-[11px] ui-text-muted m-0 mt-1">
                  Nilai: {formatMasehiDateDisplay(row.nilai_tanggal_awal)} —{' '}
                  {formatMasehiDateDisplay(row.nilai_tanggal_akhir)}
                  {' · '}
                  Absen: {formatMasehiDateDisplay(row.absen_tanggal_awal)} —{' '}
                  {formatMasehiDateDisplay(row.absen_tanggal_akhir)}
                </p>
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
              </div>
            </div>
          </Link>
        ))}
      </div>
    </motion.div>
  )
}
