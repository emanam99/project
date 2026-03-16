import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '../store/themeStore'
import { authAPI } from '../services/api'
import { APP_VERSION } from '../config/version'
import { getGambarUrl } from '../config/images'
import { normalizeNikInput, isNikValid } from '../utils/nikUtils'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } }
}
const itemVariants = {
  hidden: { y: 24, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 120, damping: 18 } }
}

export function DaftarFormCard() {
  const [idPengurus, setIdPengurus] = useState('')
  const [nik, setNik] = useState('')
  const [noWa, setNoWa] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmModal, setConfirmModal] = useState(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [flipPhase, setFlipPhase] = useState('idle')
  const prevThemeRef = useRef(null)
  const { theme } = useThemeStore()

  useEffect(() => {
    if (prevThemeRef.current === null) { prevThemeRef.current = theme; return }
    if (prevThemeRef.current !== theme) { prevThemeRef.current = theme; setFlipPhase('close') }
  }, [theme])

  const handleInputCloseComplete = () => { if (flipPhase === 'close') setFlipPhase('open') }
  const handleInputOpenComplete = () => { if (flipPhase === 'open') setFlipPhase('idle') }

  const handleDaftar = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMessage('')
    setConfirmModal(null)
    const nikTrim = nik.trim()
    if (!isNikValid(nikTrim)) { setError('Coba kembali periksa NIK.'); return }
    setLoading(true)
    try {
      const res = await authAPI.daftarCheck(idPengurus.trim(), nikTrim, noWa.trim())
      if (!res.success) { setError(res.message || 'Gagal cek data'); return }
      if (res.already_registered) { setError(res.message || 'Akun sudah terdaftar. Silakan login.'); return }
      setConfirmModal({ nama: res.nama || 'Pengurus', no_wa: res.no_wa })
    } catch (err) {
      setError(err.response?.data?.message || 'Terjadi kesalahan. Coba lagi.')
      if (err.response?.status === 429) setError(err.response?.data?.message || 'Terlalu banyak percobaan daftar. Coba lagi nanti.')
    } finally { setLoading(false) }
  }

  const handleKonfirmasi = async () => {
    if (!confirmModal) return
    setError('')
    const nikTrim = nik.trim()
    if (!isNikValid(nikTrim)) { setError('Coba kembali periksa NIK.'); return }
    setLoading(true)
    try {
      const res = await authAPI.daftarKonfirmasi(idPengurus.trim(), nikTrim, noWa.trim())
      if (res.success) { setSuccessMessage(res.message || 'Link telah dikirim ke WhatsApp.'); setConfirmModal(null) }
      else setError(res.message || 'Gagal mengirim link')
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengirim link.')
      if (err.response?.status === 429) setError(err.response?.data?.message || 'Terlalu banyak percobaan. Coba lagi nanti.')
    } finally { setLoading(false) }
  }

  const inputClass = 'w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white/95 dark:bg-gray-800/95 md:bg-gray-50/50 md:dark:bg-gray-700/50 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all'

  return (
    <>
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="w-full max-w-[400px] relative z-10">
        <motion.div variants={itemVariants} className="relative p-4 md:p-10 md:rounded-3xl md:bg-white/90 md:dark:bg-gray-800/90 md:backdrop-blur-xl md:border md:border-white/40 md:dark:border-gray-600/40 md:login-card-glow">
          <div className="md:hidden text-center mb-6" style={{ perspective: '800px' }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={theme}
                className="inline-block"
                initial={{ rotateY: -90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                exit={{ rotateY: 90, opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
                style={{ transformStyle: 'preserve-3d' }}
              >
                {theme === 'dark' ? (
                  <><motion.img src={getGambarUrl('/icon/ebeddienlogoputih.png')} alt="eBeddien" className="max-w-[100px] w-auto h-12 mx-auto mb-2 object-contain" whileHover={{ scale: 1.03 }} /><motion.img src={getGambarUrl('/icon/ebeddientextputih.png')} alt="eBeddien" className="max-w-[100px] w-auto h-10 mx-auto object-contain" whileHover={{ scale: 1.03 }} /></>
                ) : (
                  <><motion.img src={getGambarUrl('/icon/ebeddienlogo.png')} alt="eBeddien" className="max-w-[100px] w-auto h-12 mx-auto mb-2 object-contain" whileHover={{ scale: 1.03 }} /><motion.img src={getGambarUrl('/icon/ebeddientext.png')} alt="eBeddien" className="max-w-[100px] w-auto h-10 mx-auto object-contain" whileHover={{ scale: 1.03 }} /></>
                )}
              </motion.div>
            </AnimatePresence>
            <div className="flex justify-center gap-1.5 mt-3 text-xs text-gray-500 dark:text-gray-400"><span className="font-mono">v{APP_VERSION}</span></div>
          </div>
          <div className="hidden md:block text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1 tracking-tight">Daftar Akun</h1>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-xs mb-4">Satu NIK hanya untuk satu pengurus. Jika NIK sudah terdaftar, silakan login.</p>
          <form onSubmit={handleDaftar} className="space-y-5" style={{ perspective: '600px' }}>
            <motion.div
              variants={itemVariants}
              style={{ transformStyle: 'preserve-3d', transformOrigin: 'bottom center' }}
              animate={{ rotateX: flipPhase === 'close' ? 90 : flipPhase === 'open' ? 0 : 0 }}
              transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              onAnimationComplete={flipPhase === 'close' ? handleInputCloseComplete : flipPhase === 'open' ? handleInputOpenComplete : undefined}
            >
              <input type="text" value={idPengurus} onChange={(e) => setIdPengurus(e.target.value)} className={inputClass} placeholder="NIP Pengurus (contoh: 333)" required />
            </motion.div>
            <motion.div
              variants={itemVariants}
              style={{ transformStyle: 'preserve-3d', transformOrigin: 'bottom center' }}
              animate={{ rotateX: flipPhase === 'close' ? 90 : flipPhase === 'open' ? 0 : 0 }}
              transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              onAnimationComplete={flipPhase === 'close' ? handleInputCloseComplete : flipPhase === 'open' ? handleInputOpenComplete : undefined}
            >
              <input type="text" inputMode="numeric" autoComplete="off" value={nik} onChange={(e) => setNik(normalizeNikInput(e.target.value))} className={`${inputClass} font-mono tracking-wide`} placeholder="NIK (16 digit)" maxLength={16} required />
              {nik.length > 0 && nik.length !== 16 && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{nik.length}/16 digit</p>}
            </motion.div>
            <motion.div
              variants={itemVariants}
              style={{ transformStyle: 'preserve-3d', transformOrigin: 'bottom center' }}
              animate={{ rotateX: flipPhase === 'close' ? 90 : flipPhase === 'open' ? 0 : 0 }}
              transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              onAnimationComplete={flipPhase === 'close' ? handleInputCloseComplete : flipPhase === 'open' ? handleInputOpenComplete : undefined}
            >
              <input type="text" value={noWa} onChange={(e) => setNoWa(e.target.value)} className={inputClass} placeholder="No. WA (08xxxxxxxxxx)" required />
            </motion.div>
            {error && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 px-4 py-3 text-sm">
                <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>{error}</span>
              </motion.div>
            )}
            {successMessage && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-300 px-4 py-3 text-sm">
                <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>{successMessage}</span>
              </motion.div>
            )}
            <motion.button variants={itemVariants} type="submit" disabled={loading} className="w-full py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-all login-btn-glow" whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
              {loading ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Memeriksa...</span> : 'Daftar'}
            </motion.button>
            <p className="text-center text-sm text-gray-600 dark:text-gray-400 pt-2">Sudah punya akun? <Link to="/login" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">Masuk</Link></p>
          </form>
        </motion.div>
      </motion.div>

      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !loading && setConfirmModal(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 max-w-sm w-full border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">Konfirmasi Daftar</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">Daftar atas nama <strong>{confirmModal.nama}</strong>.</p>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">Pastikan nomor WhatsApp yang Anda masukkan aktif. Link akan dikirim ke:</p>
            <p className="font-mono text-primary-600 dark:text-primary-400 mb-4">{confirmModal.no_wa}</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setConfirmModal(null)} disabled={loading} className="flex-1 py-2.5 rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Batal</button>
              <button type="button" onClick={handleKonfirmasi} disabled={loading} className="flex-1 py-2.5 rounded-xl font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">{loading ? 'Mengirim...' : 'Konfirmasi'}</button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  )
}

export default DaftarFormCard
