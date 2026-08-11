import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { bukuTamuAPI, cashlessAPI, mahromAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useSantriDetailOffcanvas } from '../../contexts/SantriDetailOffcanvasContext'
import { formatHijriDateDisplay } from '../../components/PickDateHijri/PickDateHijri'
import { masehiYmdToHijriYmd } from '../../utils/hijriDate'
import { isDesktopBukuTamuLayout } from './BukuTamuFormat'
import {
  bumpPaginationTotal,
  entryToListRow,
  patchListEntry,
  prependListRow,
  rowMatchesSearch,
} from './BukuTamuListUtils'
import BukuTamuBiodataPanel from './components/BukuTamuBiodataPanel'
import BukuTamuMobileOffcanvas from './components/BukuTamuMobileOffcanvas'
import BukuTamuQrInlineScanner from './components/BukuTamuQrInlineScanner'

function todayYmd() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const MOBILE_OFFCANVAS_AUTO_CLOSE_SEC = 60

/** @returns {{ masehiYmd: string, waktu: string } | null} */
function parseWaktuDatang(raw) {
  const s = String(raw || '').trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?/)
  if (!m) return null
  let waktu = m[2] || '12:00:00'
  if (/^\d{2}:\d{2}$/.test(waktu)) waktu = `${waktu}:00`
  return { masehiYmd: m[1], waktu }
}

function cacheKeyFromWaktu(raw) {
  const p = parseWaktuDatang(raw)
  return p ? `${p.masehiYmd}|${p.waktu}` : ''
}

function formatWaktuMasehi(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(String(iso).replace(' ', 'T'))
    return d.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function useHijriMapForWaktuList(entries) {
  const [map, setMap] = useState({})

  useEffect(() => {
    let cancelled = false
    const keys = new Set()
    for (const row of entries) {
      const k = cacheKeyFromWaktu(row?.waktu_datang)
      if (k) keys.add(k)
    }
    if (keys.size === 0) {
      setMap({})
      return undefined
    }
    ;(async () => {
      const next = {}
      await Promise.all(
        [...keys].map(async (key) => {
          const sep = key.indexOf('|')
          const masehiYmd = key.slice(0, sep)
          const waktu = key.slice(sep + 1)
          const hijri = await masehiYmdToHijriYmd(masehiYmd, waktu)
          if (hijri) next[key] = hijri
        })
      )
      if (!cancelled) setMap(next)
    })()
    return () => {
      cancelled = true
    }
  }, [entries])

  return map
}

function BukuTamuListWaktu({ waktuDatang, hijriMap }) {
  const cacheKey = cacheKeyFromWaktu(waktuDatang)
  const hijriYmd = cacheKey ? hijriMap[cacheKey] : null

  if (!waktuDatang) return <span className="text-[11px] text-gray-400">—</span>

  return (
    <div className="text-right shrink-0">
      {hijriYmd ? (
        <p className="text-[11px] font-medium text-gray-800 dark:text-gray-200 leading-snug">
          {formatHijriDateDisplay(hijriYmd)}
          <span className="text-gray-500 dark:text-gray-400 font-normal"> H</span>
        </p>
      ) : (
        <p className="text-[11px] text-gray-400 leading-snug">…</p>
      )}
      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
        {formatWaktuMasehi(waktuDatang)}
      </p>
    </div>
  )
}

function biodataLines(mahrom) {
  if (!mahrom) return []
  const lines = []
  if (mahrom.nim) lines.push({ label: 'NIM', value: mahrom.nim })
  if (mahrom.nik) lines.push({ label: 'NIK', value: mahrom.nik })
  if (mahrom.gender) lines.push({ label: 'Jenis kelamin', value: mahrom.gender })
  if (mahrom.tempat_lahir || mahrom.tanggal_lahir) {
    lines.push({
      label: 'TTL',
      value: [mahrom.tempat_lahir, mahrom.tanggal_lahir].filter(Boolean).join(', '),
    })
  }
  if (mahrom.no_wa) lines.push({ label: 'WA', value: mahrom.no_wa })
  if (mahrom.pekerjaan) lines.push({ label: 'Pekerjaan', value: mahrom.pekerjaan })
  if (mahrom.pendidikan) lines.push({ label: 'Pendidikan', value: mahrom.pendidikan })
  const alamat = [mahrom.dusun, mahrom.desa, mahrom.kecamatan, mahrom.kabupaten, mahrom.provinsi]
    .filter(Boolean)
    .join(', ')
  if (alamat) lines.push({ label: 'Alamat', value: alamat })
  return lines
}

export default function BukuTamu() {
  const { showNotification } = useNotification()
  const { openSantriDetail } = useSantriDetailOffcanvas()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tanggalFilter, setTanggalFilter] = useState(todayYmd)
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ total: 0, total_pages: 0 })
  const perPage = 30

  const [scanning, setScanning] = useState(false)
  const [currentMahrom, setCurrentMahrom] = useState(null)
  const [currentEntry, setCurrentEntry] = useState(null)
  const [santriOptions, setSantriOptions] = useState([])
  const [selectedSantriIds, setSelectedSantriIds] = useState(() => new Set())
  const [ktpBerkas, setKtpBerkas] = useState(null)
  const [ktpPreviewUrl, setKtpPreviewUrl] = useState('')
  const [ktpLoading, setKtpLoading] = useState(false)
  const [scanError, setScanError] = useState(null)
  const patchTimerRef = useRef(null)
  const skipNextListLoadRef = useRef(false)
  const mobileOffcanvasOpenRef = useRef(false)
  const hijriMap = useHijriMapForWaktuList(list)
  const [desktopLayout, setDesktopLayout] = useState(() => isDesktopBukuTamuLayout())

  const [mobileOffcanvasOpen, setMobileOffcanvasOpen] = useState(false)
  const [mobileOffcanvasMode, setMobileOffcanvasMode] = useState('scan')
  const [autoCloseCountdown, setAutoCloseCountdown] = useState(MOBILE_OFFCANVAS_AUTO_CLOSE_SEC)
  const [autoCloseActive, setAutoCloseActive] = useState(false)
  const [maintenanceNotice, setMaintenanceNotice] = useState(null)

  const closeMobileOffcanvas = useCallback(() => {
    setMobileOffcanvasOpen(false)
  }, [])

  const resetMobileOffcanvasAfterClose = useCallback(() => {
    setMobileOffcanvasMode('scan')
    setAutoCloseActive(false)
    setAutoCloseCountdown(MOBILE_OFFCANVAS_AUTO_CLOSE_SEC)
  }, [])

  const openMobileScan = useCallback(() => {
    setScanError(null)
    setMobileOffcanvasMode('scan')
    setAutoCloseActive(false)
    setAutoCloseCountdown(MOBILE_OFFCANVAS_AUTO_CLOSE_SEC)
    setMobileOffcanvasOpen(true)
  }, [])

  useEffect(() => {
    mobileOffcanvasOpenRef.current = mobileOffcanvasOpen
  }, [mobileOffcanvasOpen])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setDesktopLayout(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const loadMaintenance = () => {
      cashlessAPI.getConfig().then((res) => {
        const m = res?.data?.maintenance
        setMaintenanceNotice(m?.active ? m : null)
      }).catch(() => {})
    }
    loadMaintenance()
    const timer = window.setInterval(loadMaintenance, 60000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!mobileOffcanvasOpen || mobileOffcanvasMode !== 'result' || !autoCloseActive) return undefined
    if (autoCloseCountdown <= 0) {
      closeMobileOffcanvas()
      return undefined
    }
    const timer = window.setTimeout(() => {
      setAutoCloseCountdown((c) => c - 1)
    }, 1000)
    return () => clearTimeout(timer)
  }, [mobileOffcanvasOpen, mobileOffcanvasMode, autoCloseActive, autoCloseCountdown, closeMobileOffcanvas])

  const loadList = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await bukuTamuAPI.getList({
        tanggal: tanggalFilter,
        search: searchInput.trim() || undefined,
        page,
        limit: perPage,
      })
      if (res?.success) {
        setList(res.data || [])
        setPagination(res.pagination || { total: 0, total_pages: 0 })
      } else {
        setError(res?.message || 'Gagal memuat buku tamu')
      }
    } catch (e) {
      setError(e?.response?.data?.message || 'Terjadi kesalahan saat memuat buku tamu')
    } finally {
      setLoading(false)
    }
  }, [tanggalFilter, searchInput, page])

  /** Sinkron dari server tanpa spinner — misal setelah scan atau perubahan dari device lain. */
  const syncListFromServer = useCallback(
    async (overrides = {}) => {
      const syncPage = overrides.page ?? page
      const syncTanggal = overrides.tanggal ?? tanggalFilter
      const syncSearch = overrides.search ?? searchInput.trim()
      try {
        const res = await bukuTamuAPI.getList({
          tanggal: syncTanggal,
          search: syncSearch || undefined,
          page: syncPage,
          limit: perPage,
        })
        if (res?.success) {
          setList(res.data || [])
          setPagination(res.pagination || { total: 0, total_pages: 0 })
        }
      } catch {
        /* abaikan — list optimistik tetap tampil */
      }
    },
    [page, tanggalFilter, searchInput]
  )

  const prependScanToList = useCallback(
    (scanData) => {
      if (tanggalFilter !== todayYmd()) return
      const row = entryToListRow(scanData?.entry, scanData?.mahrom)
      if (!row || !rowMatchesSearch(row, searchInput)) return

      if (page !== 1) {
        skipNextListLoadRef.current = true
        setPage(1)
      }
      setList((prev) => {
        const { next, isNew } = prependListRow(prev, row, perPage)
        if (isNew) {
          setPagination((p) => bumpPaginationTotal(p, perPage, 1))
        }
        return next
      })
    },
    [tanggalFilter, searchInput, page]
  )

  const updateListEntry = useCallback((entry) => {
    setList((prev) => patchListEntry(prev, entry))
  }, [])

  useEffect(() => {
    if (skipNextListLoadRef.current) {
      skipNextListLoadRef.current = false
      return
    }
    loadList()
  }, [loadList])

  useEffect(() => {
    let revoke = ''
    const loadKtp = async () => {
      if (!ktpBerkas?.id) {
        setKtpPreviewUrl('')
        return
      }
      setKtpLoading(true)
      try {
        const blob = await mahromAPI.downloadBerkas(ktpBerkas.id)
        const url = URL.createObjectURL(blob)
        revoke = url
        setKtpPreviewUrl(url)
      } catch {
        setKtpPreviewUrl('')
      } finally {
        setKtpLoading(false)
      }
    }
    loadKtp()
    return () => {
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [ktpBerkas?.id])

  const handleSearch = () => {
    setPage(1)
    loadList()
  }

  const clearBiodataPanel = useCallback(() => {
    setCurrentMahrom(null)
    setCurrentEntry(null)
    setSantriOptions([])
    setSelectedSantriIds(new Set())
    setKtpBerkas(null)
  }, [])

  const applyScanResult = useCallback((data) => {
    const entry = data?.entry || null
    const mahrom = data?.mahrom || entry?.mahrom || null
    setCurrentMahrom(mahrom)
    setCurrentEntry(entry)
    const opts =
      data?.santri_options?.length > 0
        ? data.santri_options
        : (entry?.santri_didatangi || []).map((s) => ({
            santri_id: s.santri_id,
            santri_nama: s.santri_nama,
            nis: s.nis,
            hubungan: s.hubungan,
          }))
    setSantriOptions(opts)
    const ids = new Set(
      (data?.selected_santri_ids?.length > 0
        ? data.selected_santri_ids
        : (entry?.santri_didatangi || []).map((s) => s.santri_id)
      ).map(Number)
    )
    setSelectedSantriIds(ids)
    setKtpBerkas(data?.ktp_berkas || null)
  }, [])

  const showMobileScanResult = useCallback(() => {
    setMobileOffcanvasMode('result')
    setAutoCloseCountdown(MOBILE_OFFCANVAS_AUTO_CLOSE_SEC)
    setAutoCloseActive(true)
  }, [])

  const handleViewSantriDetail = useCallback(
    (s) => {
      const sid = Number(s?.santri_id)
      if (!sid) return
      openSantriDetail(
        { id: sid, nis: s.nis || undefined, nama: s.santri_nama },
        { hideEdit: true, stackBaseZIndex: 300 }
      )
    },
    [openSantriDetail]
  )

  const handleScan = useCallback(
    async (token) => {
      setScanning(true)
      setScanError(null)
      try {
        const res = await bukuTamuAPI.scan(token)
        if (res?.success) {
          const payload = res.data || {}
          applyScanResult(payload)
          if (mobileOffcanvasOpenRef.current) {
            showMobileScanResult()
          }
          showNotification(res.message || 'Kunjungan tercatat', 'success')
          if (tanggalFilter === todayYmd()) {
            prependScanToList(payload)
            void syncListFromServer({ page: 1 })
          }
          return true
        }
        const message = res?.message || 'Gagal memproses QR'
        clearBiodataPanel()
        setScanError({ message, code: res?.code || null })
        return false
      } catch (e) {
        const message = e?.response?.data?.message || 'Gagal memproses scan QR'
        const code = e?.response?.data?.code || null
        clearBiodataPanel()
        setScanError({ message, code })
        return false
      } finally {
        setScanning(false)
      }
    },
    [
      applyScanResult,
      clearBiodataPanel,
      showMobileScanResult,
      showNotification,
      tanggalFilter,
      prependScanToList,
      syncListFromServer,
    ]
  )

  const handleMobileScan = handleScan

  const patchSantriSelection = useCallback(
    (entryId, ids) => {
      if (!entryId || ids.size === 0) return
      if (patchTimerRef.current) clearTimeout(patchTimerRef.current)
      patchTimerRef.current = setTimeout(async () => {
        try {
          const res = await bukuTamuAPI.patchSantri(entryId, Array.from(ids))
          if (res?.success) {
            const updated = res.data?.entry || null
            setCurrentEntry(updated)
            updateListEntry(updated)
            void syncListFromServer()
          } else {
            showNotification(res?.message || 'Gagal memperbarui santri', 'error')
          }
        } catch (e) {
          showNotification(e?.response?.data?.message || 'Gagal memperbarui santri', 'error')
        }
      }, 400)
    },
    [syncListFromServer, showNotification, updateListEntry]
  )

  const toggleSantri = (santriId) => {
    if (!currentEntry?.id) return
    setSelectedSantriIds((prev) => {
      const next = new Set(prev)
      if (next.has(santriId)) {
        if (next.size <= 1) {
          showNotification('Minimal satu santri harus dipilih', 'warning')
          return prev
        }
        next.delete(santriId)
      } else {
        next.add(santriId)
      }
      patchSantriSelection(currentEntry.id, next)
      return next
    })
  }

  const loadMahromDetail = useCallback(async (mahromId, row) => {
    setScanError(null)
    setCurrentEntry(row)
    setSantriOptions(
      (row.santri_didatangi || []).map((s) => ({
        santri_id: s.santri_id,
        santri_nama: s.santri_nama,
        nis: s.nis,
        hubungan: s.hubungan,
      }))
    )
    setSelectedSantriIds(new Set((row.santri_didatangi || []).map((s) => s.santri_id)))
    try {
      const res = await mahromAPI.getById(mahromId)
      if (res?.success && res.data) {
        setCurrentMahrom(res.data)
        const rel = Array.isArray(res.data.relasi_santri) ? res.data.relasi_santri : []
        if (rel.length > 0) {
          setSantriOptions(rel)
        }
      } else {
        setCurrentMahrom({
          nama: row.mahrom?.nama,
          nim: row.mahrom?.nim,
          nik: row.mahrom?.nik,
          gender: row.mahrom?.gender,
        })
      }
      const berkasRes = await mahromAPI.getBerkasList(mahromId, 'KTP')
      const rows = Array.isArray(berkasRes?.data) ? berkasRes.data : []
      setKtpBerkas(rows[0] || null)
    } catch {
      setCurrentMahrom({
        nama: row.mahrom?.nama,
        nim: row.mahrom?.nim,
        nik: row.mahrom?.nik,
        gender: row.mahrom?.gender,
      })
      setKtpBerkas(null)
    }
  }, [])

  const handleListRowClick = useCallback(
    (row) => {
      loadMahromDetail(row.id_mahrom, row)
      if (!isDesktopBukuTamuLayout()) {
        setMobileOffcanvasMode('detail')
        setAutoCloseActive(false)
        setMobileOffcanvasOpen(true)
      }
    },
    [loadMahromDetail]
  )

  const biodata = useMemo(() => biodataLines(currentMahrom), [currentMahrom])
  const totalPages = Math.max(1, pagination.total_pages || 1)
  const isToday = tanggalFilter === todayYmd()

  return (
    <div className="h-full overflow-hidden flex flex-col">
      {maintenanceNotice && (
        <div className="flex-shrink-0 mx-4 sm:mx-6 lg:mx-8 mt-4 rounded-lg border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/40 px-4 py-2 text-sm text-amber-900 dark:text-amber-200">
          {maintenanceNotice.message}
        </div>
      )}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-24 lg:pb-6 gap-4">
        {/* Kiri: daftar kunjungan */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="flex-shrink-0 p-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={tanggalFilter}
                onChange={(e) => {
                  setTanggalFilter(e.target.value)
                  setPage(1)
                }}
                className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 dark:text-gray-100"
              />
              {!isToday && (
                <button
                  type="button"
                  onClick={() => {
                    setTanggalFilter(todayYmd())
                    setPage(1)
                  }}
                  className="px-2 py-1.5 text-xs rounded-lg bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300"
                >
                  Hari ini
                </button>
              )}
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                {pagination.total ?? 0} kunjungan
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Cari nama mahrom, NIM, NIK, santri…"
                className="flex-1 min-w-0 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg dark:text-gray-100 outline-none focus:ring-2 focus:ring-teal-500/30"
              />
              <button
                type="button"
                onClick={handleSearch}
                className="px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cari
              </button>
            </div>
          </div>

          {error && (
            <div className="mx-3 mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <p className="p-4 text-sm text-gray-500">Memuat…</p>
            ) : list.length === 0 ? (
              <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
                {isToday ? 'Belum ada kunjungan hari ini.' : 'Tidak ada kunjungan pada tanggal ini.'}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {list.map((row) => (
                  <li
                    key={row.id}
                    className={`px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer ${
                      currentEntry?.id === row.id ? 'bg-teal-50/80 dark:bg-teal-900/20' : ''
                    }`}
                    onClick={() => handleListRowClick(row)}
                  >
                    <div className="flex justify-between gap-2 items-start">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                          {row.mahrom?.nama || '—'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          NIM {row.mahrom?.nim || '—'}
                          {row.mahrom?.nik ? ` · NIK ${row.mahrom.nik}` : ''}
                        </p>
                        <p className="text-xs text-teal-700 dark:text-teal-400 mt-1">
                          {(row.santri_didatangi || [])
                            .map((s) => s.santri_nama)
                            .filter(Boolean)
                            .join(', ') || '—'}
                        </p>
                      </div>
                      <BukuTamuListWaktu waktuDatang={row.waktu_datang} hijriMap={hijriMap} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex-shrink-0 flex items-center justify-between p-3 border-t border-gray-200 dark:border-gray-700 text-sm">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2 py-1 rounded disabled:opacity-40"
              >
                ←
              </button>
              <span className="text-gray-500">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-2 py-1 rounded disabled:opacity-40"
              >
                →
              </button>
            </div>
          )}
        </div>

        {/* Kanan: scan + biodata (desktop) */}
        <div className="hidden lg:flex w-full lg:w-[32rem] lg:max-w-lg lg:shrink-0 flex-col min-h-0 gap-3">
          {desktopLayout ? (
            <BukuTamuQrInlineScanner onScan={handleScan} disabled={scanning} active />
          ) : null}

          <div className="flex-1 min-h-0 overflow-y-auto bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
            <BukuTamuBiodataPanel
              currentMahrom={currentMahrom}
              currentEntry={currentEntry}
              biodata={biodata}
              santriOptions={santriOptions}
              selectedSantriIds={selectedSantriIds}
              onToggleSantri={toggleSantri}
              onViewSantriDetail={handleViewSantriDetail}
              ktpLoading={ktpLoading}
              ktpPreviewUrl={ktpPreviewUrl}
              scanError={scanError}
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={openMobileScan}
        className="lg:hidden fixed z-[50] bottom-20 right-5 w-14 h-14 rounded-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white shadow-lg flex items-center justify-center transition-colors"
        aria-label="Scan QR kartu mahrom"
      >
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h2m10 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
          />
        </svg>
      </button>

      <BukuTamuMobileOffcanvas
        isOpen={mobileOffcanvasOpen}
        mode={mobileOffcanvasMode}
        onClose={closeMobileOffcanvas}
        onExitComplete={resetMobileOffcanvasAfterClose}
        onScan={handleMobileScan}
        scanning={scanning}
        countdown={autoCloseCountdown}
        countdownActive={autoCloseActive}
        onKeepOpen={() => setAutoCloseActive(false)}
        scanError={scanError}
      >
        <BukuTamuBiodataPanel
          currentMahrom={currentMahrom}
          currentEntry={currentEntry}
          biodata={biodata}
          santriOptions={santriOptions}
          selectedSantriIds={selectedSantriIds}
          onToggleSantri={toggleSantri}
          onViewSantriDetail={handleViewSantriDetail}
          ktpLoading={ktpLoading}
          ktpPreviewUrl={ktpPreviewUrl}
          scanError={scanError}
          emptyMessage="Memuat biodata…"
        />
      </BukuTamuMobileOffcanvas>
    </div>
  )
}
