import { useState, useEffect, createContext, useContext } from 'react'
import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import InstallPromptSantri from './InstallPromptSantri'
import { registerSantriPWA } from './serviceWorkerRegistrationSantri'
import { getGambarUrl } from '../../config/images'
import './PublicSantri.css'

// Context untuk dark mode
const DarkModeContext = createContext({
  darkMode: false,
  setDarkMode: () => {}
})

export const useDarkMode = () => {
  const context = useContext(DarkModeContext)
  return context || { darkMode: false, setDarkMode: () => {} }
}

function PublicLayout() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode')
    return saved ? JSON.parse(saved) : false
  })

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('darkMode', JSON.stringify(darkMode))
  }, [darkMode])

  // Setup PWA untuk Santri Beddian
  useEffect(() => {
    // Update document title dan meta tags untuk PWA
    const originalTitle = document.title
    document.title = 'Santri Beddian - Aplikasi Wali Santri'
    
    // Update atau tambahkan meta tags untuk PWA
    const updateMetaTag = (name, content, attribute = 'name') => {
      let meta = document.querySelector(`meta[${attribute}="${name}"]`)
      if (!meta) {
        meta = document.createElement('meta')
        meta.setAttribute(attribute, name)
        document.head.appendChild(meta)
      }
      meta.setAttribute('content', content)
    }

    // Update manifest link
    let manifestLink = document.querySelector('link[rel="manifest"]')
    if (!manifestLink) {
      manifestLink = document.createElement('link')
      manifestLink.setAttribute('rel', 'manifest')
      document.head.appendChild(manifestLink)
    }
    manifestLink.setAttribute('href', '/manifest-santri.json')

    // Update meta tags
    updateMetaTag('description', 'Aplikasi pegangan wali santri untuk melihat data santri, riwayat pembayaran, ijin, dan informasi penting lainnya.')
    updateMetaTag('theme-color', '#0d9488')
    updateMetaTag('application-name', 'Santri Beddian')
    updateMetaTag('apple-mobile-web-app-title', 'Santri Beddian')
    updateMetaTag('apple-mobile-web-app-capable', 'yes')
    updateMetaTag('apple-mobile-web-app-status-bar-style', 'default')
    updateMetaTag('mobile-web-app-capable', 'yes')
    updateMetaTag('msapplication-TileColor', '#0d9488')

    // Update semua favicon links
    const updateFavicon = (sizes, href) => {
      let link = document.querySelector(`link[rel="icon"][sizes="${sizes}"]`) || 
                 document.querySelector(`link[rel="icon"]`)
      if (!link) {
        link = document.createElement('link')
        link.setAttribute('rel', 'icon')
        if (sizes) {
          link.setAttribute('sizes', sizes)
        }
        link.setAttribute('type', 'image/png')
        document.head.appendChild(link)
      }
      link.setAttribute('href', href)
      if (sizes) {
        link.setAttribute('sizes', sizes)
      }
    }

    // Update semua ukuran favicon dengan icon santri
    updateFavicon('32x32', getGambarUrl('/icon/santri128.png'))
    updateFavicon('128x128', getGambarUrl('/icon/santri128.png'))
    updateFavicon('192x192', getGambarUrl('/icon/santri192.png'))
    updateFavicon('512x512', getGambarUrl('/icon/santri512.png'))
    
    // Update favicon default (tanpa sizes)
    const defaultFavicon = document.querySelector('link[rel="icon"]:not([sizes])')
    if (defaultFavicon) {
      defaultFavicon.setAttribute('href', getGambarUrl('/icon/santri192.png'))
    } else {
      const link = document.createElement('link')
      link.setAttribute('rel', 'icon')
      link.setAttribute('type', 'image/png')
      link.setAttribute('href', getGambarUrl('/icon/santri192.png'))
      document.head.appendChild(link)
    }

    // Update semua apple-touch-icon
    const updateAppleIcon = (sizes, href) => {
      let link = document.querySelector(`link[rel="apple-touch-icon"][sizes="${sizes}"]`) ||
                 (sizes ? null : document.querySelector('link[rel="apple-touch-icon"]:not([sizes])'))
      if (!link) {
        link = document.createElement('link')
        link.setAttribute('rel', 'apple-touch-icon')
        if (sizes) {
          link.setAttribute('sizes', sizes)
        }
        document.head.appendChild(link)
      }
      link.setAttribute('href', href)
    }

    updateAppleIcon(null, getGambarUrl('/icon/santri192.png'))
    updateAppleIcon('152x152', getGambarUrl('/icon/santri192.png'))
    updateAppleIcon('180x180', getGambarUrl('/icon/santri192.png'))
    updateAppleIcon('167x167', getGambarUrl('/icon/santri192.png'))

    // Update Microsoft Tile
    updateMetaTag('msapplication-TileImage', getGambarUrl('/icon/santri192.png'))

    // Register service worker untuk PWA
    registerSantriPWA({
      onSuccess: (registration) => {
        console.log('✅ Santri Beddian PWA registered successfully')
      },
      onUpdate: (registration) => {
        console.log('🔄 Santri Beddian PWA update available')
      },
      onError: (error) => {
        console.error('❌ Santri Beddian PWA registration error:', error)
      }
    })

    // Cleanup function
    return () => {
      document.title = originalTitle
    }
  }, [])

  return (
    <DarkModeContext.Provider value={{ darkMode, setDarkMode }}>
      <div className="public-santri-page">
        {/* Background hiasan */}
        <div className="public-bg-decoration">
          <div className="bg-pattern"></div>
          <div className="bg-circle bg-circle-1"></div>
          <div className="bg-circle bg-circle-2"></div>
          <div className="bg-circle bg-circle-3"></div>
          <div className="bg-line bg-line-1"></div>
          <div className="bg-line bg-line-2"></div>
          <div className="bg-ring bg-ring-1"></div>
          <div className="bg-ring bg-ring-2"></div>
        </div>

        {/* Outlet untuk halaman yang berbeda */}
        <Outlet />

        {/* Bottom Navigation untuk Mobile - Hanya di-render sekali */}
        <BottomNav />

        {/* Install Prompt untuk PWA */}
        <InstallPromptSantri />
      </div>
    </DarkModeContext.Provider>
  )
}

export default PublicLayout
