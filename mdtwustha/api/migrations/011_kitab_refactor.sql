CREATE TABLE IF NOT EXISTS kitab (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fan VARCHAR(100) NOT NULL,
    nama VARCHAR(200) NOT NULL DEFAULT '',
    musonnif VARCHAR(200) NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_kitab_fan (fan)
);

INSERT INTO kitab (fan, nama, musonnif)
SELECT fan, kitab, '' FROM mapel ORDER BY id ASC;

ALTER TABLE mapel ADD COLUMN kitab_id INT NULL AFTER id;

UPDATE mapel m
INNER JOIN kitab k ON k.fan = m.fan AND k.nama = m.kitab
SET m.kitab_id = k.id;

UPDATE mapel SET kitab_id = (SELECT MIN(id) FROM kitab) WHERE kitab_id IS NULL;

ALTER TABLE mapel
    DROP COLUMN fan,
    DROP COLUMN kitab,
    MODIFY kitab_id INT NOT NULL,
    ADD CONSTRAINT fk_mapel_kitab FOREIGN KEY (kitab_id) REFERENCES kitab(id) ON DELETE CASCADE;
