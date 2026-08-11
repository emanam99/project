import { mkdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { randomBytes } from 'node:crypto';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

export type UploadFile = {
  name: string;
  size: number;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export function getFormFile(form: FormData, key: string): UploadFile | null {
  const raw = form.get(key);
  if (!raw || typeof raw !== 'object' || !('arrayBuffer' in raw)) return null;
  const f = raw as UploadFile;
  if (typeof f.size !== 'number' || f.size <= 0) return null;
  return f;
}

function extFromName(name: string): string {
  const lower = name.toLowerCase();
  const idx = lower.lastIndexOf('.');
  return idx >= 0 ? lower.slice(idx) : '';
}

export async function saveImageUpload(
  file: UploadFile,
  subdir: 'covers' | 'photos',
): Promise<string> {
  const ext = extFromName(file.name);
  if (!IMAGE_EXT.includes(ext)) {
    throw new Error('Gambar harus JPG, PNG, atau WebP.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Ukuran gambar maksimal 5 MB.');
  }

  const dir = join(process.cwd(), 'data', 'uploads', subdir);
  mkdirSync(dir, { recursive: true });

  const safeExt = ext === '.jpeg' ? '.jpg' : ext;
  const filename = `${Date.now()}-${randomBytes(8).toString('hex')}${safeExt}`;
  writeFileSync(join(dir, filename), Buffer.from(await file.arrayBuffer()));

  return `uploads/${subdir}/${filename}`;
}

/** URL publik untuk file di data/uploads (via /api/media/...). */
export function mediaUrl(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null;
  const rel = relativePath.replace(/^uploads\//, '');
  return `/api/media/${rel}`;
}

export function resolveUploadPath(relativePath: string): string {
  const rel = relativePath.replace(/^uploads\//, '');
  return join(process.cwd(), 'data', 'uploads', rel);
}

export async function saveDocUpload(
  file: UploadFile,
): Promise<string> {
  const ext = extFromName(file.name);
  if (!['.doc', '.docx'].includes(ext)) {
    throw new Error('Hanya file Word (.doc atau .docx) yang diterima.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Ukuran file maksimal 10 MB.');
  }

  const dir = join(process.cwd(), 'data', 'uploads', 'manuscripts');
  mkdirSync(dir, { recursive: true });

  const filename = `${Date.now()}-${randomBytes(8).toString('hex')}${ext}`;
  writeFileSync(join(dir, filename), Buffer.from(await file.arrayBuffer()));
  return `uploads/manuscripts/${filename}`;
}
