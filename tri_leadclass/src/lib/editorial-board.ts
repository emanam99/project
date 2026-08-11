import { db } from '../db/index.ts';
import {
  getPersonProfileByEmail,
  getPersonProfileByUserId,
  upsertPersonProfile,
  type PersonProfileInput,
} from './person-profiles.ts';
import { splitDisplayName } from './contributors.ts';
import type { EditorialBoardMember } from './types.ts';
import { getUserByEmail } from './users.ts';
import { slugify } from './utils.ts';

export function formatBoardMemberName(
  m: Pick<
    EditorialBoardMember,
    'title_prefix' | 'first_name' | 'middle_name' | 'last_name' | 'title_suffix'
  >,
): string {
  const parts = [
    m.title_prefix?.trim(),
    m.first_name?.trim(),
    m.middle_name?.trim(),
    m.last_name?.trim(),
  ].filter(Boolean);
  let name = parts.join(' ');
  const suffix = m.title_suffix?.trim();
  if (suffix) name += `, ${suffix}`;
  return name || 'Redaksi';
}

export function getBoardMemberPhoto(m: EditorialBoardMember): string | null {
  return m.photo_path;
}

export function listBoardMembers(): EditorialBoardMember[] {
  return db
    .prepare('SELECT * FROM editorial_board_members ORDER BY sort_order, first_name')
    .all() as EditorialBoardMember[];
}

export function getBoardMemberBySlug(slug: string): EditorialBoardMember | undefined {
  return db
    .prepare('SELECT * FROM editorial_board_members WHERE slug = ?')
    .get(slug) as EditorialBoardMember | undefined;
}

export function getBoardMemberById(id: number): EditorialBoardMember | undefined {
  return db
    .prepare('SELECT * FROM editorial_board_members WHERE id = ?')
    .get(id) as EditorialBoardMember | undefined;
}

function uniqueBoardSlug(first: string, last: string, excludeId?: number): string {
  const base = slugify(`${first}-${last || 'redaksi'}`) || 'redaksi';
  let slug = base;
  let n = 1;
  while (true) {
    const row = excludeId
      ? db.prepare('SELECT id FROM editorial_board_members WHERE slug = ? AND id != ?').get(slug, excludeId)
      : db.prepare('SELECT id FROM editorial_board_members WHERE slug = ?').get(slug);
    if (!row) return slug;
    slug = `${base}-${n++}`;
  }
}

function normalizeEmail(email?: string | null): string | null {
  const e = email?.trim().toLowerCase();
  return e || null;
}

export function assertBoardEmailUnique(email: string | null, excludeId?: number): void {
  if (!email) return;
  const row = excludeId
    ? (db
        .prepare('SELECT id FROM editorial_board_members WHERE LOWER(email) = ? AND id != ?')
        .get(email, excludeId) as { id: number } | undefined)
    : (db.prepare('SELECT id FROM editorial_board_members WHERE LOWER(email) = ?').get(email) as
        | { id: number }
        | undefined);
  if (row) throw new Error('Email sudah dipakai anggota redaksi lain.');
}

export function assertBoardUserUnique(userId: number | null, excludeId?: number): void {
  if (!userId) return;
  const row = excludeId
    ? (db
        .prepare('SELECT id FROM editorial_board_members WHERE user_id = ? AND id != ?')
        .get(userId, excludeId) as { id: number } | undefined)
    : (db.prepare('SELECT id FROM editorial_board_members WHERE user_id = ?').get(userId) as
        | { id: number }
        | undefined);
  if (row) throw new Error('Akun pengguna ini sudah ditautkan ke anggota redaksi lain.');
}

export type BoardEmailLookup = {
  found: boolean;
  email: string;
  user_id: number | null;
  user_name: string | null;
  email_taken: boolean;
  user_taken: boolean;
  can_link: boolean;
  profile: {
    title_prefix: string;
    first_name: string;
    middle_name: string;
    last_name: string;
    title_suffix: string;
    id_number: string;
    phone: string;
    institution: string;
    position_status: string;
    photo_path: string | null;
    google_picture: string | null;
  } | null;
};

/** Cek email pengguna untuk tautkan ke anggota redaksi (tanpa email ganda). */
export function lookupBoardEmailLink(email: string, excludeMemberId?: number): BoardEmailLookup {
  const normalized = normalizeEmail(email) ?? '';
  const empty: BoardEmailLookup = {
    found: false,
    email: normalized,
    user_id: null,
    user_name: null,
    email_taken: false,
    user_taken: false,
    can_link: false,
    profile: null,
  };
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return empty;

  const emailRow = excludeMemberId
    ? (db
        .prepare('SELECT id FROM editorial_board_members WHERE LOWER(email) = ? AND id != ?')
        .get(normalized, excludeMemberId) as { id: number } | undefined)
    : (db.prepare('SELECT id FROM editorial_board_members WHERE LOWER(email) = ?').get(normalized) as
        | { id: number }
        | undefined);

  const user = getUserByEmail(normalized);
  if (!user) {
    return { ...empty, email_taken: !!emailRow, can_link: !emailRow };
  }

  const userRow = excludeMemberId
    ? (db
        .prepare('SELECT id FROM editorial_board_members WHERE user_id = ? AND id != ?')
        .get(user.id, excludeMemberId) as { id: number } | undefined)
    : (db.prepare('SELECT id FROM editorial_board_members WHERE user_id = ?').get(user.id) as
        | { id: number }
        | undefined);

  const profile = getPersonProfileByEmail(normalized) ?? (user ? getPersonProfileByUserId(user.id) : undefined);
  const split = splitDisplayName(user?.name);

  return {
    found: true,
    email: normalized,
    user_id: user?.id ?? profile?.user_id ?? null,
    user_name: user?.name ?? null,
    email_taken: !!emailRow,
    user_taken: !!userRow,
    can_link: !emailRow && !userRow,
    profile: profile
      ? {
          title_prefix: profile.title_prefix ?? '',
          first_name: profile.first_name,
          middle_name: profile.middle_name ?? '',
          last_name: profile.last_name ?? '',
          title_suffix: profile.title_suffix ?? '',
          id_number: profile.id_number ?? '',
          phone: profile.phone ?? '',
          institution: profile.institution ?? '',
          position_status: profile.position_status ?? '',
          photo_path: profile.photo_path,
          google_picture: profile.google_picture ?? user?.picture ?? null,
        }
      : user
        ? {
            title_prefix: '',
            first_name: split.first,
            middle_name: '',
            last_name: split.last,
            title_suffix: '',
            id_number: '',
            phone: '',
            institution: '',
            position_status: '',
            photo_path: null,
            google_picture: user.picture,
          }
        : null,
  };
}

function resolveUserIdFromEmail(email: string | null): number | null {
  if (!email) return null;
  return getUserByEmail(email)?.id ?? null;
}

export type BoardMemberInput = {
  user_id?: number | null;
  editorial_role?: string;
  title_prefix?: string;
  first_name: string;
  middle_name?: string;
  last_name?: string;
  title_suffix?: string;
  id_number?: string;
  email?: string;
  phone?: string;
  institution?: string;
  position_status?: string;
  bio?: string;
  sort_order?: number;
  photo_path?: string | null;
};

function prepareBoardData(data: BoardMemberInput, excludeId?: number) {
  const email = normalizeEmail(data.email);
  const userId = resolveUserIdFromEmail(email);

  assertBoardEmailUnique(email, excludeId);
  assertBoardUserUnique(userId, excludeId);

  return { email, userId };
}

function syncBoardProfile(email: string | null, data: BoardMemberInput, userId: number | null, photoPath?: string | null): void {
  if (!email || !data.first_name?.trim()) return;
  const input: PersonProfileInput = {
    title_prefix: data.title_prefix,
    first_name: data.first_name,
    middle_name: data.middle_name,
    last_name: data.last_name,
    title_suffix: data.title_suffix,
    id_number: data.id_number,
    phone: data.phone?.trim() || '',
    institution: data.institution,
    position_status: data.position_status,
    photo_path: photoPath ?? undefined,
  };
  if (!input.phone) return;
  upsertPersonProfile(email, input, { userId });
}

function pickField(profileVal: string | null | undefined, dataVal?: string | null): string | null {
  const fromProfile = profileVal?.trim();
  if (fromProfile) return fromProfile;
  const fromData = dataVal?.trim();
  return fromData || null;
}

export function createBoardMember(data: BoardMemberInput): EditorialBoardMember {
  const { email, userId } = prepareBoardData(data);
  if (email && data.first_name?.trim() && data.phone?.trim()) {
    syncBoardProfile(email, data, userId, data.photo_path ?? undefined);
  }
  const profile = email ? getPersonProfileByEmail(email) : undefined;
  const slug = uniqueBoardSlug(data.first_name, data.last_name ?? '');
  const sort =
    data.sort_order ??
    ((db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM editorial_board_members').get() as {
      n: number;
    }).n);

  const result = db
    .prepare(
      `INSERT INTO editorial_board_members
        (user_id, slug, sort_order, editorial_role, title_prefix, first_name, middle_name, last_name, title_suffix,
         id_number, email, phone, institution, position_status, photo_path, bio)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      userId,
      slug,
      sort,
      data.editorial_role?.trim() || null,
      pickField(profile?.title_prefix, data.title_prefix),
      profile?.first_name ?? data.first_name.trim(),
      pickField(profile?.middle_name, data.middle_name),
      pickField(profile?.last_name, data.last_name),
      pickField(profile?.title_suffix, data.title_suffix),
      pickField(profile?.id_number, data.id_number),
      email,
      pickField(profile?.phone, data.phone),
      pickField(profile?.institution, data.institution),
      pickField(profile?.position_status, data.position_status),
      profile?.photo_path ?? data.photo_path ?? null,
      data.bio?.trim() || null,
    );
  return getBoardMemberById(Number(result.lastInsertRowid))!;
}

export function updateBoardMember(id: number, data: BoardMemberInput): EditorialBoardMember | undefined {
  const existing = getBoardMemberById(id);
  if (!existing) return undefined;

  const { email, userId } = prepareBoardData(data, id);
  if (email && data.first_name?.trim() && data.phone?.trim()) {
    syncBoardProfile(email, data, userId, data.photo_path ?? undefined);
  }
  const profile = email ? getPersonProfileByEmail(email) : undefined;
  const slug = uniqueBoardSlug(data.first_name, data.last_name ?? '', id);

  db.prepare(
    `UPDATE editorial_board_members SET
      user_id = ?, slug = ?, sort_order = ?, editorial_role = ?, title_prefix = ?, first_name = ?, middle_name = ?,
      last_name = ?, title_suffix = ?, id_number = ?, email = ?, phone = ?, institution = ?,
      position_status = ?, bio = ?,
      photo_path = COALESCE(?, photo_path),
      updated_at = datetime('now')
     WHERE id = ?`,
  ).run(
    userId,
    slug,
    data.sort_order ?? existing.sort_order,
    data.editorial_role?.trim() || null,
    pickField(profile?.title_prefix, data.title_prefix),
    profile?.first_name ?? data.first_name.trim(),
    pickField(profile?.middle_name, data.middle_name),
    pickField(profile?.last_name, data.last_name),
    pickField(profile?.title_suffix, data.title_suffix),
    pickField(profile?.id_number, data.id_number),
    email,
    pickField(profile?.phone, data.phone),
    pickField(profile?.institution, data.institution),
    pickField(profile?.position_status, data.position_status),
    data.bio?.trim() || null,
    profile?.photo_path ?? data.photo_path ?? null,
    id,
  );

  return getBoardMemberById(id);
}

export function deleteBoardMember(id: number): boolean {
  return db.prepare('DELETE FROM editorial_board_members WHERE id = ?').run(id).changes > 0;
}
