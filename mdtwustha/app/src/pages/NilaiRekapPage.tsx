import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  getKelas,
  getNilaiRekap,
  type KelasRow,
  type MapelRow,
  type NilaiRekapRow,
  type NilaiRekapTampil,
  type AbsenStatus,
} from '../api/apiClient'
import PickDateHijriMasehi, {
  type DualDateValue,
  formatHijriDateDisplay,
  formatMasehiDateDisplay,
  compareMasehiYmd,
  todayMasehi,
  masehiMaxRekap,
} from '../components/PickDateHijri/PickDateHijriMasehi'
import { formatMapelLabel } from '../utils/formatMapel'
import { exportNilaiRekapToExcel } from '../utils/exportExcel'
import MaterialIcon from '../components/MaterialIcon'

const TAMPIL_OPTIONS: { value: NilaiRekapTampil; label: string }[] = [
  { value: 'nilai', label: 'Nilai saja' },
  { value: 'absen', label: 'Absen saja' },
  { value: 'keduanya', label: 'Nilai & Absen' },
]

const ABSEN_CLASS: Record<AbsenStatus, string> = {
  H: 'text-emerald-600 dark:text-emerald-400 font-semibold',
  S: 'text-amber-600 dark:text-amber-400 font-semibold',
  I: 'text-blue-600 dark:text-blue-400 font-semibold',
  A: 'text-red-600 dark:text-red-400 font-semibold',
}

function formatKelasLabel(nama: string, kel?: string) {
  return kel ? `${nama} · ${kel}` : nama
}

function firstDayOfMonthMasehi() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function shortMapelHeader(m: MapelRow) {
  const fan = m.fan || ''
  const kitab = m.kitab_nama || ''
  if (fan && kitab) return `${fan}\n${kitab}`
  return fan || kitab || formatMapelLabel(m)
}

function rowNilaiStats(row: NilaiRekapRow, mapel: MapelRow[]) {
  const values: number[] = []
  for (const m of mapel) {
    const v = row.cells?.[m.id]?.nilai
    if (v !== null && v !== undefined && !Number.isNaN(Number(v))) values.push(Number(v))
  }
  const sum = values.reduce((a, b) => a + b, 0)
  const avg = values.length ? Math.round((sum / values.length) * 100) / 100 : null
  return { sum: values.length ? Math.round(sum * 100) / 100 : null, avg, count: values.length }
}

export default function NilaiRekapPage() {
  const masehiMax = masehiMaxRekap()
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
  const [tampil, setTampil] = useState<NilaiRekapTampil>('nilai')
  const [mapelCols, setMapelCols] = useState<MapelRow[]>([])
  const [rows, setRows] = useState<NilaiRekapRow[]>([])
  const [periodeMeta, setPeriodeMeta] = useState<{ awal: string; akhir: string } | null>(null)
  const [kelasLoading, setKelasLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  useEffect(() => {
    const loadKelas = async () => {
      setKelasLoading(true)
      const res = await getKelas()
      if (res.success && res.data.length > 0) {
        setKelasList(res.data)
        setSelectedKelasIds((prev) => (prev.size > 0 ? prev : new Set([res.data[0].id])))
      } else if (!res.success) {
        setError(res.message || 'Gagal memuat daftar kelas')
      }
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
      if (!prev || compareMasehiYmd(prev.masehi, value.masehi) < 0) return value
      return prev
    })
  }, [])

  const selectedIdsArr = useMemo(() => Array.from(selectedKelasIds), [selectedKelasIds])

  const fetchRekap = useCallback(async () => {
    const awal = tanggalDari?.masehi
    const akhir = tanggalSampai?.masehi
    if (!selectedIdsArr.length || !awal || !akhir) {
      setRows([])
      setMapelCols([])
      return
    }
    if (compareMasehiYmd(awal, akhir) > 0) {
      setError('Tanggal awal tidak boleh setelah tanggal akhir')
      setRows([])
      setMapelCols([])
      return
    }
    setLoading(true)
    setError('')
    const res = await getNilaiRekap(selectedIdsArr, awal, akhir)
    if (res.success) {
      setMapelCols(res.mapel || [])
      setRows(res.data || [])
      const metaAwal = res.meta?.tanggal_awal
      const metaAkhir = res.meta?.tanggal_akhir
      if (metaAwal && metaAkhir) setPeriodeMeta({ awal: metaAwal, akhir: metaAkhir })
      else setPeriodeMeta(null)
    } else {
      setMapelCols([])
      setRows([])
      setError(res.message || 'Gagal memuat rekap nilai')
    }
    setLoading(false)
  }, [selectedIdsArr, tanggalDari?.masehi, tanggalSampai?.masehi])

  useEffect(() => {
    fetchRekap()
  }, [fetchRekap])

  const toggleKelas = (id: string) => {
    setSelectedKelasIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size === 1) return prev
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAllKelas = () => {
    setSelectedKelasIds(new Set(kelasList.map((k) => k.id)))
  }

  const selectedKelasLabel = useMemo(() => {
    const selected = kelasList.filter((k) => selectedKelasIds.has(k.id))
    if (selected.length === 0) return 'Pilih kelas'
    if (selected.length === 1) return formatKelasLabel(selected[0].nama_kelas, selected[0].kel)
    if (selected.length === kelasList.length) return `Semua kelas (${selected.length})`
    return `${selected.length} kelas dipilih`
  }, [kelasList, selectedKelasIds])

  const kelasLabelFull = useMemo(() => {
    return kelasList
      .filter((k) => selectedKelasIds.has(k.id))
      .map((k) => formatKelasLabel(k.nama_kelas, k.kel))
      .join(', ')
  }, [kelasList, selectedKelasIds])

  const showNilai = tampil === 'nilai' || tampil === 'keduanya'
  const showAbsen = tampil === 'absen' || tampil === 'keduanya'
  const showKelasCol = selectedKelasIds.size > 1
  const subColCount = (showNilai ? 1 : 0) + (showAbsen ? 1 : 0)
  const nameColSpan = 2 + (showKelasCol ? 1 : 0)
  const statsColCount = showNilai ? 2 : 0
  const totalColSpan = nameColSpan + mapelCols.length * Math.max(subColCount, 1) + statsColCount

  const handleExport = async () => {
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
      await exportNilaiRekapToExcel(rows, {
        kelasLabel: kelasLabelFull || selectedKelasLabel,
        tanggalAwal: awal,
        tanggalAkhir: akhir,
        hijriAwal: tanggalDari?.hijri || undefined,
        hijriAkhir: tanggalSampai?.hijri || undefined,
        tampil,
        mapel: mapelCols,
      })
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Gagal mengekspor ke Excel')
    } finally {
      setExporting(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-3 text-sm"
    >
      <div>
        <Link to="/nilai" className="text-xs text-blue-600 dark:text-blue-400 hover:underline mb-1 inline-flex items-center gap-1">
          <MaterialIcon name="arrow_back" size={14} /> Kembali ke Nilai
        </Link>
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Rekap Nilai</h1>
        <p className="text-xs ui-text-muted mt-0.5">
          Nilai/absen per santri, mapel sebagai kolom, rentang tanggal ujian.
        </p>
      </div>

      <div className="ui-card p-3 space-y-2.5">
        <div ref={kelasMenuRef} className="relative max-w-md">
          <label className="ui-label mb-1 block text-xs">Kelas / Rombel</label>
          <button
            type="button"
            disabled={kelasLoading}
            onClick={() => setKelasMenuOpen((o) => !o)}
            className="ui-input w-full text-sm py-1.5 text-left flex items-center justify-between gap-2 disabled:opacity-50"
          >
            <span className="truncate">{selectedKelasLabel}</span>
            <MaterialIcon name={kelasMenuOpen ? "expand_less" : "expand_more"} size={16} className="ui-text-muted shrink-0" />
          </button>
          {kelasMenuOpen && (
            <div className="absolute z-30 mt-1 w-full rounded-lg border ui-divider bg-white dark:bg-slate-900 shadow-lg max-h-56 overflow-y-auto p-1.5 space-y-0.5">
              <button
                type="button"
                onClick={selectAllKelas}
                className="w-full text-left px-2 py-1.5 text-xs rounded-md text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
              >
                Pilih semua
              </button>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2 border-t ui-divider [&_.ui-label]:text-xs [&_.ui-label]:mb-1 [&_button]:text-sm [&_button]:py-1.5 [&_.text-sm]:text-xs">
          <PickDateHijriMasehi
            id="nilai-rekap-dari"
            label="Dari tanggal"
            value={tanggalDari}
            onChange={handleDariChange}
            masehiMax={tanggalSampai?.masehi || masehiMax}
          />
          <PickDateHijriMasehi
            id="nilai-rekap-sampai"
            label="Sampai tanggal"
            value={tanggalSampai}
            onChange={setTanggalSampai}
            hijriMin={tanggalDari?.hijri || undefined}
            masehiMax={masehiMax}
          />
        </div>

        <div className="pt-2 border-t ui-divider">
          <p className="ui-label mb-1.5 text-xs">Tampilkan</p>
          <div className="flex flex-wrap gap-1.5">
            {TAMPIL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTampil(opt.value)}
                className={`px-2.5 py-1 text-xs rounded-md border transition ${
                  tampil === opt.value
                    ? 'border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300 font-medium'
                    : 'ui-divider ui-text-muted hover:bg-slate-50 dark:hover:bg-slate-900/40'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {periodeMeta && (
          <div className="text-xs ui-text-muted pt-2 border-t ui-divider space-y-0.5 leading-snug">
            <p>
              Periode Masehi: {formatMasehiDateDisplay(periodeMeta.awal)} —{' '}
              {formatMasehiDateDisplay(periodeMeta.akhir)}
            </p>
            {tanggalDari?.hijri && tanggalSampai?.hijri && (
              <p>
                Hijriyah: {formatHijriDateDisplay(tanggalDari.hijri)} —{' '}
                {formatHijriDateDisplay(tanggalSampai.hijri)}
              </p>
            )}
            <p>
              Rombel:{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">{kelasLabelFull}</span>
            </p>
          </div>
        )}

        <div className="pt-2 border-t ui-divider">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || loading || rows.length === 0}
            className="px-2 py-1 text-[11px] leading-tight ui-btn-secondary rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? 'Mengekspor…' : 'Ekspor XLSX'}
          </button>
        </div>
      </div>

      {(error || exportError) && (
        <div className="ui-error-box px-3 py-2 text-xs">{error || exportError}</div>
      )}

      <div className="ui-table-wrap">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="ui-table-head">
              <tr>
                <th className="px-1 py-1.5 font-medium text-center w-8" rowSpan={tampil === 'keduanya' ? 2 : 1}>
                  No
                </th>
                {showKelasCol && (
                  <th
                    className="px-2 py-1.5 font-medium min-w-[4.5rem]"
                    rowSpan={tampil === 'keduanya' ? 2 : 1}
                  >
                    Kelas
                  </th>
                )}
                <th
                  className="px-2 py-1.5 font-medium sticky left-0 bg-inherit min-w-[8rem]"
                  rowSpan={tampil === 'keduanya' ? 2 : 1}
                >
                  Nama Santri
                </th>
                {mapelCols.map((m) => (
                  <th
                    key={m.id}
                    className="px-1 py-1.5 font-medium text-center border-l ui-divider align-bottom min-w-[4.5rem]"
                    colSpan={tampil === 'keduanya' ? 2 : 1}
                    title={formatMapelLabel(m)}
                  >
                    <span className="block text-[10px] leading-tight whitespace-pre-line">{shortMapelHeader(m)}</span>
                    {(m.dari || m.sampai) && (
                      <span className="block text-[9px] ui-text-muted font-normal mt-0.5">
                        {m.dari || '…'}–{m.sampai || '…'}
                      </span>
                    )}
                  </th>
                ))}
                {showNilai && (
                  <>
                    <th
                      className="px-1.5 py-1.5 font-medium text-center border-l ui-divider bg-slate-50/80 dark:bg-slate-800/40"
                      rowSpan={tampil === 'keduanya' ? 2 : 1}
                    >
                      Total
                    </th>
                    <th
                      className="px-1.5 py-1.5 font-medium text-center border-l ui-divider bg-slate-50/80 dark:bg-slate-800/40"
                      rowSpan={tampil === 'keduanya' ? 2 : 1}
                    >
                      Rata-rata
                    </th>
                  </>
                )}
              </tr>
              {tampil === 'keduanya' && mapelCols.length > 0 && (
                <tr>
                  {mapelCols.map((m) => (
                    <Fragment key={m.id}>
                      <th className="px-1 py-1 font-medium text-center text-[10px] ui-text-muted border-l ui-divider">
                        Nilai
                      </th>
                      <th className="px-1 py-1 font-medium text-center text-[10px] ui-text-muted border-l ui-divider">
                        Absen
                      </th>
                    </Fragment>
                  ))}
                </tr>
              )}
            </thead>
            <tbody className="ui-table-body">
              {loading || kelasLoading ? (
                <tr>
                  <td colSpan={Math.max(totalColSpan, 3)} className="px-4 py-6 text-center ui-text-muted">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Memuat rekap…
                    </div>
                  </td>
                </tr>
              ) : selectedIdsArr.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(totalColSpan, 3)} className="px-4 py-6 text-center ui-text-muted">
                    Pilih minimal satu kelas
                  </td>
                </tr>
              ) : mapelCols.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(totalColSpan, 3)} className="px-4 py-6 text-center ui-text-muted">
                    Belum ada mapel terhubung ke rombel terpilih
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={totalColSpan} className="px-4 py-6 text-center ui-text-muted">
                    Tidak ada santri di rombel terpilih
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => {
                  const stats = showNilai ? rowNilaiStats(row, mapelCols) : null
                  return (
                    <tr key={`${row.kelas_id || ''}-${row.santri_id}`} className="ui-table-row">
                      <td className="px-1 py-1 text-center ui-text-muted tabular-nums">{index + 1}</td>
                      {showKelasCol && (
                        <td className="px-2 py-1 ui-text-muted">
                          {formatKelasLabel(row.nama_kelas || '', row.kel)}
                        </td>
                      )}
                      <td className="px-2 py-1 sticky left-0 bg-inherit">
                        <div className="font-medium text-slate-800 dark:text-slate-200 leading-tight">{row.nama}</div>
                        {row.nomer_induk && (
                          <div className="text-[10px] ui-text-muted leading-tight">{row.nomer_induk}</div>
                        )}
                      </td>
                      {mapelCols.map((m) => {
                        const cellData = row.cells?.[m.id] ?? null
                        if (tampil === 'nilai') {
                          return (
                            <td key={m.id} className="px-1 py-1 text-center border-l ui-divider tabular-nums">
                              {cellData?.nilai !== null && cellData?.nilai !== undefined ? (
                                <span className="font-medium text-slate-800 dark:text-slate-200">
                                  {cellData.nilai}
                                </span>
                              ) : (
                                <span className="ui-text-muted">—</span>
                              )}
                            </td>
                          )
                        }
                        if (tampil === 'absen') {
                          return (
                            <td key={m.id} className="px-1 py-1 text-center border-l ui-divider">
                              {cellData?.absen ? (
                                <span className={ABSEN_CLASS[cellData.absen]}>{cellData.absen}</span>
                              ) : (
                                <span className="ui-text-muted">—</span>
                              )}
                            </td>
                          )
                        }
                        return (
                          <Fragment key={m.id}>
                            <td className="px-1 py-1 text-center border-l ui-divider tabular-nums">
                              {cellData?.nilai !== null && cellData?.nilai !== undefined ? (
                                <span className="font-medium text-slate-800 dark:text-slate-200">
                                  {cellData.nilai}
                                </span>
                              ) : (
                                <span className="ui-text-muted">—</span>
                              )}
                            </td>
                            <td className="px-1 py-1 text-center border-l ui-divider">
                              {cellData?.absen ? (
                                <span className={ABSEN_CLASS[cellData.absen]}>{cellData.absen}</span>
                              ) : (
                                <span className="ui-text-muted">—</span>
                              )}
                            </td>
                          </Fragment>
                        )
                      })}
                      {showNilai && stats && (
                        <>
                          <td className="px-1.5 py-1 text-center border-l ui-divider tabular-nums font-semibold bg-slate-50/60 dark:bg-slate-800/30">
                            {stats.sum !== null ? stats.sum : <span className="ui-text-muted font-normal">—</span>}
                          </td>
                          <td className="px-1.5 py-1 text-center border-l ui-divider tabular-nums font-semibold bg-slate-50/60 dark:bg-slate-800/30">
                            {stats.avg !== null ? stats.avg : <span className="ui-text-muted font-normal">—</span>}
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {rows.length > 0 && mapelCols.length > 0 && (
        <p className="text-[10px] ui-text-muted leading-snug">
          Total & rata-rata dihitung dari nilai mapel yang terisi. Jika ada beberapa ujian mapel dalam
          rentang, dipakai tanggal ujian terakhir.
        </p>
      )}
    </motion.div>
  )
}
