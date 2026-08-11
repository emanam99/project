import { tingkatanSlugsFromMadrasah } from '../pages/UGT/tingkatanConfig'

/**
 * Payload PUT /madrasah/{id} dari baris list + patch field (mis. id_koordinator).
 * Pola sama BulkEditMadrasahOffcanvas agar update parsial aman.
 *
 * @param {Record<string, unknown>|null|undefined} item
 * @param {Record<string, unknown>} [patch]
 */
export function buildMadrasahUpdatePayload(item, patch = {}) {
  const m = item || {}
  const nama = String(m.nama ?? 'Madrasah').trim() || 'Madrasah'
  const payload = {
    identitas: m.identitas ?? null,
    nama,
    kategori: m.kategori ?? null,
    status: m.status ?? null,
    id_alamat: m.id_alamat ?? null,
    dusun: m.dusun ?? null,
    rt: m.rt ?? null,
    rw: m.rw ?? null,
    desa: m.desa ?? null,
    kecamatan: m.kecamatan ?? null,
    kabupaten: m.kabupaten ?? null,
    provinsi: m.provinsi ?? null,
    kode_pos: m.kode_pos ?? null,
    id_koordinator:
      m.koordinator_nip != null && m.koordinator_nip !== ''
        ? m.koordinator_nip
        : m.id_koordinator ?? null,
    sektor: m.sektor ?? null,
    nama_pengasuh: m.nama_pengasuh ?? m.pengasuh_nama ?? null,
    id_pengasuh: m.id_pengasuh ?? null,
    no_pengasuh: m.no_pengasuh ?? m.pengasuh_wa ?? null,
    kepala: m.kepala ?? null,
    sekretaris: m.sekretaris ?? null,
    bendahara: m.bendahara ?? null,
    nama_pjgt: m.nama_pjgt ?? m.pjgt_nama ?? null,
    id_pjgt: m.id_pjgt ?? null,
    no_pjgt: m.no_pjgt ?? m.pjgt_wa ?? null,
    tingkatan: tingkatanSlugsFromMadrasah(m),
    kurikulum: m.kurikulum ?? null,
    jumlah_murid: m.jumlah_murid != null ? m.jumlah_murid : null,
    kegiatan_pagi: m.kegiatan_pagi ? 1 : 0,
    kegiatan_pagi_mulai: m.kegiatan_pagi_mulai ?? null,
    kegiatan_pagi_sampai: m.kegiatan_pagi_sampai ?? null,
    kegiatan_sore: m.kegiatan_sore ? 1 : 0,
    kegiatan_sore_mulai: m.kegiatan_sore_mulai ?? null,
    kegiatan_sore_sampai: m.kegiatan_sore_sampai ?? null,
    kegiatan_malam: m.kegiatan_malam ? 1 : 0,
    kegiatan_malam_mulai: m.kegiatan_malam_mulai ?? null,
    kegiatan_malam_sampai: m.kegiatan_malam_sampai ?? null,
    tempat: m.tempat ?? null,
    berdiri_tahun: m.berdiri_tahun != null ? m.berdiri_tahun : null,
    kelas_tertinggi: m.kelas_tertinggi ?? null,
    keterangan: m.keterangan ?? null,
    banin_banat: m.banin_banat ?? null,
    seragam: m.seragam ?? null,
    syahriah: m.syahriah ?? null,
    pengelola: m.pengelola ?? null,
    gedung_madrasah: m.gedung_madrasah ?? null,
    kantor: m.kantor ?? null,
    bangku: m.bangku ?? null,
    kamar_mandi_murid: m.kamar_mandi_murid ?? null,
    kamar_gt: m.kamar_gt ?? null,
    kamar_mandi_gt: m.kamar_mandi_gt ?? null,
    km_bersifat: m.km_bersifat ?? null,
    konsumsi: m.konsumsi ?? null,
    kamar_gt_jarak: m.kamar_gt_jarak ?? null,
    masyarakat: m.masyarakat ?? null,
    alumni: m.alumni ?? null,
    jarak_md_lain: m.jarak_md_lain ?? null,
    foto_path: m.foto_path ?? null,
    logo_path: m.logo_path ?? null,
    ...patch,
  }
  return payload
}
