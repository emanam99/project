import type { APIRoute } from 'astro';
import { lookupAuthorByEmail } from '../../../lib/contributors.ts';
import { mediaUrl } from '../../../lib/uploads.ts';

export const prerender = false;

// GET /api/auth/lookup-author?email=
export const GET: APIRoute = ({ locals, url }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);

  const email = url.searchParams.get('email') ?? '';
  const lookup = lookupAuthorByEmail(email, locals.user.id);

  const photo_preview = lookup.photo_preview?.startsWith('uploads/')
    ? mediaUrl(lookup.photo_preview)
    : lookup.photo_preview;

  return json({ data: { ...lookup, photo_preview } }, 200);
};

function json(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
