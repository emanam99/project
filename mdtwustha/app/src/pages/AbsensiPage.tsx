import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  getKelas,
  getAbsen,
  updateAbsenJam,
  type KelasRow,
  type AbsenSantriRow,
  type AbsenStatus,
} from '../api/apiClient'
import { kalenderConvert } from '../api/kalenderApi'
import { getBulanName } from './Kalender/utils/bulanHijri'
import JurnalMengajarSection, { type JamKey, type JurnalPanel } from '../components/JurnalMengajarSection'
import MaterialIcon from '../components/MaterialIcon'
import { getStoredUser } from '../utils/auth'

const STATUS_CYCLE: AbsenStatus[] = ['H', 'S', 'I', 'A']
const LOCK_HOUR = 24

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
  const [draftByJam, setDraftByJam] = useState<Record<JamKey, Record<string, AbsenStatus>>>({
    jam_1: {},
    jam_2: {},
  })
  const [loading, setLoading] = useState(false)
  const [kelasLoading, setKelasLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeJam, setActiveJam] = useState<JamKey>('jam_1')
  const [showAbsen, setShowAbsen] = useState(true)
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

  const syncDraftFromRows = useCallback((list: AbsenSantriRow[]) => {
    const jam1: Record<string, AbsenStatus> = {}
    const jam2: Record<string, AbsenStatus> = {}
    for (const row of list) {
      jam1[row.santri_id] = row.jam_1
      jam2[row.santri_id] = row.jam_2
    }
    setDraftByJam({ jam_1: jam1, jam_2: jam2 })
  }, [])

  const fetchAbsen = useCallback(async () => {
    if (!kelasId) {
      setRows([])
      setDraftByJam({ jam_1: {}, jam_2: {} })
      return
    }
    setLoading(true)
    setError('')
    const res = await getAbsen(kelasId)
    if (res.success) {
      setRows(res.data)
      syncDraftFromRows(res.data)
      setTanggal(res.meta?.tanggal || '')
      setCanEdit(res.meta?.can_edit ?? true)
    } else {
      setRows([])
      setDraftByJam({ jam_1: {}, jam_2: {} })
      setError(res.message || 'Gagal memuat absensi')
    }
    setLoading(false)
  }, [kelasId, syncDraftFromRows])

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

  const handleSessionChange = useCallback(
    (info: { jam: JamKey; panel: JurnalPanel; showAbsen: boolean; fanSelected: boolean }) => {
      setActiveJam(info.jam)
      setShowAbsen(info.showAbsen)
    },
    []
  )

  const handleToggleDraft = useCallback(
    (santriId: string) => {
      if (!canEdit) return
      setDraftByJam((prev) => {
        const current = prev[activeJam][santriId] || 'H'
        return {
          ...prev,
          [activeJam]: {
            ...prev[activeJam],
            [santriId]: nextStatus(current),
          },
        }
      })
    },
    [activeJam, canEdit]
  )

  const getIdp = () => {
    try {
      const raw = localStorage.getItem('mdtwustha_user')
      if (raw) {
        const user = JSON.parse(raw) as { id?: string }
        return user.id
      }
    } catch {
      /* ignore */
    }
    return undefined
  }

  const saveAbsenForActiveJam = useCallback(async () => {
    if (!canEdit || !tanggal) return true
    setError('')
    const draft = draftByJam[activeJam]
    const idp = getIdp()
    let failed = 0
    let locked = false

    for (const row of rows) {
      const next = draft[row.santri_id] ?? row[activeJam]
      const prev = row[activeJam]
      if (next === prev) continue

      const res = await updateAbsenJam({
        santri_id: row.santri_id,
        tanggal,
        jam: activeJam,
        status: next,
        idp,
      })
      if (!res.success) {
        failed += 1
        if (res.message?.includes('24.00') || res.message?.includes('ditutup')) {
          locked = true
        }
        setError(res.message || 'Gagal menyimpan absen')
      }
    }

    if (locked) setCanEdit(false)
    if (failed > 0) return false

    await fetchAbsen()
    return true
  }, [activeJam, canEdit, draftByJam, fetchAbsen, rows, tanggal])

  const absenDraft = draftByJam[activeJam]
  const jamLabel = activeJam === 'jam_1' ? 'Jam 1' : 'Jam 2'

  const absenSlot = useMemo(() => {
    if (!showAbsen) return null
    return (
      <div className="rounded-xl border ui-divider overflow-hidden">
        <div className="px-3 py-2 border-b ui-divider bg-slate-50/80 dark:bg-slate-900/40 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Absen santri · {jamLabel}</p>
          <div className="flex flex-wrap gap-1.5 text-[10px]">
            {(Object.keys(STATUS_LABEL) as AbsenStatus[]).map((s) => (
              <span
                key={s}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-medium ${STATUS_CELL_CLASS[s]}`}
              >
                <strong>{s}</strong> {STATUS_LABEL[s]}
              </span>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="ui-table-head">
              <tr>
                <th className="px-3 py-2.5 font-medium w-10 text-center">#</th>
                <th className="px-3 py-2.5 font-medium">Nama</th>
                <th className="px-3 py-2.5 font-medium text-center w-16">{jamLabel}</th>
              </tr>
            </thead>
            <tbody className="ui-table-body">
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center ui-text-muted">
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Memuat data...
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center ui-text-muted">
                    Tidak ada santri di kelas ini
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => {
                  const status = absenDraft[row.santri_id] ?? row[activeJam]
                  const locked = !canEdit
                  return (
                    <tr key={row.santri_id} className="ui-table-row">
                      <td className="px-3 py-2.5 text-center ui-text-muted">{i + 1}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-800 dark:text-slate-200">{row.nama}</div>
                        {row.nomer_induk && (
                          <div className="text-xs ui-text-muted mt-0.5">{row.nomer_induk}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {locked ? (
                          <span
                            title={`${jamLabel}: ${STATUS_LABEL[status]} — absensi ditutup`}
                            className={`inline-flex w-11 h-11 mx-auto items-center justify-center rounded-xl border font-bold text-base opacity-75 cursor-not-allowed ${STATUS_CELL_CLASS[status]}`}
                          >
                            {status}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleDraft(row.santri_id)}
                            title={`${jamLabel}: ${STATUS_LABEL[status]} — klik untuk ubah`}
                            className={`w-11 h-11 mx-auto rounded-xl border font-bold text-base transition ${STATUS_CELL_CLASS[status]} ${STATUS_CELL_INTERACTIVE[status]} cursor-pointer active:scale-95`}
                          >
                            {status}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }, [absenDraft, activeJam, canEdit, handleToggleDraft, jamLabel, loading, rows, showAbsen])

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
            Jurnal per jam, lalu absen santri jika mengajar. Simpan di bawah (hingga pukul {LOCK_HOUR}.00).
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link
            to="/absensi/hasil-rekap"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium ui-btn-secondary transition"
          >
            <MaterialIcon name="publish" size={18} /> Hasil Rekap
          </Link>
          <Link
            to="/absensi/rekap"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition"
          >
            <MaterialIcon name="analytics" size={18} /> Rekap
          </Link>
        </div>
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
      </div>

      {error && <div className="ui-error-box px-4 py-3 text-sm">{error}</div>}

      {kelasId && pengurusId && (
        <JurnalMengajarSection
          kelasId={kelasId}
          pengurusId={pengurusId}
          akses={userAkses}
          canEdit={canEdit}
          onError={setError}
          absenSlot={absenSlot}
          onSessionChange={handleSessionChange}
          onSaveMengajarExtras={saveAbsenForActiveJam}
        />
      )}
    </motion.div>
  )
}
