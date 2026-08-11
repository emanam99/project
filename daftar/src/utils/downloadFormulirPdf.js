import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

const A4_W_MM = 210
const A4_H_MM = 297
/** Margin kiri/kanan/atas/bawah selaras CSS 1,5cm — hanya di layout PDF. */
const MARGIN_MM = 15
const CONTENT_W_MM = A4_W_MM - MARGIN_MM * 2
const CONTENT_H_MAX_MM = A4_H_MM - MARGIN_MM * 2
const CONTENT_W_PX = Math.round((CONTENT_W_MM / 25.4) * 96)

const PDF_LAYOUT_STYLE_ID = 'formulir-pdf-layout-style'

function ensurePdfLayoutStyles() {
  if (document.getElementById(PDF_LAYOUT_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = PDF_LAYOUT_STYLE_ID
  style.textContent = `
    [data-formulir-pdf-host] .print-biodata-formulir-outer,
    [data-formulir-pdf-host] .print-biodata-formulir {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
    }
  `
  document.head.appendChild(style)
}

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
      /* canvas tainted — lanjut fetch */
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

/** Salin logo dari pratinjau (sudah termuat) ke clone agar html2canvas tidak gagal CORS. */
async function inlineImagesFromSource(sourceRoot, targetRoot) {
  const sourceImgs = [...(sourceRoot?.querySelectorAll('img') || [])]
  const targetImgs = [...targetRoot.querySelectorAll('img')]
  await Promise.all(
    targetImgs.map(async (targetImg, index) => {
      const dataUrl = await imageElementToDataUrl(sourceImgs[index] || targetImg)
      if (!dataUrl) return
      targetImg.src = dataUrl
      targetImg.removeAttribute('crossorigin')
      if (!targetImg.complete || targetImg.naturalWidth === 0) {
        await new Promise((resolve) => {
          targetImg.onload = () => resolve()
          targetImg.onerror = () => resolve()
        })
      }
    })
  )
}

function buildOffscreenHost() {
  ensurePdfLayoutStyles()
  const host = document.createElement('div')
  host.setAttribute('data-formulir-pdf-host', '1')
  host.style.cssText = [
    'position:fixed',
    'left:-12000px',
    'top:0',
    `width:${CONTENT_W_PX}px`,
    'background:#ffffff',
    'box-sizing:border-box',
    'z-index:-1',
  ].join(';')
  document.body.appendChild(host)
  return host
}

function buildFormulirContentWrapper() {
  const inner = document.createElement('div')
  inner.className = 'print-biodata-formulir'
  return inner
}

function mountFormulirPage(host, contentRoot) {
  const outer = document.createElement('div')
  outer.className = 'print-biodata-formulir-outer'
  outer.appendChild(contentRoot)
  host.appendChild(outer)
  return outer
}

/** Struktur identik halaman 1 & 2: salin anak dari sumber ke wrapper bersih. */
function buildPageContentFromSource(sourceRoot, removeSelectors = []) {
  const wrapper = buildFormulirContentWrapper()
  const source = sourceRoot.cloneNode(true)
  removeSelectors.forEach((sel) => source.querySelector(sel)?.remove())
  while (source.firstChild) {
    wrapper.appendChild(source.firstChild)
  }
  return wrapper
}

async function captureContentToPdfPage(pdf, host, isFirstPage) {
  const contentEl = host.querySelector('.print-biodata-formulir')
  if (!contentEl) return

  await waitForImages(contentEl)

  const canvas = await html2canvas(contentEl, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#ffffff',
    logging: false,
    width: CONTENT_W_PX,
    height: contentEl.scrollHeight,
    windowWidth: CONTENT_W_PX,
    imageTimeout: 20000,
  })

  const imgData = canvas.toDataURL('image/jpeg', 0.95)
  let imgWidthMm = CONTENT_W_MM
  let imgHeightMm = (canvas.height * imgWidthMm) / canvas.width

  if (!isFirstPage) pdf.addPage()

  let drawX = MARGIN_MM
  let drawY = MARGIN_MM
  if (imgHeightMm > CONTENT_H_MAX_MM) {
    const scale = CONTENT_H_MAX_MM / imgHeightMm
    imgWidthMm *= scale
    imgHeightMm = CONTENT_H_MAX_MM
    drawX = MARGIN_MM + (CONTENT_W_MM - imgWidthMm) / 2
  }

  pdf.addImage(imgData, 'JPEG', drawX, drawY, imgWidthMm, imgHeightMm)
}

export function buildFormulirPdfFilename(biodata) {
  const id = String(biodata?.nis || biodata?.id || 'formulir').trim()
  const nama = String(biodata?.nama || '')
    .replace(/[^\w\s-]/gi, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
  return `Formulir-Pendaftaran-${nama || id}.pdf`
}

/**
 * Unduh formulir biodata sebagai PDF dua halaman (selaras page-break cetak).
 * @param {HTMLElement} outerEl - Elemen .print-biodata-formulir-outer
 * @param {string} [filename]
 */
export async function downloadFormulirPdf(outerEl, filename = 'Formulir-Pendaftaran.pdf') {
  const root = outerEl?.querySelector?.('.print-biodata-formulir')
  if (!root) throw new Error('Formulir tidak ditemukan')

  await waitForImages(root)

  const pageBreakEl = root.querySelector('.formulir-page-break')
  const footerEl = root.querySelector('.formulir-footer-print')
  const hosts = []

  try {
    const page1Host = buildOffscreenHost()
    hosts.push(page1Host)

    const page1Content = buildPageContentFromSource(root, ['.formulir-page-break', '.formulir-footer-print'])
    await inlineImagesFromSource(root, page1Content)
    mountFormulirPage(page1Host, page1Content)

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    await captureContentToPdfPage(pdf, page1Host, true)

    if (pageBreakEl) {
      const page2Host = buildOffscreenHost()
      hosts.push(page2Host)

      const page2Content = buildFormulirContentWrapper()
      const page2Table = pageBreakEl.cloneNode(true)
      page2Table.classList.remove('formulir-page-break')
      page2Content.appendChild(page2Table)
      if (footerEl) page2Content.appendChild(footerEl.cloneNode(true))
      mountFormulirPage(page2Host, page2Content)
      await captureContentToPdfPage(pdf, page2Host, false)
    } else if (footerEl) {
      const page2Host = buildOffscreenHost()
      hosts.push(page2Host)
      const page2Content = buildFormulirContentWrapper()
      page2Content.appendChild(footerEl.cloneNode(true))
      mountFormulirPage(page2Host, page2Content)
      await captureContentToPdfPage(pdf, page2Host, false)
    }

    pdf.save(filename)
  } finally {
    hosts.forEach((h) => h.remove())
  }
}
