import { db } from '../db/index.ts';
import type { Article } from './types.ts';
import { getAllCategories, getCategoryBySlug } from './categories.ts';

export { getAllCategories, getCategoryBySlug };

const ARTICLE_SELECT = `
  SELECT
    a.id, a.slug, a.title, a.excerpt, a.content, a.image, a.read_time,
    a.featured, a.views, a.published_at, a.created_at,
    c.slug AS category_slug, c.name AS category_name,
    au.name AS author_name, au.role AS author_role
  FROM articles a
  LEFT JOIN categories c ON c.id = a.category_id
  LEFT JOIN authors au ON au.id = a.author_id
`;

export function getFeaturedArticle(): Article | undefined {
  return db
    .prepare(`${ARTICLE_SELECT} WHERE a.featured = 1 ORDER BY a.published_at DESC LIMIT 1`)
    .get() as Article | undefined;
}

export function getLatestArticles(limit = 3, excludeId?: number): Article[] {
  if (excludeId) {
    return db
      .prepare(`${ARTICLE_SELECT} WHERE a.id != ? ORDER BY a.published_at DESC LIMIT ?`)
      .all(excludeId, limit) as Article[];
  }
  return db
    .prepare(`${ARTICLE_SELECT} ORDER BY a.published_at DESC LIMIT ?`)
    .all(limit) as Article[];
}

export function getMostViewedArticles(limit = 4): Article[] {
  return db
    .prepare(`${ARTICLE_SELECT} ORDER BY a.views DESC, a.published_at DESC LIMIT ?`)
    .all(limit) as Article[];
}

export function getArticleBySlug(slug: string): Article | undefined {
  return db.prepare(`${ARTICLE_SELECT} WHERE a.slug = ?`).get(slug) as Article | undefined;
}

export function getArticlesByCategory(categorySlug: string): Article[] {
  return db
    .prepare(`${ARTICLE_SELECT} WHERE c.slug = ? ORDER BY a.published_at DESC`)
    .all(categorySlug) as Article[];
}

export function listArticles(limit = 50, offset = 0): Article[] {
  return db
    .prepare(`${ARTICLE_SELECT} ORDER BY a.published_at DESC LIMIT ? OFFSET ?`)
    .all(limit, offset) as Article[];
}

export function searchArticles(query: string, limit = 30): Article[] {
  const term = `%${query.trim()}%`;
  return db
    .prepare(
      `${ARTICLE_SELECT}
       WHERE a.title LIKE ? OR a.excerpt LIKE ? OR a.content LIKE ? OR au.name LIKE ?
       ORDER BY a.published_at DESC LIMIT ?`,
    )
    .all(term, term, term, term, limit) as Article[];
}

export function incrementViews(id: number): void {
  db.prepare('UPDATE articles SET views = views + 1 WHERE id = ?').run(id);
}

export function addSubscriber(email: string): 'created' | 'exists' {
  const existing = db.prepare('SELECT id FROM subscribers WHERE email = ?').get(email);
  if (existing) return 'exists';
  db.prepare('INSERT INTO subscribers (email) VALUES (?)').run(email);
  return 'created';
}
