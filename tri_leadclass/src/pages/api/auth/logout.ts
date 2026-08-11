import type { APIRoute } from 'astro';
import {
  clearSessionCookieHeader,
  parseCookies,
  getSessionCookieName,
  deleteSession,
  getPublicSiteUrl,
} from '../../../lib/auth.ts';

export const prerender = false;

// POST /api/auth/logout — selalu arahkan ke domain utama setelah keluar.
export const POST: APIRoute = ({ request }) => {
  const cookies = parseCookies(request.headers.get('cookie'));
  const sid = cookies[getSessionCookieName()];
  if (sid) deleteSession(sid);

  const redirect = `${getPublicSiteUrl()}/`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: redirect,
      'Set-Cookie': clearSessionCookieHeader(),
    },
  });
};
