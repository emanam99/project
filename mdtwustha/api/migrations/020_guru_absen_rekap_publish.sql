CREATE TABLE IF NOT EXISTS pengurus___absen_rekap_publish (
    id INT AUTO_INCREMENT PRIMARY KEY,
    judul VARCHAR(200) NOT NULL,
    catatan TEXT NULL,
    tanggal_awal DATE NOT NULL,
    tanggal_akhir DATE NOT NULL,
    hijri_awal VARCHAR(40) NULL,
    hijri_akhir VARCHAR(40) NULL,
    publish_at DATETIME NOT NULL,
    published_by INT NULL,
    semua_kelas TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (published_by) REFERENCES pengurus(id) ON DELETE SET NULL,
    INDEX idx_guru_rekap_publish_tgl (tanggal_awal, tanggal_akhir),
    INDEX idx_guru_rekap_publish_at (publish_at)
);

CREATE TABLE IF NOT EXISTS pengurus___absen_rekap_publish_kelas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    publish_id INT NOT NULL,
    kelas_id INT NOT NULL,
    UNIQUE KEY uk_guru_rekap_publish_kelas (publish_id, kelas_id),
    FOREIGN KEY (publish_id) REFERENCES pengurus___absen_rekap_publish(id) ON DELETE CASCADE,
    FOREIGN KEY (kelas_id) REFERENCES kelas(id) ON DELETE CASCADE,
    INDEX idx_guru_rekap_kelas_publish (publish_id)
);

CREATE TABLE IF NOT EXISTS pengurus___absen_rekap_publish_hari (
    id INT AUTO_INCREMENT PRIMARY KEY,
    publish_id INT NOT NULL,
    kelas_id INT NOT NULL,
    tanggal DATE NOT NULL,
    UNIQUE KEY uk_guru_rekap_kelas_tanggal (kelas_id, tanggal),
    FOREIGN KEY (publish_id) REFERENCES pengurus___absen_rekap_publish(id) ON DELETE CASCADE,
    FOREIGN KEY (kelas_id) REFERENCES kelas(id) ON DELETE CASCADE,
    INDEX idx_guru_rekap_hari_publish (publish_id)
);

CREATE TABLE IF NOT EXISTS pengurus___absen_rekap_publish_baris (
    id INT AUTO_INCREMENT PRIMARY KEY,
    publish_id INT NOT NULL,
    pengurus_id INT NOT NULL,
    pengurus_nama VARCHAR(100) NOT NULL,
    mengajar INT NOT NULL DEFAULT 0,
    ijin INT NOT NULL DEFAULT 0,
    sakit INT NOT NULL DEFAULT 0,
    jam1_mengajar INT NOT NULL DEFAULT 0,
    jam1_ijin INT NOT NULL DEFAULT 0,
    jam1_sakit INT NOT NULL DEFAULT 0,
    jam2_mengajar INT NOT NULL DEFAULT 0,
    jam2_ijin INT NOT NULL DEFAULT 0,
    jam2_sakit INT NOT NULL DEFAULT 0,
    urutan INT NOT NULL DEFAULT 0,
    FOREIGN KEY (publish_id) REFERENCES pengurus___absen_rekap_publish(id) ON DELETE CASCADE,
    FOREIGN KEY (pengurus_id) REFERENCES pengurus(id) ON DELETE CASCADE,
    INDEX idx_guru_rekap_baris_publish (publish_id)
);
