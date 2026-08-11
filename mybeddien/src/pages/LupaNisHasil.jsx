import { useMemo } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { APP_VERSION } from '../config/version'
import { loadLupaNisHasil } from '../utils/lupaNisResultStorage'
import { formatNisDisplay } from '../utils/nikUtils'

function resolveHasil(searchParams, locationState) {
  const fromStorage = loadLupaNisHasil()
  const fromState =
    locationState && typeof locationState === 'object' && locationState.nis
      ? locationState
      : null

  const nis = formatNisDisplay(
    fromState?.nis ?? fromStorage?.nis ?? null,
    fromState?.id_santri ?? fromStorage?.id_santri ?? null
  )
  if (!nis) return null

  const nikRaw = fromState?.nik ?? fromStorage?.nik ?? ''
  const nik = String(nikRaw).replace(/\D/g, '').slice(0, 16)
  const nama = (fromState?.nama || fromStorage?.nama || '').trim()
  const alreadyRegistered =
    fromState?.already_registered ??
    fromStorage?.already_registered ??
    false

  return { nis, nik, nama, already_registered: !!alreadyRegistered }
}

function AuthCardShell({ children }) {
  return (
    <div className="w-full max-w-[400px] relative z-10">
      <div className="relative p-4 md:p-10 md:rounded-3xl md:bg-white/95 md:dark:bg-gray-800/95 md:backdrop-blur-xl md:border md:border-white/40 md:dark:border-gray-600/40 md:login-card-glow">
        {children}
      </div>
    </div>
  )
}

export function LupaNisHasilCard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const hasil = useMemo(
    () => resolveHasil(searchParams, location.state),
    [searchParams, location.state]
  )

  const daftarUrl = useMemo(() => {
    if (!hasil) return '/daftar'
    const q = new URLSearchParams()
    q.set('nis', hasil.nis)
    if (hasil.nik && hasil.nik.length === 16) q.set('nik', hasil.nik)
    return `/daftar?${q.toString()}`
  }, [hasil])

  if (!hasil) {
    return (
      <AuthCardShell>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Data tidak ditemukan</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Sesi hasil NIS sudah berakhir. Silakan verifikasi ulang identitas Anda.
        </p>
        <Link
          to="/lupa-nis"
          className="block w-full py-3 rounded-xl font-semibold text-center text-white bg-primary-600 hover:bg-primary-700"
        >
          Cek NIS lagi
        </Link>
      </AuthCardShell>
    )
  }

  const { nis, nama, already_registered: alreadyRegistered } = hasil

  return (
    <AuthCardShell>
      <div className="text-center mb-6">
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
          aria-hidden
        >
          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">NIS ditemukan</h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm">
          Gunakan NIS berikut untuk mendaftar atau login.
        </p>
      </div>

      <div className="rounded-2xl border-2 border-emerald-400 dark:border-emerald-500 bg-white dark:bg-gray-900 p-6 sm:p-8 text-center shadow-md mb-5">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 uppercase tracking-wide">
          NIS Santri
        </p>
        <p
          className="text-[2rem] sm:text-5xl font-bold font-mono leading-tight py-1 select-all break-all text-slate-900 dark:text-white"
          data-testid="lupa-nis-display"
        >
          {nis}
        </p>
        {nama ? (
          <p className="text-base text-slate-800 dark:text-slate-100 mt-4 font-medium">{nama}</p>
        ) : null}
      </div>

      {alreadyRegistered ? (
        <p className="text-sm text-amber-900 dark:text-amber-100 bg-amber-50 dark:bg-amber-950/60 px-3 py-2.5 rounded-xl border border-amber-300 dark:border-amber-600 mb-4">
          Akun sudah terdaftar. Silakan login dengan username dan password Anda.
        </p>
      ) : (
        <p className="text-sm text-slate-700 dark:text-slate-200 text-center mb-4">
          Lanjutkan pendaftaran dengan NIS di atas.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {alreadyRegistered ? (
          <Link
            to="/login"
            className="w-full py-3.5 rounded-xl font-semibold text-center text-white bg-primary-600 hover:bg-primary-700 shadow-sm"
          >
            Masuk
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => navigate(daftarUrl)}
            className="w-full py-3.5 rounded-xl font-semibold text-white bg-primary-600 hover:bg-primary-700 shadow-sm"
          >
            Lanjut daftar
          </button>
        )}
        <Link
          to="/lupa-nis"
          className="text-center text-sm font-medium text-primary-700 dark:text-sky-300 hover:underline py-2"
        >
          Cek NIS lain
        </Link>
        <Link
          to="/daftar"
          className="text-center text-sm text-slate-600 dark:text-slate-300 hover:underline py-1"
        >
          Kembali ke halaman daftar
        </Link>
      </div>

      <p className="hidden md:block text-center text-xs text-gray-500 mt-6 font-mono">v{APP_VERSION}</p>
    </AuthCardShell>
  )
}

export default LupaNisHasilCard
