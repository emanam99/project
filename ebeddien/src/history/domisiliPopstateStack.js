/**
 * Satu listener capture `popstate` untuk alur Domisili (Daerah + offcanvas bertingkat).
 * Lapisan diproses dari prioritas tertinggi dulu agar X / history.back tidak menutup panel lain.
 *
 * @typedef {{ id: string, priority: number, handler: (ev: PopStateEvent) => boolean }} DomisiliPopLayer
 */

/** @type {DomisiliPopLayer[]} */
const layers = []

let installed = false

function compareLayers(a, b) {
  if (b.priority !== a.priority) return b.priority - a.priority
  return String(a.id).localeCompare(String(b.id), 'en')
}

function dispatch(ev) {
  const sorted = [...layers].sort(compareLayers)
  for (const { handler } of sorted) {
    try {
      if (handler(ev) === true) {
        if (typeof ev.stopImmediatePropagation === 'function') {
          ev.stopImmediatePropagation()
        }
        return
      }
    } catch (_) {
      /* biarkan lapisan lain mencoba */
    }
  }
}

function ensureListener() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('popstate', dispatch, true)
}

function tryRemoveListener() {
  if (!installed || layers.length > 0 || typeof window === 'undefined') return
  window.removeEventListener('popstate', dispatch, true)
  installed = false
}

/**
 * @param {string} id
 * @param {number} priority — lebih besar = lebih “atas” (dievaluasi lebih dulu).
 * @param {(ev: PopStateEvent) => boolean} handler — kembalikan true jika event habis dipakai.
 * @returns {() => void} unregister
 */
export function registerDomisiliPopstateLayer(id, priority, handler) {
  ensureListener()
  const layer = { id, priority, handler }
  layers.push(layer)
  return () => {
    const i = layers.indexOf(layer)
    if (i >= 0) layers.splice(i, 1)
    tryRemoveListener()
  }
}

/**
 * Prioritas bawaan (lebih besar = dievaluasi lebih dulu pada `popstate`).
 * UGT Tambah Guru Tugas madrasah memakai 35 — detail/edit santri global harus di atasnya,
 * supaya `history.back()` dari tombol tutup Detail tidak memakan entri history milik GT/Cari Santri.
 */
export const DOMISILI_POP_PRIORITY = {
  daerahPanels: 0,
  santriPerKamar: 10,
  /** Offcanvas Tambah Guru Tugas (UGT Data Madrasah). Harus di bawah detail/edit santri global. */
  ugtGtMadrasahOffcanvas: 35,
  santriDetail: 50,
  santriEdit: 55,
  /** Detail user read-only (di atas detail santri / pengurus). */
  userDetail: 60
}
