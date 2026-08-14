import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  getKelas,
  getMapel,
  getNilai,
  saveNilai,
  saveNilaiUrutan,
  ubahTanggalNilai,
  hapusNilaiBatch,
  type KelasRow,
  type MapelRow,
  type NilaiSantriRow,
  type AbsenStatus,
} from '../api/apiClient'
import PickDateHijriMasehi, {
  type DualDateValue,
  formatHijriDateDisplay,
  formatMasehiDateDisplay,
} from '../components/PickDateHijri/PickDateHijriMasehi'
import { formatMapelLabel } from '../utils/formatMapel'
import MaterialIcon from '../components/MaterialIcon'

const STATUS_CYCLE: AbsenStatus[] = ['H', 'S', 'I', 'A']

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

function formatKelasLabel(nama: string, kel?: string) {
  return kel ? `${nama} · ${kel}` : nama
}

function todayMasehi() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nextStatus(current: AbsenStatus): AbsenStatus {
  const idx = STATUS_CYCLE.indexOf(current)
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
}

function parseNilaiLine(raw: string): { ok: true; value: number | null } | { ok: false; message: string } {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: true, value: null }
  const num = Number(trimmed.replace(',', '.'))
  if (Number.isNaN(num) || num < 0 || num > 100) {
    return { ok: false, message: `"${trimmed}" bukan nilai 0–100` }
  }
  return { ok: true, value: Math.round(num * 100) / 100 }
}

function withUrutan(list: NilaiSantriRow[]): NilaiSantriRow[] {
  return list.map((row, index) => ({ ...row, urutan: index + 1 }))
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export default function NilaiPage() {
  const [kelasList, setKelasList] = useState<KelasRow[]>([])
  const [mapelList, setMapelList] = useState<MapelRow[]>([])
  const [kelasId, setKelasId] = useState('')
  const [mapelId, setMapelId] = useState('')
  const [tanggalUjian, setTanggalUjian] = useState<DualDateValue | null>({
    masehi: todayMasehi(),
    hijri: '',
  })
  const [rows, setRows] = useState<NilaiSantriRow[]>([])
  const [kelasLoading, setKelasLoading] = useState(true)
  const [mapelLoading, setMapelLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)
  const [savingOrder, setSavingOrder] = useState(false)
  const [batchLoading, setBatchLoading] = useState(false)
  const [pengurusId, setPengurusId] = useState('')
  const [nilaiDraft, setNilaiDraft] = useState<Record<string, string>>({})
  const [noDraft, setNoDraft] = useState<Record<string, string>>({})

  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteError, setPasteError] = useState('')

  const [ubahTanggalOpen, setUbahTanggalOpen] = useState(false)
  const [tanggalBaru, setTanggalBaru] = useState<DualDateValue | null>(null)
  const [ubahTanggalError, setUbahTanggalError] = useState('')
  const [ubahTanggalLoading, setUbahTanggalLoading] = useState(false)

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  useEffect(() => {
    try {
      const raw = localStorage.getItem('mdtwustha_user')
      if (raw) {
        const user = JSON.parse(raw) as { id?: string }
        setPengurusId(user.id || '')
      }
    } catch {
      /* ignore */
    }
  }, [])

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

  useEffect(() => {
    if (!kelasId) {
      setMapelList([])
      setMapelId('')
      return
    }
    let cancelled = false
    const loadMapel = async () => {
      setMapelLoading(true)
      setError('')
      const res = await getMapel(kelasId)
      if (cancelled) return
      if (res.success) {
        setMapelList(res.data)
        setMapelId((prev) => {
          if (prev && res.data.some((m) => m.id === prev)) return prev
          return res.data[0]?.id || ''
        })
      } else {
        setMapelList([])
        setMapelId('')
        setError(res.message || 'Gagal memuat mapel rombel')
      }
      setMapelLoading(false)
    }
    loadMapel()
    return () => {
      cancelled = true
    }
  }, [kelasId])

  const syncNoDraft = (list: NilaiSantriRow[]) => {
    const draft: Record<string, string> = {}
    list.forEach((row, index) => {
      draft[row.santri_id] = String(index + 1)
    })
    setNoDraft(draft)
  }

  const fetchNilai = useCallback(async () => {
    const tanggal = tanggalUjian?.masehi
    if (!kelasId || !mapelId || !tanggal) {
      setRows([])
      setNilaiDraft({})
      setNoDraft({})
      return
    }
    setLoading(true)
    setError('')
    const res = await getNilai(kelasId, mapelId, tanggal)
    if (res.success) {
      const ordered = withUrutan(res.data).map((row) => ({
        ...row,
        santri_id: String(row.santri_id),
        nilai_id: row.nilai_id != null ? String(row.nilai_id) : null,
      }))
      setRows(ordered)
      const draft: Record<string, string> = {}
      for (const row of ordered) {
        draft[row.santri_id] = row.nilai === null || row.nilai === undefined ? '' : String(row.nilai)
      }
      setNilaiDraft(draft)
      syncNoDraft(ordered)
    } else {
      setRows([])
      setNilaiDraft({})
      setNoDraft({})
      setError(res.message || 'Gagal memuat data nilai')
    }
    setLoading(false)
  }, [kelasId, mapelId, tanggalUjian?.masehi])

  useEffect(() => {
    fetchNilai()
  }, [fetchNilai])

  const persistOrder = async (nextRows: NilaiSantriRow[], previousRows: NilaiSantriRow[]) => {
    if (!kelasId) return
    const ordered = withUrutan(nextRows)
    setRows(ordered)
    syncNoDraft(ordered)
    setSavingOrder(true)
    const res = await saveNilaiUrutan(
      kelasId,
      ordered.map((r) => r.santri_id)
    )
    setSavingOrder(false)
    if (!res.success) {
      setRows(previousRows)
      syncNoDraft(previousRows)
      alert(res.message || 'Gagal menyimpan urutan')
    }
  }

  const handleToggleAbsen = async (row: NilaiSantriRow) => {
    const tanggal = tanggalUjian?.masehi
    if (!kelasId || !mapelId || !tanggal) return
    const next = nextStatus(row.absen)
    const key = `${row.santri_id}-absen`
    setSavingKey(key)
    setRows((prev) => prev.map((r) => (r.santri_id === row.santri_id ? { ...r, absen: next } : r)))
    const res = await saveNilai({
      kelas_id: kelasId,
      mapel_id: mapelId,
      santri_id: String(row.santri_id),
      tanggal,
      absen: next,
      // Sertakan nilai tersimpan agar update absen tidak menimpa / mengosongkan nilai
      nilai: row.nilai,
      idp: pengurusId || undefined,
    })
    if (!res.success) {
      setRows((prev) => prev.map((r) => (r.santri_id === row.santri_id ? { ...r, absen: row.absen } : r)))
      alert(res.message || 'Gagal menyimpan absen')
    } else if (res.data) {
      setRows((prev) =>
        prev.map((r) =>
          r.santri_id === row.santri_id
            ? {
                ...r,
                absen: res.data!.absen,
                nilai: res.data!.nilai ?? r.nilai,
                nilai_id: String(res.data!.id),
              }
            : r
        )
      )
    }
    setSavingKey(null)
  }

  const applyNoChange = async (santriId: string) => {
    const currentIndex = rows.findIndex((r) => r.santri_id === santriId)
    if (currentIndex < 0) return
    const raw = (noDraft[santriId] ?? '').trim()
    const target = Number.parseInt(raw, 10)
    if (!Number.isFinite(target) || target < 1 || target > rows.length) {
      setNoDraft((d) => ({ ...d, [santriId]: String(currentIndex + 1) }))
      return
    }
    const toIndex = target - 1
    if (toIndex === currentIndex) {
      setNoDraft((d) => ({ ...d, [santriId]: String(currentIndex + 1) }))
      return
    }
    const previous = rows
    const next = moveItem(rows, currentIndex, toIndex)
    await persistOrder(next, previous)
  }

  const openPaste = () => {
    const lines = rows.map((row) => nilaiDraft[row.santri_id] ?? '')
    setPasteText(lines.join('\n'))
    setPasteError('')
    setPasteOpen(true)
  }

  const applyPaste = () => {
    const lines = pasteText.replace(/\r\n/g, '\n').split('\n')
    if (lines.length > rows.length) {
      setPasteError(`Terlalu banyak baris (${lines.length}). Maksimal ${rows.length} sesuai jumlah santri.`)
      return
    }

    const nextDraft = { ...nilaiDraft }
    for (let i = 0; i < rows.length; i++) {
      const line = lines[i] ?? ''
      const parsed = parseNilaiLine(line)
      if (!parsed.ok) {
        setPasteError(`Baris ${i + 1} (${rows[i].nama}): ${parsed.message}`)
        return
      }
      nextDraft[rows[i].santri_id] = parsed.value === null ? '' : String(parsed.value)
    }

    setNilaiDraft(nextDraft)
    setPasteError('')
    setPasteOpen(false)
  }

  const handleSaveAll = async () => {
    const tanggal = tanggalUjian?.masehi
    if (!kelasId || !mapelId || !tanggal || rows.length === 0) return

    const updates: { row: NilaiSantriRow; nilai: number | null }[] = []
    for (const row of rows) {
      const raw = (nilaiDraft[row.santri_id] ?? '').trim()
      const parsed = parseNilaiLine(raw)
      if (!parsed.ok) {
        alert(`${row.nama}: ${parsed.message}`)
        return
      }
      const nilai = parsed.value
      if (nilai === row.nilai || (nilai === null && row.nilai === null)) continue
      updates.push({ row, nilai })
    }

    if (updates.length === 0) {
      alert('Tidak ada perubahan nilai untuk disimpan')
      return
    }

    setSavingAll(true)
    let failed = 0
    const nextRows = [...rows]
    for (const { row, nilai } of updates) {
      const res = await saveNilai({
        kelas_id: kelasId,
        mapel_id: mapelId,
        santri_id: String(row.santri_id),
        tanggal,
        nilai,
        absen: row.absen,
        idp: pengurusId || undefined,
      })
      if (!res.success) {
        failed += 1
        continue
      }
      const idx = nextRows.findIndex((r) => String(r.santri_id) === String(row.santri_id))
      if (idx >= 0 && res.data) {
        nextRows[idx] = {
          ...nextRows[idx],
          nilai: res.data.nilai,
          absen: res.data.absen,
          nilai_id: String(res.data.id),
        }
      }
    }
    setRows(nextRows)
    const draft: Record<string, string> = {}
    for (const row of nextRows) {
      draft[row.santri_id] = row.nilai === null || row.nilai === undefined ? '' : String(row.nilai)
    }
    setNilaiDraft(draft)
    setSavingAll(false)

    if (failed > 0) alert(`${failed} nilai gagal disimpan`)
    else alert(`${updates.length} nilai berhasil disimpan`)
  }

  const hasSavedData = rows.some((r) => r.nilai_id)

  const openUbahTanggal = () => {
    setTanggalBaru(tanggalUjian ? { ...tanggalUjian } : { masehi: todayMasehi(), hijri: '' })
    setUbahTanggalError('')
    setUbahTanggalOpen(true)
  }

  const handleUbahTanggal = async () => {
    const lama = tanggalUjian?.masehi
    const baru = tanggalBaru?.masehi
    if (!kelasId || !mapelId || !lama || !baru) {
      setUbahTanggalError('Tanggal baru wajib diisi')
      return
    }
    if (lama === baru) {
      setUbahTanggalError('Tanggal baru sama dengan tanggal saat ini')
      return
    }
    setUbahTanggalLoading(true)
    setUbahTanggalError('')
    const res = await ubahTanggalNilai({
      kelas_id: kelasId,
      mapel_id: mapelId,
      tanggal_lama: lama,
      tanggal_baru: baru,
    })
    setUbahTanggalLoading(false)
    if (!res.success) {
      setUbahTanggalError(res.message || 'Gagal mengubah tanggal')
      return
    }
    setUbahTanggalOpen(false)
    setTanggalUjian(tanggalBaru)
    alert(res.message || 'Tanggal ujian diperbarui')
  }

  const handleHapusBatch = async () => {
    const tanggal = tanggalUjian?.masehi
    if (!kelasId || !mapelId || !tanggal) return
    const mapelLabel = selectedMapel ? formatMapelLabel(selectedMapel) : 'mapel ini'
    if (
      !confirm(
        `Hapus semua data nilai untuk:\n\nRombel + ${mapelLabel}\nTanggal: ${formatMasehiDateDisplay(tanggal)}\n\nTindakan ini tidak dapat dibatalkan.`
      )
    ) {
      return
    }
    setBatchLoading(true)
    const res = await hapusNilaiBatch({
      kelas_id: kelasId,
      mapel_id: mapelId,
      tanggal,
    })
    setBatchLoading(false)
    if (!res.success) {
      alert(res.message || 'Gagal menghapus data nilai')
      return
    }
    alert(res.message || 'Data nilai dihapus')
    await fetchNilai()
  }

  const onDragStart = (index: number) => (e: React.DragEvent) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }

  const onDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverIndex !== index) setDragOverIndex(index)
  }

  const onDrop = (index: number) => async (e: React.DragEvent) => {
    e.preventDefault()
    const from = dragIndex ?? Number.parseInt(e.dataTransfer.getData('text/plain'), 10)
    setDragIndex(null)
    setDragOverIndex(null)
    if (!Number.isFinite(from) || from === index) return
    const previous = rowsRef.current
    const next = moveItem(previous, from, index)
    await persistOrder(next, previous)
  }

  const onDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const selectedMapel = mapelList.find((m) => m.id === mapelId)
  const canEditTable = rows.length > 0 && !loading && !!tanggalUjian?.masehi
  const busy = savingAll || savingOrder || batchLoading || ubahTanggalLoading
  const canManageBatch = hasSavedData && !!kelasId && !!mapelId && !!tanggalUjian?.masehi && !loading

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-3 text-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Nilai</h1>
          <p className="text-xs ui-text-muted mt-0.5">
            Absen & nilai per mapel. Tanggal Hijriyah, disimpan Masehi.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          <Link
            to="/nilai/hasil-rekap"
            className="px-2.5 py-1.5 text-xs ui-btn-secondary inline-flex items-center rounded-md"
          >
            Hasil Rekap
          </Link>
          <Link
            to="/nilai/rekap"
            className="px-2.5 py-1.5 text-xs ui-btn-secondary inline-flex items-center rounded-md"
          >
            Rekap
          </Link>
          <button
            type="button"
            onClick={openUbahTanggal}
            disabled={!canManageBatch || busy}
            className="px-2.5 py-1.5 text-xs ui-btn-secondary rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Ubah Tanggal
          </button>
          <button
            type="button"
            onClick={handleHapusBatch}
            disabled={!canManageBatch || busy}
            className="px-2.5 py-1.5 text-xs rounded-md border border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {batchLoading ? 'Menghapus…' : 'Hapus'}
          </button>
          <button
            type="button"
            onClick={openPaste}
            disabled={!canEditTable || busy}
            className="px-2.5 py-1.5 text-xs ui-btn-secondary rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Paste
          </button>
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={!canEditTable || busy}
            className="px-2.5 py-1.5 text-xs ui-btn-primary rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingAll ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </div>

      <div className="ui-card p-3 space-y-2.5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <div>
            <label htmlFor="nilai-kelas" className="ui-label mb-1 block text-xs">
              Rombel
            </label>
            <select
              id="nilai-kelas"
              value={kelasId}
              onChange={(e) => setKelasId(e.target.value)}
              disabled={kelasLoading}
              className="ui-input appearance-none w-full text-sm py-1.5"
            >
              {kelasList.length === 0 && <option value="">Belum ada rombel</option>}
              {kelasList.map((k) => (
                <option key={k.id} value={k.id}>
                  {formatKelasLabel(k.nama_kelas, k.kel)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="nilai-mapel" className="ui-label mb-1 block text-xs">
              Mapel
            </label>
            <select
              id="nilai-mapel"
              value={mapelId}
              onChange={(e) => setMapelId(e.target.value)}
              disabled={mapelLoading || mapelList.length === 0}
              className="ui-input appearance-none w-full text-sm py-1.5"
            >
              {mapelList.length === 0 ? (
                <option value="">{mapelLoading ? 'Memuat mapel…' : 'Belum ada mapel di rombel'}</option>
              ) : (
                mapelList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {formatMapelLabel(m)}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <div className="nilai-page-compact-date [&_.ui-label]:text-xs [&_.ui-label]:mb-1 [&_button]:text-sm [&_button]:py-1.5 [&_.text-sm]:text-xs">
          <PickDateHijriMasehi
            id="nilai-tanggal-ujian"
            label="Tanggal ujian"
            value={tanggalUjian}
            onChange={setTanggalUjian}
          />
        </div>

        {tanggalUjian?.masehi && (
          <p className="text-xs ui-text-muted">
            Masehi:{' '}
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {formatMasehiDateDisplay(tanggalUjian.masehi)}
            </span>
            {tanggalUjian.hijri && (
              <>
                {' '}
                · Hijriyah:{' '}
                <span className="font-medium text-blue-600 dark:text-blue-400">
                  {formatHijriDateDisplay(tanggalUjian.hijri)}
                </span>
              </>
            )}
            {savingOrder && <span className="ml-1.5">· Menyimpan urutan…</span>}
          </p>
        )}
      </div>

      {error && <div className="ui-error-box px-3 py-2 text-xs">{error}</div>}

      <div className="ui-table-wrap">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="ui-table-head">
              <tr>
                <th className="px-1 py-1.5 font-medium text-center w-8" aria-label="Urutkan" />
                <th className="px-1 py-1.5 font-medium text-center w-12">No</th>
                <th className="px-2 py-1.5 font-medium">Nama Santri</th>
                <th className="px-1.5 py-1.5 font-medium text-center w-16">Absen</th>
                <th className="px-1.5 py-1.5 font-medium text-center w-20">Nilai</th>
              </tr>
            </thead>
            <tbody className="ui-table-body">
              {loading || kelasLoading || mapelLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center ui-text-muted">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Memuat…
                    </div>
                  </td>
                </tr>
              ) : !kelasId || !mapelId || !tanggalUjian?.masehi ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center ui-text-muted">
                    Pilih rombel, mapel, dan tanggal ujian
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center ui-text-muted">
                    Tidak ada santri di rombel ini
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => {
                  const absenSaving = savingKey === `${row.santri_id}-absen`
                  const isDragging = dragIndex === index
                  const isOver = dragOverIndex === index && dragIndex !== null && dragIndex !== index
                  return (
                    <tr
                      key={row.santri_id}
                      className={`ui-table-row ${isDragging ? 'opacity-50' : ''} ${
                        isOver ? 'ring-1 ring-inset ring-blue-400/60' : ''
                      }`}
                      onDragOver={onDragOver(index)}
                      onDrop={onDrop(index)}
                      onDragEnd={onDragEnd}
                    >
                      <td className="px-0.5 py-1 text-center">
                        <button
                          type="button"
                          draggable={!busy}
                          onDragStart={onDragStart(index)}
                          disabled={busy}
                          title="Seret untuk mengurutkan"
                          className="cursor-grab active:cursor-grabbing ui-text-muted hover:text-slate-700 dark:hover:text-slate-200 px-1 py-0.5 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                          aria-label={`Seret ${row.nama}`}
                        >
                          <MaterialIcon name="drag_indicator" size={16} />
                        </button>
                      </td>
                      <td className="px-1 py-1 text-center">
                        <input
                          type="number"
                          min={1}
                          max={rows.length}
                          inputMode="numeric"
                          value={noDraft[row.santri_id] ?? String(index + 1)}
                          disabled={busy}
                          onChange={(e) =>
                            setNoDraft((d) => ({ ...d, [row.santri_id]: e.target.value }))
                          }
                          onBlur={() => applyNoChange(row.santri_id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                          }}
                          className="ui-input w-10 mx-auto text-center tabular-nums text-xs py-1 px-1 disabled:opacity-50"
                          title="Ubah nomor untuk pindah urutan"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <div className="font-medium text-slate-800 dark:text-slate-200 leading-tight">{row.nama}</div>
                        {row.nomer_induk && (
                          <div className="text-[10px] ui-text-muted leading-tight">{row.nomer_induk}</div>
                        )}
                      </td>
                      <td className="px-1.5 py-1 text-center">
                        <button
                          type="button"
                          disabled={absenSaving || busy}
                          onClick={() => handleToggleAbsen(row)}
                          title={`Klik untuk ganti: ${STATUS_LABEL[row.absen]}`}
                          className={`inline-flex min-w-[2.25rem] items-center justify-center px-1.5 py-0.5 rounded border text-xs font-semibold transition disabled:opacity-50 ${STATUS_CELL_CLASS[row.absen]}`}
                        >
                          {row.absen}
                        </button>
                      </td>
                      <td className="px-1.5 py-1 text-center">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          inputMode="decimal"
                          value={nilaiDraft[row.santri_id] ?? ''}
                          disabled={busy}
                          onChange={(e) =>
                            setNilaiDraft((d) => ({ ...d, [row.santri_id]: e.target.value }))
                          }
                          placeholder="—"
                          className="ui-input w-14 mx-auto text-center tabular-nums text-xs py-1 px-1 disabled:opacity-50"
                        />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {rows.length > 0 && (
        <p className="text-[10px] ui-text-muted leading-snug">
          Seret ikon atau ubah <strong>No</strong> untuk urutan. Paste = 1 baris/santri, lalu <strong>Simpan</strong>.
        </p>
      )}

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {pasteOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/40 z-[100]"
                  onClick={() => setPasteOpen(false)}
                />
                <motion.div
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                  className="fixed inset-y-0 right-0 h-dvh max-h-dvh w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl z-[110] flex flex-col"
                >
                  <div className="px-5 py-4 border-b ui-divider flex items-center justify-between shrink-0">
                    <h2 className="font-semibold text-lg">Paste Nilai</h2>
                    <button
                      type="button"
                      onClick={() => setPasteOpen(false)}
                      className="ui-text-muted text-xl leading-none"
                    >
                      ×
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-5 space-y-4 flex flex-col min-h-0">
                    <p className="text-sm ui-text-muted">
                      Satu nilai per baris, urutan sama dengan daftar santri ({rows.length} orang). Contoh:
                    </p>
                    <pre className="text-xs ui-text-muted bg-slate-50 dark:bg-slate-950/50 border ui-divider rounded-lg px-3 py-2 font-mono">
                      {`20\n30\n52\n20`}
                    </pre>
                    <label htmlFor="nilai-paste-input" className="ui-label block">
                      Daftar nilai
                    </label>
                    <textarea
                      id="nilai-paste-input"
                      value={pasteText}
                      onChange={(e) => {
                        setPasteText(e.target.value)
                        setPasteError('')
                      }}
                      placeholder={'20\n30\n52\n20'}
                      spellCheck={false}
                      className="ui-input w-full flex-1 min-h-[280px] font-mono text-sm leading-6 resize-none"
                    />
                    {pasteError && <p className="text-sm text-red-600 dark:text-red-400">{pasteError}</p>}
                  </div>
                  <div
                    className="px-5 py-4 border-t ui-divider flex gap-2 shrink-0"
                    style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
                  >
                    <button type="button" onClick={() => setPasteOpen(false)} className="flex-1 ui-btn-secondary">
                      Batal
                    </button>
                    <button type="button" onClick={applyPaste} className="flex-1 ui-btn-primary">
                      Terapkan
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {ubahTanggalOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/40 z-[100]"
                  onClick={() => !ubahTanggalLoading && setUbahTanggalOpen(false)}
                />
                <motion.div
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                  className="fixed inset-y-0 right-0 h-dvh max-h-dvh w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl z-[110] flex flex-col"
                >
                  <div className="px-5 py-4 border-b ui-divider flex items-center justify-between shrink-0">
                    <h2 className="font-semibold text-lg">Ubah Tanggal Ujian</h2>
                    <button
                      type="button"
                      onClick={() => !ubahTanggalLoading && setUbahTanggalOpen(false)}
                      className="ui-text-muted text-xl leading-none"
                    >
                      ×
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    <p className="text-sm ui-text-muted">
                      Memindahkan semua data nilai (absen + nilai) dari tanggal saat ini ke tanggal baru untuk
                      rombel dan mapel yang dipilih.
                    </p>
                    {tanggalUjian?.masehi && (
                      <div className="rounded-lg border ui-divider bg-slate-50 dark:bg-slate-950/40 px-3 py-2.5 text-sm space-y-1">
                        <p className="ui-text-muted">Tanggal saat ini (Masehi)</p>
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {formatMasehiDateDisplay(tanggalUjian.masehi)}
                        </p>
                        {tanggalUjian.hijri && (
                          <p className="text-blue-600 dark:text-blue-400">
                            {formatHijriDateDisplay(tanggalUjian.hijri)}
                          </p>
                        )}
                      </div>
                    )}
                    <PickDateHijriMasehi
                      id="nilai-tanggal-baru"
                      label="Tanggal baru"
                      value={tanggalBaru}
                      onChange={(v) => {
                        setTanggalBaru(v)
                        setUbahTanggalError('')
                      }}
                    />
                    {ubahTanggalError && (
                      <p className="text-sm text-red-600 dark:text-red-400">{ubahTanggalError}</p>
                    )}
                  </div>
                  <div
                    className="px-5 py-4 border-t ui-divider flex gap-2 shrink-0"
                    style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
                  >
                    <button
                      type="button"
                      onClick={() => setUbahTanggalOpen(false)}
                      disabled={ubahTanggalLoading}
                      className="flex-1 ui-btn-secondary disabled:opacity-50"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleUbahTanggal}
                      disabled={ubahTanggalLoading || !tanggalBaru?.masehi}
                      className="flex-1 ui-btn-primary disabled:opacity-50"
                    >
                      {ubahTanggalLoading ? 'Menyimpan…' : 'Simpan Tanggal'}
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}
    </motion.div>
  )
}
