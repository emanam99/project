import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import WaPreparePanel from '../components/Auth/WaPreparePanel'
import { APP_VERSION } from '../config/version'
import { authAPI } from '../services/api'
import { loadLupaNisTerkirim, saveLupaNisTerkirim } from '../utils/lupaNisResultStorage'

function resolveTerkirim(searchParams, locationState) {
  const fromStorage = loadLupaNisTerkirim()
  if (!fromStorage?.id) return null
  const fromState =
    locationState && typeof locationState === 'object' && Number(locationState.id) > 0
      ? locationState
      : null
  const id = Number(fromState?.id ?? fromStorage.id)
  if (!id || id < 1 || id !== fromStorage.id) return null
  const nama = String(
    fromState?.nama ?? fromStorage.nama ?? searchParams.get('nama') ?? ''
  ).trim()
  const noWa = String(fromState?.no_wa ?? fromStorage.no_wa ?? '').trim()
  return {
    id,
    nama,
    no_wa: noWa,
    wa_me_url: String(fromState?.wa_me_url ?? fromStorage.wa_me_url ?? '').trim(),
    wa_message: String(fromState?.wa_message ?? fromStorage.wa_message ?? '').trim(),
    expires_in_minutes:
      Number(fromState?.expires_in_minutes ?? fromStorage.expires_in_minutes) || 30,
    message: String(fromState?.message ?? fromStorage.message ?? '').trim(),
  }
}

function formatWaDisplay(noWa) {
  const digits = String(noWa || '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('62')) return `+${digits}`
  if (digits.startsWith('0')) return digits
  return digits
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

export function LupaNisTerkirimCard() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [waPrepare, setWaPrepare] = useState(null)
  const [loadingWa, setLoadingWa] = useState(false)
  const [error, setError] = useState('')

  const pengajuan = useMemo(
    () => resolveTerkirim(searchParams, location.state),
    [searchParams, location.state]
  )

  const waDisplay = formatWaDisplay(pengajuan?.no_wa)

  useEffect(() => {
    if (!pengajuan?.id) return
    if (pengajuan.wa_me_url) {
      setWaPrepare({
        message:
          pengajuan.message ||
          'Buka WhatsApp, kirim pesan berisi token, lalu tunggu balasan bot. Setelah itu pengajuan masuk antrean admin.',
        wa_me_url: pengajuan.wa_me_url,
        wa_message: pengajuan.wa_message || '',
        expires_in_minutes: pengajuan.expires_in_minutes || 30,
      })
      return
    }
    let cancelled = false
    ;(async () => {
      setLoadingWa(true)
      setError('')
      try {
        const res = await authAPI.nisPengajuanPrepareWa(pengajuan.id)
        if (cancelled) return
        if (!res.success || !res.wa_me_url) {
          setError(res.message || 'Gagal menyiapkan tautan WhatsApp. Coba lagi.')
          return
        }
        const next = {
          id: pengajuan.id,
          nama: pengajuan.nama,
          no_wa: pengajuan.no_wa,
          wa_me_url: res.wa_me_url,
          wa_message: res.wa_message || '',
          expires_in_minutes: res.expires_in_minutes || 30,
          message: res.message || '',
        }
        saveLupaNisTerkirim(next)
        setWaPrepare({
          message:
            next.message ||
            'Buka WhatsApp, kirim pesan berisi token, lalu tunggu balasan bot.',
          wa_me_url: next.wa_me_url,
          wa_message: next.wa_message,
          expires_in_minutes: next.expires_in_minutes,
        })
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || 'Gagal menyiapkan tautan WhatsApp.')
        }
      } finally {
        if (!cancelled) setLoadingWa(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pengajuan?.id, pengajuan?.wa_me_url, pengajuan?.wa_message, pengajuan?.expires_in_minutes, pengajuan?.message, pengajuan?.nama, pengajuan?.no_wa])

  const refreshWaLink = async () => {
    if (!pengajuan?.id || loadingWa) return
    setLoadingWa(true)
    setError('')
    try {
      const res = await authAPI.nisPengajuanPrepareWa(pengajuan.id)
      if (!res.success || !res.wa_me_url) {
        setError(res.message || 'Gagal membuat ulang tautan WhatsApp.')
        return
      }
      const next = {
        id: pengajuan.id,
        nama: pengajuan.nama,
        no_wa: pengajuan.no_wa,
        wa_me_url: res.wa_me_url,
        wa_message: res.wa_message || '',
        expires_in_minutes: res.expires_in_minutes || 30,
        message: res.message || '',
      }
      saveLupaNisTerkirim(next)
      setWaPrepare({
        message:
          next.message ||
          'Buka WhatsApp, kirim pesan berisi token, lalu tunggu balasan bot.',
        wa_me_url: next.wa_me_url,
        wa_message: next.wa_message,
        expires_in_minutes: next.expires_in_minutes,
      })
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal membuat ulang tautan WhatsApp.')
    } finally {
      setLoadingWa(false)
    }
  }

  if (!pengajuan) {
    return (
      <AuthCardShell>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Data tidak ditemukan</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Sesi pengajuan sudah berakhir. Silakan verifikasi identitas dari awal jika perlu.
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

  return (
    <AuthCardShell>
      <div className="text-center mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Konfirmasi lewat WhatsApp</h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm">
          KK sudah tersimpan. Kirim pesan berisi token dari nomor yang sama agar pengajuan masuk antrean admin.
        </p>
        {pengajuan.nama ? (
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 font-medium">{pengajuan.nama}</p>
        ) : null}
        {waDisplay ? (
          <p className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-1">{waDisplay}</p>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-xl border border-red-200 dark:border-red-800/50 mb-3">
          {error}
        </p>
      ) : null}

      {loadingWa && !waPrepare ? (
        <p className="text-sm text-center text-gray-600 dark:text-gray-400 py-6">Menyiapkan tautan WhatsApp…</p>
      ) : null}

      {waPrepare ? (
        <WaPreparePanel
          message={waPrepare.message}
          waMeUrl={waPrepare.wa_me_url}
          waMessage={waPrepare.wa_message}
          expiresInMinutes={waPrepare.expires_in_minutes || 30}
          onReset={refreshWaLink}
          resetLabel={loadingWa ? 'Menyiapkan ulang…' : 'Buat ulang tautan WhatsApp'}
        />
      ) : null}

      {!loadingWa && !waPrepare && !error ? (
        <button
          type="button"
          onClick={refreshWaLink}
          className="w-full py-3 rounded-xl font-semibold text-white bg-primary-600 hover:bg-primary-700"
        >
          Siapkan tautan WhatsApp
        </button>
      ) : null}

      <div className="rounded-xl border border-teal-200 dark:border-teal-800/60 bg-teal-50/80 dark:bg-teal-900/20 px-3 py-3 text-xs text-teal-900 dark:text-teal-100 space-y-2 mt-4 mb-4">
        <p className="font-semibold">Setelah Anda mengirim pesan WA</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Bot membalas «Terima kasih. permintaan sedang diproses» lalu detail antrean.</li>
          <li>Baru setelah itu pengajuan dikirim ke admin (estimasi 1–2 hari kerja).</li>
          <li>
            Jika disetujui, NIS dikirim ke WhatsApp
            {waDisplay ? (
              <>
                {' '}
                (<span className="font-mono">{waDisplay}</span>)
              </>
            ) : (
              ' Anda'
            )}
            .
          </li>
        </ol>
      </div>

      <Link
        to="/daftar"
        className="block w-full py-3.5 rounded-xl font-semibold text-center text-white bg-primary-600 hover:bg-primary-700 shadow-sm"
      >
        Kembali ke halaman daftar
      </Link>
      <Link
        to="/lupa-nis"
        className="block text-center text-sm font-medium text-primary-700 dark:text-sky-300 hover:underline py-3"
      >
        Cek NIS lain
      </Link>

      <p className="hidden md:block text-center text-xs text-gray-500 mt-4 font-mono">v{APP_VERSION}</p>
    </AuthCardShell>
  )
}

export default LupaNisTerkirimCard
