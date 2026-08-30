import { useEffect, useMemo } from 'react'
import type { Location } from 'react-router-dom'
import type { WiridBabMeta, WiridItem } from '../types/wirid'
import { groupByBab, wiridBabLabel } from '../utils/groupByBab'
import { parseWiridIdFromSlug, slugify } from '../utils/slug'
import { resolveBabLabel, resolveWiridTitle } from '../utils/wiridTitle'
import { useTitleLang } from './useTitleLang'

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
export function useAppHeaderTitle(
  location: Location,
  rows: WiridItem[],
  loading: boolean,
  babList: WiridBabMeta[] = [],
): string {
  const { lang: titleLang } = useTitleLang()

  const title = useMemo(() => {
    const path = pathWithoutBase(location.pathname || '/')
    const parts = (path.replace(/\/+$/, '') || '/').split('/').filter(Boolean)

    if (parts.length === 0) return 'Nailul Murod'
    if (parts.length === 1 && parts[0] === 'pengaturan') return 'Pengaturan'
    if (parts.length === 1 && parts[0] === 'list') return 'List Bab'

    if (!loading && (rows.length > 0 || babList.length > 0)) {
      if (parts.length === 2 && parts[0] === 'list') {
        const babSlug = parts[1]
        const fromMeta = babList.find((b) => slugify(b.nama) === babSlug)
        if (fromMeta) return resolveBabLabel(fromMeta.nama, babList, titleLang)
        const grouped = groupByBab(rows, babList)
        const bab = grouped.find(([b]) => slugify(b) === babSlug)?.[0]
        if (bab) return resolveBabLabel(bab, babList, titleLang)
      }
      if (parts.length === 3 && parts[0] === 'list') {
        const babSlug = parts[1]
        const wiridSlug = parts[2]
        const id = parseWiridIdFromSlug(wiridSlug)
        const item = rows.find((row) => row.id === id && slugify(wiridBabLabel(row.bab)) === babSlug)
        if (item) {
          const t = resolveWiridTitle(item, titleLang)
          if (t) return t
        }
      }
    }

    if (parts.length === 2 && parts[0] === 'list') return 'List Bab'
    if (parts.length === 1 && parts[0] === 'pengaturan') return 'Pengaturan'
    return 'Nailul Murod'
  }, [location.pathname, rows, loading, babList, titleLang])

  useEffect(() => {
    document.title = title === 'Nailul Murod' ? 'Nailul Murod' : `${title} · Nailul Murod`
  }, [title])

  return title
}
