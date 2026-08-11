import { useState, useEffect, useRef, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { authAPI } from '../services/api'
import { APP_VERSION } from '../config/version'
import { getGambarUrl } from '../config/images'
import { useHtmlDarkClass } from '../hooks/useHtmlDarkClass'
import { normalizeNikInput, isNikValid, normalizeNisInput } from '../utils/nikUtils'
import NikFieldLabel from '../components/Auth/NikFieldLabel'
import DaftarPjgtQrScannerOffcanvas from '../components/Auth/DaftarPjgtQrScannerOffcanvas'
import { WaCheckHint } from '../components/Auth/WaCheckHint'
import { useWaNumberProbe } from '../hooks/useWaNumberProbe'
import { LENGKAPI_DAFTAR_INTENT_KEY } from '../config/lengkapiDaftarIntent'
import { setStoredLoginUsername } from '../utils/passkeyLoginPrefs'
import WaPreparePanel from '../components/Auth/WaPreparePanel'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { y: 24, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 120, damping: 18 },
  },
}

const inputClass =
  'w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white/95 dark:bg-gray-800/95 md:bg-gray-50/50 md:dark:bg-gray-700/50 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all font-mono'

export function DaftarFormCard({ variant = 'santri' } = {}) {
  const location = useLocation()
  const navigate = useNavigate()
  const isPjgt = variant === 'pjgt' || location.pathname.includes('pjgt')
  const isToko = variant === 'toko' || location.pathname.includes('toko')

  const [nis, setNis] = useState('')
  const [nik, setNik] = useState('')
  const [identitas, setIdentitas] = useState('')
  const [namaMadrasah, setNamaMadrasah] = useState('')
  const [kodeToko, setKodeToko] = useState('')
  const [namaToko, setNamaToko] = useState('')
  const [noWa, setNoWa] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmModal, setConfirmModal] = useState(null)
  const [waPrepare, setWaPrepare] = useState(null)
  const [pjgtLinkOpen, setPjgtLinkOpen] = useState(false)
  const [santriLinkOpen, setSantriLinkOpen] = useState(false)
  const [tokoLinkOpen, setTokoLinkOpen] = useState(false)
  const [pjgtRequireNamaPjgt, setPjgtRequireNamaPjgt] = useState(false)
  const [tokoRequirePj, setTokoRequirePj] = useState(false)
  const [linkUsername, setLinkUsername] = useState('')
  const [linkPassword, setLinkPassword] = useState('')
  const [linkNamaProfil, setLinkNamaProfil] = useState('')
  const [linkNamaPjgt, setLinkNamaPjgt] = useState('')
  const [linkPenanggungJawab, setLinkPenanggungJawab] = useState('')
  const [flipPhase, setFlipPhase] = useState('idle')
  const [pjgtQrOpen, setPjgtQrOpen] = useState(false)
  const [fromLengkapiPortal, setFromLengkapiPortal] = useState(false)
  /** Username akun sebelum logout (LengkapiPortal) — dipakai saat modal need_verify_existing_user. */
  const linkUsernamePrefillRef = useRef('')
  const lengkapiPrimaryFieldRef = useRef(null)
  const prevThemeRef = useRef(null)
  const isDark = useHtmlDarkClass()

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LENGKAPI_DAFTAR_INTENT_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!parsed || parsed.v !== 1) {
        sessionStorage.removeItem(LENGKAPI_DAFTAR_INTENT_KEY)
        return
      }
      const wantPjgt = parsed.mode === 'pjgt'
      const wantSantri = parsed.mode === 'santri'
      const routeOk = isPjgt ? wantPjgt : wantSantri
      if (!routeOk) return
      sessionStorage.removeItem(LENGKAPI_DAFTAR_INTENT_KEY)
      const u = String(parsed.username || '').trim()
      if (u.length >= 5) linkUsernamePrefillRef.current = u
      setFromLengkapiPortal(true)
    } catch {
      sessionStorage.removeItem(LENGKAPI_DAFTAR_INTENT_KEY)
    }
  }, [isPjgt])

  useEffect(() => {
    if (isPjgt) return
    const params = new URLSearchParams(location.search)
    const qNis = params.get('nis')
    const qNik = params.get('nik')
    if (qNis && String(qNis).replace(/\D/g, '').length >= 7) {
      setNis(normalizeNisInput(String(qNis)))
    }
    if (qNik && String(qNik).replace(/\D/g, '').length >= 16) {
      setNik(normalizeNikInput(String(qNik)))
    }
  }, [isPjgt, location.search])

  useEffect(() => {
    if (!fromLengkapiPortal) return undefined
    const t = window.requestAnimationFrame(() => {
      lengkapiPrimaryFieldRef.current?.focus?.()
    })
    return () => window.cancelAnimationFrame(t)
  }, [fromLengkapiPortal])

  const applyLinkUsernamePrefill = () => {
    const u = String(linkUsernamePrefillRef.current || '').trim()
    linkUsernamePrefillRef.current = ''
    return u.length >= 5 ? u : ''
  }

  useEffect(() => {
    if (prevThemeRef.current === null) {
      prevThemeRef.current = isDark
      return
    }
    if (prevThemeRef.current !== isDark) {
      prevThemeRef.current = isDark
      setFlipPhase('close')
    }
  }, [isDark])

  const handleInputCloseComplete = () => {
    if (flipPhase === 'close') setFlipPhase('open')
  }

  const handleInputOpenComplete = () => {
    if (flipPhase === 'open') setFlipPhase('idle')
  }

  const loginPath = isPjgt ? '/login-pjgt' : '/login'
  const daftarJudul = isToko ? 'Toko' : isPjgt ? 'PJGT' : 'Wali Santri'

  // Pre-bundle @zxing saat halaman daftar PJGT dibuka (hindari 504 Outdated Optimize Dep saat Scan QR).
  useEffect(() => {
    if (!isPjgt) return undefined
    let cancelled = false
    import('@zxing/browser').catch(() => {
      if (!cancelled && import.meta.env.DEV) {
        /* vite:preloadError / reload di main.jsx menangani deps kedaluwarsa */
      }
    })
    return () => {
      cancelled = true
    }
  }, [isPjgt])

  const waProbeHints = useMemo(
    () => ({
      empty:
        'Nomor akan dicek ke WhatsApp otomatis setelah terisi (min. 10 digit). Tombol Daftar aktif jika nomor aktif di WA.',
      ok: 'Nomor WhatsApp aktif — Anda bisa mendaftar.',
      serverDown:
        'Layanan cek WhatsApp sedang bermasalah. Sesuaikan Pengaturan → Notifikasi di eBeddien (WA server / WatZap / Evolution), lalu ketuk Coba cek lagi.',
    }),
    []
  )
  const {
    waProbe,
    waChecking,
    waHint,
    waCanRetry,
    retryWaCheck,
    waVerified,
    waAcceptedForSubmit,
    waManualConfirmed,
    setWaManualConfirmedChecked,
    showManualWaConfirm,
    manualRetryClickCount,
    waDigitsLen,
  } = useWaNumberProbe(noWa, { hints: waProbeHints })
  const canSubmitDaftar = waAcceptedForSubmit && !waChecking && waDigitsLen >= 10
  const waSubmitBlockedMessage =
    showManualWaConfirm && !waManualConfirmed
      ? 'Centang pernyataan nomor WA di bawah input, atau tutup jendela dan coba cek lagi.'
      : 'Nomor WhatsApp belum terverifikasi aktif. Tutup dan periksa nomor.'

  const handleDaftar = async (e) => {
    e.preventDefault()
    setError('')
    setConfirmModal(null)
    setPjgtLinkOpen(false)
    setSantriLinkOpen(false)
    setTokoLinkOpen(false)

    if (!canSubmitDaftar) {
      if (showManualWaConfirm && !waManualConfirmed) {
        setError(
          'Pengecekan WhatsApp gagal berulang. Centang pernyataan di bawah nomor WA atau ketuk Coba cek lagi.'
        )
      } else {
        setError(
          waProbe === 'server_down'
            ? waHint ||
                'Layanan cek WhatsApp sedang bermasalah. Periksa koneksi internet atau ketuk Coba cek lagi di bawah nomor WA.'
            : 'Tunggu hingga nomor WhatsApp terverifikasi aktif, lalu coba lagi.'
        )
      }
      return
    }

    if (isToko) {
      const kodeTrim = kodeToko.trim()
      const namaTrim = namaToko.trim()
      if (kodeTrim === '' || namaTrim === '' || noWa.trim() === '') {
        setError('Kode toko, nama toko, dan No. HP harus diisi.')
        return
      }
      setLoading(true)
      try {
        const res = await authAPI.daftarCheckToko(kodeTrim, namaTrim, noWa.trim())
        if (!res.success) {
          setError(res.message || 'Gagal cek data')
          return
        }
        if (res.already_registered) {
          setError(res.message || 'Akun sudah terdaftar. Silakan login.')
          return
        }
        if (res.need_verify_existing_user) {
          setTokoRequirePj(!!res.require_penanggung_jawab)
          setLinkUsername(applyLinkUsernamePrefill())
          setLinkPassword('')
          setLinkPenanggungJawab('')
          setTokoLinkOpen(true)
          return
        }
        setConfirmModal({ nama: res.nama || 'Toko', no_wa: res.no_wa })
      } catch (err) {
        setError(err.response?.data?.message || 'Terjadi kesalahan. Coba lagi.')
        if (err.response?.status === 429) {
          setError(err.response?.data?.message || 'Terlalu banyak percobaan daftar. Coba lagi nanti.')
        }
      } finally {
        setLoading(false)
      }
      return
    }

    if (isPjgt) {
      const idTrim = identitas.trim()
      const namaTrim = namaMadrasah.trim()
      if (idTrim === '' || namaTrim === '' || noWa.trim() === '') {
        setError('Identitas, nama madrasah, dan No. HP harus diisi.')
        return
      }
      setLoading(true)
      try {
        const res = await authAPI.daftarCheckMadrasahPjgt(idTrim, namaTrim, noWa.trim())
        if (!res.success) {
          setError(res.message || 'Gagal cek data')
          return
        }
        if (res.already_registered) {
          setError(res.message || 'Akun sudah terdaftar. Silakan login.')
          return
        }
        if (res.need_verify_existing_user) {
          setPjgtRequireNamaPjgt(!!res.require_nama_pjgt)
          setLinkUsername(applyLinkUsernamePrefill())
          setLinkPassword('')
          setLinkNamaProfil('')
          setLinkNamaPjgt('')
          setPjgtLinkOpen(true)
          return
        }
        setConfirmModal({ nama: res.nama || 'Madrasah', no_wa: res.no_wa })
      } catch (err) {
        setError(err.response?.data?.message || 'Terjadi kesalahan. Coba lagi.')
        if (err.response?.status === 429) {
          setError(err.response?.data?.message || 'Terlalu banyak percobaan daftar. Coba lagi nanti.')
        }
      } finally {
        setLoading(false)
      }
      return
    }

    const nisTrim = nis.trim()
    const nikTrim = nik.trim()
    if (nisTrim.length < 7) {
      setError('NIS harus 7 digit.')
      return
    }
    if (!isNikValid(nikTrim)) {
      setError('Coba kembali periksa NIK.')
      return
    }

    setLoading(true)
    try {
      const res = await authAPI.daftarCheckSantri(nisTrim, nikTrim, noWa.trim())
      if (!res.success) {
        setError(res.message || 'Gagal cek data')
        return
      }
      if (res.already_registered) {
        setError(res.message || 'Akun sudah terdaftar. Silakan login.')
        return
      }
      if (res.need_verify_existing_user) {
        setLinkUsername(applyLinkUsernamePrefill())
        setLinkPassword('')
        setLinkNamaProfil('')
        setSantriLinkOpen(true)
        return
      }
      setConfirmModal({ nama: res.nama || 'Santri', no_wa: res.no_wa })
    } catch (err) {
      setError(err.response?.data?.message || 'Terjadi kesalahan. Coba lagi.')
      if (err.response?.status === 429) {
        setError(err.response?.data?.message || 'Terlalu banyak percobaan daftar. Coba lagi nanti.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleKonfirmasi = async () => {
    if (!confirmModal) return
    setError('')

    if (!canSubmitDaftar) {
      setError(waSubmitBlockedMessage)
      return
    }

    if (isToko) {
      const kodeTrim = kodeToko.trim()
      const namaTrim = namaToko.trim()
      if (kodeTrim === '' || namaTrim === '' || noWa.trim() === '') {
        setError('Data tidak lengkap.')
        return
      }
      setLoading(true)
      try {
        const res = await authAPI.daftarKonfirmasiToko(kodeTrim, namaTrim, noWa.trim())
        if (res.success) {
          setConfirmModal(null)
          const waMeUrl = String(res.wa_me_url || '').trim()
          if (waMeUrl) {
            setWaPrepare({
              message: res.message,
              wa_me_url: waMeUrl,
              wa_message: res.wa_message || '',
              expires_in_minutes: res.expires_in_minutes || 30,
            })
            return
          }
          setError('Tautan WhatsApp tidak ditemukan. Coba lagi.')
        } else {
          setError(res.message || 'Gagal melanjutkan pendaftaran')
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Gagal melanjutkan pendaftaran.')
        if (err.response?.status === 429) {
          setError(err.response?.data?.message || 'Terlalu banyak percobaan. Coba lagi nanti.')
        }
      } finally {
        setLoading(false)
      }
      return
    }

    if (isPjgt) {
      const idTrim = identitas.trim()
      const namaTrim = namaMadrasah.trim()
      if (idTrim === '' || namaTrim === '' || noWa.trim() === '') {
        setError('Data tidak lengkap.')
        return
      }
      setLoading(true)
      try {
        const res = await authAPI.daftarKonfirmasiMadrasahPjgt(idTrim, namaTrim, noWa.trim())
        if (res.success) {
          setConfirmModal(null)
          const waMeUrl = String(res.wa_me_url || '').trim()
          if (waMeUrl) {
            setWaPrepare({
              message: res.message,
              wa_me_url: waMeUrl,
              wa_message: res.wa_message || '',
              expires_in_minutes: res.expires_in_minutes || 30,
            })
            return
          }
          setError('Tautan WhatsApp tidak ditemukan. Coba lagi.')
        } else {
          setError(res.message || 'Gagal melanjutkan pendaftaran')
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Gagal melanjutkan pendaftaran.')
        if (err.response?.status === 429) {
          setError(err.response?.data?.message || 'Terlalu banyak percobaan. Coba lagi nanti.')
        }
      } finally {
        setLoading(false)
      }
      return
    }

    const nikTrim = nik.trim()
    if (!isNikValid(nikTrim)) {
      setError('Coba kembali periksa NIK.')
      return
    }

    setLoading(true)
    try {
      const res = await authAPI.daftarKonfirmasiSantri(nis.trim(), nikTrim, noWa.trim())
      if (res.success) {
        setConfirmModal(null)
        const waMeUrl = String(res.wa_me_url || '').trim()
        if (waMeUrl) {
          setWaPrepare({
            message: res.message,
            wa_me_url: waMeUrl,
            wa_message: res.wa_message || '',
            expires_in_minutes: res.expires_in_minutes || 30,
          })
          return
        }
        setError('Tautan WhatsApp tidak ditemukan. Coba lagi.')
      } else {
        setError(res.message || 'Gagal melanjutkan pendaftaran')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal melanjutkan pendaftaran.')
      if (err.response?.status === 429) {
        setError(err.response?.data?.message || 'Terlalu banyak percobaan. Coba lagi nanti.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleTokoHubungAkun = async () => {
    setError('')
    if (!canSubmitDaftar) {
      setError(waSubmitBlockedMessage)
      return
    }
    const kodeTrim = kodeToko.trim()
    const namaTrim = namaToko.trim()
    if (kodeTrim === '' || namaTrim === '' || noWa.trim() === '') {
      setError('Data tidak lengkap.')
      return
    }
    if (linkUsername.trim().length < 5) {
      setError('Username minimal 5 karakter.')
      return
    }
    if (tokoRequirePj && linkPenanggungJawab.trim().length < 2) {
      setError('Isi nama penanggung jawab sesuai data toko.')
      return
    }
    if (linkPassword.length < 6) {
      setError('Password akun minimal 6 karakter.')
      return
    }
    setLoading(true)
    try {
      const res = await authAPI.daftarTokoHubungAkun({
        kode_toko: kodeTrim,
        nama_toko: namaTrim,
        no_wa: noWa.trim(),
        username: linkUsername.trim(),
        penanggung_jawab_nama: linkPenanggungJawab.trim(),
        password: linkPassword,
      })
      if (res.success) {
        setTokoLinkOpen(false)
        setStoredLoginUsername(linkUsername.trim())
        navigate('/login', { replace: true })
      } else {
        setError(res.message || 'Gagal menghubungkan akun.')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghubungkan akun.')
      if (err.response?.status === 429) {
        setError(err.response?.data?.message || 'Terlalu banyak percobaan. Coba lagi nanti.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSantriHubungAkun = async () => {
    setError('')
    if (!canSubmitDaftar) {
      setError(waSubmitBlockedMessage)
      return
    }
    const nisTrim = nis.trim()
    const nikTrim = nik.trim()
    if (nisTrim.length < 7 || !isNikValid(nikTrim)) {
      setError('NIS dan NIK tidak lengkap.')
      return
    }
    if (linkUsername.trim().length < 5) {
      setError('Username minimal 5 karakter.')
      return
    }
    if (linkNamaProfil.trim().length < 2) {
      setError('Isi nama sesuai data santri di pusat.')
      return
    }
    if (linkPassword.length < 6) {
      setError('Password akun minimal 6 karakter.')
      return
    }
    setLoading(true)
    try {
      const res = await authAPI.daftarSantriHubungAkun({
        nis: nisTrim,
        nik: nikTrim,
        no_wa: noWa.trim(),
        username: linkUsername.trim(),
        nama_profil: linkNamaProfil.trim(),
        password: linkPassword,
      })
      if (res.success) {
        setSantriLinkOpen(false)
        setStoredLoginUsername(linkUsername.trim())
        navigate('/login', { replace: true })
      } else {
        setError(res.message || 'Gagal menghubungkan akun.')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghubungkan akun.')
      if (err.response?.status === 429) {
        setError(err.response?.data?.message || 'Terlalu banyak percobaan. Coba lagi nanti.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handlePjgtHubungAkun = async () => {
    setError('')
    if (!canSubmitDaftar) {
      setError(waSubmitBlockedMessage)
      return
    }
    const idTrim = identitas.trim()
    const namaTrim = namaMadrasah.trim()
    if (idTrim === '' || namaTrim === '' || noWa.trim() === '') {
      setError('Data tidak lengkap.')
      return
    }
    if (linkUsername.trim().length < 5) {
      setError('Username minimal 5 karakter.')
      return
    }
    if (linkNamaProfil.trim().length < 2) {
      setError('Isi nama sesuai data santri atau pengurus.')
      return
    }
    if (pjgtRequireNamaPjgt && linkNamaPjgt.trim().length < 2) {
      setError('Isi nama kontak PJGT sesuai data madrasah.')
      return
    }
    if (linkPassword.length < 6) {
      setError('Password akun minimal 6 karakter.')
      return
    }
    setLoading(true)
    try {
      const res = await authAPI.daftarPjgtHubungAkun({
        identitas: idTrim,
        nama: namaTrim,
        no_wa: noWa.trim(),
        username: linkUsername.trim(),
        nama_profil: linkNamaProfil.trim(),
        nama_pjgt: linkNamaPjgt.trim(),
        password: linkPassword,
      })
      if (res.success) {
        setPjgtLinkOpen(false)
        setStoredLoginUsername(linkUsername.trim())
        navigate('/login-pjgt', { replace: true })
      } else {
        setError(res.message || 'Gagal menghubungkan akun.')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghubungkan akun.')
      if (err.response?.status === 429) {
        setError(err.response?.data?.message || 'Terlalu banyak percobaan. Coba lagi nanti.')
      }
    } finally {
      setLoading(false)
    }
  }

  const flipMotionProps = {
    style: { transformStyle: 'preserve-3d', transformOrigin: 'bottom center' },
    animate: { rotateX: flipPhase === 'close' ? 90 : flipPhase === 'open' ? 0 : 0 },
    transition: { duration: 0.3, ease: [0.32, 0.72, 0, 1] },
    onAnimationComplete:
      flipPhase === 'close' ? handleInputCloseComplete : flipPhase === 'open' ? handleInputOpenComplete : undefined,
  }

  return (
    <>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-[400px] relative z-10"
      >
        <motion.div
          variants={itemVariants}
          className="relative p-4 md:p-10 md:rounded-3xl md:bg-white/90 md:dark:bg-gray-800/90 md:backdrop-blur-xl md:border md:border-white/40 md:dark:border-gray-600/40 md:login-card-glow"
        >
          <div className="md:hidden text-center mb-8" style={{ perspective: '800px' }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={isDark ? 'dark' : 'light'}
                className="inline-block"
                initial={{ rotateY: -90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                exit={{ rotateY: 90, opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
                style={{ transformStyle: 'preserve-3d' }}
              >
                {isDark ? (
                  <>
                    <motion.img
                      src={getGambarUrl('/icon/mybeddienlogo.png')}
                      alt="myBeddien"
                      className="max-w-[100px] w-auto h-12 mx-auto mb-2 object-contain drop-shadow-md"
                      whileHover={{ scale: 1.03 }}
                    />
                    <motion.img
                      src={getGambarUrl('/icon/mybeddientextputih.png')}
                      alt="myBeddien"
                      className="max-w-[120px] w-auto h-10 mx-auto object-contain"
                      whileHover={{ scale: 1.03 }}
                    />
                  </>
                ) : (
                  <>
                    <motion.img
                      src={getGambarUrl('/icon/mybeddienlogo.png')}
                      alt="myBeddien"
                      className="max-w-[100px] w-auto h-12 mx-auto mb-2 object-contain"
                      whileHover={{ scale: 1.03 }}
                    />
                    <motion.img
                      src={getGambarUrl('/icon/mybeddientexthitam.png')}
                      alt="myBeddien"
                      className="max-w-[120px] w-auto h-10 mx-auto object-contain"
                      whileHover={{ scale: 1.03 }}
                    />
                  </>
                )}
              </motion.div>
            </AnimatePresence>
            <div className="flex justify-center gap-1.5 mt-3 text-xs text-gray-500 dark:text-gray-400">
              <span className="font-mono">v{APP_VERSION}</span>
            </div>
          </div>

          <div className="hidden md:block text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1 tracking-tight">{daftarJudul}</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {isToko
                ? 'Masukkan kode toko, nama toko, dan No. HP (WhatsApp) sesuai data.'
                : isPjgt
                  ? 'Masukkan identitas madrasah, nama madrasah, dan No. HP PJGT (WhatsApp) sesuai data.'
                  : 'Masukkan NIS, NIK, dan No. HP (WhatsApp) yang terdaftar.'}
            </p>
          </div>

          {fromLengkapiPortal && (
            <div
              role="status"
              className="mb-5 rounded-xl border border-primary-200/80 dark:border-primary-700/60 bg-primary-50/90 dark:bg-primary-950/35 px-3.5 py-3 text-left"
            >
              <p className="text-xs font-semibold text-primary-900 dark:text-primary-200 mb-1">Melengkapi akses myBeddien</p>
              <p className="text-xs text-primary-800/95 dark:text-primary-100/90 leading-relaxed">
                {isToko
                  ? 'Isi kode & nama toko serta nomor WhatsApp yang aktif, lalu ketuk Daftar. Jika nomor sudah dipakai akun lain, lengkapi username dan password di jendela penautan.'
                  : isPjgt
                    ? 'Isi identitas & nama madrasah serta nomor WhatsApp PJGT yang aktif, lalu ketuk Daftar. Jika nomor sudah dipakai akun lain, lengkapi username dan password di jendela penautan (username akun Anda bisa sudah terisi).'
                    : 'Isi NIS, NIK, dan nomor WhatsApp yang aktif, lalu ketuk Daftar. Jika nomor sudah dipakai akun lain, isi username dan password di jendela penautan (username akun Anda bisa sudah terisi).'}
              </p>
            </div>
          )}

          {waPrepare ? (
            <WaPreparePanel
              message={waPrepare.message}
              waMeUrl={waPrepare.wa_me_url}
              waMessage={waPrepare.wa_message}
              expiresInMinutes={waPrepare.expires_in_minutes || 30}
              onReset={() => setWaPrepare(null)}
            />
          ) : (
          <form onSubmit={handleDaftar} className="space-y-5" style={{ perspective: '600px' }}>
            {isToko ? (
              <>
                <motion.div variants={itemVariants} className="space-y-1" {...flipMotionProps}>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Kode toko</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                      </svg>
                    </span>
                    <input
                      ref={lengkapiPrimaryFieldRef}
                      type="text"
                      value={kodeToko}
                      onChange={(e) => setKodeToko(e.target.value)}
                      className={`${inputClass} font-sans`}
                      placeholder="Kode toko"
                      required
                      autoFocus
                    />
                  </div>
                </motion.div>
                <motion.div variants={itemVariants} className="space-y-1" {...flipMotionProps}>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nama toko</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={namaToko}
                      onChange={(e) => setNamaToko(e.target.value)}
                      className={`${inputClass} font-sans`}
                      placeholder="Nama toko (sama dengan data)"
                      required
                    />
                  </div>
                </motion.div>
              </>
            ) : isPjgt ? (
              <>
                <motion.div variants={itemVariants} className="space-y-1" {...flipMotionProps}>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Identitas madrasah</label>
                  <div className="flex items-stretch gap-2">
                    <div className="relative flex-1 min-w-0">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                        </svg>
                      </span>
                      <input
                        ref={lengkapiPrimaryFieldRef}
                        type="text"
                        value={identitas}
                        onChange={(e) => setIdentitas(e.target.value)}
                        className={`${inputClass} font-sans w-full`}
                        placeholder="Identitas madrasah"
                        required
                        autoFocus
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setPjgtQrOpen(true)}
                      className="flex flex-col items-center justify-center gap-0.5 shrink-0 w-13 px-1 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white/95 dark:bg-gray-800/95 text-primary-600 dark:text-primary-400 hover:border-primary-500 dark:hover:border-primary-500 hover:bg-primary-50/80 dark:hover:bg-primary-900/25 transition-colors"
                      aria-label="Scan QR identitas madrasah"
                    >
                      <span className="text-[10px] font-medium leading-tight text-gray-600 dark:text-gray-400">Scan QR</span>
                      <svg className="w-auto h-full max-h-7 min-h-4.5 flex-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                      </svg>
                    </button>
                  </div>
                </motion.div>
                <motion.div variants={itemVariants} className="space-y-1" {...flipMotionProps}>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nama madrasah</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={namaMadrasah}
                      onChange={(e) => setNamaMadrasah(e.target.value)}
                      className={`${inputClass} font-sans`}
                      placeholder="Nama lengkap madrasah (sama dengan data)"
                      required
                    />
                  </div>
                </motion.div>
              </>
            ) : (
              <>
                <motion.div variants={itemVariants} className="space-y-1" {...flipMotionProps}>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">NIS Santri</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                      </svg>
                    </span>
                    <input
                      ref={lengkapiPrimaryFieldRef}
                      type="text"
                      inputMode="numeric"
                      value={nis}
                      onChange={(e) => setNis(normalizeNisInput(e.target.value))}
                      className={inputClass}
                      placeholder="7 digit NIS"
                      maxLength={7}
                      required
                      autoFocus
                    />
                  </div>
                  {nis.length > 0 && nis.length !== 7 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 pl-1">{nis.length}/7 digit</p>
                  )}
                  <p className="text-center pt-1">
                    <Link
                      to="/lupa-nis"
                      className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      Tidak tahu NIS?
                    </Link>
                  </p>
                </motion.div>

                <motion.div variants={itemVariants} className="space-y-1" {...flipMotionProps}>
                  <NikFieldLabel required />
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={nik}
                      onChange={(e) => setNik(normalizeNikInput(e.target.value))}
                      className={`${inputClass} tracking-wide`}
                      placeholder="16 digit NIK"
                      maxLength={16}
                      required
                    />
                  </div>
                  {nik.length > 0 && nik.length !== 16 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 pl-1">{nik.length}/16 digit</p>
                  )}
                </motion.div>
              </>
            )}

            <motion.div variants={itemVariants} className="space-y-1" {...flipMotionProps}>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                No. HP (WhatsApp)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </span>
                <input
                  type="tel"
                  value={noWa}
                  onChange={(e) => setNoWa(e.target.value)}
                  className={`${inputClass} font-sans ${
                    waVerified
                      ? 'border-emerald-500/90 dark:border-emerald-500/70'
                      : waManualConfirmed
                        ? 'border-amber-500/90 dark:border-amber-500/70'
                        : ''
                  }`}
                  placeholder="08xxxxxxxxxx"
                  required
                  autoComplete="tel"
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
            </motion.div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 px-4 py-3 text-sm"
              >
                <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </motion.div>
            )}
            <motion.button
              variants={itemVariants}
              type="submit"
              disabled={loading || !canSubmitDaftar}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="w-full py-3.5 rounded-xl font-semibold text-white bg-linear-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed transition-all login-btn-glow shadow-md hover:shadow-lg"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Memeriksa...
                </span>
              ) : !canSubmitDaftar && waDigitsLen >= 10 && showManualWaConfirm && !waManualConfirmed ? (
                'Centang konfirmasi nomor WA'
              ) : !canSubmitDaftar && waDigitsLen >= 10 ? (
                'Tunggu verifikasi WhatsApp…'
              ) : !canSubmitDaftar ? (
                'Isi & verifikasi nomor WA'
              ) : (
                'Daftar'
              )}
            </motion.button>

            <p className="text-center text-sm text-gray-600 dark:text-gray-400 pt-2">
              Sudah punya akun?{' '}
              <Link to={loginPath} className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
                Masuk
              </Link>
            </p>
          </form>
          )}
        </motion.div>
      </motion.div>

      {confirmModal && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50"
          onClick={() => !loading && setConfirmModal(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 max-w-sm w-full border border-gray-200 dark:border-gray-700"
          >
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">Konfirmasi Daftar</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">
              Daftar atas nama <strong>{confirmModal.nama}</strong>.
            </p>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">
              Nomor WhatsApp yang dipakai verifikasi:
            </p>
            <p className="font-mono text-primary-600 dark:text-primary-400 mb-2">{confirmModal.no_wa}</p>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
              Setelah konfirmasi, Anda akan diarahkan ke WhatsApp untuk verifikasi nomor, lalu mendapat link buat username & password.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                disabled={loading}
                className="flex-1 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleKonfirmasi}
                disabled={loading || !canSubmitDaftar}
                className="flex-1 py-2 rounded-xl font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? 'Menyiapkan...' : !canSubmitDaftar ? 'Nomor belum terverifikasi' : 'Konfirmasi'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {santriLinkOpen && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 overflow-y-auto"
          onClick={() => !loading && setSantriLinkOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 max-w-md w-full border border-gray-200 dark:border-gray-700 my-4"
          >
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">Hubungkan ke akun yang sudah ada</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
              Nomor WhatsApp ini sudah dipakai akun myBeddian. Untuk menautkan data santri (NIS/NIK) ke akun tersebut, isi
              username dan password akun, serta nama santri persis seperti di data pusat — sama seperti saat menghubungkan
              PJGT ke akun yang sudah ada.
            </p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Username akun</label>
                <input
                  type="text"
                  autoComplete="username"
                  value={linkUsername}
                  onChange={(e) => setLinkUsername(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                  placeholder="Username yang dipakai login"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Password akun</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={linkPassword}
                  onChange={(e) => setLinkPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                  placeholder="Password akun Anda"
                  minLength={1}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nama santri (sesuai data pusat)</label>
                <input
                  type="text"
                  value={linkNamaProfil}
                  onChange={(e) => setLinkNamaProfil(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                  placeholder="Persis seperti di data santri"
                />
              </div>
            </div>
            {error ? (
              <p className="text-red-600 dark:text-red-400 text-sm mb-3">{error}</p>
            ) : null}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => !loading && setSantriLinkOpen(false)}
                disabled={loading}
                className="flex-1 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSantriHubungAkun}
                disabled={loading || !canSubmitDaftar}
                className="flex-1 py-2 rounded-xl font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? 'Memproses…' : !canSubmitDaftar ? 'Nomor belum terverifikasi' : 'Hubungkan & ke login'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {pjgtLinkOpen && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 overflow-y-auto"
          onClick={() => !loading && setPjgtLinkOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 max-w-md w-full border border-gray-200 dark:border-gray-700 my-4"
          >
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">Hubungkan ke akun yang sudah ada</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
              Nomor WhatsApp ini sudah terdaftar sebagai akun myBeddian. Konfirmasi bahwa ini memang Anda: isi username,
              password akun, nama sesuai data santri atau pengurus di eBeddian, dan nama kontak PJGT di data madrasah (jika ada).
              Setelah berhasil, Anda bisa masuk dengan kredensial yang sama, dengan akses PJGT untuk madrasah ini.
            </p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Username akun</label>
                <input
                  type="text"
                  autoComplete="username"
                  value={linkUsername}
                  onChange={(e) => setLinkUsername(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                  placeholder="Username yang dipakai login"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Password akun</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={linkPassword}
                  onChange={(e) => setLinkPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                  placeholder="Password akun Anda"
                  minLength={1}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Nama sesuai data santri atau pengurus
                </label>
                <input
                  type="text"
                  value={linkNamaProfil}
                  onChange={(e) => setLinkNamaProfil(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                  placeholder="Persis seperti di data pusat"
                />
              </div>
              {pjgtRequireNamaPjgt ? (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Nama kontak PJGT (di data madrasah)
                  </label>
                  <input
                    type="text"
                    value={linkNamaPjgt}
                    onChange={(e) => setLinkNamaPjgt(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                    placeholder="Sesuai kolom nama PJGT"
                  />
                </div>
              ) : null}
            </div>
            {error ? (
              <p className="text-red-600 dark:text-red-400 text-sm mb-3">{error}</p>
            ) : null}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => !loading && setPjgtLinkOpen(false)}
                disabled={loading}
                className="flex-1 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handlePjgtHubungAkun}
                disabled={loading || !canSubmitDaftar}
                className="flex-1 py-2 rounded-xl font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? 'Memproses…' : !canSubmitDaftar ? 'Nomor belum terverifikasi' : 'Hubungkan & ke login'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {tokoLinkOpen && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 overflow-y-auto"
          onClick={() => !loading && setTokoLinkOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 max-w-md w-full border border-gray-200 dark:border-gray-700 my-4"
          >
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">Hubungkan ke akun yang sudah ada</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
              Nomor WhatsApp ini sudah terdaftar sebagai akun myBeddien. Isi username dan password akun
              {tokoRequirePj ? ', serta nama penanggung jawab sesuai data toko' : ''}. Setelah berhasil, login dengan
              kredensial yang sama untuk mengakses toko ini.
            </p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Username akun</label>
                <input
                  type="text"
                  autoComplete="username"
                  value={linkUsername}
                  onChange={(e) => setLinkUsername(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                  placeholder="Username yang dipakai login"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Password akun</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={linkPassword}
                  onChange={(e) => setLinkPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                  placeholder="Password akun Anda"
                  minLength={1}
                />
              </div>
              {tokoRequirePj ? (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Nama penanggung jawab (sesuai data toko)
                  </label>
                  <input
                    type="text"
                    value={linkPenanggungJawab}
                    onChange={(e) => setLinkPenanggungJawab(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                    placeholder="Persis seperti di data toko"
                  />
                </div>
              ) : null}
            </div>
            {error ? (
              <p className="text-red-600 dark:text-red-400 text-sm mb-3">{error}</p>
            ) : null}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => !loading && setTokoLinkOpen(false)}
                disabled={loading}
                className="flex-1 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleTokoHubungAkun}
                disabled={loading || !canSubmitDaftar}
                className="flex-1 py-2 rounded-xl font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? 'Memproses…' : !canSubmitDaftar ? 'Nomor belum terverifikasi' : 'Hubungkan & ke login'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {isPjgt ? (
        <DaftarPjgtQrScannerOffcanvas
          isOpen={pjgtQrOpen}
          onClose={() => setPjgtQrOpen(false)}
          onSuccess={({ identitas: idVal, nama, alreadyRegistered }) => {
            setIdentitas(idVal || '')
            setNamaMadrasah(nama || '')
            setError('')
            if (alreadyRegistered) {
              setError('Akun PJGT madrasah ini sudah terdaftar. Silakan login.')
            }
          }}
        />
      ) : null}
    </>
  )
}

export default DaftarFormCard
