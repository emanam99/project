import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { laporanGtMybeddianAPI } from '../../../services/api'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import { getBulanName } from '../../../utils/bulanHijriLatin'
import UgtLaporanMasalahFields from '../../../components/ugt/UgtLaporanMasalahFields'
import LaporanReadonlyOffcanvas from '../../../components/ugt/LaporanReadonlyOffcanvas'
import {
  emptyMasalahRow,
  mapApiMasalahToItems,
  buildMasalahListPayload,
} from '../../../utils/ugtLaporanMasalah'

const BANIN_BANAT = [
  { value: '', label: '—' },
  { value: 'Banin', label: 'Banin' },
  { value: 'Banat', label: 'Banat' },
  { value: 'Campur', label: 'Campur' },
]
const IYA_TIDAK = [
  { value: '', label: '—' },
  { value: 'Iya', label: 'Iya' },
  { value: 'Tidak', label: 'Tidak' },
]
const WAKTU = [
  { value: '', label: '—' },
  { value: 'pagi', label: 'Pagi' },
  { value: 'siang', label: 'Siang' },
  { value: 'malam', label: 'Malam' },
]
const KET_IMAM = [
  { value: '', label: '—' },
  { value: 'masjid', label: 'Masjid' },
  { value: 'surau', label: 'Surau' },
]

function emptyForm(santriId) {
  return {
    id_madrasah: '',
    id_santri: santriId ? String(santriId) : '',
    id_tahun_ajaran: '',
    bulan: 0,
    wali_kelas: '',
    fan_kelas: '',
    pulang: 0,
    sakit: 0,
    udzur: 0,
    banin_banat: '',
    muallim_quran: '',
    waktu_muallim: '',
    ngaji_kitab: '',
    waktu_ngaji: '',
    imam: '',
    ket_imam: '',
    tugas_selanjutnya: '',
    usulan: '',
  }
}

function rowToForm(row, santriId) {
  return {
    id_madrasah: String(row.id_madrasah ?? ''),
    id_santri: String(row.id_santri ?? santriId ?? ''),
    id_tahun_ajaran: row.id_tahun_ajaran ?? '',
    bulan: Number(row.bulan) || 1,
    wali_kelas: row.wali_kelas ?? '',
    fan_kelas: row.fan_kelas ?? '',
    pulang: Number(row.pulang) || 0,
    sakit: Number(row.sakit) || 0,
    udzur: Number(row.udzur) || 0,
    banin_banat: row.banin_banat ?? '',
    muallim_quran: row.muallim_quran ?? '',
    waktu_muallim: row.waktu_muallim ?? '',
    ngaji_kitab: row.ngaji_kitab ?? '',
    waktu_ngaji: row.waktu_ngaji ?? '',
    imam: row.imam ?? '',
    ket_imam: row.ket_imam ?? '',
    tugas_selanjutnya: row.tugas_selanjutnya ?? '',
    usulan: row.usulan ?? '',
  }
}

export default function LaporanGtOffcanvas({
  isOpen,
  onClose,
  detailLoading = false,
  initialData,
  santriId,
  tahunAjaranAktif = '',
  konteksData = null,
  readOnly = false,
  onSuccess,
  onNotify,
}) {
  const handleClose = useOffcanvasBackClose(isOpen, onClose, { urlManaged: true })
  const [form, setForm] = useState(() => emptyForm(santriId))
  const [konteksLoading, setKonteksLoading] = useState(false)
  const [penugasanList, setPenugasanList] = useState([])
  const [madrasahNama, setMadrasahNama] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [masalahItems, setMasalahItems] = useState(() => [emptyMasalahRow()])

  const isEdit = Boolean(initialData?.id)
  const selectCls =
    'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm'
  const readOnlyCls = `${selectCls} bg-gray-50 dark:bg-gray-900/40`

  const applyKonteks = useCallback((data) => {
    if (!data) return
    const penugasan = Array.isArray(data.penugasan_aktif) ? data.penugasan_aktif : []
    setPenugasanList(penugasan)
    const mid =
      data.id_madrasah != null && Number(data.id_madrasah) > 0
        ? String(data.id_madrasah)
        : penugasan.length === 1
          ? String(penugasan[0].id_madrasah ?? '')
          : ''
    const nama =
      (data.madrasah_nama && String(data.madrasah_nama).trim()) ||
      (penugasan.length === 1 ? String(penugasan[0].madrasah_nama || '').trim() : '')
    setMadrasahNama(nama)
    setForm((prev) => ({
      ...prev,
      id_madrasah: mid || prev.id_madrasah,
      id_santri: data.id_santri != null ? String(data.id_santri) : prev.id_santri,
      id_tahun_ajaran:
        data.id_tahun_ajaran != null && String(data.id_tahun_ajaran).trim() !== ''
          ? String(data.id_tahun_ajaran).trim()
          : '',
      bulan:
        data.bulan_hijriyah != null &&
        Number.isFinite(Number(data.bulan_hijriyah)) &&
        Number(data.bulan_hijriyah) >= 1 &&
        Number(data.bulan_hijriyah) <= 12
          ? Number(data.bulan_hijriyah)
          : 0,
    }))
  }, [])

  useEffect(() => {
    if (!isOpen) return
    if (initialData?.id) {
      setForm(rowToForm(initialData, santriId))
      setMadrasahNama(String(initialData.madrasah_nama || '').trim())
    } else if (!detailLoading) {
      setForm(emptyForm(santriId))
      setMasalahItems([emptyMasalahRow()])
    }
  }, [isOpen, initialData?.id, santriId, detailLoading])

  useEffect(() => {
    if (!isOpen || !initialData?.id) return
    if (Array.isArray(initialData.masalah)) {
      setMasalahItems(
        initialData.masalah.length > 0 ? mapApiMasalahToItems(initialData.masalah) : [emptyMasalahRow()]
      )
    }
  }, [isOpen, initialData?.id, initialData?.masalah])

  useEffect(() => {
    if (!isOpen || isEdit) return
    if (konteksData) {
      applyKonteks(konteksData)
      return
    }
    let cancelled = false
    setKonteksLoading(true)
    laporanGtMybeddianAPI
      .getKonteksSekarang()
      .then((res) => {
        if (cancelled) return
        if (!res?.success || !res.data) {
          onNotify?.('Gagal memuat tahun ajaran dan bulan otomatis.', 'error')
          return
        }
        applyKonteks(res.data)
        const warns = Array.isArray(res.warnings) ? res.warnings.filter(Boolean) : []
        if (warns.length) onNotify?.(warns.join(' '), 'warning')
      })
      .catch(() => {
        if (!cancelled) onNotify?.('Gagal memuat konteks laporan.', 'error')
      })
      .finally(() => {
        if (!cancelled) setKonteksLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, isEdit, konteksData, applyKonteks, onNotify])

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleMadrasahPick = (e) => {
    const mid = e.target.value
    const row = penugasanList.find((p) => String(p.id_madrasah) === mid)
    setForm((p) => ({ ...p, id_madrasah: mid }))
    setMadrasahNama(row?.madrasah_nama ? String(row.madrasah_nama).trim() : '')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const idM = parseInt(form.id_madrasah, 10)
    const idS = parseInt(form.id_santri, 10)
    const ta = (form.id_tahun_ajaran || tahunAjaranAktif || '').trim()
    const bulan = Number(form.bulan)
    if (!idM || !idS || !ta || bulan < 1 || bulan > 12) {
      onNotify?.('Lengkapi madrasah, tahun ajaran, dan bulan (1–12).', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        id_madrasah: idM,
        id_santri: idS,
        id_tahun_ajaran: ta,
        bulan,
        wali_kelas: (form.wali_kelas || '').trim() || null,
        fan_kelas: (form.fan_kelas || '').trim() || null,
        pulang: Math.max(0, Number(form.pulang) || 0),
        sakit: Math.max(0, Number(form.sakit) || 0),
        udzur: Math.max(0, Number(form.udzur) || 0),
        banin_banat: form.banin_banat || null,
        muallim_quran: form.muallim_quran || null,
        waktu_muallim: form.waktu_muallim || null,
        ngaji_kitab: form.ngaji_kitab || null,
        waktu_ngaji: form.waktu_ngaji || null,
        imam: form.imam || null,
        ket_imam: form.ket_imam || null,
        tugas_selanjutnya: (form.tugas_selanjutnya || '').trim() || null,
        usulan: (form.usulan || '').trim() || null,
        masalah_list: buildMasalahListPayload(masalahItems),
      }
      const res = isEdit
        ? await laporanGtMybeddianAPI.update(initialData.id, payload)
        : await laporanGtMybeddianAPI.create(payload)
      if (res?.success) {
        onNotify?.(res.message || 'Tersimpan', 'success')
        onSuccess?.()
        handleClose()
      } else {
        onNotify?.(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch (err) {
      onNotify?.(err?.response?.data?.message || err?.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!isEdit || !initialData?.id) return
    if (!window.confirm('Hapus laporan GT ini? Tindakan tidak dapat dibatalkan.')) return
    setDeleting(true)
    try {
      const res = await laporanGtMybeddianAPI.remove(initialData.id)
      if (res?.success) {
        onNotify?.(res.message || 'Terhapus', 'success')
        onSuccess?.()
        handleClose()
      } else {
        onNotify?.(res?.message || 'Gagal menghapus', 'error')
      }
    } catch (err) {
      onNotify?.(err?.response?.data?.message || err?.message || 'Gagal menghapus', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const taLabel = (form.id_tahun_ajaran || tahunAjaranAktif || '').trim() || '—'
  const bulanLabel =
    form.bulan >= 1 && form.bulan <= 12 ? `${form.bulan} — ${getBulanName(form.bulan)}` : '—'

  if (readOnly && isEdit) {
    return (
      <LaporanReadonlyOffcanvas
        isOpen={isOpen}
        onClose={onClose}
        initialData={initialData}
        jenis="gt"
        detailLoading={detailLoading}
      />
    )
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="lap-gt-santri-oc"
          className="fixed inset-0 z-9998"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div className="absolute inset-0 bg-black/50" onClick={handleClose} aria-hidden="true" />
          <motion.div
            className="absolute top-0 right-0 bottom-0 w-full max-w-xl bg-white dark:bg-gray-800 shadow-xl z-9999 flex flex-col"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
          >
            <motion.div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <button type="button" onClick={handleClose} className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Kembali">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex-1">
                {isEdit ? 'Edit Laporan GT' : 'Tambah Laporan GT'}
              </h3>
              <button type="button" onClick={handleClose} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Tutup">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </motion.div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              {detailLoading ? (
                <div className="flex-1 flex items-center justify-center p-8 text-sm text-gray-500">Memuat laporan…</div>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Madrasah</label>
                      {!isEdit && penugasanList.length > 1 ? (
                        <select value={form.id_madrasah} onChange={handleMadrasahPick} required className={selectCls}>
                          <option value="">— Pilih madrasah penugasan —</option>
                          {penugasanList.map((p) => (
                            <option key={p.id_madrasah} value={String(p.id_madrasah)}>
                              {p.madrasah_nama || `ID ${p.id_madrasah}`}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className={readOnlyCls}>
                          {konteksLoading && !madrasahNama ? 'Memuat…' : madrasahNama || initialData?.madrasah_nama || '—'}
                        </div>
                      )}
                      {!isEdit ? (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Diisi otomatis dari penugasan guru tugas aktif tahun ajaran {taLabel}.
                        </p>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tahun ajaran</label>
                        <div className={readOnlyCls}>{taLabel}</div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bulan (Hijriyah)</label>
                        {!isEdit && konteksLoading ? (
                          <div className={`${readOnlyCls} animate-pulse text-gray-400`}>Memuat…</div>
                        ) : isEdit ? (
                          <select
                            value={form.bulan}
                            onChange={(e) => setForm((p) => ({ ...p, bulan: Number(e.target.value) }))}
                            className={selectCls}
                          >
                            {Array.from({ length: 12 }, (_, i) => {
                              const n = i + 1
                              return (
                                <option key={n} value={n}>
                                  {n} — {getBulanName(n)}
                                </option>
                              )
                            })}
                          </select>
                        ) : (
                          <div className={readOnlyCls}>{bulanLabel}</div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Wali kelas</label>
                        <input type="text" value={form.wali_kelas} onChange={(e) => setForm((p) => ({ ...p, wali_kelas: e.target.value }))} className={selectCls} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fan kelas</label>
                        <input type="text" value={form.fan_kelas} onChange={(e) => setForm((p) => ({ ...p, fan_kelas: e.target.value }))} className={selectCls} />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: 'pulang', label: 'Tidak masuk' },
                        { key: 'sakit', label: 'Sakit' },
                        { key: 'udzur', label: 'Udzur' },
                      ].map(({ key, label }) => (
                        <div key={key}>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
                          <input
                            type="number"
                            min={0}
                            value={form[key]}
                            onChange={(e) =>
                              setForm((p) => ({ ...p, [key]: Math.max(0, parseInt(e.target.value, 10) || 0) }))
                            }
                            className={selectCls}
                          />
                        </div>
                      ))}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Banin / Banat</label>
                      <select value={form.banin_banat} onChange={(e) => setForm((p) => ({ ...p, banin_banat: e.target.value }))} className={selectCls}>
                        {BANIN_BANAT.map((o) => (
                          <option key={o.value || 'e'} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Muallim Quran</label>
                        <select value={form.muallim_quran} onChange={(e) => setForm((p) => ({ ...p, muallim_quran: e.target.value }))} className={selectCls}>
                          {IYA_TIDAK.map((o) => (
                            <option key={`mq-${o.value || 'x'}`} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Waktu muallim</label>
                        <select value={form.waktu_muallim} onChange={(e) => setForm((p) => ({ ...p, waktu_muallim: e.target.value }))} className={selectCls}>
                          {WAKTU.map((o) => (
                            <option key={`wm-${o.value || 'x'}`} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ngaji kitab</label>
                        <select value={form.ngaji_kitab} onChange={(e) => setForm((p) => ({ ...p, ngaji_kitab: e.target.value }))} className={selectCls}>
                          {IYA_TIDAK.map((o) => (
                            <option key={`nk-${o.value || 'x'}`} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Waktu ngaji</label>
                        <select value={form.waktu_ngaji} onChange={(e) => setForm((p) => ({ ...p, waktu_ngaji: e.target.value }))} className={selectCls}>
                          {WAKTU.map((o) => (
                            <option key={`wn-${o.value || 'x'}`} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Imam</label>
                        <select value={form.imam} onChange={(e) => setForm((p) => ({ ...p, imam: e.target.value }))} className={selectCls}>
                          {IYA_TIDAK.map((o) => (
                            <option key={`im-${o.value || 'x'}`} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ket. imam</label>
                        <select value={form.ket_imam} onChange={(e) => setForm((p) => ({ ...p, ket_imam: e.target.value }))} className={selectCls}>
                          {KET_IMAM.map((o) => (
                            <option key={`ki-${o.value || 'x'}`} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tugas selanjutnya</label>
                      <textarea value={form.tugas_selanjutnya} onChange={(e) => setForm((p) => ({ ...p, tugas_selanjutnya: e.target.value }))} rows={3} className={selectCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Usulan</label>
                      <textarea value={form.usulan} onChange={(e) => setForm((p) => ({ ...p, usulan: e.target.value }))} rows={3} className={selectCls} />
                    </div>

                    <UgtLaporanMasalahFields items={masalahItems} onChange={setMasalahItems} />
                  </div>

                  <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col gap-2 shrink-0">
                    <div className="flex gap-2">
                      <button type="button" onClick={handleClose} className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300">
                        Batal
                      </button>
                      <button type="submit" disabled={saving || deleting} className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium rounded-lg">
                        {saving ? 'Menyimpan...' : 'Simpan'}
                      </button>
                    </div>
                    {isEdit ? (
                      <button type="button" onClick={handleDelete} disabled={saving || deleting} className="w-full px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm disabled:opacity-50">
                        {deleting ? 'Menghapus...' : 'Hapus laporan'}
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
