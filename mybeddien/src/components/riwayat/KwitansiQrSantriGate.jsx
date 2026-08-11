import { useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSantriBiodata, useSantriIds } from '../../hooks/useSantriCachedResources'
import { hydrateSantriStore, syncSantriBiodata } from '../../services/santriDataService'

function norm(v) {
  return String(v ?? '').trim().toLowerCase()
}

/**
 * Validasi QR kwitansi: query nis/id harus cocok dengan santri yang login.
 * Tanpa nis & id di URL → akses normal (menu aplikasi), tidak diblok.
 */
export function useKwitansiQrSantriMatch() {
  const [searchParams] = useSearchParams()
  const { santriId, userId, user } = useSantriIds()
  const { biodata, loading: biodataLoading } = useSantriBiodata()

  const qrNis = norm(searchParams.get('nis'))
  const qrId = norm(searchParams.get('id'))
  const required = Boolean(qrNis || qrId)

  useEffect(() => {
    if (!required || !santriId) return
    hydrateSantriStore(santriId, userId)
    void syncSantriBiodata(santriId, userId, { background: true })
  }, [required, santriId, userId])

  return useMemo(() => {
    if (!required) {
      return { required: false, matched: true, pending: false, qrNis: '', qrId: '' }
    }

    const loginNis = norm(biodata?.nis ?? user?.nis)
    const loginId = norm(santriId || user?.santri_id || '')

    const matchedById =
      (qrId !== '' && loginId !== '' && qrId === loginId) ||
      (qrNis !== '' && loginId !== '' && qrNis === loginId)
    if (matchedById) {
      return { required: true, matched: true, pending: false, qrNis, qrId }
    }

    const matchedByNis =
      (qrNis !== '' && loginNis !== '' && qrNis === loginNis) ||
      (qrId !== '' && loginNis !== '' && qrId === loginNis)
    if (matchedByNis) {
      return { required: true, matched: true, pending: false, qrNis, qrId }
    }

    // Masih menunggu biodata (NIS) — jangan langsung tolak
    if (biodataLoading || (loginNis === '' && (qrNis !== '' || qrId !== '') && loginId === '')) {
      return { required: true, matched: false, pending: true, qrNis, qrId }
    }

    return { required: true, matched: false, pending: false, qrNis, qrId }
  }, [required, qrNis, qrId, santriId, user?.nis, user?.santri_id, biodata?.nis, biodataLoading])
}

/** UI saat QR kwitansi tidak cocok dengan akun login. */
export function KwitansiQrMismatchNotice({ qrNis, qrId }) {
  const label = qrNis || qrId || '—'
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 p-5 sm:p-6">
        <h1 className="text-lg font-semibold text-amber-950 dark:text-amber-100 tracking-tight">
          Kwitansi bukan untuk akun ini
        </h1>
        <p className="mt-2 text-sm text-amber-900/90 dark:text-amber-100/80 leading-relaxed">
          QR kwitansi ini untuk santri <span className="font-mono font-semibold">{label}</span>.
          Anda sedang login dengan akun santri lain. Keluar lalu masuk dengan akun santri yang sesuai
          kwitansi, atau buka riwayat pembayaran milik akun Anda dari menu.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            to="/santri/riwayat-pembayaran"
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700"
          >
            Riwayat akun saya
          </Link>
          <Link
            to="/profil"
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-medium text-amber-950 dark:text-amber-100 border border-amber-300 dark:border-amber-700 hover:bg-amber-100/80 dark:hover:bg-amber-900/40"
          >
            Profil / ganti akun
          </Link>
        </div>
      </div>
    </div>
  )
}

export function KwitansiQrPendingNotice() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 flex justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 dark:border-primary-400 border-t-transparent" />
    </div>
  )
}
