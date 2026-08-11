/** Selaras manifest PWA (`display: minimal-ui`) + mode terpasang lain. */
export const PWA_DISPLAY_MEDIA =
  '(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen)'

export function isPwaDisplayMode(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return (
    window.matchMedia?.(PWA_DISPLAY_MEDIA)?.matches === true ||
    nav.standalone === true ||
    document.referrer.startsWith('android-app://')
  )
}
