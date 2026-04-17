/** Helpers shared oleh halaman riwayat pembayaran (Pendaftaran, UWABA, Khusus, Tunggakan). */

export const formatCurrency = (value) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value || 0)

export const formatDate = (dateString) => {
  if (!dateString) return '-'
  try {
    return new Date(dateString).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return String(dateString)
  }
}

export function uniqueHistoryById(items) {
  if (!Array.isArray(items) || items.length === 0) return []
  const seen = new Set()
  return items.filter((p) => {
    const id = p?.id ?? p?.id_bayar
    if (id == null || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

export const VIA_COLORS = { Cash: '#10b981', Transfer: '#3b82f6', QRIS: '#8b5cf6', 'E-Wallet': '#f59e0b', iPayMu: '#8b5cf6' }
export const getViaColor = (via) => VIA_COLORS[via] || '#6b7280'

/** Status pembayaran pendaftaran: Belum bayar / Kurang Rp X / Lunas */
export function statusPendaftaran(wajib, bayar, kurang, formatCur) {
  const w = Number(wajib) || 0
  const b = Number(bayar) || 0
  const k = Number(kurang) ?? (w - b)
  if (w === 0) return { label: '—', type: 'muted' }
  if (b === 0) return { label: 'Belum bayar', type: 'belum' }
  if (k > 0) return { label: `Kurang ${formatCur(k)}`, type: 'kurang' }
  return { label: 'Lunas', type: 'lunas' }
}
