CREATE TABLE IF NOT EXISTS tahun_ajaran (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tahun_hijri_awal INT NOT NULL,
    label VARCHAR(32) NOT NULL,
    aktif TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tahun_hijri_awal (tahun_hijri_awal)
);

CREATE TABLE IF NOT EXISTS santri___syahriah_wajib (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tahun_ajaran_id INT NOT NULL,
    santri_id INT NOT NULL,
    bulan_hijri TINYINT NOT NULL,
    tahun_hijri INT NOT NULL,
    nominal DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_syahriah_wajib (tahun_ajaran_id, santri_id, bulan_hijri, tahun_hijri),
    FOREIGN KEY (tahun_ajaran_id) REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
    FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE,
    INDEX idx_syahriah_wajib_ta_santri (tahun_ajaran_id, santri_id)
);

CREATE TABLE IF NOT EXISTS santri___syahriah_bayar (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tahun_ajaran_id INT NOT NULL,
    santri_id INT NOT NULL,
    nominal DECIMAL(12,2) NOT NULL,
    tanggal DATE NOT NULL,
    keterangan VARCHAR(255) NULL,
    pengurus_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tahun_ajaran_id) REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
    FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE,
    FOREIGN KEY (pengurus_id) REFERENCES pengurus(id) ON DELETE SET NULL,
    INDEX idx_syahriah_bayar_ta_santri (tahun_ajaran_id, santri_id),
    INDEX idx_syahriah_bayar_tanggal (tanggal)
);

CREATE TABLE IF NOT EXISTS santri___syahriah_alokasi (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bayar_id INT NOT NULL,
    wajib_id INT NOT NULL,
    nominal DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bayar_id) REFERENCES santri___syahriah_bayar(id) ON DELETE CASCADE,
    FOREIGN KEY (wajib_id) REFERENCES santri___syahriah_wajib(id) ON DELETE CASCADE,
    INDEX idx_syahriah_alokasi_bayar (bayar_id),
    INDEX idx_syahriah_alokasi_wajib (wajib_id)
);
