import type { APIRoute } from 'astro';
import { readFileSync, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { isAdminRole } from '../../../lib/users.ts';

export const prerender = false;

// GET /api/files/manuscripts/... (hanya admin)
export const GET: APIRoute = ({ params, locals }) => {
  const user = locals.user;
  if (!user || !isAdminRole(user.role)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const rel = params.path ?? '';
  const safe = normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = join(process.cwd(), 'data', 'uploads', safe);

  if (!fullPath.startsWith(join(process.cwd(), 'data', 'uploads')) || !existsSync(fullPath)) {
    return new Response('File tidak ditemukan', { status: 404 });
  }

  const buffer = readFileSync(fullPath);
  const ext = safe.split('.').pop()?.toLowerCase();
  const mime =
    ext === 'pdf'
      ? 'application/pdf'
      : ext === 'doc'
        ? 'application/msword'
        : ext === 'docx'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/octet-stream';

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${safe.split('/').pop()}"`,
    },
  });
};
