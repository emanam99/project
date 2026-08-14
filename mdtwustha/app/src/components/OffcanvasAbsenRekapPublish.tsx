import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  absenRekapRowsToPublishBaris,
  createAbsenRekapPublish,
  getAbsenRekap,
  getAbsenRekapPublishOccupied,
  updateAbsenRekapPublish,
  type AbsenRekapPublishBaris,
  type AbsenRekapPublishRow,
  type KelasRow,
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

export type OffcanvasAbsenRekapPublishProps = {
  open: boolean
  onClose: () => void
  onSaved?: () => void
  kelasList: KelasRow[]
  /** Prefill dari halaman rekap live */
  initialKelasId?: string
  initialDari?: DualDateValue | null
  initialSampai?: DualDateValue | null
  /** Mode edit publish yang sudah ada */
  editRow?: AbsenRekapPublishRow | null
  editBaris?: AbsenRekapPublishBaris[] | null
}

export default function OffcanvasAbsenRekapPublish({
  open,
  onClose,
  onSaved,
  kelasList,
  initialKelasId = '',
  initialDari = null,
  initialSampai = null,
  editRow = null,
  editBaris = null,
}: OffcanvasAbsenRekapPublishProps) {
  const user = getStoredUser()
  const isEdit = Boolean(editRow?.id)
  const masehiMax = masehiMaxRekap()

  const [judul, setJudul] = useState('')
  const [catatan, setCatatan] = useState('')
  const [kelasId, setKelasId] = useState('')
  const [tanggalDari, setTanggalDari] = useState<DualDateValue | null>(null)
  const [tanggalSampai, setTanggalSampai] = useState<DualDateValue | null>(null)
  const [publishAt, setPublishAt] = useState(() => toDatetimeLocalValue(new Date()))
  const [baris, setBaris] = useState<AbsenRekapPublishBaris[]>([])
  const [occupied, setOccupied] = useState<string[]>([])
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    if (editRow) {
      setJudul(editRow.judul || '')
      setCatatan(editRow.catatan || '')
      setKelasId(editRow.kelas_id)
      setTanggalDari({ masehi: editRow.tanggal_awal, hijri: editRow.hijri_awal || '' })
      setTanggalSampai({ masehi: editRow.tanggal_akhir, hijri: editRow.hijri_akhir || '' })
      setPublishAt(toDatetimeLocalValue(new Date(editRow.publish_at.replace(' ', 'T'))))
      setBaris(editBaris || [])
    } else {
      setJudul('')
      setCatatan('')
      setKelasId(initialKelasId || kelasList[0]?.id || '')
      setTanggalDari(initialDari)
      setTanggalSampai(initialSampai)
      setPublishAt(toDatetimeLocalValue(new Date()))
      setBaris([])
    }
  }, [open, editRow, editBaris, initialKelasId, initialDari, initialSampai, kelasList])

  useEffect(() => {
    if (!open || !kelasId || !user?.akses) return
    let cancelled = false
    getAbsenRekapPublishOccupied(kelasId, user.akses, editRow?.id).then((res) => {
      if (cancelled) return
      setOccupied(res.success ? res.data : [])
    })
    return () => {
      cancelled = true
    }
  }, [open, kelasId, user?.akses, editRow?.id])

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
    if (!kelasId || !awal || !akhir) {
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
    const res = await getAbsenRekap(kelasId, awal, akhir)
    setLoadingPreview(false)
    if (!res.success) {
      setError(res.message || 'Gagal memuat preview rekap')
      return
    }
    setBaris(absenRekapRowsToPublishBaris(res.data || []))
  }

  useEffect(() => {
    if (!open || isEdit) return
    if (!kelasId || !tanggalDari?.masehi || !tanggalSampai?.masehi) return
    if (overlapDates.length > 0) return
    void loadPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit, kelasId, tanggalDari?.masehi, tanggalSampai?.masehi, occupied.length])

  const updateCell = (santriId: string, key: keyof AbsenRekapPublishBaris, value: number) => {
    setBaris((prev) =>
      prev.map((b) => (b.santri_id === santriId ? { ...b, [key]: Math.max(0, value) } : b))
    )
  }

  const handleSave = async () => {
    const akses = user?.akses || ''
    if (!judul.trim()) {
      setError('Judul wajib diisi')
      return
    }
    if (!kelasId || !tanggalDari?.masehi || !tanggalSampai?.masehi) {
      setError('Kelas dan rentang tanggal wajib')
      return
    }
    if (overlapDates.length > 0) {
      setError('Rentang tanggal bentrok dengan rekap yang sudah dipublish')
      return
    }
    if (baris.length === 0) {
      setError('Belum ada baris rekap. Muat preview dulu.')
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
      kelas_id: kelasId,
      tanggal_awal: tanggalDari.masehi,
      tanggal_akhir: tanggalSampai.masehi,
      hijri_awal: tanggalDari.hijri || undefined,
      hijri_akhir: tanggalSampai.hijri || undefined,
      publish_at: publishAt,
      published_by: user?.id,
      akses,
      baris,
    }
    const res = isEdit
      ? await updateAbsenRekapPublish(editRow!.id, payload)
      : await createAbsenRekapPublish(payload)
    setSaving(false)
    if (!res.success) {
      setError(res.message || 'Gagal menyimpan')
      return
    }
    onSaved?.()
    onClose()
  }

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
            className="ui-offcanvas z-[1001]"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label={isEdit ? 'Edit publish rekap' : 'Publish rekap'}
          >
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b ui-divider">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-50 m-0">
                {isEdit ? 'Edit Publish Rekap' : 'Publish Rekap'}
              </h2>
              <button type="button" onClick={onClose} aria-label="Tutup" className="ui-btn-close">
                <MaterialIcon name="close" size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <label className="ui-label mb-1.5 block">Judul rekap *</label>
                <input
                  type="text"
                  value={judul}
                  onChange={(e) => setJudul(e.target.value)}
                  className="ui-input w-full"
                  placeholder="Contoh: Rekap Absensi Shofar 1447"
                />
              </div>
              <div>
                <label className="ui-label mb-1.5 block">Catatan (opsional)</label>
                <textarea
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  className="ui-input w-full resize-none"
                  rows={2}
                  placeholder="Catatan untuk user..."
                />
              </div>

              <div>
                <label className="ui-label mb-1.5 block">Kelas *</label>
                <select
                  value={kelasId}
                  onChange={(e) => setKelasId(e.target.value)}
                  className="ui-input w-full appearance-none"
                  disabled={isEdit}
                >
                  {kelasList.map((k) => (
                    <option key={k.id} value={k.id}>
                      {formatKelasLabel(k.nama_kelas, k.kel)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <PickDateHijriMasehi
                  id="publish-rekap-dari"
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
                  id="publish-rekap-sampai"
                  label="Sampai tanggal"
                  value={tanggalSampai}
                  onChange={setTanggalSampai}
                  hijriMin={tanggalDari?.hijri || undefined}
                  masehiMax={masehiMax}
                />
              </div>

              {overlapDates.length > 0 && (
                <div className="text-xs text-amber-800 dark:text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                  Tanggal berikut sudah masuk rekap publish lain untuk kelas ini:{' '}
                  <strong>{overlapDates.slice(0, 8).join(', ')}</strong>
                  {overlapDates.length > 8 ? '…' : ''}. Ubah rentang agar tidak bentrok.
                </div>
              )}

              <div>
                <label className="ui-label mb-1.5 block">Tanggal & jam publish *</label>
                <input
                  type="datetime-local"
                  value={publishAt}
                  onChange={(e) => setPublishAt(e.target.value)}
                  className="ui-input w-full"
                />
                <p className="text-[11px] ui-text-muted mt-1">
                  User melihat rekap setelah waktu ini. Sebelumnya hanya countdown.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => setPublishAt(toDatetimeLocalValue(new Date()))}
                    className="px-2 py-1 text-[11px] rounded-md border ui-divider ui-text-muted hover:bg-slate-50 dark:hover:bg-white/5"
                  >
                    Sekarang
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date()
                      d.setHours(d.getHours() + 1, 0, 0, 0)
                      setPublishAt(toDatetimeLocalValue(d))
                    }}
                    className="px-2 py-1 text-[11px] rounded-md border ui-divider ui-text-muted hover:bg-slate-50 dark:hover:bg-white/5"
                  >
                    +1 jam
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date()
                      d.setDate(d.getDate() + 1)
                      d.setHours(7, 0, 0, 0)
                      setPublishAt(toDatetimeLocalValue(d))
                    }}
                    className="px-2 py-1 text-[11px] rounded-md border ui-divider ui-text-muted hover:bg-slate-50 dark:hover:bg-white/5"
                  >
                    Besok 07:00
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Total per santri</p>
                <button
                  type="button"
                  onClick={() => void loadPreview()}
                  disabled={loadingPreview || overlapDates.length > 0}
                  className="px-2.5 py-1 text-xs ui-btn-secondary rounded-lg disabled:opacity-50"
                >
                  {loadingPreview ? 'Memuat…' : 'Muat ulang dari absen'}
                </button>
              </div>

              {baris.length === 0 ? (
                <p className="text-sm ui-text-muted italic py-4 text-center">Belum ada data baris</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border ui-divider">
                  <table className="w-full text-left text-xs min-w-[420px]">
                    <thead className="ui-table-head">
                      <tr>
                        <th className="px-2 py-2">Nama</th>
                        <th className="px-1 py-2 text-center w-12">H</th>
                        <th className="px-1 py-2 text-center w-12">S</th>
                        <th className="px-1 py-2 text-center w-12">I</th>
                        <th className="px-1 py-2 text-center w-12">A</th>
                      </tr>
                    </thead>
                    <tbody className="ui-table-body">
                      {baris.map((b) => (
                        <tr key={b.santri_id} className="ui-table-row">
                          <td className="px-2 py-1.5">
                            <div className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[9rem]">
                              {b.nama}
                            </div>
                            {b.nomer_induk && <div className="text-[10px] ui-text-muted">{b.nomer_induk}</div>}
                          </td>
                          {(['h', 's', 'i', 'a'] as const).map((k) => (
                            <td key={k} className="px-1 py-1">
                              <input
                                type="number"
                                min={0}
                                value={b[k]}
                                onChange={(e) => updateCell(b.santri_id, k, Number(e.target.value) || 0)}
                                className="ui-input !px-1 !py-1 text-center tabular-nums w-11"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
