import { useLayoutEffect, useRef, type RefObject } from 'react'

const ROW_CLASS = 'nm-syiir-row'
export const SYIIR_COL_LEFT_CLASS = 'nm-syiir-col--left'
export const SYIIR_COL_RIGHT_CLASS = 'nm-syiir-col--right'
/** Selaras dengan column-gap .nm-syiir-row (~1.5rem pada root 16px) */
const GAP_PX = 24
/** Maks rasio tinggi/line-height agar dianggap masih "satu baris" per kolom */
const MAX_LINE_RATIO = 1.38

function isRtlBlock(el: HTMLElement): boolean {
  return el.classList.contains('ql-direction-rtl')
}

/** Anak langsung blok isi Quill (paragraf/judul) */
function getDirectBlocks(root: HTMLElement): HTMLElement[] {
  return Array.from(root.children).filter(
    (n): n is HTMLElement =>
      n instanceof HTMLElement && /^(P|H1|H2|H3)$/i.test(n.tagName) && !n.classList.contains(ROW_CLASS),
  )
}

function unwrapRows(root: HTMLElement) {
  const rows = Array.from(root.querySelectorAll(`:scope > .${ROW_CLASS}`))
  for (const row of rows) {
    const parent = row.parentElement
    if (!parent) continue
    const kids = Array.from(row.children).filter((n): n is HTMLElement => n instanceof HTMLElement)
    const rtlEl = kids.find((c) => isRtlBlock(c))
    const ltrEl = kids.find((c) => !isRtlBlock(c))
    if (rtlEl && ltrEl) {
      rtlEl.classList.remove(SYIIR_COL_RIGHT_CLASS)
      ltrEl.classList.remove(SYIIR_COL_LEFT_CLASS)
      parent.insertBefore(rtlEl, row)
      parent.insertBefore(ltrEl, row)
    } else {
      while (row.firstChild) {
        parent.insertBefore(row.firstChild, row)
      }
    }
    row.remove()
  }
}

/**
 * Cari segmen qosidah/syi'ir: pola kanan–kiri–kanan–kiri (RTL, LTR, RTL, …).
 * Boleh mulai di paragraf ke berapa pun; syarat: run dimulai dengan RTL dan
 * minimal 3 blok berturut-turut mengikuti pola. Deteksi dari kelas Quill
 * `ql-direction-rtl` pada anak langsung kontainer.
 */
function findSyiirRuns(blocks: HTMLElement[]): { start: number; end: number }[] {
  const runs: { start: number; end: number }[] = []
  let i = 0
  while (i < blocks.length) {
    if (!isRtlBlock(blocks[i])) {
      i++
      continue
    }
    let j = i + 1
    while (j < blocks.length && isRtlBlock(blocks[j]) === ((j - i) % 2 === 0)) {
      j++
    }
    if (j - i >= 3) {
      runs.push({ start: i, end: j })
    }
    i = j
  }
  return runs
}

/** True jika isi punya segmen pola syi'ir (≥3 blok RTL/LTR bergantian, dimulai RTL) */
export function hasSyiirPattern(root: HTMLElement | null): boolean {
  if (!root) return false
  return findSyiirRuns(getDirectBlocks(root)).length > 0
}

function approxLineCount(el: HTMLElement, container: HTMLElement, maxWidthPx: number): number {
  const wrap = document.createElement('div')
  wrap.setAttribute('aria-hidden', 'true')
  wrap.style.cssText = [
    'position:absolute',
    'left:0',
    'top:0',
    'width:' + maxWidthPx + 'px',
    'visibility:hidden',
    'pointer-events:none',
    'box-sizing:border-box',
    'overflow:hidden',
  ].join(';')
  const clone = el.cloneNode(true) as HTMLElement
  clone.style.margin = '0'
  wrap.appendChild(clone)
  container.appendChild(wrap)
  const cs = getComputedStyle(el)
  const lhRaw = cs.lineHeight
  const fontSize = parseFloat(cs.fontSize) || 16
  const lh =
    lhRaw === 'normal' ? fontSize * 1.35 : parseFloat(lhRaw) || fontSize * 1.35
  const h = wrap.scrollHeight
  container.removeChild(wrap)
  return lh > 0 ? h / lh : 99
}

function pairFitsOneRow(
  rtlEl: HTMLElement,
  ltrEl: HTMLElement,
  container: HTMLElement,
  colWidth: number,
): boolean {
  if (colWidth < 48) return false
  const rRtl = approxLineCount(rtlEl, container, colWidth)
  const rLtr = approxLineCount(ltrEl, container, colWidth)
  return rRtl <= MAX_LINE_RATIO && rLtr <= MAX_LINE_RATIO
}

function applyPairedLayout(root: HTMLElement) {
  unwrapRows(root)
  const blocks = getDirectBlocks(root)
  const runs = findSyiirRuns(blocks)
  if (runs.length === 0) return

  const W = root.clientWidth
  if (W < 120) return
  const colW = (W - GAP_PX) / 2

  for (const { start, end } of runs) {
    for (let k = start; k + 1 < end; k += 2) {
      const a = blocks[k]
      const b = blocks[k + 1]
      if (!a || !b || !a.parentElement || a.parentElement !== root) continue
      if (!isRtlBlock(a) || isRtlBlock(b)) continue
      if (!pairFitsOneRow(a, b, root, colW)) continue

      const row = document.createElement('div')
      row.className = ROW_CLASS
      root.insertBefore(row, a)
      /* Kolom kiri layar dulu, kolom kanan — keduanya isi Arab; gaya RTL di CSS */
      row.appendChild(b)
      row.appendChild(a)
      b.classList.add(SYIIR_COL_LEFT_CLASS)
      a.classList.add(SYIIR_COL_RIGHT_CLASS)
    }
  }
}

/**
 * Di halaman baca: segmen dengan pola syi'ir (RTL–LTR bergantian dari Quill, minimal 3 blok
 * berturut-turut, boleh tidak dari awal isi) — gabung pasangan bait ke satu baris grid bila muat.
 */
export function useSyiirPairedLayout(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  /** Berubah saat konten wirid ganti */
  contentKey: string,
) {
  const roRef = useRef<ResizeObserver | null>(null)
  const rafRef = useRef<number>(0)

  useLayoutEffect(() => {
    if (!enabled) return
    const root = containerRef.current
    if (!root) return

    const run = () => {
      applyPairedLayout(root)
    }

    const schedule = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        run()
      })
    }

    schedule()

    const ro = new ResizeObserver(() => schedule())
    ro.observe(root)
    roRef.current = ro

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      ro.disconnect()
      roRef.current = null
      unwrapRows(root)
    }
  }, [enabled, contentKey, containerRef])
}
