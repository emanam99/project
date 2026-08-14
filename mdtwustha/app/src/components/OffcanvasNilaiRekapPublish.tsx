import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  createNilaiRekapPublish,
  getNilaiRekap,
  getNilaiRekapPublishOccupied,
  updateNilaiRekapPublish,
  type KelasRow,
  type MapelRow,
  type NilaiRekapPublishRow,
  type NilaiRekapRow,
  type NilaiRekapTampil,
} from '../api/apiClient'
import PickDateHijriMasehi, {
  type DualDateValue,
  compareMasehiYmd,
  masehiMaxRekap,
} from './PickDateHijri/PickDateHijriMasehi'
import MaterialIcon from './MaterialIcon'
import { getStoredUser } from '../utils/auth'

function formatKelasLabel(nama: string, kel?: string) {
  return kel ? `${nama} · ${kel}` : nama
}

function toDatetimeLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function datesInRange(awal: string, akhir: string): string[] {
  const out: string[] = []
  const cur = new Date(awal + 'T12:00:00')
  const end = new Date(akhir + 'T12:00:00')
  while (cur <= end) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(cur.getDate()).padStart(2, '0')
    out.push(`${y}-${m}-${d}`)
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

const TAMPIL_OPTIONS: { value: NilaiRekapTampil; label: string }[] = [
  { value: 'nilai', label: 'Nilai saja' },
  { value: 'absen', label: 'Absen saja' },
  { value: 'keduanya', label: 'Nilai & Absen' },
]

export type OffcanvasNilaiRekapPublishProps = {
  open: boolean
  onClose: () => void
  onSaved?: () => void
  kelasList: KelasRow[]
  initialKelasIds?: string[]
  initialDari?: DualDateValue | null
  initialSampai?: DualDateValue | null
  initialTampil?: NilaiRekapTampil
  editRow?: NilaiRekapPublishRow | null
  editMapel?: MapelRow[] | null
  editBaris?: NilaiRekapRow[] | null
}

export default function OffcanvasNilaiRekapPublish({
  open,
  onClose,
  onSaved,
  kelasList,
  initialKelasIds = [],
  initialDari = null,
  initialSampai = null,
  initialTampil = 'nilai',
  editRow = null,
  editMapel = null,
  editBaris = null,
}: OffcanvasNilaiRekapPublishProps) {
  const user = getStoredUser()
  const isEdit = Boolean(editRow?.id)
  const masehiMax = masehiMaxRekap()

  const [judul, setJudul] = useState('')
  const [catatan, setCatatan] = useState('')
  const [selectedKelasIds, setSelectedKelasIds] = useState<Set<string>>(new Set())
  const [tanggalDari, setTanggalDari] = useState<DualDateValue | null>(null)
  const [tanggalSampai, setTanggalSampai] = useState<DualDateValue | null>(null)
  const [tampil, setTampil] = useState<NilaiRekapTampil>('nilai')
  const [publishAt, setPublishAt] = useState(() => toDatetimeLocalValue(new Date()))
  const [mapel, setMapel] = useState<MapelRow[]>([])
  const [baris, setBaris] = useState<NilaiRekapRow[]>([])
  const [occupied, setOccupied] = useState<string[]>([])
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedIdsArr = useMemo(() => Array.from(selectedKelasIds), [selectedKelasIds])

  useEffect(() => {
    if (!open) return
    setError('')
    if (editRow) {
      setJudul(editRow.judul || '')
      setCatatan(editRow.catatan || '')
      setSelectedKelasIds(new Set((editRow.kelas_ids || []).map(String)))
      setTanggalDari({ masehi: editRow.tanggal_awal, hijri: editRow.hijri_awal || '' })
      setTanggalSampai({ masehi: editRow.tanggal_akhir, hijri: editRow.hijri_akhir || '' })
      setTampil((editRow.tampil as NilaiRekapTampil) || 'nilai')
      setPublishAt(toDatetimeLocalValue(new Date(editRow.publish_at.replace(' ', 'T'))))
      setMapel(editMapel || [])
      setBaris(editBaris || [])
    } else {
      setJudul('')
      setCatatan('')
      setSelectedKelasIds(new Set(initialKelasIds))
      setTanggalDari(initialDari)
      setTanggalSampai(initialSampai)
      setTampil(initialTampil)
      setPublishAt(toDatetimeLocalValue(new Date()))
      setMapel([])
      setBaris([])
    }
  }, [open, editRow, editMapel, editBaris, initialKelasIds, initialDari, initialSampai, initialTampil])

  useEffect(() => {
    if (!open || !user?.akses || selectedIdsArr.length === 0) {
      setOccupied([])
      return
    }
    let cancelled = false
    getNilaiRekapPublishOccupied(user.akses, selectedIdsArr, editRow?.id).then((res) => {
      if (cancelled) return
      setOccupied(res.success ? res.data : [])
    })
    return () => {
      cancelled = true
    }
  }, [open, user?.akses, selectedIdsArr, editRow?.id])

  const overlapDates = useMemo(() => {
    const awal = tanggalDari?.masehi
    const akhir = tanggalSampai?.masehi
    if (!awal || !akhir || compareMasehiYmd(awal, akhir) > 0) return []
    const range = new Set(datesInRange(awal, akhir))
    return occupied.filter((d) => range.has(d))
  }, [occupied, tanggalDari?.masehi, tanggalSampai?.masehi])

  const loadPreview = async () => {
    const awal = tanggalDari?.masehi
    const akhir = tanggalSampai?.masehi
    if (!selectedIdsArr.length || !awal || !akhir) {
      setError('Lengkapi kelas dan rentang tanggal')
      return
    }
    if (compareMasehiYmd(awal, akhir) > 0) {
      setError('Tanggal awal tidak boleh setelah tanggal akhir')
      return
    }
    if (overlapDates.length > 0) {
      setError(
        `Tanggal sudah ada di rekap lain: ${overlapDates.slice(0, 5).join(', ')}${overlapDates.length > 5 ? '…' : ''}`
      )
      return
    }
    setLoadingPreview(true)
    setError('')
    const res = await getNilaiRekap(selectedIdsArr, awal, akhir)
    setLoadingPreview(false)
    if (!res.success) {
      setError(res.message || 'Gagal memuat preview rekap')
      return
    }
    setMapel(res.mapel || [])
    setBaris(res.data || [])
  }

  useEffect(() => {
    if (!open || isEdit) return
    if (!selectedIdsArr.length || !tanggalDari?.masehi || !tanggalSampai?.masehi) return
    if (overlapDates.length > 0) return
    void loadPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit, selectedIdsArr.join(','), tanggalDari?.masehi, tanggalSampai?.masehi, occupied.length])

  const updateNilaiCell = (santriId: string, kelasId: string, mapelId: string, nilai: number | null) => {
    setBaris((prev) =>
      prev.map((b) => {
        if (b.santri_id !== santriId || b.kelas_id !== kelasId) return b
        const prevCell = b.cells?.[mapelId]
        return {
          ...b,
          cells: {
            ...b.cells,
            [mapelId]: {
              nilai,
              absen: prevCell?.absen || 'H',
              tanggal: prevCell?.tanggal || tanggalDari?.masehi || '',
            },
          },
        }
      })
    )
  }

  const handleSave = async () => {
    const akses = user?.akses || ''
    if (!judul.trim()) {
      setError('Judul wajib diisi')
      return
    }
    if (!selectedIdsArr.length || !tanggalDari?.masehi || !tanggalSampai?.masehi) {
      setError('Kelas dan rentang tanggal wajib')
      return
    }
    if (overlapDates.length > 0) {
      setError('Rentang tanggal bentrok dengan rekap yang sudah dipublish')
      return
    }
    if (mapel.length === 0 || baris.length === 0) {
      setError('Belum ada data. Muat preview dulu.')
      return
    }
    if (!publishAt) {
      setError('Tanggal & jam publish wajib')
      return
    }

    setSaving(true)
    setError('')
    const payload = {
      judul: judul.trim(),
      catatan: catatan.trim() || undefined,
      kelas_ids: selectedIdsArr,
      tanggal_awal: tanggalDari.masehi,
      tanggal_akhir: tanggalSampai.masehi,
      hijri_awal: tanggalDari.hijri || undefined,
      hijri_akhir: tanggalSampai.hijri || undefined,
      tampil,
      publish_at: publishAt,
      published_by: user?.id,
      akses,
      mapel,
      baris,
    }
    const res = isEdit
      ? await updateNilaiRekapPublish(editRow!.id, payload)
      : await createNilaiRekapPublish(payload)
    setSaving(false)
    if (!res.success) {
      setError(res.message || 'Gagal menyimpan')
      return
    }
    onSaved?.()
    onClose()
  }

  const showNilai = tampil === 'nilai' || tampil === 'keduanya'
  const previewCols = mapel.slice(0, 8)

  const panel = (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000]"
            aria-label="Tutup"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.aside
            className="ui-offcanvas z-[1001] !max-w-xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label={isEdit ? 'Edit publish rekap nilai' : 'Publish rekap nilai'}
          >
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b ui-divider">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-50 m-0">
                {isEdit ? 'Edit Publish Rekap Nilai' : 'Publish Rekap Nilai'}
              </h2>
              <button type="button" onClick={onClose} aria-label="Tutup" className="ui-btn-close">
                <MaterialIcon name="close" size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <label className="ui-label mb-1.5 block">Judul *</label>
                <input
                  type="text"
                  value={judul}
                  onChange={(e) => setJudul(e.target.value)}
                  className="ui-input w-full"
                  placeholder="Contoh: Rekap Nilai Shofar 1447"
                />
              </div>
              <div>
                <label className="ui-label mb-1.5 block">Catatan (opsional)</label>
                <textarea
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  className="ui-input w-full resize-none"
                  rows={2}
                />
              </div>

              <div>
                <label className="ui-label mb-1.5 block">Kelas *</label>
                <div className="rounded-lg border ui-divider max-h-36 overflow-y-auto p-2 space-y-1">
                  {kelasList.map((k) => (
                    <label key={k.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedKelasIds.has(k.id)}
                        disabled={isEdit}
                        onChange={() => {
                          setSelectedKelasIds((prev) => {
                            const next = new Set(prev)
                            if (next.has(k.id)) {
                              if (next.size === 1) return prev
                              next.delete(k.id)
                            } else next.add(k.id)
                            return next
                          })
                        }}
                        className="rounded border-slate-300"
                      />
                      {formatKelasLabel(k.nama_kelas, k.kel)}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <PickDateHijriMasehi
                  id="publish-nilai-dari"
                  label="Dari tanggal"
                  value={tanggalDari}
                  onChange={(v) => {
                    setTanggalDari(v)
                    if (v && tanggalSampai && compareMasehiYmd(tanggalSampai.masehi, v.masehi) < 0) {
                      setTanggalSampai(v)
                    }
                  }}
                  masehiMax={tanggalSampai?.masehi || masehiMax}
                />
                <PickDateHijriMasehi
                  id="publish-nilai-sampai"
                  label="Sampai tanggal"
                  value={tanggalSampai}
                  onChange={setTanggalSampai}
                  hijriMin={tanggalDari?.hijri || undefined}
                  masehiMax={masehiMax}
                />
              </div>

              {overlapDates.length > 0 && (
                <div className="text-xs text-amber-800 dark:text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                  Tanggal bentrok: <strong>{overlapDates.slice(0, 8).join(', ')}</strong>
                  {overlapDates.length > 8 ? '…' : ''}
                </div>
              )}

              <div>
                <p className="ui-label mb-1.5">Tampilan default</p>
                <div className="flex flex-wrap gap-1.5">
                  {TAMPIL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTampil(opt.value)}
                      className={`px-2.5 py-1 text-xs rounded-md border transition ${
                        tampil === opt.value
                          ? 'border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300 font-medium'
                          : 'ui-divider ui-text-muted'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="ui-label mb-1.5 block">Tanggal & jam publish *</label>
                <input
                  type="datetime-local"
                  value={publishAt}
                  onChange={(e) => setPublishAt(e.target.value)}
                  className="ui-input w-full"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => setPublishAt(toDatetimeLocalValue(new Date()))}
                    className="px-2 py-1 text-[11px] rounded-md border ui-divider ui-text-muted"
                  >
                    Sekarang
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date()
                      d.setDate(d.getDate() + 1)
                      d.setHours(7, 0, 0, 0)
                      setPublishAt(toDatetimeLocalValue(d))
                    }}
                    className="px-2 py-1 text-[11px] rounded-md border ui-divider ui-text-muted"
                  >
                    Besok 07:00
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 m-0">
                  Snapshot nilai ({baris.length} santri · {mapel.length} mapel)
                </p>
                <button
                  type="button"
                  onClick={() => void loadPreview()}
                  disabled={loadingPreview || overlapDates.length > 0}
                  className="px-2.5 py-1 text-xs ui-btn-secondary rounded-lg disabled:opacity-50"
                >
                  {loadingPreview ? 'Memuat…' : 'Muat ulang'}
                </button>
              </div>

              {baris.length === 0 ? (
                <p className="text-sm ui-text-muted italic text-center py-4">Belum ada data</p>
              ) : showNilai ? (
                <div className="overflow-x-auto rounded-xl border ui-divider">
                  <table className="w-full text-left text-[11px] min-w-[480px]">
                    <thead className="ui-table-head">
                      <tr>
                        <th className="px-2 py-1.5 sticky left-0 bg-inherit">Nama</th>
                        {previewCols.map((m) => (
                          <th key={m.id} className="px-1 py-1.5 text-center max-w-[4.5rem] truncate" title={m.fan}>
                            {m.fan || m.kitab_nama || m.id}
                          </th>
                        ))}
                        {mapel.length > previewCols.length && (
                          <th className="px-1 py-1.5 text-center ui-text-muted">+{mapel.length - previewCols.length}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="ui-table-body">
                      {baris.slice(0, 40).map((b) => (
                        <tr key={`${b.santri_id}-${b.kelas_id}`} className="ui-table-row">
                          <td className="px-2 py-1 sticky left-0 bg-inherit font-medium truncate max-w-[7rem]">
                            {b.nama}
                          </td>
                          {previewCols.map((m) => {
                            const cell = b.cells?.[m.id]
                            const val = cell?.nilai
                            return (
                              <td key={m.id} className="px-0.5 py-0.5">
                                <input
                                  type="number"
                                  step="0.1"
                                  value={val ?? ''}
                                  onChange={(e) => {
                                    const raw = e.target.value
                                    updateNilaiCell(
                                      b.santri_id,
                                      b.kelas_id || '',
                                      m.id,
                                      raw === '' ? null : Number(raw)
                                    )
                                  }}
                                  className="ui-input !px-0.5 !py-0.5 text-center tabular-nums w-12"
                                />
                              </td>
                            )
                          })}
                          {mapel.length > previewCols.length && <td className="px-1 text-center ui-text-muted">…</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {baris.length > 40 && (
                    <p className="text-[10px] ui-text-muted px-2 py-1">
                      Menampilkan 40/{baris.length} baris di editor; semua tetap tersimpan.
                    </p>
                  )}
                  {mapel.length > previewCols.length && (
                    <p className="text-[10px] ui-text-muted px-2 py-1">
                      Editor menampilkan 8 mapel pertama; seluruh nilai mapel ikut di-snapshot.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs ui-text-muted">
                  Mode absen: snapshot tetap menyimpan nilai & absen per mapel untuk tiap santri.
                </p>
              )}

              {error && <div className="ui-error-box px-3 py-2 text-sm">{error}</div>}
            </div>

            <div className="flex-shrink-0 flex gap-3 px-5 py-4 border-t ui-divider">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 px-4 ui-btn-secondary">
                Batal
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || overlapDates.length > 0}
                className="flex-1 py-2.5 px-4 ui-btn-primary disabled:opacity-60"
              >
                {saving ? 'Menyimpan…' : isEdit ? 'Perbarui' : 'Publish'}
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )

  if (typeof document === 'undefined') return null
  return createPortal(panel, document.body)
}
