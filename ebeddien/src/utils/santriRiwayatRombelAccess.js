import { SANTRI_ACTION_CODES } from '../config/santriFiturCodes'

/** Selaras backend SantriController::canDeleteRiwayatRombel */
export function userCanHapusRiwayatRombel(fiturMenuCodes, user) {
  if (user?.is_real_super_admin) return true
  const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
  if (codes.includes(SANTRI_ACTION_CODES.riwayatRombelHapus)) return true
  const hasGranular = codes.some(
    (c) => typeof c === 'string' && c.startsWith('action.santri.riwayat_rombel.')
  )
  if (!hasGranular) return true
  return false
}
