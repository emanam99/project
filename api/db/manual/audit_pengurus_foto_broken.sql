-- Audit foto_profil pengurus yang berpotensi broken.
-- Jalankan dari MySQL client yang punya FILE privilege untuk LOAD_FILE.
-- Jika LOAD_FILE tidak diizinkan hosting, pakai query fallback (tanpa cek fisik file).

-- =========================================================
-- 1) KONFIGURASI PATH ABSOLUT FOLDER uploads DI SERVER
-- =========================================================
-- Contoh production Hostinger:
-- SET @uploads_root := '/home/u264984103/domains/alutsmani.id/public_html/api/uploads';
-- Contoh staging:
-- SET @uploads_root := '/home/u264984103/domains/alutsmani.id/public_html/api2/uploads';
SET @uploads_root := '/home/u264984103/domains/alutsmani.id/public_html/api/uploads';

-- =========================================================
-- 2) AUDIT: LIST FOTO PROFIL YANG MISSING SECARA FISIK
-- =========================================================
-- Catatan: LOAD_FILE akan return NULL jika file tidak ada / tidak readable / FILE privilege tidak ada.
SELECT
  p.id,
  p.nama,
  p.nip,
  p.foto_profil,
  CONCAT(@uploads_root, '/', SUBSTRING_INDEX(p.foto_profil, 'uploads/', -1)) AS absolute_path
FROM pengurus p
WHERE p.foto_profil IS NOT NULL
  AND TRIM(p.foto_profil) <> ''
  AND LOWER(TRIM(p.foto_profil)) <> 'null'
  AND LOAD_FILE(CONCAT(@uploads_root, '/', SUBSTRING_INDEX(p.foto_profil, 'uploads/', -1))) IS NULL
ORDER BY p.id;

-- =========================================================
-- 3) FALLBACK AUDIT (TANPA AKSES FILESYSTEM)
-- =========================================================
-- Gunakan ini jika server DB tidak mengizinkan LOAD_FILE.
-- Query ini hanya menampilkan kandidat untuk dicek manual di server.
SELECT
  p.id,
  p.nama,
  p.nip,
  p.foto_profil
FROM pengurus p
WHERE p.foto_profil IS NOT NULL
  AND TRIM(p.foto_profil) <> ''
  AND LOWER(TRIM(p.foto_profil)) <> 'null'
ORDER BY p.id;

-- =========================================================
-- 4) CLEANUP: SET NULL HANYA UNTUK PATH YANG SUDAH DIPASTIKAN MISSING
-- =========================================================
-- AMANKAN DULU: copy hasil SELECT audit ke IN (...) berikut.
-- Contoh dari error browser Anda:
-- UPDATE pengurus
-- SET foto_profil = NULL
-- WHERE foto_profil IN (
--   'uploads/pengurus/16_69e5ab049af104.17347110.jpg',
--   'uploads/pengurus/94_69a875a8171d60.60014316.jpg'
-- );

-- =========================================================
-- 5) VERIFIKASI HASIL CLEANUP
-- =========================================================
-- SELECT id, nama, nip, foto_profil
-- FROM pengurus
-- WHERE id IN (16, 94);
