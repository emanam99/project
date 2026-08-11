import { useLocation, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import PageLoader from '../../components/PageLoader'

const Pembayaran = lazy(() => import('./index.jsx'))

const ALLOWED_MODES = ['uwaba', 'tunggakan', 'khusus']

/**
 * Satu komponen untuk /uwaba, /tunggakan, /khusus agar Pembayaran
 * tidak unmount saat pindah antar tab → biodata & state tetap.
 * Mode diambil dari pathname (bukan param dinamis) agar /alumni dll. tidak tertangkap.
 */
function PembayaranGate() {
  const { pathname } = useLocation()
  const mode = String(pathname || '')
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)[0] || ''

  if (!ALLOWED_MODES.includes(mode)) {
    return <Navigate to="/uwaba" replace />
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Pembayaran />
    </Suspense>
  )
}

export default PembayaranGate
