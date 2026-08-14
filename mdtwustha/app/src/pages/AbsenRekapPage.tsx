import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { getKelas, getAbsenRekap, type KelasRow, type AbsenRekapRow, type AbsenStatus } from '../api/apiClient'
import PickDateHijriMasehi, {
  type DualDateValue,
  formatHijriDateDisplay,
  formatMasehiDateDisplay,
  compareMasehiYmd,
  todayMasehi,
  masehiMaxRekap,
} from '../components/PickDateHijri/PickDateHijriMasehi'
import { exportAbsenRekapToExcel } from '../utils/exportExcel'
import MaterialIcon from '../components/MaterialIcon'
import { getStoredUser } from '../utils/auth'

function isAdminAkses(akses?: string) {
  return akses === 'super_admin' || akses === 'admin'
}

const STATUS_LABEL: Record<AbsenStatus, string> = {
  H: 'Hadir',
  S: 'Sakit',
  I: 'Izin',
  A: 'Alpa',
}

type TampilanJam = 'total' | 'terpisah'

const TAMPILAN_OPTIONS: { value: TampilanJam; label: string }[] = [
  { value: 'total', label: 'Total semua' },
  { value: 'terpisah', label: 'Jam 1 & 2 terpisah' },
]

function formatKelasLabel(nama: string, kel?: string) {
  return kel ? `${nama} · ${kel}` : nama
}

function firstDayOfMonthMasehi() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function sumJam(row: AbsenRekapRow): Record<AbsenStatus, number> {
  return {
    H: (row.jam_1?.H ?? 0) + (row.jam_2?.H ?? 0),
    S: (row.jam_1?.S ?? 0) + (row.jam_2?.S ?? 0),
    I: (row.jam_1?.I ?? 0) + (row.jam_2?.I ?? 0),
    A: (row.jam_1?.A ?? 0) + (row.jam_2?.A ?? 0),
  }
}

function CountCell({ value, status }: { value: number; status: AbsenStatus }) {
  if (value === 0) {
    return <span className="ui-text-muted">0</span>
  }
  const colors: Record<AbsenStatus, string> = {
    H: 'text-emerald-600 dark:text-emerald-400 font-semibold',
    S: 'text-amber-600 dark:text-amber-400 font-semibold',
    I: 'text-blue-600 dark:text-blue-400 font-semibold',
    A: 'text-red-600 dark:text-red-400 font-semibold',
  }
  return (
    <span className={colors[status]} title={STATUS_LABEL[status]}>
      {value}
    </span>
  )
}

export default function AbsenRekapPage() {
  const navigate = useNavigate()
  const user = getStoredUser()
  const canPublish = isAdminAkses(user?.akses)
  const masehiMax = masehiMaxRekap()
  const [kelasList, setKelasList] = useState<KelasRow[]>([])
  const [kelasId, setKelasId] = useState('')
  const [tanggalDari, setTanggalDari] = useState<DualDateValue | null>({
    masehi: firstDayOfMonthMasehi(),
    hijri: '',
  })
  const [tanggalSampai, setTanggalSampai] = useState<DualDateValue | null>({
    masehi: todayMasehi(),
    hijri: '',
  })
  const [tampilanJam, setTampilanJam] = useState<TampilanJam>('total')
  const [rows, setRows] = useState<AbsenRekapRow[]>([])
  const [hariEfektif, setHariEfektif] = useState(0)
  const [periodeMeta, setPeriodeMeta] = useState<{ awal: string; akhir: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [kelasLoading, setKelasLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem('mdtwustha_user')
      if (!raw) {
        navigate('/login', { replace: true })
        return
      }
    } catch {
      navigate('/login', { replace: true })
    }
  }, [navigate])

  useEffect(() => {
    const loadKelas = async () => {
      setKelasLoading(true)
      const res = await getKelas()
      if (res.success && res.data.length > 0) {
        setKelasList(res.data)
        setKelasId((prev) => prev || res.data[0].id)
      }
      setKelasLoading(false)
    }
    loadKelas()
  }, [])

  const handleDariChange = useCallback((value: DualDateValue | null) => {
    setTanggalDari(value)
    if (!value) return
    setTanggalSampai((prev) => {
      if (!prev || compareMasehiYmd(prev.masehi, value.masehi) < 0) return prev
      return value
    })
  }, [])

  const fetchRekap = useCallback(async () => {
    const awal = tanggalDari?.masehi
    const akhir = tanggalSampai?.masehi
    if (!kelasId || !awal || !akhir) {
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
    const res = await getAbsenRekap(kelasId, awal, akhir)
    if (res.success) {
      setRows(res.data)
      setHariEfektif(res.meta?.hari_efektif ?? 0)
      const metaAwal = res.meta?.tanggal_awal
      const metaAkhir = res.meta?.tanggal_akhir
      if (metaAwal && metaAkhir) {
        setPeriodeMeta({ awal: metaAwal, akhir: metaAkhir })
      } else {
        setPeriodeMeta(null)
      }
    } else {
      setRows([])
      setError(res.message || 'Gagal memuat rekap absensi')
    }
    setLoading(false)
  }, [kelasId, tanggalDari?.masehi, tanggalSampai?.masehi])

  useEffect(() => {
    fetchRekap()
  }, [fetchRekap])

  const selectedKelas = kelasList.find((k) => k.id === kelasId)
  const showTerpisah = tampilanJam === 'terpisah'
  const colSpan = showTerpisah ? 9 : 5

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
      await exportAbsenRekapToExcel(rows, {
        kelasLabel: selectedKelas ? formatKelasLabel(selectedKelas.nama_kelas, selectedKelas.kel) : kelasId,
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
  }, [rows, periodeMeta, tanggalDari, tanggalSampai, selectedKelas, kelasId, hariEfektif, tampilanJam])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <Link to="/absensi" className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-2 inline-flex items-center gap-1">
            <MaterialIcon name="arrow_back" size={14} /> Kembali ke absensi
          </Link>
          <h1 className="ui-title-lg">Rekap Absensi</h1>
          <p className="ui-subtitle mt-1">
            Pilih rentang tanggal (Hijriyah & Masehi). Hari tanpa data dihitung Hadir (H).
          </p>
          <Link
            to="/rekap/hasil"
            className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
          >
            <MaterialIcon name="publish" size={14} /> Hasil Rekap (publish)
          </Link>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {canPublish && (
            <button
              type="button"
              onClick={() =>
                navigate('/rekap/publish', {
                  state: {
                    from: 'absen',
                    kelas_ids: kelasId ? [kelasId] : [],
                    absen_dari: tanggalDari,
                    absen_sampai: tanggalSampai,
                  },
                })
              }
              disabled={loading || !kelasId || !tanggalDari?.masehi || !tanggalSampai?.masehi}
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
        <div>
          <label htmlFor="rekap-kelas" className="ui-label mb-1.5 block">
            Kelas
          </label>
          <select
            id="rekap-kelas"
            value={kelasId}
            onChange={(e) => setKelasId(e.target.value)}
            disabled={kelasLoading || kelasList.length === 0}
            className="ui-input-lg appearance-none w-full max-w-md"
          >
            {kelasList.length === 0 ? (
              <option value="">Belum ada kelas</option>
            ) : (
              kelasList.map((k) => (
                <option key={k.id} value={k.id}>
                  {formatKelasLabel(k.nama_kelas, k.kel)}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t ui-divider">
          <PickDateHijriMasehi
            id="rekap-dari"
            label="Dari tanggal"
            value={tanggalDari}
            onChange={handleDariChange}
            masehiMax={tanggalSampai?.masehi || masehiMax}
          />
          <PickDateHijriMasehi
            id="rekap-sampai"
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
                      Nama Santri
                    </th>
                    <th className="px-2 py-3 font-medium text-center border-l ui-divider" colSpan={4}>
                      Jam 1
                    </th>
                    <th className="px-2 py-3 font-medium text-center border-l ui-divider" colSpan={4}>
                      Jam 2
                    </th>
                  </tr>
                  <tr>
                    {(['H', 'S', 'I', 'A'] as AbsenStatus[]).map((s) => (
                      <th
                        key={`j1-${s}`}
                        className="px-2 py-2 font-medium text-center text-xs ui-text-muted border-l ui-divider"
                      >
                        {s}
                      </th>
                    ))}
                    {(['H', 'S', 'I', 'A'] as AbsenStatus[]).map((s) => (
                      <th
                        key={`j2-${s}`}
                        className="px-2 py-2 font-medium text-center text-xs ui-text-muted border-l ui-divider"
                      >
                        {s}
                      </th>
                    ))}
                  </tr>
                </>
              ) : (
                <tr>
                  <th className="px-3 sm:px-4 py-3 font-medium sticky left-0 bg-inherit">Nama Santri</th>
                  {(['H', 'S', 'I', 'A'] as AbsenStatus[]).map((s) => (
                    <th
                      key={`tot-${s}`}
                      className="px-2 py-3 font-medium text-center border-l ui-divider"
                      title={STATUS_LABEL[s]}
                    >
                      {s}
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody className="ui-table-body">
              {loading ? (
                <tr>
                  <td colSpan={colSpan} className="px-6 py-10 text-center ui-text-muted">
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Memuat rekap...
                    </div>
                  </td>
                </tr>
              ) : !kelasId ? (
                <tr>
                  <td colSpan={colSpan} className="px-6 py-10 text-center ui-text-muted">
                    Pilih kelas terlebih dahulu
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-6 py-10 text-center ui-text-muted">
                    Tidak ada data santri di kelas ini
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const total = sumJam(row)
                  return (
                    <tr key={row.santri_id} className="ui-table-row">
                      <td className="px-3 sm:px-4 py-3 sticky left-0 bg-inherit">
                        <div className="font-medium text-slate-800 dark:text-slate-200">{row.nama}</div>
                        {row.nomer_induk && (
                          <div className="text-xs ui-text-muted mt-0.5">{row.nomer_induk}</div>
                        )}
                      </td>
                      {showTerpisah ? (
                        <>
                          {(['H', 'S', 'I', 'A'] as AbsenStatus[]).map((s) => (
                            <td
                              key={`${row.santri_id}-j1-${s}`}
                              className="px-2 py-3 text-center border-l ui-divider"
                            >
                              <CountCell value={row.jam_1[s]} status={s} />
                            </td>
                          ))}
                          {(['H', 'S', 'I', 'A'] as AbsenStatus[]).map((s) => (
                            <td
                              key={`${row.santri_id}-j2-${s}`}
                              className="px-2 py-3 text-center border-l ui-divider"
                            >
                              <CountCell value={row.jam_2[s]} status={s} />
                            </td>
                          ))}
                        </>
                      ) : (
                        (['H', 'S', 'I', 'A'] as AbsenStatus[]).map((s) => (
                          <td
                            key={`${row.santri_id}-tot-${s}`}
                            className="px-2 py-3 text-center border-l ui-divider"
                          >
                            <CountCell value={total[s]} status={s} />
                          </td>
                        ))
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  )
}
