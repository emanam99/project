import { getGambarUrl } from '../config/images'

/** Pasang / lepas link manifest + ikon PWA staff eBeddien di <head>. */
export function ensureStaffPwaHead() {
  const head = document.head
  if (!head) return () => {}

  const ensureLink = (selector, attrs) => {
    let el = head.querySelector(selector)
    if (!el) {
      el = document.createElement('link')
      head.appendChild(el)
    }
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
    return el
  }

  const manifestEl = ensureLink('link[data-eb-pwa="manifest"]', {
    rel: 'manifest',
    href: '/manifest.webmanifest',
    'data-eb-pwa': 'manifest',
  })
  const appleIconEl = ensureLink('link[data-eb-pwa="apple-touch-icon"]', {
    rel: 'apple-touch-icon',
    href: getGambarUrl('/icon/ebeddienicon192.png'),
    'data-eb-pwa': 'apple-touch-icon',
  })
  const icon192El = ensureLink('link[data-eb-pwa="icon-192"]', {
    rel: 'icon',
    type: 'image/png',
    sizes: '192x192',
    href: getGambarUrl('/icon/ebeddienicon192.png'),
    'data-eb-pwa': 'icon-192',
  })
  const icon512El = ensureLink('link[data-eb-pwa="icon-512"]', {
    rel: 'icon',
    type: 'image/png',
    sizes: '512x512',
    href: getGambarUrl('/icon/ebeddienicon512.png'),
    'data-eb-pwa': 'icon-512',
  })

  return () => {
    manifestEl?.remove()
    appleIconEl?.remove()
    icon192El?.remove()
    icon512El?.remove()
  }
}
