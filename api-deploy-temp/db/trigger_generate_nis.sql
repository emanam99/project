-- NIS tidak lagi diisi oleh trigger. NIS di-generate di PHP (SantriHelper::generateNextNis).
-- Aturan: digit 1 = gender (1 Laki-laki, 2 Perempuan), digit 2-3 = tahun hijriyah (dari tahun ajaran),
--         digit 4-7 = urutan 0001 dst. Contoh: 2470001.
--
-- Jika trigger generate_nis masih ada di database, jalankan baris berikut sekali untuk menghapusnya:

DROP TRIGGER IF EXISTS `generate_nis`;
