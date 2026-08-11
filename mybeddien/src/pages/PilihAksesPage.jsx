import { useMemo, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { getHomePathForAccess, listAvailableAccessModes, ACCESS_MODE } from '../config/accessMode'
import { getGambarUrl } from '../config/images'
import { authAPI } from '../services/api'
import { sanitizeAppRedirect } from '../utils/loginRedirect'

function resolvePostPickPath(accessKey, redirect) {
  const home = getHomePathForAccess(accessKey)
  const safe = sanitizeAppRedirect(redirect)
  if (safe && accessKey === ACCESS_MODE.santri && safe.startsWith('/santri/')) {
    return safe
  }
  return home
}

export default function PilihAksesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const forcePick = location.state?.forcePick === true
  const pendingRedirect = sanitizeAppRedirect(location.state?.redirect)
  const user = useAuthStore((s) => s.user)
  const activeAccess = useAuthStore((s) => s.activeAccess)
  const setActiveAccess = useAuthStore((s) => s.setActiveAccess)
  const checkAuth = useAuthStore((s) => s.checkAuth)

  const [busyKey, setBusyKey] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  const modes = useMemo(() => listAvailableAccessModes(user), [user])

  const handlePick = async (m) => {
    setErrorMsg('')
    const rowKey = m.santriId != null ? `${m.key}-${m.santriId}` : m.key
    try {
      if (m.santriId != null && Number(m.santriId) !== Number(user?.santri_id ?? 0)) {
        setBusyKey(rowKey)
        const res = await authAPI.switchMybeddianSantri(m.santriId)
        if (!res.success || !res.data?.token) {
          setErrorMsg(res.message || 'Gagal mengganti identitas santri.')
          return
        }
        localStorage.setItem('auth_token', res.data.token)
        await checkAuth()
      }
      setActiveAccess(m.key, m.santriId ?? undefined)
      navigate(resolvePostPickPath(m.key, pendingRedirect), { replace: true })
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Terjadi kesalahan saat memilih akses.')
    } finally {
      setBusyKey(null)
    }
  }

  useEffect(() => {
    if (!user) return
    if (modes.length === 1) {
      const only = modes[0]
      setActiveAccess(only.key, only.santriId ?? undefined)
      navigate(resolvePostPickPath(only.key, pendingRedirect), { replace: true })
    }
  }, [user, modes, navigate, setActiveAccess, pendingRedirect])

  /** Sudah punya akses tersimpan — hindari halaman ini kecuali setelah login (forcePick) */
  useEffect(() => {
    if (forcePick || !user || !activeAccess) return
    const keys = modes.map((m) => m.key)
    if (keys.length > 1 && keys.includes(activeAccess)) {
      navigate(resolvePostPickPath(activeAccess, pendingRedirect), { replace: true })
    }
  }, [forcePick, user, activeAccess, modes, navigate, pendingRedirect])

  if (!user || modes.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-linear-to-b from-primary-50/90 to-white dark:from-gray-900 dark:to-slate-950">
        <p className="text-sm text-gray-600 dark:text-gray-400 text-center max-w-md">
          Tidak ada akses fitur aplikasi untuk akun ini. Lanjutkan lewat penghubungan di halaman Daftar (verifikasi WA),
          atau hubungi pengurus jika ini salah.
        </p>
        <button
          type="button"
          onClick={() => navigate('/lengkapi-portal', { replace: true })}
          className="mt-4 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700"
        >
          Lengkapi akses
        </button>
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="mt-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >
          Ke beranda
        </button>
      </div>
    )
  }

  if (modes.length === 1) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 bg-linear-to-b from-primary-50/90 via-white to-primary-50/40 dark:from-gray-900 dark:via-slate-900 dark:to-slate-950">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <img
            src={getGambarUrl('/icon/mybeddienlogo.png')}
            alt=""
            className="h-14 w-auto mx-auto mb-4 object-contain"
          />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
            Pilih akses
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Akun Anda memiliki beberapa peran. Pilih satu untuk melanjutkan — Anda bisa mengganti lagi di menu Profil.
          </p>
          {errorMsg ? (
            <p className="text-sm text-red-600 dark:text-red-400 mt-3" role="alert">
              {errorMsg}
            </p>
          ) : null}
        </div>

        <ul className="space-y-3">
          {modes.map((m, idx) => {
            const rowKey = m.santriId != null ? `${m.key}-${m.santriId}` : `${m.key}-${idx}`
            const isBusy = busyKey === rowKey
            return (
              <motion.li
                key={rowKey}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06 }}
              >
                <button
                  type="button"
                  disabled={Boolean(busyKey)}
                  onClick={() => void handlePick(m)}
                  className="w-full text-left rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-white/95 dark:bg-gray-800/95 px-4 py-4 hover:border-primary-500 hover:bg-primary-50/50 dark:hover:bg-primary-900/25 transition-all shadow-sm disabled:opacity-60"
                >
                  <span className="font-semibold text-gray-900 dark:text-gray-100 block">
                    {m.title}
                    {isBusy ? (
                      <span className="inline-block ml-2 align-middle h-4 w-4 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                    ) : null}
                  </span>
                  <span className="text-xs text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-line leading-snug block">
                    {m.description}
                  </span>
                </button>
              </motion.li>
            )
          })}
        </ul>
      </motion.div>
    </div>
  )
}
