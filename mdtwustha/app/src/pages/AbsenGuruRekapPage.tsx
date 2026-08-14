import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { getKelas, getAbsenGuruRekap, type KelasRow, type AbsenGuruRekapRow, type JurnalStatus } from '../api/apiClient'
import PickDateHijriMasehi, {
  type DualDateValue,
  formatHijriDateDisplay,
  formatMasehiDateDisplay,
  compareMasehiYmd,
  todayMasehi,
  masehiMaxRekap,
} from '../components/PickDateHijri/PickDateHijriMasehi'
import { exportAbsenGuruRekapToExcel } from '../utils/exportExcel'
import MaterialIcon from '../components/MaterialIcon'
import OffcanvasAbsenGuruRekapPublish from '../components/OffcanvasAbsenGuruRekapPublish'
import { getStoredUser } from '../utils/auth'

const STATUS_LABEL: Record<JurnalStatus, string> = {
  mengajar: 'Mengajar',
  ijin: 'Izin',
  sakit: 'Sakit',
}

type TampilanJam = 'total' | 'terpisah'

const TAMPILAN_OPTIONS: { value: TampilanJam; label: string }[] = [
  { value: 'total', label: 'Total semua' },
  { value: 'terpisah', label: 'Jam 1 & 2 terpisah' },
]

const STATUS_KEYS: JurnalStatus[] = ['mengajar', 'ijin', 'sakit']

function isAdminAkses(akses?: string) {
  return akses === 'super_admin' || akses === 'admin'
}

function formatKelasLabel(nama: string, kel?: string) {
  return kel ? `${nama} · ${kel}` : nama
}

function firstDayOfMonthMasehi() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function CountCell({ value, status }: { value: number; status: JurnalStatus }) {
  if (value === 0) return <span className="ui-text-muted">0</span>
  const colors: Record<JurnalStatus, string> = {
    mengajar: 'text-emerald-600 dark:text-emerald-400 font-semibold',
    ijin: 'text-blue-600 dark:text-blue-400 font-semibold',
    sakit: 'text-amber-600 dark:text-amber-400 font-semibold',
  }
  return (
    <span className={colors[status]} title={STATUS_LABEL[status]}>
      {value}
    </span>
  )
}

function sumJamCounts(j1: AbsenGuruRekapRow['jam_1'], j2: AbsenGuruRekapRow['jam_2']) {
  return {
    mengajar: j1.mengajar + j2.mengajar,
    ijin: j1.ijin + j2.ijin,
    sakit: j1.sakit + j2.sakit,
  } satisfies AbsenGuruRekapRow['total']
}

function rowTotal(row: AbsenGuruRekapRow) {
  return row.total ?? sumJamCounts(row.jam_1, row.jam_2)
}

function emptyCounts(): AbsenGuruRekapRow['total'] {
  return { mengajar: 0, ijin: 0, sakit: 0 }
}

function sumRows(rows: AbsenGuruRekapRow[], pick: (row: AbsenGuruRekapRow) => AbsenGuruRekapRow['total']) {
  return rows.reduce(
    (acc, row) => {
      const c = pick(row)
      acc.mengajar += c.mengajar
      acc.ijin += c.ijin
      acc.sakit += c.sakit
      return acc
    },
    emptyCounts()
  )
}

export default function AbsenGuruRekapPage() {
  const navigate = useNavigate()
  const masehiMax = masehiMaxRekap()
  const storedUser = getStoredUser()
  const isAdmin = isAdminAkses(storedUser?.akses)
  const [userAkses, setUserAkses] = useState(storedUser?.akses || 'user')
  const [pengurusId] = useState(storedUser?.id || '')
  const [kelasList, setKelasList] = useState<KelasRow[]>([])
  const [selectedKelasIds, setSelectedKelasIds] = useState<Set<string>>(new Set())
  const [kelasMenuOpen, setKelasMenuOpen] = useState(false)
  const kelasMenuRef = useRef<HTMLDivElement>(null)
  const [tanggalDari, setTanggalDari] = useState<DualDateValue | null>({
    masehi: firstDayOfMonthMasehi(),
    hijri: '',
  })
  const [tanggalSampai, setTanggalSampai] = useState<DualDateValue | null>({
    masehi: todayMasehi(),
    hijri: '',
  })
  const [tampilanJam, setTampilanJam] = useState<TampilanJam>('total')
  const [rows, setRows] = useState<AbsenGuruRekapRow[]>([])
  const [hariEfektif, setHariEfektif] = useState(0)
  const [periodeMeta, setPeriodeMeta] = useState<{ awal: string; akhir: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [kelasLoading, setKelasLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [publishOpen, setPublishOpen] = useState(false)

  useEffect(() => {
    const user = getStoredUser()
    if (!user) {
      navigate('/login', { replace: true })
      return
    }
    if (user.akses && user.akses !== userAkses) {
      setUserAkses(user.akses)
    }
  }, [navigate, userAkses])

  useEffect(() => {
    const loadKelas = async () => {
      setKelasLoading(true)
      const res = await getKelas()
      if (res.success) setKelasList(res.data)
      setKelasLoading(false)
    }
    loadKelas()
  }, [])

  useEffect(() => {
    if (!kelasMenuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (kelasMenuRef.current && !kelasMenuRef.current.contains(e.target as Node)) {
        setKelasMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [kelasMenuOpen])

  const handleDariChange = useCallback((value: DualDateValue | null) => {
    setTanggalDari(value)
    if (!value) return
    setTanggalSampai((prev) => {
      if (!prev || compareMasehiYmd(prev.masehi, value.masehi) < 0) return prev
      return value
    })
  }, [])

  const selectedIdsArr = useMemo(() => Array.from(selectedKelasIds), [selectedKelasIds])

  /** Kosong atau semua tercentang = tanpa filter (semua kelas). */
  const kelasFilterIds = useMemo(() => {
    if (selectedIdsArr.length === 0 || selectedIdsArr.length === kelasList.length) return []
    return selectedIdsArr
  }, [selectedIdsArr, kelasList.length])

  const fetchRekap = useCallback(async () => {
    const awal = tanggalDari?.masehi
    const akhir = tanggalSampai?.masehi
    if (!awal || !akhir || !userAkses) {
      setRows([])
      return
    }
    if (compareMasehiYmd(awal, akhir) > 0) {
      setError('Tanggal awal tidak boleh setelah tanggal akhir')
      setRows([])
      return
    }
    setLoading(true)
    setError('')
    const res = await getAbsenGuruRekap(
      awal,
      akhir,
      userAkses,
      kelasFilterIds,
      isAdmin ? undefined : pengurusId
    )
    if (res.success) {
      setRows(Array.isArray(res.data) ? res.data : [])
      setHariEfektif(res.meta?.hari_efektif ?? 0)
      const metaAwal = res.meta?.tanggal_awal
      const metaAkhir = res.meta?.tanggal_akhir
      if (metaAwal && metaAkhir) setPeriodeMeta({ awal: metaAwal, akhir: metaAkhir })
      else setPeriodeMeta(null)
    } else {
      setRows([])
      setError(res.message || 'Gagal memuat rekap absen guru')
    }
    setLoading(false)
  }, [kelasFilterIds, tanggalDari?.masehi, tanggalSampai?.masehi, userAkses, isAdmin, pengurusId])

  useEffect(() => {
    fetchRekap()
  }, [fetchRekap])

  const toggleKelas = (id: string) => {
    setSelectedKelasIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllKelas = () => {
    setSelectedKelasIds(new Set(kelasList.map((k) => k.id)))
  }

  const clearKelas = () => {
    setSelectedKelasIds(new Set())
  }

  const selectedKelasLabel = useMemo(() => {
    if (selectedKelasIds.size === 0 || selectedKelasIds.size === kelasList.length) {
      return kelasList.length ? `Semua kelas (${kelasList.length})` : 'Semua kelas'
    }
    if (selectedKelasIds.size === 1) {
      const k = kelasList.find((x) => selectedKelasIds.has(x.id))
      return k ? formatKelasLabel(k.nama_kelas, k.kel) : '1 kelas'
    }
    return `${selectedKelasIds.size} kelas dipilih`
  }, [kelasList, selectedKelasIds])

  const kelasLabelFull = useMemo(() => {
    if (selectedKelasIds.size === 0 || selectedKelasIds.size === kelasList.length) {
      return 'Semua kelas'
    }
    return kelasList
      .filter((k) => selectedKelasIds.has(k.id))
      .map((k) => formatKelasLabel(k.nama_kelas, k.kel))
      .join(', ')
  }, [kelasList, selectedKelasIds])

  const kelasLabel = kelasLabelFull

  const grandTotal = useMemo(() => sumRows(rows, rowTotal), [rows])
  const hasAnyActivity = grandTotal.mengajar + grandTotal.ijin + grandTotal.sakit > 0
  const showTerpisah = tampilanJam === 'terpisah'
  const tableColSpan = showTerpisah ? 7 : 4

  const handleExportExcel = useCallback(async () => {
    setExportError('')
    if (!rows.length) {
      setExportError('Tidak ada data rekap untuk diekspor')
      return
    }
    const awal = periodeMeta?.awal || tanggalDari?.masehi
    const akhir = periodeMeta?.akhir || tanggalSampai?.masehi
    if (!awal || !akhir) {
      setExportError('Periode tanggal belum lengkap')
      return
    }
    setExporting(true)
    try {
      await exportAbsenGuruRekapToExcel(rows, {
        kelasLabel,
        tanggalAwal: awal,
        tanggalAkhir: akhir,
        hijriAwal: tanggalDari?.hijri || undefined,
        hijriAkhir: tanggalSampai?.hijri || undefined,
        hariEfektif,
        tampilanJam,
      })
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Gagal mengekspor ke Excel')
    } finally {
      setExporting(false)
    }
  }, [rows, periodeMeta, tanggalDari, tanggalSampai, kelasLabel, hariEfektif, tampilanJam])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <Link to="/absen-guru" className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-2 inline-flex items-center gap-1">
            <MaterialIcon name="arrow_back" size={14} /> Kembali ke Absen Guru
          </Link>
          <h1 className="ui-title-lg">Rekap Absen Guru</h1>
          <p className="ui-subtitle mt-1">
            Ringkasan kehadiran guru berdasarkan jurnal mengajar (mengajar, izin, sakit) per jam pelajaran.
          </p>
          <Link
            to="/absen-guru/hasil-rekap"
            className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
          >
            <MaterialIcon name="publish" size={14} /> Hasil Rekap Guru (publish)
          </Link>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setPublishOpen(true)}
              disabled={loading || !tanggalDari?.masehi || !tanggalSampai?.masehi}
              className="px-4 py-2.5 text-sm ui-btn-primary disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <MaterialIcon name="publish" size={18} /> Publish
            </button>
          )}
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exporting || loading || rows.length === 0}
            className="px-4 py-2.5 text-sm ui-btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? 'Mengekspor…' : 'Ekspor Excel'}
          </button>
        </div>
      </div>

      {exportError && <div className="ui-error-box px-4 py-3 text-sm">{exportError}</div>}

      <div className="ui-card p-4 sm:p-5 space-y-4">
        <div ref={kelasMenuRef} className="relative max-w-md">
          <label className="ui-label mb-1.5 block">Kelas</label>
          <button
            type="button"
            disabled={kelasLoading}
            onClick={() => setKelasMenuOpen((o) => !o)}
            className="ui-input-lg w-full text-left flex items-center justify-between gap-2 disabled:opacity-50"
          >
            <span className="truncate">{selectedKelasLabel}</span>
            <MaterialIcon
              name={kelasMenuOpen ? 'expand_less' : 'expand_more'}
              size={18}
              className="ui-text-muted shrink-0"
            />
          </button>
          {kelasMenuOpen && (
            <div className="absolute z-30 mt-1 w-full rounded-lg border ui-divider bg-white dark:bg-slate-900 shadow-lg max-h-56 overflow-y-auto p-1.5 space-y-0.5">
              <div className="flex gap-1 px-1 pb-1">
                <button
                  type="button"
                  onClick={selectAllKelas}
                  className="flex-1 text-left px-2 py-1.5 text-xs rounded-md text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                >
                  Pilih semua
                </button>
                <button
                  type="button"
                  onClick={clearKelas}
                  className="flex-1 text-left px-2 py-1.5 text-xs rounded-md ui-text-muted hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  Semua kelas
                </button>
              </div>
              {kelasList.map((k) => (
                <label
                  key={k.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <input
                    type="checkbox"
                    checked={selectedKelasIds.has(k.id)}
                    onChange={() => toggleKelas(k.id)}
                    className="rounded border-slate-300"
                  />
                  {formatKelasLabel(k.nama_kelas, k.kel)}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t ui-divider">
          <PickDateHijriMasehi
            id="guru-rekap-dari"
            label="Dari tanggal"
            value={tanggalDari}
            onChange={handleDariChange}
            masehiMax={tanggalSampai?.masehi || masehiMax}
          />
          <PickDateHijriMasehi
            id="guru-rekap-sampai"
            label="Sampai tanggal"
            value={tanggalSampai}
            onChange={setTanggalSampai}
            hijriMin={tanggalDari?.hijri || undefined}
            masehiMax={masehiMax}
          />
        </div>

        <div className="pt-2 border-t ui-divider">
          <p className="ui-label mb-1.5">Tampilan jam</p>
          <div className="flex flex-wrap gap-1.5">
            {TAMPILAN_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTampilanJam(opt.value)}
                className={`px-2.5 py-1.5 text-xs rounded-md border transition ${
                  tampilanJam === opt.value
                    ? 'border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300 font-medium'
                    : 'ui-divider ui-text-muted hover:bg-slate-50 dark:hover:bg-slate-900/40'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {hariEfektif > 0 && periodeMeta && (
          <div className="text-sm ui-text-muted pt-2 border-t ui-divider space-y-1">
            <p>
              <span className="font-medium text-slate-700 dark:text-slate-300">{hariEfektif} hari</span> dalam
              rentang:
            </p>
            <p>
              Masehi: {formatMasehiDateDisplay(periodeMeta.awal)} — {formatMasehiDateDisplay(periodeMeta.akhir)}
            </p>
            {tanggalDari?.hijri && tanggalSampai?.hijri && (
              <p>
                Hijriyah: {formatHijriDateDisplay(tanggalDari.hijri)} —{' '}
                {formatHijriDateDisplay(tanggalSampai.hijri)}
              </p>
            )}
            <p>
              Kelas:{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">{kelasLabelFull}</span>
            </p>
          </div>
        )}
      </div>

      {error && <div className="ui-error-box px-4 py-3 text-sm">{error}</div>}

      <div className="ui-table-wrap">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="ui-table-head">
              {showTerpisah ? (
                <>
                  <tr>
                    <th className="px-3 sm:px-4 py-3 font-medium sticky left-0 bg-inherit" rowSpan={2}>
                      Nama Guru
                    </th>
                    <th className="px-2 py-3 font-medium text-center border-l ui-divider" colSpan={3}>
                      Jam 1
                    </th>
                    <th className="px-2 py-3 font-medium text-center border-l ui-divider" colSpan={3}>
                      Jam 2
                    </th>
                  </tr>
                  <tr>
                    {STATUS_KEYS.map((s) => (
                      <th
                        key={`j1-${s}`}
                        className="px-2 py-2 font-medium text-center text-xs ui-text-muted border-l ui-divider"
                      >
                        {STATUS_LABEL[s]}
                      </th>
                    ))}
                    {STATUS_KEYS.map((s) => (
                      <th
                        key={`j2-${s}`}
                        className="px-2 py-2 font-medium text-center text-xs ui-text-muted border-l ui-divider"
                      >
                        {STATUS_LABEL[s]}
                      </th>
                    ))}
                  </tr>
                </>
              ) : (
                <tr>
                  <th className="px-3 sm:px-4 py-3 font-medium sticky left-0 bg-inherit">Nama Guru</th>
                  {STATUS_KEYS.map((s) => (
                    <th
                      key={`tot-${s}`}
                      className="px-2 py-3 font-medium text-center border-l ui-divider"
                      title={STATUS_LABEL[s]}
                    >
                      {STATUS_LABEL[s]}
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody className="ui-table-body">
              {loading ? (
                <tr>
                  <td colSpan={tableColSpan} className="px-6 py-10 text-center ui-text-muted">
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Memuat rekap...
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={tableColSpan} className="px-6 py-10 text-center ui-text-muted">
                    Tidak ada data guru
                  </td>
                </tr>
              ) : (
                <>
                  {rows.map((row) => {
                    const total = rowTotal(row)
                    return (
                      <tr key={row.pengurus_id} className="ui-table-row">
                        <td className="px-3 sm:px-4 py-3 sticky left-0 bg-inherit font-medium text-slate-800 dark:text-slate-200">
                          {row.pengurus_nama}
                        </td>
                        {showTerpisah ? (
                          <>
                            {STATUS_KEYS.map((s) => (
                              <td
                                key={`${row.pengurus_id}-j1-${s}`}
                                className="px-2 py-3 text-center border-l ui-divider"
                              >
                                <CountCell value={row.jam_1[s]} status={s} />
                              </td>
                            ))}
                            {STATUS_KEYS.map((s) => (
                              <td
                                key={`${row.pengurus_id}-j2-${s}`}
                                className="px-2 py-3 text-center border-l ui-divider"
                              >
                                <CountCell value={row.jam_2[s]} status={s} />
                              </td>
                            ))}
                          </>
                        ) : (
                          STATUS_KEYS.map((s) => (
                            <td
                              key={`${row.pengurus_id}-tot-${s}`}
                              className="px-2 py-3 text-center border-l ui-divider"
                            >
                              <CountCell value={total[s]} status={s} />
                            </td>
                          ))
                        )}
                      </tr>
                    )
                  })}
                  {hasAnyActivity && (
                    <tr className="ui-table-row font-semibold bg-slate-100/80 dark:bg-slate-800/60">
                      <td className="px-3 sm:px-4 py-3 sticky left-0 bg-inherit text-slate-800 dark:text-slate-200">
                        Total keseluruhan
                      </td>
                      {showTerpisah ? (
                        <>
                          {STATUS_KEYS.map((s) => (
                            <td key={`grand-j1-${s}`} className="px-2 py-3 text-center border-l ui-divider">
                              <CountCell value={sumRows(rows, (r) => r.jam_1)[s]} status={s} />
                            </td>
                          ))}
                          {STATUS_KEYS.map((s) => (
                            <td key={`grand-j2-${s}`} className="px-2 py-3 text-center border-l ui-divider">
                              <CountCell value={sumRows(rows, (r) => r.jam_2)[s]} status={s} />
                            </td>
                          ))}
                        </>
                      ) : (
                        STATUS_KEYS.map((s) => (
                          <td key={`grand-total-${s}`} className="px-2 py-3 text-center border-l ui-divider">
                            <CountCell value={grandTotal[s]} status={s} />
                          </td>
                        ))
                      )}
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <OffcanvasAbsenGuruRekapPublish
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onSaved={() => navigate('/absen-guru/hasil-rekap')}
        kelasList={kelasList}
        initialKelasIds={selectedIdsArr}
        initialDari={tanggalDari}
        initialSampai={tanggalSampai}
      />
    </motion.div>
  )
}
