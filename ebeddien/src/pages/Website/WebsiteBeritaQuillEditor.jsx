import { useRef, useLayoutEffect, useEffect, useCallback } from 'react'
import {
  Quill,
  WEBSITE_BERITA_QUILL_TOOLBAR,
  WEBSITE_BERITA_QUILL_FORMATS
} from './websiteBeritaQuill'

const USER_SOURCE = 'user'
const EMPTY = '<p><br></p>'

function htmlFromRoot(quill) {
  const h = quill?.root?.innerHTML ?? ''
  if (!h || h === EMPTY || h === '<p></p>') return ''
  return h
}

/**
 * Editor Quill untuk konten berita (HTML ke backend). Gambar: unggah via `uploadImage`.
 * @param {{ value: string, onChange: (html: string) => void, placeholder?: string, uploadImage?: (file: File) => Promise<string|null|undefined> }} props
 */
export default function WebsiteBeritaQuillEditor({ value, onChange, placeholder, uploadImage }) {
  const hostRef = useRef(null)
  const quillRef = useRef(null)
  const onChangeRef = useRef(onChange)
  const uploadImageRef = useRef(uploadImage)
  const pickerScrollTopRef = useRef(null)
  onChangeRef.current = onChange
  uploadImageRef.current = uploadImage

  const setHtmlIfDifferent = useCallback((quill, nextValue) => {
    const v = String(nextValue ?? '')
    const cur = htmlFromRoot(quill)
    if (v === cur) return
    const html = v || EMPTY
    try {
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
          container: WEBSITE_BERITA_QUILL_TOOLBAR,
          handlers: {
            image() {
              const q = this.quill
              const input = document.createElement('input')
              input.setAttribute('type', 'file')
              input.setAttribute('accept', 'image/jpeg,image/png,image/webp,image/gif')
              input.click()
              input.onchange = async () => {
                const file = input.files?.[0]
                if (!file) return
                const upload = uploadImageRef.current
                if (!upload) {
                  window.alert('Unggah gambar tidak dikonfigurasi.')
                  return
                }
                try {
                  const url = await upload(file)
                  if (!url) return
                  const range = q.getSelection(true)
                  const idx = range ? range.index : q.getLength()
                  q.insertEmbed(idx, 'image', url, USER_SOURCE)
                  q.setSelection(idx + 1, USER_SOURCE)
                } catch (err) {
                  window.alert(err?.message || err?.response?.data?.message || 'Gagal mengunggah gambar')
                }
              }
            }
          }
        }
      },
      formats: WEBSITE_BERITA_QUILL_FORMATS,
      placeholder: placeholder || ''
    })
    quillRef.current = quill
    setHtmlIfDifferent(quill, value)

    const onTextChange = () => {
      onChangeRef.current(htmlFromRoot(quill))
    }
    quill.on('text-change', onTextChange)

    return () => {
      quill.off('text-change', onTextChange)
      quillRef.current = null
      const toolbarEl = el.previousElementSibling
      if (toolbarEl && toolbarEl.classList?.contains('ql-toolbar')) {
        toolbarEl.remove()
      }
      el.classList.remove('ql-container', 'ql-snow', 'ql-disabled')
      el.removeAttribute('style')
      el.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeholder, setHtmlIfDifferent])

  useEffect(() => {
    const quill = quillRef.current
    if (!quill) return
    setHtmlIfDifferent(quill, value)
  }, [value, setHtmlIfDifferent])

  useEffect(() => {
    const quill = quillRef.current
    if (!quill) return
    const root = quill.root
    const toolbar = root?.parentElement?.previousElementSibling
    if (!toolbar || !toolbar.classList?.contains('ql-toolbar')) return

    const closeExpandedPickers = () => {
      toolbar.querySelectorAll('.ql-picker.ql-expanded').forEach((picker) => {
        picker.classList.remove('ql-expanded')
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
      pickerScrollTopRef.current =
        scrollHost && typeof scrollHost.scrollTop === 'number' ? scrollHost.scrollTop : null
      const picker = target.closest('.ql-picker')
      if (!picker) return
      toolbar.querySelectorAll('.ql-picker.ql-expanded').forEach((p) => {
        if (p !== picker) p.classList.remove('ql-expanded')
      })
    }

    const onToolbarClick = (e) => {
      const target = e.target
      if (!(target instanceof Element)) return
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

  return <div className="wb-quill-surface" ref={hostRef} />
}
