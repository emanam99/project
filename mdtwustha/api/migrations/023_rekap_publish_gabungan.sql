CREATE TABLE IF NOT EXISTS santri___rekap_publish (
    id INT AUTO_INCREMENT PRIMARY KEY,
    judul VARCHAR(200) NOT NULL,
    catatan TEXT NULL,
    nilai_tanggal_awal DATE NOT NULL,
    nilai_tanggal_akhir DATE NOT NULL,
    nilai_hijri_awal VARCHAR(40) NULL,
    nilai_hijri_akhir VARCHAR(40) NULL,
    absen_tanggal_awal DATE NOT NULL,
    absen_tanggal_akhir DATE NOT NULL,
    absen_hijri_awal VARCHAR(40) NULL,
    absen_hijri_akhir VARCHAR(40) NULL,
    tampil_nilai VARCHAR(20) NOT NULL DEFAULT 'nilai',
    publish_at DATETIME NOT NULL,
    published_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (published_by) REFERENCES pengurus(id) ON DELETE SET NULL,
    INDEX idx_rekap_gabung_nilai_tgl (nilai_tanggal_awal, nilai_tanggal_akhir),
    INDEX idx_rekap_gabung_absen_tgl (absen_tanggal_awal, absen_tanggal_akhir),
    INDEX idx_rekap_gabung_publish_at (publish_at)
);

CREATE TABLE IF NOT EXISTS santri___rekap_publish_kelas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    publish_id INT NOT NULL,
    kelas_id INT NOT NULL,
    UNIQUE KEY uk_rekap_gabung_kelas (publish_id, kelas_id),
    FOREIGN KEY (publish_id) REFERENCES santri___rekap_publish(id) ON DELETE CASCADE,
    FOREIGN KEY (kelas_id) REFERENCES kelas(id) ON DELETE CASCADE,
    INDEX idx_rekap_gabung_kelas_pub (publish_id)
);

CREATE TABLE IF NOT EXISTS santri___rekap_publish_hari (
    id INT AUTO_INCREMENT PRIMARY KEY,
    publish_id INT NOT NULL,
    kelas_id INT NOT NULL,
    tanggal DATE NOT NULL,
    UNIQUE KEY uk_rekap_gabung_kelas_tanggal (kelas_id, tanggal),
    FOREIGN KEY (publish_id) REFERENCES santri___rekap_publish(id) ON DELETE CASCADE,
    FOREIGN KEY (kelas_id) REFERENCES kelas(id) ON DELETE CASCADE,
    INDEX idx_rekap_gabung_hari_pub (publish_id)
);

CREATE TABLE IF NOT EXISTS santri___rekap_publish_nilai_mapel (
    id INT AUTO_INCREMENT PRIMARY KEY,
    publish_id INT NOT NULL,
    mapel_id INT NOT NULL,
    fan VARCHAR(100) NOT NULL DEFAULT '',
    kitab_nama VARCHAR(200) NOT NULL DEFAULT '',
    musonnif VARCHAR(200) NOT NULL DEFAULT '',
    dari VARCHAR(100) NOT NULL DEFAULT '',
    sampai VARCHAR(100) NOT NULL DEFAULT '',
    urutan INT NOT NULL DEFAULT 0,
    FOREIGN KEY (publish_id) REFERENCES santri___rekap_publish(id) ON DELETE CASCADE,
    INDEX idx_rekap_gabung_mapel_pub (publish_id)
);

CREATE TABLE IF NOT EXISTS santri___rekap_publish_nilai_baris (
    id INT AUTO_INCREMENT PRIMARY KEY,
    publish_id INT NOT NULL,
    santri_id INT NOT NULL,
    nomer_induk VARCHAR(50) NULL,
    nama VARCHAR(100) NOT NULL,
    kelas_id INT NOT NULL,
    nama_kelas VARCHAR(100) NULL,
    kel VARCHAR(50) NULL,
    urutan INT NOT NULL DEFAULT 0,
    FOREIGN KEY (publish_id) REFERENCES santri___rekap_publish(id) ON DELETE CASCADE,
    FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE,
    FOREIGN KEY (kelas_id) REFERENCES kelas(id) ON DELETE CASCADE,
    INDEX idx_rekap_gabung_nilai_baris_pub (publish_id)
);

CREATE TABLE IF NOT EXISTS santri___rekap_publish_nilai_sel (
    id INT AUTO_INCREMENT PRIMARY KEY,
    publish_id INT NOT NULL,
    baris_id INT NOT NULL,
    mapel_id INT NOT NULL,
    nilai DECIMAL(8,2) NULL,
    absen VARCHAR(5) NULL,
    tanggal DATE NULL,
    FOREIGN KEY (publish_id) REFERENCES santri___rekap_publish(id) ON DELETE CASCADE,
    FOREIGN KEY (baris_id) REFERENCES santri___rekap_publish_nilai_baris(id) ON DELETE CASCADE,
    UNIQUE KEY uk_rekap_gabung_nilai_sel (baris_id, mapel_id),
    INDEX idx_rekap_gabung_nilai_sel_pub (publish_id)
);

CREATE TABLE IF NOT EXISTS santri___rekap_publish_absen_baris (
    id INT AUTO_INCREMENT PRIMARY KEY,
    publish_id INT NOT NULL,
    santri_id INT NOT NULL,
    nomer_induk VARCHAR(50) NULL,
    nama VARCHAR(100) NOT NULL,
    kelas_id INT NOT NULL,
    nama_kelas VARCHAR(100) NULL,
    kel VARCHAR(50) NULL,
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
    FOREIGN KEY (publish_id) REFERENCES santri___rekap_publish(id) ON DELETE CASCADE,
    FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE,
    FOREIGN KEY (kelas_id) REFERENCES kelas(id) ON DELETE CASCADE,
    INDEX idx_rekap_gabung_absen_baris_pub (publish_id)
);
