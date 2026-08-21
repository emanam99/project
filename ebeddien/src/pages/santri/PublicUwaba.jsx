import { useEffect } from 'react'
import { getMybeddienKwitansiQrUrl } from '../../config/mybeddienAppUrl'

/** Redirect ke myBeddien riwayat UWABA (wajib login santri). */
function PublicUwaba() {
  useEffect(() => {
    window.location.replace(getMybeddienKwitansiQrUrl('uwaba'))
  }, [])

  return (
    <div className="public-content-wrapper" style={{ padding: '2rem', textAlign: 'center' }}>
      <p>Mengalihkan ke myBeddien…</p>
    </div>
  )
}

export default PublicUwaba
