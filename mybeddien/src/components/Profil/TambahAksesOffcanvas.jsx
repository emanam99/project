import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import { authAPI } from '../../services/api'
import { normalizeNikInput, isNikValid, normalizeNisInput } from '../../utils/nikUtils'
import NikFieldLabel from '../Auth/NikFieldLabel'
import { WaCheckHint } from '../Auth/WaCheckHint'
import { useWaNumberProbe } from '../../hooks/useWaNumberProbe'
import WaPreparePanel from '../Auth/WaPreparePanel'
import DaftarPjgtQrScannerOffcanvas from '../Auth/DaftarPjgtQrScannerOffcanvas'
import {
  formatFileSize,
  KK_MAX_IMAGE_MB,
  KK_MAX_PDF_MB,
  prepareKkFileForUpload,
} from '../../utils/kkUploadPrepare'
import { mapLupaNisUploadError } from '../../utils/lupaNisUploadErrors'

const inputClass =
  'w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 text-sm'

const ALL_MODES = [
  { key: 'santri', label: 'Santri' },
  { key: 'pjgt', label: 'PJGT' },
  { key: 'toko', label: 'Toko' },
]

/**
 * Offcanvas: tambah mode akses (santri / PJGT / toko) dari Profil — alur WA seperti daftar,
 * tanpa setup username/password (link balasan ke /profil).
 */
export default function TambahAksesOffcanvas({
  isOpen,
  onClose,
  defaultNoWa = '',
  hidePjgt = false,
  hideToko = false,
}) {
  const handleClose = useOffcanvasBackClose(isOpen, onClose)
  const modes = useMemo(
    () =>
      ALL_MODES.filter((m) => {
        if (m.key === 'pjgt' && hidePjgt) return false
        if (m.key === 'toko' && hideToko) return false
        return true
      }),
    [hidePjgt, hideToko]
  )

  const [mode, setMode] = useState('santri')
  const [nis, setNis] = useState('')
  const [nik, setNik] = useState('')
  const [identitas, setIdentitas] = useState('')
  const [namaMadrasah, setNamaMadrasah] = useState('')
  const [kodeToko, setKodeToko] = useState('')
  const [namaToko, setNamaToko] = useState('')
  const [noWa, setNoWa] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [waPrepare, setWaPrepare] = useState(null)
  const [pjgtQrOpen, setPjgtQrOpen] = useState(false)
  const [nisStatus, setNisStatus] = useState(null)
  const [nisChecking, setNisChecking] = useState(false)
  const [claimOpen, setClaimOpen] = useState(false)
  const [claimNik, setClaimNik] = useState('')
  const [kkFile, setKkFile] = useState(null)
  const [fileMeta, setFileMeta] = useState(null)
  const [preparingKk, setPreparingKk] = useState(false)
  const [claimSuccess, setClaimSuccess] = useState(null)
  const previewUrlRef = useRef(null)
  const nisCheckSeq = useRef(0)
  const {
    waHint,
    waChecking,
    waCanRetry,
    retryWaCheck,
    waVerified,
    waAcceptedForSubmit,
    waManualConfirmed,
    setWaManualConfirmedChecked,
    showManualWaConfirm,
    manualRetryClickCount,
  } = useWaNumberProbe(noWa)

  useEffect(() => {
    if (!isOpen) return
    setMode('santri')
    setNis('')
    setNik('')
    setIdentitas('')
    setNamaMadrasah('')
    setKodeToko('')
    setNamaToko('')
    setNoWa(String(defaultNoWa || '').replace(/\D/g, ''))
    setError('')
    setWaPrepare(null)
    setLoading(false)
    setNisStatus(null)
    setNisChecking(false)
    setClaimOpen(false)
    setClaimNik('')
    setKkFile(null)
    setFileMeta(null)
    setPreparingKk(false)
    setClaimSuccess(null)
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
  }, [isOpen, defaultNoWa, hidePjgt, hideToko])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !pjgtQrOpen) handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, handleClose, pjgtQrOpen])

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!isOpen || mode !== 'santri' || waPrepare || claimSuccess) return
    const nisTrim = normalizeNisInput(nis)
    if (nisTrim.length !== 7) {
      setNisStatus(null)
      setNisChecking(false)
      setClaimOpen(false)
      return
    }
    const seq = ++nisCheckSeq.current
    const t = window.setTimeout(async () => {
      setNisChecking(true)
      try {
        const res = await authAPI.tambahAksesCheckNis(nisTrim)
        if (seq !== nisCheckSeq.current) return
        setNisStatus({
          code: res.code || 'available',
          message: res.message || '',
          data: res.data || null,
        })
        setClaimOpen(false)
        setError('')
      } catch (err) {
        if (seq !== nisCheckSeq.current) return
        const data = err.response?.data
        const code = data?.code || ''
        if (code === 'already_on_this_account' || code === 'linked_other_account' || code === 'not_found') {
          setNisStatus({
            code,
            message: data?.message || '',
            data: data?.data || null,
          })
          setClaimOpen(false)
          setError('')
        } else {
          setNisStatus(null)
        }
      } finally {
        if (seq === nisCheckSeq.current) setNisChecking(false)
      }
    }, 350)
    return () => window.clearTimeout(t)
  }, [nis, isOpen, mode, waPrepare, claimSuccess])

  const resetFormKeepMode = () => {
    setWaPrepare(null)
    setError('')
  }

  const clearKkPreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setKkFile(null)
    setFileMeta(null)
  }

  const handleKkPick = async (e) => {
    const raw = e.target.files?.[0]
    e.target.value = ''
    setError('')
    if (!raw) return
    setPreparingKk(true)
    try {
      const prepared = await prepareKkFileForUpload(raw)
      if (prepared.error) {
        setError(prepared.error)
        clearKkPreview()
        return
      }
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = prepared.previewUrl || null
      setKkFile(prepared.file)
      setFileMeta({
        name: prepared.file.name,
        size: prepared.file.size,
        isPdf: prepared.file.type === 'application/pdf',
      })
    } catch {
      setError('Gagal menyiapkan file KK')
      clearKkPreview()
    } finally {
      setPreparingKk(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (mode === 'santri') {
      if (nisStatus?.code === 'already_on_this_account') {
        setError('NIS ini sudah ada di akun Anda.')
        return
      }
      if (nisStatus?.code === 'linked_other_account') {
        setError('NIS ini sudah tertaut ke akun lain. Gunakan tombol ajukan akses di bawah.')
        return
      }
      if (nisStatus?.code === 'not_found') {
        setError('NIS tidak ditemukan')
        return
      }
    }
    setLoading(true)
    try {
      const body = { mode, no_wa: noWa.trim() }
      if (mode === 'santri') {
        const nisTrim = normalizeNisInput(nis)
        const nikTrim = normalizeNikInput(nik)
        if (!nisTrim || !isNikValid(nikTrim)) {
          setError('Isi NIS dan NIK 16 digit yang valid')
          return
        }
        body.nis = nisTrim
        body.nik = nikTrim
      } else if (mode === 'pjgt') {
        if (!identitas.trim() || !namaMadrasah.trim()) {
          setError('Isi identitas dan nama madrasah')
          return
        }
        body.identitas = identitas.trim()
        body.nama = namaMadrasah.trim()
      } else {
        if (!kodeToko.trim() || !namaToko.trim()) {
          setError('Isi kode toko dan nama toko')
          return
        }
        body.kode_toko = kodeToko.trim()
        body.nama_toko = namaToko.trim()
      }
      if (!noWa.trim() || noWa.replace(/\D/g, '').length < 10) {
        setError('Nomor WhatsApp wajib diisi (sama dengan nomor akun Anda)')
        return
      }
      if (!waAcceptedForSubmit) {
        setError('Nomor WhatsApp belum terverifikasi. Tunggu cek otomatis atau konfirmasi manual.')
        return
      }

      const res = await authAPI.tambahAksesPrepare(body)
      if (!res.success || !res.wa_me_url) {
        setError(res.message || 'Gagal menyiapkan verifikasi WhatsApp')
        return
      }
      setWaPrepare({
        message: res.message,
        wa_me_url: res.wa_me_url,
        wa_message: res.wa_message,
        expires_in_minutes: res.expires_in_minutes || 30,
      })
    } catch (err) {
      const data = err.response?.data
      const code = data?.code || ''
      if (code === 'already_on_this_account' || code === 'linked_other_account') {
        setNisStatus({
          code,
          message: data?.message || '',
          data: data?.data || null,
        })
        setError('')
      } else {
        setError(data?.message || 'Gagal menyiapkan verifikasi WhatsApp')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleClaimSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const nisTrim = normalizeNisInput(nis)
    const nikTrim = normalizeNikInput(claimNik)
    if (!nisTrim || nisTrim.length !== 7) {
      setError('NIS tidak valid')
      return
    }
    if (!isNikValid(nikTrim)) {
      setError('Isi NIK 16 digit yang valid')
      return
    }
    if (!kkFile) {
      setError('Unggah foto/scan Kartu Keluarga (KK)')
      return
    }
    setLoading(true)
    try {
      const res = await authAPI.tambahAksesSaudaraPengajuan({
        nis: nisTrim,
        nik: nikTrim,
        file: kkFile,
      })
      if (!res.success) {
        setError(res.message || 'Gagal mengirim pengajuan')
        return
      }
      setClaimSuccess({
        message: res.message || 'Pengajuan terkirim.',
        nama: res.data?.nama || nisStatus?.data?.nama || '',
        nis: res.data?.nis || nisTrim,
      })
      clearKkPreview()
      setClaimOpen(false)
    } catch (err) {
      setError(mapLupaNisUploadError(err) || err.response?.data?.message || 'Gagal mengirim pengajuan')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const linkedOther = nisStatus?.code === 'linked_other_account'
  const alreadyHere = nisStatus?.code === 'already_on_this_account'
  const santriNamaHint = nisStatus?.data?.nama ? String(nisStatus.data.nama) : ''

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="tambah-akses-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[100]"
        onClick={handleClose}
        aria-hidden
      />
      <motion.div
        key="tambah-akses-panel"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-[101] flex flex-col bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl max-h-[min(92vh,760px)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tambah-akses-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mx-auto mt-3 shrink-0" aria-hidden />
        <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0 border-b border-gray-100 dark:border-gray-700">
          <h2 id="tambah-akses-title" className="text-lg font-semibold text-gray-800 dark:text-white">
            Tambah akses
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Tutup"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Tambah mode akses ke akun ini. Untuk saudara yang juga santri, masukkan NIS saudara pada tab Santri
            agar biodata saudara bisa dibuka dari akun yang sama. Setelah verifikasi WhatsApp, buka link
            balasan di Profil (tanpa buat username/password baru).
          </p>
          {(hidePjgt || hideToko) && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400/90 leading-relaxed">
              {hidePjgt && hideToko
                ? 'Tab PJGT dan Toko disembunyikan karena akun ini sudah punya akses tersebut (maksimal satu per akun).'
                : hidePjgt
                  ? 'Tab PJGT disembunyikan karena akun ini sudah punya akses PJGT (maksimal satu per akun).'
                  : 'Tab Toko disembunyikan karena akun ini sudah punya akses toko (maksimal satu per akun).'}
            </p>
          )}

          {modes.length > 1 ? (
            <div className="flex gap-2 p-1 rounded-xl bg-gray-100 dark:bg-gray-900/50">
              {modes.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  disabled={!!waPrepare || !!claimSuccess}
                  onClick={() => {
                    setMode(m.key)
                    setError('')
                    setClaimOpen(false)
                  }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    mode === m.key
                      ? 'bg-white dark:bg-gray-800 text-primary-700 dark:text-primary-300 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400'
                  } disabled:opacity-60`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          ) : null}

          {claimSuccess ? (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-3 space-y-2">
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Pengajuan terkirim</p>
              <p className="text-xs text-emerald-700/90 dark:text-emerald-400/90 leading-relaxed">
                {claimSuccess.message}
                {claimSuccess.nama
                  ? ` (NIS ${claimSuccess.nis} — ${claimSuccess.nama}).`
                  : claimSuccess.nis
                    ? ` (NIS ${claimSuccess.nis}).`
                    : ''}{' '}
                Admin akan meninjau KK Anda.
              </p>
              <button
                type="button"
                onClick={handleClose}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700"
              >
                Tutup
              </button>
            </div>
          ) : waPrepare ? (
            <WaPreparePanel
              message={waPrepare.message}
              waMeUrl={waPrepare.wa_me_url}
              waMessage={waPrepare.wa_message}
              expiresInMinutes={waPrepare.expires_in_minutes || 30}
              onReset={resetFormKeepMode}
              resetLabel="Isi ulang formulir"
            />
          ) : claimOpen && linkedOther ? (
            <form onSubmit={handleClaimSubmit} className="space-y-3">
              <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Ajukan akses santri</p>
                <p className="text-xs text-amber-700/90 dark:text-amber-400/90 mt-1 leading-relaxed">
                  NIS {normalizeNisInput(nis)}
                  {santriNamaHint ? ` (${santriNamaHint})` : ''} sudah tertaut akun lain. Isi NIK santri tersebut
                  dan unggah Kartu Keluarga sebagai bukti hubungan (mis. saudara), seperti pengajuan NIS.
                </p>
              </div>
              <div>
                <NikFieldLabel className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1" />
                <input
                  type="text"
                  inputMode="numeric"
                  value={claimNik}
                  onChange={(e) => setClaimNik(normalizeNikInput(e.target.value))}
                  className={`${inputClass} font-mono`}
                  placeholder="16 digit NIK"
                  maxLength={16}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Kartu Keluarga (KK)
                </label>
                <input
                  type="file"
                  accept="image/*,.pdf,application/pdf"
                  onChange={handleKkPick}
                  disabled={preparingKk || loading}
                  className="block w-full text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700 dark:file:bg-primary-900/40 dark:file:text-primary-300"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Foto/scan KK: maks. {KK_MAX_IMAGE_MB} MB; PDF maks. {KK_MAX_PDF_MB} MB.
                </p>
                {fileMeta ? (
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                    {fileMeta.name} · {formatFileSize(fileMeta.size)}
                    {fileMeta.isPdf ? ' · PDF' : ''}
                  </p>
                ) : null}
              </div>
              {error ? (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl px-3 py-2">
                  {error}
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setClaimOpen(false)
                    setError('')
                    clearKkPreview()
                  }}
                  className="flex-1 py-3 rounded-xl font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading || preparingKk}
                  className="flex-1 py-3 rounded-xl font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60"
                >
                  {loading ? 'Mengirim…' : 'Kirim pengajuan'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === 'santri' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">NIS</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={nis}
                      onChange={(e) => setNis(normalizeNisInput(e.target.value))}
                      className={`${inputClass} font-mono`}
                      placeholder="NIS santri / saudara"
                      required
                      autoFocus
                    />
                    {nisChecking ? (
                      <p className="text-[11px] text-gray-400 mt-1">Memeriksa NIS…</p>
                    ) : null}
                    <p className="text-center pt-1">
                      <Link
                        to="/lupa-nis"
                        onClick={handleClose}
                        className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                      >
                        Tidak tahu NIS?
                      </Link>
                    </p>
                  </div>

                  {alreadyHere ? (
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5">
                      <p className="text-sm text-amber-800 dark:text-amber-300">
                        {nisStatus.message || 'NIS ini sudah ada di akun Anda.'}
                        {santriNamaHint ? ` (${santriNamaHint})` : ''}
                      </p>
                    </div>
                  ) : null}

                  {nisStatus?.code === 'not_found' ? (
                    <div className="rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 px-3 py-2.5">
                      <p className="text-sm text-red-700 dark:text-red-300">
                        {nisStatus.message || 'NIS tidak ditemukan.'}
                      </p>
                    </div>
                  ) : null}

                  {linkedOther ? (
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 space-y-2">
                      <p className="text-sm text-amber-800 dark:text-amber-300">
                        {nisStatus.message || 'NIS ini sudah tertaut ke akun lain.'}
                        {santriNamaHint ? ` (${santriNamaHint})` : ''}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setClaimOpen(true)
                          setClaimNik(normalizeNikInput(nik))
                          setError('')
                        }}
                        className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700"
                      >
                        Ajukan akses santri dengan NIS ini
                      </button>
                    </div>
                  ) : null}

                  {!alreadyHere && !linkedOther && nisStatus?.code !== 'not_found' ? (
                    <div>
                      <NikFieldLabel className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1" />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={nik}
                        onChange={(e) => setNik(normalizeNikInput(e.target.value))}
                        className={`${inputClass} font-mono`}
                        placeholder="16 digit NIK"
                        maxLength={16}
                        required
                      />
                    </div>
                  ) : null}
                </>
              )}

              {mode === 'pjgt' && (
                <>
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                        Identitas madrasah
                      </label>
                      <button
                        type="button"
                        onClick={() => setPjgtQrOpen(true)}
                        className="text-xs font-medium text-primary-600 dark:text-primary-400"
                      >
                        Scan QR
                      </button>
                    </div>
                    <input
                      type="text"
                      value={identitas}
                      onChange={(e) => setIdentitas(e.target.value)}
                      className={inputClass}
                      placeholder="Identitas / kode madrasah"
                      required
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Nama madrasah
                    </label>
                    <input
                      type="text"
                      value={namaMadrasah}
                      onChange={(e) => setNamaMadrasah(e.target.value)}
                      className={inputClass}
                      placeholder="Nama madrasah"
                      required
                    />
                  </div>
                </>
              )}

              {mode === 'toko' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Kode toko</label>
                    <input
                      type="text"
                      value={kodeToko}
                      onChange={(e) => setKodeToko(e.target.value)}
                      className={inputClass}
                      placeholder="Kode toko"
                      required
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nama toko</label>
                    <input
                      type="text"
                      value={namaToko}
                      onChange={(e) => setNamaToko(e.target.value)}
                      className={inputClass}
                      placeholder="Nama toko"
                      required
                    />
                  </div>
                </>
              )}

              {mode !== 'santri' || (!alreadyHere && !linkedOther && nisStatus?.code !== 'not_found') ? (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Nomor WhatsApp akun
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-gray-400">+62</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={noWa.replace(/^62/, '').replace(/^0/, '')}
                      onChange={(e) => {
                        let d = e.target.value.replace(/\D/g, '')
                        if (d.startsWith('0')) d = d.slice(1)
                        setNoWa(d ? `62${d}` : '')
                      }}
                      className={`${inputClass} pl-12 font-mono`}
                      placeholder="81234567890"
                      required
                    />
                  </div>
                  <WaCheckHint
                    waHint={waHint}
                    waChecking={waChecking}
                    waVerified={waVerified}
                    waCanRetry={waCanRetry}
                    onRetry={retryWaCheck}
                    showManualConfirm={showManualWaConfirm}
                    waManualConfirmed={waManualConfirmed}
                    onManualConfirmChange={setWaManualConfirmedChecked}
                    manualRetryClickCount={manualRetryClickCount}
                  />
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                    Harus sama dengan nomor WhatsApp yang terdaftar di akun ini.
                  </p>
                </div>
              ) : null}

              {error ? (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl px-3 py-2">
                  {error}
                </p>
              ) : null}

              {mode !== 'santri' || (!alreadyHere && !linkedOther && nisStatus?.code !== 'not_found') ? (
                <button
                  type="submit"
                  disabled={loading || !waAcceptedForSubmit || nisChecking}
                  className="w-full py-3 rounded-xl font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 transition-colors"
                >
                  {loading ? 'Memproses…' : 'Lanjut verifikasi WhatsApp'}
                </button>
              ) : null}
            </form>
          )}
        </div>
      </motion.div>

      <DaftarPjgtQrScannerOffcanvas
        isOpen={pjgtQrOpen}
        onClose={() => setPjgtQrOpen(false)}
        onSuccess={({ identitas: id, nama }) => {
          if (id) setIdentitas(String(id))
          if (nama) setNamaMadrasah(String(nama))
          setPjgtQrOpen(false)
        }}
      />
    </AnimatePresence>,
    document.body
  )
}
