CREATE TABLE IF NOT EXISTS santri___nilai (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kelas_id INT NOT NULL,
    mapel_id INT NOT NULL,
    santri_id INT NOT NULL,
    tanggal_ujian DATE NOT NULL,
    absen CHAR(1) NOT NULL DEFAULT 'H',
    nilai DECIMAL(5,2) NULL,
    idp INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_nilai_kelas_mapel_santri_tgl (kelas_id, mapel_id, santri_id, tanggal_ujian),
    FOREIGN KEY (kelas_id) REFERENCES kelas(id) ON DELETE CASCADE,
    FOREIGN KEY (mapel_id) REFERENCES mapel(id) ON DELETE CASCADE,
    FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE,
    FOREIGN KEY (idp) REFERENCES pengurus(id) ON DELETE SET NULL,
    INDEX idx_nilai_tanggal (tanggal_ujian),
    INDEX idx_nilai_kelas_mapel (kelas_id, mapel_id)
);
