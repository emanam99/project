/** URL stylesheet Google Fonts — sama dengan index.html */
export const READER_GOOGLE_FONTS_CSS =
  'https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&family=Lateef:wght@200;300;400;500;600;700;800&family=Scheherazade+New:wght@400;500;600;700&family=Roboto:ital,wght@0,400;0,500;0,700&family=Inter:wght@400;600;700&display=swap'

/** Muat CSS + file woff2 ke Cache Storage (via fetch → SW cache-first). */
export async function prefetchReaderFonts(): Promise<void> {
  try {
    const cssRes = await fetch(READER_GOOGLE_FONTS_CSS, { mode: 'cors', cache: 'force-cache' })
    if (!cssRes.ok) return
    const css = await cssRes.text()
    const urls = new Set<string>()
    for (const m of css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)) {
      urls.add(m[1].replace(/['"]/g, ''))
    }
    await Promise.all([...urls].map((u) => fetch(u, { mode: 'cors', cache: 'force-cache' }).catch(() => {})))
  } catch {
    // diam — offline / CSP; SW cache tetap dipakai bila pernah online
  }
}
