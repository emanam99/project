import type { APIRoute } from 'astro';
import { createManuscript } from '../../../lib/manuscripts.ts';
import {
  createContributor,
  linkManuscriptAuthors,
  lookupAuthorByEmail,
  parseAuthorsJson,
  resolveAuthorInput,
  upsertUserAuthorProfile,
} from '../../../lib/contributors.ts';
import { getFormFile, saveDocUpload, saveImageUpload } from '../../../lib/uploads.ts';

export const prerender = false;

// POST /api/manuscripts/submit (multipart/form-data, butuh login)
export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) {
    return json({ error: 'Silakan login dengan Google terlebih dahulu.' }, 401);
  }

  try {
    const form = await request.formData();
    const title = String(form.get('title') ?? '').trim();
    const abstract = String(form.get('abstract') ?? '').trim();
    const keywords = String(form.get('keywords') ?? '').trim();
    const category = String(form.get('category') ?? '').trim();
    const authorNotes = String(form.get('author_notes') ?? '').trim();
    const authorsRaw = String(form.get('authors_json') ?? '');

    const file = getFormFile(form, 'file');
    const coverFile = getFormFile(form, 'cover_image');
    const primaryPhoto = getFormFile(form, 'primary_photo');

    if (!title || title.length < 10) {
      return json({ error: 'Judul naskah minimal 10 karakter.' }, 400);
    }
    if (!abstract || abstract.length < 50) {
      return json({ error: 'Abstrak minimal 50 karakter.' }, 400);
    }
    if (!file) {
      return json({ error: 'File naskah Word (DOC/DOCX) wajib diunggah.' }, 400);
    }
    if (!authorsRaw) {
      return json({ error: 'Data penulis wajib diisi.' }, 400);
    }

    let authorsData: ReturnType<typeof parseAuthorsJson>;
    try {
      authorsData = parseAuthorsJson(authorsRaw);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : 'Data penulis tidak valid.' }, 400);
    }

    const filePath = await saveDocUpload(file);
    let coverImagePath: string | null = null;
    if (coverFile) {
      coverImagePath = await saveImageUpload(coverFile, 'covers');
    }

    let primaryPhotoPath: string | null = null;
    if (primaryPhoto) {
      primaryPhotoPath = await saveImageUpload(primaryPhoto, 'photos');
    }

    const primary = authorsData.primary;
    primary.email = user.email;
    primary.google_picture = user.picture;
    if (primaryPhotoPath) primary.photo_path = primaryPhotoPath;

    upsertUserAuthorProfile(user.id, {
      title_prefix: primary.title_prefix,
      first_name: primary.first_name,
      middle_name: primary.middle_name,
      last_name: primary.last_name,
      title_suffix: primary.title_suffix,
      id_number: primary.id_number,
      phone: primary.phone,
      institution: primary.institution,
      position_status: primary.position_status,
      photo_path: primaryPhotoPath,
    });

    const manuscript = createManuscript({
      userId: user.id,
      title,
      abstract,
      keywords,
      category,
      authorNotes,
      filePath,
      coverImagePath: coverImagePath ?? undefined,
    });

    const primaryContributor = createContributor({
      ...primary,
      user_id: user.id,
    });

    const linked: { id: number; sort_order: number; is_primary: boolean }[] = [
      { id: primaryContributor.id, sort_order: 0, is_primary: true },
    ];

    for (let i = 0; i < authorsData.coAuthors.length; i++) {
      const raw = authorsData.coAuthors[i];
      const isLocked = !!(raw as { locked?: boolean }).locked;
      const co = resolveAuthorInput(raw.email, raw, user.id);
      const coPhoto = getFormFile(form, `coauthor_photo_${i}`);
      if (coPhoto && !isLocked) {
        co.photo_path = await saveImageUpload(coPhoto, 'photos');
      }
      const lookup = lookupAuthorByEmail(co.email, user.id);
      let contributorId = lookup.contributor_id;
      if (!contributorId || !isLocked) {
        const contributor = createContributor({
          ...co,
          user_id: lookup.user_id,
          photo_path: co.photo_path ?? (lookup.photo_preview?.startsWith('uploads/') ? lookup.photo_preview : null),
          google_picture: co.google_picture ?? lookup.photo_preview,
        });
        contributorId = contributor.id;
      }
      linked.push({ id: contributorId!, sort_order: i + 1, is_primary: false });
    }

    linkManuscriptAuthors(manuscript.id, linked);

    return json(
      {
        message: 'Naskah berhasil dikirim. Tim redaksi akan meninjau dalam 7 hari kerja.',
        id: manuscript.id,
      },
      201,
    );
  } catch (err) {
    console.error('[manuscripts/submit]', err);
    return json({ error: err instanceof Error ? err.message : 'Gagal mengirim naskah.' }, 500);
  }
};

function json(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
