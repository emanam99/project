import type { APIRoute } from 'astro';
import { buildGoogleAuthUrl, isPenulisHost } from '../../../lib/auth.ts';
import { normalizePortalReturnTo } from '../../../lib/portal-urls.ts';

export const prerender = false;

// GET /api/auth/google?returnTo=/kirim-naskah
export const GET: APIRoute = ({ request, url }) => {
  try {
    const raw = url.searchParams.get('returnTo') ?? (isPenulisHost(request) ? '/kirim-naskah' : '/akun/kirim-naskah');
    const returnTo = normalizePortalReturnTo(raw, isPenulisHost(request));
    const authUrl = buildGoogleAuthUrl(request, returnTo);
    return Response.redirect(authUrl, 302);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'OAuth gagal' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
