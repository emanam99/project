import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { StaggerRevealList, RevealTitle } from '../../../components/motion/StaggerReveal'
import { santriAPI, tahunAjaranAPI, ugtGuruTugasTugasanAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import { useActiveHijriyahTahunAjaran } from '../../../hooks/useActiveTahunAjaran'
import { DOMISILI_POP_PRIORITY } from '../../../history/domisiliPopstateStack'
import SearchOffcanvas from '../../../components/Biodata/SearchOffcanvas'
import Modal from '../../../components/Modal/Modal'

const STATUS_GURU_TUGAS = 'Guru Tugas'

function formatAlamatSantri(s) {
  if (!s) return ''
  const parts = [
    (s.dusun || '').trim(),
    s.rt ? `RT ${String(s.rt).trim()}` : '',
    s.rw ? `RW ${String(s.rw).trim()}` : '',
    (s.desa || '').trim(),
    (s.kecamatan || '').trim(),
    (s.kabupaten || '').trim(),
    (s.provinsi || '').trim(),
    (s.kode_pos || '').trim(),
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : ''
}

function rowIsAktif(row) {
  if (row?.is_aktif === undefined || row?.is_aktif === null) return true
  return Number(row.is_aktif) === 1
}

function GtAktifToggle({ checked, disabled, busy, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || busy}
      onClick={() => onChange?.(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-teal-600' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

/** Satu baris timeline — pola sama dengan AbsenRiwayatTab (AbsenRow). */
function GtRiwayatRow({
  row,
  isLast,
  canDelete,
  canToggleAktif,
  deletingId,
  onRequestDelete,
  onToggleAktif,
}) {
  const busy = deletingId != null && row.id != null && deletingId === row.id
  const aktif = rowIsAktif(row)
  return (
    <li
      className={`relative flex items-start gap-2 sm:gap-3 pl-2 -ml-px list-none ${!aktif ? 'opacity-60' : ''}`}
    >
      {!isLast && (
        <span
          className="absolute left-[13px] top-6 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-600 rounded-full"
          aria-hidden
        />
      )}
      <span
        className={`relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full ring-4 border-2 border-white dark:border-gray-800 ${
          aktif
            ? 'bg-teal-500 dark:bg-teal-400 ring-teal-100 dark:ring-teal-900/50'
            : 'bg-gray-400 dark:bg-gray-500 ring-gray-100 dark:ring-gray-800/50'
        }`}
        aria-hidden
      />
      <motion.div className="min-w-0 flex-1 pt-0.5 pb-4 pr-1">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
          {row.santri_nama || '—'}
          {row.santri_nis != null && String(row.santri_nis).trim() !== '' ? (
            <span className="text-gray-500 dark:text-gray-400 font-normal"> · NIS {row.santri_nis}</span>
          ) : null}
          {!aktif ? (
            <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              Nonaktif
            </span>
          ) : null}
        </p>
        {row.keterangan ? (
          <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1 line-clamp-3 leading-snug">{row.keterangan}</p>
        ) : null}
      </motion.div>
      {(canToggleAktif || canDelete) && row.id != null ? (
        <div className="shrink-0 pt-0.5 pb-4 flex flex-col items-end gap-1.5 sm:flex-row sm:items-center">
          {canToggleAktif ? (
            <div
              className="flex items-center gap-1.5"
              title={aktif ? 'Nonaktifkan penugasan' : 'Aktifkan penugasan'}
            >
              <span className="text-[10px] text-gray-500 dark:text-gray-400 hidden sm:inline">
                {aktif ? 'Aktif' : 'Nonaktif'}
              </span>
              <GtAktifToggle
                checked={aktif}
                disabled={busy}
                label={aktif ? 'Nonaktifkan penugasan guru tugas' : 'Aktifkan penugasan guru tugas'}
                onChange={() => onToggleAktif?.(row, !aktif)}
              />
            </div>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRequestDelete?.(row)}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-transparent hover:border-red-200 dark:hover:border-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Hapus penugasan dari riwayat"
              aria-label="Hapus penugasan guru tugas"
            >
              {busy ? (
                <span className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" aria-hidden />
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

const Z_BACKDROP = 100018
const Z_PANEL = 100019
const Z_SEARCH = 100025
/** Di atas panel GT & Cari Santri agar modal konfirmasi hapus tampil di depan */
const Z_CONFIRM_MODAL = 100060

/**
 * Offcanvas kanan: tambah penugasan Guru Tugas ke madrasah (pilih TA + santri).
 * Santri dipilih → status diubah ke Guru Tugas lalu POST tugasan.
 */
export default function TambahGuruTugasMadrasahOffcanvas({
  isOpen,
  onClose,
  madrasah,
  canTambahTugasan = false,
  canHapusTugasan = false,
}) {
  const { showNotification } = useNotification()
  const activeTahunAjaran = useActiveHijriyahTahunAjaran()
  const handleClose = useOffcanvasBackClose(isOpen, onClose, {
    useDomisiliPopstateStack: true,
    domisiliStackId: 'ugt-tambah-guru-tugas-madrasah',
    domisiliStackPriority: DOMISILI_POP_PRIORITY.ugtGtMadrasahOffcanvas,
  })

  const [tahunAjaranOptions, setTahunAjaranOptions] = useState([])
  const [tahunAjaran, setTahunAjaran] = useState('')
  const [selectedSantri, setSelectedSantri] = useState(null)
  const [santriDetail, setSantriDetail] = useState(null)
  const [santriDetailLoading, setSantriDetailLoading] = useState(false)
  const [showCariSantri, setShowCariSantri] = useState(false)
  const [saving, setSaving] = useState(false)
  const [riwayatRows, setRiwayatRows] = useState([])
  const [riwayatLoading, setRiwayatLoading] = useState(false)
  const [deletingTugasanId, setDeletingTugasanId] = useState(null)
  const [hapusModalRow, setHapusModalRow] = useState(null)
  const [hapusSubmitting, setHapusSubmitting] = useState(false)
  const fetchDetailSeq = useRef(0)
  const formTambahRef = useRef(null)

  const mid = madrasah?.id

  const loadRiwayat = useCallback(async () => {
    if (!mid) return
    setRiwayatLoading(true)
    try {
      const res = await ugtGuruTugasTugasanAPI.listByMadrasah(mid)
      setRiwayatRows(Array.isArray(res?.data) ? res.data : [])
    } catch {
      setRiwayatRows([])
    } finally {
      setRiwayatLoading(false)
    }
  }, [mid])

  const riwayatByTa = useMemo(() => {
    const map = new Map()
    for (const r of riwayatRows) {
      const ta = String(r.id_tahun_ajaran ?? '').trim() || '(Tanpa tahun ajaran)'
      if (!map.has(ta)) map.set(ta, [])
      map.get(ta).push(r)
    }
    return [...map.entries()].sort((a, b) => String(b[0]).localeCompare(String(a[0]), undefined, { numeric: true }))
  }, [riwayatRows])

  useEffect(() => {
    if (!isOpen || mid == null) return
    loadRiwayat()
  }, [isOpen, mid, loadRiwayat])

  useEffect(() => {
    if (!isOpen) {
      setTahunAjaran('')
      setTahunAjaranOptions([])
      setSelectedSantri(null)
      setSantriDetail(null)
      setSantriDetailLoading(false)
      setRiwayatRows([])
      setDeletingTugasanId(null)
      fetchDetailSeq.current += 1
      setShowCariSantri(false)
      setSaving(false)
      setHapusModalRow(null)
      setHapusSubmitting(false)
      return
    }
    let cancelled = false
    tahunAjaranAPI
      .getAll({ kategori: 'hijriyah' })
      .then((res) => {
        if (cancelled) return
        const rows = Array.isArray(res?.data) ? res.data : []
        const keys = rows
          .map((r) => (r && r.tahun_ajaran != null ? String(r.tahun_ajaran).trim() : ''))
          .filter(Boolean)
        setTahunAjaranOptions(keys)
        setTahunAjaran((prev) => {
          if (prev && keys.includes(prev)) return prev
          const aktif = String(activeTahunAjaran || '').trim()
          if (aktif && keys.includes(aktif)) return aktif
          return keys[0] || ''
        })
      })
      .catch(() => {
        if (!cancelled) {
          setTahunAjaranOptions([])
          setTahunAjaran('')
        }
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, activeTahunAjaran])

  const scrollToFormTambah = useCallback((ta) => {
    if (ta && ta !== '(Tanpa tahun ajaran)') {
      setTahunAjaran(ta)
    }
    requestAnimationFrame(() => {
      formTambahRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  const handleSelectSantriRecord = useCallback((s) => {
    setShowCariSantri(false)
    if (!s || s.id == null) return
    fetchDetailSeq.current += 1
    const seq = fetchDetailSeq.current
    setSelectedSantri({ id: s.id, nis: s.nis, nama: s.nama, status_santri: s.status_santri })
    setSantriDetail(null)
    setSantriDetailLoading(true)
    santriAPI
      .getById(s.id)
      .then((res) => {
        if (fetchDetailSeq.current !== seq) return
        const d = res?.data
        if (d && typeof d === 'object') setSantriDetail(d)
      })
      .catch(() => {
        if (fetchDetailSeq.current === seq) setSantriDetail(null)
      })
      .finally(() => {
        if (fetchDetailSeq.current === seq) setSantriDetailLoading(false)
      })
  }, [])

  const openHapusModal = useCallback(
    (row) => {
      if (!row?.id || !canHapusTugasan) return
      setHapusModalRow(row)
    },
    [canHapusTugasan]
  )

  const closeHapusModal = useCallback(() => {
    if (hapusSubmitting) return
    setHapusModalRow(null)
  }, [hapusSubmitting])

  const confirmHapusRiwayat = useCallback(async () => {
    const row = hapusModalRow
    if (!row?.id || !canHapusTugasan) return
    setHapusSubmitting(true)
    setDeletingTugasanId(row.id)
    try {
      const res = await ugtGuruTugasTugasanAPI.delete(row.id)
      if (res?.success) {
        showNotification(res?.message || 'Penugasan dihapus', 'success')
        setHapusModalRow(null)
        await loadRiwayat()
      } else {
        showNotification(res?.message || 'Gagal menghapus', 'error')
      }
    } catch (e) {
      console.error(e)
      showNotification('Gagal menghapus', 'error')
    } finally {
      setDeletingTugasanId(null)
      setHapusSubmitting(false)
    }
  }, [hapusModalRow, canHapusTugasan, loadRiwayat, showNotification])

  const setRiwayatAktifLocal = useCallback((id, isAktif) => {
    setRiwayatRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, is_aktif: isAktif ? 1 : 0 } : r))
    )
  }, [])

  const handleToggleAktif = useCallback(
    (row, nextAktif) => {
      if (!row?.id || !canTambahTugasan) return
      const id = row.id
      const prevAktif = rowIsAktif(row)
      setRiwayatAktifLocal(id, nextAktif)
      ugtGuruTugasTugasanAPI
        .patch(id, { is_aktif: nextAktif ? 1 : 0 })
        .then((res) => {
          if (!res?.success) {
            setRiwayatAktifLocal(id, prevAktif)
            showNotification(res?.message || 'Gagal mengubah status', 'error')
          }
        })
        .catch((e) => {
          console.error(e)
          setRiwayatAktifLocal(id, prevAktif)
          showNotification('Gagal mengubah status', 'error')
        })
    },
    [canTambahTugasan, setRiwayatAktifLocal, showNotification]
  )

  const handleSimpan = async () => {
    if (!canTambahTugasan) return
    if (!mid || !tahunAjaran || !selectedSantri?.id) {
      showNotification('Pilih tahun ajaran dan santri', 'warning')
      return
    }
    setSaving(true)
    try {
      const kat = (santriDetail?.kategori || '').trim()
      const payload = { status_santri: STATUS_GURU_TUGAS }
      if (kat) payload.kategori = kat
      const upd = await santriAPI.update(selectedSantri.id, payload)
      if (!upd?.success) {
        showNotification(upd?.message || 'Gagal mengubah status santri', 'error')
        return
      }
      const cr = await ugtGuruTugasTugasanAPI.create({
        id_santri: selectedSantri.id,
        id_madrasah: mid,
        id_tahun_ajaran: tahunAjaran,
      })
      if (!cr?.success) {
        showNotification(cr?.message || 'Status sudah diubah, tetapi gagal menyimpan penugasan madrasah', 'error')
        return
      }
      showNotification('Guru tugas ditambahkan ke madrasah ini', 'success')
      setSelectedSantri(null)
      setSantriDetail(null)
      await loadRiwayat()
    } catch (e) {
      console.error(e)
      showNotification('Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const titleMadrasah = useMemo(() => (madrasah?.nama ? String(madrasah.nama) : 'Madrasah'), [madrasah?.nama])

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      <AnimatePresence>
        {isOpen && mid != null && (
          <>
            <motion.div
              key="gt-m-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              style={{ zIndex: Z_BACKDROP }}
              onClick={handleClose}
              aria-hidden="true"
            />
            <motion.div
              key="gt-m-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-gray-50 dark:bg-gray-900 shadow-2xl flex flex-col rounded-l-2xl overflow-hidden border-l border-gray-200 dark:border-gray-700"
              style={{ zIndex: Z_PANEL }}
            >
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex-shrink-0 px-5 pt-5 pb-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
              >
                <motion.div
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-start justify-between gap-3"
                >
                  <motion.div
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="min-w-0"
                  >
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white">Guru Tugas Madrasah</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{titleMadrasah}</p>
                  </motion.div>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="p-2.5 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                    aria-label="Tutup"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </motion.div>
              </motion.div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {canTambahTugasan ? (
                  <div ref={formTambahRef} className="space-y-4 scroll-mt-3">
                    <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-4 space-y-3">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Tahun ajaran</label>
                      <select
                        value={tahunAjaran}
                        onChange={(e) => setTahunAjaran(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                      >
                        <option value="">— Pilih —</option>
                        {tahunAjaranOptions.map((ta) => (
                          <option key={ta} value={ta}>{ta}</option>
                        ))}
                      </select>
                    </div>

                    <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-4 space-y-2">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Santri</span>
                      <button
                        type="button"
                        onClick={() => setShowCariSantri(true)}
                        className="w-full text-left px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/80 text-sm text-gray-800 dark:text-gray-200 hover:border-teal-400 transition-colors"
                      >
                        {selectedSantri
                          ? `${selectedSantri.nama || ''} (NIS ${selectedSantri.nis || selectedSantri.id})`
                          : 'Pilih santri…'}
                      </button>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Status santri akan diubah menjadi «Guru Tugas» dan dihubungkan ke madrasah ini untuk tahun ajaran terpilih.
                      </p>
                      {(santriDetailLoading || selectedSantri) && (
                        <div className="mt-2 rounded-lg border border-gray-100 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 p-3 space-y-2 text-xs">
                          {santriDetailLoading && <p className="text-gray-500">Memuat biodata…</p>}
                          {!santriDetailLoading && santriDetail && (
                            <StaggerRevealList
                              animateKey={`gt-bio-${selectedSantri?.id ?? selectedSantri?.nis ?? 'x'}`}
                              className="grid gap-1.5"
                            >
                              <div>
                                <RevealTitle as="span" className="text-gray-500 dark:text-gray-400">Ayah</RevealTitle>
                                <p className="text-gray-900 dark:text-gray-100 mt-0.5">{santriDetail.ayah?.trim() || '—'}</p>
                              </div>
                              <div>
                                <RevealTitle as="span" className="text-gray-500 dark:text-gray-400">Ibu</RevealTitle>
                                <p className="text-gray-900 dark:text-gray-100 mt-0.5">{santriDetail.ibu?.trim() || '—'}</p>
                              </div>
                              <div>
                                <RevealTitle as="span" className="text-gray-500 dark:text-gray-400">Wali</RevealTitle>
                                <p className="text-gray-900 dark:text-gray-100 mt-0.5">
                                  {santriDetail.wali?.trim() || '—'}
                                  {santriDetail.hubungan_wali?.trim() ? (
                                    <span className="text-gray-500"> ({santriDetail.hubungan_wali.trim()})</span>
                                  ) : null}
                                </p>
                              </div>
                              <div>
                                <RevealTitle as="span" className="text-gray-500 dark:text-gray-400">Alamat</RevealTitle>
                                <p className="text-gray-900 dark:text-gray-100 mt-0.5 leading-snug">
                                  {formatAlamatSantri(santriDetail) || '—'}
                                </p>
                              </div>
                            </StaggerRevealList>
                          )}
                          {!santriDetailLoading && !santriDetail && selectedSantri && (
                            <p className="text-amber-700 dark:text-amber-300">Biodata tidak dapat dimuat; tetap bisa menyimpan jika data sudah benar.</p>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={saving || !tahunAjaran || !selectedSantri}
                      onClick={handleSimpan}
                      className="w-full py-3 rounded-xl text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? 'Menyimpan…' : 'Simpan penugasan'}
                    </button>
                  </div>
                ) : null}

                <style>{`
                  .gt-madrasah-riwayat-scroll { scrollbar-width: thin; scrollbar-color: rgba(148, 163, 184, 0.35) transparent; }
                  .dark .gt-madrasah-riwayat-scroll { scrollbar-color: rgba(71, 85, 105, 0.5) transparent; }
                `}</style>
                <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/60 bg-gray-50/80 dark:bg-gray-900/40">
                    <h3 className="text-xs font-semibold text-gray-800 dark:text-gray-100">Riwayat Guru Tugas di madrasah ini</h3>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      Dikelompokkan per tahun ajaran.
                      {canTambahTugasan ? ' Tombol + per TA untuk menambah; toggle aktif/nonaktif di setiap baris.' : ''}
                      {canHapusTugasan ? ' Hapus: ikon tempat sampah.' : ''}
                    </p>
                  </div>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="px-4 sm:px-5 py-4 max-h-[min(45vh,20rem)] overflow-y-auto gt-madrasah-riwayat-scroll"
                  >
                    {riwayatLoading ? (
                      <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-6">Memuat…</p>
                    ) : riwayatByTa.length === 0 ? (
                      <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-6">Belum ada penugasan.</p>
                    ) : (
                      riwayatByTa.map(([ta, rows]) => (
                        <div key={ta} className="mb-6 last:mb-0">
                          <div className="flex items-center justify-between gap-2 mb-3 py-0.5 bg-white dark:bg-gray-800 -mx-1 px-1">
                            <p className="text-xs font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-wider min-w-0">
                              {ta}
                              <span className="normal-case font-normal text-gray-500 dark:text-gray-400 tracking-normal">
                                {' '}
                                · {rows.length} orang
                              </span>
                            </p>
                            {canTambahTugasan && ta !== '(Tanpa tahun ajaran)' ? (
                              <button
                                type="button"
                                onClick={() => scrollToFormTambah(ta)}
                                className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border border-teal-500/50 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900/30"
                                title={`Tambah guru tugas untuk ${ta}`}
                              >
                                <span className="text-sm leading-none" aria-hidden>+</span>
                                Tambah
                              </button>
                            ) : null}
                          </div>
                          <ul className="relative list-none p-0 m-0">
                            {rows.map((r, idx) => (
                              <GtRiwayatRow
                                key={r.id}
                                row={r}
                                isLast={idx === rows.length - 1}
                                canDelete={canHapusTugasan}
                                canToggleAktif={canTambahTugasan}
                                deletingId={deletingTugasanId}
                                onRequestDelete={openHapusModal}
                                onToggleAktif={handleToggleAktif}
                              />
                            ))}
                          </ul>
                        </div>
                      ))
                    )}
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <SearchOffcanvas
        isOpen={showCariSantri}
        onClose={() => setShowCariSantri(false)}
        onSelectSantriRecord={handleSelectSantriRecord}
        zIndex={Z_SEARCH}
      />

      <Modal
        isOpen={hapusModalRow != null}
        onClose={closeHapusModal}
        title="Hapus penugasan?"
        size="sm"
        zIndex={Z_CONFIRM_MODAL}
        closeOnBackdropClick={!hapusSubmitting}
        preventClose={hapusSubmitting}
        showCloseButton={!hapusSubmitting}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            Baris penugasan akan dihapus dari riwayat madrasah ini. Status santri di basis data tidak diubah otomatis.
          </p>
          {hapusModalRow && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-gradient-to-br from-gray-50 to-white dark:from-gray-900/60 dark:to-gray-800/80 p-4 shadow-sm">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {(hapusModalRow.santri_nama || 'Santri').trim()}
                {hapusModalRow.santri_nis != null && String(hapusModalRow.santri_nis).trim() !== '' ? (
                  <span className="font-normal text-gray-500 dark:text-gray-400"> · NIS {hapusModalRow.santri_nis}</span>
                ) : null}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Tahun ajaran:{' '}
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {String(hapusModalRow.id_tahun_ajaran ?? '').trim() || '—'}
                </span>
              </p>
              {hapusModalRow.keterangan ? (
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">{hapusModalRow.keterangan}</p>
              ) : null}
            </div>
          )}
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1"
          >
            <button
              type="button"
              disabled={hapusSubmitting}
              onClick={closeHapusModal}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/80 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={hapusSubmitting}
              onClick={confirmHapusRiwayat}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {hapusSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden />
                  Menghapus…
                </>
              ) : (
                'Hapus penugasan'
              )}
            </button>
          </motion.div>
        </div>
      </Modal>
    </>,
    document.body
  )
}
