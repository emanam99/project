const LS_KEY = 'mybeddien_santri_cache_v1'

export function readSantriCache(santriId, userId = 0) {
  if (typeof window === 'undefined') return null
  if (!santriId && !userId) return null
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o) return null
    if (userId > 0 && Number(o.userId) !== Number(userId)) return null
    if (santriId > 0 && Number(o.santriId) !== Number(santriId)) return null
    return o
  } catch {
    return null
  }
}

export function writeSantriCache(santriId, userId, updater) {
  if (!santriId || typeof window === 'undefined') return
  try {
    const prev = readSantriCache(santriId, userId) || {
      santriId: Number(santriId),
      userId: Number(userId) || 0,
    }
    const next = updater({ ...prev, santriId: Number(santriId), userId: Number(userId) || prev.userId || 0 })
    localStorage.setItem(LS_KEY, JSON.stringify(next))
  } catch {
    /* quota */
  }
}

export function clearSantriCache() {
  try {
    if (typeof window !== 'undefined') localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}

/** @param {unknown[]} rows */
export function maxTanggalDibuat(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return ''
  let max = ''
  for (const r of rows) {
    const t =
      r?.tanggal_dibuat ??
      r?.tanggal_bayar ??
      r?.created_at ??
      (r?.tanggal != null ? String(r.tanggal) : '')
    const s = t != null ? String(t) : ''
    if (s > max) max = s
  }
  return max
}

export function stableJson(obj) {
  try {
    return JSON.stringify(obj)
  } catch {
    return ''
  }
}

/** @param {unknown[]} rows */
export function registrasiFingerprint(rows) {
  if (!Array.isArray(rows)) return ''
  return rows
    .map(
      (r) =>
        `${r?.id_registrasi ?? ''}:${r?.wajib ?? ''}:${r?.bayar ?? ''}:${r?.kurang ?? ''}:${r?.tanggal_dibuat ?? ''}`
    )
    .join('|')
}

export function profilFingerprint(data) {
  if (!data || typeof data !== 'object') return ''
  const u = data.user || {}
  return stableJson({
    nama: data.nama,
    foto_profil: data.foto_profil,
    username: u.username,
    email: u.email,
    no_wa: u.no_wa,
    no_wa_verified_at: u.no_wa_verified_at,
    madrasah: data.madrasah,
  })
}

export function biodataFingerprint(data) {
  if (!data || typeof data !== 'object') return ''
  return stableJson({
    id: data.id,
    nis: data.nis,
    nama: data.nama,
    status_santri: data.status_santri,
    status_murid: data.status_murid,
    id_kamar: data.id_kamar,
    id_diniyah: data.id_diniyah,
    id_formal: data.id_formal,
  })
}

export function pembayaranSummaryFingerprint(summary, tahunList) {
  return stableJson({ summary, tahunList })
}
