import { useSearchParams, useLocation } from 'react-router-dom'
import { useEffect, useRef, useMemo } from 'react'
import PrintUwaba from './PrintUwaba'
import PrintKwitansi from './PrintKwitansi'
import PrintPendaftaran from '../../Pendaftaran/print/PrintPendaftaran'

function Print() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const iframeRef = useRef(null)
  
  // Tentukan page berdasarkan route atau query parameter
  // Jika route adalah /print-uwaba, set page=uwaba
  // Jika route adalah /print-pendaftaran, set page=pendaftaran
  const page = useMemo(() => {
    let p = searchParams.get('page')
    if (!p && location.pathname === '/print-uwaba') {
      p = 'uwaba'
    }
    if (!p && location.pathname === '/print-pendaftaran') {
      p = 'pendaftaran'
    }
    return p || 'tunggakan'
  }, [searchParams, location.pathname])
  
  const santriId = searchParams.get('id')
  
  // Jika page adalah uwaba, gunakan komponen PrintUwaba
  if (page === 'uwaba') {
    return (
      <div style={{ 
        width: '100%', 
        height: '100vh', 
        margin: 0, 
        padding: 0,
        overflow: 'hidden',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0
      }}>
        <PrintUwaba santriId={santriId} />
      </div>
    )
  }
  
  // Jika page adalah pendaftaran, gunakan komponen PrintPendaftaran
  if (page === 'pendaftaran') {
    return (
      <div style={{ 
        width: '100%', 
        height: '100vh', 
        margin: 0, 
        padding: 0,
        overflow: 'hidden',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0
      }}>
        <PrintPendaftaran santriId={santriId} />
      </div>
    )
  }

  // Jika page adalah tunggakan atau khusus, gunakan komponen PrintKwitansi
  if (page === 'tunggakan' || page === 'khusus') {
    return (
      <div style={{ 
        width: '100%', 
        height: '100vh', 
        margin: 0, 
        padding: 0,
        overflow: 'hidden',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0
      }}>
        <PrintKwitansi santriId={santriId} mode={page} />
      </div>
    )
  }
  
  // Untuk page lainnya, gunakan route /print dengan parameter page
  // Gunakan window.location.origin untuk mendapatkan domain dinamis
  const baseUrl = window.location.origin
  
  // Build URL dengan semua query parameters
  const iframeUrl = useMemo(() => {
    const params = new URLSearchParams()
    const id = searchParams.get('id')
    if (id) params.set('id', id)
    params.set('page', page)
    
    // Teruskan semua query parameters lainnya (seperti tahun_ajaran)
    searchParams.forEach((value, key) => {
      if (key !== 'id' && key !== 'page') {
        params.set(key, value)
      }
    })
    
    // Gunakan route /print dengan query parameters
    return `${baseUrl}/print?${params.toString()}`
  }, [searchParams, page, baseUrl])

  useEffect(() => {
    // Pastikan iframe dimuat ulang jika parameter berubah
    if (iframeRef.current) {
      iframeRef.current.src = iframeUrl
    }
  }, [iframeUrl])

  return (
    <div style={{ 
      width: '100%', 
      height: '100vh', 
      margin: 0, 
      padding: 0,
      overflow: 'hidden',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0
    }}>
      <iframe
        ref={iframeRef}
        src={iframeUrl}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          margin: 0,
          padding: 0,
          display: 'block'
        }}
        title="Print Preview"
        allow="fullscreen"
      />
    </div>
  )
}

export default Print

