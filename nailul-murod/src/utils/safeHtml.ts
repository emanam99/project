const BLOCKED_TAGS = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'STYLE'])

export function sanitizeHtml(input: string | null | undefined): string {
  const html = typeof input === 'string' ? input : ''
  if (!html) return ''
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return html

  const doc = new DOMParser().parseFromString(html, 'text/html')

  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    if (BLOCKED_TAGS.has(el.tagName)) {
      el.remove()
      continue
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim().toLowerCase()
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name)
        continue
      }
      if ((name === 'href' || name === 'src') && value.startsWith('javascript:')) {
        el.removeAttribute(attr.name)
      }
    }
  }

  return doc.body.innerHTML
}
