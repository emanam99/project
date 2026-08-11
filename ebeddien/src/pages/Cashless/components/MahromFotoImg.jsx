import { memo, useEffect, useState } from 'react'
import { mahromAPI } from '../../../services/api'

/** Gambar foto mahrom dari foto_path (buku tamu / form mahrom). */
const MahromFotoImg = memo(function MahromFotoImg({
  fotoPath,
  alt = 'Foto mahrom',
  className = '',
}) {
  const [url, setUrl] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!fotoPath) {
      setUrl(null)
      return
    }
    let cancelled = false
    setLoading(true)
    mahromAPI.fetchFotoBlobUrl(fotoPath).then((blobUrl) => {
      if (!cancelled) {
        setUrl(blobUrl || null)
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) {
        setUrl(null)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [fotoPath])

  if (!fotoPath) return null
  if (loading && !url) {
    return <div className={`bg-gray-200 dark:bg-gray-700 animate-pulse ${className}`} aria-hidden />
  }
  if (!url) return null

  return <img src={url} alt={alt} className={className} draggable={false} />
})

export default MahromFotoImg
