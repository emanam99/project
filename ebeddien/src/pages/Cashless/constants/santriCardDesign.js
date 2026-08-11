export const SANTRI_CARD_HEADER_TITLE_1 = 'Kartu'
export const SANTRI_CARD_HEADER_TITLE_2 = 'Santri'
export const SANTRI_CARD_HEADER_SUB_1 = 'Pondok Pesantren Salafiyah'
export const SANTRI_CARD_HEADER_SUB_2 = 'Al-Utsmani'

export const SANTRI_CARD_DESIGN_STORAGE_KEY = 'cashless_santri_card_design'

export const SANTRI_CARD_DESIGNS = [
  { id: 'classic', label: 'Desain 1', hint: 'Kartu bank · hijau' },
  { id: 'photo', label: 'Desain 2', hint: 'Kartu ID · pas foto' },
]

export function readSantriCardDesign() {
  try {
    const v = localStorage.getItem(SANTRI_CARD_DESIGN_STORAGE_KEY)
    if (v && SANTRI_CARD_DESIGNS.some((d) => d.id === v)) return v
  } catch {
    /* ignore */
  }
  return 'classic'
}

export function writeSantriCardDesign(designId) {
  try {
    localStorage.setItem(SANTRI_CARD_DESIGN_STORAGE_KEY, designId)
  } catch {
    /* ignore */
  }
}

function clean(v) {
  if (v == null) return ''
  return String(v).trim()
}

function padRtRw(v) {
  const s = clean(v)
  if (!s) return ''
  return /^\d+$/.test(s) ? s.padStart(3, '0') : s
}

/**
 * Alamat santri dua baris ala kartu ID:
 *  line1: "Dusun 001/017"
 *  line2: "Desa, Kecamatan, Kabupaten 68194"
 */
export function formatSantriAlamat(detail) {
  if (!detail) return { line1: '', line2: '' }
  const dusun = clean(detail.dusun)
  const rt = padRtRw(detail.rt)
  const rw = padRtRw(detail.rw)
  const desa = clean(detail.desa)
  const kec = clean(detail.kecamatan)
  const kab = clean(detail.kabupaten)
  const pos = clean(detail.kode_pos)

  const rtrw = rt || rw ? `${rt || '000'}/${rw || '000'}` : ''
  const line1 = [dusun, rtrw].filter(Boolean).join(' ')

  const wilayah = [desa, kec, kab].filter(Boolean).join(', ')
  const line2 = [wilayah, pos].filter(Boolean).join(' ')

  return { line1, line2 }
}

export function formatTanggalLahirSantri(raw) {
  const s = clean(raw)
  if (!s || s === '0000-00-00') return ''
  try {
    const d = new Date(`${s}T12:00:00`)
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return s
  }
}

/** Gabungan "Tempat, dd Month yyyy". */
export function formatTempatTanggalLahir(detail) {
  if (!detail) return ''
  const tempat = clean(detail.tempat_lahir)
  const tgl = formatTanggalLahirSantri(detail.tanggal_lahir)
  return [tempat, tgl].filter(Boolean).join(', ')
}
