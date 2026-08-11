import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SCHEMA_SQL } from './schema.ts';
import { seedIfEmpty, runDemoContentMigration } from './seed-core.ts';
import { seedSiteContent, syncDefaultBoardRoles } from './site-content-seed.ts';
import { ensureSuperAdmin } from './auth-seed.ts';
import { slugify } from '../lib/utils.ts';

// Path DB berbasis direktori kerja (process.cwd()) agar konsisten baik saat
// dev, seed, maupun produksi (`node ./dist/server/entry.mjs` dari root proyek).
const dbPath = resolve(process.cwd(), process.env.DATABASE_PATH ?? 'data/journal.db');

// Pastikan folder database & unggahan naskah ada.
mkdirSync(dirname(dbPath), { recursive: true });
mkdirSync(resolve(process.cwd(), 'data', 'uploads', 'manuscripts'), { recursive: true });
mkdirSync(resolve(process.cwd(), 'data', 'uploads', 'covers'), { recursive: true });
mkdirSync(resolve(process.cwd(), 'data', 'uploads', 'photos'), { recursive: true });

// Singleton koneksi (hindari membuka ulang saat hot-reload dev).
const globalForDb = globalThis as unknown as { __journalDb?: Database.Database };

function tableExists(database: Database.Database, name: string): boolean {
  return !!database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
}

function runMigrations(database: Database.Database): void {
  const mCols = database.prepare('PRAGMA table_info(manuscripts)').all() as { name: string }[];
  if (!mCols.some((c) => c.name === 'article_id')) {
    database.exec(
      'ALTER TABLE manuscripts ADD COLUMN article_id INTEGER REFERENCES articles(id) ON DELETE SET NULL',
    );
  }
  if (!mCols.some((c) => c.name === 'cover_image_path')) {
    database.exec('ALTER TABLE manuscripts ADD COLUMN cover_image_path TEXT');
  }

  const aCols = database.prepare('PRAGMA table_info(articles)').all() as { name: string }[];
  if (!aCols.some((c) => c.name === 'contributor_id')) {
    database.exec(
      'ALTER TABLE articles ADD COLUMN contributor_id INTEGER REFERENCES contributors(id) ON DELETE SET NULL',
    );
  }

  if (!tableExists(database, 'site_pages')) {
    database.exec(`
      CREATE TABLE site_pages (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        slug        TEXT NOT NULL UNIQUE,
        title       TEXT NOT NULL,
        section     TEXT NOT NULL CHECK(section IN ('journal', 'policy')),
        excerpt     TEXT,
        content     TEXT NOT NULL DEFAULT '',
        sort_order  INTEGER NOT NULL DEFAULT 0,
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_site_pages_section ON site_pages(section);
    `);
  }

  if (!tableExists(database, 'editorial_board_members')) {
    database.exec(`
      CREATE TABLE editorial_board_members (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
        slug             TEXT NOT NULL UNIQUE,
        sort_order       INTEGER NOT NULL DEFAULT 0,
        editorial_role   TEXT,
        title_prefix     TEXT,
        first_name       TEXT NOT NULL,
        middle_name      TEXT,
        last_name        TEXT,
        title_suffix     TEXT,
        id_number        TEXT,
        email            TEXT,
        phone            TEXT,
        institution      TEXT,
        position_status  TEXT,
        photo_path       TEXT,
        bio              TEXT,
        created_at       TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_editorial_board_sort ON editorial_board_members(sort_order);
    `);
  }

  const boardCols = tableExists(database, 'editorial_board_members')
    ? (database.prepare('PRAGMA table_info(editorial_board_members)').all() as { name: string }[])
    : [];

  if (tableExists(database, 'editorial_board_members') && !boardCols.some((c) => c.name === 'user_id')) {
    database.exec(
      'ALTER TABLE editorial_board_members ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL',
    );
  }

  if (tableExists(database, 'editorial_board_members')) {
    database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_editorial_board_email ON editorial_board_members(LOWER(email)) WHERE email IS NOT NULL AND TRIM(email) != '';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_editorial_board_user ON editorial_board_members(user_id) WHERE user_id IS NOT NULL;
    `);
  }

  migratePersonProfiles(database);
}

type ProfileSeed = {
  email: string;
  user_id: number | null;
  title_prefix: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  title_suffix: string | null;
  id_number: string | null;
  phone: string | null;
  institution: string | null;
  position_status: string | null;
  photo_path: string | null;
  google_picture: string | null;
  slug: string | null;
};

function pickBetterProfile(current: ProfileSeed | undefined, next: ProfileSeed): ProfileSeed {
  if (!current) return next;
  const score = (p: ProfileSeed) =>
    (p.first_name?.trim() ? 2 : 0) +
    (p.phone?.trim() ? 2 : 0) +
    (p.photo_path ? 1 : 0) +
    (p.institution ? 1 : 0);
  const merged: ProfileSeed = score(next) > score(current) ? { ...current, ...next } : { ...next, ...current };
  merged.email = next.email;
  merged.user_id = merged.user_id ?? next.user_id ?? current.user_id;
  merged.slug = merged.slug ?? next.slug ?? current.slug;
  merged.photo_path = merged.photo_path ?? next.photo_path ?? current.photo_path;
  merged.google_picture = merged.google_picture ?? next.google_picture ?? current.google_picture;
  return merged;
}

function migratePersonProfiles(database: Database.Database): void {
  if (!tableExists(database, 'person_profiles')) {
    database.exec(`
      CREATE TABLE person_profiles (
        email            TEXT PRIMARY KEY,
        user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
        slug             TEXT NOT NULL UNIQUE,
        title_prefix     TEXT,
        first_name       TEXT NOT NULL,
        middle_name      TEXT,
        last_name        TEXT,
        title_suffix     TEXT,
        id_number        TEXT,
        phone            TEXT,
        institution      TEXT,
        position_status  TEXT,
        photo_path       TEXT,
        google_picture   TEXT,
        updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_person_profiles_user ON person_profiles(user_id);
    `);
  }

  const count = database.prepare('SELECT COUNT(*) AS n FROM person_profiles').get() as { n: number };
  if (count.n === 0) {
    seedPersonProfilesFromLegacy(database);
  } else {
    backfillMissingPersonProfiles(database);
  }
}

function seedPersonProfilesFromLegacy(database: Database.Database): void {
  const byEmail = new Map<string, ProfileSeed>();

  const userRows = database
    .prepare(
      `SELECT u.id AS user_id, LOWER(u.email) AS email, u.picture AS google_picture,
              p.title_prefix, p.first_name, p.middle_name, p.last_name, p.title_suffix,
              p.id_number, p.phone, p.institution, p.position_status, p.photo_path
       FROM users u
       LEFT JOIN user_author_profiles p ON p.user_id = u.id
       WHERE TRIM(u.email) != ''`,
    )
    .all() as ProfileSeed[];

  for (const row of userRows) {
    if (!row.email) continue;
    byEmail.set(
      row.email,
      pickBetterProfile(byEmail.get(row.email), {
        ...row,
        email: row.email,
        slug: null,
        first_name: row.first_name?.trim() || 'Penulis',
        phone: row.phone,
      }),
    );
  }

  const contributorRows = database
    .prepare(`SELECT * FROM contributors WHERE TRIM(email) != ''`)
    .all() as Array<ProfileSeed & { slug: string }>;

  for (const row of contributorRows) {
    const email = row.email.trim().toLowerCase();
    byEmail.set(
      email,
      pickBetterProfile(byEmail.get(email), {
        email,
        user_id: row.user_id ?? null,
        title_prefix: row.title_prefix,
        first_name: row.first_name?.trim() || 'Penulis',
        middle_name: row.middle_name,
        last_name: row.last_name,
        title_suffix: row.title_suffix,
        id_number: row.id_number,
        phone: row.phone,
        institution: row.institution,
        position_status: row.position_status,
        photo_path: row.photo_path,
        google_picture: row.google_picture,
        slug: row.slug,
      }),
    );
  }

  const boardRows = database
    .prepare(`SELECT * FROM editorial_board_members WHERE email IS NOT NULL AND TRIM(email) != ''`)
    .all() as Array<ProfileSeed & { slug: string }>;

  for (const row of boardRows) {
    const email = row.email.trim().toLowerCase();
    byEmail.set(
      email,
      pickBetterProfile(byEmail.get(email), {
        email,
        user_id: row.user_id ?? null,
        title_prefix: row.title_prefix,
        first_name: row.first_name?.trim() || 'Redaksi',
        middle_name: row.middle_name,
        last_name: row.last_name,
        title_suffix: row.title_suffix,
        id_number: row.id_number,
        phone: row.phone,
        institution: row.institution,
        position_status: row.position_status,
        photo_path: row.photo_path,
        google_picture: null,
        slug: row.slug,
      }),
    );
  }

  insertPersonProfileRows(database, byEmail);
  syncLegacyRecordsFromSeeds(database, byEmail);
}

function backfillMissingPersonProfiles(database: Database.Database): void {
  const missing = database
    .prepare(
      `SELECT LOWER(c.email) AS email FROM contributors c
       WHERE TRIM(c.email) != ''
         AND NOT EXISTS (SELECT 1 FROM person_profiles p WHERE p.email = LOWER(c.email))
       UNION
       SELECT LOWER(b.email) AS email FROM editorial_board_members b
       WHERE b.email IS NOT NULL AND TRIM(b.email) != ''
         AND NOT EXISTS (SELECT 1 FROM person_profiles p WHERE p.email = LOWER(b.email))`,
    )
    .all() as { email: string }[];

  if (missing.length === 0) return;

  const byEmail = new Map<string, ProfileSeed>();
  for (const { email } of missing) {
    collectProfileSeed(database, byEmail, email);
  }

  insertPersonProfileRows(database, byEmail);
  syncLegacyRecordsFromSeeds(database, byEmail);
}

function collectProfileSeed(database: Database.Database, byEmail: Map<string, ProfileSeed>, email: string): void {
  const userRow = database
    .prepare(
      `SELECT u.id AS user_id, LOWER(u.email) AS email, u.picture AS google_picture,
              p.title_prefix, p.first_name, p.middle_name, p.last_name, p.title_suffix,
              p.id_number, p.phone, p.institution, p.position_status, p.photo_path
       FROM users u
       LEFT JOIN user_author_profiles p ON p.user_id = u.id
       WHERE LOWER(u.email) = ?`,
    )
    .get(email) as ProfileSeed | undefined;

  if (userRow?.email) {
    byEmail.set(email, pickBetterProfile(byEmail.get(email), {
      ...userRow,
      email,
      slug: null,
      first_name: userRow.first_name?.trim() || 'Penulis',
    }));
  }

  const contrib = database
    .prepare(`SELECT * FROM contributors WHERE LOWER(email) = ? ORDER BY id DESC LIMIT 1`)
    .get(email) as (ProfileSeed & { slug: string }) | undefined;

  if (contrib) {
    byEmail.set(email, pickBetterProfile(byEmail.get(email), {
      email,
      user_id: contrib.user_id ?? null,
      title_prefix: contrib.title_prefix,
      first_name: contrib.first_name?.trim() || 'Penulis',
      middle_name: contrib.middle_name,
      last_name: contrib.last_name,
      title_suffix: contrib.title_suffix,
      id_number: contrib.id_number,
      phone: contrib.phone,
      institution: contrib.institution,
      position_status: contrib.position_status,
      photo_path: contrib.photo_path,
      google_picture: contrib.google_picture,
      slug: contrib.slug,
    }));
  }

  const board = database
    .prepare(`SELECT * FROM editorial_board_members WHERE LOWER(email) = ? ORDER BY id DESC LIMIT 1`)
    .get(email) as (ProfileSeed & { slug: string }) | undefined;

  if (board) {
    byEmail.set(email, pickBetterProfile(byEmail.get(email), {
      email,
      user_id: board.user_id ?? null,
      title_prefix: board.title_prefix,
      first_name: board.first_name?.trim() || 'Redaksi',
      middle_name: board.middle_name,
      last_name: board.last_name,
      title_suffix: board.title_suffix,
      id_number: board.id_number,
      phone: board.phone,
      institution: board.institution,
      position_status: board.position_status,
      photo_path: board.photo_path,
      google_picture: null,
      slug: board.slug,
    }));
  }
}

function insertPersonProfileRows(database: Database.Database, byEmail: Map<string, ProfileSeed>): void {
  const insert = database.prepare(
    `INSERT INTO person_profiles
      (email, user_id, slug, title_prefix, first_name, middle_name, last_name, title_suffix,
       id_number, phone, institution, position_status, photo_path, google_picture)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const usedSlugs = new Set(
    (database.prepare('SELECT slug FROM person_profiles').all() as { slug: string }[]).map((r) => r.slug),
  );

  for (const profile of byEmail.values()) {
    let slug =
      profile.slug?.trim() ||
      slugify(`${profile.first_name}-${profile.last_name || profile.email.split('@')[0]}`) ||
      'profil';
    let n = 1;
    while (usedSlugs.has(slug)) {
      slug = `${profile.slug || slugify(profile.first_name) || 'profil'}-${n++}`;
    }
    usedSlugs.add(slug);

    insert.run(
      profile.email,
      profile.user_id,
      slug,
      profile.title_prefix,
      profile.first_name,
      profile.middle_name,
      profile.last_name,
      profile.title_suffix,
      profile.id_number,
      profile.phone,
      profile.institution,
      profile.position_status,
      profile.photo_path,
      profile.google_picture,
    );
  }
}

function syncLegacyRecordsFromSeeds(database: Database.Database, byEmail: Map<string, ProfileSeed>): void {
  for (const profile of byEmail.values()) {
    database.prepare(
      `UPDATE contributors SET
        user_id = COALESCE(?, user_id),
        title_prefix = ?, first_name = ?, middle_name = ?, last_name = ?, title_suffix = ?,
        id_number = ?, phone = ?, institution = ?, position_status = ?,
        photo_path = ?, google_picture = COALESCE(?, google_picture)
       WHERE LOWER(email) = ?`,
    ).run(
      profile.user_id,
      profile.title_prefix,
      profile.first_name,
      profile.middle_name,
      profile.last_name,
      profile.title_suffix,
      profile.id_number,
      profile.phone,
      profile.institution,
      profile.position_status,
      profile.photo_path,
      profile.google_picture,
      profile.email,
    );

    database.prepare(
      `UPDATE editorial_board_members SET
        user_id = COALESCE(?, user_id),
        title_prefix = ?, first_name = ?, middle_name = ?, last_name = ?, title_suffix = ?,
        id_number = ?, phone = ?, institution = ?, position_status = ?,
        photo_path = COALESCE(?, photo_path),
        updated_at = datetime('now')
       WHERE LOWER(email) = ?`,
    ).run(
      profile.user_id,
      profile.title_prefix,
      profile.first_name,
      profile.middle_name,
      profile.last_name,
      profile.title_suffix,
      profile.id_number,
      profile.phone,
      profile.institution,
      profile.position_status,
      profile.photo_path,
      profile.email,
    );
  }
}

function bootstrapDatabase(database: Database.Database): void {
  database.exec(SCHEMA_SQL);
  runMigrations(database);
  runDemoContentMigration(database);
  seedIfEmpty(database);
  seedSiteContent(database);
  syncDefaultBoardRoles(database);
  ensureSuperAdmin(database);
}

function createConnection(): Database.Database {
  const database = new Database(dbPath);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  return database;
}

export const db: Database.Database = globalForDb.__journalDb ?? createConnection();

bootstrapDatabase(db);

if (import.meta.env?.DEV) {
  globalForDb.__journalDb = db;
}

void import('../lib/publish.ts').then(({ syncPublishedManuscripts, republishAllManuscriptArticles }) => {
  const synced = syncPublishedManuscripts();
  if (synced > 0) {
    console.log(`[db] ${synced} naskah published disinkronkan ke artikel.`);
  }
  const repub = republishAllManuscriptArticles();
  if (repub > 0) {
    console.log(`[db] ${repub} artikel diperbarui dari data naskah.`);
  }
});
