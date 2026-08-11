import { mkdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { db } from '../db/index.ts';
import type { Manuscript, ManuscriptStatus } from './types.ts';

const MANUSCRIPT_ARTICLE_JOIN = `
  LEFT JOIN articles art ON art.id = m.article_id
`;

const MANUSCRIPT_ARTICLE_FIELDS = `,
  art.slug AS article_slug,
  art.views AS article_views
`;

const MANUSCRIPT_SELECT = `
  SELECT m.*,
    u.name AS submitter_name, u.email AS submitter_email,
    r.name AS reviewer_name${MANUSCRIPT_ARTICLE_FIELDS}
  FROM manuscripts m
  JOIN users u ON u.id = m.user_id
  LEFT JOIN users r ON r.id = m.reviewed_by
  ${MANUSCRIPT_ARTICLE_JOIN}
`;

export function createManuscript(data: {
  userId: number;
  title: string;
  abstract: string;
  keywords?: string;
  category?: string;
  authorNotes?: string;
  filePath?: string;
  coverImagePath?: string;
}): Manuscript {
  const result = db
    .prepare(
      `INSERT INTO manuscripts (user_id, title, abstract, keywords, category, author_notes, file_path, cover_image_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      data.userId,
      data.title.trim(),
      data.abstract.trim(),
      data.keywords?.trim() ?? null,
      data.category?.trim() ?? null,
      data.authorNotes?.trim() ?? null,
      data.filePath ?? null,
      data.coverImagePath ?? null,
    );

  return getManuscriptById(Number(result.lastInsertRowid))!;
}

export function getManuscriptById(id: number): Manuscript | undefined {
  return db.prepare(`${MANUSCRIPT_SELECT} WHERE m.id = ?`).get(id) as Manuscript | undefined;
}

export function listManuscriptsByUser(userId: number): Manuscript[] {
  return db
    .prepare(`${MANUSCRIPT_SELECT} WHERE m.user_id = ? ORDER BY m.created_at DESC`)
    .all(userId) as Manuscript[];
}

export function listPublishedManuscriptsByUser(userId: number): Manuscript[] {
  return db
    .prepare(
      `${MANUSCRIPT_SELECT}
       WHERE m.user_id = ? AND m.status = 'published'
       ORDER BY m.updated_at DESC`,
    )
    .all(userId) as Manuscript[];
}

export function countManuscriptsForUser(userId: number): Record<string, number> {
  const rows = db
    .prepare('SELECT status, COUNT(*) AS n FROM manuscripts WHERE user_id = ? GROUP BY status')
    .all(userId) as { status: string; n: number }[];
  const counts: Record<string, number> = {
    pending: 0,
    reviewing: 0,
    revision: 0,
    accepted: 0,
    rejected: 0,
    published: 0,
  };
  for (const row of rows) counts[row.status] = row.n;
  return counts;
}

export function listAllManuscripts(status?: ManuscriptStatus): Manuscript[] {
  if (status) {
    return db
      .prepare(`${MANUSCRIPT_SELECT} WHERE m.status = ? ORDER BY m.created_at DESC`)
      .all(status) as Manuscript[];
  }
  return db
    .prepare(`${MANUSCRIPT_SELECT} ORDER BY m.created_at DESC`)
    .all() as Manuscript[];
}

export function updateManuscriptStatus(
  id: number,
  status: ManuscriptStatus,
  adminNotes: string | null,
  reviewerId: number,
): void {
  db.prepare(
    `UPDATE manuscripts SET status = ?, admin_notes = ?, reviewed_by = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(status, adminNotes, reviewerId, id);
}

export function updateManuscriptContent(
  id: number,
  data: {
    title: string;
    abstract: string;
    keywords?: string | null;
    category?: string | null;
    coverImagePath?: string | null;
  },
): void {
  db.prepare(
    `UPDATE manuscripts SET
      title = ?, abstract = ?, keywords = ?, category = ?,
      cover_image_path = COALESCE(?, cover_image_path),
      updated_at = datetime('now')
     WHERE id = ?`,
  ).run(
    data.title.trim(),
    data.abstract.trim(),
    data.keywords?.trim() ?? null,
    data.category?.trim() ?? null,
    data.coverImagePath ?? null,
    id,
  );
}

export function countManuscriptsByStatus(): Record<string, number> {
  const rows = db
    .prepare('SELECT status, COUNT(*) AS n FROM manuscripts GROUP BY status')
    .all() as { status: string; n: number }[];

  const counts: Record<string, number> = {
    pending: 0,
    reviewing: 0,
    revision: 0,
    accepted: 0,
    rejected: 0,
    published: 0,
  };
  for (const row of rows) counts[row.status] = row.n;
  return counts;
}

export async function saveUploadedFile(file: File): Promise<string> {
  const uploadsDir = join(process.cwd(), 'data', 'uploads', 'manuscripts');
  mkdirSync(uploadsDir, { recursive: true });

  const ext = extname(file.name).toLowerCase();
  const safeExt = ['.doc', '.docx'].includes(ext) ? ext : '.docx';
  const filename = `${Date.now()}-${randomBytes(8).toString('hex')}${safeExt}`;
  const fullPath = join(uploadsDir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  writeFileSync(fullPath, buffer);

  return `uploads/manuscripts/${filename}`;
}
