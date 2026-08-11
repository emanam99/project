import type { APIRoute } from 'astro';
import { getUserAuthorProfile, lookupAuthorByEmail, upsertUserAuthorProfile } from '../../../lib/contributors.ts';
import { getFormFile, saveImageUpload, mediaUrl } from '../../../lib/uploads.ts';

export const prerender = false;

// GET /api/auth/profile
export const GET: APIRoute = ({ locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const profile = getUserAuthorProfile(user.id);
  return json(
    {
      data: {
        email: user.email,
        picture: user.picture,
        profile: profile ?? null,
        photo_url: profile?.photo_path ? mediaUrl(profile.photo_path) : user.picture,
      },
    },
    200,
  );
};

// PATCH /api/auth/profile (multipart or JSON)
export const PATCH: APIRoute = async ({ locals, request }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);

  try {
    const contentType = request.headers.get('content-type') ?? '';
    let body: Record<string, string> = {};
    let photoPath: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      for (const [k, v] of form.entries()) {
        if (typeof v === 'string') body[k] = v;
      }
      const photo = getFormFile(form, 'photo');
      if (photo) photoPath = await saveImageUpload(photo, 'photos');
    } else {
      body = await request.json();
    }

    const first_name = String(body.first_name ?? '').trim();
    const phone = String(body.phone ?? '').trim();
    if (!first_name) return json({ error: 'Nama awal wajib diisi.' }, 400);
    if (!phone) return json({ error: 'Nomor HP wajib diisi.' }, 400);

    upsertUserAuthorProfile(user.id, {
      title_prefix: String(body.title_prefix ?? '').trim(),
      first_name,
      middle_name: String(body.middle_name ?? '').trim(),
      last_name: String(body.last_name ?? '').trim(),
      title_suffix: String(body.title_suffix ?? '').trim(),
      id_number: String(body.id_number ?? '').trim(),
      phone,
      institution: String(body.institution ?? '').trim(),
      position_status: String(body.position_status ?? '').trim(),
      photo_path: photoPath,
    });

    const profile = getUserAuthorProfile(user.id);
    return json({ message: 'Profil diperbarui.', data: profile }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Gagal menyimpan profil.' }, 400);
  }
};

function json(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
