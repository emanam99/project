ALTER TABLE pengurus ADD COLUMN akses VARCHAR(20) DEFAULT 'user';
UPDATE pengurus SET akses = 'super_admin';
