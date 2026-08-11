/**
 * Pesan error upload KK yang lebih mudah dipahami pengguna.
 */
export function mapLupaNisUploadError(err, fallback = 'Gagal mengunggah KK. Coba lagi.') {
  const msg = String(err?.response?.data?.message || err?.message || '').trim()
  if (!msg) return fallback
  const lower = msg.toLowerCase()
  if (lower.includes('masih diproses') || lower.includes('sedang ditinjau')) {
    return 'Pengajuan Anda sudah masuk antrean admin. NIS akan dikirim ke nomor WhatsApp yang Anda isi setelah disetujui.'
  }
  if (lower.includes('sudah diproses')) {
    return 'Pengajuan ini sudah diproses. Periksa pesan WhatsApp Anda untuk NIS atau hubungi admin.'
  }
  if (lower.includes('ukuran') || lower.includes('terlalu besar') || lower.includes('size')) {
    return msg
  }
  if (lower.includes('format') || lower.includes('tidak didukung') || lower.includes('valid')) {
    return `${msg} Gunakan foto JPG/PNG atau PDF.`
  }
  if (lower.includes('network') || lower.includes('timeout') || err?.code === 'ECONNABORTED') {
    return 'Koneksi terputus saat mengunggah. Periksa internet, lalu coba lagi.'
  }
  return msg
}
