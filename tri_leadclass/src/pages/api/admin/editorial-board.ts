import type { APIRoute } from 'astro';
import {
  createBoardMember,
  deleteBoardMember,
  getBoardMemberById,
  listBoardMembers,
  lookupBoardEmailLink,
  updateBoardMember,
  type BoardMemberInput,
} from '../../../lib/editorial-board.ts';
import { getFormFile, mediaUrl, saveImageUpload } from '../../../lib/uploads.ts';

export const prerender = false;

export const GET: APIRoute = ({ locals, url }) => {
  if (locals.user?.role !== 'super_admin') return json({ error: 'Forbidden' }, 403);

  const email = url.searchParams.get('email');
  if (email) {
    const excludeId = Number(url.searchParams.get('exclude_id') || 0) || undefined;
    return json({ data: lookupBoardEmailLink(email, excludeId) }, 200);
  }

  const id = Number(url.searchParams.get('id') || 0);
  if (id) {
    const member = getBoardMemberById(id);
    if (!member) return json({ error: 'Anggota tidak ditemukan.' }, 404);
    return json({ data: memberToPayload(member) }, 200);
  }

  return json({ data: listBoardMembers().map(memberToPayload) }, 200);
};

export const POST: APIRoute = async ({ locals, request }) => {
  if (locals.user?.role !== 'super_admin') return json({ error: 'Forbidden' }, 403);

  try {
    const data = await parseBody(request);
    const member = createBoardMember(data);
    return json({ message: 'Anggota redaksi ditambahkan.', data: memberToPayload(member) }, 201);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Gagal menyimpan.' }, 400);
  }
};

export const PATCH: APIRoute = async ({ locals, request }) => {
  if (locals.user?.role !== 'super_admin') return json({ error: 'Forbidden' }, 403);

  try {
    const data = await parseBody(request);
    const id = Number(data.id);
    if (!id) return json({ error: 'ID wajib.' }, 400);

    const updated = updateBoardMember(id, data);
    if (!updated) return json({ error: 'Anggota tidak ditemukan.' }, 404);
    return json({ message: 'Profil redaksi diperbarui.', data: memberToPayload(updated) }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Gagal menyimpan.' }, 400);
  }
};

export const DELETE: APIRoute = async ({ locals, request }) => {
  if (locals.user?.role !== 'super_admin') return json({ error: 'Forbidden' }, 403);

  let body: { id?: number };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON tidak valid.' }, 400);
  }

  const id = Number(body.id);
  if (!id) return json({ error: 'ID wajib.' }, 400);
  if (!deleteBoardMember(id)) return json({ error: 'Anggota tidak ditemukan.' }, 404);
  return json({ message: 'Anggota redaksi dihapus.' }, 200);
};

function memberToPayload(m: ReturnType<typeof getBoardMemberById>) {
  if (!m) return m;
  const photo_url = m.photo_path?.startsWith('uploads/') ? mediaUrl(m.photo_path) : null;
  return { ...m, photo_url };
}

async function parseBody(request: Request): Promise<BoardMemberInput & { id?: number }> {
  const contentType = request.headers.get('content-type') ?? '';
  let fields: Record<string, string> = {};
  let photoPath: string | null | undefined;

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    for (const [k, v] of form.entries()) {
      if (typeof v === 'string') fields[k] = v;
    }
    const photo = getFormFile(form, 'photo');
    if (photo) photoPath = await saveImageUpload(photo, 'photos');
  } else {
    fields = (await request.json()) as Record<string, string>;
  }

  const first_name = String(fields.first_name ?? '').trim();
  if (!first_name) throw new Error('Nama awal wajib diisi.');

  const userIdRaw = String(fields.user_id ?? '').trim();
  const user_id = userIdRaw ? Number(userIdRaw) : null;

  return {
    id: fields.id ? Number(fields.id) : undefined,
    user_id: Number.isFinite(user_id) ? user_id : null,
    editorial_role: fields.editorial_role,
    title_prefix: fields.title_prefix,
    first_name,
    middle_name: fields.middle_name,
    last_name: fields.last_name,
    title_suffix: fields.title_suffix,
    id_number: fields.id_number,
    email: fields.email,
    phone: fields.phone,
    institution: fields.institution,
    position_status: fields.position_status,
    bio: fields.bio,
    sort_order: fields.sort_order ? Number(fields.sort_order) : undefined,
    photo_path: photoPath,
  };
}

function json(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
