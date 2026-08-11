import { useEffect } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

/**
 * Redirect URL lama /cashless/cetak-kartu/santri/:id → index dengan offcanvas terbuka.
 */
export default function CetakKartuCashless() {
  const { santriId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!santriId) return
    navigate('/cashless/cetak-kartu', {
      replace: true,
      state: {
        cetakOffcanvas: {
          santriId: Number(santriId),
          cards: location.state?.cards || [],
          santri: location.state?.santri || { id: Number(santriId) },
          focusType: location.state?.focusType ?? null,
        },
      },
    })
  }, [santriId, navigate, location.state])

  return null
}
