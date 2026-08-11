import { useEffect, useMemo } from 'react'
import type { Location } from 'react-router-dom'
import type { WiridItem } from '../types/wirid'
import { groupByBab } from '../utils/groupByBab'
import { parseWiridIdFromSlug, slugify } from '../utils/slug'

function pathWithoutBase(pathname: string): string {
  const raw = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  const base = raw === '' ? '/' : raw
  if (base === '/' || base === '') return pathname || '/'
  if (pathname.startsWith(base)) {
    const rest = pathname.slice(base.length) || '/'
    return rest.startsWith('/') ? rest : `/${rest}`
  }
  return pathname || '/'
}

/** Judul di header aplikasi + document.title, mengikuti rute dan data wirid */
export function useAppHeaderTitle(location: Location, rows: WiridItem[], loading: boolean): string {
  const title = useMemo(() => {
    const path = pathWithoutBase(location.pathname || '/')
    const parts = (path.replace(/\/+$/, '') || '/').split('/').filter(Boolean)

    if (parts.length === 0) return 'Nailul Murod'
    if (parts.length === 1 && parts[0] === 'list') return 'List Bab'

    if (!loading && rows.length > 0) {
      if (parts.length === 2 && parts[0] === 'list') {
        const babSlug = parts[1]
        const grouped = groupByBab(rows)
        const bab = grouped.find(([b]) => slugify(b) === babSlug)?.[0]
        if (bab) return bab
      }
      if (parts.length === 3 && parts[0] === 'list') {
        const babSlug = parts[1]
        const wiridSlug = parts[2]
        const id = parseWiridIdFromSlug(wiridSlug)
        const item = rows.find((row) => row.id === id && slugify(row.bab) === babSlug)
        if (item?.judul) return item.judul
      }
    }

    if (parts.length === 2 && parts[0] === 'list') return 'List Bab'
    return 'Nailul Murod'
  }, [location.pathname, rows, loading])

  useEffect(() => {
    document.title = title === 'Nailul Murod' ? 'Nailul Murod' : `${title} · Nailul Murod`
  }, [title])

  return title
}
