import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { laporanPjgtMybeddianAPI } from '../../services/api'
import { hydratePjgtStore, syncPjgtGtRiwayat, syncPjgtKonteks } from '../../services/pjgtDataService'
import { usePjgtDataStore } from '../../store/pjgtDataStore'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import { getBulanName } from '../../utils/bulanHijriLatin'
import { UGT_LAPORAN_BULAN_PJGT_GT } from '../../utils/ugtLaporanBulanAllowed'
import { formatSantriGtLabel, uniqueSantriGtAktifUntukTa } from '../../utils/pjgtGuruTugasPenugasan'
import LaporanReadonlyOffcanvas from '../../components/ugt/LaporanReadonlyOffcanvas'

const RATING_OPTS = [
  { value: '', label: '—' },
  { value: 'Baik', label: 'Baik' },
  { value: 'Cukup', label: 'Cukup' },
  { value: 'Kurang', label: 'Kurang' },
]

function emptyForm(defaultTa, idMadrasah) {
  return {
    id_madrasah: idMadrasah ? String(idMadrasah) : '',
    id_santri: '',
    santriSearch: '',
    santriLabel: '',
    id_tahun_ajaran: '',
    bulan: 0,
    ubudiyah: '',
    murid: '',
    wali_murid: '',
    nilai_hub_pjgt: '',
    kepala: '',
    guru: '',
    masyarakat: '',
    usulan: '',
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
    ubudiyah: row.ubudiyah ?? '',
    murid: row.murid ?? '',
    wali_murid: row.wali_murid ?? '',
    nilai_hub_pjgt: row.pjgt ?? '',
    kepala: row.kepala ?? '',
    guru: row.guru ?? '',
    masyarakat: row.masyarakat ?? '',
    usulan: row.usulan ?? '',
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
    saran: x.saran ?? '',
  }))
}

function RatingSelect({ label, value, onChange, selectCls }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
        {RATING_OPTS.map((o) => (
          <option key={`${label}-${o.value || 'x'}`} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

export default function LaporanPjgtOffcanvas({
  isOpen,
  onClose,
  detailLoading = false,
  initialData,
  madrasahId,
  madrasahNama,
  tahunAjaranAktif = '',
  readOnly = false,
  onSuccess,
  onNotify,
}) {
  const handleClose = useOffcanvasBackClose(isOpen, onClose, { urlManaged: true })

  const [form, setForm] = useState(() => emptyForm('', madrasahId))
  const [konteksLoading, setKonteksLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [santriOptions, setSantriOptions] = useState([])
  const [santriOpen, setSantriOpen] = useState(false)
  const [santriLoading, setSantriLoading] = useState(false)
  const [gtSantriCandidates, setGtSantriCandidates] = useState([])
  const [gtSantriLoading, setGtSantriLoading] = useState(false)
  const [santriPickManual, setSantriPickManual] = useState(false)
  const searchTimerRef = useRef(null)
  const [masalahItems, setMasalahItems] = useState(() => [emptyMasalahRow()])

  const konteksCached = usePjgtDataStore((s) => s.konteks)
  const gtRowsCached = usePjgtDataStore((s) => s.gtRiwayat)
  const gtCached = usePjgtDataStore((s) => s.gtCached)

  const isEdit = Boolean(initialData?.id)

  const applyKonteksToForm = useCallback((data) => {
    if (!data) return
    const { id_tahun_ajaran: ta, bulan_hijriyah: bh } = data
    setForm((prev) => ({
      ...prev,
      id_tahun_ajaran: ta != null && String(ta).trim() !== '' ? String(ta).trim() : '',
      bulan:
        bh != null && Number.isFinite(Number(bh)) && Number(bh) >= 1 && Number(bh) <= 12
          ? Number(bh)
          : 0,
    }))
  }, [])

  const namaMadrasahTampil = (
    (initialData?.madrasah_nama != null && String(initialData.madrasah_nama).trim()) ||
    (madrasahNama != null && String(madrasahNama).trim()) ||
    ''
  )

  useEffect(() => {
    if (!isOpen) return
    if (initialData?.id) {
      setForm(rowToForm(initialData))
    } else if (!detailLoading) {
      setForm(emptyForm('', madrasahId))
      setMasalahItems([emptyMasalahRow()])
    }
    setSantriOptions([])
    setSantriOpen(false)
    setGtSantriCandidates([])
    setGtSantriLoading(false)
    setSantriPickManual(false)
  }, [isOpen, initialData?.id, madrasahId, detailLoading])

  useEffect(() => {
    if (!isOpen || !initialData?.id) return
    if (Array.isArray(initialData.masalah)) {
      setMasalahItems(
        initialData.masalah.length > 0 ? mapApiMasalahToItems(initialData.masalah) : [emptyMasalahRow()]
      )
    }
  }, [isOpen, initialData?.id, initialData?.masalah])

  useEffect(() => {
    if (!isOpen || initialData?.id || !madrasahId) return
    let cancelled = false
    hydratePjgtStore(madrasahId)

    const finishKonteks = (data, warnings) => {
      if (cancelled) return
      if (!data) {
        onNotify?.('Gagal memuat tahun ajaran dan bulan otomatis.', 'error')
        return
      }
      applyKonteksToForm(data)
      const warns = Array.isArray(warnings) ? warnings.filter(Boolean) : []
      if (warns.length) onNotify?.(warns.join(' '), 'warning')
    }

    if (konteksCached) {
      applyKonteksToForm(konteksCached)
      setKonteksLoading(false)
      void syncPjgtKonteks(madrasahId, { background: true }).then((data) => {
        if (data) finishKonteks(data, usePjgtDataStore.getState().konteksWarnings)
      })
      return () => {
        cancelled = true
      }
    }

    setKonteksLoading(true)
    void syncPjgtKonteks(madrasahId, { background: false })
      .then((data) => finishKonteks(data, usePjgtDataStore.getState().konteksWarnings))
      .catch(() => {
        if (!cancelled) onNotify?.('Gagal memuat tahun ajaran dan bulan otomatis.', 'error')
      })
      .finally(() => {
        if (!cancelled) setKonteksLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, initialData?.id, madrasahId, konteksCached, applyKonteksToForm, onNotify])

  const pickSantri = useCallback((s) => {
    if (!s?.id) return
    setForm((prev) => ({
      ...prev,
      id_santri: String(s.id),
      santriLabel: formatSantriGtLabel(s),
      santriSearch: '',
    }))
    setSantriPickManual(false)
    setSantriOpen(false)
    setSantriOptions([])
  }, [])

  useEffect(() => {
    if (!isOpen || isEdit || !madrasahId) {
      setGtSantriCandidates([])
      setGtSantriLoading(false)
      return
    }
    const ta = (tahunAjaranAktif || form.id_tahun_ajaran || '').trim()
    if (!ta || konteksLoading) return

    const applyGtRows = (rows) => {
      const list = uniqueSantriGtAktifUntukTa(rows, ta)
      setGtSantriCandidates(list)
      if (list.length === 1 && !santriPickManual) pickSantri(list[0])
    }

    let cancelled = false
    hydratePjgtStore(madrasahId)

    if (gtCached) {
      applyGtRows(gtRowsCached)
      setGtSantriLoading(false)
      void syncPjgtGtRiwayat(madrasahId, { background: true }).then((rows) => {
        if (!cancelled && Array.isArray(rows)) applyGtRows(rows)
      })
      return () => {
        cancelled = true
      }
    }

    setGtSantriLoading(true)
    void syncPjgtGtRiwayat(madrasahId, { background: false })
      .then((rows) => {
        if (!cancelled) applyGtRows(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancelled) setGtSantriCandidates([])
      })
      .finally(() => {
        if (!cancelled) setGtSantriLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    isOpen,
    isEdit,
    madrasahId,
    tahunAjaranAktif,
    form.id_tahun_ajaran,
    konteksLoading,
    santriPickManual,
    pickSantri,
    gtCached,
    gtRowsCached,
  ])

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
    laporanPjgtMybeddianAPI.getSantriOptions({ search: q, limit: 50 })
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    const idM = parseInt(form.id_madrasah, 10)
    const idS = parseInt(form.id_santri, 10)
    const ta = (form.id_tahun_ajaran || '').trim()
    const bulan = Number(form.bulan)
    if (!idM || !idS || !ta || bulan < 1 || bulan > 12) {
      onNotify?.('Lengkapi madrasah, santri, tahun ajaran, dan bulan (1–12).', 'error')
      return
    }
    if (!UGT_LAPORAN_BULAN_PJGT_GT.includes(bulan)) {
      onNotify?.(
        "Bulan laporan PJGT hanya: Dzulhijjah, Safar, Rabi'ul Akhir, Jumadil Akhir, dan Sya'ban.",
        'error'
      )
      return
    }
    setSaving(true)
    try {
      const masalah_list = masalahItems
        .map((x) => ({
          masalah: (x.masalah || '').trim(),
          solusi: (x.solusi || '').trim(),
          saran: (x.saran || '').trim(),
        }))
        .filter((x) => x.masalah || x.solusi || x.saran)

      const payload = {
        id_madrasah: idM,
        id_santri: idS,
        id_tahun_ajaran: ta,
        bulan,
        ubudiyah: form.ubudiyah || null,
        murid: form.murid || null,
        wali_murid: form.wali_murid || null,
        pjgt: form.nilai_hub_pjgt || null,
        kepala: form.kepala || null,
        guru: form.guru || null,
        masyarakat: form.masyarakat || null,
        usulan: (form.usulan || '').trim() || null,
        masalah_list,
      }
      let res
      if (isEdit) {
        res = await laporanPjgtMybeddianAPI.update(initialData.id, payload)
      } else {
        res = await laporanPjgtMybeddianAPI.create(payload)
      }
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

  const taLabelTampil =
    (form.id_tahun_ajaran && String(form.id_tahun_ajaran).trim()) ||
    (tahunAjaranAktif && String(tahunAjaranAktif).trim()) ||
    '—'

  const selectCls = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm'
  const readOnlyCls = `${selectCls} bg-gray-50 dark:bg-gray-900/40 cursor-not-allowed`

  if (readOnly && isEdit) {
    return (
      <LaporanReadonlyOffcanvas
        isOpen={isOpen}
        onClose={onClose}
        initialData={initialData}
        jenis="pjgt"
        detailLoading={detailLoading}
      />
    )
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="lap-pjgt-oc"
          className="fixed inset-0 z-9998"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: 'tween', duration: 0.25 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/50"
            onClick={handleClose}
            aria-hidden="true"
          />
          <motion.div
            className="absolute top-0 right-0 bottom-0 w-full max-w-xl bg-white dark:bg-gray-800 shadow-xl z-9999 flex flex-col"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
          >
            <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
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
                {isEdit ? 'Edit Laporan PJGT' : 'Tambah Laporan PJGT'}
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
              {detailLoading ? (
                <div className="flex-1 flex items-center justify-center p-8 text-sm text-gray-500 dark:text-gray-400">
                  Memuat laporan…
                </div>
              ) : (
              <>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nama madrasah</label>
                  <div className={`${selectCls} bg-gray-50 dark:bg-gray-900/40 text-gray-800 dark:text-gray-200 font-medium`}>
                    {namaMadrasahTampil || '—'}
                  </div>
                  {madrasahId > 0 ? (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      ID madrasah: {madrasahId}
                    </p>
                  ) : null}
                  <input type="hidden" name="id_madrasah" value={form.id_madrasah} />
                </div>

                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Santri (Guru Tugas)</label>
                  {!isEdit && (tahunAjaranAktif || form.id_tahun_ajaran) ? (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5">
                      Daftar pilihan: guru tugas dengan penugasan{' '}
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">aktif</span> untuk tahun ajaran{' '}
                      <span className="font-medium">{tahunAjaranAktif || form.id_tahun_ajaran}</span>.
                    </p>
                  ) : null}
                  {!isEdit && gtSantriLoading ? (
                    <div className={`${readOnlyCls} animate-pulse text-gray-400`}>Memuat penugasan guru tugas…</div>
                  ) : isEdit && form.id_santri ? (
                    <div className={readOnlyCls}>{form.santriLabel || `ID ${form.id_santri}`}</div>
                  ) : !isEdit &&
                    ((gtSantriCandidates.length >= 2 && (!form.id_santri || santriPickManual)) ||
                      (gtSantriCandidates.length === 1 && santriPickManual && !form.id_santri)) ? (
                    <>
                      <select
                        value={form.id_santri || ''}
                        onChange={(e) => {
                          const s = gtSantriCandidates.find((x) => String(x.id) === e.target.value)
                          if (s) pickSantri(s)
                        }}
                        className={selectCls}
                      >
                        <option value="">— Pilih guru tugas —</option>
                        {gtSantriCandidates.map((s) => (
                          <option key={s.id} value={String(s.id)}>
                            {formatSantriGtLabel(s)}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {gtSantriCandidates.length} guru tugas aktif untuk tahun ajaran{' '}
                        {tahunAjaranAktif || form.id_tahun_ajaran || '—'}.
                      </p>
                    </>
                  ) : !isEdit && gtSantriCandidates.length === 1 && form.id_santri && !santriPickManual ? (
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-900/40">
                        {form.santriLabel || formatSantriGtLabel(gtSantriCandidates[0])}
                      </span>
                      <button
                        type="button"
                        className="text-sm text-primary-600 dark:text-primary-400 shrink-0"
                        onClick={() => {
                          setSantriPickManual(true)
                          setForm((p) => ({ ...p, id_santri: '', santriLabel: '', santriSearch: '' }))
                        }}
                      >
                        Ubah
                      </button>
                    </div>
                  ) : form.id_santri && !santriPickManual ? (
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-900/40">
                        {form.santriLabel || `ID ${form.id_santri}`}
                      </span>
                      <button
                        type="button"
                        className="text-sm text-primary-600 dark:text-primary-400 shrink-0"
                        onClick={() => {
                          setSantriPickManual(true)
                          setForm((p) => ({ ...p, id_santri: '', santriLabel: '', santriSearch: '' }))
                        }}
                      >
                        Ubah
                      </button>
                    </div>
                  ) : (
                    <>
                      {!isEdit && gtSantriCandidates.length === 0 && !gtSantriLoading ? (
                        <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                          Belum ada penugasan guru tugas{' '}
                          <span className="font-medium">aktif</span> untuk tahun ajaran{' '}
                          {tahunAjaranAktif || form.id_tahun_ajaran || 'ini'}. Cari santri manual di bawah bila perlu.
                        </p>
                      ) : null}
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
                    {!isEdit && konteksLoading ? (
                      <div className={`${readOnlyCls} animate-pulse text-gray-400`}>Memuat dari database…</div>
                    ) : (
                      <div className={readOnlyCls} title="Diisi otomatis dari rentang tanggal master tahun ajaran">
                        {taLabelTampil}
                      </div>
                    )}
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Mengikuti tanggal hari ini dan rentang &quot;dari–sampai&quot; pada master tahun ajaran hijriyah.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bulan (Hijriyah)</label>
                    {!isEdit && konteksLoading ? (
                      <div className={`${readOnlyCls} animate-pulse text-gray-400`}>Memuat dari database…</div>
                    ) : (
                      <div className={readOnlyCls} title="Diisi otomatis dari kalender penanggalan">
                        {form.bulan >= 1 && form.bulan <= 12
                          ? `${form.bulan} — ${getBulanName(form.bulan)}`
                          : '—'}
                      </div>
                    )}
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Bulan Hijriyah saat ini menurut data kalender di server.
                    </p>
                  </div>
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400">Nilai hubungan: Baik / Cukup / Kurang</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <RatingSelect label="Ubudiyah" value={form.ubudiyah} onChange={(v) => setForm((p) => ({ ...p, ubudiyah: v }))} selectCls={selectCls} />
                  <RatingSelect label="Murid" value={form.murid} onChange={(v) => setForm((p) => ({ ...p, murid: v }))} selectCls={selectCls} />
                  <RatingSelect label="Wali murid" value={form.wali_murid} onChange={(v) => setForm((p) => ({ ...p, wali_murid: v }))} selectCls={selectCls} />
                  <RatingSelect label="PJGT" value={form.nilai_hub_pjgt} onChange={(v) => setForm((p) => ({ ...p, nilai_hub_pjgt: v }))} selectCls={selectCls} />
                  <RatingSelect label="Kepala" value={form.kepala} onChange={(v) => setForm((p) => ({ ...p, kepala: v }))} selectCls={selectCls} />
                  <RatingSelect label="Guru" value={form.guru} onChange={(v) => setForm((p) => ({ ...p, guru: v }))} selectCls={selectCls} />
                  <RatingSelect label="Masyarakat" value={form.masyarakat} onChange={(v) => setForm((p) => ({ ...p, masyarakat: v }))} selectCls={selectCls} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Usulan</label>
                  <textarea
                    value={form.usulan}
                    onChange={(e) => setForm((p) => ({ ...p, usulan: e.target.value }))}
                    rows={4}
                    className={selectCls}
                  />
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Masalah</label>
                    <button
                      type="button"
                      onClick={() => setMasalahItems((prev) => [...prev, emptyMasalahRow()])}
                      className="text-sm text-primary-600 dark:text-primary-400 font-medium hover:underline"
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

              <motion.div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </motion.div>
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
