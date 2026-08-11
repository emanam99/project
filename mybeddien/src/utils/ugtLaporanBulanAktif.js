/**
 * Apakah baris laporan GT/PJGT masih boleh diubah (bulan + TA = konteks aktif).
 * @param {{ bulan?: unknown, id_tahun_ajaran?: unknown } | null | undefined} row
 * @param {{ bulan_hijriyah?: unknown, id_tahun_ajaran?: unknown } | null | undefined} konteks
 */
export function isUgtLaporanBulanAktif(row, konteks) {
  if (!row || !konteks) return false
  const bulanAktif = Number(konteks.bulan_hijriyah)
  if (!Number.isFinite(bulanAktif) || bulanAktif < 1 || bulanAktif > 12) return false
  const rowBulan = Number(row.bulan)
  if (!Number.isFinite(rowBulan) || rowBulan !== bulanAktif) return false
  const taAktif = String(konteks.id_tahun_ajaran ?? '').trim()
  const rowTa = String(row.id_tahun_ajaran ?? '').trim()
  if (taAktif && rowTa && taAktif !== rowTa) return false
  return true
}
