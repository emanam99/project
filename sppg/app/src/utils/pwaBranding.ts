import { APP_VERSION } from '../config/version'
import { getGambarBase } from './gambar'

export type PwaManifestIcon = {
  src: string
  sizes: string
  type: string
  purpose?: string
}

export type PwaManifest = {
  id: string
  name: string
  short_name: string
  description: string
  theme_color: string
  background_color: string
  display: string
  scope: string
  start_url: string
  orientation: string
  lang: string
  dir: string
  categories: string[]
  icons: PwaManifestIcon[]
}

const MANIFEST_LINK_ID = 'sppg-dynamic-manifest'

function defaultIcons(): PwaManifestIcon[] {
  const base = getGambarBase()
  const v = `?v=${encodeURIComponent(APP_VERSION)}`
  const sizes = ['32', '64', '96', '128', '192', '512'] as const
  const icons: PwaManifestIcon[] = sizes.map((sz) => ({
    src: `${base}/icon/sppg.v3.u${sz}.png${v}`,
    sizes: `${sz}x${sz}`,
    type: 'image/png',
    purpose: 'any',
  }))
  icons.push({
    src: `${base}/icon/sppg.v3.u512.png${v}`,
    sizes: '512x512',
    type: 'image/png',
    purpose: 'maskable',
  })
  return icons
}

function logoIcons(logoSrc: string, mime = 'image/png'): PwaManifestIcon[] {
  return [
    { src: logoSrc, sizes: '192x192', type: mime, purpose: 'any' },
    { src: logoSrc, sizes: '512x512', type: mime, purpose: 'any' },
    { src: logoSrc, sizes: '512x512', type: mime, purpose: 'maskable' },
  ]
}

export function buildInstallManifest(opts: {
  slug: string
  namaUnit: string
  shortName: string
  logoUrl?: string | null
  logoBlobUrl?: string | null
  logoMime?: string
}): PwaManifest {
  const slug = opts.slug || 'sppg'
  let shortName = opts.shortName.trim() || opts.namaUnit.trim() || 'SPPG'
  const name = opts.namaUnit.trim() || shortName
  if (shortName.length > 12) {
    shortName = shortName.slice(0, 12)
  }

  const logoSrc = opts.logoBlobUrl || opts.logoUrl || null
  const icons = logoSrc ? logoIcons(logoSrc, opts.logoMime) : defaultIcons()

  return {
    id: `sppg-${slug}`,
    name,
    short_name: shortName,
    description: `${name} — catatan belanja dapur santri`,
    theme_color: '#2a96e0',
    background_color: '#2a96e0',
    display: 'minimal-ui',
    scope: '/',
    start_url: '/dashboard',
    orientation: 'portrait',
    lang: 'id',
    dir: 'ltr',
    categories: ['finance', 'productivity'],
    icons,
  }
}

export function applyDynamicManifest(manifest: PwaManifest): void {
  const json = JSON.stringify(manifest)
  const blob = new Blob([json], { type: 'application/manifest+json' })
  const url = URL.createObjectURL(blob)

  let link = document.getElementById(MANIFEST_LINK_ID) as HTMLLinkElement | null
  if (!link) {
    link = document.createElement('link')
    link.id = MANIFEST_LINK_ID
    link.rel = 'manifest'
    document.head.appendChild(link)
  } else if (link.href.startsWith('blob:')) {
    URL.revokeObjectURL(link.href)
  }
  link.href = url

  document.title = manifest.short_name

  const setMeta = (name: string, content: string) => {
    let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null
    if (!el) {
      el = document.createElement('meta')
      el.name = name
      document.head.appendChild(el)
    }
    el.content = content
  }
  setMeta('application-name', manifest.short_name)
  setMeta('apple-mobile-web-app-title', manifest.short_name)

  const icon192 = manifest.icons.find((i) => i.sizes.startsWith('192'))?.src
  if (icon192) {
    let apple = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null
    if (!apple) {
      apple = document.createElement('link')
      apple.rel = 'apple-touch-icon'
      document.head.appendChild(apple)
    }
    apple.href = icon192
  }
}
