import { useMemo } from 'react'
import type { Location } from 'react-router-dom'

/** True jika sedang di halaman baca wirid: /list/:babSlug/:wiridSlug */
export function useWiridReaderRoute(location: Location): boolean {
  return useMemo(() => {
    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
    let pathname = location.pathname || '/'
    if (base && base !== '/' && pathname.startsWith(base)) {
      pathname = pathname.slice(base.length) || '/'
    }
    const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean)
    return parts.length === 3 && parts[0] === 'list'
  }, [location.pathname])
}
