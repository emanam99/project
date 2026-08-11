import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { getKelas, getAbsen, updateAbsenJam, type KelasRow, type AbsenSantriRow, type AbsenStatus } from '../api/apiClient'
import { kalenderConvert } from '../api/kalenderApi'
import { getBulanName } from './Kalender/utils/bulanHijri'
import JurnalMengajarSection from '../components/JurnalMengajarSection'
import MaterialIcon from '../components/MaterialIcon'
import { getStoredUser } from '../utils/auth'

const STATUS_CYCLE: AbsenStatus[] = ['H', 'S', 'I', 'A']
const LOCK_HOUR = 18

const STATUS_LABEL: Record<AbsenStatus, string> = {
  H: 'Hadir',
  S: 'Sakit',
  I: 'Izin',
  A: 'Alpa',
}

const STATUS_CELL_CLASS: Record<AbsenStatus, string> = {
  H: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  S: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  I: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  A: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
}

const STATUS_CELL_INTERACTIVE: Record<AbsenStatus, string> = {
  H: 'hover:bg-emerald-500/25',
  S: 'hover:bg-amber-500/25',
  I: 'hover:bg-blue-500/25',
  A: 'hover:bg-red-500/25',
}

function formatKelasLabel(nama: string, kel?: string) {
  return kel ? `${nama} · ${kel}` : nama
}

function formatTanggalId(iso: string) {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function formatTanggalHijri(ymd: string) {
  if (!ymd || ymd === '0000-00-00') return ''
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ''
  return `${d} ${getBulanName(m, 'hijriyah')} ${y} H`
}

function nextStatus(current: AbsenStatus): AbsenStatus {
  const idx = STATUS_CYCLE.indexOf(current)
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
}

export default function AbsensiPage() {
  const [kelasList, setKelasList] = useState<KelasRow[]>([])
  const [kelasId, setKelasId] = useState('')
  const [tanggal, setTanggal] = useState('')
  const [tanggalHijri, setTanggalHijri] = useState('')
  const [canEdit, setCanEdit] = useState(true)
  const [rows, setRows] = useState<AbsenSantriRow[]>([])
  const [loading, setLoading] = useState(false)
  const [kelasLoading, setKelasLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const stored = getStoredUser()
  const [pengurusId] = useState(stored?.id || '')
  const [userAkses] = useState(stored?.akses || '')

  useEffect(() => {
    const loadKelas = async () => {
      setKelasLoading(true)
      const res = await getKelas()
      if (res.success && res.data.length > 0) {
        setKelasList(res.data)
        setKelasId((prev) => prev || res.data[0].id)
      } else if (!res.success) {
        setError(res.message || 'Gagal memuat daftar kelas')
      }
      setKelasLoading(false)
    }
    loadKelas()
  }, [])

  const fetchAbsen = useCallback(async () => {
    if (!kelasId) {
      setRows([])
      return
    }
    setLoading(true)
    setError('')
    const res = await getAbsen(kelasId)
    if (res.success) {
      setRows(res.data)
      setTanggal(res.meta?.tanggal || '')
      setCanEdit(res.meta?.can_edit ?? true)
    } else {
      setRows([])
      setError(res.message || 'Gagal memuat absensi')
    }
    setLoading(false)
  }, [kelasId])

  useEffect(() => {
    fetchAbsen()
  }, [fetchAbsen])

  useEffect(() => {
    if (!tanggal) {
      setTanggalHijri('')
      return
    }
    let cancelled = false
    kalenderConvert(tanggal)
      .then((res) => {
        if (cancelled) return
        setTanggalHijri(formatTanggalHijri(res.hijriyah))
      })
      .catch(() => {
        if (!cancelled) setTanggalHijri('')
      })
    return () => {
      cancelled = true
    }
  }, [tanggal])

  const handleToggleJam = async (row: AbsenSantriRow, jam: 'jam_1' | 'jam_2') => {
    if (!canEdit) return

    const current = row[jam]
    const status = nextStatus(current)
    const key = `${row.santri_id}-${jam}`

    setRows((prev) =>
      prev.map((r) => (r.santri_id === row.santri_id ? { ...r, [jam]: status } : r))
    )
    setSavingKey(key)

    let idp: string | undefined
    try {
      const raw = localStorage.getItem('mdtwustha_user')
      if (raw) {
        const user = JSON.parse(raw) as { id?: string }
        idp = user.id
      }
    } catch {
      /* ignore */
    }

    const res = await updateAbsenJam({
      santri_id: row.santri_id,
      tanggal,
      jam,
      status,
      idp,
    })

    setSavingKey(null)

    if (!res.success) {
      setRows((prev) =>
        prev.map((r) => (r.santri_id === row.santri_id ? { ...r, [jam]: current } : r))
      )
      setError(res.message || 'Gagal menyimpan absen')
      if (res.message?.includes('18.00') || res.message?.includes('ditutup')) {
        setCanEdit(false)
      }
    }
  }

  const renderJamCell = (row: AbsenSantriRow, jam: 'jam_1' | 'jam_2', label: string) => {
    const status = row[jam]
    const key = `${row.santri_id}-${jam}`
    const isSaving = savingKey === key
    const locked = !canEdit

    if (locked) {
      return (
        <span
          title={`${label}: ${STATUS_LABEL[status]} — absensi ditutup`}
          className={`inline-flex w-12 h-12 mx-auto items-center justify-center rounded-xl border font-bold text-lg opacity-75 cursor-not-allowed ${STATUS_CELL_CLASS[status]}`}
        >
          {status}
        </span>
      )
    }

    return (
      <button
        type="button"
        onClick={() => handleToggleJam(row, jam)}
        disabled={isSaving}
        title={`${label}: ${STATUS_LABEL[status]} — klik untuk ubah`}
        className={`w-12 h-12 mx-auto rounded-xl border font-bold text-lg transition ${STATUS_CELL_CLASS[status]} ${STATUS_CELL_INTERACTIVE[status]} ${
          isSaving ? 'opacity-60 cursor-wait' : 'cursor-pointer active:scale-95'
        }`}
      >
        {status}
      </button>
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
          <h1 className="ui-title-lg">Absensi Santri</h1>
          <p className="ui-subtitle mt-1">
            Catat kehadiran hari ini per kelas. Klik sel untuk ganti status (hingga pukul {LOCK_HOUR}.00).
          </p>
        </div>
        <Link
          to="/absensi/rekap"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition shrink-0"
        >
          <MaterialIcon name="analytics" size={18} /> Rekap
        </Link>
      </div>

      {!canEdit && (
        <div className="px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-sm">
          Absensi hari ini sudah ditutup (setelah pukul {LOCK_HOUR}.00). Data masih dapat dilihat; pengisian
          dibuka lagi besok.
        </div>
      )}

      <div className="ui-card p-4 sm:p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="filter-kelas" className="ui-label mb-1.5">
              Kelas
            </label>
            <select
              id="filter-kelas"
              value={kelasId}
              onChange={(e) => setKelasId(e.target.value)}
              disabled={kelasLoading || kelasList.length === 0}
              className="ui-input-lg appearance-none w-full"
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
          <div>
            <span className="ui-label mb-1.5 block">Tanggal</span>
            <div className="ui-input-lg w-full opacity-80 cursor-default bg-slate-50 dark:bg-slate-900/40 py-3">
              <div>{tanggal ? formatTanggalId(tanggal) : 'Hari ini'}</div>
              {tanggalHijri && (
                <div className="text-sm font-medium text-blue-600 dark:text-blue-400 mt-1.5">
                  {tanggalHijri}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t ui-divider text-xs">
          {(Object.keys(STATUS_LABEL) as AbsenStatus[]).map((s) => (
            <span
              key={s}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-medium ${STATUS_CELL_CLASS[s]}`}
            >
              <strong>{s}</strong> {STATUS_LABEL[s]}
            </span>
          ))}
        </div>
      </div>

      {error && <div className="ui-error-box px-4 py-3 text-sm">{error}</div>}

      {kelasId && pengurusId && (
        <JurnalMengajarSection
          kelasId={kelasId}
          pengurusId={pengurusId}
          akses={userAkses}
          canEdit={canEdit}
          onError={setError}
        />
      )}

      <div className="ui-table-wrap">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="ui-table-head">
              <tr>
                <th className="px-4 sm:px-6 py-4 font-medium w-10 text-center">#</th>
                <th className="px-4 sm:px-6 py-4 font-medium">Nama Santri</th>
                <th className="px-4 sm:px-6 py-4 font-medium text-center w-24">Jam 1</th>
                <th className="px-4 sm:px-6 py-4 font-medium text-center w-24">Jam 2</th>
              </tr>
            </thead>
            <tbody className="ui-table-body">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center ui-text-muted">
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Memuat data...
                    </div>
                  </td>
                </tr>
              ) : !kelasId ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center ui-text-muted">
                    Pilih kelas terlebih dahulu
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center ui-text-muted">
                    Tidak ada santri di kelas ini
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={row.santri_id} className="ui-table-row">
                    <td className="px-4 sm:px-6 py-4 text-center ui-text-muted">{i + 1}</td>
                    <td className="px-4 sm:px-6 py-4">
                      <div className="font-medium text-slate-800 dark:text-slate-200">{row.nama}</div>
                      {row.nomer_induk && (
                        <div className="text-xs ui-text-muted mt-0.5">{row.nomer_induk}</div>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-center">{renderJamCell(row, 'jam_1', 'Jam 1')}</td>
                    <td className="px-4 sm:px-6 py-3 text-center">{renderJamCell(row, 'jam_2', 'Jam 2')}</td>
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
