/**
 * Registrasi sekali: font kustom Quill (Amiri, Lateef, …) + toolbar Nailul Murod.
 * Impor sebelum instans Quill pertama (NailulMurodQuillEditor).
 */
import Quill from 'quill'
import 'quill/dist/quill.snow.css'

const Font = Quill.import('attributors/class/font')
if (Font && Font.whitelist) {
  Font.whitelist = ['amiri', 'lateef', 'scheherazade', 'inter', 'roboto', false]
  Quill.register(Font, true)
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
    [{ font: ['amiri', 'lateef', 'scheherazade', 'inter', 'roboto', false] }],
    [{ header: [1, 2, 3, false] }],
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
  'header',
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
