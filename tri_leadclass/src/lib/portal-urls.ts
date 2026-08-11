import { getPenulisUrl, isPenulisHost } from './auth.ts';

export type PortalRoute = 'home' | 'kirimNaskah' | 'published' | 'profil';

const AKUN: Record<PortalRoute, string> = {
  home: '/akun',
  kirimNaskah: '/akun/kirim-naskah',
  published: '/akun/published',
  profil: '/akun/profil',
};

const PENULIS: Record<PortalRoute, string> = {
  home: '/',
  kirimNaskah: '/kirim-naskah',
  published: '/published',
  profil: '/profil',
};

/** Path relatif portal sesuai host saat ini */
export function portalRoute(route: PortalRoute, onPenulisHost: boolean): string {
  return onPenulisHost ? PENULIS[route] : AKUN[route];
}

export function portalRouteFromRequest(request: Request, route: PortalRoute): string {
  return portalRoute(route, isPenulisHost(request));
}

/** URL absolut portal penulis (untuk link dari beranda jurnal) */
export function penulisPortalUrl(route: PortalRoute = 'home'): string {
  const path = PENULIS[route];
  return `${getPenulisUrl()}${path === '/' ? '' : path}`;
}

/** Subdomain penulis → rute internal /akun (rewrite) */
const PENULIS_TO_AKUN: Record<string, string> = {
  '/': '/akun',
  '/kirim-naskah': '/akun/kirim-naskah',
  '/published': '/akun/published',
  '/profil': '/akun/profil',
};

export function akunRewriteTarget(pathname: string): string | null {
  const p = pathname.replace(/\/$/, '') || '/';
  return PENULIS_TO_AKUN[p] ?? null;
}

/** /akun/* → path bersih di subdomain penulis */
export function akunPathToPenulisPath(pathname: string): string {
  const p = pathname.replace(/\/$/, '') || '/';
  switch (p) {
    case '/akun':
      return '/';
    case '/akun/kirim-naskah':
      return '/kirim-naskah';
    case '/akun/published':
      return '/published';
    case '/akun/profil':
      return '/profil';
    default:
      return '/';
  }
}

/** Normalisasi returnTo OAuth ke path portal yang valid */
export function normalizePortalReturnTo(returnTo: string, onPenulisHost: boolean): string {
  if (!returnTo.startsWith('/')) return onPenulisHost ? '/kirim-naskah' : '/akun/kirim-naskah';

  const akunMap: Record<string, PortalRoute> = {
    '/akun': 'home',
    '/akun/kirim-naskah': 'kirimNaskah',
    '/akun/published': 'published',
    '/akun/profil': 'profil',
    '/kirim-naskah': 'kirimNaskah',
    '/published': 'published',
    '/profil': 'profil',
    '/': 'home',
  };

  const normalized = returnTo.replace(/\/$/, '') || '/';
  const key = akunMap[normalized] ?? akunMap[returnTo];
  if (key) return portalRoute(key, onPenulisHost);

  return returnTo;
}
