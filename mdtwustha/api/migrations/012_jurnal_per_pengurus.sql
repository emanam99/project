-- Izin/sakit per guru; slot mengajar hanya ditutup oleh entri status mengajar
ALTER TABLE kelas___jurnal_mengajar ADD UNIQUE KEY uk_jurnal_kelas_tgl_jam_pengurus (kelas_id, tanggal, jam, pengurus_id);
ALTER TABLE kelas___jurnal_mengajar DROP INDEX uk_jurnal_kelas_tgl_jam;
