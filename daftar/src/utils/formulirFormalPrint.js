/** Formal dengan logo kop di formulir print (selaras eBeddien). */
export const FORMAL_WITH_FORMULIR_PRINT = ['PAUD', 'SMP', 'MTs', 'STAI']

/** Minimal total pembayaran registrasi agar tombol Print Formulir tampil. */
export const FORMULIR_PRINT_MIN_BAYAR = 10000

export function canPrintFormulirByFormal(formal) {
  const f = String(formal || '').trim()
  if (!f || f === 'Tidak Sekolah') return false
  return FORMAL_WITH_FORMULIR_PRINT.some((x) => x.toLowerCase() === f.toLowerCase())
}

export function canPrintFormulirByPayment(bayar) {
  return Number(bayar || 0) >= FORMULIR_PRINT_MIN_BAYAR
}
