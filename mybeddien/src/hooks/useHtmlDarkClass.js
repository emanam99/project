import { useSyncExternalStore } from 'react'

/**
 * Sumber kebenaran tampilan gelap: kelas `dark` di &lt;html&gt; (Tailwind).
 * Menghindari logo/aset salah saat state React tema belum selaras dengan DOM.
 */
export function useHtmlDarkClass() {
  return useSyncExternalStore(
    (onChange) => {
      const el = document.documentElement
      const mo = new MutationObserver(() => onChange())
      mo.observe(el, { attributes: true, attributeFilter: ['class'] })
      return () => mo.disconnect()
    },
    () => document.documentElement.classList.contains('dark'),
    () => false
  )
}
