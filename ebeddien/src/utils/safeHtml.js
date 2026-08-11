import DOMPurify from 'dompurify'

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup',
    'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'a', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  ALLOWED_ATTR: ['href', 'title', 'class', 'colspan', 'rowspan', 'target', 'rel'],
  ALLOW_DATA_ATTR: false,
}

export function sanitizeHtml(input) {
  const html = typeof input === 'string' ? input : ''
  if (!html) return ''
  if (typeof window === 'undefined') return html

  return DOMPurify.sanitize(html, PURIFY_CONFIG)
}
