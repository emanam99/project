import { sanitizeHtml } from '../utils/safeHtml'

function looksLikeHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ''))
}

/** Tampilkan deskripsi/aturan KOMMPAS (HTML aman) atau plain text lama. */
export default function RichTextView({ html, className = '' }) {
  const raw = typeof html === 'string' ? html : ''
  if (!raw.trim()) return null

  if (!looksLikeHtml(raw)) {
    return <div className={`whitespace-pre-wrap ${className}`.trim()}>{raw}</div>
  }

  return (
    <div
      className={`deskripsi-rich-text ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(raw) }}
    />
  )
}
