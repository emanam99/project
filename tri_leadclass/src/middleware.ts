import { defineMiddleware } from 'astro:middleware';
import {
  getPenulisUrl,
  getSessionFromRequest,
  getSiteUrl,
  isAdminHost,
  isPenulisHost,
  purgeExpiredSessions,
} from './lib/auth.ts';
import {
  akunPathToPenulisPath,
  akunRewriteTarget,
  penulisPortalUrl,
} from './lib/portal-urls.ts';
import { isAdminRole } from './lib/users.ts';

purgeExpiredSessions();

const ASSET_PREFIXES = ['/api/', '/_astro/', '/icon/', '/favicon', '/healthz'];

function isAssetOrApi(path: string): boolean {
  return ASSET_PREFIXES.some((p) => path.startsWith(p));
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;
  const adminHost = isAdminHost(request);
  const penulisHost = isPenulisHost(request);

  context.locals.isAdminHost = adminHost;
  context.locals.isPenulisHost = penulisHost;
  context.locals.user = getSessionFromRequest(request);

  const path = url.pathname;
  const user = context.locals.user;

  // Subdomain admin: root -> dashboard admin
  if (adminHost && path === '/') {
    return context.redirect(user && isAdminRole(user.role) ? '/admin' : '/admin/login');
  }

  // Halaman admin hanya dari subdomain admin (kecuali API auth)
  if (path.startsWith('/admin') && !adminHost && !path.startsWith('/admin/login')) {
    const adminUrl = process.env.PUBLIC_ADMIN_URL ?? 'https://admin.trileadclass.my.id';
    return context.redirect(`${adminUrl}${path}`);
  }

  // Proteksi rute admin
  if (adminHost && path.startsWith('/admin') && path !== '/admin/login') {
    if (!user) return context.redirect('/admin/login');
    if (!isAdminRole(user.role)) {
      return new Response('Akses ditolak. Akun Anda bukan admin.', { status: 403 });
    }
  }

  // Super admin only: kelola pengguna, konten, redaksi, biodata penulis
  const superAdminPaths = ['/admin/pengguna', '/admin/halaman', '/admin/redaksi', '/admin/penulis'];
  if (adminHost && superAdminPaths.some((p) => path.startsWith(p))) {
    if (user?.role !== 'super_admin') {
      return new Response('Hanya super admin yang dapat mengakses halaman ini.', { status: 403 });
    }
  }

  // ── Subdomain penulis.trileadclass.my.id ──
  if (penulisHost) {
    if (path.startsWith('/admin')) {
      const adminUrl = process.env.PUBLIC_ADMIN_URL ?? 'https://admin.trileadclass.my.id';
      return context.redirect(`${adminUrl}${path}`);
    }

    // Rute internal /akun (setelah rewrite) — jangan redirect agar tidak loop
    if (path.startsWith('/akun')) {
      return next();
    }

    const rewriteTarget = akunRewriteTarget(path);
    if (rewriteTarget) {
      return context.rewrite(rewriteTarget);
    }

    if (!isAssetOrApi(path)) {
      return context.redirect(`${getSiteUrl(request)}${path}${url.search}`);
    }
  }

  // Beranda jurnal: /akun/* → subdomain penulis
  if (!adminHost && !penulisHost && path.startsWith('/akun')) {
    const dest = `${getPenulisUrl()}${akunPathToPenulisPath(path)}`;
    return context.redirect(dest + url.search);
  }

  // Legacy kirim naskah & profil → subdomain penulis
  if (!adminHost && !penulisHost && (path === '/kirim-naskah' || path === '/profil')) {
    const route = path === '/kirim-naskah' ? 'kirimNaskah' : 'profil';
    return context.redirect(penulisPortalUrl(route) + url.search);
  }

  return next();
});
