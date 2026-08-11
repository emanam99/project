// Skema database web jurnal TRI_LEADCLASS (SQLite).
// Di-inline sebagai string agar ikut ter-bundle ke output produksi (dist).
export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  slug   TEXT NOT NULL UNIQUE,
  name   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS authors (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name   TEXT NOT NULL UNIQUE,
  role   TEXT
);

CREATE TABLE IF NOT EXISTS articles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  excerpt       TEXT,
  content       TEXT,
  image         TEXT,
  read_time     TEXT,
  featured      INTEGER NOT NULL DEFAULT 0,
  views         INTEGER NOT NULL DEFAULT 0,
  category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  author_id     INTEGER REFERENCES authors(id) ON DELETE SET NULL,
  published_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category_id);
CREATE INDEX IF NOT EXISTS idx_articles_author   ON articles(author_id);
CREATE INDEX IF NOT EXISTS idx_articles_featured ON articles(featured);

CREATE TABLE IF NOT EXISTS subscribers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  picture     TEXT,
  google_id   TEXT UNIQUE,
  role        TEXT NOT NULL DEFAULT 'user'
              CHECK(role IN ('super_admin', 'admin', 'user')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS manuscripts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  abstract      TEXT NOT NULL,
  keywords      TEXT,
  category      TEXT,
  author_notes  TEXT,
  file_path     TEXT,
  cover_image_path TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending', 'reviewing', 'revision', 'accepted', 'rejected', 'published')),
  admin_notes   TEXT,
  reviewed_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  article_id    INTEGER REFERENCES articles(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_manuscripts_user   ON manuscripts(user_id);
CREATE INDEX IF NOT EXISTS idx_manuscripts_status ON manuscripts(status);

CREATE TABLE IF NOT EXISTS user_author_profiles (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  title_prefix     TEXT,
  first_name       TEXT,
  middle_name      TEXT,
  last_name        TEXT,
  title_suffix     TEXT,
  id_number        TEXT,
  phone            TEXT,
  institution      TEXT,
  position_status  TEXT,
  photo_path       TEXT,
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS person_profiles (
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

CREATE TABLE IF NOT EXISTS contributors (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  slug             TEXT NOT NULL UNIQUE,
  title_prefix     TEXT,
  first_name       TEXT NOT NULL,
  middle_name      TEXT,
  last_name        TEXT,
  title_suffix     TEXT,
  id_number        TEXT,
  email            TEXT NOT NULL,
  phone            TEXT,
  institution      TEXT,
  position_status  TEXT,
  photo_path       TEXT,
  google_picture   TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contributors_user  ON contributors(user_id);
CREATE INDEX IF NOT EXISTS idx_contributors_email ON contributors(email);
CREATE INDEX IF NOT EXISTS idx_contributors_slug  ON contributors(slug);

CREATE TABLE IF NOT EXISTS manuscript_authors (
  manuscript_id    INTEGER NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
  contributor_id   INTEGER NOT NULL REFERENCES contributors(id) ON DELETE CASCADE,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_primary       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (manuscript_id, contributor_id)
);

CREATE INDEX IF NOT EXISTS idx_manuscript_authors_ms ON manuscript_authors(manuscript_id);

CREATE TABLE IF NOT EXISTS article_contributors (
  article_id       INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  contributor_id   INTEGER NOT NULL REFERENCES contributors(id) ON DELETE CASCADE,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_primary       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (article_id, contributor_id)
);

CREATE INDEX IF NOT EXISTS idx_article_contributors_art ON article_contributors(article_id);
CREATE INDEX IF NOT EXISTS idx_article_contributors_con ON article_contributors(contributor_id);

CREATE TABLE IF NOT EXISTS site_pages (
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

CREATE TABLE IF NOT EXISTS editorial_board_members (
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
`;
