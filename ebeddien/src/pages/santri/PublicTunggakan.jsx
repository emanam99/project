import { useEffect } from 'react'
import { getMybeddienKwitansiQrUrl } from '../../config/mybeddienAppUrl'

/** Redirect ke myBeddien riwayat tunggakan (wajib login santri). */
function PublicTunggakan() {
  useEffect(() => {
    window.location.replace(getMybeddienKwitansiQrUrl('tunggakan'))
  }, [])

  return (
    <div className="public-content-wrapper" style={{ padding: '2rem', textAlign: 'center' }}>
      <p>Mengalihkan ke myBeddien…</p>
    </div>
  )
}

export default PublicTunggakan
