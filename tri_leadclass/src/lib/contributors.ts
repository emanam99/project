import { db } from '../db/index.ts';
import type { Contributor, UserAuthorProfile } from './types.ts';
import {
  getPersonProfileByEmail,
  getPersonProfileByUserId,
  normalizePersonEmail,
  personProfileToUserAuthorProfile,
  syncPersonProfileToLinkedRecords,
  upsertPersonProfile,
  updatePersonProfileAdmin,
} from './person-profiles.ts';
import { getUserByEmail } from './users.ts';
import { slugify } from './utils.ts';

export interface AuthorInput {
  title_prefix?: string;
  first_name: string;
  middle_name?: string;
  last_name?: string;
  title_suffix?: string;
  id_number?: string;
  email: string;
  phone: string;
  institution?: string;
  position_status?: string;
  photo_path?: string | null;
  google_picture?: string | null;
}

export function formatContributorName(c: Pick<
  Contributor,
  'title_prefix' | 'first_name' | 'middle_name' | 'last_name' | 'title_suffix'
>): string {
  const parts = [
    c.title_prefix?.trim(),
    c.first_name?.trim(),
    c.middle_name?.trim(),
    c.last_name?.trim(),
  ].filter(Boolean);
  let name = parts.join(' ');
  const suffix = c.title_suffix?.trim();
  if (suffix) name += `, ${suffix}`;
  return name || 'Penulis';
}

export function getContributorPhoto(c: Contributor): string | null {
  if (c.photo_path) return c.photo_path;
  return c.google_picture;
}

function slugExists(slug: string, excludeId?: number): boolean {
  const row = excludeId
    ? db.prepare('SELECT id FROM contributors WHERE slug = ? AND id != ?').get(slug, excludeId)
    : db.prepare('SELECT id FROM contributors WHERE slug = ?').get(slug);
  return !!row;
}

function uniqueContributorSlug(first: string, last: string, email: string, excludeId?: number): string {
  const base = slugify(`${first}-${last || email.split('@')[0]}`) || 'penulis';
  let slug = base;
  let n = 1;
  while (slugExists(slug, excludeId)) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

export function getUserAuthorProfile(userId: number): UserAuthorProfile | undefined {
  const profile = getPersonProfileByUserId(userId);
  if (!profile) return undefined;
  return personProfileToUserAuthorProfile(userId, profile);
}

export function upsertUserAuthorProfile(
  userId: number,
  data: Omit<AuthorInput, 'email' | 'google_picture'> & { photo_path?: string | null },
): void {
  const user = db.prepare('SELECT email, picture FROM users WHERE id = ?').get(userId) as
    | { email: string; picture: string | null }
    | undefined;
  if (!user) throw new Error('Pengguna tidak ditemukan.');

  upsertPersonProfile(user.email, data, { userId, google_picture: user.picture });
}

export function createContributor(
  data: AuthorInput & { user_id?: number | null },
): Contributor {
  const email = normalizePersonEmail(data.email);
  upsertPersonProfile(email, data, {
    userId: data.user_id ?? getUserByEmail(email)?.id ?? null,
    google_picture: data.google_picture ?? null,
  });
  const profile = getPersonProfileByEmail(email)!;

  const slug = uniqueContributorSlug(profile.first_name, profile.last_name ?? '', email);
  const result = db
    .prepare(
      `INSERT INTO contributors
        (user_id, slug, title_prefix, first_name, middle_name, last_name, title_suffix,
         id_number, email, phone, institution, position_status, photo_path, google_picture)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      profile.user_id,
      slug,
      profile.title_prefix,
      profile.first_name,
      profile.middle_name,
      profile.last_name,
      profile.title_suffix,
      profile.id_number,
      email,
      profile.phone,
      profile.institution,
      profile.position_status,
      profile.photo_path,
      profile.google_picture,
    );
  return getContributorById(Number(result.lastInsertRowid))!;
}

export function getContributorById(id: number): Contributor | undefined {
  return db.prepare('SELECT * FROM contributors WHERE id = ?').get(id) as Contributor | undefined;
}

export function getContributorBySlug(slug: string): Contributor | undefined {
  return db.prepare('SELECT * FROM contributors WHERE slug = ?').get(slug) as Contributor | undefined;
}

export function linkManuscriptAuthors(
  manuscriptId: number,
  contributors: { id: number; sort_order: number; is_primary: boolean }[],
): void {
  db.prepare('DELETE FROM manuscript_authors WHERE manuscript_id = ?').run(manuscriptId);
  const insert = db.prepare(
    `INSERT INTO manuscript_authors (manuscript_id, contributor_id, sort_order, is_primary)
     VALUES (?, ?, ?, ?)`,
  );
  for (const c of contributors) {
    insert.run(manuscriptId, c.id, c.sort_order, c.is_primary ? 1 : 0);
  }
}

export function getManuscriptContributors(manuscriptId: number): (Contributor & { sort_order: number; is_primary: number })[] {
  return db
    .prepare(
      `SELECT c.*, ma.sort_order, ma.is_primary
       FROM manuscript_authors ma
       JOIN contributors c ON c.id = ma.contributor_id
       WHERE ma.manuscript_id = ?
       ORDER BY ma.sort_order`,
    )
    .all(manuscriptId) as (Contributor & { sort_order: number; is_primary: number })[];
}

export function listPublishedContributors(): Contributor[] {
  return db
    .prepare(
      `SELECT DISTINCT c.*
       FROM contributors c
       JOIN article_contributors ac ON ac.contributor_id = c.id
       JOIN articles a ON a.id = ac.article_id
       ORDER BY c.first_name, c.last_name`,
    )
    .all() as Contributor[];
}

export function getArticlesByContributor(contributorId: number) {
  return db
    .prepare(
      `SELECT a.id, a.slug, a.title, a.excerpt, a.image, a.published_at,
              ac.is_primary, ac.sort_order,
              c.slug AS category_slug, c.name AS category_name
       FROM article_contributors ac
       JOIN articles a ON a.id = ac.article_id
       LEFT JOIN categories c ON c.id = a.category_id
       WHERE ac.contributor_id = ?
       ORDER BY a.published_at DESC`,
    )
    .all(contributorId) as {
    id: number;
    slug: string;
    title: string;
    excerpt: string | null;
    image: string | null;
    published_at: string | null;
    is_primary: number;
    sort_order: number;
    category_slug: string | null;
    category_name: string | null;
  }[];
}

export function syncArticleContributors(articleId: number, manuscriptId: number): void {
  db.prepare('DELETE FROM article_contributors WHERE article_id = ?').run(articleId);
  const rows = db
    .prepare(
      `SELECT contributor_id, sort_order, is_primary FROM manuscript_authors WHERE manuscript_id = ? ORDER BY sort_order`,
    )
    .all(manuscriptId) as { contributor_id: number; sort_order: number; is_primary: number }[];

  const insert = db.prepare(
    `INSERT INTO article_contributors (article_id, contributor_id, sort_order, is_primary)
     VALUES (?, ?, ?, ?)`,
  );
  for (const row of rows) {
    insert.run(articleId, row.contributor_id, row.sort_order, row.is_primary);
  }
}

export function getPrimaryContributorForManuscript(manuscriptId: number): Contributor | undefined {
  const row = db
    .prepare(
      `SELECT c.* FROM manuscript_authors ma
       JOIN contributors c ON c.id = ma.contributor_id
       WHERE ma.manuscript_id = ? AND ma.is_primary = 1
       LIMIT 1`,
    )
    .get(manuscriptId) as Contributor | undefined;
  return row;
}

export function parseAuthorsJson(raw: string): { primary: AuthorInput; coAuthors: AuthorInput[] } {
  const parsed = JSON.parse(raw) as { primary?: AuthorInput; coAuthors?: AuthorInput[] };
  if (!parsed.primary?.first_name?.trim()) {
    throw new Error('Nama awal penulis utama wajib diisi.');
  }
  if (!parsed.primary.phone?.trim()) {
    throw new Error('Nomor HP penulis utama wajib diisi.');
  }
  const coAuthors = parsed.coAuthors ?? [];
  if (coAuthors.length > 20) {
    throw new Error('Maksimal 20 penulis tambahan.');
  }
  for (let i = 0; i < coAuthors.length; i++) {
    const c = coAuthors[i];
    if (!c.first_name?.trim()) throw new Error(`Penulis ${i + 2}: nama awal wajib.`);
    if (!c.email?.trim()) throw new Error(`Penulis ${i + 2}: email wajib.`);
    if (!c.phone?.trim()) throw new Error(`Penulis ${i + 2}: nomor HP wajib.`);
  }
  return { primary: parsed.primary, coAuthors };
}

/** Pecah nama Google menjadi first/last awal. */
export function splitDisplayName(name: string | null | undefined): { first: string; last: string } {
  if (!name?.trim()) return { first: '', last: '' };
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

export interface AuthorLookup {
  found: boolean;
  complete: boolean;
  locked: boolean;
  user_id: number | null;
  contributor_id: number | null;
  email: string;
  title_prefix: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  title_suffix: string;
  id_number: string;
  phone: string;
  institution: string;
  position_status: string;
  photo_preview: string | null;
}

function profileToLookup(
  base: {
    user_id: number | null;
    contributor_id: number | null;
    email: string;
    title_prefix: string | null;
    first_name: string | null;
    middle_name: string | null;
    last_name: string | null;
    title_suffix: string | null;
    id_number: string | null;
    phone: string | null;
    institution: string | null;
    position_status: string | null;
    photo_path: string | null;
    google_picture: string | null;
  },
  requesterUserId?: number,
): AuthorLookup {
  const complete = !!(base.first_name?.trim() && base.phone?.trim());
  const isOwner = base.user_id != null && base.user_id === requesterUserId;
  const photo = base.photo_path || base.google_picture;
  return {
    found: true,
    complete,
    locked: complete && !isOwner,
    user_id: base.user_id,
    contributor_id: base.contributor_id,
    email: base.email,
    title_prefix: base.title_prefix ?? '',
    first_name: base.first_name ?? '',
    middle_name: base.middle_name ?? '',
    last_name: base.last_name ?? '',
    title_suffix: base.title_suffix ?? '',
    id_number: base.id_number ?? '',
    phone: base.phone ?? '',
    institution: base.institution ?? '',
    position_status: base.position_status ?? '',
    photo_preview: photo,
  };
}

/** Cari profil penulis berdasarkan email (untuk auto-fill co-author). */
export function lookupAuthorByEmail(email: string, requesterUserId?: number): AuthorLookup {
  const normalized = normalizePersonEmail(email);
  const empty: AuthorLookup = {
    found: false,
    complete: false,
    locked: false,
    user_id: null,
    contributor_id: null,
    email: normalized,
    title_prefix: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    title_suffix: '',
    id_number: '',
    phone: '',
    institution: '',
    position_status: '',
    photo_preview: null,
  };
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return empty;

  const profile = getPersonProfileByEmail(normalized);
  const user = getUserByEmail(normalized);
  const contrib = db
    .prepare('SELECT id, user_id FROM contributors WHERE LOWER(email) = ? ORDER BY id DESC LIMIT 1')
    .get(normalized) as { id: number; user_id: number | null } | undefined;

  if (profile) {
    return profileToLookup(
      {
        user_id: user?.id ?? profile.user_id ?? contrib?.user_id ?? null,
        contributor_id: contrib?.id ?? null,
        email: normalized,
        title_prefix: profile.title_prefix,
        first_name: profile.first_name,
        middle_name: profile.middle_name,
        last_name: profile.last_name,
        title_suffix: profile.title_suffix,
        id_number: profile.id_number,
        phone: profile.phone,
        institution: profile.institution,
        position_status: profile.position_status,
        photo_path: profile.photo_path,
        google_picture: profile.google_picture ?? user?.picture ?? null,
      },
      requesterUserId,
    );
  }

  if (user) {
    const split = splitDisplayName(user.name);
    return profileToLookup(
      {
        user_id: user.id,
        contributor_id: contrib?.id ?? null,
        email: normalized,
        title_prefix: null,
        first_name: split.first,
        middle_name: null,
        last_name: split.last,
        title_suffix: null,
        id_number: null,
        phone: '',
        institution: null,
        position_status: null,
        photo_path: null,
        google_picture: user.picture,
      },
      requesterUserId,
    );
  }

  if (contrib) {
    const row = db.prepare('SELECT * FROM contributors WHERE id = ?').get(contrib.id) as Contributor;
    return profileToLookup(
      {
        user_id: row.user_id,
        contributor_id: row.id,
        email: row.email,
        title_prefix: row.title_prefix,
        first_name: row.first_name,
        middle_name: row.middle_name,
        last_name: row.last_name,
        title_suffix: row.title_suffix,
        id_number: row.id_number,
        phone: row.phone ?? '',
        institution: row.institution,
        position_status: row.position_status,
        photo_path: row.photo_path,
        google_picture: row.google_picture,
      },
      requesterUserId,
    );
  }

  return empty;
}

/** Ambil data penulis dari DB saat submit (co-author terkunci). */
export function resolveAuthorInput(email: string, fallback: AuthorInput, requesterUserId?: number): AuthorInput {
  const lookup = lookupAuthorByEmail(email, requesterUserId);
  if (lookup.complete && lookup.locked) {
    return {
      title_prefix: lookup.title_prefix,
      first_name: lookup.first_name,
      middle_name: lookup.middle_name,
      last_name: lookup.last_name,
      title_suffix: lookup.title_suffix,
      id_number: lookup.id_number,
      email: lookup.email,
      phone: lookup.phone,
      institution: lookup.institution,
      position_status: lookup.position_status,
      photo_path: null,
      google_picture: lookup.photo_preview,
    };
  }
  return fallback;
}

export function getContributorByUserId(userId: number): Contributor | undefined {
  return db
    .prepare('SELECT * FROM contributors WHERE user_id = ? ORDER BY id DESC LIMIT 1')
    .get(userId) as Contributor | undefined;
}

export function listAllContributors(): Contributor[] {
  return db
    .prepare('SELECT * FROM contributors ORDER BY first_name, last_name, id')
    .all() as Contributor[];
}

export function updateContributorAdmin(
  id: number,
  data: AuthorInput,
  photoPath?: string | null,
): Contributor | undefined {
  const existing = getContributorById(id);
  if (!existing) return undefined;

  updatePersonProfileAdmin(
    existing.email,
    {
      title_prefix: data.title_prefix,
      first_name: data.first_name,
      middle_name: data.middle_name,
      last_name: data.last_name,
      title_suffix: data.title_suffix,
      id_number: data.id_number,
      phone: data.phone,
      institution: data.institution,
      position_status: data.position_status,
    },
    photoPath,
  );

  const slug = uniqueContributorSlug(data.first_name, data.last_name ?? '', data.email, id);
  db.prepare('UPDATE contributors SET slug = ? WHERE id = ?').run(slug, id);

  return getContributorById(id);
}

export function updatePersonProfileByEmail(
  originalEmail: string,
  data: AuthorInput,
  photoPath?: string | null,
): void {
  const oldEmail = normalizePersonEmail(originalEmail);
  const newEmail = normalizePersonEmail(data.email);

  if (newEmail !== oldEmail && getPersonProfileByEmail(newEmail)) {
    throw new Error('Email sudah dipakai profil lain.');
  }

  if (newEmail !== oldEmail) {
    const existing = getPersonProfileByEmail(oldEmail);
    if (!existing) throw new Error('Profil tidak ditemukan.');
    upsertPersonProfile(newEmail, {
      title_prefix: data.title_prefix,
      first_name: data.first_name,
      middle_name: data.middle_name,
      last_name: data.last_name,
      title_suffix: data.title_suffix,
      id_number: data.id_number,
      phone: data.phone,
      institution: data.institution,
      position_status: data.position_status,
      photo_path: photoPath ?? existing.photo_path,
    }, { userId: existing.user_id, google_picture: existing.google_picture });
    db.prepare('DELETE FROM person_profiles WHERE email = ?').run(oldEmail);
    db.prepare('UPDATE contributors SET email = ? WHERE LOWER(email) = ?').run(newEmail, oldEmail);
    db.prepare('UPDATE editorial_board_members SET email = ? WHERE LOWER(email) = ?').run(newEmail, oldEmail);
    syncPersonProfileToLinkedRecords(newEmail);
    return;
  }

  updatePersonProfileAdmin(oldEmail, {
    title_prefix: data.title_prefix,
    first_name: data.first_name,
    middle_name: data.middle_name,
    last_name: data.last_name,
    title_suffix: data.title_suffix,
    id_number: data.id_number,
    phone: data.phone,
    institution: data.institution,
    position_status: data.position_status,
  }, photoPath);
}
