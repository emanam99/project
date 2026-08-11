# Troubleshooting sesi WhatsApp (Baileys) — produksi

Gejala di log container **`wa`** / Node:

- `Bad MAC`
- `No matching sessions found for message`
- `Failed to decrypt` / error signal / prekey
- `bad-request` saat inisialisasi chat (setelah auth sudah “aneh”)

Ini **bukan bug aplikasi PHP**; biasanya **file auth Baileys di volume tidak konsisten** atau **lebih dari satu proses** menulis ke folder session yang sama.

## Penyebab umum

1. **Dua proses satu volume**  
   Contoh: `docker compose up` **dan** `npm start` di host pada direktori yang sama; atau **dua stack** (staging + produksi) memakai **salinan atau bind mount yang sama** ke `whatsapp-sessions`.

2. **Container dihentikan paksa**  
   `docker kill` / OOM / disk penuh saat menulis creds → file auth setengah tertulis.

3. **Restore / copy folder session** dari mesin lain tanpa konsistensi penuh.

## Yang harus dilakukan (urutan)

1. **Pastikan hanya satu penulis**  
   - Satu container `wa` per deployment path (mis. `/var/www/wa`).  
   - **Jangan** jalankan Node WA di host bersamaan dengan container yang mount volume yang sama.

2. **Backup** folder session (jaga-jaga):  
   `tar czf wa-sessions-backup-$(date +%Y%m%d).tgz whatsapp-sessions`

3. **Hentikan** container:  
   `docker compose down`

4. **Bersihkan auth Baileys** untuk slot default (hapus isi folder auth, bukan seluruh `wa` jika tidak perlu):  
   - Path di dalam repo: `wa/whatsapp-sessions/baileys-default/`  
   - Di server: sesuai bind mount `./whatsapp-sessions` → hapus subfolder `baileys-default` (atau rename untuk arsip).

5. **Naikkan** lagi:  
   `docker compose up -d --build`

6. Di **eBeddien / Kelola Koneksi WA**: **Hubungkan lagi** dan **scan QR** sekali.

## Setelah perbaikan di kode (`wa_session_corrupt`)

Backend WA dapat mengembalikan JSON kirim pesan:

```json
{ "success": false, "code": "wa_session_corrupt", "message": "..." }
```

Artinya: **login ulang** setelah langkah di atas; reconnect otomatis **sengaja tidak** dijalankan untuk error kripto agar log tidak spam dan admin tahu harus reset session.

## Docker Compose

File `wa/docker-compose.yml` memakai `stop_grace_period: 45s` agar proses Node sempat menutup koneksi lebih rapi sebelum SIGKILL (mengurangi risiko auth setengah tertulis).

## Masih gagal?

- Cek **satu** reverse proxy / **satu** URL yang dipakai API PHP (`WA_API_URL`) menuju **satu** backend WA.  
- Cek disk VPS (`df -h`) dan RAM.  
- Aktifkan log detail: di `.env` wa set `WA_VERBOSE_LOG=true` (sementara), lalu `docker compose logs -f app`.
