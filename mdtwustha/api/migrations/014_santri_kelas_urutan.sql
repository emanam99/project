ALTER TABLE santri___kelas
    ADD COLUMN urutan INT NOT NULL DEFAULT 0 AFTER kelas_id;

UPDATE santri___kelas sk
INNER JOIN (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY kelas_id
               ORDER BY CASE WHEN tanggal_selesai IS NULL THEN 0 ELSE 1 END, id ASC
           ) AS rn
    FROM santri___kelas
) ranked ON ranked.id = sk.id
SET sk.urutan = ranked.rn;

ALTER TABLE santri___kelas
    ADD INDEX idx_kelas_urutan (kelas_id, urutan, tanggal_selesai);
