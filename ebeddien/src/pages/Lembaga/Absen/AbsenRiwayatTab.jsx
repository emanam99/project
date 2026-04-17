import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { absenPengurusAPI, lembagaAPI } from '../../../services/api'
import { buildPengeluaranLembagaFilterOptions } from '../../Keuangan/Pengeluaran/utils/lembagaFilterOptions'
import RekapAbsenOffcanvas from '../components/RekapAbsenOffcanvas'

const PAGE_LIMIT = 50
/** Query URL: ?rekap=1 — offcanvas rekap terbuka. */
const REKAP_SEARCH_KEY = 'rekap'

const HARI_INDONESIA = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const BULAN_INDONESIA = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

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
    const key = getDateKey(r.display_at) || (typeof r.group_date === 'string' ? r.group_date : '')
    if (!key) continue
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(r)
  }
  for (const [, items] of map) {
    items.sort((a, b) => {
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

function statusDotClass(status) {
  const s = (status || '').toLowerCase()
  if (s.includes('masuk')) return 'bg-teal-500 dark:bg-teal-400 ring-4 ring-teal-100 dark:ring-teal-900/50'
  if (s.includes('keluar')) return 'bg-amber-500 dark:bg-amber-400 ring-4 ring-amber-100 dark:ring-amber-900/50'
  return 'bg-gray-400 dark:bg-gray-500 ring-4 ring-gray-100 dark:ring-gray-800/50'
}

function AbsenRow({ row, isLast }) {
  const nama = row.pengurus_nama || '–'
  const nip = row.pengurus_nip != null ? String(row.pengurus_nip) : ''
  const lembaga = row.lembaga_label || '–'
  const sesi = row.sesi_label || '–'
  const jamMasuk = row.jam_masuk || '–'
  const sumber = row.sumber_absen || 'sidik_jari'
  const lokasiNama = row.lokasi_nama || ''

  return (
    <motion.li variants={staggerItem} className="relative flex items-start gap-4 pl-2 -ml-px group">
      {!isLast && (
        <span
          className="absolute left-[13px] top-6 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-600 rounded-full"
          aria-hidden
        />
      )}
      <span
        className={`relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full ${statusDotClass(row.status)} border-2 border-white dark:border-gray-800`}
        aria-hidden
      />
      <div className="min-w-0 flex-1 pt-0.5 pb-4">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 flex flex-wrap items-center gap-1.5">
          <span>
            {nama}
            {nip && (
              <span className="text-gray-500 dark:text-gray-400 font-normal"> · NIP {nip}</span>
            )}
          </span>
          {sumber === 'lokasi_gps' ? (
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">
              GPS{lokasiNama ? ` · ${lokasiNama}` : ''}
            </span>
          ) : (
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
              Sidik jari
            </span>
          )}
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
          <span className="font-medium text-teal-700 dark:text-teal-300">{sesi}</span>
          <span className="text-gray-500 dark:text-gray-400"> · Masuk </span>
          <span className="font-mono tabular-nums font-medium text-gray-800 dark:text-gray-200">{jamMasuk}</span>
          {lembaga && lembaga !== '–' && (
            <span className="text-gray-500 dark:text-gray-400"> · {lembaga}</span>
          )}
        </p>
        {row.keluar_ada ? (
          <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1 tabular-nums">
            <span className="text-amber-700 dark:text-amber-400 font-medium">Keluar</span>
            {row.jam_keluar && (
              <>
                <span className="text-gray-500 dark:text-gray-500"> </span>
                <span className="font-mono text-gray-800 dark:text-gray-200">{row.jam_keluar}</span>
              </>
            )}
            <span className="text-gray-500 dark:text-gray-500"> · Durasi </span>
            <span className="font-medium text-gray-800 dark:text-gray-200">{row.durasi_label || '—'}</span>
          </p>
        ) : (
          <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1">
            <span className="text-gray-500 dark:text-gray-500">Durasi </span>
            <span className="font-medium text-gray-800 dark:text-gray-200">{row.durasi_label || '1 jam (tanpa absen keluar)'}</span>
          </p>
        )}
        {row.time_from_device === false && row.display_at && (
          <p className="text-[10px] text-amber-600 dark:text-amber-500/90 mt-0.5">
            Jam dari waktu simpan DB (timestamp mesin tidak terbaca)
          </p>
        )}
      </div>
    </motion.li>
  )
}

export default function AbsenRiwayatTab({
  allowedLembagaIdsRiwayat = null,
  riwayatLembagaFilterLocked = false
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const rekapOpen = searchParams.get(REKAP_SEARCH_KEY) === '1'

  const openRekap = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set(REKAP_SEARCH_KEY, '1')
        return next
      },
      { replace: false }
    )
  }, [setSearchParams])

  const closeRekap = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete(REKAP_SEARCH_KEY)
        return next
      },
      { replace: true }
    )
  }, [setSearchParams])

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
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  const lembagaFilterDisabled =
    riwayatLembagaFilterLocked && allowedLembagaIdsRiwayat?.length === 1

  const lembagaSelectOptions = useMemo(
    () => buildPengeluaranLembagaFilterOptions(lembagaRows, allowedLembagaIdsRiwayat),
    [lembagaRows, allowedLembagaIdsRiwayat]
  )

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchInput.trim()), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    let cancelled = false
    lembagaAPI.getAll().then((res) => {
      if (cancelled) return
      const raw = res?.data ?? res
      setLembagaRows(Array.isArray(raw) ? raw : [])
    }).catch(() => {
      if (!cancelled) setLembagaRows([])
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (riwayatLembagaFilterLocked && allowedLembagaIdsRiwayat?.length === 1) {
      setLembagaId(allowedLembagaIdsRiwayat[0])
    }
  }, [riwayatLembagaFilterLocked, allowedLembagaIdsRiwayat])

  useEffect(() => {
    if (allowedLembagaIdsRiwayat == null || allowedLembagaIdsRiwayat.length === 0) return
    if (lembagaId && !allowedLembagaIdsRiwayat.includes(lembagaId)) {
      setLembagaId(allowedLembagaIdsRiwayat.length === 1 ? allowedLembagaIdsRiwayat[0] : '')
    }
  }, [allowedLembagaIdsRiwayat, lembagaId])

  const fetchPage = useCallback(async (isLoadMore, currentOffset) => {
    const off = isLoadMore ? currentOffset : 0
    if (isLoadMore) setLoadingMore(true)
    else setLoading(true)
    try {
      const res = await absenPengurusAPI.getList({
        q: searchDebounced,
        lembaga_id: lembagaId || undefined,
        limit: PAGE_LIMIT,
        offset: off
      })
      if (!res?.success) throw new Error(res?.message || 'Gagal memuat')
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
  }, [searchDebounced, lembagaId])

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
  }, [lembagaFilterDisabled])

  return (
    <>
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
        <div className="relative pb-2 px-4 pt-3">
          <div className="relative">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              className="w-full p-2 pr-20 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
              placeholder="Cari"
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
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
                    title={
                      lembagaFilterDisabled
                        ? 'Filter lembaga mengikuti akses peran Anda'
                        : undefined
                    }
                    className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 disabled:opacity-60"
                  >
                    {lembagaSelectOptions.map((o) => (
                      <option key={o.value || '_all'} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 pt-3 mt-2 border-t border-gray-200 dark:border-gray-600">
                  <button
                    type="button"
                    onClick={openRekap}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/25 text-teal-800 dark:text-teal-200 hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors"
                    title="Rekap per pengurus"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Rekap
                  </button>
                  <button
                    type="button"
                    onClick={handleRefresh}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                    title="Refresh"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={handleResetFilter}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                    title="Reset filter"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                    </svg>
                    Reset filter
                  </button>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-200 tabular-nums">
                    {total}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style>{`
        .absen-scroll { scrollbar-width: thin; scrollbar-color: rgba(148, 163, 184, 0.35) transparent; }
        .dark .absen-scroll { scrollbar-color: rgba(71, 85, 105, 0.5) transparent; }
      `}</style>
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm absen-scroll">
        {loading ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Memuat…</p>
          </div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada data absensi.</p>
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
                    {formatTanggalLong(
                      items[0]?.display_at
                        || (items[0]?.group_date ? `${items[0].group_date}T12:00:00` : null)
                    )}
                  </p>
                  <ul className="relative">
                    {items.map((row, idx) => (
                      <AbsenRow
                        key={row.id}
                        row={row}
                        isLast={idx === items.length - 1}
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
      <RekapAbsenOffcanvas isOpen={rekapOpen} onClose={closeRekap} lembagaId={lembagaId} />
    </>
  )
}
