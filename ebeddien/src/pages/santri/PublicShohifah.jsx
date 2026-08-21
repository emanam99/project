import { useEffect } from 'react'
import { getMybeddienAppUrl } from '../../config/mybeddienAppUrl'

/** Redirect ke myBeddien shohifah (wajib login santri). */
function PublicShohifah() {
  useEffect(() => {
    const base = getMybeddienAppUrl().replace(/\/$/, '')
    window.location.replace(`${base}/santri/shohifah`)
  }, [])

  return (
    <div className="public-content-wrapper" style={{ padding: '2rem', textAlign: 'center' }}>
      <p>Mengalihkan ke myBeddien…</p>
    </div>
  )
}

export default PublicShohifah
