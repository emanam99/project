import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

function resolveInitialSrc(value) {
  const s = typeof value === 'string' ? value.trim() : ''
  if (!s) return null
  if (s.startsWith('data:image') || s.startsWith('http://') || s.startsWith('https://')) return s
  if ((s.includes('+') || s.includes('/') || s.endsWith('=')) && /^[A-Za-z0-9+/=]+$/.test(s) && s.length > 200) {
    return `data:image/png;base64,${s}`
  }
  return null
}

/** Render QR pembayaran lokal — tidak mengirim payload ke pihak ketiga. */
export function QrCodeImage({ value, alt = 'QR Pembayaran', className = '' }) {
  const [src, setSrc] = useState(() => resolveInitialSrc(value))

  useEffect(() => {
    const direct = resolveInitialSrc(value)
    if (direct) {
      setSrc(direct)
      return
    }
    const s = typeof value === 'string' ? value.trim() : ''
    if (!s) {
      setSrc(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(s, { width: 300, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setSrc(url)
      })
      .catch(() => {
        if (!cancelled) setSrc(null)
      })
    return () => {
      cancelled = true
    }
  }, [value])

  if (!src) return null

  return <img src={src} alt={alt} className={className} />
}
