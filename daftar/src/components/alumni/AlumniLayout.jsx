import { useEffect } from 'react'
import { Outlet, Link } from 'react-router-dom'
import { useThemeStore } from '../../store/themeStore'
import AlumniCountBadge from './AlumniCountBadge'
import { APP_VERSION } from '../../config/version'
import { APP_LOGO_URL } from '../../config/images'
import {
  ALUMNI_DOC_TITLE,
  ALUMNI_DOC_SUBTITLE,
  alumniPath,
  alumniCanonicalUrl,
} from '../../config/alumniApp'

function upsertMeta(attr, key, content) {
  if (typeof document === 'undefined') return
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function AlumniLayout() {
  const { toggleTheme, theme } = useThemeStore()

  useEffect(() => {
    const prevTitle = document.title
    document.title = ALUMNI_DOC_TITLE

    const prevDesc = document.head.querySelector('meta[name="description"]')?.getAttribute('content') || ''
    upsertMeta('name', 'description', ALUMNI_DOC_SUBTITLE)
    upsertMeta('property', 'og:type', 'website')
    upsertMeta('property', 'og:site_name', ALUMNI_DOC_TITLE)
    upsertMeta('property', 'og:title', ALUMNI_DOC_TITLE)
    upsertMeta('property', 'og:description', ALUMNI_DOC_SUBTITLE)
    upsertMeta('property', 'og:url', alumniCanonicalUrl())
    upsertMeta('name', 'twitter:card', 'summary')
    upsertMeta('name', 'twitter:title', ALUMNI_DOC_TITLE)
    upsertMeta('name', 'twitter:description', ALUMNI_DOC_SUBTITLE)

    return () => {
      document.title = prevTitle || 'Aplikasi Pendaftaran'
      upsertMeta('name', 'description', prevDesc || 'Aplikasi Pendaftaran')
    }
  }, [])

  return (
    // html/body/#root di daftar overflow:hidden — scroll harus di container ini
    <div className="h-full max-h-[100dvh] flex flex-col overflow-hidden bg-gradient-to-b from-slate-50 via-white to-teal-50/40 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <header className="shrink-0 z-40 border-b border-teal-100/80 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to={alumniPath()} className="shrink-0">
              <img
                src={APP_LOGO_URL(theme)}
                alt="Logo"
                className="w-10 h-10 object-contain"
              />
            </Link>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {ALUMNI_DOC_TITLE}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate leading-snug">
                {ALUMNI_DOC_SUBTITLE}
              </p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">v{APP_VERSION}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <AlumniCountBadge size="sm" label="Total alumni" align="end" />
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
              aria-label="Toggle tema"
            >
              {theme === 'dark' ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                  <path
                    fillRule="evenodd"
                    d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-6xl mx-auto px-4 py-6 pb-20">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export default AlumniLayout
