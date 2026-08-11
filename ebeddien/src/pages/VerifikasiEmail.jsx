import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { authAPI } from '../services/api'
import { useAuthStore } from '../store/authStore'

function normalizeTokenFromUrl(raw) {
  if (raw == null || typeof raw !== 'string') return ''
  return raw.replace(/\s+/g, '').trim()
}

const reasonMessages = {
  missing: 'Tidak ada token di alamat. Pastikan Anda membuka link lengkap dari email.',
  not_found: 'Link tidak dikenali, sudah kadaluarsa (48 jam), atau sudah dipakai.',
  used: 'Link ini sudah pernah dipakai. Minta link baru dari Profil jika perlu.',
  expired: 'Link sudah kadaluarsa. Minta link verifikasi baru dari menu Profil.',
  email_changed: 'Alamat email di akun sudah diubah setelah link dikirim. Minta link baru dari Profil.',
}

export default function VerifikasiEmail() {
  const [searchParams] = useSearchParams()
  const token = useMemo(() => normalizeTokenFromUrl(searchParams.get('token')), [searchParams])

  const [phase, setPhase] = useState('loading') // loading | ready | done | bad | error
  const [hint, setHint] = useState('')
  const [alreadyVerified, setAlreadyVerified] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setPhase('bad')
      setHint(reasonMessages.missing)
      return
    }
    let cancelled = false
    setPhase('loading')
    setHint('')
    authAPI.getVerifyEmailToken(token).then((res) => {
      if (cancelled) return
      if (res?.success === false) {
        setPhase('error')
        setHint(res?.message || 'Terjadi kesalahan')
        return
      }
      if (!res?.valid) {
        setPhase('bad')
        setHint(reasonMessages[res?.reason] || reasonMessages.not_found)
        return
      }
      if (res?.already_verified) {
        setAlreadyVerified(true)
        setPhase('done')
        setHint('Email Anda sudah terverifikasi sebelumnya.')
        try {
          if (typeof localStorage !== 'undefined' && localStorage.getItem('auth_token')) {
            useAuthStore.getState().refreshUserData().catch(() => {})
          }
        } catch (_) {}
        return
      }
      setPhase('ready')
    }).catch((err) => {
      if (!cancelled) {
        setPhase('error')
        setHint(err?.response?.data?.message || 'Tidak dapat menghubungi server.')
      }
    })
    return () => { cancelled = true }
  }, [token])

  const handleConfirm = useCallback(async () => {
    if (!token || submitting) return
    setSubmitting(true)
    setHint('')
    try {
      const res = await authAPI.postVerifyEmail(token)
      if (res?.success) {
        setPhase('done')
        setHint(res?.message || 'Email berhasil diverifikasi.')
        try {
          if (typeof localStorage !== 'undefined' && localStorage.getItem('auth_token')) {
            useAuthStore.getState().refreshUserData().catch(() => {})
          }
        } catch (_) {}
      } else {
        setPhase('error')
        setHint(res?.message || 'Verifikasi gagal.')
      }
    } catch (err) {
      setPhase('error')
      setHint(err?.response?.data?.message || 'Verifikasi gagal.')
    } finally {
      setSubmitting(false)
    }
  }, [token, submitting])

  if (phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (phase === 'bad' || phase === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-gray-200 dark:border-gray-700"
        >
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">
            {phase === 'error' ? 'Terjadi kesalahan' : 'Link tidak valid'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">{hint}</p>
          <Link
            to="/login"
            className="inline-block py-2 px-4 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700"
          >
            Ke halaman Login
          </Link>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            <Link to="/profil" className="text-teal-600 dark:text-teal-400 hover:underline">Ke Profil</Link>
            {' '}jika sudah login.
          </p>
        </motion.div>
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-gray-200 dark:border-gray-700"
        >
          <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
          </div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">Berhasil</h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">{hint}</p>
          {!alreadyVerified && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Anda dapat menutup halaman ini atau kembali ke profil.</p>
          )}
          <Link
            to="/profil"
            className="inline-block py-2.5 px-5 rounded-xl bg-teal-600 text-white font-medium hover:bg-teal-700"
          >
            Ke Profil
          </Link>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full border border-gray-200 dark:border-gray-700"
      >
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">Verifikasi email</h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
          Link dari email Anda valid. Tekan tombol di bawah untuk menandai alamat email sebagai terverifikasi.
        </p>
        {hint ? <p className="text-sm text-red-600 dark:text-red-400 mb-4">{hint}</p> : null}
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className="w-full py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Memproses…' : 'Verifikasi email saya'}
        </button>
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
          <Link to="/login" className="text-teal-600 dark:text-teal-400 hover:underline">Login</Link>
        </p>
      </motion.div>
    </div>
  )
}
