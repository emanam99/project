CREATE TABLE IF NOT EXISTS santri___absen_rekap_publish (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kelas_id INT NOT NULL,
    judul VARCHAR(200) NOT NULL,
    catatan TEXT NULL,
    tanggal_awal DATE NOT NULL,
    tanggal_akhir DATE NOT NULL,
    hijri_awal VARCHAR(40) NULL,
    hijri_akhir VARCHAR(40) NULL,
    publish_at DATETIME NOT NULL,
    published_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (kelas_id) REFERENCES kelas(id) ON DELETE CASCADE,
    FOREIGN KEY (published_by) REFERENCES pengurus(id) ON DELETE SET NULL,
    INDEX idx_rekap_publish_kelas_tgl (kelas_id, tanggal_awal, tanggal_akhir),
    INDEX idx_rekap_publish_at (publish_at)
);

CREATE TABLE IF NOT EXISTS santri___absen_rekap_publish_hari (
    id INT AUTO_INCREMENT PRIMARY KEY,
    publish_id INT NOT NULL,
    kelas_id INT NOT NULL,
    tanggal DATE NOT NULL,
    UNIQUE KEY uk_rekap_kelas_tanggal (kelas_id, tanggal),
    FOREIGN KEY (publish_id) REFERENCES santri___absen_rekap_publish(id) ON DELETE CASCADE,
    FOREIGN KEY (kelas_id) REFERENCES kelas(id) ON DELETE CASCADE,
    INDEX idx_rekap_hari_publish (publish_id)
);

CREATE TABLE IF NOT EXISTS santri___absen_rekap_publish_baris (
    id INT AUTO_INCREMENT PRIMARY KEY,
    publish_id INT NOT NULL,
    santri_id INT NOT NULL,
    nomer_induk VARCHAR(50) NULL,
    nama VARCHAR(100) NOT NULL,
    h INT NOT NULL DEFAULT 0,
    s INT NOT NULL DEFAULT 0,
    i INT NOT NULL DEFAULT 0,
    a INT NOT NULL DEFAULT 0,
    jam1_h INT NOT NULL DEFAULT 0,
    jam1_s INT NOT NULL DEFAULT 0,
    jam1_i INT NOT NULL DEFAULT 0,
    jam1_a INT NOT NULL DEFAULT 0,
    jam2_h INT NOT NULL DEFAULT 0,
    jam2_s INT NOT NULL DEFAULT 0,
    jam2_i INT NOT NULL DEFAULT 0,
    jam2_a INT NOT NULL DEFAULT 0,
    urutan INT NOT NULL DEFAULT 0,
    FOREIGN KEY (publish_id) REFERENCES santri___absen_rekap_publish(id) ON DELETE CASCADE,
    FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE,
    INDEX idx_rekap_baris_publish (publish_id)
);
