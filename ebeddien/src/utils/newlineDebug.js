/**
 * Log diagnostik newline di browser (setelah teks dari API).
 * Aktifkan: VITE_DEEPSEEK_DEBUG_NEWLINES=1 di .env ebeddien + npm run dev
 */

function shouldLog() {
  try {
    return (
      import.meta.env.DEV &&
      String(import.meta.env.VITE_DEEPSEEK_DEBUG_NEWLINES || '').trim() === '1'
    )
  } catch {
    return false
  }
}

/**
 * @param {string} phase
 * @param {string | null | undefined} text
 * @param {{ hint?: string }} [opts]
 */
export function logNewlineDebug(phase, text, opts = {}) {
  if (!shouldLog()) return
  const s = text == null ? '' : String(text)
  const n = (s.match(/\n/g) || []).length
  const dbl = (s.match(/\n\n+/g) || []).length
  const cr = (s.match(/\r/g) || []).length
  const maxPreview = 500
  let preview = s
  if (s.length > maxPreview) {
    preview = `${s.slice(0, 250)}\n… [potong] …\n${s.slice(-250)}`
  }
  const escaped = preview.replace(/\r\n/g, '\\r\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\r')

  console.groupCollapsed(`[newline][browser] ${phase}`)
  if (opts.hint) console.log('catatan:', opts.hint)
  console.log('panjang:', s.length, '| \\n:', n, '| blok \\n\\n+:', dbl, '| \\r:', cr)
  const issues = []
  if (s.length > 200 && n === 0) {
    issues.push('Teks panjang tanpa \\n — bandingkan dengan log Node [newline] proxy AI.')
  }
  if (issues.length) issues.forEach((m) => console.warn(m))
  else console.log('(tidak ada flag heuristik)')
  console.log('pratinjau (escaped):', escaped)
  console.groupEnd()
}
