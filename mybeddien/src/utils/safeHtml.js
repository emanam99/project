import DOMPurify from 'dompurify'

const PURIFY_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'h2', 'h3'],
  ALLOWED_ATTR: [],
  ALLOW_DATA_ATTR: false,
}

export function sanitizeHtml(input) {
  const html = typeof input === 'string' ? input : ''
  if (!html) return ''
  if (typeof window === 'undefined') return html
  return DOMPurify.sanitize(html, PURIFY_CONFIG)
}
