import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../../store/authStore'
import { authAPI, profilAPI } from '../../services/api'

function isSnoozeActive(until) {
  if (until == null || until === '') return false
  const t = Date.parse(String(until))
  return !Number.isNaN(t) && t > Date.now()
}

function isVerified(user) {
  const v = user?.email_verified_at
  if (v == null) return false
  const s = String(v).trim()
  if (s === '' || s.startsWith('0000-00-00')) return false
  const ts = Date.parse(s)
  return !Number.isNaN(ts)
}

/** Pengurus eBeddien: butuh email + verifikasi untuk notifikasi penting. */
function userNeedsEmailReminder(user) {
  if (!user?.allowed_apps?.includes('uwaba')) return false
  const pid = user.id_pengurus ?? user.id
  if (pid == null || Number(pid) <= 0) return false
  if (isVerified(user)) return false
  if (isSnoozeActive(user.email_reminder_snoozed_until)) return false
  const email = (user.email ?? '').trim()
  const missingEmail = email === ''
  const missingVerify = email !== '' && !isVerified(user)
  return missingEmail || missingVerify
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Set `true` untuk menampilkan lagi pengingat email setelah login. */
const EMAIL_REMINDER_MODAL_ENABLED = false

/**
 * Offcanvas (slide dari bawah) setelah login: ingatkan isi email
 * dan/atau verifikasi inbox. Email yang masih kosong bisa langsung
 * diisi di sini tanpa harus pindah ke halaman profil.
 */
export default function EmailReminderModal() {
  const user = useAuthStore((s) => s.user)
  const passkeyPromptOpen = useAuthStore((s) => s.passkeyPromptOpen)
  const emailReminderSessionDismissed = useAuthStore((s) => s.emailReminderSessionDismissed)
  const dismissEmailReminderSession = useAuthStore((s) => s.dismissEmailReminderSession)
  const refreshUserData = useAuthStore((s) => s.refreshUserData)

  const [open, setOpen] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sendBusy, setSendBusy] = useState(false)
  const [saveEmailBusy, setSaveEmailBusy] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const needs =
    EMAIL_REMINDER_MODAL_ENABLED &&
    userNeedsEmailReminder(user) &&
    !emailReminderSessionDismissed
  const hasEmail = (user?.email ?? '').trim() !== ''
  const pengurusId = user?.id_pengurus ?? user?.id ?? null

  useEffect(() => {
    if (!needs || passkeyPromptOpen) {
      setOpen(false)
      return
    }
    setOpen(true)
  }, [needs, passkeyPromptOpen])

  useEffect(() => {
    if (open && !hasEmail) {
      setEmailInput((user?.email ?? '').trim())
    }
  }, [open, hasEmail, user?.email])

  const anyBusy = busy || sendBusy || saveEmailBusy

  const closeOffcanvas = useCallback(() => {
    setError('')
    setInfo('')
    setDontShowAgain(false)
    setEmailInput('')
    setOpen(false)
    dismissEmailReminderSession()
  }, [dismissEmailReminderSession])

  const handleBackdropClick = (e) => {
    if (e.target !== e.currentTarget) return
    if (anyBusy) return
    closeOffcanvas()
  }

  const handleConfirmClose = async () => {
    setError('')
    setInfo('')
    if (dontShowAgain) {
      setBusy(true)
      try {
        const res = await authAPI.postEmailReminderSnooze()
        if (res.success && res.data?.email_reminder_snoozed_until != null) {
          const until = res.data.email_reminder_snoozed_until
          useAuthStore.setState((st) => ({
            user: st.user
              ? { ...st.user, email_reminder_snoozed_until: until }
              : st.user
          }))
          try {
            const raw = localStorage.getItem('user_data')
            if (raw) {
              const u = JSON.parse(raw)
              u.email_reminder_snoozed_until = until
              localStorage.setItem('user_data', JSON.stringify(u))
            }
          } catch (_) { /* ignore */ }
        } else {
          setError(res.message || 'Gagal menyimpan pilihan. Coba lagi.')
          setBusy(false)
          return
        }
      } catch (e) {
        setError(e?.response?.data?.message || e?.message || 'Gagal menyimpan pilihan.')
        setBusy(false)
        return
      } finally {
        setBusy(false)
      }
    } else {
      dismissEmailReminderSession()
    }
    setDontShowAgain(false)
    setOpen(false)
  }

  const handleSendLink = async () => {
    setError('')
    setInfo('')
    setSendBusy(true)
    try {
      const res = await authAPI.sendVerifyEmail()
      if (!res.success) {
        setError(res.message || 'Gagal mengirim email.')
        return
      }
      setInfo(res.message || 'Link verifikasi dikirim. Periksa inbox atau folder spam.')
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Gagal mengirim email.')
    } finally {
      setSendBusy(false)
    }
  }

  const handleSaveEmail = async () => {
    setError('')
    setInfo('')
    const em = (emailInput || '').trim()
    if (!em) {
      setError('Email tidak boleh kosong.')
      return
    }
    if (!EMAIL_REGEX.test(em)) {
      setError('Format email tidak valid.')
      return
    }
    if (!pengurusId) {
      setError('Identitas pengguna tidak ditemukan, coba muat ulang halaman.')
      return
    }
    setSaveEmailBusy(true)
    try {
      const res = await profilAPI.updateProfile({ user_id: pengurusId, email: em })
      if (!res?.success) {
        setError(res?.message || 'Gagal menyimpan email.')
        return
      }
      try {
        await refreshUserData()
      } catch (_) { /* ignore */ }
      setInfo('Email tersimpan. Mengirim link verifikasi…')
      try {
        const sendRes = await authAPI.sendVerifyEmail()
        if (sendRes?.success) {
          setInfo(sendRes.message || 'Link verifikasi dikirim. Periksa inbox atau folder spam.')
        } else {
          setInfo('Email tersimpan. Silakan klik "Kirim link verifikasi" untuk meminta link.')
        }
      } catch (_) {
        setInfo('Email tersimpan. Silakan klik "Kirim link verifikasi" untuk meminta link.')
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Gagal menyimpan email.')
    } finally {
      setSaveEmailBusy(false)
    }
  }

  const safePadding = useMemo(
    () => ({ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0px)' }),
    []
  )

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[210] flex items-end justify-center bg-black/45 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          onClick={handleBackdropClick}
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-reminder-title"
          style={safePadding}
        >
          <motion.div
            initial={{ y: '110%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '110%', opacity: 0.6 }}
            transition={{ type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.36 }}
            className="w-full max-w-md mx-3 mb-3 sm:mb-5 rounded-3xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200/70 dark:border-gray-700/70 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2.5">
              <span className="h-1.5 w-12 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden />
            </div>
            <div className="px-5 pt-3 pb-2">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-11 h-11 rounded-2xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-700 dark:text-amber-300">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h2 id="email-reminder-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {hasEmail ? 'Verifikasi email Anda' : 'Tambahkan email akun'}
                  </h2>
                  <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {hasEmail ? (
                      <>
                        Alamat <span className="font-medium text-gray-800 dark:text-gray-200 break-all">{user.email}</span> belum
                        ditandai terverifikasi. Verifikasi membantu pemulihan akun dan notifikasi penting.
                      </>
                    ) : (
                      <>
                        Akun Anda belum memiliki email. Isi email di bawah, simpan, dan kami akan otomatis mengirim
                        link verifikasi.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <div className="px-5 pb-2">
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2">{error}</p>
              </div>
            )}
            {info && !error && (
              <div className="px-5 pb-2">
                <p className="text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl px-3 py-2">{info}</p>
              </div>
            )}

            <div className="px-5 pb-3 space-y-3">
              {!hasEmail ? (
                <div className="space-y-2">
                  <label htmlFor="email-reminder-input" className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                    Alamat email
                  </label>
                  <input
                    id="email-reminder-input"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    spellCheck={false}
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="contoh: nama@domain.com"
                    disabled={saveEmailBusy}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900/40 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={handleSaveEmail}
                    disabled={saveEmailBusy || !emailInput.trim()}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60"
                  >
                    {saveEmailBusy ? 'Menyimpan…' : 'Simpan email & kirim verifikasi'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSendLink}
                  disabled={sendBusy || busy}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60"
                >
                  {sendBusy ? 'Mengirim…' : 'Kirim link verifikasi ke email'}
                </button>
              )}
              <button
                type="button"
                onClick={() => refreshUserData()}
                disabled={anyBusy}
                className="w-full py-2 rounded-xl text-sm font-medium text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/30 disabled:opacity-50"
              >
                Sudah verifikasi? Perbarui status
              </button>
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  disabled={anyBusy}
                />
                <span className="text-sm text-gray-600 dark:text-gray-400 leading-snug">
                  Jangan tampilkan lagi pengingat ini selama satu tahun (disimpan di server).
                </span>
              </label>
            </div>

            <div className="px-5 py-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-gray-100 dark:border-gray-700/80 bg-gray-50/80 dark:bg-gray-900/30">
              <button
                type="button"
                onClick={closeOffcanvas}
                disabled={anyBusy}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handleConfirmClose}
                disabled={anyBusy}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gray-800 hover:bg-gray-900 dark:bg-gray-600 dark:hover:bg-gray-500 disabled:opacity-60"
              >
                {busy ? 'Menyimpan…' : dontShowAgain ? 'Simpan & tutup' : 'Mengerti'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
