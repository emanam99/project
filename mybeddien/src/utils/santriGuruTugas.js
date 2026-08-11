/** Status santri «guru tugas» (kolom santri.s / status_santri dari biodata). */
export function isSantriGuruTugas(biodataOrStatus) {
  if (!biodataOrStatus) return false
  if (typeof biodataOrStatus === 'string') {
    return normalizeGuruTugasStatus(biodataOrStatus)
  }
  const raw =
    biodataOrStatus.status_santri ??
    biodataOrStatus.status ??
    biodataOrStatus.s ??
    ''
  return normalizeGuruTugasStatus(raw)
}

function normalizeGuruTugasStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase() === 'guru tugas'
}
