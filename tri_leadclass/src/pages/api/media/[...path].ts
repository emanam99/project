import type { APIRoute } from 'astro';
import { readFileSync, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';

export const prerender = false;

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

// GET /api/media/covers/... | photos/... — gambar publik
export const GET: APIRoute = ({ params }) => {
  const rel = params.path ?? '';
  const safe = normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');

  if (!/^(covers|photos)\//.test(safe)) {
    return new Response('Forbidden', { status: 403 });
  }

  const fullPath = join(process.cwd(), 'data', 'uploads', safe);
  const root = join(process.cwd(), 'data', 'uploads');

  if (!fullPath.startsWith(root) || !existsSync(fullPath)) {
    return new Response('Not found', { status: 404 });
  }

  const ext = safe.split('.').pop()?.toLowerCase() ?? '';
  const mime = MIME[ext];
  if (!mime) {
    return new Response('Forbidden', { status: 403 });
  }

  const buffer = readFileSync(fullPath);
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
