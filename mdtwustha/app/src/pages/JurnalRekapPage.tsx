import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  getKelas,
  getPengurus,
  getJurnalRekap,
  type KelasRow,
  type PengurusRow,
  type JurnalRekapDetailRow,
  type JurnalStatus,
} from '../api/apiClient'
import PickDateHijriMasehi, {
  type DualDateValue,
  formatHijriDateDisplay,
  formatMasehiDateDisplay,
  compareMasehiYmd,
  todayMasehi,
  masehiMaxRekap,
} from '../components/PickDateHijri/PickDateHijriMasehi'
import { exportJurnalRekapToExcel } from '../utils/exportExcel'
import { formatMapelLabel } from '../utils/formatMapel'
import MaterialIcon from '../components/MaterialIcon'
import { getStoredUser } from '../utils/auth'

const STATUS_LABEL: Record<JurnalStatus, string> = {
  mengajar: 'Mengajar',
  ijin: 'Izin',
  sakit: 'Sakit',
}

const STATUS_BADGE: Record<JurnalStatus, string> = {
  mengajar: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  ijin: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  sakit: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
}

const JAM_LABEL = { jam_1: 'Jam 1', jam_2: 'Jam 2' } as const

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

function formatTanggalId(iso: string) {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export default function JurnalRekapPage() {
  const navigate = useNavigate()
  const masehiMax = masehiMaxRekap()
  const initialUser = getStoredUser()
  const [userAkses, setUserAkses] = useState(initialUser?.akses || 'user')
  const [isAdmin, setIsAdmin] = useState(isAdminAkses(initialUser?.akses))
  const [kelasList, setKelasList] = useState<KelasRow[]>([])
  const [pengurusList, setPengurusList] = useState<PengurusRow[]>([])
  const [kelasId, setKelasId] = useState('')
  const [pengurusId, setPengurusId] = useState(initialUser?.id || '')
  const [tanggalDari, setTanggalDari] = useState<DualDateValue | null>({
    masehi: firstDayOfMonthMasehi(),
    hijri: '',
  })
  const [tanggalSampai, setTanggalSampai] = useState<DualDateValue | null>({
    masehi: todayMasehi(),
    hijri: '',
  })
  const [rows, setRows] = useState<JurnalRekapDetailRow[]>([])
  const [hariEfektif, setHariEfektif] = useState(0)
  const [periodeMeta, setPeriodeMeta] = useState<{ awal: string; akhir: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [filterLoading, setFilterLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  useEffect(() => {
    const user = getStoredUser()
    if (!user) {
      navigate('/login', { replace: true })
      return
    }
    setUserAkses(user.akses || 'user')
    setIsAdmin(isAdminAkses(user.akses))
    if (!isAdminAkses(user.akses)) {
      setPengurusId(user.id)
    }
  }, [navigate])

  useEffect(() => {
    const loadFilters = async () => {
      setFilterLoading(true)
      const [kelasRes, pengurusRes] = await Promise.all([getKelas(), getPengurus()])
      if (kelasRes.success) setKelasList(kelasRes.data)
      if (pengurusRes.success) setPengurusList(pengurusRes.data)
      setFilterLoading(false)
    }
    loadFilters()
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
    if (!awal || !akhir || !userAkses) {
      setRows([])
      return
    }
    if (!isAdmin && !pengurusId) {
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
    const res = await getJurnalRekap(awal, akhir, userAkses, {
      kelasId: kelasId || undefined,
      pengurusId: isAdmin ? pengurusId || undefined : pengurusId,
    })
    if (res.success) {
      setRows(res.data)
      setHariEfektif(res.meta?.hari_efektif ?? 0)
      const metaAwal = res.meta?.tanggal_awal
      const metaAkhir = res.meta?.tanggal_akhir
      if (metaAwal && metaAkhir) setPeriodeMeta({ awal: metaAwal, akhir: metaAkhir })
      else setPeriodeMeta(null)
    } else {
      setRows([])
      setError(res.message || 'Gagal memuat rekap jurnal')
    }
    setLoading(false)
  }, [kelasId, pengurusId, tanggalDari?.masehi, tanggalSampai?.masehi, userAkses, isAdmin])

  useEffect(() => {
    fetchRekap()
  }, [fetchRekap])

  const selectedKelas = kelasList.find((k) => k.id === kelasId)
  const kelasLabel = selectedKelas
    ? formatKelasLabel(selectedKelas.nama_kelas, selectedKelas.kel)
    : 'Semua kelas'

  const handleExportExcel = useCallback(async () => {
    setExportError('')
    if (!rows.length) {
      setExportError('Tidak ada data jurnal untuk diekspor')
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
      await exportJurnalRekapToExcel(rows, {
        kelasLabel,
        tanggalAwal: awal,
        tanggalAkhir: akhir,
        hijriAwal: tanggalDari?.hijri || undefined,
        hijriAkhir: tanggalSampai?.hijri || undefined,
        hariEfektif,
      })
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Gagal mengekspor ke Excel')
    } finally {
      setExporting(false)
    }
  }, [rows, periodeMeta, tanggalDari, tanggalSampai, kelasLabel, hariEfektif])

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
          <h1 className="ui-title-lg">Rekap Jurnal Mengajar</h1>
          <p className="ui-subtitle mt-1">
            Daftar rinci jurnal mengajar: tanggal, kelas, jam, guru, pelajaran, dan alasan izin/sakit.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportExcel}
          disabled={exporting || loading || rows.length === 0}
          className="px-4 py-2.5 text-sm ui-btn-secondary shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exporting ? 'Mengekspor…' : 'Ekspor Excel'}
        </button>
      </div>

      {exportError && <div className="ui-error-box px-4 py-3 text-sm">{exportError}</div>}

      <div className="ui-card p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="jurnal-rekap-kelas" className="ui-label mb-1.5 block">
              Kelas
            </label>
            <select
              id="jurnal-rekap-kelas"
              value={kelasId}
              onChange={(e) => setKelasId(e.target.value)}
              disabled={filterLoading}
              className="ui-input-lg appearance-none w-full"
            >
              <option value="">Semua kelas</option>
              {kelasList.map((k) => (
                <option key={k.id} value={k.id}>
                  {formatKelasLabel(k.nama_kelas, k.kel)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="jurnal-rekap-guru" className="ui-label mb-1.5 block">
              Guru
            </label>
            <select
              id="jurnal-rekap-guru"
              value={pengurusId}
              onChange={(e) => setPengurusId(e.target.value)}
              disabled={filterLoading || !isAdmin}
              className="ui-input-lg appearance-none w-full"
            >
              {isAdmin && <option value="">Semua guru</option>}
              {pengurusList
                .filter((p) => isAdmin || p.id === pengurusId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama}
                  </option>
                ))}
            </select>
            {!isAdmin && (
              <p className="text-xs ui-text-muted mt-1">Rekap menampilkan jurnal Anda sendiri.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t ui-divider">
          <PickDateHijriMasehi
            id="jurnal-rekap-dari"
            label="Dari tanggal"
            value={tanggalDari}
            onChange={handleDariChange}
            masehiMax={tanggalSampai?.masehi || masehiMax}
          />
          <PickDateHijriMasehi
            id="jurnal-rekap-sampai"
            label="Sampai tanggal"
            value={tanggalSampai}
            onChange={setTanggalSampai}
            hijriMin={tanggalDari?.hijri || undefined}
            masehiMax={masehiMax}
          />
        </div>

        {hariEfektif > 0 && periodeMeta && (
          <div className="text-sm ui-text-muted pt-2 border-t ui-divider space-y-1">
            <p>
              <span className="font-medium text-slate-700 dark:text-slate-300">{hariEfektif} hari</span> dalam rentang ·{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">{rows.length} entri jurnal</span>
            </p>
            <p>
              Masehi: {formatMasehiDateDisplay(periodeMeta.awal)} — {formatMasehiDateDisplay(periodeMeta.akhir)}
            </p>
            {tanggalDari?.hijri && tanggalSampai?.hijri && (
              <p>
                Hijriyah: {formatHijriDateDisplay(tanggalDari.hijri)} — {formatHijriDateDisplay(tanggalSampai.hijri)}
              </p>
            )}
          </div>
        )}
      </div>

      {error && <div className="ui-error-box px-4 py-3 text-sm">{error}</div>}

      <div className="ui-table-wrap">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="ui-table-head">
              <tr>
                <th className="px-4 py-3 font-medium w-10">#</th>
                <th className="px-4 py-3 font-medium">Tanggal</th>
                <th className="px-4 py-3 font-medium">Kelas</th>
                <th className="px-4 py-3 font-medium text-center">Jam</th>
                <th className="px-4 py-3 font-medium">Guru</th>
                <th className="px-4 py-3 font-medium text-center">Status</th>
                <th className="px-4 py-3 font-medium">Fan / Kitab</th>
                <th className="px-4 py-3 font-medium">Deskripsi Materi</th>
                <th className="px-4 py-3 font-medium">Alasan</th>
              </tr>
            </thead>
            <tbody className="ui-table-body">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center ui-text-muted">
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Memuat rekap jurnal...
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center ui-text-muted">
                    Tidak ada entri jurnal dalam periode ini
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={`${row.tanggal}-${row.kelas_id}-${row.jam}-${row.pengurus_id}`} className="ui-table-row">
                    <td className="px-4 py-3 ui-text-muted">{i + 1}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatTanggalId(row.tanggal)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800 dark:text-slate-200">{row.nama_kelas}</div>
                      {row.kel && <div className="text-xs ui-text-muted">{row.kel}</div>}
                    </td>
                    <td className="px-4 py-3 text-center">{JAM_LABEL[row.jam]}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{row.pengurus_nama}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-md border text-xs font-medium ${STATUS_BADGE[row.status]}`}
                      >
                        {STATUS_LABEL[row.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[14rem]">
                      {row.status === 'mengajar' ? (
                        row.mapel_fan ? (
                          <span className="text-sm">{formatMapelLabel({
                            fan: row.mapel_fan,
                            kitab_nama: row.mapel_kitab || '',
                            musonnif: row.mapel_musonnif || '',
                            dari: row.mapel_dari || '',
                            sampai: row.mapel_sampai || '',
                          })}</span>
                        ) : (
                          <span className="ui-text-muted">{row.pelajaran || '—'}</span>
                        )
                      ) : (
                        <span className="ui-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      {row.status === 'mengajar' ? (
                        <span className="text-sm">{row.deskripsi || row.pelajaran || '—'}</span>
                      ) : (
                        <span className="ui-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      {row.status === 'ijin' || row.status === 'sakit' ? (
                        <span className="ui-text-muted text-xs">{row.alasan || '—'}</span>
                      ) : (
                        <span className="ui-text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  )
}
