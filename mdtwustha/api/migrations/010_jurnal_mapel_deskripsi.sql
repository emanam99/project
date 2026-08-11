ALTER TABLE kelas___jurnal_mengajar
    ADD COLUMN mapel_id INT NULL AFTER status,
    ADD COLUMN deskripsi TEXT NULL AFTER pelajaran,
    ADD CONSTRAINT fk_jurnal_mapel FOREIGN KEY (mapel_id) REFERENCES mapel(id) ON DELETE SET NULL;
