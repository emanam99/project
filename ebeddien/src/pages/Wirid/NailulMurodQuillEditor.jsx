import { useRef, useLayoutEffect, useEffect, useCallback } from 'react'
import Quill from 'quill'
// quill.snow.css sudah diimpor lewat ./nailulMurodQuill
import {
  NAILUL_MUROD_QUILL_MODULES,
  NAILUL_MUROD_QUILL_FORMATS,
  isArabicTypingContext,
  toArabicIndicDigits,
} from './nailulMurodQuill'

const USER_SOURCE = 'user'

const EMPTY = '<p><br></p>'

function htmlFromRoot(quill) {
  const h = quill?.root?.innerHTML ?? ''
  if (!h || h === EMPTY || h === '<p></p>') return ''
  return h
}

/**
 * Editor Quill tanpa react-quill (menghindari findDOMNode yang dilarang di React 18 Strict Mode).
 */
export default function NailulMurodQuillEditor({ value, onChange, placeholder }) {
  const hostRef = useRef(null)
  const quillRef = useRef(null)
  const onChangeRef = useRef(onChange)
  const pickerScrollTopRef = useRef(null)
  onChangeRef.current = onChange

  const setHtmlIfDifferent = useCallback((quill, nextValue) => {
    const v = String(nextValue ?? '')
    const cur = htmlFromRoot(quill)
    if (v === cur) return
    const html = v || EMPTY
    try {
      // Quill 1.3: convert() hanya menerima string HTML, bukan { html }
      const delta = quill.clipboard.convert(html)
      quill.setContents(delta, 'silent')
    } catch {
      quill.setText('', 'silent')
    }
  }, [])

  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return

    const quill = new Quill(el, {
      theme: 'snow',
      modules: {
        toolbar: {
          container: NAILUL_MUROD_QUILL_MODULES.toolbar,
          // Default Quill memaksa align=right saat pilih RTL jika getFormat() mengembalikan align
          // null (sering saat pilihan/blok campuran) — kita nonaktifkan, align & arah saling bebas.
          handlers: {
            direction(value) {
              this.quill.format('direction', value, USER_SOURCE)
            },
          },
        },
      },
      formats: NAILUL_MUROD_QUILL_FORMATS,
      placeholder: placeholder || '',
    })
    quillRef.current = quill
    // Isi awal dari `value` render mount; perubahan berikut lewat useEffect (bukan deps `value` di sini).
    setHtmlIfDifferent(quill, value)

    const onTextChange = () => {
      onChangeRef.current(htmlFromRoot(quill))
    }
    quill.on('text-change', onTextChange)

    // Saat mengetik Arab (font kitab / RTL), angka 0–9 diganti ٠–٩ seperti penomoran kitab.
    const insertArabicIndic = (raw) => {
      const range = quill.getSelection(true)
      if (!range) return
      const converted = toArabicIndicDigits(raw)
      if (range.length > 0) {
        quill.deleteText(range.index, range.length, USER_SOURCE)
      }
      quill.insertText(range.index, converted, USER_SOURCE)
      quill.setSelection(range.index + converted.length, 0, USER_SOURCE)
    }

    const onBeforeInput = (e) => {
      if (e.inputType !== 'insertText' || !e.data || !/[0-9]/.test(e.data)) return
      if (!isArabicTypingContext(quill)) return
      e.preventDefault()
      insertArabicIndic(e.data)
    }

    const onPaste = (e) => {
      if (!isArabicTypingContext(quill)) return
      const plain = e.clipboardData?.getData('text/plain')
      if (!plain || !/[0-9]/.test(plain)) return
      // Biarkan Quill menangani paste HTML kompleks; hanya plain text angka yang kita konversi.
      if (e.clipboardData?.types?.includes('text/html')) return
      e.preventDefault()
      insertArabicIndic(plain)
    }

    quill.root.addEventListener('beforeinput', onBeforeInput)
    quill.root.addEventListener('paste', onPaste)

    return () => {
      quill.off('text-change', onTextChange)
      quill.root.removeEventListener('beforeinput', onBeforeInput)
      quill.root.removeEventListener('paste', onPaste)
      quillRef.current = null
      if (!el) return
      // Quill meletakkan .ql-toolbar sebagai SEBELUM .ql-container (bukan di dalam). innerHTML
      // saja membuat toolbar sisa → Strict Mode / re-open form menumpuk 2+ toolbar (duplikat panel font).
      const toolbarEl = el.previousElementSibling
      if (toolbarEl && toolbarEl.classList?.contains('ql-toolbar')) {
        toolbarEl.remove()
      }
      el.classList.remove('ql-container', 'ql-snow', 'ql-disabled')
      el.removeAttribute('style')
      el.innerHTML = ''
    }
    // Jangan sertakan `value`: akan me-reinit Quill setiap ketikan
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeholder, setHtmlIfDifferent])

  // Sinkronisasi saat `value` berubah dari induk (tanpa re-mount).
  //
  // Penting: saat user sedang mengetik, `value` yang diterima sebenarnya berasal dari
  // `htmlFromRoot(quill)` sendiri (lewat onChange), jadi equality check di setHtmlIfDifferent
  // akan no-op. Namun jika parent mengirim string yang **secara struktural sama tapi diformat
  // sedikit beda** (mis. hasil sanitasi server / normalisasi DOMPurify saat init ulang),
  // setContents akan memicu reset cursor — di offcanvas lama efek ini terlihat seperti
  // layout "melompat di atas saat enter di bawah" karena ketika fokus berpindah/Quill
  // menyetel ulang isi, Quill scroll sendiri ke posisi cursor baru.
  //
  // Guard: abaikan push parent ketika editor sedang fokus (user mengetik). Sinkron tetap
  // jalan saat editor tidak fokus (mis. saat data API edit baru saja datang).
  useEffect(() => {
    const quill = quillRef.current
    if (!quill) return
    if (typeof quill.hasFocus === 'function' && quill.hasFocus()) return
    setHtmlIfDifferent(quill, value)
  }, [value, setHtmlIfDifferent])

  // Tutup dropdown toolbar (font/header) saat klik di luar editor/toolbar.
  useEffect(() => {
    const quill = quillRef.current
    if (!quill) return
    const root = quill.root
    const toolbar = root?.parentElement?.previousElementSibling
    if (!toolbar || !toolbar.classList?.contains('ql-toolbar')) return

    const closeExpandedPickers = () => {
      toolbar.querySelectorAll('.ql-picker.ql-expanded').forEach((el) => {
        el.classList.remove('ql-expanded')
      })
    }

    const onDocPointerDown = (e) => {
      const target = e.target
      if (!(target instanceof Node)) return
      if (root.contains(target) || toolbar.contains(target)) return
      closeExpandedPickers()
    }

    const onToolbarPointerDown = (e) => {
      const target = e.target
      if (!(target instanceof Element)) return
      const scrollHost = root.closest('.overflow-y-auto')
      // Simpan posisi scroll sebelum interaksi picker (font/header/warna).
      pickerScrollTopRef.current =
        scrollHost && typeof scrollHost.scrollTop === 'number' ? scrollHost.scrollTop : null
      const picker = target.closest('.ql-picker')
      if (!picker) return
      // Hanya satu picker boleh terbuka pada saat yang sama.
      toolbar.querySelectorAll('.ql-picker.ql-expanded').forEach((el) => {
        if (el !== picker) el.classList.remove('ql-expanded')
      })
    }

    const onToolbarClick = (e) => {
      const target = e.target
      if (!(target instanceof Element)) return
      // Setelah memilih item (warna/font/header), tutup panel picker.
      if (!target.closest('.ql-picker-item')) return
      requestAnimationFrame(() => {
        closeExpandedPickers()
        const scrollHost = root.closest('.overflow-y-auto')
        if (
          scrollHost &&
          typeof scrollHost.scrollTop === 'number' &&
          typeof pickerScrollTopRef.current === 'number'
        ) {
          scrollHost.scrollTop = pickerScrollTopRef.current
        }
        pickerScrollTopRef.current = null
      })
    }

    document.addEventListener('pointerdown', onDocPointerDown, true)
    toolbar.addEventListener('pointerdown', onToolbarPointerDown)
    toolbar.addEventListener('click', onToolbarClick)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown, true)
      toolbar.removeEventListener('pointerdown', onToolbarPointerDown)
      toolbar.removeEventListener('click', onToolbarClick)
    }
  }, [])

  return <div className="nm-quill-surface" ref={hostRef} />
}
