CREATE TABLE IF NOT EXISTS pengurus (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nip VARCHAR(50) NOT NULL UNIQUE,
    nama VARCHAR(100) NOT NULL,
    pw VARCHAR(255),
    jabatan VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS santri (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nomer_induk VARCHAR(50) UNIQUE,
    nama VARCHAR(100) NOT NULL,
    kelas VARCHAR(50),
    kamar VARCHAR(50),
    no_kk VARCHAR(50),
    nik VARCHAR(50),
    tempat_lahir VARCHAR(100),
    tanggal_lahir DATE,
    jenis_kelamin VARCHAR(20),
    dusun VARCHAR(100),
    rt VARCHAR(10),
    rw VARCHAR(10),
    desa VARCHAR(100),
    kecamatan VARCHAR(100),
    kabupaten VARCHAR(100),
    provinsi VARCHAR(100),
    ayah VARCHAR(100),
    ibu VARCHAR(100),
    saudara_di_pesantren VARCHAR(255),
    idp INT,
    FOREIGN KEY (idp) REFERENCES pengurus(id) ON DELETE SET NULL
);

-- Insert default user if no user exists
INSERT IGNORE INTO pengurus (nip, nama, jabatan) VALUES ('12345', 'Admin Utama', 'Admin');
