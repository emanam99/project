import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { pendaftaranAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import { usePendaftaranFiturAccess } from '../../hooks/usePendaftaranFiturAccess'
import { PENDAFTARAN_ACTION_CODES } from '../../config/pendaftaranFiturCodes'
import SearchOffcanvas from '../../components/Biodata/SearchOffcanvas'
import NisPengajuanKkPreview from './components/NisPengajuanKkPreview'
import NisPengajuanKkBerkasOffcanvas from './components/NisPengajuanKkBerkasOffcanvas'
import NisPengajuanBiodataCompare from './components/NisPengajuanBiodataCompare'
import RiwayatChatOffcanvas from './components/RiwayatChatOffcanvas'
import { useWhatsAppCheck } from './components/hooks/useWhatsAppCheck'
import { createTypedObjectUrl, isPdfMime } from '../../utils/filePreviewMedia'

/** Di atas nav bawah mobile (z-[100]). */
const Z_DETAIL_BACKDROP = 110
const Z_DETAIL_PANEL = 111
const Z_CARI_SANTRI = 140

function formatNisForInput(santri) {
  if (!santri) return ''
  const nisDigits = String(santri.nis ?? '').replace(/\D/g, '')
  if (nisDigits.length >= 7) return nisDigits.slice(-7)
  if (nisDigits.length > 0) return nisDigits.padStart(7, '0')
  if (santri.id != null && String(santri.id).trim() !== '') return String(santri.id).trim()
  return ''
}

const STATUS_LABEL = {
  menunggu_kk: 'Menunggu KK',
  menunggu_wa: 'Menunggu WA',
  menunggu_review: 'Menunggu review',
  selesai: 'Selesai',
  ditolak: 'Ditolak',
}

function statusBadgeClass(status) {
  switch (status) {
    case 'menunggu_review':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
    case 'menunggu_wa':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300'
    case 'selesai':
      return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
    case 'ditolak':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
  }
}

function KkThumb({ pengajuanId, hasKk, tipeFile, namaFile }) {
  const isPdfHint = isPdfMime(tipeFile, namaFile)
  const [src, setSrc] = useState(null)
  useEffect(() => {
    if (!hasKk || !pengajuanId || isPdfHint) return undefined
    let revoked = false
    let url = null
    pendaftaranAPI.fetchNisPengajuanKkBlob(pengajuanId).then((blob) => {
      if (revoked || !blob) return
      if (isPdfMime(blob.type, namaFile)) return
      const typed = createTypedObjectUrl(blob, tipeFile, namaFile)
      url = typed.url
      if (url) setSrc(url)
    }).catch(() => {})
    return () => {
      revoked = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [pengajuanId, hasKk, isPdfHint, tipeFile, namaFile])

  if (!hasKk) {
    return (
      <span className="inline-flex w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 items-center justify-center text-xs text-gray-400">
        —
      </span>
    )
  }
  if (isPdfHint) {
    return (
      <span
        className="inline-flex w-12 h-12 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 items-center justify-center text-[10px] font-bold text-red-700 dark:text-red-300"
        title="PDF"
      >
        PDF
      </span>
    )
  }
  if (!src) {
    return <span className="inline-block w-12 h-12 rounded-lg bg-gray-200 dark:bg-gray-600 animate-pulse" />
  }
  return (
    <img
      src={src}
      alt="KK"
      className="w-12 h-12 rounded-lg object-cover border border-gray-200 dark:border-gray-600"
    />
  )
}

const STATUS_BISA_TOLAK = new Set(['menunggu_review', 'menunggu_wa', 'menunggu_kk'])

function DetailOffcanvas({ item, onClose, onSaved, canEdit, canKirim, canWaChat, canTolak }) {
  const { showNotification } = useNotification()
  const {
    isCheckingWaSantri,
    waStatusWaSantri,
    checkPhoneNumberWaSantri,
    setWaStatusWaSantri,
  } = useWhatsAppCheck(showNotification)
  const [form, setForm] = useState({
    nama: item?.nama || '',
    nik: item?.nik || '',
    tanggal_lahir: item?.tanggal_lahir || '',
    id_santri: item?.id_santri ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [kirimWaSaatTolak, setKirimWaSaatTolak] = useState(true)
  const [showCariSantri, setShowCariSantri] = useState(false)
  const [santriTerpilih, setSantriTerpilih] = useState(null)
  const [showKkBerkas, setShowKkBerkas] = useState(false)
  const [biodataInfo, setBiodataInfo] = useState(null)
  const [biodataLoading, setBiodataLoading] = useState(false)
  const [syncingBiodata, setSyncingBiodata] = useState(false)
  const [showRiwayatChat, setShowRiwayatChat] = useState(false)

  const openRiwayatChat = useCallback(() => {
    const nomor = (item?.no_wa || '').trim()
    if (!nomor) {
      showNotification('Nomor WhatsApp pengajuan kosong', 'error')
      return
    }
    setShowRiwayatChat(true)
  }, [item?.no_wa, showNotification])

  const linkedSantriId = useMemo(() => {
    if (item?.id_santri != null && item.id_santri !== '') return Number(item.id_santri)
    return null
  }, [item?.id_santri])

  const pendingSantriLink =
    santriTerpilih?.id != null &&
    linkedSantriId != null &&
    Number(santriTerpilih.id) !== linkedSantriId

  const canSyncBiodata =
    canEdit &&
    linkedSantriId != null &&
    linkedSantriId > 0 &&
    item?.status !== 'ditolak'

  const loadBiodataInfo = useCallback(async () => {
    if (!item?.id || !linkedSantriId) {
      setBiodataInfo(null)
      return
    }
    setBiodataLoading(true)
    try {
      const res = await pendaftaranAPI.getNisPengajuanKkBerkasInfo(item.id)
      if (res?.success && res.data?.biodata) {
        setBiodataInfo(res.data.biodata)
      } else {
        setBiodataInfo(null)
      }
    } catch {
      setBiodataInfo(null)
    } finally {
      setBiodataLoading(false)
    }
  }, [item?.id, linkedSantriId])

  useEffect(() => {
    if (!item) return
    loadBiodataInfo()
  }, [item, loadBiodataInfo])

  useOffcanvasBackClose(true, onClose, {
    state: { ebOffcanvas: 'nis_pengajuan_detail' },
  })

  useEffect(() => {
    if (!item) return
    const nisPrefill =
      item.nis_display != null && String(item.nis_display).trim() !== ''
        ? String(item.nis_display).replace(/\D/g, '').slice(-7).padStart(7, '0')
        : item.id_santri != null && String(item.id_santri).trim() !== ''
          ? String(item.id_santri)
          : ''
    setForm({
      nama: item.nama || '',
      nik: item.nik || '',
      tanggal_lahir: item.tanggal_lahir || '',
      id_santri: nisPrefill,
    })
    setSantriTerpilih(null)
    setShowCariSantri(false)
    setShowRiwayatChat(false)
    setWaStatusWaSantri(null)
    setKirimWaSaatTolak(item.status !== 'menunggu_kk')
  }, [item, setWaStatusWaSantri])

  const buildPatchPayload = useCallback(
    () => ({
      nama: form.nama.trim(),
      nik: form.nik.trim(),
      tanggal_lahir: form.tanggal_lahir,
      id_santri: form.id_santri !== '' ? form.id_santri : null,
    }),
    [form]
  )

  const handleSave = async () => {
    if (!canEdit || !item?.id) return
    setSaving(true)
    try {
      const res = await pendaftaranAPI.patchNisPengajuan(item.id, buildPatchPayload())
      if (res.success) {
        showNotification('Data pemohon disimpan', 'success')
        onSaved(res.data)
        loadBiodataInfo()
      } else {
        showNotification(res.message || 'Gagal menyimpan', 'error')
      }
    } catch (e) {
      showNotification(e.response?.data?.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSyncBiodataToSantri = async () => {
    if (!canSyncBiodata || !item?.id || syncingBiodata) return
    if (biodataInfo?.same) {
      showNotification('Biodata santri sudah sama dengan pengajuan.', 'info')
      return
    }
    const msg =
      biodataInfo?.has_difference
        ? 'Perbarui nama, NIK, dan tanggal lahir di biodata santri sesuai data pengajuan?'
        : 'Salin nama, NIK, dan tanggal lahir pengajuan ke biodata santri?'
    if (!window.confirm(msg)) return

    setSyncingBiodata(true)
    try {
      const patchRes = await pendaftaranAPI.patchNisPengajuan(item.id, buildPatchPayload())
      if (!patchRes?.success) {
        showNotification(patchRes?.message || 'Gagal menyimpan data pengajuan', 'error')
        return
      }
      onSaved(patchRes.data)

      const res = await pendaftaranAPI.syncNisPengajuanKkBerkas(item.id, 'biodata_only', true)
      if (res?.success) {
        showNotification(res.message || 'Biodata santri diperbarui', 'success')
        loadBiodataInfo()
      } else {
        showNotification(res?.message || 'Gagal memperbarui biodata santri', 'error')
      }
    } catch (e) {
      const code = e.response?.data?.code
      showNotification(
        e.response?.data?.message ||
          (code === 'biodata_nik_conflict'
            ? 'NIK bentrok dengan santri lain'
            : 'Gagal memperbarui biodata santri'),
        'error'
      )
    } finally {
      setSyncingBiodata(false)
    }
  }

  const handleSelectSantriRecord = useCallback((santri) => {
    setShowCariSantri(false)
    if (!santri) return
    const nisInput = formatNisForInput(santri)
    setForm((f) => ({ ...f, id_santri: nisInput }))
    setSantriTerpilih({
      nama: santri.nama || '',
      nis: nisInput,
      id: santri.id,
    })
  }, [])

  const openKkBerkasOffcanvas = useCallback(() => {
    if (!item?.id || !item.path_file) return
    setShowKkBerkas(true)
  }, [item?.id, item?.path_file])

  const handleKirimNis = async () => {
    if (!canKirim || !item?.id || sending) return
    const noWa = (item.no_wa || '').trim()
    if (!noWa) {
      showNotification('Nomor WhatsApp pemohon kosong.', 'error')
      return
    }
    const msg =
      `Kirim NIS ke WhatsApp pemohon?\n\nNomor: ${noWa}\n` +
      'Pastikan nomor aktif dan sama dengan WA yang dipakai pemohon.'
    if (!window.confirm(msg)) return

    setSending(true)
    try {
      const res = await pendaftaranAPI.kirimNisPengajuan(item.id)
      if (res.success) {
        showNotification(
          res.message || `NIS terkirim ke ${noWa}. Minta pemohon cek pesan masuk WA.`,
          'success'
        )
        const updated = {
          ...item,
          status: 'selesai',
          nis_display: res.data?.nis,
          id_santri: res.data?.id_santri ?? item.id_santri,
        }
        onSaved(updated)
        if (res.data?.can_sync_kk) {
          setShowKkBerkas(true)
        }
      } else {
        showNotification(res.message || 'Gagal mengirim', 'error')
      }
    } catch (e) {
      const code = e.response?.data?.code
      const apiMsg = e.response?.data?.message
      showNotification(
        apiMsg ||
          (code === 'wa_not_delivered'
            ? 'Pesan tidak terkirim ke WA pemohon. Cek koneksi WA di Pengaturan atau coba lagi.'
            : 'Gagal mengirim NIS ke WA'),
        'error'
      )
    } finally {
      setSending(false)
    }
  }

  const canOfferKkBerkas =
    !!item?.path_file &&
    !!(item.id_santri || santriTerpilih?.id) &&
    (item.status === 'selesai' || item.status === 'menunggu_review')

  const showTolak = canTolak && STATUS_BISA_TOLAK.has(item?.status)

  const handleTolak = async () => {
    if (!showTolak || !item?.id || rejecting) return
    const noWa = (item.no_wa || '').trim()
    if (kirimWaSaatTolak && !noWa) {
      showNotification('Nomor WhatsApp pemohon kosong. Nonaktifkan centang kirim pesan atau isi nomor WA.', 'error')
      return
    }
    const msg = kirimWaSaatTolak
      ? `Tolak pengajuan dan kirim pesan WA ke ${noWa}?\n\nPemohon diminta cek data & ajukan ulang.`
      : 'Tolak pengajuan tanpa mengirim pesan WhatsApp ke pemohon?'
    if (!window.confirm(msg)) return

    setRejecting(true)
    try {
      const res = await pendaftaranAPI.tolakNisPengajuan(item.id, kirimWaSaatTolak)
      if (res.success) {
        showNotification(res.message || 'Pengajuan ditolak', 'success')
        onSaved({ ...item, ...res.data, status: 'ditolak' })
      } else {
        showNotification(res.message || 'Gagal menolak pengajuan', 'error')
      }
    } catch (e) {
      const code = e.response?.data?.code
      showNotification(
        e.response?.data?.message ||
          (code === 'wa_not_delivered'
            ? 'Pesan WA tidak terkirim. Pengajuan belum ditolak — coba lagi atau tolak tanpa kirim pesan.'
            : 'Gagal menolak pengajuan'),
        'error'
      )
    } finally {
      setRejecting(false)
    }
  }

  if (!item) return null

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40"
        style={{ zIndex: Z_DETAIL_BACKDROP }}
        onClick={onClose}
        aria-hidden
      />
      <motion.aside
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="fixed top-0 right-0 h-full w-full max-w-md bg-white dark:bg-gray-900 shadow-xl flex flex-col min-h-0"
        style={{ zIndex: Z_DETAIL_PANEL }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Detail pengajuan</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-4 page-content-scroll">
          <div>
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusBadgeClass(item.status)}`}>
              {STATUS_LABEL[item.status] || item.status}
            </span>
            <p className="text-xs text-gray-500 mt-1">
              Diajukan: {item.created_at ? new Date(item.created_at).toLocaleString('id-ID') : '—'}
            </p>
          </div>

          {item.path_file ? (
            <NisPengajuanKkPreview
              pengajuanId={item.id}
              fileName={item.nama_file}
              mimeType={item.tipe_file}
            />
          ) : null}

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nama</label>
              <input
                type="text"
                value={form.nama}
                onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
                disabled={!canEdit}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">NIK</label>
              <input
                type="text"
                value={form.nik}
                onChange={(e) => setForm((f) => ({ ...f, nik: e.target.value }))}
                disabled={!canEdit}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tanggal lahir</label>
              <input
                type="date"
                value={form.tanggal_lahir}
                onChange={(e) => setForm((f) => ({ ...f, tanggal_lahir: e.target.value }))}
                disabled={!canEdit}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
              />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <label className="text-xs text-gray-500">No. WhatsApp</label>
                {canWaChat && (item.no_wa || '').trim() ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        checkPhoneNumberWaSantri(item.no_wa, { no_wa_santri: item.no_wa })
                      }
                      disabled={isCheckingWaSantri}
                      className="px-1.5 py-0.5 bg-blue-500 hover:bg-blue-600 text-white text-[10px] rounded transition-colors flex items-center gap-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Cek aktif WhatsApp"
                    >
                      {isCheckingWaSantri ? (
                        <span className="animate-spin text-[10px]">⏳</span>
                      ) : (
                        <>
                          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                          </svg>
                          <span className="text-[10px]">Cek</span>
                        </>
                      )}
                    </button>
                    {waStatusWaSantri ? (
                      <span
                        className={`text-xs px-2 py-0.5 rounded dark:bg-opacity-80 ${
                          waStatusWaSantri === 'checking'
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
                            : waStatusWaSantri === 'registered'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                        }`}
                      >
                        {waStatusWaSantri === 'checking' && 'Sedang mengecek…'}
                        {waStatusWaSantri === 'registered' && '✓ Aktif WA'}
                        {waStatusWaSantri === 'not_registered' && '✗ Tidak aktif WA'}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={openRiwayatChat}
                      className="px-2 py-1 text-xs font-medium text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 rounded-lg transition-colors border border-teal-200 dark:border-teal-700"
                    >
                      Chat & kirim pesan
                    </button>
                  </>
                ) : null}
              </div>
              <p className="text-sm font-mono text-gray-800 dark:text-gray-200">{item.no_wa || '—'}</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">ID / NIS santri (opsional)</label>
              <div className="flex gap-2 items-stretch">
                <input
                  type="text"
                  value={form.id_santri}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, id_santri: e.target.value }))
                    setSantriTerpilih(null)
                  }}
                  disabled={!canEdit}
                  placeholder="7 digit NIS"
                  inputMode="numeric"
                  maxLength={12}
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-mono"
                />
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setShowCariSantri(true)}
                    className="shrink-0 px-2.5 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors flex items-center gap-1 text-xs font-medium"
                    title="Cari Santri"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    <span className="hidden sm:inline">Cari</span>
                  </button>
                ) : null}
              </div>
              {santriTerpilih ? (
                <p className="text-xs text-teal-700 dark:text-teal-300 mt-1.5">
                  Santri: <span className="font-medium">{santriTerpilih.nama || '—'}</span>
                  {santriTerpilih.nis ? (
                    <span className="font-mono"> · NIS {santriTerpilih.nis}</span>
                  ) : null}
                </p>
              ) : null}
              {item.nis_display && !santriTerpilih ? (
                <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">
                  NIS tersimpan: {item.nis_display}
                </p>
              ) : null}
            </div>
          </div>

          {canSyncBiodata ? (
            <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Sinkron ke biodata santri
              </p>
              {!linkedSantriId ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Tautkan santri (cari atau isi NIS) lalu simpan, agar biodata bisa diperbarui.
                </p>
              ) : pendingSantriLink ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Santri baru dipilih — simpan perubahan tautan terlebih dahulu.
                </p>
              ) : biodataLoading ? (
                <p className="text-xs text-gray-500">Memuat perbandingan biodata…</p>
              ) : biodataInfo?.santri ? (
                <NisPengajuanBiodataCompare biodata={biodataInfo} />
              ) : (
                <p className="text-xs text-gray-500">Belum ada data santri untuk dibandingkan.</p>
              )}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] border-t border-gray-200 dark:border-gray-700 flex flex-col gap-1.5 bg-white dark:bg-gray-900">
          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2 px-3 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-60"
            >
              {saving ? 'Menyimpan…' : 'Simpan perubahan'}
            </button>
          )}
          {canWaChat && (item.no_wa || '').trim() ? (
            <button
              type="button"
              onClick={openRiwayatChat}
              className="w-full py-2 px-3 rounded-lg text-sm font-medium border border-teal-600 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900/20"
            >
              Chat WA — pesan custom & template
            </button>
          ) : null}
          {canKirim && item.status !== 'selesai' && item.status !== 'ditolak' && (
            <button
              type="button"
              onClick={handleKirimNis}
              disabled={sending}
              className="w-full py-2 px-3 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {sending ? 'Mengirim…' : 'Kirim NIS ke WA pemohon'}
            </button>
          )}
          {showTolak ? (
            <div className="rounded-lg border border-red-200 dark:border-red-800/60 bg-red-50/50 dark:bg-red-950/20 p-2.5 space-y-2">
              {item.status === 'menunggu_kk' ? (
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-snug">
                  Pemohon belum mengunggah KK — tolak untuk mengosongkan antrean. Centang kirim WA hanya jika ingin
                  memberi tahu pemohon.
                </p>
              ) : null}
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={kirimWaSaatTolak}
                  onChange={(e) => setKirimWaSaatTolak(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-xs text-gray-700 dark:text-gray-300 leading-snug">
                  Kirim pesan WhatsApp ke pemohon (minta cek data & ajukan ulang)
                </span>
              </label>
              <button
                type="button"
                onClick={handleTolak}
                disabled={rejecting || sending}
                className="w-full py-2 px-3 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
              >
                {rejecting ? 'Menolak…' : 'Tolak pengajuan'}
              </button>
            </div>
          ) : null}
          {canSyncBiodata ? (
            <button
              type="button"
              onClick={handleSyncBiodataToSantri}
              disabled={
                syncingBiodata || saving || !linkedSantriId || pendingSantriLink || biodataInfo?.same
              }
              className="w-full py-2 px-3 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-60"
              title={
                biodataInfo?.same
                  ? 'Biodata sudah sama'
                  : !linkedSantriId
                    ? 'Tautkan santri terlebih dahulu'
                    : pendingSantriLink
                      ? 'Simpan tautan santri dulu'
                      : undefined
              }
            >
              {syncingBiodata
                ? 'Memperbarui biodata…'
                : 'Simpan ke biodata santri (nama, NIK, tgl lahir)'}
            </button>
          ) : null}
          {canEdit && canOfferKkBerkas ? (
            <button
              type="button"
              onClick={openKkBerkasOffcanvas}
              className="w-full py-2 px-3 rounded-lg text-sm font-medium border border-teal-600 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900/20"
            >
              Sinkron KK ke berkas santri
            </button>
          ) : null}
        </div>
      </motion.aside>
      <NisPengajuanKkBerkasOffcanvas
        isOpen={showKkBerkas}
        pengajuanId={item?.id}
        onClose={() => setShowKkBerkas(false)}
        onDone={() => setShowKkBerkas(false)}
      />
      {createPortal(
        <SearchOffcanvas
          isOpen={showCariSantri}
          onClose={() => setShowCariSantri(false)}
          onSelectSantriRecord={handleSelectSantriRecord}
          zIndex={Z_CARI_SANTRI}
        />,
        document.body
      )}
      <RiwayatChatOffcanvas
        isOpen={showRiwayatChat}
        onClose={() => setShowRiwayatChat(false)}
        nomorTujuan={(item?.no_wa || '').trim()}
        idSantri={linkedSantriId != null ? String(linkedSantriId) : ''}
        namaSantri={(form.nama || item?.nama || '').trim()}
      />
    </>
  )
}

export default function PengajuanNis() {
  const [searchParams] = useSearchParams()
  const { showNotification } = useNotification()
  const { can } = usePendaftaranFiturAccess()
  const noImplicit = () => false
  const canEdit =
    can(PENDAFTARAN_ACTION_CODES.nisPengajuanEdit, noImplicit) ||
    can(PENDAFTARAN_ACTION_CODES.nisPengajuanKelola, noImplicit)
  const canKirim =
    can(PENDAFTARAN_ACTION_CODES.nisPengajuanKirim, noImplicit) ||
    can(PENDAFTARAN_ACTION_CODES.nisPengajuanKelola, noImplicit)
  const canTolak = canEdit

  const [statusFilter, setStatusFilter] = useState('menunggu_review')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)

  const showTolakColumn =
    canTolak && (statusFilter === 'menunggu_kk' || statusFilter === 'menunggu_wa' || statusFilter === 'menunggu_review')

  const handleTolakFromList = useCallback(
    async (row, e) => {
      e?.stopPropagation?.()
      if (!canTolak || !row?.id || rejectingId != null) return
      const kirimWa = row.status === 'menunggu_review'
      const noWa = (row.no_wa || '').trim()
      if (kirimWa && !noWa) {
        showNotification('Nomor WhatsApp kosong. Buka detail untuk tolak tanpa kirim pesan.', 'warning')
        return
      }
      const msg =
        row.status === 'menunggu_kk'
          ? `Tolak pengajuan «${row.nama}»?\n\nPengajuan dihapus dari antrean menunggu KK (tanpa notifikasi WA).`
          : kirimWa
            ? `Tolak pengajuan «${row.nama}» dan kirim pesan WA ke ${noWa}?`
            : `Tolak pengajuan «${row.nama}» tanpa mengirim WhatsApp?`
      if (!window.confirm(msg)) return

      setRejectingId(row.id)
      try {
        const res = await pendaftaranAPI.tolakNisPengajuan(row.id, kirimWa)
        if (res.success) {
          showNotification(res.message || 'Pengajuan ditolak', 'success')
          setItems((prev) => prev.filter((x) => x.id !== row.id))
          if (selected?.id === row.id) setSelected(null)
        } else {
          showNotification(res.message || 'Gagal menolak pengajuan', 'error')
        }
      } catch (err) {
        const code = err.response?.data?.code
        showNotification(
          err.response?.data?.message ||
            (code === 'wa_not_delivered'
              ? 'Pesan WA tidak terkirim. Pengajuan belum ditolak.'
              : 'Gagal menolak pengajuan'),
          'error'
        )
      } finally {
        setRejectingId(null)
      }
    },
    [canTolak, rejectingId, selected?.id, showNotification]
  )

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await pendaftaranAPI.listNisPengajuan(statusFilter)
      if (res.success) {
        setItems(res.data?.items || [])
      } else {
        showNotification(res.message || 'Gagal memuat', 'error')
      }
    } catch (e) {
      showNotification(e.response?.data?.message || 'Gagal memuat', 'error')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, showNotification])

  useEffect(() => {
    loadList()
  }, [loadList])

  const openId = searchParams.get('id')
  useEffect(() => {
    if (!openId || items.length === 0) return
    const found = items.find((x) => String(x.id) === openId)
    if (found) setSelected(found)
  }, [openId, items])

  const filtered = useMemo(() => items, [items])

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden page-content-scroll"
        style={{ minHeight: 0 }}
      >
        <div className="p-4 md:p-6 max-w-6xl mx-auto pb-20 sm:pb-6">
          <div className="mb-6 shrink-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Pengajuan NIS</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Santri myBeddien yang tidak mengetahui NIS dan mengunggah KK untuk verifikasi admin.
            </p>
          </div>

          <div className="mb-4 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto overscroll-x-contain">
            <div className="flex flex-nowrap gap-2 min-w-min pb-0.5">
              {[
                { key: 'menunggu_review', label: 'Menunggu review' },
                { key: 'menunggu_wa', label: 'Menunggu WA' },
                { key: 'menunggu_kk', label: 'Menunggu KK' },
                { key: 'selesai', label: 'Selesai' },
                { key: 'ditolak', label: 'Ditolak' },
              ].map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setStatusFilter(f.key)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    statusFilter === f.key
                      ? 'bg-teal-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className="text-gray-500 text-sm">Memuat…</p>
          ) : filtered.length === 0 ? (
            <p className="text-gray-500 text-sm">Tidak ada pengajuan.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/80">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">KK</th>
                    <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Nama</th>
                    <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">NIK</th>
                    <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400 hidden md:table-cell">Tgl lahir</th>
                    <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400 hidden lg:table-cell">WA</th>
                    <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Status</th>
                    {showTolakColumn ? (
                      <th className="text-right p-3 font-medium text-gray-600 dark:text-gray-400 w-24">
                        Aksi
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelected(row)}
                      className="border-t border-gray-100 dark:border-gray-800 hover:bg-teal-50/50 dark:hover:bg-teal-900/10 cursor-pointer"
                    >
                      <td className="p-3">
                        <KkThumb
                          pengajuanId={row.id}
                          hasKk={!!row.path_file}
                          tipeFile={row.tipe_file}
                          namaFile={row.nama_file}
                        />
                      </td>
                      <td className="p-3 font-medium text-gray-900 dark:text-gray-100">{row.nama}</td>
                      <td className="p-3 font-mono text-gray-700 dark:text-gray-300">{row.nik}</td>
                      <td className="p-3 hidden md:table-cell text-gray-600 dark:text-gray-400">{row.tanggal_lahir}</td>
                      <td className="p-3 hidden lg:table-cell font-mono text-gray-600 dark:text-gray-400">{row.no_wa}</td>
                      <td className="p-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs ${statusBadgeClass(row.status)}`}>
                          {STATUS_LABEL[row.status] || row.status}
                        </span>
                      </td>
                      {showTolakColumn ? (
                        <td className="p-3 text-right">
                          {STATUS_BISA_TOLAK.has(row.status) ? (
                            <button
                              type="button"
                              onClick={(e) => handleTolakFromList(row, e)}
                              disabled={rejectingId === row.id}
                              className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                              title="Tolak pengajuan — kosongkan dari antrean"
                            >
                              {rejectingId === row.id ? '…' : 'Tolak'}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {createPortal(
        <AnimatePresence>
          {selected ? (
            <DetailOffcanvas
              key={selected.id}
              item={selected}
              onClose={() => setSelected(null)}
              onSaved={(updated) => {
                setSelected(updated)
                setItems((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)))
                loadList()
              }}
              canEdit={canEdit}
              canKirim={canKirim}
              canTolak={canTolak}
              canWaChat={canEdit || canKirim}
            />
          ) : null}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}
