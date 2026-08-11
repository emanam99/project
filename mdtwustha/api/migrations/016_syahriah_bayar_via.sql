CREATE TABLE IF NOT EXISTS _syahriah_via_placeholder (id INT);
DROP TABLE IF EXISTS _syahriah_via_placeholder;

ALTER TABLE santri___syahriah_bayar
    ADD COLUMN via VARCHAR(16) NULL DEFAULT 'cash' AFTER keterangan;
