/**
 * Registrasi sekali: gaya semantik Quill (judul / wirid / ayat / …) + toolbar Nailul Murod.
 * Font sebenarnya diatur di app pembaca Nailul Murod — di sini hanya kelas peran.
 * Impor sebelum instans Quill pertama (NailulMurodQuillEditor).
 */
import Quill from 'quill'
import 'quill/dist/quill.snow.css'

/**
 * Pakai attributer `font` Quill (class `ql-font-*`) dengan nilai semantik,
 * agar picker toolbar tetap standar tanpa format kustom baru.
 */
const Font = Quill.import('attributors/class/font')
export const NAILUL_STYLE_VALUES = ['judul', 'subjudul1', 'subjudul2', 'wirid', 'nadhom', 'ayat']
if (Font && Font.whitelist) {
  // Sertakan nilai lama (amiri, …) agar konten existing tetap terbaca Quill.
  Font.whitelist = [
    ...NAILUL_STYLE_VALUES,
    'amiri',
    'lateef',
    'scheherazade',
    'inter',
    'roboto',
    false,
  ]
  Quill.register(Font, true)
}

/** Gaya Arab/kitab — saat aktif, angka Latin diganti angka Arab-Hindi (٠١٢٣…). */
export const NAILUL_ARABIC_STYLES = new Set([
  'wirid',
  'nadhom',
  'ayat',
  // legacy font keys
  'amiri',
  'lateef',
  'scheherazade',
])

/** 0–9 → ٠–٩ (U+0660…U+0669), penomoran lazim di kitab. */
const WESTERN_TO_ARABIC_INDIC = {
  '0': '٠',
  '1': '١',
  '2': '٢',
  '3': '٣',
  '4': '٤',
  '5': '٥',
  '6': '٦',
  '7': '٧',
  '8': '٨',
  '9': '٩',
}

export function toArabicIndicDigits(text) {
  if (!text) return text
  return String(text).replace(/[0-9]/g, (d) => WESTERN_TO_ARABIC_INDIC[d] || d)
}

/** Konteks mengetik Arab: gaya wirid/ayat (atau legacy font) atau arah RTL. */
export function isArabicTypingContext(quill) {
  if (!quill) return false
  const format = quill.getFormat()
  if (format.direction === 'rtl') return true
  if (format.font && NAILUL_ARABIC_STYLES.has(format.font)) return true
  return false
}

/** Palette Quill + `false` untuk kembali ke warna default (null). */
const COLOR_SWATCHES = [
  false,
  '#000000',
  '#e60000',
  '#ff9900',
  '#ffff00',
  '#008a00',
  '#0066cc',
  '#9933ff',
  '#ffffff',
  '#facccc',
  '#ffebcc',
  '#ffffcc',
  '#cce8cc',
  '#cce0f5',
  '#ebd6ff',
  '#bbbbbb',
  '#f06666',
  '#ffc266',
  '#ffff66',
  '#66b966',
  '#66a3e0',
  '#c285ff',
  '#888888',
  '#a10000',
  '#b26b00',
  '#b2b200',
  '#006100',
  '#0047b2',
  '#6b24b2',
  '#444444',
  '#5c0000',
  '#663d00',
  '#666600',
  '#003700',
  '#002966',
  '#3d1466',
]

export const NAILUL_MUROD_QUILL_MODULES = {
  toolbar: [
    // Satu picker gaya semantik (bukan nama font). false = Normal.
    [{ font: [...NAILUL_STYLE_VALUES, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: COLOR_SWATCHES }, { background: COLOR_SWATCHES }],
    [{ script: 'sub' }, { script: 'super' }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ indent: '-1' }, { indent: '+1' }],
    // 4 ikon rata (kiri, tengah, kanan, justify) — kiri wajib `''` (bukan `null`):
    // bila tanpa atribut `value`, Quill memakai cabang isActive s.y. salah utk "align" (rata kiri
    // tampil aktif terus saat getFormat() mengembalikan false/undefined). String kosong
    // memakai aturan: formats.align == null && !value → hanya rata-kiri yg aktif.
    [{ align: '' }, { align: 'center' }, { align: 'right' }, { align: 'justify' }],
    [{ direction: 'rtl' }],
    ['blockquote', 'link'],
    ['clean'],
  ],
}

export const NAILUL_MUROD_QUILL_FORMATS = [
  'font',
  'header', // tetap didukung untuk konten lama yang memakai H1–H3
  'bold',
  'italic',
  'underline',
  'strike',
  'color',
  'background',
  'script',
  'list',
  'bullet',
  'indent',
  'align',
  'direction',
  'blockquote',
  'link',
]
