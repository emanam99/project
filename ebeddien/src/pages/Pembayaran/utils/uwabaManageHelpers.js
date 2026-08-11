import { calculateWajibFromBiodata, hijriUwabaBulanList } from '../../../utils/uwabaCalculator'

/** Status yang tidak wajib punya baris UWABA (case-insensitive substring). */
const EXCLUDED_STATUS_PATTERNS = ['boyong', 'alumni', 'lulus', 'lulusan']

export function isUwabaExcludedStatus(status) {
  const s = String(status ?? '').trim().toLowerCase()
  if (!s) return false
  return EXCLUDED_STATUS_PATTERNS.some((p) => s.includes(p))
}

export function isUwabaEligibleSantri(santri) {
  return !isUwabaExcludedStatus(santri?.status_santri ?? santri?.status)
}

export const HIJRI_UWABA_BULAN_IDS = hijriUwabaBulanList.map((b) => b.id)

export function buildLengkapiPayloadFromRow(santri, uwabaPrices) {
  const biodata = {
    status_santri: santri.status_santri || santri.status || 'Mukim',
    kategori: santri.kategori || '',
    diniyah: santri.lembaga_id_diniyah || santri.diniyah || '',
    formal: santri.lembaga_id_formal || santri.formal || '',
    lttq: santri.lttq || '',
    saudara_di_pesantren: santri.saudara_di_pesantren || 'Tidak Ada',
  }
  const wajib = calculateWajibFromBiodata(biodata, uwabaPrices)
  return {
    status_santri: biodata.status_santri,
    kategori: biodata.kategori,
    diniyah: String(biodata.diniyah || ''),
    formal: String(biodata.formal || ''),
    lttq: biodata.lttq || '',
    saudara_di_pesantren: biodata.saudara_di_pesantren,
    wajib: wajib || 0,
    keterangan: '',
    is_disabled: 0,
    sama: 1,
  }
}

/** Rata-rata wajib per bulan vs wajib dari biodata saat ini. */
export function hasWajibBiodataMismatch(santri, tolerance = 500) {
  const count = Number(santri.count) || 0
  const wajibTa = Number(santri.wajib) || 0
  const wajibSebulan = Number(santri.wajib_sebulan) || 0
  if (count <= 0 || wajibSebulan <= 0) return false
  const avgPerBulan = wajibTa / count
  return Math.abs(avgPerBulan - wajibSebulan) > tolerance
}

export function getLebihBayar(santri) {
  const wajib = Number(santri.wajib) || 0
  const bayarTransaksi = Number(santri.bayar_transaksi ?? santri.bayar) || 0
  return Math.max(0, bayarTransaksi - wajib)
}

export function hasBayarMismatch(santri) {
  const alokasi = Number(santri.bayar) || 0
  const transaksi = Number(santri.bayar_transaksi)
  if (transaksi == null || Number.isNaN(transaksi)) return false
  return alokasi !== transaksi
}

export function getKurangLainTa(santri, tahunAjaranAktif) {
  const kurangAll = Number(santri.kurang_all_ta) || 0
  const kurangTa = Number(santri.kurang) || 0
  if (kurangAll <= kurangTa) return 0
  return kurangAll - kurangTa
}

export function computeFinancialSummary(rows) {
  return rows.reduce(
    (acc, s) => {
      const wajib = Number(s.wajib) || 0
      const bayar = Number(s.bayar_transaksi ?? s.bayar) || 0
      const kurang = Math.max(0, Number(s.kurang) || 0)
      const lebih = getLebihBayar(s)
      acc.wajib += wajib
      acc.bayar += bayar
      acc.kurang += kurang
      acc.lebih += lebih
      return acc
    },
    { wajib: 0, bayar: 0, kurang: 0, lebih: 0 }
  )
}

export function groupByRombelDiniyah(rows) {
  const map = new Map()
  for (const s of rows) {
    const key = [s.diniyah || '(kosong)', s.kelas_diniyah || '-', s.kel_diniyah || '-'].join(' · ')
    map.set(key, (map.get(key) || 0) + 1)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1])
}

export function filterOnboardingTargets(rows, mode) {
  return rows.filter((s) => {
    if (!isUwabaEligibleSantri(s)) return false
    const c = Number(s.count) || 0
    if (mode === 'generate') return c === 0
    if (mode === 'lengkapi') return c > 0 && c < 10
    return false
  })
}
