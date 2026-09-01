import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { calculateWajibFromBiodata, mergeBiodataForUwabaPricing } from './uwabaCalculator'

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function waitForImages(root) {
  const imgs = root.querySelectorAll('img')
  return Promise.all(
    Array.from(imgs).map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve()
            return
          }
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        })
    )
  )
}

async function imageElementToDataUrl(img) {
  const src = img?.currentSrc || img?.src
  if (!src) return null
  if (src.startsWith('data:')) return src

  if (img.complete && img.naturalWidth > 0) {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d').drawImage(img, 0, 0)
      return canvas.toDataURL('image/png')
    } catch {
      /* canvas tainted */
    }
  }

  try {
    const res = await fetch(src, { cache: 'force-cache' })
    if (!res.ok) return null
    return await blobToDataUrl(await res.blob())
  } catch {
    return null
  }
}

async function inlineImages(root) {
  const imgs = [...(root?.querySelectorAll('img') || [])]
  await Promise.all(
    imgs.map(async (img) => {
      const dataUrl = await imageElementToDataUrl(img)
      if (!dataUrl) return
      img.src = dataUrl
      img.removeAttribute('crossorigin')
    })
  )
}

function formatRupiahCaption(num) {
  return `Rp ${Number(num || 0).toLocaleString('id-ID')}`
}

const UWABA_BULAN_ORDER = [11, 12, 1, 2, 3, 4, 5, 6, 7, 8]

function sumUwabaWajib(data, prices) {
  const biodata = data?.biodata || {}
  const byId = {}
  ;(data?.tunggakan || []).forEach((t) => {
    byId[t.id_bulan] = t
  })
  let total = 0
  UWABA_BULAN_ORDER.forEach((idBulan) => {
    const t = byId[idBulan] || { total: 0, wajib: 0, is_disabled: 0 }
    if (Number(t.is_disabled) === 1) return
    let wajib = 0
    if (t.wajib && t.wajib > 0) wajib = Number(t.wajib)
    else if (t.total && t.total > 0) wajib = Number(t.total)
    else if (prices) {
      try {
        const jsonData = typeof t.json === 'string' ? JSON.parse(t.json) : t.json
        const merged = jsonData ? mergeBiodataForUwabaPricing(jsonData, biodata) : biodata
        wajib = Number(calculateWajibFromBiodata(merged && (merged.status_santri || merged.kategori) ? merged : biodata, prices) || 0)
      } catch {
        wajib = Number(calculateWajibFromBiodata(biodata, prices) || 0)
      }
    }
    total += wajib
  })
  return total
}

/**
 * Ringkasan caption gambar WA: NIS, nama, wajib, bayar, ket.
 */
export function buildKwitansiImageCaption(data, { mode = 'uwaba', prices = null } = {}) {
  const biodata = data?.biodata || {}
  const nis = biodata.nis ?? biodata.id ?? '-'
  const nama = biodata.nama || '-'
  const isUwaba = mode === 'uwaba'
  const wajib = isUwaba
    ? sumUwabaWajib(data, prices)
    : (data?.tunggakan || []).reduce((sum, t) => sum + Number(t.wajib ?? t.total ?? 0), 0)
  const bayar = (data?.pembayaran || []).reduce((sum, p) => sum + Number(p.nominal || 0), 0)
  const kurang = Math.max(wajib - bayar, 0)
  let ket = 'Belum'
  if (wajib > 0 && bayar >= wajib) ket = 'Lunas'
  else if (bayar > 0) ket = `Kurang ${formatRupiahCaption(kurang)}`
  const judul = isUwaba ? 'Kwitansi UWABA' : mode === 'khusus' ? 'Kwitansi Khusus' : 'Kwitansi Tunggakan'
  return [
    judul,
    `NIS: ${nis}`,
    `Nama: ${nama}`,
    `Wajib: ${formatRupiahCaption(wajib)}`,
    `Bayar: ${formatRupiahCaption(bayar)}`,
    `Ket: ${ket}`,
  ].join('\n')
}

export function buildKwitansiPdfFilename(prefix, biodata, santriId) {
  const id = String(biodata?.nis || biodata?.id || santriId || 'kwitansi').trim()
  const nama = String(biodata?.nama || '')
    .replace(/[^\w\s-]/gi, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
  const safePrefix = String(prefix || 'Kwitansi').replace(/[^\w-]/g, '')
  return `${safePrefix}-${nama || id}-${id}.pdf`
}

function findPrintContainer(rootEl) {
  if (!rootEl) {
    return document.querySelector('.print-offcanvas-wrapper .print-container')
  }
  if (rootEl.classList?.contains('print-container')) return rootEl
  return rootEl.querySelector?.('.print-container') || rootEl
}

function cellText(cell) {
  return String(cell?.innerText || cell?.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function parseHtmlTable(table) {
  const parseSection = (section) => {
    if (!section) return []
    return [...section.rows].map((tr) =>
      [...tr.cells].map((cell) => {
        const item = { content: cellText(cell) || ' ' }
        if (cell.colSpan > 1) item.colSpan = cell.colSpan
        if (cell.rowSpan > 1) item.rowSpan = cell.rowSpan
        const styles = {}
        const align = String(cell.style?.textAlign || '').toLowerCase()
        if (align === 'center' || cell.classList.contains('wajib-col') || cell.classList.contains('bayar-col')) {
          styles.halign = 'center'
        }
        if (tr.classList.contains('total-row')) styles.fontStyle = 'bold'
        if (Object.keys(styles).length) item.styles = styles
        return item
      })
    )
  }

  const head = table.tHead && table.tHead.rows.length ? parseSection(table.tHead) : []
  let body = []
  if (table.tBodies && table.tBodies.length) {
    ;[...table.tBodies].forEach((tb) => {
      body = body.concat(parseSection(tb))
    })
  } else if (!head.length) {
    body = parseSection(table)
  }
  return { head: head.length ? head : undefined, body }
}

function tableSectionTitle(table) {
  let prev = table.previousElementSibling
  while (prev && !(prev.classList && prev.classList.contains('section-title'))) {
    if (prev.classList && prev.classList.contains('receipt-instance')) break
    prev = prev.previousElementSibling
  }
  if (prev?.classList?.contains('section-title')) return prev.textContent.trim()
  return ''
}

function imageFormat(dataUrl) {
  return /image\/jpe?g/i.test(String(dataUrl)) ? 'JPEG' : 'PNG'
}

async function addPdfImage(pdf, img, x, y, maxW, maxH) {
  const dataUrl = await imageElementToDataUrl(img)
  if (!dataUrl) return { w: 0, h: 0 }
  const nw = img.naturalWidth || maxW
  const nh = img.naturalHeight || maxH
  let w = maxW
  let h = nw > 0 ? (nh / nw) * w : maxH
  if (h > maxH) {
    h = maxH
    w = nh > 0 ? (nw / nh) * h : maxW
  }
  try {
    pdf.addImage(dataUrl, imageFormat(dataUrl), x, y, w, h)
  } catch {
    return { w: 0, h: 0 }
  }
  return { w, h }
}

function drawTable(pdf, table, { startY, margin, tableWidth, fontSize }) {
  const parsed = parseHtmlTable(table)
  if (!parsed.body?.length && !parsed.head) return startY
  try {
    autoTable(pdf, {
      startY,
      margin,
      tableWidth: tableWidth || 'auto',
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize,
        cellPadding: 1.1,
        overflow: 'linebreak',
        valign: 'middle',
        textColor: 30,
        lineColor: 170,
        lineWidth: 0.12,
      },
      headStyles: {
        fillColor: [226, 232, 240],
        textColor: 30,
        fontStyle: 'bold',
        fontSize,
        halign: 'center',
      },
      head: parsed.head,
      body: parsed.body,
    })
    return (pdf.lastAutoTable?.finalY || startY) + 2.5
  } catch {
    const fallback = cellText(table).slice(0, 2500)
    if (!fallback) return startY
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(fontSize)
    pdf.setTextColor(30)
    pdf.text(fallback, margin?.left || 8, startY + 4, { maxWidth: tableWidth || 180 })
    return startY + 16
  }
}

function drawSectionTitle(pdf, title, x, y, fontSize) {
  if (!title) return y
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(fontSize + 1)
  pdf.setTextColor(49, 151, 149)
  pdf.text(title, x, y + 3.2)
  pdf.setTextColor(30)
  pdf.setFont('helvetica', 'normal')
  return y + 6
}

async function drawHeader(pdf, headerEl, margin, y, pageW, fontSize) {
  if (!headerEl) return y
  const imgs = [...headerEl.querySelectorAll('img')]
  const title = headerEl.querySelector('h1')?.innerText?.trim() || ''
  const subtitle = headerEl.querySelector('.header-text p')?.innerText?.trim() || ''
  const idText = headerEl.querySelector('.header-id')?.innerText?.trim() || ''

  let x = margin
  const imgH = 14
  for (const img of imgs) {
    const placed = await addPdfImage(pdf, img, x, y, 18, imgH)
    if (placed.w) x += placed.w + 2.5
  }

  const midX = pageW / 2
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(Math.max(fontSize + 3, 11))
  pdf.setTextColor(49, 151, 149)
  if (title) pdf.text(title, midX, y + 6, { align: 'center' })
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(fontSize + 1)
  pdf.setTextColor(80)
  if (subtitle) pdf.text(subtitle, midX, y + 11, { align: 'center' })

  if (idText) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(fontSize + 2)
    pdf.setTextColor(49, 151, 149)
    pdf.text(idText.split('\n').map((s) => s.trim()).filter(Boolean), pageW - margin, y + 6, {
      align: 'right',
    })
  }

  const lineY = y + imgH + 2
  pdf.setDrawColor(51)
  pdf.setLineWidth(0.35)
  pdf.line(margin, lineY, pageW - margin, lineY)
  pdf.setTextColor(30)
  pdf.setFont('helvetica', 'normal')
  return lineY + 4
}

async function drawQrAndAdmin(pdf, instance, x, y, maxW) {
  const qrImg = instance.querySelector('.qr-code-image')
  const admin = instance.querySelector('.admin-info')
  const qrBox = instance.classList?.contains('qr-code-container')
    ? instance
    : instance.querySelector('.qr-code-container')
  const nisNearQr = String(qrBox?.innerText || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n')
  const qrSize = 22
  let nextY = y
  if (qrImg) {
    await addPdfImage(pdf, qrImg, x, y, qrSize, qrSize)
    nextY = y + qrSize
  }
  const textX = qrImg ? x + qrSize + 3 : x
  const lines = []
  if (admin) {
    lines.push(...admin.innerText.split('\n').map((s) => s.trim()).filter(Boolean))
  } else if (nisNearQr) {
    lines.push(...nisNearQr.split('\n'))
  }
  if (admin && lines.length) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(40)
    pdf.text(lines, textX, y + 5, { maxWidth: Math.max(maxW - (qrImg ? qrSize + 4 : 0), 20) })
    nextY = Math.max(nextY, y + 4 + lines.length * 4)
  } else if (!admin && nisNearQr) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(49, 151, 149)
    pdf.text(nisNearQr.split('\n'), x + qrSize / 2, nextY + 4, { align: 'center' })
    nextY += 8
  }
  return nextY + 2
}

async function renderReceipt(pdf, instance, { startY, compact }) {
  const pageW = pdf.internal.pageSize.getWidth()
  const margin = compact ? 6 : 8
  const fontSize = compact ? 6.5 : 8
  const usableW = pageW - margin * 2
  let y = startY

  y = await drawHeader(pdf, instance.querySelector('.header'), margin, y, pageW, fontSize)

  const twoCol = instance.querySelector('.two-column-layout')
  if (twoCol) {
    const gap = 4
    const colW = (usableW - gap) / 2
    const left = twoCol.querySelector('.left-column') || twoCol
    const right = twoCol.querySelector('.right-column')
    const leftTables = [...(left?.querySelectorAll('table') || [])]
    const rightTables = [...(right?.querySelectorAll('table') || [])]
    const yTop = y

    let yL = yTop
    for (const table of leftTables) {
      yL = drawSectionTitle(pdf, tableSectionTitle(table), margin, yL, fontSize)
      yL = drawTable(pdf, table, {
        startY: yL,
        margin: { left: margin, right: pageW - margin - colW, top: 8, bottom: 8 },
        tableWidth: colW,
        fontSize,
      })
    }

    let yR = yTop
    const qrRow = right?.querySelector('.qr-admin-row') || right
    if (qrRow) {
      yR = await drawQrAndAdmin(pdf, qrRow, margin + colW + gap, yR, colW)
    }
    for (const table of rightTables) {
      yR = drawSectionTitle(pdf, tableSectionTitle(table), margin + colW + gap, yR, fontSize)
      yR = drawTable(pdf, table, {
        startY: yR,
        margin: { left: margin + colW + gap, right: margin, top: 8, bottom: 8 },
        tableWidth: colW,
        fontSize,
      })
    }

    pdf.setDrawColor(200)
    pdf.setLineWidth(0.2)
    const divX = margin + colW + gap / 2
    pdf.line(divX, yTop, divX, Math.max(yL, yR))
    return Math.max(yL, yR)
  }

  const biodata = instance.querySelector('.biodata-table')
  const allTables = [...instance.querySelectorAll('table')]
  const otherTables = allTables.filter((t) => t !== biodata)
  const qrBox = instance.querySelector('.qr-code-container')
  const qrWidth = qrBox ? 28 : 0
  const biodataW = qrBox ? usableW - qrWidth - 4 : usableW

  if (biodata) {
    const yBiodata = y
    y = drawTable(pdf, biodata, {
      startY: y,
      margin: { left: margin, right: pageW - margin - biodataW, top: 8, bottom: 8 },
      tableWidth: biodataW,
      fontSize,
    })
    if (qrBox) {
      const qrY = await drawQrAndAdmin(pdf, qrBox, margin + biodataW + 4, yBiodata, qrWidth)
      y = Math.max(y, qrY)
    }
  }

  for (const table of otherTables) {
    y = drawSectionTitle(pdf, tableSectionTitle(table), margin, y, fontSize)
    y = drawTable(pdf, table, {
      startY: y,
      margin: { left: margin, right: margin, top: 8, bottom: 8 },
      tableWidth: usableW,
      fontSize,
    })
  }

  const ttd = instance.querySelector('.ttd-footer')
  if (ttd) {
    const lines = ttd.innerText.split('\n').map((s) => s.trim()).filter(Boolean)
    if (lines.length) {
      y += 6
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(fontSize)
      pdf.setTextColor(80)
      pdf.text(lines, pageW - margin, y, { align: 'right' })
      y += lines.length * 4.2
    }
  }

  return y
}

/**
 * Susun PDF kwitansi sebagai dokumen teks (bukan tangkapan gambar),
 * selaras isi pratinjau print.
 * @returns {Promise<{ pdf: import('jspdf').jsPDF, filename: string, base64: string }>}
 */
export async function captureKwitansiPdf(rootEl, filename = 'Kwitansi.pdf', options = {}) {
  const firstColumnOnly = options.firstColumnOnly === true
  const container = findPrintContainer(rootEl)
  if (!container) throw new Error('Pratinjau kwitansi belum siap')

  await waitForImages(container)

  const instances = [...container.querySelectorAll('.receipt-instance')]
  const receipts = firstColumnOnly
    ? instances.slice(0, 1)
    : instances.length
      ? instances
      : [container]
  if (!receipts.length) throw new Error('Konten kwitansi belum siap')

  const isLandscape = !!container.closest('.page-landscape')
  const pdf = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: isLandscape ? 'landscape' : 'portrait',
    compress: true,
  })

  const compact = !firstColumnOnly && receipts.length > 1
  const pageH = pdf.internal.pageSize.getHeight()
  const pageW = pdf.internal.pageSize.getWidth()
  let y = 8

  for (let i = 0; i < receipts.length; i++) {
    if (i > 0) {
      if (compact && y < pageH - 88) {
        pdf.setDrawColor(180)
        pdf.setLineWidth(0.25)
        pdf.line(8, y + 1, pageW - 8, y + 1)
        y += 6
      } else {
        pdf.addPage()
        y = 8
      }
    }
    y = await renderReceipt(pdf, receipts[i], { startY: y, compact })
  }

  const dataUri = pdf.output('datauristring')
  const base64 = String(dataUri).split(',')[1] || ''
  if (!base64) throw new Error('Gagal menyusun PDF')

  return { pdf, filename, base64 }
}

/** Lebar A4 pada 96dpi — layout lebar seperti print, bukan preview HP. */
const A4_CSS_PX = 794

/**
 * Tangkap kolom 1 kwitansi sebagai JPEG tajam.
 * Clone ke kanvas A4 lebar (bukan screenshot offcanvas/HP).
 */
export async function captureKwitansiJpeg(rootEl, { quality = 0.92, scale = 2 } = {}) {
  const container = findPrintContainer(rootEl)
  if (!container) throw new Error('Pratinjau kwitansi belum siap')
  const source = container.querySelector('.receipt-instance') || container

  const style = document.createElement('style')
  style.id = 'kwitansi-jpeg-host-style'
  style.textContent = `
    #kwitansi-jpeg-host {
      position: fixed !important;
      left: -2400px !important;
      top: 0 !important;
      width: ${A4_CSS_PX}px !important;
      min-width: ${A4_CSS_PX}px !important;
      max-width: ${A4_CSS_PX}px !important;
      padding: 28px 32px !important;
      margin: 0 !important;
      background: #ffffff !important;
      color: #22223b !important;
      box-sizing: border-box !important;
      overflow: visible !important;
      font-family: Inter, Arial, sans-serif !important;
      font-size: 13px !important;
      line-height: 1.35 !important;
      transform: none !important;
      zoom: 1 !important;
    }
    #kwitansi-jpeg-host .no-print,
    #kwitansi-jpeg-host .top-right-controls { display: none !important; }
    #kwitansi-jpeg-host .header {
      display: flex !important;
      flex-direction: row !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 16px !important;
      width: 100% !important;
    }
    #kwitansi-jpeg-host .two-column-layout {
      display: flex !important;
      flex-direction: row !important;
      align-items: flex-start !important;
      gap: 18px !important;
      width: 100% !important;
    }
    #kwitansi-jpeg-host .left-column,
    #kwitansi-jpeg-host .right-column {
      flex: 1 1 0 !important;
      width: auto !important;
      min-width: 0 !important;
      max-width: none !important;
    }
    #kwitansi-jpeg-host .vertical-divider {
      display: block !important;
      width: 1px !important;
      align-self: stretch !important;
      background: #ddd !important;
    }
    #kwitansi-jpeg-host .qr-admin-row {
      display: flex !important;
      flex-direction: row !important;
      align-items: flex-start !important;
      gap: 16px !important;
    }
    #kwitansi-jpeg-host table {
      width: 100% !important;
      font-size: 12px !important;
    }
    #kwitansi-jpeg-host img.header-logo { max-width: 70px !important; height: auto !important; }
    #kwitansi-jpeg-host img.qr-code-image { width: 80px !important; height: 80px !important; }
  `

  const host = document.createElement('div')
  host.id = 'kwitansi-jpeg-host'
  const clone = source.cloneNode(true)
  clone.querySelectorAll('.no-print, .top-right-controls').forEach((el) => el.remove())
  host.appendChild(clone)
  document.body.appendChild(style)
  document.body.appendChild(host)

  try {
    if (document.fonts?.ready) await document.fonts.ready
    await waitForImages(host)
    await inlineImages(host)
    await waitForImages(host)
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    const canvas = await html2canvas(host, {
      scale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 20000,
      width: host.scrollWidth,
      height: host.scrollHeight,
      windowWidth: A4_CSS_PX,
      windowHeight: Math.max(host.scrollHeight, 400),
    })
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    const base64 = String(dataUrl).split(',')[1] || ''
    if (!base64) throw new Error('Gagal menyusun gambar kwitansi')
    return base64
  } finally {
    host.remove()
    style.remove()
  }
}
