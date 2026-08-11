import type { APIRoute } from 'astro';
import { grantUserAccess, listUsers, updateUserRole } from '../../../lib/users.ts';
import type { UserRole } from '../../../lib/types.ts';

export const prerender = false;

const VALID_ROLES: UserRole[] = ['super_admin', 'admin', 'user'];
const GRANT_ROLES: UserRole[] = ['admin', 'user'];

// GET /api/admin/users
export const GET: APIRoute = ({ locals, url }) => {
  if (locals.user?.role !== 'super_admin') {
    return json({ error: 'Forbidden' }, 403);
  }

  const role = url.searchParams.get('role') as UserRole | null;
  const q = url.searchParams.get('q') ?? undefined;
  const pendingOnly = url.searchParams.get('pending') === '1';

  return json(
    {
      data: listUsers({
        role: role && VALID_ROLES.includes(role) ? role : undefined,
        q,
        pendingOnly,
      }),
    },
    200,
  );
};

// POST /api/admin/users  { email, role } — pre-register sebelum login Google
export const POST: APIRoute = async ({ locals, request }) => {
  if (locals.user?.role !== 'super_admin') {
    return json({ error: 'Forbidden' }, 403);
  }

  let body: { email?: string; role?: UserRole };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON tidak valid.' }, 400);
  }

  const email = String(body.email ?? '').trim();
  const role = body.role;
  if (!email || !role || !GRANT_ROLES.includes(role)) {
    return json({ error: 'Email dan role (admin/penulis) wajib diisi.' }, 400);
  }

  try {
    const user = grantUserAccess(email, role);
    return json(
      {
        message: user.google_id
          ? 'Role pengguna diperbarui.'
          : 'Akses diberikan. Pengguna dapat login saat sudah siap.',
        data: user,
      },
      201,
    );
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Gagal memberi akses.' }, 400);
  }
};

// PATCH /api/admin/users  { id, role }
export const PATCH: APIRoute = async ({ locals, request }) => {
  const actor = locals.user;
  if (actor?.role !== 'super_admin') {
    return json({ error: 'Forbidden' }, 403);
  }

  let body: { id?: number; role?: UserRole };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON tidak valid.' }, 400);
  }

  const id = Number(body.id);
  const role = body.role;
  if (!id || !role || !VALID_ROLES.includes(role)) {
    return json({ error: 'Data tidak valid.' }, 400);
  }

  // Lindungi super admin utama dari downgrade sendiri
  if (actor.id === id && role !== 'super_admin') {
    return json({ error: 'Anda tidak dapat menurunkan role akun sendiri.' }, 400);
  }

  updateUserRole(id, role);
  return json({ message: 'Role pengguna diperbarui.' }, 200);
};

function json(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
