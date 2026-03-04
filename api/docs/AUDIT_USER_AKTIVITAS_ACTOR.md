# Audit: Log Aktivitas User (Kolom Dinamis Aktor + Pendaftaran Tanpa User)

**Tanggal:** 2025-02-26  
**Lingkup:** Migration, UserAktivitasLogger, PendaftaranController (saveBiodata), UserAktivitasController (getList, getMyList, rollback).

---

## 1. Ringkasan: Sudah Aman

- **SQL injection:** Semua input user (filter, parameter log) di-bind sebagai prepared statement; tidak ada konkatenasi string ke SQL.
- **user_id null:** Didukung dengan sengaja (pendaftaran tanpa akun); aktor tetap tercatat lewat `actor_entity_type` + `actor_entity_id` dan `santri_id`.
- **Backward compatibility:** Logger punya fallback INSERT jika kolom `actor_entity_*` atau `santri_id` belum ada (setelah rollback migration).
- **Token JWT:** Payload `user_id` untuk role pengurus = `pengurus.id` (AuthControllerV2); penggunaan sebagai `pengurusId` di Logger dan PendaftaranController konsisten.

---

## 2. Migration

| Aspek | Status | Keterangan |
|-------|--------|------------|
| Urutan kolom | OK | `actor_entity_type`, `actor_entity_id` setelah `santri_id`. |
| Backfill | OK | Baris dengan `pengurus_id` → actor = pengurus; dengan `santri_id` → actor = santri. Jika satu baris punya keduanya (jarang), UPDATE kedua menimpa (actor = santri). |
| down() | OK | Hapus key dulu, lalu kolom. |
| Indeks | OK | `idx_actor_entity (actor_entity_type, actor_entity_id)` untuk filter. |

---

## 3. UserAktivitasLogger

| Aspek | Status | Keterangan |
|-------|--------|------------|
| Parameter baru | OK | `actorEntityType`, `actorEntityId` opsional; pemanggil lama tidak perlu diubah. |
| user_id null | OK | Tidak di-resolve dari pengurus jika hanya actor santri/madrasah; null disimpan. |
| Derive pengurus_id/santri_id | OK | Jika actor = pengurus/santri, kolom lama tetap diisi untuk JOIN tampilan. |
| INSERT fallback | OK | Jika kolom `actor_entity_*` belum ada → INSERT tanpa kolom itu; jika `santri_id` belum ada → INSERT tanpa santri_id. |
| actor_entity_type | OK | Di-trim; tidak divalidasi enum (fleksibel untuk tipe baru, e.g. madrasah/lembaga). Nilai di-bind, aman dari SQL injection. |

---

## 4. PendaftaranController::saveBiodata

| Aspek | Status | Keterangan |
|-------|--------|------------|
| User null (pendaftaran tanpa akun) | OK | `actor_entity_type = 'santri'`, `actor_entity_id = id` santri yang di-create/update; `santri_id` diisi; `user_id` dan `pengurus_id` null. |
| Role santri | OK | Actor = santri + id; santri_id diisi. |
| Role pengurus/admin | OK | `pengurusId` dari `user['user_id']` ( = pengurus.id di JWT); actor = pengurus + id. |
| CREATE dan UPDATE | OK | Keduanya memanggil Logger dengan parameter actor yang sama. |

---

## 5. UserAktivitasController

| Aspek | Status | Keterangan |
|-------|--------|------------|
| getList filter | OK | `actor_entity_type`, `actor_entity_id` dari query params; di-bind, aman. |
| getList SELECT | OK | Menambah `actor_entity_type`, `actor_entity_id`, `madrasah_nama`; JOIN madrasah hanya bila `actor_entity_type = 'madrasah'`. |
| getMyList | OK | Menambah kolom actor di SELECT; filter tetap pengurus/user (santri tidak lihat daftar sendiri di sini kecuali nanti ditambah filter santri_id dari token). |
| rollback | OK | Tidak bergantung pada kolom actor; baca `id, action, entity_type, entity_id, old_data, new_data` saja. |
| Batas limit/offset | OK | limit cap 100/500, offset (int). |

---

## 6. Pemanggil UserAktivitasLogger Lain

Semua pemanggil lain memakai signature lama (tanpa `actorEntityType`/`actorEntityId`). Mereka tetap menulis `pengurus_id` dan/atau `santri_id`; kolom `actor_entity_*` akan null untuk baris lama dan baris baru dari controller lain. Itu konsisten; nanti bisa di-backfill atau dibiarkan. Tidak ada perubahan breaking.

---

## 7. Rekomendasi (Opsional)

1. **getMyList untuk role santri:** Jika santri login dan punya `santri_id` di token, bisa tambah filter:  
   `OR (a.actor_entity_type = 'santri' AND a.actor_entity_id = ?)` agar santri melihat aktivitas sendiri.
2. **Validasi actor_entity_type:** Jika ingin membatasi nilai (mis. hanya pengurus/santri/madrasah), bisa whitelist di Logger atau di getList; saat ini sengaja dibiarkan fleksibel.
3. **Setelah rollback migration:** getList/getMyList akan error jika kolom `actor_entity_*` tidak ada. Logger sudah aman (fallback INSERT). Jika perlu, bisa tambah try/catch di getList/getMyList dan fallback SELECT tanpa kolom actor.

---

## 8. Kesimpulan

Implementasi **sudah aman** untuk dipakai: SQL aman, null user_id dan pendaftaran tanpa akun tercatat dengan benar, backward compatibility terjaga, dan konsisten dengan JWT (pengurus.id = user_id).
