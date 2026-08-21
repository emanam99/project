import { useEffect } from 'react'
import { getMybeddienAppUrl } from '../../config/mybeddienAppUrl'

/** Redirect ke myBeddien riwayat ijin (wajib login santri). */
function PublicIjin() {
  useEffect(() => {
    const base = getMybeddienAppUrl().replace(/\/$/, '')
    window.location.replace(`${base}/santri/riwayat-ijin`)
  }, [])

  return (
    <div className="public-content-wrapper" style={{ padding: '2rem', textAlign: 'center' }}>
      <p>Mengalihkan ke myBeddien…</p>
    </div>
  )
}

export default PublicIjin
