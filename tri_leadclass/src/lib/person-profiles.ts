import { db } from '../db/index.ts';
import type { UserAuthorProfile } from './types.ts';
import { getUserByEmail, getUserById } from './users.ts';
import { slugify } from './utils.ts';

export type PersonProfileInput = {
  title_prefix?: string;
  first_name: string;
  middle_name?: string;
  last_name?: string;
  title_suffix?: string;
  id_number?: string;
  phone: string;
  institution?: string;
  position_status?: string;
  photo_path?: string | null;
  google_picture?: string | null;
};

export interface PersonProfile {
  email: string;
  user_id: number | null;
  slug: string;
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
  updated_at: string;
}

export interface PersonProfileListItem extends PersonProfile {
  user_name: string | null;
  is_contributor: boolean;
  is_board_member: boolean;
  editorial_role: string | null;
  contributor_slug: string | null;
}

export function normalizePersonEmail(email: string): string {
  return email.trim().toLowerCase();
}

function uniquePersonSlug(first: string, last: string, email: string, excludeEmail?: string): string {
  const base = slugify(`${first}-${last || email.split('@')[0]}`) || 'profil';
  let slug = base;
  let n = 1;
  while (true) {
    const row = excludeEmail
      ? (db
          .prepare('SELECT email FROM person_profiles WHERE slug = ? AND email != ?')
          .get(slug, excludeEmail) as { email: string } | undefined)
      : (db.prepare('SELECT email FROM person_profiles WHERE slug = ?').get(slug) as
          | { email: string }
          | undefined);
    if (!row) return slug;
    slug = `${base}-${n++}`;
  }
}

function trimOrNull(v?: string | null): string | null {
  const t = v?.trim();
  return t || null;
}

export function getPersonProfileByEmail(email: string): PersonProfile | undefined {
  const normalized = normalizePersonEmail(email);
  if (!normalized) return undefined;
  return db.prepare('SELECT * FROM person_profiles WHERE email = ?').get(normalized) as
    | PersonProfile
    | undefined;
}

export function getPersonProfileByUserId(userId: number): PersonProfile | undefined {
  const user = getUserById(userId);
  if (!user) return undefined;
  return getPersonProfileByEmail(user.email);
}

/** Salin biodata ke semua baris contributors & editorial_board_members dengan email sama. */
export function syncPersonProfileToLinkedRecords(email: string): void {
  const normalized = normalizePersonEmail(email);
  const profile = getPersonProfileByEmail(normalized);
  if (!profile) return;

  db.prepare(
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
    normalized,
  );

  db.prepare(
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
    normalized,
  );
}

export function upsertPersonProfile(
  email: string,
  data: PersonProfileInput,
  opts?: { userId?: number | null; google_picture?: string | null },
): PersonProfile {
  const normalized = normalizePersonEmail(email);
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Format email tidak valid.');
  }

  const existing = getPersonProfileByEmail(normalized);
  const userId =
    opts?.userId !== undefined
      ? opts.userId
      : existing?.user_id ?? getUserByEmail(normalized)?.id ?? null;

  const googlePicture =
    opts?.google_picture !== undefined
      ? opts.google_picture
      : existing?.google_picture ?? getUserByEmail(normalized)?.picture ?? null;

  const fields = {
    title_prefix: trimOrNull(data.title_prefix),
    first_name: data.first_name.trim(),
    middle_name: trimOrNull(data.middle_name),
    last_name: trimOrNull(data.last_name),
    title_suffix: trimOrNull(data.title_suffix),
    id_number: trimOrNull(data.id_number),
    phone: data.phone.trim(),
    institution: trimOrNull(data.institution),
    position_status: trimOrNull(data.position_status),
    photo_path: data.photo_path !== undefined ? data.photo_path : existing?.photo_path ?? null,
    google_picture: googlePicture,
  };

  if (existing) {
    db.prepare(
      `UPDATE person_profiles SET
        user_id = ?, title_prefix = ?, first_name = ?, middle_name = ?, last_name = ?, title_suffix = ?,
        id_number = ?, phone = ?, institution = ?, position_status = ?,
        photo_path = COALESCE(?, photo_path),
        google_picture = COALESCE(?, google_picture),
        updated_at = datetime('now')
       WHERE email = ?`,
    ).run(
      userId,
      fields.title_prefix,
      fields.first_name,
      fields.middle_name,
      fields.last_name,
      fields.title_suffix,
      fields.id_number,
      fields.phone,
      fields.institution,
      fields.position_status,
      fields.photo_path,
      fields.google_picture,
      normalized,
    );
  } else {
    const slug = uniquePersonSlug(fields.first_name, fields.last_name ?? '', normalized);
    db.prepare(
      `INSERT INTO person_profiles
        (email, user_id, slug, title_prefix, first_name, middle_name, last_name, title_suffix,
         id_number, phone, institution, position_status, photo_path, google_picture)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      normalized,
      userId,
      slug,
      fields.title_prefix,
      fields.first_name,
      fields.middle_name,
      fields.last_name,
      fields.title_suffix,
      fields.id_number,
      fields.phone,
      fields.institution,
      fields.position_status,
      fields.photo_path,
      fields.google_picture,
    );
  }

  syncPersonProfileToLinkedRecords(normalized);
  return getPersonProfileByEmail(normalized)!;
}

export function updatePersonProfileAdmin(
  email: string,
  data: PersonProfileInput,
  photoPath?: string | null,
): PersonProfile {
  const normalized = normalizePersonEmail(email);
  const existing = getPersonProfileByEmail(normalized);
  if (!existing) throw new Error('Profil tidak ditemukan.');

  return upsertPersonProfile(normalized, {
    ...data,
    photo_path: photoPath !== undefined ? photoPath : existing.photo_path,
    google_picture: existing.google_picture,
  });
}

export function listAllPersonProfiles(): PersonProfileListItem[] {
  return db
    .prepare(
      `SELECT p.*,
              u.name AS user_name,
              EXISTS(SELECT 1 FROM contributors c WHERE LOWER(c.email) = p.email) AS is_contributor,
              EXISTS(SELECT 1 FROM editorial_board_members b WHERE LOWER(b.email) = p.email) AS is_board_member,
              (SELECT b.editorial_role FROM editorial_board_members b WHERE LOWER(b.email) = p.email LIMIT 1) AS editorial_role,
              COALESCE(
                (SELECT c.slug FROM contributors c WHERE LOWER(c.email) = p.email ORDER BY c.id DESC LIMIT 1),
                p.slug
              ) AS contributor_slug
       FROM person_profiles p
       LEFT JOIN users u ON u.id = p.user_id
       ORDER BY p.first_name, p.last_name, p.email`,
    )
    .all()
    .map((row) => ({
      ...(row as PersonProfile & {
        user_name: string | null;
        is_contributor: number;
        is_board_member: number;
        editorial_role: string | null;
        contributor_slug: string | null;
      }),
      is_contributor: !!(row as { is_contributor: number }).is_contributor,
      is_board_member: !!(row as { is_board_member: number }).is_board_member,
    })) as PersonProfileListItem[];
}

/** Konversi ke bentuk lama user_author_profiles (kompatibilitas). */
export function personProfileToUserAuthorProfile(
  userId: number,
  profile: PersonProfile,
): UserAuthorProfile {
  return {
    user_id: userId,
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
    updated_at: profile.updated_at,
  };
}

export function formatPersonName(
  p: Pick<
    PersonProfile,
    'title_prefix' | 'first_name' | 'middle_name' | 'last_name' | 'title_suffix'
  >,
): string {
  const parts = [
    p.title_prefix?.trim(),
    p.first_name?.trim(),
    p.middle_name?.trim(),
    p.last_name?.trim(),
  ].filter(Boolean);
  let name = parts.join(' ');
  const suffix = p.title_suffix?.trim();
  if (suffix) name += `, ${suffix}`;
  return name || 'Profil';
}

export function getPersonPhoto(p: PersonProfile): string | null {
  if (p.photo_path) return p.photo_path;
  return p.google_picture;
}
