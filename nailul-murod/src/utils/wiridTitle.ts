import type { WiridBabMeta, WiridItem } from '../types/wirid'

export type WiridTitleLang = 'id' | 'ar'

export const TITLE_LANG_STORAGE_KEY = 'nailulMurodTitleLang'
export const TITLE_LANG_EVENT = 'nm-title-lang'

export function resolveWiridTitle(
  item: Pick<WiridItem, 'judul' | 'judul_id' | 'judul_ar'>,
  lang: WiridTitleLang = 'id',
): string {
  const id = (item.judul_id ?? '').trim()
  const ar = (item.judul_ar ?? '').trim()
  const legacy = (item.judul ?? '').trim()
  if (lang === 'ar') return ar || id || legacy
  return id || ar || legacy
}

export function resolveBabName(
  bab: Pick<WiridBabMeta, 'nama' | 'nama_id' | 'nama_ar'>,
  lang: WiridTitleLang = 'id',
): string {
  const id = (bab.nama_id ?? '').trim()
  const ar = (bab.nama_ar ?? '').trim()
  const legacy = (bab.nama ?? '').trim()
  if (lang === 'ar') return ar || id || legacy
  return id || ar || legacy
}

export function resolveBabLabel(
  canonicalBab: string,
  babList: WiridBabMeta[] = [],
  lang: WiridTitleLang = 'id',
): string {
  const key = canonicalBab?.trim() || '(Tanpa bab)'
  if (key === '(Tanpa bab)') return key
  const meta = babList.find((b) => b.nama === key)
  if (meta) return resolveBabName(meta, lang)
  return key
}

export function babNameSearchText(bab: Pick<WiridBabMeta, 'nama' | 'nama_id' | 'nama_ar'>): string {
  return [bab.nama_id, bab.nama_ar, bab.nama]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function wiridTitleSearchText(item: Pick<WiridItem, 'judul' | 'judul_id' | 'judul_ar'>): string {
  return [item.judul_id, item.judul_ar, item.judul]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function readStoredTitleLang(): WiridTitleLang {
  try {
    const v = localStorage.getItem(TITLE_LANG_STORAGE_KEY)
    return v === 'ar' ? 'ar' : 'id'
  } catch {
    return 'id'
  }
}
