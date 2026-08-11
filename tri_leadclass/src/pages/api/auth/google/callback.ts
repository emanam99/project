import type { APIRoute } from 'astro';
import {
  createSession,
  decodeOAuthState,
  exchangeGoogleCode,
  getAdminUrl,
  getPenulisUrl,
  isAdminHost,
  isPenulisHost,
  sessionCookieHeader,
} from '../../../../lib/auth.ts';
import { normalizePortalReturnTo } from '../../../../lib/portal-urls.ts';
import { isAdminRole, upsertGoogleUser } from '../../../../lib/users.ts';

export const prerender = false;

// GET /api/auth/google/callback?code=...&state=...
export const GET: APIRoute = async ({ request, url }) => {
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const fallback = isAdminHost(request)
    ? `${getAdminUrl()}/admin/login`
    : `${getPenulisUrl()}/kirim-naskah`;

  if (error) {
    return Response.redirect(`${fallback}?error=${encodeURIComponent(error)}`, 302);
  }

  if (!code || !stateRaw) {
    return Response.redirect(`${fallback}?error=missing_code`, 302);
  }

  const state = decodeOAuthState(stateRaw);
  if (!state) {
    return Response.redirect(`${fallback}?error=invalid_state`, 302);
  }

  try {
    const profile = await exchangeGoogleCode(request, code);
    const user = upsertGoogleUser({
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      googleId: profile.googleId,
    });

    // Admin subdomain: hanya admin/super_admin boleh masuk
    if (isAdminHost(request) && !isAdminRole(user.role)) {
      return Response.redirect(
        `${getAdminUrl()}/admin/login?error=${encodeURIComponent('Akun Anda belum memiliki akses admin.')}`,
        302,
      );
    }

    const sessionId = createSession(user.id);
    const returnTo = normalizePortalReturnTo(
      state.returnTo.startsWith('/') ? state.returnTo : '/',
      isPenulisHost(request),
    );

    return new Response(null, {
      status: 302,
      headers: {
        Location: returnTo,
        'Set-Cookie': sessionCookieHeader(sessionId),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'login_gagal';
    return Response.redirect(`${fallback}?error=${encodeURIComponent(msg)}`, 302);
  }
};
