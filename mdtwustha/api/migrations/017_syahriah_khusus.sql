CREATE TABLE IF NOT EXISTS santri___syahriah_khusus (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tahun_ajaran_id INT NOT NULL,
    santri_id INT NOT NULL,
    nama VARCHAR(120) NOT NULL,
    terakhir_pembayaran DATE NOT NULL,
    keterangan VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tahun_ajaran_id) REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
    FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE,
    INDEX idx_syahriah_khusus_ta_santri (tahun_ajaran_id, santri_id),
    INDEX idx_syahriah_khusus_deadline (terakhir_pembayaran)
);

CREATE TABLE IF NOT EXISTS santri___syahriah_khusus_bayar (
    id INT AUTO_INCREMENT PRIMARY KEY,
    khusus_id INT NOT NULL,
    tahun_ajaran_id INT NOT NULL,
    santri_id INT NOT NULL,
    nominal DECIMAL(12,2) NOT NULL,
    tanggal DATE NOT NULL,
    keterangan VARCHAR(255) NULL,
    via VARCHAR(16) NULL DEFAULT 'cash',
    pengurus_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (khusus_id) REFERENCES santri___syahriah_khusus(id) ON DELETE CASCADE,
    FOREIGN KEY (tahun_ajaran_id) REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
    FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE,
    FOREIGN KEY (pengurus_id) REFERENCES pengurus(id) ON DELETE SET NULL,
    INDEX idx_syahriah_khusus_bayar_khusus (khusus_id),
    INDEX idx_syahriah_khusus_bayar_ta_santri (tahun_ajaran_id, santri_id)
);
