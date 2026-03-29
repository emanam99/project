/**
 * Bangun state form biodata + meta sinkron dari respons API get-biodata & get-registrasi.
 */

export const REGISTRASI_SLICE_KEYS = [
  'status_pendaftar',
  'daftar_diniyah',
  'daftar_formal',
  'status_murid',
  'status_santri',
  'prodi',
  'gelombang',
  'madrasah',
  'nama_madrasah',
  'alamat_madrasah',
  'lulus_madrasah',
  'sekolah',
  'nama_sekolah',
  'alamat_sekolah',
  'lulus_sekolah',
  'npsn',
  'nsm',
  'jurusan',
  'program_sekolah',
]

const regSet = new Set(REGISTRASI_SLICE_KEYS)

/**
 * @param {Record<string, unknown>} prev
 * @param {Record<string, unknown>} fullNew
 */
export function mergeSantriSlice(prev, fullNew) {
  const next = { ...prev }
  for (const k of Object.keys(fullNew)) {
    if (regSet.has(k)) continue
    next[k] = fullNew[k]
  }
  return next
}

/**
 * @param {Record<string, unknown>} prev
 * @param {Record<string, unknown>} fullNew
 */
export function mergeRegistrasiSlice(prev, fullNew) {
  const next = { ...prev }
  for (const k of REGISTRASI_SLICE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(fullNew, k)) {
      next[k] = fullNew[k]
    }
  }
  return next
}

/**
 * @param {object} biodata
 * @param {object|null} registrasi
 * @param {boolean} registrasiSuccess
 * @param {{ nik?: string|null, nama?: string|null }} user
 * @param {string|null} nikFallback
 * @param {() => string|null} getGelombangAktif
 */
export function buildBiodataFormFromApis(
  biodata,
  registrasi,
  registrasiSuccess,
  user,
  nikFallback,
  getGelombangAktif
) {
  const nisDisplay =
    biodata.nis && /^\d{7}$/.test(String(biodata.nis))
      ? String(biodata.nis)
      : biodata.id != null && biodata.id !== ''
        ? String(biodata.id)
        : ''

  const newFormData = {
    id: nisDisplay,
    nama: biodata.nama || '',
    nik: biodata.nik || user?.nik || nikFallback || '',
    gender: biodata.gender || '',
    tempat_lahir: biodata.tempat_lahir || '',
    tanggal_lahir: biodata.tanggal_lahir || '',
    nisn: biodata.nisn || '',
    no_kk: biodata.no_kk || '',
    kepala_keluarga: biodata.kepala_keluarga || '',
    anak_ke: biodata.anak_ke || '',
    jumlah_saudara: biodata.jumlah_saudara || '',
    saudara_di_pesantren: biodata.saudara_di_pesantren || '',
    hobi: biodata.hobi || '',
    cita_cita: biodata.cita_cita || '',
    kebutuhan_khusus: biodata.kebutuhan_khusus || '',
    ayah: biodata.ayah || '',
    status_ayah: biodata.status_ayah || 'Masih Hidup',
    nik_ayah: biodata.nik_ayah || '',
    tempat_lahir_ayah: biodata.tempat_lahir_ayah || '',
    tanggal_lahir_ayah: biodata.tanggal_lahir_ayah || '',
    pekerjaan_ayah: biodata.pekerjaan_ayah || '',
    pendidikan_ayah: biodata.pendidikan_ayah || '',
    penghasilan_ayah: biodata.penghasilan_ayah || '',
    ibu: biodata.ibu || '',
    status_ibu: biodata.status_ibu || 'Masih Hidup',
    nik_ibu: biodata.nik_ibu || '',
    tempat_lahir_ibu: biodata.tempat_lahir_ibu || '',
    tanggal_lahir_ibu: biodata.tanggal_lahir_ibu || '',
    pekerjaan_ibu: biodata.pekerjaan_ibu || '',
    pendidikan_ibu: biodata.pendidikan_ibu || '',
    penghasilan_ibu: biodata.penghasilan_ibu || '',
    hubungan_wali: biodata.hubungan_wali || '',
    wali: biodata.wali || '',
    nik_wali: biodata.nik_wali || '',
    tempat_lahir_wali: biodata.tempat_lahir_wali || '',
    tanggal_lahir_wali: biodata.tanggal_lahir_wali || '',
    pekerjaan_wali: biodata.pekerjaan_wali || '',
    pendidikan_wali: biodata.pendidikan_wali || '',
    penghasilan_wali: biodata.penghasilan_wali || '',
    dusun: biodata.dusun || '',
    rt: biodata.rt || '',
    rw: biodata.rw || '',
    desa: biodata.desa || '',
    kecamatan: biodata.kecamatan || '',
    kabupaten: biodata.kabupaten || '',
    provinsi: biodata.provinsi || '',
    kode_pos: biodata.kode_pos || '',
    madrasah: '',
    nama_madrasah: '',
    alamat_madrasah: '',
    lulus_madrasah: '',
    sekolah: '',
    nama_sekolah: '',
    alamat_sekolah: '',
    lulus_sekolah: '',
    npsn: '',
    nsm: '',
    jurusan: '',
    program_sekolah: '',
    no_telpon: biodata.no_telpon || '',
    email: biodata.email ? String(biodata.email).trim() : '',
    riwayat_sakit: biodata.riwayat_sakit || '',
    ukuran_baju: biodata.ukuran_baju || '',
    kip: biodata.kip || '',
    pkh: biodata.pkh || '',
    kks: biodata.kks || '',
    status_nikah: biodata.status_nikah || '',
    pekerjaan: biodata.pekerjaan || '',
    no_wa_santri: biodata.no_wa_santri || '',
    status_santri: biodata.status_santri || '',
    kategori: biodata.kategori || '',
    daerah: biodata.daerah || '',
    kamar: biodata.kamar || '',
    diniyah: biodata.diniyah || '',
    kelas_diniyah: biodata.kelas_diniyah || '',
    kel_diniyah: biodata.kel_diniyah || '',
    nim_diniyah: biodata.nim_diniyah || '',
    formal: biodata.formal || '',
    kelas_formal: biodata.kelas_formal || '',
    kel_formal: biodata.kel_formal || '',
    nim_formal: biodata.nim_formal || '',
    lttq: biodata.lttq || '',
    kelas_lttq: biodata.kelas_lttq || '',
    kel_lttq: biodata.kel_lttq || '',
    prodi: biodata.prodi || '',
    gelombang: '',
    status_pendaftar: '',
    daftar_diniyah: '',
    daftar_formal: '',
    status_murid: '',
  }

  if (registrasiSuccess && registrasi) {
    newFormData.status_pendaftar = registrasi.status_pendaftar || ''
    newFormData.daftar_diniyah = registrasi.daftar_diniyah || ''
    newFormData.daftar_formal = registrasi.daftar_formal || ''
    newFormData.status_murid = registrasi.status_murid || ''
    newFormData.status_santri = registrasi.status_santri || ''
    newFormData.prodi = registrasi.prodi || ''
    const gelombangAktif = typeof getGelombangAktif === 'function' ? getGelombangAktif() : null
    newFormData.gelombang = registrasi.gelombang || gelombangAktif || ''
    newFormData.madrasah = registrasi.madrasah || ''
    newFormData.nama_madrasah = registrasi.nama_madrasah || ''
    newFormData.alamat_madrasah = registrasi.alamat_madrasah || ''
    newFormData.lulus_madrasah = registrasi.lulus_madrasah || ''
    newFormData.sekolah = registrasi.sekolah || ''
    newFormData.nama_sekolah = registrasi.nama_sekolah || ''
    newFormData.alamat_sekolah = registrasi.alamat_sekolah || ''
    newFormData.lulus_sekolah = registrasi.lulus_sekolah || ''
    newFormData.npsn = registrasi.npsn || ''
    newFormData.nsm = registrasi.nsm || ''
    newFormData.jurusan = registrasi.jurusan || ''
    newFormData.program_sekolah = registrasi.program_sekolah || ''
  } else {
    try {
      const savedPendaftar = localStorage.getItem('daftar_status_pendaftar')
      if (savedPendaftar === 'Baru' || savedPendaftar === 'Lama') {
        newFormData.status_pendaftar = savedPendaftar
      }
      const savedDiniyah = localStorage.getItem('daftar_diniyah')
      if (savedDiniyah && savedDiniyah !== '') {
        newFormData.daftar_diniyah = savedDiniyah
      }
      const savedFormal = localStorage.getItem('daftar_formal')
      if (savedFormal && savedFormal !== '') {
        newFormData.daftar_formal = savedFormal
      }
      const savedSantri = localStorage.getItem('daftar_status_santri')
      if (savedSantri === 'Mukim' || savedSantri === 'Khoriji') {
        newFormData.status_santri = savedSantri
      }
      const savedMurid = localStorage.getItem('daftar_status_murid')
      if (savedMurid && savedMurid !== '') {
        newFormData.status_murid = savedMurid
      }
      const savedProdi = localStorage.getItem('daftar_prodi')
      if (savedProdi && savedProdi !== '') {
        newFormData.prodi = savedProdi
      }
    } catch {
      /* ignore */
    }
  }

  let idRegHeader =
    biodata.id_registrasi != null && biodata.id_registrasi !== '' ? Number(biodata.id_registrasi) : null
  if (idRegHeader == null || Number.isNaN(idRegHeader)) {
    if (registrasiSuccess && registrasi) {
      const raw = registrasi.id_registrasi ?? registrasi.id
      if (raw != null && raw !== '') {
        idRegHeader = Number(raw)
      }
    }
  }

  const meta = {
    id_santri: biodata.id != null ? String(biodata.id) : null,
    id_registrasi: !Number.isNaN(idRegHeader) && idRegHeader != null ? idRegHeader : null,
    nis: biodata.nis != null && String(biodata.nis).trim() !== '' ? String(biodata.nis).trim() : null,
    nik_snapshot: newFormData.nik ? String(newFormData.nik).trim() : '',
    tanggal_update_santri:
      biodata.tanggal_update != null && String(biodata.tanggal_update).trim() !== ''
        ? String(biodata.tanggal_update)
        : null,
    tanggal_update_registrasi:
      registrasiSuccess && registrasi && registrasi.tanggal_update != null
        ? String(registrasi.tanggal_update)
        : null,
  }

  return { formData: newFormData, meta }
}
