CREATE TABLE IF NOT EXISTS santri___absen (
    id INT AUTO_INCREMENT PRIMARY KEY,
    santri_id INT NOT NULL,
    tanggal DATE NOT NULL,
    jam_1 CHAR(1) NOT NULL DEFAULT 'H',
    jam_2 CHAR(1) NOT NULL DEFAULT 'H',
    idp INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_santri_tanggal (santri_id, tanggal),
    FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE,
    FOREIGN KEY (idp) REFERENCES pengurus(id) ON DELETE SET NULL,
    INDEX idx_absen_tanggal (tanggal)
);
