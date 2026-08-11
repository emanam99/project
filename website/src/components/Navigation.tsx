import { useEffect, useState } from 'react'

interface Props {
  /** Path saat ini (di-pass dari layout untuk menjaga active state setelah view transition). */
  pathname: string
  siteTitle?: string
}

const items = [
  { href: '/', label: 'Beranda', icon: '🏠' },
  { href: '/berita', label: 'Berita', icon: '📰' },
  { href: '/galeri', label: 'Galeri', icon: '🖼️' },
  { href: '/halaman/tentang', label: 'Tentang', icon: 'ℹ️' },
  { href: '/halaman/kontak', label: 'Kontak', icon: '✉️' }
]

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/' || pathname === ''
  return pathname.startsWith(href)
}

export default function Navigation({ pathname, siteTitle = 'Pesantren' }: Props) {
  const [current, setCurrent] = useState(pathname)

  // Sinkron dengan navigasi spa-like Astro View Transitions.
  useEffect(() => {
    const onBeforeSwap = (e: Event) => {
      const detail = (e as any).detail
      try {
        const next = new URL(detail?.to?.toString?.() || window.location.href, window.location.origin)
        setCurrent(next.pathname)
      } catch {
        setCurrent(window.location.pathname)
      }
    }
    const onLoad = () => setCurrent(window.location.pathname)
    document.addEventListener('astro:before-swap', onBeforeSwap)
    document.addEventListener('astro:page-load', onLoad)
    return () => {
      document.removeEventListener('astro:before-swap', onBeforeSwap)
      document.removeEventListener('astro:page-load', onLoad)
    }
  }, [])

  return (
    <>
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white/95 px-4 py-6 backdrop-blur md:flex dark:border-slate-800 dark:bg-slate-900/95">
        <a href="/" className="mb-6 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
            🕌
          </div>
          <div className="leading-tight">
            <div className="text-base font-semibold text-slate-900 dark:text-white">{siteTitle}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Web resmi pesantren</div>
          </div>
        </a>
        <nav className="flex flex-col gap-1">
          {items.map((item) => {
            const active = isActive(current, item.href)
            return (
              <a
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-500'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                <span aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </a>
            )
          })}
        </nav>
        <div className="mt-auto pt-6 text-xs text-slate-400 dark:text-slate-500">
          © {new Date().getFullYear()} {siteTitle}
        </div>
      </aside>

      {/* Bottom nav mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-900/95">
        {items.map((item) => {
          const active = isActive(current, item.href)
          return (
            <a
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 px-2 py-2 text-[10px] font-medium transition ${
                active ? 'text-brand-700 dark:text-brand-500' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <span className="text-lg" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </a>
          )
        })}
      </nav>
    </>
  )
}
