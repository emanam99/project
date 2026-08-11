import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { bisyarohAPI } from '../../../services/api'
import { buildPengeluaranLembagaFilterOptions } from '../../Keuangan/Pengeluaran/utils/lembagaFilterOptions'
import { useBisyarohFiturAccess } from '../../../hooks/useBisyarohFiturAccess'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'

const PAGE_LIMIT = 50

const HARI_INDONESIA = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const BULAN_INDONESIA = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember'
]

function formatRp(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(
    Number(n)
  )
}

function formatTanggalLong(isoDate) {
  if (!isoDate) return '–'
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return '–'
  const hari = HARI_INDONESIA[d.getDay()]
  const tanggal = d.getDate()
  const bulan = BULAN_INDONESIA[d.getMonth()]
  const tahun = d.getFullYear()
  return `${hari}, ${tanggal} ${bulan} ${tahun}`
}

function getDateKey(isoDate) {
  if (!isoDate) return ''
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function groupByDate(rows) {
  const map = new Map()
  for (const r of rows) {
    const key = getDateKey(r.display_at) || ''
    if (!key) continue
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(r)
  }
  for (const [, items] of map) {
    items.sort((a, b) => {
      const na = String(a.pengurus_nama || '').trim().toLocaleLowerCase('id-ID')
      const nb = String(b.pengurus_nama || '').trim().toLocaleLowerCase('id-ID')
      const byName = na.localeCompare(nb, 'id-ID')
      if (byName !== 0) return byName
      const ta = a.display_at ? new Date(a.display_at).getTime() : 0
      const tb = b.display_at ? new Date(b.display_at).getTime() : 0
      return tb - ta
    })
  }
  return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.03, delayChildren: 0.02 }
  }
}
const staggerItem = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 }
}

function historiDotClass(isBaru) {
  return isBaru
    ? 'bg-teal-500 dark:bg-teal-400 ring-4 ring-teal-100 dark:ring-teal-900/50'
    : 'bg-amber-500 dark:bg-amber-400 ring-4 ring-amber-100 dark:ring-amber-900/50'
}

function scopeHint(scope) {
  if (scope === 'semua') {
    return 'Anda melihat histori rekap semua pengurus (aksi semua lembaga).'
  }
  if (scope === 'lembaga') {
    return 'Anda melihat histori semua pengurus dalam cakupan lembaga peran Anda (bukan hanya diri sendiri).'
  }
  return 'Anda hanya melihat histori rekap milik Anda sendiri. Untuk cakupan lebih luas, hubungi admin (aksi Histori cakupan lembaga / semua lembaga).'
}

function HistoriListRow({ row, isLast, onOpen }) {
  const catatan = row.catatan && String(row.catatan).trim() !== '' ? row.catatan : null
  const nama = row.pengurus_nama || '–'
  const nip = row.pengurus_nip != null && String(row.pengurus_nip) !== '' ? String(row.pengurus_nip) : ''

  return (
    <motion.li variants={staggerItem} className="relative flex items-start gap-4 pl-2 -ml-px group">
      {!isLast && (
        <span
          className="absolute left-[13px] top-6 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-600 rounded-full"
          aria-hidden
        />
      )}
      <span
        className={`relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full ${historiDotClass(row.is_baru)} border-2 border-white dark:border-gray-800`}
        aria-hidden
      />
      <div className="min-w-0 flex-1 pt-0.5 pb-1">
        <button
          type="button"
          onClick={() => onOpen(row.id)}
          className="w-full text-left rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/40 px-3 py-2.5 hover:bg-teal-50/80 dark:hover:bg-teal-950/30 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-400"
        >
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
            {nama}
            {nip && <span className="text-gray-500 dark:text-gray-400 font-normal"> · NIP {nip}</span>}
          </p>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums mt-1.5">
            Total {formatRp(row.total_nominal)}
          </p>
          {row.potong_uwaba_total != null && row.potong_uwaba_total > 0 ? (
            <p className="text-[11px] font-medium text-teal-700 dark:text-teal-300 mt-1 tabular-nums">
              Potong UWABA {formatRp(row.potong_uwaba_total)} — lihat rincian alokasi di detail
            </p>
          ) : null}
          {catatan ? (
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 line-clamp-3">{catatan}</p>
          ) : (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Tanpa catatan · ketuk untuk rincian</p>
          )}
        </button>
      </div>
    </motion.li>
  )
}

function RincianOffcanvas({ open, onClose, loading, data, error }) {
  useOffcanvasBackClose(open, onClose)

  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Tutup"
            className="fixed inset-0 z-[100] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal
            className="fixed inset-x-0 bottom-0 z-[101] max-h-[88vh] flex flex-col rounded-t-2xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-2xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 pt-3 pb-2 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Rincian rekap</h2>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 pb-6">
              {loading && <p className="text-sm text-gray-500 dark:text-gray-400">Memuat rincian…</p>}
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              {!loading && !error && data && (
                <div className="space-y-4">
                  <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
                    <p>
                      <span className="font-medium text-gray-800 dark:text-gray-200">{data.pengurus_nama || '—'}</span>
                      {data.pengurus_nip != null && data.pengurus_nip !== '' && (
                        <span className="text-gray-500"> · NIP {data.pengurus_nip}</span>
                      )}
                    </p>
                    <p>
                      Set: <span className="font-medium text-teal-700 dark:text-teal-300">{data.bisyaroh_nama || '—'}</span>
                      {' · '}
                      Periode{' '}
                      <span className="font-mono tabular-nums">{data.periode_bulan || '—'}</span>
                      {data.kalender === 'hijriyah' || data.kalender === 'masehi' ? (
                        <span className="text-gray-500"> ({data.kalender === 'hijriyah' ? 'Hijriyah' : 'Masehi'})</span>
                      ) : null}
                    </p>
                    {data.updated_at && (
                      <p className="text-[11px] text-gray-500">
                        Diperbarui: {new Date(data.updated_at).toLocaleString('id-ID')}
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/60 dark:bg-teal-950/25 px-3 py-2">
                    <p className="text-xs font-medium text-teal-900 dark:text-teal-100">Total</p>
                    <p className="text-lg font-bold text-teal-800 dark:text-teal-200 tabular-nums">
                      {formatRp(data.total_nominal)}
                    </p>
                  </div>
                  {data.potong_uwaba && data.potong_uwaba.terpotong_total > 0 ? (
                    <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2 space-y-2">
                      <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100 uppercase tracking-wide">
                        Dikurangi ke UWABA (potong Bisyaroh)
                      </p>
                      <p className="text-base font-bold text-emerald-800 dark:text-emerald-200 tabular-nums">
                        {formatRp(data.potong_uwaba.terpotong_total)}
                      </p>
                      {data.potong_uwaba.keterangan ? (
                        <p className="text-[11px] text-emerald-900/90 dark:text-emerald-100/90 leading-relaxed">
                          {data.potong_uwaba.keterangan}
                        </p>
                      ) : null}
                      {(data.potong_uwaba.alokasi || []).length > 0 ? (
                        <ul className="text-[11px] space-y-1 text-gray-800 dark:text-gray-200">
                          {(data.potong_uwaba.alokasi || []).map((a) => (
                            <li key={a.id_santri} className="flex justify-between gap-2 tabular-nums">
                              <span className="min-w-0 truncate">
                                {a.nama || `Santri #${a.id_santri}`}
                                {a.nis ? ` · ${a.nis}` : ''}
                              </span>
                              <span className="shrink-0 font-medium">{formatRp(a.nominal)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                  {data.catatan ? (
                    <div>
                      <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Catatan</p>
                      <p className="text-sm text-gray-800 dark:text-gray-200 mt-0.5 whitespace-pre-wrap">{data.catatan}</p>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                      Kolom &amp; rumus
                    </p>
                    <ul className="space-y-3">
                      {(data.cells || []).map((cell, idx) => (
                        <li
                          key={`${cell.col_key}-${idx}`}
                          className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900/30 p-2.5 text-xs"
                        >
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{cell.label || cell.col_key}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                cell.kind === 'formula'
                                  ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200'
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                              }`}
                            >
                              {cell.kind === 'formula' ? 'Rumus' : 'Input'}
                            </span>
                            {cell.masuk_total ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-900/35 dark:text-amber-100">
                                Ikut total
                              </span>
                            ) : null}
                          </div>
                          <p className="text-gray-800 dark:text-gray-200 tabular-nums">
                            Nilai:{' '}
                            <span
                              className={`font-mono font-medium ${cell.error ? 'text-red-600 dark:text-red-400' : ''}`}
                              title={cell.error ? cell.error_message || cell.nilai_tampil : undefined}
                            >
                              {cell.nilai_tampil ?? '—'}
                            </span>
                          </p>
                          {cell.error && cell.error_message ? (
                            <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{cell.error_message}</p>
                          ) : null}
                          {cell.kind === 'formula' && cell.rumus ? (
                            <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1 font-mono break-all">
                              Rumus: {cell.rumus}
                            </p>
                          ) : null}
                          {cell.kind === 'formula' && cell.rumus_terurai ? (
                            <p className="text-[11px] text-teal-700 dark:text-teal-300 mt-1 font-mono break-all">
                              Terurai: {cell.rumus_terurai}
                            </p>
                          ) : null}
                          {cell.keterangan ? (
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 italic">{cell.keterangan}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

export default function BisyarohHistoriTab() {
  const fitur = useBisyarohFiturAccess()
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [lembagaId, setLembagaId] = useState('')
  const [lembagaRows, setLembagaRows] = useState([])
  const [semuaLembagaApi, setSemuaLembagaApi] = useState(true)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [scopeFromApi, setScopeFromApi] = useState(() => fitur.historiPengurusScope)
  const [filterOnlySelf, setFilterOnlySelf] = useState(false)

  const [rincianOpen, setRincianOpen] = useState(false)
  const [rincianLoading, setRincianLoading] = useState(false)
  const [rincianError, setRincianError] = useState('')
  const [rincianData, setRincianData] = useState(null)

  const effectiveScope = scopeFromApi || fitur.historiPengurusScope
  const showSearch = effectiveScope !== 'self'
  const showOnlySelfToggle = effectiveScope !== 'self'

  const lembagaFilterDisabled = lembagaRows.length === 1

  const lembagaSelectOptions = useMemo(
    () => buildPengeluaranLembagaFilterOptions(lembagaRows, null),
    [lembagaRows]
  )

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchInput.trim()), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    let cancelled = false
    bisyarohAPI
      .listRekapLembaga({ histori: true })
      .then((res) => {
        if (cancelled) return
        if (res?.success) {
          setLembagaRows(Array.isArray(res.data) ? res.data : [])
          setSemuaLembagaApi(!!res.semua_lembaga)
        } else {
          setLembagaRows([])
          setSemuaLembagaApi(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLembagaRows([])
          setSemuaLembagaApi(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (lembagaRows.length === 1) {
      setLembagaId(String(lembagaRows[0].id))
    }
  }, [lembagaRows])

  const fetchPage = useCallback(
    async (isLoadMore, currentOffset) => {
      const off = isLoadMore ? currentOffset : 0
      if (isLoadMore) setLoadingMore(true)
      else setLoading(true)
      try {
        const res = await bisyarohAPI.listHistori({
          q: showSearch ? searchDebounced : '',
          lembaga_id: lembagaId,
          only_self: showOnlySelfToggle ? filterOnlySelf : false,
          limit: PAGE_LIMIT,
          offset: off
        })
        if (!res?.success) throw new Error(res?.message || 'Gagal memuat')
        if (typeof res.histori_pengurus_scope === 'string') {
          setScopeFromApi(res.histori_pengurus_scope)
        }
        const data = Array.isArray(res.data) ? res.data : []
        const tot = typeof res.total === 'number' ? res.total : data.length
        if (isLoadMore) {
          setList((prev) => [...prev, ...data])
          setOffset(off + data.length)
        } else {
          setList(data)
          setOffset(data.length)
        }
        setTotal(tot)
        setHasMore(off + data.length < tot)
      } catch {
        if (!isLoadMore) setList([])
        setHasMore(false)
        setTotal(0)
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [searchDebounced, lembagaId, showSearch, showOnlySelfToggle, filterOnlySelf]
  )

  useEffect(() => {
    fetchPage(false, 0)
  }, [fetchPage])

  const grouped = useMemo(() => groupByDate(list), [list])

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return
    fetchPage(true, offset)
  }

  const handleRefresh = useCallback(() => {
    fetchPage(false, 0)
  }, [fetchPage])

  const handleResetFilter = useCallback(() => {
    setSearchInput('')
    if (!lembagaFilterDisabled) setLembagaId('')
    if (showOnlySelfToggle) setFilterOnlySelf(false)
  }, [lembagaFilterDisabled, showOnlySelfToggle])

  const openRincian = useCallback(async (id) => {
    setRincianOpen(true)
    setRincianLoading(true)
    setRincianError('')
    setRincianData(null)
    try {
      const res = await bisyarohAPI.historiRincian(id)
      if (!res?.success) throw new Error(res?.message || 'Gagal memuat rincian')
      setRincianData(res.data || null)
    } catch (e) {
      setRincianError(e?.message || 'Gagal memuat rincian')
    } finally {
      setRincianLoading(false)
    }
  }, [])

  const closeRincian = useCallback(() => {
    setRincianOpen(false)
    setRincianData(null)
    setRincianError('')
  }, [])

  return (
    <>
      <p className="text-[11px] text-gray-600 dark:text-gray-400 mb-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white/60 dark:bg-gray-800/40 px-3 py-2">
        {scopeHint(effectiveScope)}{' '}
        <span className="block mt-1.5 text-gray-500 dark:text-gray-500">
          Hanya entri yang rekapnya sudah <strong>dirilis</strong> di tab Rekap untuk lembaga tempat pengurus berjabatan (bukan hanya lembaga induk di profil pengurus).
        </span>
      </p>

      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
        {showSearch ? (
          <div className="relative pb-2 px-4 pt-3">
            <div className="relative">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                className="w-full p-2 pr-20 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                placeholder="Cari nama atau NIP pengurus"
                autoComplete="off"
              />
              <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1">
                <button
                  type="button"
                  onClick={() => setIsFilterOpen((p) => !p)}
                  className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors"
                  title={isFilterOpen ? 'Sembunyikan filter' : 'Tampilkan filter'}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                    />
                  </svg>
                  {isFilterOpen ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
            <div
              className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}
            />
          </div>
        ) : (
          <div className="px-4 pt-3 pb-2 flex justify-end">
            <button
              type="button"
              onClick={() => setIsFilterOpen((p) => !p)}
              className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors"
              title={isFilterOpen ? 'Sembunyikan filter' : 'Filter lembaga'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              Filter
            </button>
          </div>
        )}

        <AnimatePresence>
          {isFilterOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t bg-gray-50 dark:bg-gray-700/50"
            >
              <div className="px-4 py-2">
                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    value={lembagaId}
                    onChange={(e) => setLembagaId(e.target.value)}
                    disabled={lembagaFilterDisabled}
                    title={lembagaFilterDisabled ? 'Satu lembaga dalam cakupan Anda' : undefined}
                    className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 disabled:opacity-60"
                  >
                    {lembagaSelectOptions.map((o) => (
                      <option key={o.value || '_all'} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {showOnlySelfToggle ? (
                    <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-200 select-none">
                      <input
                        type="checkbox"
                        checked={filterOnlySelf}
                        onChange={(e) => setFilterOnlySelf(e.target.checked)}
                        className="rounded border-gray-400 text-teal-600 focus:ring-teal-400"
                      />
                      Filter diri sendiri
                    </label>
                  ) : null}
                </div>
                {!semuaLembagaApi && lembagaRows.length > 1 ? (
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2 leading-snug">
                    Filter lembaga mengikuti cakupan akses Histori (peran + aksi semua lembaga bila ada).
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center justify-end gap-2 pt-3 mt-2 border-t border-gray-200 dark:border-gray-600">
                  <button
                    type="button"
                    onClick={handleRefresh}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={handleResetFilter}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                  >
                    Reset filter
                  </button>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-200 tabular-nums">{total}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style>{`
        .bisyaroh-histori-scroll { scrollbar-width: thin; scrollbar-color: rgba(148, 163, 184, 0.35) transparent; }
        .dark .bisyaroh-histori-scroll { scrollbar-color: rgba(71, 85, 105, 0.5) transparent; }
      `}</style>
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm bisyaroh-histori-scroll">
        {loading ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Memuat…</p>
          </div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada riwayat untuk filter ini.</p>
          </div>
        ) : (
          <>
            <div className="px-4 sm:px-5 pt-4 pb-2">
              {grouped.map(([dateKey, items]) => (
                <motion.div
                  key={dateKey}
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                  className="mb-6 last:mb-4"
                >
                  <p className="text-xs font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-wider mb-3 sticky top-0 bg-white dark:bg-gray-800 py-1 -mx-1 px-1 z-[1]">
                    {formatTanggalLong(items[0]?.display_at)}
                  </p>
                  <ul className="relative">
                    {items.map((row, idx) => (
                      <HistoriListRow
                        key={row.id}
                        row={row}
                        isLast={idx === items.length - 1}
                        onOpen={openRincian}
                      />
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700/60 flex flex-col sm:flex-row items-center justify-between gap-2 bg-gray-50/50 dark:bg-gray-800/50">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Menampilkan {list.length} dari {total}
              </p>
              {hasMore && (
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="text-sm font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 disabled:opacity-50"
                >
                  {loadingMore ? 'Memuat…' : 'Tampilkan lebih banyak'}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <RincianOffcanvas
        open={rincianOpen}
        onClose={closeRincian}
        loading={rincianLoading}
        data={rincianData}
        error={rincianError}
      />
    </>
  )
}
