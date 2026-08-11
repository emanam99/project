CREATE TABLE IF NOT EXISTS kelas___jurnal_mengajar (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kelas_id INT NOT NULL,
    tanggal DATE NOT NULL,
    jam ENUM('jam_1', 'jam_2') NOT NULL,
    pengurus_id INT NOT NULL,
    status ENUM('mengajar', 'ijin', 'sakit') NOT NULL DEFAULT 'mengajar',
    pelajaran VARCHAR(200) NULL,
    alasan TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_jurnal_kelas_tgl_jam_pengurus (kelas_id, tanggal, jam, pengurus_id),
    FOREIGN KEY (kelas_id) REFERENCES kelas(id) ON DELETE CASCADE,
    FOREIGN KEY (pengurus_id) REFERENCES pengurus(id) ON DELETE CASCADE,
    INDEX idx_jurnal_tanggal (tanggal)
);
