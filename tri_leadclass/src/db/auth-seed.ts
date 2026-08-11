import type BetterSqlite3 from 'better-sqlite3';

type DB = BetterSqlite3.Database;

export const SUPER_ADMIN_EMAIL = 'em.anam999@gmail.com';
const LEGACY_SUPER_ADMIN_EMAIL = 'emanam999@gmail.com';

/** Pastikan super admin awal ada (idempoten). Turunkan email lama jika masih super_admin. */
export function ensureSuperAdmin(db: DB): void {
  // Turunkan super admin lama (typo tanpa titik).
  const legacy = db.prepare('SELECT id FROM users WHERE email = ?').get(LEGACY_SUPER_ADMIN_EMAIL) as
    | { id: number }
    | undefined;
  if (legacy) {
    db.prepare("UPDATE users SET role = 'user', updated_at = datetime('now') WHERE id = ?").run(
      legacy.id,
    );
  }

  const existing = db.prepare('SELECT id, role FROM users WHERE email = ?').get(SUPER_ADMIN_EMAIL) as
    | { id: number; role: string }
    | undefined;

  if (existing) {
    if (existing.role !== 'super_admin') {
      db.prepare("UPDATE users SET role = 'super_admin', updated_at = datetime('now') WHERE id = ?").run(
        existing.id,
      );
    }
    return;
  }

  db.prepare(`INSERT INTO users (email, name, role) VALUES (?, ?, 'super_admin')`).run(
    SUPER_ADMIN_EMAIL,
    'Super Admin',
  );
}
