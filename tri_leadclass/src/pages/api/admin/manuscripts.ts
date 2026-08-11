import type { APIRoute } from 'astro';
import {
  getManuscriptById,
  listAllManuscripts,
  updateManuscriptStatus,
} from '../../../lib/manuscripts.ts';
import { applyManuscriptPublication } from '../../../lib/publish.ts';
import { isAdminRole } from '../../../lib/users.ts';
import type { ManuscriptStatus } from '../../../lib/types.ts';

export const prerender = false;

const VALID_STATUS: ManuscriptStatus[] = [
  'pending',
  'reviewing',
  'revision',
  'accepted',
  'rejected',
  'published',
];

// GET /api/admin/manuscripts?status=pending
export const GET: APIRoute = ({ locals, url }) => {
  const user = locals.user;
  if (!user || !isAdminRole(user.role)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const status = url.searchParams.get('status') as ManuscriptStatus | null;
  const data = status && VALID_STATUS.includes(status) ? listAllManuscripts(status) : listAllManuscripts();

  return json({ count: data.length, data }, 200);
};

// PATCH /api/admin/manuscripts  { id, status, admin_notes }
export const PATCH: APIRoute = async ({ locals, request }) => {
  const user = locals.user;
  if (!user || !isAdminRole(user.role)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: { id?: number; status?: ManuscriptStatus; admin_notes?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON tidak valid.' }, 400);
  }

  const id = Number(body.id);
  const existing = getManuscriptById(id);
  if (!id || !existing) {
    return json({ error: 'Naskah tidak ditemukan.' }, 404);
  }

  const status = body.status;
  if (!status || !VALID_STATUS.includes(status)) {
    return json({ error: 'Status tidak valid.' }, 400);
  }

  const prevStatus = existing.status;
  updateManuscriptStatus(id, status, body.admin_notes?.trim() ?? null, user.id);
  applyManuscriptPublication(id, prevStatus, status);

  const updated = getManuscriptById(id);
  return json(
    {
      message:
        status === 'published'
          ? 'Status diperbarui. Artikel sudah tampil di web utama.'
          : 'Status naskah diperbarui.',
      data: updated,
      article_id: updated?.article_id ?? null,
    },
    200,
  );
};

function json(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
