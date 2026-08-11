import { db } from '../db/index.ts';
import { ensureCategoryByName } from './categories.ts';
import {
  createContributor,
  formatContributorName,
  getPrimaryContributorForManuscript,
  linkManuscriptAuthors,
  splitDisplayName,
  syncArticleContributors,
} from './contributors.ts';
import { mediaUrl } from './uploads.ts';
import { slugify, toParagraphs } from './utils.ts';

const MANUSCRIPT_FOR_PUBLISH = `
  SELECT m.*, u.name AS submitter_name, u.email AS submitter_email
  FROM manuscripts m
  JOIN users u ON u.id = m.user_id
  WHERE m.id = ?
`;

type ManuscriptRow = {
  id: number;
  title: string;
  abstract: string;
  keywords: string | null;
  category: string | null;
  article_id: number | null;
  cover_image_path: string | null;
  submitter_name: string | null;
  submitter_email: string;
};

const DEFAULT_IMAGE = '/icon/icon512.png';

function getManuscriptRow(id: number): ManuscriptRow | undefined {
  return db.prepare(MANUSCRIPT_FOR_PUBLISH).get(id) as ManuscriptRow | undefined;
}

function ensureLegacyAuthor(displayName: string, role?: string): number {
  db.prepare('INSERT OR IGNORE INTO authors (name, role) VALUES (?, ?)').run(displayName, role ?? 'Penulis');
  return (db.prepare('SELECT id FROM authors WHERE name = ?').get(displayName) as { id: number }).id;
}

function slugTaken(slug: string, excludeId?: number): boolean {
  const row = excludeId
    ? db.prepare('SELECT id FROM articles WHERE slug = ? AND id != ?').get(slug, excludeId)
    : db.prepare('SELECT id FROM articles WHERE slug = ?').get(slug);
  return !!row;
}

function uniqueArticleSlug(title: string, excludeId?: number): string {
  let base = slugify(title);
  if (!base) base = 'artikel';
  let slug = base;
  let n = 1;
  while (slugTaken(slug, excludeId)) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

function estimateReadTime(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(3, Math.ceil(words / 200));
  return `${minutes} min read`;
}

function buildArticleContent(m: ManuscriptRow): string {
  const abstractParts = toParagraphs(m.abstract);
  const parts = [abstractParts.join('\n\n')];
  if (m.keywords) {
    parts.push(`Kata kunci: ${m.keywords.trim()}.`);
  }
  parts.push(
    'Naskah lengkap dalam format Word tersedia melalui jurnal TRI_LEADCLASS. Untuk informasi lebih lanjut, hubungi redaksi.',
  );
  return parts.join('\n\n');
}

function resolveArticleImage(m: ManuscriptRow): string {
  const url = mediaUrl(m.cover_image_path);
  return url ?? DEFAULT_IMAGE;
}

/** Backfill penulis dari akun pengirim bila naskah lama belum punya data penulis. */
function ensureManuscriptContributors(m: ManuscriptRow): void {
  const hasAuthors = db
    .prepare('SELECT 1 FROM manuscript_authors WHERE manuscript_id = ? LIMIT 1')
    .get(m.id);
  if (hasAuthors) return;

  const userRow = db
    .prepare('SELECT id, email, name, picture FROM users WHERE id = (SELECT user_id FROM manuscripts WHERE id = ?)')
    .get(m.id) as { id: number; email: string; name: string | null; picture: string | null } | undefined;
  if (!userRow) return;

  const split = splitDisplayName(userRow.name);
  const contributor = createContributor({
    user_id: userRow.id,
    first_name: split.first || userRow.email.split('@')[0],
    last_name: split.last,
    email: userRow.email,
    phone: '-',
    google_picture: userRow.picture,
  });
  linkManuscriptAuthors(m.id, [{ id: contributor.id, sort_order: 0, is_primary: true }]);
}

/** Terbitkan naskah ke tabel articles agar muncul di web utama. */
export function publishManuscript(manuscriptId: number): number {
  const m = getManuscriptRow(manuscriptId);
  if (!m) throw new Error('Naskah tidak ditemukan.');

  ensureManuscriptContributors(m);

  const primary = getPrimaryContributorForManuscript(manuscriptId);
  const authorName = primary
    ? formatContributorName(primary)
    : m.submitter_name?.trim() || m.submitter_email || 'Penulis';
  const authorId = ensureLegacyAuthor(authorName, primary?.position_status ?? 'Penulis');
  const contributorId = primary?.id ?? null;
  const category = m.category ? ensureCategoryByName(m.category) : undefined;
  const abstractPlain = toParagraphs(m.abstract).join(' ');
  const excerpt =
    abstractPlain.length > 280 ? `${abstractPlain.slice(0, 277).trim()}…` : abstractPlain;
  const content = buildArticleContent(m);
  const readTime = estimateReadTime(m.abstract);
  const publishedAt = new Date().toISOString().slice(0, 10);
  const image = resolveArticleImage(m);

  if (m.article_id) {
    const slug = uniqueArticleSlug(m.title, m.article_id);
    db.prepare(
      `UPDATE articles SET
        slug = ?, title = ?, excerpt = ?, content = ?, image = ?, read_time = ?,
        category_id = ?, author_id = ?, contributor_id = ?, published_at = ?
       WHERE id = ?`,
    ).run(
      slug,
      m.title.trim(),
      excerpt,
      content,
      image,
      readTime,
      category?.id ?? null,
      authorId,
      contributorId,
      publishedAt,
      m.article_id,
    );
    syncArticleContributors(m.article_id, manuscriptId);
    return m.article_id;
  }

  const slug = uniqueArticleSlug(m.title);
  const result = db
    .prepare(
      `INSERT INTO articles (slug, title, excerpt, content, image, read_time, featured, category_id, author_id, contributor_id, published_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    )
    .run(
      slug,
      m.title.trim(),
      excerpt,
      content,
      image,
      readTime,
      category?.id ?? null,
      authorId,
      contributorId,
      publishedAt,
    );

  const articleId = Number(result.lastInsertRowid);
  db.prepare('UPDATE manuscripts SET article_id = ? WHERE id = ?').run(articleId, manuscriptId);
  syncArticleContributors(articleId, manuscriptId);
  return articleId;
}

/** Cabut artikel dari web saat status naskah bukan published. */
export function unpublishManuscript(manuscriptId: number): void {
  const m = getManuscriptRow(manuscriptId);
  if (!m?.article_id) return;

  db.prepare('DELETE FROM article_contributors WHERE article_id = ?').run(m.article_id);
  db.prepare('DELETE FROM articles WHERE id = ?').run(m.article_id);
  db.prepare('UPDATE manuscripts SET article_id = NULL WHERE id = ?').run(manuscriptId);
}

/** Sinkronkan status published → artikel di web. */
export function applyManuscriptPublication(id: number, prevStatus: string, nextStatus: string): void {
  if (nextStatus === 'published') {
    publishManuscript(id);
  } else if (prevStatus === 'published') {
    unpublishManuscript(id);
  }
}

/** Backfill naskah published yang belum punya artikel. */
export function syncPublishedManuscripts(): number {
  const rows = db
    .prepare(
      `SELECT id FROM manuscripts WHERE status = 'published' AND (article_id IS NULL OR article_id = 0)`,
    )
    .all() as { id: number }[];

  for (const row of rows) {
    publishManuscript(row.id);
  }
  return rows.length;
}

/** Perbarui artikel published yang sudah ada (mis. setelah migrasi penulis). */
export function republishAllManuscriptArticles(): number {
  const rows = db
    .prepare(`SELECT id FROM manuscripts WHERE status = 'published' AND article_id IS NOT NULL`)
    .all() as { id: number }[];
  for (const row of rows) {
    publishManuscript(row.id);
  }
  return rows.length;
}
