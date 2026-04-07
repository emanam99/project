/**
 * Urutan tampilan field di blok Status Pendaftaran (mode baca & ubah).
 * Prodi & gelombang dirender terpisah setelah daftar ini.
 */
export const STATUS_PENDAFTARAN_KONDISI_ORDER = [
  'status_pendaftar',
  'status_santri',
  'daftar_diniyah',
  'daftar_formal',
  'status_murid',
]

const STATUS_SANTRI_FALLBACK = {
  field_name: 'status_santri',
  field_label: 'Status Santri',
  values: [
    { value: 'Mukim', label: 'Mukim' },
    { value: 'Khoriji', label: 'Khoriji' },
  ],
}

const STATUS_MURID_FALLBACK = {
  field_name: 'status_murid',
  field_label: 'Status Murid',
  values: [],
}

/**
 * @param {Array<{ field_name: string, field_label: string, values: Array }>} kondisiFields
 * @returns {Array} subset terurut; sintetis jika API tidak mengembalikan baris
 */
export function getOrderedKondisiFieldsForPendaftaran(kondisiFields) {
  const list = Array.isArray(kondisiFields) ? kondisiFields : []
  const map = new Map(list.map((f) => [f.field_name, f]))
  if (!map.has('status_santri')) {
    map.set('status_santri', STATUS_SANTRI_FALLBACK)
  }
  if (!map.has('status_murid')) {
    map.set('status_murid', STATUS_MURID_FALLBACK)
  }
  return STATUS_PENDAFTARAN_KONDISI_ORDER.map((name) => map.get(name)).filter(Boolean)
}
