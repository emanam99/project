/** Pecah Y-m-d Hijriyah → { hari, bulan, tahun } untuk slot cetak */
export function splitHijriYmd(ymd) {
  if (!ymd || typeof ymd !== 'string') return { hari: '', bulan: '', tahun: '' }
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return { hari: '', bulan: '', tahun: '' }
  return {
    hari: String(Number(m[3])),
    bulan: String(Number(m[2])),
    tahun: m[1]
  }
}

/** Opsi gelombang tes masuk — input angka bebas (positif). */
export function sanitizeGelombangTesInput(raw) {
  return String(raw ?? '').replace(/\D/g, '')
}

/** Payload form → API */
export function buildTesMadinPayload(idSantri, tahunHijriyah, tahunMasehi, state, idRegistrasi = null) {
  const gelombangDigits = sanitizeGelombangTesInput(state?.gelombang ?? '')
  const payload = {
    id_santri: idSantri,
    tahun_hijriyah: tahunHijriyah,
    tahun_masehi: tahunMasehi,
    gelombang: gelombangDigits || null,
    tanggal_tes_hijriyah: state.tanggalTesHijriyah || null,
    t1_membaca: state.t1_membaca,
    t1_menulis: state.t1_menulis,
    t1_jumlah: state.t1_jumlah,
    t1_keputusan: state.t1_keputusan || null,
    t2_kitab: state.t2_kitab,
    t2_nahwu_sharaf_5: state.t2_ns5,
    t2_nahwu_sharaf_6: state.t2_ns6,
    t2_jumlah: state.t2_jumlah,
    t2_keputusan_kelas: state.t2_keputusan_kelas || null,
    t2_lanjut_t3: state.t2_lanjut_t3 ? 1 : 0,
    t3_baca: state.t3_baca,
    t3_nahwu: state.t3_nahwu,
    t3_sharaf: state.t3_sharaf,
    t3_jumlah: state.t3_jumlah,
    t3_keputusan_kelas: state.t3_keputusan_kelas || null,
    t3_lanjut_t4: state.t3_lanjut_t4 ? 1 : 0,
    t4_baca: state.t4_baca,
    t4_fiqih: state.t4_fiqih,
    t4_nahwu: state.t4_nahwu,
    t4_balaghah: state.t4_balaghah,
    t4_jumlah: state.t4_jumlah,
    t4_keputusan: state.t4_keputusan || null,
    tanggal_surat_hijriyah: state.tanggalSuratHijriyah || null,
    nama_ketua_panitia: state.namaKetua
  }
  const regId = idRegistrasi != null ? Number(idRegistrasi) : 0
  if (Number.isFinite(regId) && regId > 0) {
    payload.id_registrasi = regId
  }
  return payload
}

/** Map baris DB → state form */
export function mapTesMadinRowToState(row) {
  if (!row) return null
  const gelombangRaw = row.gelombang
  const gelombang = gelombangRaw != null && String(gelombangRaw).trim() !== ''
    ? String(gelombangRaw).replace(/\D/g, '')
    : ''
  return {
    gelombang,
    tanggalTesHijriyah: row.tanggal_tes_hijriyah || '',
    t1_membaca: row.t1_membaca || '',
    t1_menulis: row.t1_menulis || '',
    t1_jumlah: row.t1_jumlah || '',
    t1_keputusan: row.t1_keputusan || '',
    t2_kitab: row.t2_kitab || '',
    t2_ns5: row.t2_nahwu_sharaf_5 || '',
    t2_ns6: row.t2_nahwu_sharaf_6 || '',
    t2_jumlah: row.t2_jumlah || '',
    t2_keputusan_kelas: row.t2_keputusan_kelas || '',
    t2_lanjut_t3: Number(row.t2_lanjut_t3) === 1,
    t3_baca: row.t3_baca || '',
    t3_nahwu: row.t3_nahwu || '',
    t3_sharaf: row.t3_sharaf || '',
    t3_jumlah: row.t3_jumlah || '',
    t3_keputusan_kelas: row.t3_keputusan_kelas || '',
    t3_lanjut_t4: Number(row.t3_lanjut_t4) === 1,
    t4_baca: row.t4_baca || '',
    t4_fiqih: row.t4_fiqih || '',
    t4_nahwu: row.t4_nahwu || '',
    t4_balaghah: row.t4_balaghah || '',
    t4_jumlah: row.t4_jumlah || '',
    t4_keputusan: row.t4_keputusan || '',
    tanggalSuratHijriyah: row.tanggal_surat_hijriyah || '',
    namaKetua: row.nama_ketua_panitia || 'Agil Farobi'
  }
}

/**
 * Keputusan masuk terakhir (bukan lanjut tahap) untuk pernyataan akhir rapor.
 * @returns {string|null}
 */
export function resolveKeputusanMasukTerakhir(state) {
  if (!state) return null

  if (state.t4_keputusan === '3_wustha') return 'Kelas 3 Wustha'
  if (state.t4_keputusan === '1_ulya') return 'Kelas 1 Ulya'

  if (state.t3_lanjut_t4) return null
  if (state.t3_keputusan_kelas === '1') return 'Kelas 1 Wustha'
  if (state.t3_keputusan_kelas === '2') return 'Kelas 2 Wustha'

  if (state.t2_lanjut_t3) return null
  if (state.t2_keputusan_kelas === '4') return 'Ula Kelas 4'
  if (state.t2_keputusan_kelas === '5') return 'Ula Kelas 5'
  if (state.t2_keputusan_kelas === '6') return 'Ula Kelas 6'

  if (state.t1_keputusan === 'istidadiyah') return "Program Isti'dadiyah"
  if (state.t1_keputusan === 'lanjut_t2') return null

  return null
}

/** Seed gelombang tes dari baris pendaftar (list / cache). */
export function gelombangTesFromPendaftar(source) {
  if (!source) return ''
  const raw = source.gelombang_tes ?? source.gelombang
  if (raw == null || String(raw).trim() === '') return ''
  return String(raw).replace(/\D/g, '')
}

/**
 * Label rombel diniyah aktif: Lembaga (kelas.kel).
 * @returns {string|null}
 */
export function formatRombelDiniyahLabel(source) {
  if (!source) return null
  const idDiniyah = source.id_diniyah ?? source.idDiniyah
  if (!idDiniyah || Number(idDiniyah) <= 0) return null

  const nama = String(source.diniyah_lembaga_nama ?? source.diniyah_nama ?? '').trim()
  const kelas = String(source.kelas_diniyah ?? '').trim()
  const kel = String(source.kel_diniyah ?? '').trim()
  if (!nama && !kelas && !kel) return null

  const rombelSuffix = (kelas || kel)
    ? `(${kelas || '—'}${kel ? `.${kel}` : ''})`
    : ''

  if (nama && rombelSuffix) return `${nama} ${rombelSuffix}`
  if (nama) return nama
  return rombelSuffix || null
}
