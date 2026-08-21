import { useEffect } from 'react'
import { getMybeddienKwitansiQrUrl } from '../../config/mybeddienAppUrl'

/** Redirect ke myBeddien riwayat khusus (wajib login santri). */
function PublicKhusus() {
  useEffect(() => {
    window.location.replace(getMybeddienKwitansiQrUrl('khusus'))
  }, [])

  return (
    <div className="public-content-wrapper" style={{ padding: '2rem', textAlign: 'center' }}>
      <p>Mengalihkan ke myBeddien…</p>
    </div>
  )
}

export default PublicKhusus
