import type { APIRoute } from 'astro';
import { getManuscriptById, updateManuscriptContent, updateManuscriptStatus } from '../../../../lib/manuscripts.ts';
import { publishManuscript, unpublishManuscript } from '../../../../lib/publish.ts';
import { getFormFile, saveImageUpload } from '../../../../lib/uploads.ts';
import { isAdminRole } from '../../../../lib/users.ts';

export const prerender = false;

// PATCH /api/admin/manuscripts/[id] — edit judul, abstrak, gambar; action=unpublish
export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const user = locals.user;
  if (!user || !isAdminRole(user.role)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const id = Number(params.id);
  const existing = getManuscriptById(id);
  if (!id || !existing) {
    return json({ error: 'Naskah tidak ditemukan.' }, 404);
  }

  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const action = String(form.get('action') ?? 'save');

    if (action === 'unpublish') {
      if (existing.status !== 'published') {
        return json({ error: 'Naskah ini tidak sedang diterbitkan.' }, 400);
      }
      unpublishManuscript(id);
      updateManuscriptStatus(id, 'accepted', existing.admin_notes, user.id);
      return json({ message: 'Publikasi dibatalkan. Artikel dihapus dari web.', data: getManuscriptById(id) }, 200);
    }

    const title = String(form.get('title') ?? '').trim();
    const abstract = String(form.get('abstract') ?? '').trim();
    const keywords = String(form.get('keywords') ?? '').trim();
    const category = String(form.get('category') ?? '').trim();

    if (title.length < 10) return json({ error: 'Judul minimal 10 karakter.' }, 400);
    if (abstract.length < 50) return json({ error: 'Abstrak minimal 50 karakter.' }, 400);

    let coverImagePath: string | undefined;
    const coverFile = getFormFile(form, 'cover_image');
    if (coverFile) {
      try {
        coverImagePath = await saveImageUpload(coverFile, 'covers');
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'Gagal mengunggah gambar.' }, 400);
      }
    }

    updateManuscriptContent(id, {
      title,
      abstract,
      keywords: keywords || null,
      category: category || null,
      coverImagePath,
    });

    if (existing.status === 'published') {
      publishManuscript(id);
    }

    return json(
      {
        message: existing.status === 'published' ? 'Artikel diperbarui di web.' : 'Naskah diperbarui.',
        data: getManuscriptById(id),
      },
      200,
    );
  }

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body tidak valid.' }, 400);
  }

  if (body.action === 'unpublish') {
    if (existing.status !== 'published') {
      return json({ error: 'Naskah ini tidak sedang diterbitkan.' }, 400);
    }
    unpublishManuscript(id);
    updateManuscriptStatus(id, 'accepted', existing.admin_notes, user.id);
    return json({ message: 'Publikasi dibatalkan.', data: getManuscriptById(id) }, 200);
  }

  return json({ error: 'Permintaan tidak dikenali.' }, 400);
};

function json(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
