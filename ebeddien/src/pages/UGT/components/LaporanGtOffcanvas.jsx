import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ugtLaporanGtAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import { getBulanName } from '../../Kalender/utils/bulanHijri'

const BANIN_BANAT = [
  { value: '', label: '—' },
  { value: 'Banin', label: 'Banin' },
  { value: 'Banat', label: 'Banat' },
  { value: 'Campur', label: 'Campur' }
]
const IYA_TIDAK = [
  { value: '', label: '—' },
  { value: 'Iya', label: 'Iya' },
  { value: 'Tidak', label: 'Tidak' }
]
const WAKTU = [
  { value: '', label: '—' },
  { value: 'pagi', label: 'Pagi' },
  { value: 'siang', label: 'Siang' },
  { value: 'malam', label: 'Malam' }
]
const KET_IMAM = [
  { value: '', label: '—' },
  { value: 'masjid', label: 'Masjid' },
  { value: 'surau', label: 'Surau' }
]

function emptyForm(defaultTa) {
  return {
    id_madrasah: '',
    id_santri: '',
    santriSearch: '',
    santriLabel: '',
    id_tahun_ajaran: defaultTa || '',
    bulan: 1,
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
    usulan: ''
  }
}

function rowToForm(row) {
  return {
    id_madrasah: String(row.id_madrasah ?? ''),
    id_santri: String(row.id_santri ?? ''),
    santriSearch: '',
    santriLabel: [row.santri_nama, row.santri_nis].filter(Boolean).join(' — ') || `ID ${row.id_santri}`,
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
    usulan: row.usulan ?? ''
  }
}

function emptyMasalahRow() {
  return { masalah: '', solusi: '', saran: '' }
}

function mapApiMasalahToItems(list) {
  if (!Array.isArray(list) || list.length === 0) return [emptyMasalahRow()]
  return list.map((x) => ({
    masalah: x.masalah ?? '',
    solusi: x.solusi ?? '',
    saran: x.saran ?? ''
  }))
}

export default function LaporanGtOffcanvas({
  isOpen,
  onClose,
  initialData,
  madrasahList,
  onSuccess
}) {
  const { showNotification } = useNotification()
  const tahunAjaranGlobal = useTahunAjaranStore((s) => s.tahunAjaran)
  const taOptions = useTahunAjaranStore((s) => s.options)
  const handleClose = useOffcanvasBackClose(isOpen, onClose, { urlManaged: true })

  const [form, setForm] = useState(() => emptyForm(tahunAjaranGlobal))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [santriOptions, setSantriOptions] = useState([])
  const [santriOpen, setSantriOpen] = useState(false)
  const [santriLoading, setSantriLoading] = useState(false)
  const searchTimerRef = useRef(null)
  const [masalahItems, setMasalahItems] = useState(() => [emptyMasalahRow()])

  const isEdit = Boolean(initialData?.id)

  useEffect(() => {
    if (!isOpen) return
    if (initialData?.id) {
      setForm(rowToForm(initialData))
    } else {
      setForm(emptyForm(tahunAjaranGlobal))
    }
    setSantriOptions([])
    setSantriOpen(false)
  }, [isOpen, initialData?.id, tahunAjaranGlobal])

  useEffect(() => {
    if (!isOpen) return
    if (!initialData?.id) {
      setMasalahItems([emptyMasalahRow()])
      return
    }
    if (Array.isArray(initialData.masalah)) {
      setMasalahItems(mapApiMasalahToItems(initialData.masalah))
      return
    }
    let cancelled = false
    ugtLaporanGtAPI.getById(initialData.id)
      .then((res) => {
        if (cancelled || !res?.success || !res.data) return
        setMasalahItems(mapApiMasalahToItems(res.data.masalah))
      })
      .catch(() => {
        if (!cancelled) setMasalahItems([emptyMasalahRow()])
      })
    return () => { cancelled = true }
  }, [isOpen, initialData?.id, initialData?.masalah])

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
  }, [isOpen])

  useEffect(() => {
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const fetchSantri = useCallback((q) => {
    setSantriLoading(true)
    ugtLaporanGtAPI.getSantriOptions({ search: q, limit: 50 })
      .then((res) => {
        if (res?.success && Array.isArray(res.data)) setSantriOptions(res.data)
        else setSantriOptions([])
      })
      .catch(() => setSantriOptions([]))
      .finally(() => setSantriLoading(false))
  }, [])

  const onSantriSearchChange = (value) => {
    setForm((prev) => ({ ...prev, santriSearch: value, santriLabel: value ? prev.santriLabel : '' }))
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if ((value || '').trim().length < 1) {
      setSantriOptions([])
      return
    }
    searchTimerRef.current = setTimeout(() => fetchSantri(value.trim()), 300)
  }

  const pickSantri = (s) => {
    setForm((prev) => ({
      ...prev,
      id_santri: String(s.id),
      santriLabel: `${s.nama || ''}${s.nis ? ` — NIS ${s.nis}` : ''}`.trim(),
      santriSearch: ''
    }))
    setSantriOpen(false)
    setSantriOptions([])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const idM = parseInt(form.id_madrasah, 10)
    const idS = parseInt(form.id_santri, 10)
    const ta = (form.id_tahun_ajaran || '').trim()
    const bulan = Number(form.bulan)
    if (!idM || !idS || !ta || bulan < 1 || bulan > 12) {
      showNotification('Lengkapi madrasah, santri, tahun ajaran, dan bulan (1–12).', 'error')
      return
    }
    setSaving(true)
    try {
      const masalah_list = masalahItems
        .map((x) => ({
          masalah: (x.masalah || '').trim(),
          solusi: (x.solusi || '').trim(),
          saran: (x.saran || '').trim()
        }))
        .filter((x) => x.masalah || x.solusi || x.saran)

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
        masalah_list
      }
      let res
      if (isEdit) {
        res = await ugtLaporanGtAPI.update(initialData.id, payload)
      } else {
        res = await ugtLaporanGtAPI.create(payload)
      }
      if (res?.success) {
        showNotification(res.message || 'Tersimpan', 'success')
        onSuccess?.()
        handleClose()
      } else {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || err?.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!isEdit || !initialData?.id) return
    if (!window.confirm('Hapus laporan GT ini? Tindakan tidak dapat dibatalkan.')) return
    setDeleting(true)
    try {
      const res = await ugtLaporanGtAPI.remove(initialData.id)
      if (res?.success) {
        showNotification(res.message || 'Terhapus', 'success')
        onSuccess?.()
        handleClose()
      } else {
        showNotification(res?.message || 'Gagal menghapus', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || err?.message || 'Gagal menghapus', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const bulanOptions = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1
    return { value: n, label: `${n} — ${getBulanName(n, 'hijriyah')}` }
  })

  const selectCls = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm'

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="lap-gt-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed inset-0 bg-black/50 z-[9998]"
            onClick={handleClose}
            aria-hidden="true"
          />
          <motion.div
            key="lap-gt-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-2xl bg-white dark:bg-gray-800 shadow-xl z-[9999] flex flex-col"
          >
            <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <button
                type="button"
                onClick={handleClose}
                className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Kembali"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex-1">
                {isEdit ? 'Edit Laporan GT' : 'Tambah Laporan GT'}
              </h3>
              <button
                type="button"
                onClick={handleClose}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {isEdit && (initialData?.pembuat_nama || initialData?.id_pembuat) ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">
                    Dibuat oleh:{' '}
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {(initialData.pembuat_nama || '').trim() || `Pengurus #${initialData.id_pembuat}`}
                    </span>
                  </p>
                ) : null}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Madrasah</label>
                  <select
                    value={form.id_madrasah}
                    onChange={(e) => setForm((p) => ({ ...p, id_madrasah: e.target.value }))}
                    required
                    className={selectCls}
                  >
                    <option value="">— Pilih madrasah —</option>
                    {(madrasahList || []).map((m) => (
                      <option key={m.id} value={String(m.id)}>{m.nama || `ID ${m.id}`}</option>
                    ))}
                  </select>
                </div>

                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Santri</label>
                  {form.id_santri ? (
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-900/40">
                        {form.santriLabel || `ID ${form.id_santri}`}
                      </span>
                      <button
                        type="button"
                        className="text-sm text-teal-600 dark:text-teal-400 shrink-0"
                        onClick={() => setForm((p) => ({ ...p, id_santri: '', santriLabel: '', santriSearch: '' }))}
                      >
                        Ubah
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={form.santriSearch}
                        onChange={(e) => onSantriSearchChange(e.target.value)}
                        onFocus={() => setSantriOpen(true)}
                        placeholder="Cari nama atau NIS..."
                        className={selectCls}
                        autoComplete="off"
                      />
                      {santriOpen && (form.santriSearch.trim().length > 0 || santriOptions.length > 0) && (
                        <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg z-10">
                          {santriLoading && <div className="px-3 py-2 text-xs text-gray-500">Mencari...</div>}
                          {!santriLoading && santriOptions.length === 0 && form.santriSearch.trim().length > 0 && (
                            <div className="px-3 py-2 text-xs text-gray-500">Tidak ada hasil</div>
                          )}
                          {santriOptions.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
                              onClick={() => pickSantri(s)}
                            >
                              {s.nama || '—'} {s.nis != null && s.nis !== '' ? <span className="text-gray-500">(NIS {s.nis})</span> : null}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tahun ajaran (Hijriyah)</label>
                    <select
                      value={form.id_tahun_ajaran}
                      onChange={(e) => setForm((p) => ({ ...p, id_tahun_ajaran: e.target.value }))}
                      required
                      className={selectCls}
                    >
                      <option value="">— Pilih —</option>
                      {taOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bulan (Hijriyah)</label>
                    <select
                      value={form.bulan}
                      onChange={(e) => setForm((p) => ({ ...p, bulan: Number(e.target.value) }))}
                      required
                      className={selectCls}
                    >
                      {bulanOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Wali kelas (kelas & tingkatan)</label>
                    <input
                      type="text"
                      value={form.wali_kelas}
                      onChange={(e) => setForm((p) => ({ ...p, wali_kelas: e.target.value }))}
                      className={selectCls}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fan kelas</label>
                    <input
                      type="text"
                      value={form.fan_kelas}
                      onChange={(e) => setForm((p) => ({ ...p, fan_kelas: e.target.value }))}
                      className={selectCls}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'pulang', label: 'Tidak masuk (pulang)' },
                    { key: 'sakit', label: 'Sakit' },
                    { key: 'udzur', label: 'Udzur' }
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
                      <input
                        type="number"
                        min={0}
                        value={form[key]}
                        onChange={(e) => setForm((p) => ({ ...p, [key]: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                        className={selectCls}
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Banin / Banat</label>
                  <select
                    value={form.banin_banat}
                    onChange={(e) => setForm((p) => ({ ...p, banin_banat: e.target.value }))}
                    className={selectCls}
                  >
                    {BANIN_BANAT.map((o) => (
                      <option key={o.value || 'empty'} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Muallim Quran</label>
                    <select
                      value={form.muallim_quran}
                      onChange={(e) => setForm((p) => ({ ...p, muallim_quran: e.target.value }))}
                      className={selectCls}
                    >
                      {IYA_TIDAK.map((o) => (
                        <option key={`mq-${o.value || 'e'}`} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Waktu muallim</label>
                    <select
                      value={form.waktu_muallim}
                      onChange={(e) => setForm((p) => ({ ...p, waktu_muallim: e.target.value }))}
                      className={selectCls}
                    >
                      {WAKTU.map((o) => (
                        <option key={`wm-${o.value || 'e'}`} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ngaji kitab</label>
                    <select
                      value={form.ngaji_kitab}
                      onChange={(e) => setForm((p) => ({ ...p, ngaji_kitab: e.target.value }))}
                      className={selectCls}
                    >
                      {IYA_TIDAK.map((o) => (
                        <option key={`nk-${o.value || 'e'}`} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Waktu ngaji</label>
                    <select
                      value={form.waktu_ngaji}
                      onChange={(e) => setForm((p) => ({ ...p, waktu_ngaji: e.target.value }))}
                      className={selectCls}
                    >
                      {WAKTU.map((o) => (
                        <option key={`wn-${o.value || 'e'}`} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Imam</label>
                    <select
                      value={form.imam}
                      onChange={(e) => setForm((p) => ({ ...p, imam: e.target.value }))}
                      className={selectCls}
                    >
                      {IYA_TIDAK.map((o) => (
                        <option key={`im-${o.value || 'e'}`} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ket. imam</label>
                    <select
                      value={form.ket_imam}
                      onChange={(e) => setForm((p) => ({ ...p, ket_imam: e.target.value }))}
                      className={selectCls}
                    >
                      {KET_IMAM.map((o) => (
                        <option key={`ki-${o.value || 'e'}`} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tugas selanjutnya</label>
                  <textarea
                    value={form.tugas_selanjutnya}
                    onChange={(e) => setForm((p) => ({ ...p, tugas_selanjutnya: e.target.value }))}
                    rows={3}
                    className={selectCls}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Usulan</label>
                  <textarea
                    value={form.usulan}
                    onChange={(e) => setForm((p) => ({ ...p, usulan: e.target.value }))}
                    rows={3}
                    className={selectCls}
                  />
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Masalah</label>
                    <button
                      type="button"
                      onClick={() => setMasalahItems((prev) => [...prev, emptyMasalahRow()])}
                      className="text-sm text-teal-600 dark:text-teal-400 font-medium hover:underline"
                    >
                      + Tambah masalah
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Ikut tersimpan bersama laporan; bisa lebih dari satu entri.
                  </p>
                  {masalahItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-gray-200 dark:border-gray-600 p-3 space-y-2 bg-gray-50/50 dark:bg-gray-900/20"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">#{idx + 1}</span>
                        {masalahItems.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => setMasalahItems((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-xs text-red-600 dark:text-red-400 hover:underline"
                          >
                            Hapus
                          </button>
                        ) : null}
                      </div>
                      <textarea
                        value={item.masalah}
                        onChange={(e) => setMasalahItems((prev) => {
                          const next = [...prev]
                          next[idx] = { ...next[idx], masalah: e.target.value }
                          return next
                        })}
                        rows={2}
                        placeholder="Masalah yang ditemukan"
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                      />
                      <textarea
                        value={item.solusi}
                        onChange={(e) => setMasalahItems((prev) => {
                          const next = [...prev]
                          next[idx] = { ...next[idx], solusi: e.target.value }
                          return next
                        })}
                        rows={2}
                        placeholder="Solusi yang sudah dilakukan"
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                      />
                      <textarea
                        value={item.saran}
                        onChange={(e) => setMasalahItems((prev) => {
                          const next = [...prev]
                          next[idx] = { ...next[idx], saran: e.target.value }
                          return next
                        })}
                        rows={2}
                        placeholder="Saran tindak lanjut bagi pengurus UGB"
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col gap-2 flex-shrink-0">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving || deleting}
                    className="flex-1 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
                  >
                    {saving ? 'Menyimpan...' : 'Simpan'}
                  </button>
                </div>
                {isEdit && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving || deleting}
                    className="w-full px-4 py-2 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                  >
                    {deleting ? 'Menghapus...' : 'Hapus laporan'}
                  </button>
                )}
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
