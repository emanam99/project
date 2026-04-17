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

/** Prioritas bawaan (jangan ubah urutan relatif tanpa cek Daerah + SantriPerKamar + detail). */
export const DOMISILI_POP_PRIORITY = {
  daerahPanels: 0,
  santriPerKamar: 10,
  santriDetail: 20,
  santriEdit: 30
}
