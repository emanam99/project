import { getReviewCellDisplayText } from './bisyarohReviewColumnCatalog'

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function bisyarohSetLabel(section) {
  const nama = (section?.bisyaroh_nama || '').trim()
  if (nama) return nama
  const id = section?.bisyaroh_id
  return id != null ? `Set #${id}` : '—'
}

function buildPrintHtml({ sections, selectedColumnIds, catalog, meta, formatRp, getRekapCell }) {
  const colMap = new Map(catalog.map((c) => [c.id, c]))
  const cols = selectedColumnIds.map((id) => colMap.get(id)).filter(Boolean)

  const metaLines = [
    ['Lembaga', meta.lembagaNama || meta.lembagaId || '—'],
    ['Periode', meta.periodeLabel || meta.periodeBulan || '—'],
    ['Kalender', meta.periodeKalender === 'hijriyah' ? 'Hijriyah' : 'Masehi'],
    ['Dicetak', new Date().toLocaleString('id-ID')]
  ]
  if (meta.showGrandTotal) {
    metaLines.push(['Total keseluruhan', formatRp(meta.grandTotal)])
  }

  const sectionsHtml = sections
    .map((sec) => {
      const rows = sec.rows || []
      if (rows.length === 0) {
        return `<section class="sec"><h2>Set #${escapeHtml(sec.bisyaroh_id)} — ${escapeHtml(bisyarohSetLabel(sec))}</h2><p class="empty">Tidak ada baris.</p></section>`
      }

      const head = cols.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')
      const body = rows
        .map((row) => {
          const tds = cols
            .map((c) => {
              const text = getReviewCellDisplayText(row, sec, c.id, { formatRp, getRekapCell })
              return `<td>${escapeHtml(text)}</td>`
            })
            .join('')
          return `<tr>${tds}</tr>`
        })
        .join('')

      return `<section class="sec">
        <h2>Set #${escapeHtml(sec.bisyaroh_id)}${sec.bisyaroh_nama ? ` — ${escapeHtml(sec.bisyaroh_nama)}` : ''}</h2>
        <p class="sub">Subtotal: ${escapeHtml(formatRp(sec.subtotal_nominal))}</p>
        <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
      </section>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Bisyaroh Preview — Cetak</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; font-size: 11px; color: #111; margin: 16px; }
    h1 { font-size: 16px; margin: 0 0 8px; }
    .meta { margin-bottom: 16px; border-collapse: collapse; }
    .meta td { padding: 2px 12px 2px 0; vertical-align: top; }
    .meta td:first-child { font-weight: 600; white-space: nowrap; }
    .sec { margin-bottom: 24px; page-break-inside: avoid; }
    .sec h2 { font-size: 13px; margin: 0 0 4px; }
    .sub { margin: 0 0 8px; color: #444; font-size: 10px; }
    .empty { color: #666; font-style: italic; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; word-break: break-word; }
    th { background: #f3f4f6; font-weight: 600; }
    tr:nth-child(even) td { background: #fafafa; }
    @media print {
      body { margin: 8mm; }
      .sec { page-break-inside: auto; }
    }
  </style>
</head>
<body>
  <h1>Bisyaroh — Preview / Review</h1>
  <table class="meta">${metaLines.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join('')}</table>
  ${sectionsHtml}
</body>
</html>`
}

export function printBisyarohReview({
  sections = [],
  selectedColumnIds = [],
  catalog = [],
  meta = {},
  formatRp,
  getRekapCell
}) {
  if (!sections.length) {
    throw new Error('Tidak ada data untuk dicetak')
  }
  if (!selectedColumnIds.length) {
    throw new Error('Pilih minimal satu kolom untuk dicetak')
  }

  const html = buildPrintHtml({
    sections,
    selectedColumnIds,
    catalog,
    meta,
    formatRp,
    getRekapCell
  })

  const win = window.open('', '_blank', 'noopener,noreferrer,width=1024,height=768')
  if (!win) {
    throw new Error('Popup diblokir browser. Izinkan popup untuk cetak.')
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  const doPrint = () => {
    win.print()
    win.onafterprint = () => win.close()
  }
  if (win.document.readyState === 'complete') {
    setTimeout(doPrint, 150)
  } else {
    win.onload = () => setTimeout(doPrint, 150)
  }
}
