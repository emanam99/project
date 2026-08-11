/**
 * Konfigurasi Quill untuk editor berita Website (WYSIWYG, bukan HTML mentah).
 * Impor file ini sebelum instans Quill pertama di WebsiteBeritaQuillEditor.
 */
import Quill from 'quill'
import 'quill/dist/quill.snow.css'

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
  '#00695c',
  '#37474f',
  '#6a1b9a',
  '#c62828',
  '#ef6c00',
  '#546e7a',
  '#888888'
]

/** Toolbar mirip editor situs modern: judul, teks, warna, list, rata, kutipan, kode, tautan, gambar */
export const WEBSITE_BERITA_QUILL_TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ color: COLOR_SWATCHES }, { background: COLOR_SWATCHES }],
  [{ script: 'sub' }, { script: 'super' }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  [{ indent: '-1' }, { indent: '+1' }],
  [{ align: '' }, { align: 'center' }, { align: 'right' }, { align: 'justify' }],
  ['blockquote', 'code-block'],
  ['link', 'image'],
  ['clean']
]

export const WEBSITE_BERITA_QUILL_FORMATS = [
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
  'blockquote',
  'code-block',
  'link',
  'image'
]

export { Quill }
