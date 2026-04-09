/** Kode action di bawah menu /laporan (grup UWABA) — selaras migrasi laporan_uwaba_fitur_actions */
export const LAPORAN_ACTION_CODES = {
  tabTunggakan: 'action.laporan.tab.tunggakan',
  tabKhusus: 'action.laporan.tab.khusus',
  tabUwaba: 'action.laporan.tab.uwaba',
  tabPendaftaran: 'action.laporan.tab.pendaftaran'
}

/** Tab UWABA (bukan PSB) — untuk deteksi grup laporan tanpa daftar role statis */
export const LAPORAN_UWABA_TAB_CODES = [
  LAPORAN_ACTION_CODES.tabTunggakan,
  LAPORAN_ACTION_CODES.tabKhusus,
  LAPORAN_ACTION_CODES.tabUwaba
]
