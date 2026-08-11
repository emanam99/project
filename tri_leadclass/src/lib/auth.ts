import { randomBytes } from 'node:crypto';
import { db } from '../db/index.ts';
import type { User } from './types.ts';
import { getUserById } from './users.ts';

const SESSION_COOKIE = 'tri_session';
const SESSION_DAYS = 30;

export function getSessionCookieName(): string {
  return SESSION_COOKIE;
}

export function createSession(userId: number): string {
  const id = randomBytes(32).toString('hex');
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_DAYS);

  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(
    id,
    userId,
    expires.toISOString(),
  );

  return id;
}

export function deleteSession(sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function getUserFromSession(sessionId: string | undefined | null): User | null {
  if (!sessionId) return null;

  const row = db
    .prepare(
      `SELECT s.id AS sid, s.expires_at, u.*
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
    )
    .get(sessionId) as (User & { sid: string; expires_at: string }) | undefined;

  if (!row) return null;

  if (new Date(row.expires_at) < new Date()) {
    deleteSession(sessionId);
    return null;
  }

  return getUserById(row.id) ?? null;
}

export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(';').map((part) => {
      const [key, ...rest] = part.trim().split('=');
      return [key, decodeURIComponent(rest.join('='))];
    }),
  );
}

export function getSessionFromRequest(request: Request): User | null {
  const cookies = parseCookies(request.headers.get('cookie'));
  return getUserFromSession(cookies[SESSION_COOKIE]);
}

export function sessionCookieHeader(sessionId: string, maxAgeSec = SESSION_DAYS * 86400): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${cookieDomainAttr()}${secure}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieDomainAttr()}`;
}

export function getSiteUrl(request?: Request): string {
  if (process.env.PUBLIC_SITE_URL) return process.env.PUBLIC_SITE_URL.replace(/\/$/, '');
  if (request) {
    const host = request.headers.get('host');
    const proto = request.headers.get('x-forwarded-proto') ?? 'http';
    if (host) return `${proto}://${host}`;
  }
  return 'http://localhost:4321';
}

/** Beranda jurnal (selalu domain utama, bukan subdomain penulis/admin) */
export function getPublicSiteUrl(): string {
  return (process.env.PUBLIC_SITE_URL ?? getSiteUrl()).replace(/\/$/, '');
}

export function getAdminUrl(): string {
  return (process.env.PUBLIC_ADMIN_URL ?? 'http://admin.localhost:4321').replace(/\/$/, '');
}

export function getPenulisUrl(): string {
  return (process.env.PUBLIC_PENULIS_URL ?? 'http://penulis.localhost:4321').replace(/\/$/, '');
}

function cookieDomainAttr(): string {
  const domain = process.env.COOKIE_DOMAIN?.trim();
  return domain ? `; Domain=${domain}` : '';
}

export function isAdminHost(request: Request): boolean {
  const host = request.headers.get('host') ?? '';
  const adminHost = new URL(getAdminUrl()).host;
  return host === adminHost || host.startsWith('admin.');
}

export function isPenulisHost(request: Request): boolean {
  const host = request.headers.get('host') ?? '';
  const penulisHost = new URL(getPenulisUrl()).host;
  return host === penulisHost || host.startsWith('penulis.');
}

export function isAuthorPortalHost(request: Request): boolean {
  return isPenulisHost(request);
}

export function getGoogleRedirectUri(request: Request): string {
  if (isAdminHost(request)) return `${getAdminUrl()}/api/auth/google/callback`;
  if (isPenulisHost(request)) return `${getPenulisUrl()}/api/auth/google/callback`;
  return `${getSiteUrl(request)}/api/auth/google/callback`;
}

export interface OAuthState {
  returnTo: string;
}

export function encodeOAuthState(state: OAuthState): string {
  return Buffer.from(JSON.stringify(state)).toString('base64url');
}

export function decodeOAuthState(raw: string): OAuthState | null {
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8')) as OAuthState;
  } catch {
    return null;
  }
}

export function buildGoogleAuthUrl(request: Request, returnTo: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID belum dikonfigurasi');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleRedirectUri(request),
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state: encodeOAuthState({ returnTo }),
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(
  request: Request,
  code: string,
): Promise<{ email: string; name: string; picture: string; googleId: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Google OAuth belum dikonfigurasi');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getGoogleRedirectUri(request),
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Token exchange gagal: ${err}`);
  }

  const tokenData = (await tokenRes.json()) as { access_token: string };

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!profileRes.ok) throw new Error('Gagal mengambil profil Google');

  const profile = (await profileRes.json()) as {
    sub: string;
    email: string;
    name: string;
    picture: string;
  };

  return {
    googleId: profile.sub,
    email: profile.email,
    name: profile.name,
    picture: profile.picture,
  };
}

// Bersihkan sesi kadaluarsa (dipanggil sesekali).
export function purgeExpiredSessions(): void {
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
}
