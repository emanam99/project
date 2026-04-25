/** CustomEvent di window: detail = { id_santri?, tahun_ajaran?, action?, ts? } */
export const EBEDDIEN_IJIN_HINT = 'ebeddien-ijin-hint'

/**
 * @param {object} [detail]
 * @returns {boolean} true bila event relevan untuk santri + tahun ajaran yang sedang dipakai
 */
export function ijinHintMatches(detail, idSantri, tahunAjaran) {
  const d = detail && typeof detail === 'object' ? detail : {}
  if (d.id_santri != null && idSantri != null) {
    if (Number(d.id_santri) !== Number(idSantri)) {
      return false
    }
  }
  if (d.tahun_ajaran != null && String(d.tahun_ajaran).trim() !== '' && tahunAjaran != null && String(tahunAjaran).trim() !== '') {
    if (String(d.tahun_ajaran) !== String(tahunAjaran)) {
      return false
    }
  }
  return true
}
