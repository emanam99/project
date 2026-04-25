/** Selaras migrasi pendaftaran_fitur_actions */
export const PENDAFTARAN_ACTION_CODES = {
  biodataHapusSantri: 'action.pendaftaran.biodata.hapus_santri',
  /** Tanpa aksi ini (dan bukan super_admin): opsi filter formal/diniyah dibatasi ke lembaga sesuai scope role */
  dataPendaftarFilterFormalDiniyahSemuaLembaga:
    'action.pendaftaran.data_pendaftar.filter_formal_diniyah_semua_lembaga',
  routeItem: 'action.pendaftaran.route.item',
  routeManageItemSet: 'action.pendaftaran.route.manage_item_set',
  routeManageKondisi: 'action.pendaftaran.route.manage_kondisi',
  routeKondisiRegistrasi: 'action.pendaftaran.route.kondisi_registrasi',
  routeAssignItem: 'action.pendaftaran.route.assign_item',
  routeSimulasi: 'action.pendaftaran.route.simulasi'
}

/** path absolut → kode aksi route admin (sub-rute Item bersarang di /pendaftaran/item/...) */
export const PENDAFTARAN_ADMIN_PATH_TO_CODE = {
  '/pendaftaran/item': 'action.pendaftaran.route.item',
  '/pendaftaran/item/rekap': 'action.pendaftaran.route.item',
  '/pendaftaran/item/set': 'action.pendaftaran.route.manage_item_set',
  '/pendaftaran/item/kondisi': 'action.pendaftaran.route.manage_kondisi',
  '/pendaftaran/item/registrasi': 'action.pendaftaran.route.kondisi_registrasi',
  '/pendaftaran/item/assign': 'action.pendaftaran.route.assign_item',
  '/pendaftaran/item/simulasi': 'action.pendaftaran.route.simulasi'
}

/** Sub-rute PSB yang cukup dibatasi kode menu induk (tanpa aksi route terpisah) */
export const PENDAFTARAN_ADMIN_MENU_ONLY_PATHS = new Set([
  '/pendaftaran/padukan-data',
  '/pendaftaran/pengaturan'
])
