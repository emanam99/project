import type { APIRoute } from 'astro';
import { listSitePages, updateSitePage } from '../../../lib/site-pages.ts';

export const prerender = false;

export const GET: APIRoute = ({ locals }) => {
  if (locals.user?.role !== 'super_admin') return json({ error: 'Forbidden' }, 403);
  return json({ data: listSitePages() }, 200);
};

export const PATCH: APIRoute = async ({ locals, request }) => {
  if (locals.user?.role !== 'super_admin') return json({ error: 'Forbidden' }, 403);

  let body: { id?: number; title?: string; excerpt?: string; content?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON tidak valid.' }, 400);
  }

  const id = Number(body.id);
  if (!id) return json({ error: 'ID halaman wajib.' }, 400);

  const title = String(body.title ?? '').trim();
  if (!title) return json({ error: 'Judul wajib diisi.' }, 400);

  const updated = updateSitePage(id, {
    title,
    excerpt: String(body.excerpt ?? '').trim() || null,
    content: String(body.content ?? ''),
  });

  if (!updated) return json({ error: 'Halaman tidak ditemukan.' }, 404);
  return json({ message: 'Halaman diperbarui.', data: updated }, 200);
};

function json(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
