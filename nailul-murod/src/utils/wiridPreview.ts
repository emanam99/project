/** Cuplikan isi wirid satu baris: baris baru / paragraf diganti pemisah * (HTML tetap, font Quill terjaga). */
export function isiToSingleLineStarHtml(html: string): string {
  const STAR = '<span class="list-wirid-star" aria-hidden="true">*</span>'
  const host = document.createElement('div')
  host.innerHTML = (html || '').trim() || '<p>-</p>'

  host.querySelectorAll('br').forEach((br) => {
    const span = document.createElement('span')
    span.className = 'list-wirid-star'
    span.setAttribute('aria-hidden', 'true')
    span.textContent = '*'
    br.replaceWith(document.createTextNode(' '), span, document.createTextNode(' '))
  })

  const parts: string[] = []

  for (const el of Array.from(host.children)) {
    if (!(el instanceof HTMLElement)) continue
    const tag = el.tagName
    if (tag === 'P' || /^H[1-6]$/.test(tag)) {
      const inner = el.innerHTML.trim()
      if (inner) parts.push(inner)
    } else if (tag === 'UL' || tag === 'OL') {
      el.querySelectorAll(':scope > li').forEach((li) => {
        const inner = (li as HTMLElement).innerHTML.trim()
        if (inner) parts.push(inner)
      })
    } else if (tag === 'DIV') {
      const innerPs = el.querySelectorAll(':scope > p')
      if (innerPs.length > 0) {
        innerPs.forEach((p) => {
          const inner = (p as HTMLElement).innerHTML.trim()
          if (inner) parts.push(inner)
        })
      } else {
        const inner = el.innerHTML.trim()
        if (inner) parts.push(inner)
      }
    }
  }

  const merged =
    parts.length > 0 ? parts.join(` ${STAR} `) : (host.innerHTML.trim() || '-')

  return `<div class="list-wirid-preview rich ql-editor nm-preview-isi"><p>${merged}</p></div>`
}
