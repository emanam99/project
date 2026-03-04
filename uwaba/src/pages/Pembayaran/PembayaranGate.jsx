import { useParams, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import PageLoader from '../../components/PageLoader'

const Pembayaran = lazy(() => import('./index.jsx'))

const ALLOWED_MODES = ['uwaba', 'tunggakan', 'khusus']

/**
 * Satu route untuk /uwaba, /tunggakan, /khusus agar komponen Pembayaran
 * tidak unmount saat pindah antar tab → biodata & state tetap.
 */
function PembayaranGate() {
  const { pembayaranMode } = useParams()

  if (!ALLOWED_MODES.includes(pembayaranMode)) {
    return <Navigate to="/uwaba" replace />
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Pembayaran />
    </Suspense>
  )
}

export default PembayaranGate
