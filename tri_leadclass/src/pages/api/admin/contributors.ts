import type { APIRoute } from 'astro';
import { updatePersonProfileByEmail, type AuthorInput } from '../../../lib/contributors.ts';
import { listAllPersonProfiles } from '../../../lib/person-profiles.ts';
import { getFormFile, saveImageUpload } from '../../../lib/uploads.ts';

export const prerender = false;

export const GET: APIRoute = ({ locals, url }) => {
  if (locals.user?.role !== 'super_admin') return json({ error: 'Forbidden' }, 403);

  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  let data = listAllPersonProfiles();
  if (q) {
    data = data.filter((p) => {
      const hay = [p.first_name, p.middle_name, p.last_name, p.email, p.institution, p.editorial_role]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }
  return json({ data }, 200);
};

export const PATCH: APIRoute = async ({ locals, request }) => {
  if (locals.user?.role !== 'super_admin') return json({ error: 'Forbidden' }, 403);

  try {
    const { originalEmail, input, photoPath } = await parseBody(request);
    if (!originalEmail) return json({ error: 'Email profil wajib.' }, 400);

    updatePersonProfileByEmail(originalEmail, input, photoPath);
    return json({ message: 'Biodata diperbarui untuk semua akun dengan email ini.' }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Gagal menyimpan.' }, 400);
  }
};

async function parseBody(request: Request): Promise<{
  originalEmail: string;
  input: AuthorInput;
  photoPath?: string | null;
}> {
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

  const originalEmail = String(fields.original_email ?? fields.email ?? '').trim();
  const first_name = String(fields.first_name ?? '').trim();
  const email = String(fields.email ?? '').trim();
  const phone = String(fields.phone ?? '').trim();

  if (!first_name) throw new Error('Nama awal wajib diisi.');
  if (!email) throw new Error('Email wajib diisi.');
  if (!phone) throw new Error('Nomor HP wajib diisi.');

  return {
    originalEmail,
    photoPath,
    input: {
      title_prefix: fields.title_prefix,
      first_name,
      middle_name: fields.middle_name,
      last_name: fields.last_name,
      title_suffix: fields.title_suffix,
      id_number: fields.id_number,
      email,
      phone,
      institution: fields.institution,
      position_status: fields.position_status,
    },
  };
}

function json(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
