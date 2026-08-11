import type BetterSqlite3 from 'better-sqlite3';
import { slugify } from '../lib/utils.ts';

type DB = BetterSqlite3.Database;

function ensureMeta(db: DB): void {
  db.exec(`CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
}

function done(db: DB, key: string): boolean {
  ensureMeta(db);
  return !!db.prepare('SELECT 1 FROM app_meta WHERE key = ?').get(key);
}

function mark(db: DB, key: string): void {
  ensureMeta(db);
  db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(
    key,
    new Date().toISOString(),
  );
}

const PAGES: {
  slug: string;
  title: string;
  section: 'journal' | 'policy';
  excerpt: string;
  content: string;
  sort_order: number;
}[] = [
  {
    slug: 'arsip-volume',
    title: 'Arsip Volume',
    section: 'journal',
    excerpt: 'Arsip terbitan TRI_LEADCLASS Journal per volume.',
    sort_order: 1,
    content: `TRI_LEADCLASS Journal menerbitkan artikel ilmiah dalam ruang lingkup Manajemen Pendidikan Islam.

Arsip volume akan diperbarui seiring artikel baru diterbitkan. Setiap volume mencakup kumpulan artikel hasil seleksi dan review editorial.

Untuk mencari artikel tertentu, gunakan fitur Telusuri di beranda jurnal atau filter berdasarkan kategori.`,
  },
  {
    slug: 'edisi-khusus-mpi',
    title: 'Edisi Khusus MPI',
    section: 'journal',
    excerpt: 'Panggilan artikel dan edisi tematik Manajemen Pendidikan Islam.',
    sort_order: 2,
    content: `Edisi khusus TRI_LEADCLASS Journal difokuskan pada tema aktual dalam Manajemen Pendidikan Islam (MPI).

Informasi panggilan artikel (call for papers), tenggat pengiriman, dan ruang lingkup edisi tematik akan diumumkan melalui kanal resmi jurnal.

Penulis dapat mengajukan naskah melalui Portal Penulis setelah edisi khusus dibuka.`,
  },
  {
    slug: 'panduan-penulis',
    title: 'Panduan Penulis',
    section: 'journal',
    excerpt: 'Pedoman penyiapan dan pengiriman naskah ilmiah.',
    sort_order: 3,
    content: `Panduan penulis TRI_LEADCLASS Journal:

1. Login dengan akun Google melalui Portal Penulis.
2. Lengkapi profil penulis (nama, afiliasi, kontak).
3. Siapkan naskah dalam format Word (.doc atau .docx).
4. Isi abstrak, kata kunci, kategori, dan daftar penulis (maks. 20 co-author).
5. Unggah naskah dan pantau status review di dashboard.

Naskah yang diterima akan melalui proses review internal sebelum diterbitkan sebagai artikel terbuka (open access).`,
  },
  {
    slug: 'akses-terbuka',
    title: 'Akses Terbuka (Open Access)',
    section: 'policy',
    excerpt: 'Kebijakan publikasi terbuka TRI_LEADCLASS Journal.',
    sort_order: 1,
    content: `TRI_LEADCLASS Journal menerapkan kebijakan akses terbuka (open access).

Artikel yang diterbitkan dapat diakses, dibaca, dan diunduh secara gratis oleh publik tanpa biaya langganan.

Penulis retain hak cipta atas karya mereka sesuai lisensi yang berlaku. Penggunaan ulang wajib mencantumkan atribusi kepada jurnal dan penulis.`,
  },
  {
    slug: 'etika-publikasi',
    title: 'Etika Publikasi (COPE)',
    section: 'policy',
    excerpt: 'Standar etika publikasi ilmiah yang kami pegang.',
    sort_order: 2,
    content: `TRI_LEADCLASS Journal berkomitmen pada prinsip etika publikasi ilmiah, selaras dengan pedoman Committee on Publication Ethics (COPE).

Prinsip utama:
• Orisinalitas dan bebas plagiarisme
• Transparansi konflik kepentingan
• Proses review yang adil dan anonim bila diperlukan
• Koreksi, retract, atau klarifikasi bila ditemukan kesalahan substantif

Pelanggaran etika dapat mengakibatkan penolakan naskah atau pencabutan artikel.`,
  },
  {
    slug: 'pernyataan-plagiarisme',
    title: 'Pernyataan Plagiarisme',
    section: 'policy',
    excerpt: 'Kebijakan zero-tolerance terhadap plagiarisme.',
    sort_order: 3,
    content: `TRI_LEADCLASS Journal menerapkan kebijakan zero-tolerance terhadap plagiarisme.

Setiap naskah yang diajukan harus merupakan karya orisinal penulis. Kutipan dan parafrase wajib disertai referensi yang benar.

Naskah dapat diperiksa dengan software deteksi kemiripan teks. Naskah terindikasi plagiarisme akan ditolak atau dicabut dari publikasi.

Dengan mengirim naskah, penulis menyatakan bahwa karya tersebut belum pernah dipublikasikan di tempat lain tanpa persetujuan editorial.`,
  },
  {
    slug: 'kontak-bantuan',
    title: 'Kontak & Bantuan',
    section: 'policy',
    excerpt: 'Hubungi redaksi TRI_LEADCLASS Journal.',
    sort_order: 4,
    content: `Butuh bantuan terkait pengiriman naskah, status review, atau publikasi?

Instagram: @tri_leadclass

Departemen Manajemen Pendidikan Islam
Universitas At-Taqwa · Angkatan ke-3 · Kelas B

Untuk pertanyaan teknis Portal Penulis, pastikan Anda login dengan akun Google yang terdaftar.`,
  },
];

const BOARD: {
  first_name: string;
  middle_name?: string;
  last_name?: string;
  editorial_role?: string;
  sort_order: number;
}[] = [
  { first_name: 'Miftahul', last_name: 'Anam', editorial_role: 'Ketua', sort_order: 1 },
  { first_name: 'Ningsih', editorial_role: 'Sekretaris', sort_order: 2 },
  { first_name: 'Shofiatul', last_name: 'Wahdaniya', editorial_role: 'Bendahara', sort_order: 3 },
  {
    first_name: 'Siti',
    middle_name: 'Aisyatul',
    last_name: 'Arifah',
    editorial_role: 'Editor',
    sort_order: 4,
  },
];

/** Perbarui jabatan redaksi bawaan bila DB sudah terisi versi lama. */
export function syncDefaultBoardRoles(db: DB): void {
  const key = 'sync_board_roles_v1';
  if (done(db, key)) return;
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='editorial_board_members'").get()) {
    return;
  }

  const updates: { slug: string; editorial_role: string; sort_order: number }[] = BOARD.map((m) => ({
    slug: slugify([m.first_name, m.middle_name, m.last_name].filter(Boolean).join('-')) || 'redaksi',
    editorial_role: m.editorial_role ?? '',
    sort_order: m.sort_order,
  }));

  const stmt = db.prepare(
    `UPDATE editorial_board_members SET editorial_role = ?, sort_order = ?, updated_at = datetime('now') WHERE slug = ?`,
  );

  const run = db.transaction(() => {
    for (const u of updates) {
      stmt.run(u.editorial_role, u.sort_order, u.slug);
    }
  });
  run();
  mark(db, key);
}

export function seedSiteContent(db: DB): void {
  const key = 'seed_site_content_v1';
  if (done(db, key)) return;

  const insertPage = db.prepare(
    `INSERT OR IGNORE INTO site_pages (slug, title, section, excerpt, content, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  const insertBoard = db.prepare(
    `INSERT OR IGNORE INTO editorial_board_members
      (slug, sort_order, editorial_role, first_name, middle_name, last_name, institution)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const run = db.transaction(() => {
    for (const p of PAGES) {
      insertPage.run(p.slug, p.title, p.section, p.excerpt, p.content, p.sort_order);
    }
    for (const m of BOARD) {
      const slug =
        slugify([m.first_name, m.middle_name, m.last_name].filter(Boolean).join('-')) || 'redaksi';
      insertBoard.run(
        slug,
        m.sort_order,
        m.editorial_role ?? null,
        m.first_name,
        m.middle_name ?? null,
        m.last_name ?? null,
        'Universitas At-Taqwa',
      );
    }
  });

  run();
  mark(db, key);
  console.log('[db] Konten halaman jurnal & dewan redaksi awal diisi.');
}
