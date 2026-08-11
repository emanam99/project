import { db } from '../db/index.ts';
import type { User, UserRole } from './types.ts';
import { SUPER_ADMIN_EMAIL } from '../db/auth-seed.ts';

export function getUserById(id: number): User | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
}

export function getUserByEmail(email: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as
    | User
    | undefined;
}

export function getUserByGoogleId(googleId: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId) as User | undefined;
}

export function listUsers(opts?: { role?: UserRole; q?: string; pendingOnly?: boolean }): User[] {
  let sql = 'SELECT * FROM users WHERE 1=1';
  const params: (string | number)[] = [];

  if (opts?.role) {
    sql += ' AND role = ?';
    params.push(opts.role);
  }
  if (opts?.pendingOnly) {
    sql += ' AND google_id IS NULL';
  }
  if (opts?.q) {
    const like = `%${opts.q.trim().toLowerCase()}%`;
    sql += ' AND (LOWER(email) LIKE ? OR LOWER(COALESCE(name, \'\')) LIKE ?)';
    params.push(like, like);
  }

  sql += ' ORDER BY role, email';
  return db.prepare(sql).all(...params) as User[];
}

/** Daftarkan email sebelum login Google — role dipakai saat pertama kali masuk. */
export function grantUserAccess(email: string, role: UserRole): User {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Format email tidak valid.');
  }
  if (normalized === SUPER_ADMIN_EMAIL.toLowerCase()) {
    throw new Error('Email super admin utama sudah otomatis terdaftar.');
  }
  if (role === 'super_admin') {
    throw new Error('Super admin hanya dapat ditetapkan lewat konfigurasi sistem.');
  }

  const existing = getUserByEmail(normalized);
  if (existing) {
    if (existing.role === role) {
      throw new Error('Email sudah terdaftar dengan role yang sama.');
    }
    updateUserRole(existing.id, role);
    return getUserById(existing.id)!;
  }

  const result = db
    .prepare(`INSERT INTO users (email, role) VALUES (?, ?)`)
    .run(normalized, role);

  return getUserById(Number(result.lastInsertRowid))!;
}

export function upsertGoogleUser(data: {
  email: string;
  name: string;
  picture: string;
  googleId: string;
}): User {
  const email = data.email.toLowerCase();
  const existing = getUserByEmail(email);

  if (existing) {
    // Pertahankan role super_admin untuk email yang ditetapkan.
    const role =
      email === SUPER_ADMIN_EMAIL.toLowerCase() ? 'super_admin' : existing.role;

    db.prepare(
      `UPDATE users SET name = ?, picture = ?, google_id = ?, role = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(data.name, data.picture, data.googleId, role, existing.id);

    return getUserById(existing.id)!;
  }

  const role: UserRole = email === SUPER_ADMIN_EMAIL.toLowerCase() ? 'super_admin' : 'user';

  const result = db
    .prepare(
      `INSERT INTO users (email, name, picture, google_id, role) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(email, data.name, data.picture, data.googleId, role);

  return getUserById(Number(result.lastInsertRowid))!;
}

export function updateUserRole(userId: number, role: UserRole): void {
  db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?").run(
    role,
    userId,
  );
}

export function isAdminRole(role: UserRole): boolean {
  return role === 'admin' || role === 'super_admin';
}
