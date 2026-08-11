import type { APIRoute } from 'astro';
import {
  createCategory,
  listCategoriesWithStats,
  updateCategory,
  getCategoryById,
} from '../../../lib/categories.ts';
import { isAdminRole } from '../../../lib/users.ts';

export const prerender = false;

// GET /api/admin/categories
export const GET: APIRoute = ({ locals }) => {
  if (!locals.user || !isAdminRole(locals.user.role)) {
    return json({ error: 'Unauthorized' }, 401);
  }
  return json({ data: listCategoriesWithStats() }, 200);
};

// POST /api/admin/categories  { name }
export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user || !isAdminRole(locals.user.role)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON tidak valid.' }, 400);
  }

  try {
    const category = createCategory(String(body.name ?? ''));
    return json({ message: 'Kategori ditambahkan.', data: category }, 201);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Gagal menambah kategori.' }, 400);
  }
};

// PATCH /api/admin/categories  { id, name }
export const PATCH: APIRoute = async ({ locals, request }) => {
  if (!locals.user || !isAdminRole(locals.user.role)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: { id?: number; name?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON tidak valid.' }, 400);
  }

  const id = Number(body.id);
  if (!id || !getCategoryById(id)) {
    return json({ error: 'Kategori tidak ditemukan.' }, 404);
  }

  try {
    const category = updateCategory(id, String(body.name ?? ''));
    return json({ message: 'Kategori diperbarui.', data: category }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Gagal memperbarui kategori.' }, 400);
  }
};

function json(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
