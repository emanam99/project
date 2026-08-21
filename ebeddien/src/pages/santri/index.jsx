import { useEffect } from 'react'
import { getMybeddienAppUrl } from '../../config/mybeddienAppUrl'

/** Redirect ke myBeddien biodata (wajib login santri). */
function PublicSantri() {
  useEffect(() => {
    const base = getMybeddienAppUrl().replace(/\/$/, '')
    window.location.replace(`${base}/santri/biodata`)
  }, [])

  return (
    <div className="public-content-wrapper" style={{ padding: '2rem', textAlign: 'center' }}>
      <p>Mengalihkan ke myBeddien…</p>
    </div>
  )
}

export default PublicSantri
