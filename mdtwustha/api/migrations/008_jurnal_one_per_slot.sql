-- Satu entri jurnal per kelas + tanggal + jam (bukan per pengurus)
DELETE j1 FROM kelas___jurnal_mengajar j1
INNER JOIN kelas___jurnal_mengajar j2
  ON j1.kelas_id = j2.kelas_id
 AND j1.tanggal = j2.tanggal
 AND j1.jam = j2.jam
 AND j1.id < j2.id;

ALTER TABLE kelas___jurnal_mengajar ADD UNIQUE KEY uk_jurnal_kelas_tgl_jam (kelas_id, tanggal, jam);
ALTER TABLE kelas___jurnal_mengajar DROP INDEX uk_jurnal_kelas_tgl_jam_pengurus;
