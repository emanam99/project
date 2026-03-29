/**
 * Urutan grup menu di UI (sidebar, expanded, Beranda, Semua Menu, halaman Fitur).
 * Item menu utama dari database (app___fitur + katalog API). Cadangan bila katalog kosong / tidak terfilter: lihat STATIC_FALLBACK_MENU_CATALOG_ROWS.
 */
export const GROUP_ORDER = [
  'My Workspace',
  'Super Admin',
  'Pendaftaran',
  'UWABA',
  'UGT',
  'Cashless',
  'Keuangan',
  'Umroh',
  'Ijin',
  'Kalender',
  'Kalender Pesantren',
  'Domisili',
  'Lembaga',
  'Setting',
  'Tentang'
]

/**
 * Bentuk selaras baris GET /v2/fitur/ebeddien/menu-catalog (tanpa code = selalu tampil jika dipakai sebagai cadangan).
 */
export const STATIC_FALLBACK_MENU_CATALOG_ROWS = [
  {
    type: 'menu',
    path: '/beranda',
    label: 'Beranda',
    icon_key: 'home',
    group_label: 'My Workspace',
    sort_order: 10,
    meta: null
  },
  {
    type: 'menu',
    path: '/profil',
    label: 'Profil',
    icon_key: 'user',
    group_label: 'My Workspace',
    sort_order: 20,
    meta: null
  },
  {
    type: 'menu',
    path: '/kalender',
    label: 'Kalender',
    icon_key: 'calendar',
    group_label: 'Kalender',
    sort_order: 30,
    meta: null
  },
  {
    type: 'menu',
    path: '/tentang',
    label: 'Tentang',
    icon_key: 'info',
    group_label: 'Tentang',
    sort_order: 40,
    meta: null
  },
  {
    type: 'menu',
    path: '/version',
    label: 'Versi',
    icon_key: 'code',
    group_label: 'Tentang',
    sort_order: 50,
    meta: null
  },
  {
    type: 'menu',
    path: '/info-aplikasi',
    label: 'Info Aplikasi',
    icon_key: 'building',
    group_label: 'Tentang',
    sort_order: 60,
    meta: null
  }
]
