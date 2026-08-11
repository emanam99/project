import { db } from '../db/index.ts';
import type { SitePage } from './types.ts';

export function getSitePageBySlug(slug: string): SitePage | undefined {
  return db.prepare('SELECT * FROM site_pages WHERE slug = ?').get(slug) as SitePage | undefined;
}

export function listSitePages(section?: SitePage['section']): SitePage[] {
  if (section) {
    return db
      .prepare('SELECT * FROM site_pages WHERE section = ? ORDER BY sort_order, title')
      .all(section) as SitePage[];
  }
  return db
    .prepare('SELECT * FROM site_pages ORDER BY section, sort_order, title')
    .all() as SitePage[];
}

export function updateSitePage(
  id: number,
  data: Pick<SitePage, 'title' | 'excerpt' | 'content'>,
): SitePage | undefined {
  db.prepare(
    `UPDATE site_pages SET title = ?, excerpt = ?, content = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(data.title.trim(), data.excerpt?.trim() || null, data.content, id);
  return db.prepare('SELECT * FROM site_pages WHERE id = ?').get(id) as SitePage | undefined;
}

/** Render teks paragraf (dipisah baris kosong) ke HTML aman. */
export function formatPageContent(content: string): string {
  return content
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
    .join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
