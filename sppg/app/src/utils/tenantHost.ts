export type HostMode = 'landing' | 'tenant' | 'admin' | 'legacy'

function currentHostname(): string {
  if (typeof window === 'undefined') return ''
  return window.location.hostname.toLowerCase()
}

function tenantBaseDomain(): string | null {
  const fromEnv = (import.meta.env.VITE_TENANT_BASE_DOMAIN as string | undefined)?.trim()
  if (fromEnv) return fromEnv.toLowerCase()
  if (import.meta.env.DEV) return 'cloudy.my.id'
  return null
}

function landingHost(): string | null {
  const fromEnv = (import.meta.env.VITE_LANDING_HOST as string | undefined)?.trim()
  if (fromEnv) return fromEnv.toLowerCase()
  const base = tenantBaseDomain()
  return base ? `sppg.${base}` : null
}

function platformAdminHost(): string | null {
  const fromEnv = (import.meta.env.VITE_PLATFORM_ADMIN_HOST as string | undefined)?.trim()
  if (fromEnv) return fromEnv.toLowerCase()
  const base = tenantBaseDomain()
  return base ? `adminsppg.${base}` : null
}

export function normalizeSubdomain(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function getHostMode(): HostMode {
  const host = currentHostname()
  const admin = platformAdminHost()
  if (admin && host === admin) return 'admin'

  const base = tenantBaseDomain()
  if (!base || !host) return 'legacy'

  const landing = landingHost()
  if (landing && host === landing) return 'landing'

  const suffix = '.' + base
  if (host.endsWith(suffix)) {
    const sub = host.slice(0, -suffix.length)
    if (sub && !sub.includes('.')) return 'tenant'
  }

  return 'legacy'
}

export function getTenantSubdomain(): string | null {
  if (getHostMode() !== 'tenant') return null
  const host = currentHostname()
  const base = tenantBaseDomain()
  if (!base) return null
  const suffix = '.' + base
  if (!host.endsWith(suffix)) return null
  const sub = host.slice(0, -suffix.length)
  return sub || null
}

export function getTenantBaseUrl(subdomain: string): string | null {
  const sub = normalizeSubdomain(subdomain)
  const base = tenantBaseDomain()
  if (!sub || !base) return null
  return `https://${sub}.${base}`
}

export function getLandingUrl(): string | null {
  const landing = landingHost()
  if (!landing) return null
  return `https://${landing}`
}

export function getPlatformAdminUrl(): string | null {
  const admin = platformAdminHost()
  if (!admin) return null
  return `https://${admin}`
}

export function isCloudyPlatform(): boolean {
  return getHostMode() !== 'legacy'
}

export function isLandingHost(): boolean {
  return getHostMode() === 'landing'
}

export function isTenantHost(): boolean {
  return getHostMode() === 'tenant'
}

export function isPlatformAdminHost(): boolean {
  return getHostMode() === 'admin'
}

/** OAuth callback pusat (landing) saat tenant subdomain. */
export function getOAuthApiBaseUrl(): string {
  const explicit = (import.meta.env.VITE_OAUTH_API_URL as string | undefined)?.replace(/\/$/, '')
  if (explicit) return explicit
  if (isCloudyPlatform() && (isTenantHost() || isPlatformAdminHost())) {
    const landing = getLandingUrl()
    if (landing) return `${landing}/api/public`
  }
  return ''
}
