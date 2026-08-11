import type BetterSqlite3 from 'better-sqlite3';
import { ARTICLES, CATEGORIES } from './seed-data.ts';
import { slugify } from '../lib/utils.ts';

type DB = BetterSqlite3.Database;

function ensureMetaTable(db: DB): void {
  db.exec(`CREATE TABLE IF NOT EXISTS app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);
}

function migrationDone(db: DB, key: string): boolean {
  ensureMetaTable(db);
  return !!db.prepare('SELECT 1 FROM app_meta WHERE key = ?').get(key);
}

function markMigration(db: DB, key: string): void {
  ensureMetaTable(db);
  db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(
    key,
    new Date().toISOString(),
  );
}

/** Hapus artikel demo yang tidak terhubung ke naskah published. */
export function purgeDemoArticles(db: DB): number {
  const linked = db
    .prepare(
      `SELECT article_id FROM manuscripts WHERE article_id IS NOT NULL`,
    )
    .all() as { article_id: number }[];
  const keepIds = linked.map((r) => r.article_id);

  if (keepIds.length === 0) {
    return db.prepare('DELETE FROM articles').run().changes;
  }

  const placeholders = keepIds.map(() => '?').join(',');
  return db
    .prepare(`DELETE FROM articles WHERE id NOT IN (${placeholders})`)
    .run(...keepIds).changes;
}

export function runDemoContentMigration(db: DB): void {
  const key = 'purge_demo_articles_v1';
  if (migrationDone(db, key)) return;
  const n = purgeDemoArticles(db);
  markMigration(db, key);
  if (n > 0) console.log(`[db] Artikel demo dihapus: ${n}`);
}

/** Isi kategori awal saja (tanpa artikel template). */
export function seedCategories(db: DB): void {
  const insertCategory = db.prepare(
    'INSERT OR IGNORE INTO categories (slug, name) VALUES (?, ?)',
  );
  const run = db.transaction(() => {
    for (const name of CATEGORIES) {
      insertCategory.run(slugify(name), name);
    }
  });
  run();
}

/** Legacy: seed manual `npm run db:seed` — hanya kategori + artikel seed jika masih ada di seed-data. */
export function seedDatabase(db: DB): number {
  seedCategories(db);

  if (ARTICLES.length === 0) {
    return (db.prepare('SELECT COUNT(*) AS n FROM articles').get() as { n: number }).n;
  }

  const insertAuthor = db.prepare(
    'INSERT OR IGNORE INTO authors (name, role) VALUES (?, ?)',
  );
  const getCategoryId = db.prepare('SELECT id FROM categories WHERE slug = ?');
  const getAuthorId = db.prepare('SELECT id FROM authors WHERE name = ?');

  const insertArticle = db.prepare(`
    INSERT INTO articles
      (slug, title, excerpt, content, image, read_time, featured, category_id, author_id, published_at)
    VALUES
      (@slug, @title, @excerpt, @content, @image, @read_time, @featured, @category_id, @author_id, @published_at)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      excerpt = excluded.excerpt,
      content = excluded.content,
      image = excluded.image,
      read_time = excluded.read_time,
      featured = excluded.featured,
      category_id = excluded.category_id,
      author_id = excluded.author_id,
      published_at = excluded.published_at
  `);

  const run = db.transaction(() => {
    for (const article of ARTICLES) {
      db.prepare('INSERT OR IGNORE INTO categories (slug, name) VALUES (?, ?)').run(
        slugify(article.category),
        article.category,
      );
      insertAuthor.run(article.author, article.authorRole);

      const category = getCategoryId.get(slugify(article.category)) as
        | { id: number }
        | undefined;
      const author = getAuthorId.get(article.author) as { id: number } | undefined;

      insertArticle.run({
        slug: slugify(article.title),
        title: article.title,
        excerpt: article.excerpt,
        content: article.content,
        image: article.image,
        read_time: article.readTime,
        featured: article.featured ? 1 : 0,
        category_id: category?.id ?? null,
        author_id: author?.id ?? null,
        published_at: article.publishedAt,
      });
    }
  });

  run();
  return (db.prepare('SELECT COUNT(*) AS n FROM articles').get() as { n: number }).n;
}

export function seedIfEmpty(db: DB): void {
  const { n: catCount } = db.prepare('SELECT COUNT(*) AS n FROM categories').get() as {
    n: number;
  };
  if (catCount === 0 && CATEGORIES.length > 0) {
    seedCategories(db);
    console.log(`[db] Kategori awal diisi (${CATEGORIES.length}).`);
  }
}
