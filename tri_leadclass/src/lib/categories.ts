import { db } from '../db/index.ts';
import type { Category } from './types.ts';
import { slugify } from './utils.ts';

export function getAllCategories(): Category[] {
  return db.prepare('SELECT id, slug, name FROM categories ORDER BY name').all() as Category[];
}

export function listCategoriesWithStats(): (Category & { article_count: number })[] {
  return db
    .prepare(
      `SELECT c.id, c.slug, c.name, COUNT(a.id) AS article_count
       FROM categories c
       LEFT JOIN articles a ON a.category_id = c.id
       GROUP BY c.id
       ORDER BY c.name`,
    )
    .all() as (Category & { article_count: number })[];
}

export function getCategoryById(id: number): Category | undefined {
  return db.prepare('SELECT id, slug, name FROM categories WHERE id = ?').get(id) as
    | Category
    | undefined;
}

export function getCategoryBySlug(slug: string): Category | undefined {
  return db.prepare('SELECT id, slug, name FROM categories WHERE slug = ?').get(slug) as
    | Category
    | undefined;
}

export function getCategoryByName(name: string): Category | undefined {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  return db
    .prepare('SELECT id, slug, name FROM categories WHERE LOWER(name) = LOWER(?)')
    .get(trimmed) as Category | undefined;
}

function slugExists(slug: string, excludeId?: number): boolean {
  const row = excludeId
    ? db.prepare('SELECT id FROM categories WHERE slug = ? AND id != ?').get(slug, excludeId)
    : db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug);
  return !!row;
}

function uniqueCategorySlug(name: string, excludeId?: number): string {
  let base = slugify(name);
  if (!base) base = 'kategori';
  let slug = base;
  let n = 1;
  while (slugExists(slug, excludeId)) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

export function createCategory(name: string): Category {
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    throw new Error('Nama kategori minimal 2 karakter.');
  }

  const existing = getCategoryByName(trimmed);
  if (existing) {
    throw new Error('Kategori dengan nama tersebut sudah ada.');
  }

  const slug = uniqueCategorySlug(trimmed);
  const result = db.prepare('INSERT INTO categories (slug, name) VALUES (?, ?)').run(slug, trimmed);
  return getCategoryById(Number(result.lastInsertRowid))!;
}

export function updateCategory(id: number, name: string): Category {
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    throw new Error('Nama kategori minimal 2 karakter.');
  }

  const current = getCategoryById(id);
  if (!current) {
    throw new Error('Kategori tidak ditemukan.');
  }

  const duplicate = db
    .prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND id != ?')
    .get(trimmed, id);
  if (duplicate) {
    throw new Error('Nama kategori sudah dipakai.');
  }

  const slug = uniqueCategorySlug(trimmed, id);
  db.prepare('UPDATE categories SET slug = ?, name = ? WHERE id = ?').run(slug, trimmed, id);
  return getCategoryById(id)!;
}

/** Buat kategori bila belum ada (saat publikasi naskah). */
export function ensureCategoryByName(name: string): Category | undefined {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  const found = getCategoryByName(trimmed);
  if (found) return found;
  return createCategory(trimmed);
}

export function countArticlesInCategory(id: number): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM articles WHERE category_id = ?')
    .get(id) as { n: number };
  return row.n;
}
