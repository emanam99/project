/** Opsi hubungan mahrom ↔ santri (selaras MahromService::HUBUNGAN_OPTIONS) */
export const MAHROM_HUBUNGAN_OPTIONS = [
  'Ayah', 'Ibu', 'Wali', 'Paman', 'Bibi', 'Kakek', 'Nenek', 'Kakak', 'Saudara', 'Lainnya',
]

/** Sumber isi otomatis dari biodata santri */
export const MAHROM_FILL_SOURCES = [
  { key: 'ayah', label: 'Ayah', hubungan: 'Ayah' },
  { key: 'ibu', label: 'Ibu', hubungan: 'Ibu' },
  { key: 'wali', label: 'Wali', hubungan: 'Wali' },
  { key: 'manual', label: 'Isi manual', hubungan: null },
]

function normalizeDate(value) {
  if (!value) return ''
  const s = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return s
}

function digitsNik(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 16)
}

function alamatFromSantri(santri) {
  if (!santri) return {}
  return {
    dusun: santri.dusun || '',
    rt: santri.rt || '',
    rw: santri.rw || '',
    desa: santri.desa || '',
    kecamatan: santri.kecamatan || '',
    kabupaten: santri.kabupaten || '',
    provinsi: santri.provinsi || '',
    kode_pos: santri.kode_pos || '',
  }
}

function mapHubunganWali(raw) {
  const h = String(raw || '').trim()
  if (!h) return 'Wali'
  const match = MAHROM_HUBUNGAN_OPTIONS.find(
    (opt) => opt.toLowerCase() === h.toLowerCase()
  )
  return match || (h.charAt(0).toUpperCase() + h.slice(1).toLowerCase())
}

/** Ambil potongan biodata mahrom dari field ayah/ibu/wali di tabel santri */
export function mahromBiodataFromSantri(santri, source) {
  const empty = {
    nama: '',
    nik: '',
    tempat_lahir: '',
    tanggal_lahir: '',
    gender: '',
    no_telpon: '',
    no_wa: '',
    email: '',
    pekerjaan: '',
    pendidikan: '',
    ...alamatFromSantri(santri),
  }

  if (!santri || source === 'manual') {
    return { biodata: empty, hubungan: 'Ayah', hasData: true }
  }

  if (source === 'ayah') {
    const biodata = {
      ...empty,
      nama: String(santri.ayah || '').trim(),
      nik: digitsNik(santri.nik_ayah),
      tempat_lahir: santri.tempat_lahir_ayah || '',
      tanggal_lahir: normalizeDate(santri.tanggal_lahir_ayah),
      gender: 'Laki-laki',
      pekerjaan: santri.pekerjaan_ayah || '',
      pendidikan: santri.pendidikan_ayah || '',
    }
    return {
      biodata,
      hubungan: 'Ayah',
      hasData: !!(biodata.nama || biodata.nik),
      previewLabel: biodata.nama || '—',
      previewNik: biodata.nik || '—',
    }
  }

  if (source === 'ibu') {
    const biodata = {
      ...empty,
      nama: String(santri.ibu || '').trim(),
      nik: digitsNik(santri.nik_ibu),
      tempat_lahir: santri.tempat_lahir_ibu || '',
      tanggal_lahir: normalizeDate(santri.tanggal_lahir_ibu),
      gender: 'Perempuan',
      pekerjaan: santri.pekerjaan_ibu || '',
      pendidikan: santri.pendidikan_ibu || '',
    }
    return {
      biodata,
      hubungan: 'Ibu',
      hasData: !!(biodata.nama || biodata.nik),
      previewLabel: biodata.nama || '—',
      previewNik: biodata.nik || '—',
    }
  }

  if (source === 'wali') {
    const biodata = {
      ...empty,
      nama: String(santri.wali || '').trim(),
      nik: digitsNik(santri.nik_wali),
      tempat_lahir: santri.tempat_lahir_wali || '',
      tanggal_lahir: normalizeDate(santri.tanggal_lahir_wali),
      pekerjaan: santri.pekerjaan_wali || '',
      pendidikan: santri.pendidikan_wali || '',
    }
    return {
      biodata,
      hubungan: mapHubunganWali(santri.hubungan_wali),
      hasData: !!(biodata.nama || biodata.nik),
      previewLabel: biodata.nama || '—',
      previewNik: biodata.nik || '—',
      previewHubungan: mapHubunganWali(santri.hubungan_wali),
    }
  }

  return { biodata: empty, hubungan: 'Ayah', hasData: false }
}

export function santriOptionLabel(s) {
  if (!s) return ''
  return `${s.nama || ''}${s.nis ? ` (NIS ${s.nis})` : ''}`.trim()
}

export function relasiRowForSantri(santri, hubungan = 'Ayah', extra = {}) {
  return {
    relasi_id: null,
    santri_id: santri.id,
    santri_label: santriOptionLabel(santri),
    hubungan,
    is_utama: true,
    keterangan: '',
    ...extra,
  }
}

export const emptyMahromForm = () => ({
  nama: '',
  nik: '',
  tempat_lahir: '',
  tanggal_lahir: '',
  gender: '',
  no_telpon: '',
  no_wa: '',
  email: '',
  pekerjaan: '',
  pendidikan: '',
  dusun: '',
  rt: '',
  rw: '',
  desa: '',
  kecamatan: '',
  kabupaten: '',
  provinsi: '',
  kode_pos: '',
  relasi: [],
})

export const emptyRelasiRow = () => ({
  relasi_id: null,
  santri_id: '',
  santri_label: '',
  hubungan: 'Ayah',
  is_utama: false,
  keterangan: '',
})

export function mahromFormFromDetail(detail) {
  if (!detail) return emptyMahromForm()
  return {
    nama: detail.nama || '',
    nik: detail.nik || '',
    tempat_lahir: detail.tempat_lahir || '',
    tanggal_lahir: detail.tanggal_lahir || '',
    gender: detail.gender || '',
    no_telpon: detail.no_telpon || '',
    no_wa: detail.no_wa || '',
    email: detail.email || '',
    pekerjaan: detail.pekerjaan || '',
    pendidikan: detail.pendidikan || '',
    dusun: detail.dusun || '',
    rt: detail.rt || '',
    rw: detail.rw || '',
    desa: detail.desa || '',
    kecamatan: detail.kecamatan || '',
    kabupaten: detail.kabupaten || '',
    provinsi: detail.provinsi || '',
    kode_pos: detail.kode_pos || '',
    relasi: (detail.relasi_santri || []).map((r) => ({
      relasi_id: r.relasi_id,
      santri_id: r.santri_id,
      santri_label: `${r.santri_nama || ''}${r.nis ? ` (NIS ${r.nis})` : ''}`.trim(),
      hubungan: r.hubungan || 'Ayah',
      is_utama: Boolean(r.is_utama),
      keterangan: r.keterangan || '',
    })),
  }
}
