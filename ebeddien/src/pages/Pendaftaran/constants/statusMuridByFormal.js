/**
 * Opsi status murid per daftar formal — sama logika dengan aplikasi daftar (PilihanStatusMurid).
 * Tidak memakai psb___kondisi_value agar konsisten antar app.
 */

const OPSI_BY_FORMAL = {
  SMP: [
    { value: 'Murid Baru', label: 'Murid Baru' },
    { value: 'Pindahan kelas 7', label: 'Pindahan kelas 7' },
    { value: 'Pindahan kelas 8', label: 'Pindahan kelas 8' },
    { value: 'Pindahan kelas 9', label: 'Pindahan kelas 9' },
  ],
  MTs: [
    { value: 'Murid Baru', label: 'Murid Baru' },
    { value: 'Pindahan kelas 7', label: 'Pindahan kelas 7' },
    { value: 'Pindahan kelas 8', label: 'Pindahan kelas 8' },
    { value: 'Pindahan kelas 9', label: 'Pindahan kelas 9' },
  ],
  SMAI: [
    { value: 'Murid Baru', label: 'Murid Baru' },
    { value: 'Pindahan kelas 10', label: 'Pindahan kelas 10' },
    { value: 'Pindahan kelas 11', label: 'Pindahan kelas 11' },
    { value: 'Pindahan kelas 12', label: 'Pindahan kelas 12' },
  ],
  SMA: [
    { value: 'Murid Baru', label: 'Murid Baru' },
    { value: 'Pindahan kelas 10', label: 'Pindahan kelas 10' },
    { value: 'Pindahan kelas 11', label: 'Pindahan kelas 11' },
    { value: 'Pindahan kelas 12', label: 'Pindahan kelas 12' },
  ],
  STAI: [
    { value: 'Mahasiswa Baru', label: 'Mahasiswa Baru' },
    { value: 'Mahasiswa Pindahan', label: 'Mahasiswa Pindahan' },
  ],
}

const FORMAL_SHOW_STATUS_MURID = ['SMP', 'MTs', 'SMAI', 'SMA', 'STAI']

export function getOpsiStatusMuridForFormal(formal) {
  const f = String(formal || '').trim()
  if (!f) return []
  return OPSI_BY_FORMAL[f] || []
}

export function shouldShowStatusMuridForFormal(formal) {
  return FORMAL_SHOW_STATUS_MURID.includes(String(formal || '').trim())
}

export { OPSI_BY_FORMAL, FORMAL_SHOW_STATUS_MURID }
