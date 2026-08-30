/** Bahasa tampilan bab & judul di eBeddien Nailul Murod */
export const EBEDDien_NAILUL_TITLE_LANG_KEY = 'ebeddienNailulMurodTitleLang'

/** @param {'id'|'ar'} lang */
export function resolveWiridTitle(row, lang = 'id') {
  const id = String(row?.judul_id ?? '').trim()
  const ar = String(row?.judul_ar ?? '').trim()
  const legacy = String(row?.judul ?? '').trim()
  if (lang === 'ar') return ar || id || legacy
  return id || ar || legacy
}

/** @param {'id'|'ar'} lang */
export function resolveBabName(bab, lang = 'id') {
  const id = String(bab?.nama_id ?? '').trim()
  const ar = String(bab?.nama_ar ?? '').trim()
  const legacy = String(bab?.nama ?? '').trim()
  if (lang === 'ar') return ar || id || legacy
  return id || ar || legacy
}

/** Label bab dari kunci kanonik + metadata. */
export function resolveBabLabel(canonicalBab, babList = [], lang = 'id') {
  const key = (canonicalBab && String(canonicalBab).trim()) || '(Tanpa bab)'
  if (key === '(Tanpa bab)') return key
  const meta = babList.find((b) => b.nama === key)
  if (meta) return resolveBabName(meta, lang)
  return key
}

/** Teks gabungan untuk pencarian bab. */
export function babNameSearchText(bab) {
  return [bab?.nama_id, bab?.nama_ar, bab?.nama]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/** Teks gabungan untuk pencarian (semua varian judul). */
export function wiridTitleSearchText(row) {
  return [row?.judul_id, row?.judul_ar, row?.judul]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function readEbeddienTitleLang() {
  try {
    const v = localStorage.getItem(EBEDDien_NAILUL_TITLE_LANG_KEY)
    return v === 'ar' ? 'ar' : 'id'
  } catch {
    return 'id'
  }
}
