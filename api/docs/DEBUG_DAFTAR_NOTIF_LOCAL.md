# Debug: Balasan "Daftar Notifikasi" tidak terkirim (local)

## Kalau log WA cuma "Pesan masuk" + "Forward OK" dan tidak ada balasan

Artinya **PHP tidak memanggil Node** untuk kirim balasan (di log Node tidak akan ada baris `[WA] POST /send to ...`). Cek berurutan:

1. **Log PHP** (XAMPP: `xampp/apache/logs/error.log` atau path `error_log` di php.ini):
   - Ada **`WhatsAppController::incoming saved id=...`**? → Request sampai ke PHP.
   - Ada **`daftar_notif: no reply (handle returned null)`**? → Pesan harus berisi teks **"Daftar Notifikasi"** (boleh ada Nama/NIK di bawah). Kalau cuma "daftar" atau "daftar notif" tanpa "Daftar Notifikasi", tidak akan ada balasan.
   - Ada **`WhatsAppService: daftar_notif kirim via WatZap`**? → Pengaturan notifikasi pakai WatZap, bukan WA server. Untuk balasan Daftar Notifikasi dari Node, atur ke **WA sendiri** (Kelola → Pengaturan notifikasi).
   - Ada **`WA_API_URL/WA_API_KEY tidak diset`**? → Buat/sunting **`api/.env`**: isi **`WA_API_URL=http://127.0.0.1:3001/api/whatsapp/send`** (ganti 3001 jika port Node lain) dan **`WA_API_KEY=rahasia-buat-php`** (sama persis dengan **`wa/.env`**).
   - Ada **`WhatsAppService: daftar_notif POST ke WA server url=...`**? → PHP memang memanggil Node; kalau Node tidak dapat request, cek URL (harus ke mesin/port yang sama dengan server WA yang jalan).

2. **Pastikan `api/.env`** (atau config) punya:
   - **WA_API_URL** = `http://127.0.0.1:3001/api/whatsapp/send` (port sama dengan server WA di `wa/.env` → PORT=3001).
   - **WA_API_KEY** = sama dengan **WA_API_KEY** di **wa/.env**.

3. **Restart Apache** setelah ubah `api/.env` agar env terbaca.

## Alur singkat

1. **User** kirim pesan "Daftar Notifikasi" (+ Nama, NIK) ke nomor WA yang terhubung.
2. **Server WA (Node)** menerima pesan lewat **Puppeteer (whatsapp-web.js)** — karena Anda scan QR di Langkah 1, koneksi aktif ada di Puppeteer. Handler `c.on('message')` di whatsappController.js yang menerima dan forward.
3. Node POST ke **PHP API** `{UWABA_API_BASE_URL}/api/wa/incoming` (atau `.../wa/incoming` jika base berakhiran `/api`).
3. **PHP API** menyimpan pesan, memanggil `DaftarNotifFlow::handle()` → bila cocok, dapat teks balasan → kirim balasan via **WhatsAppService::sendMessage()** ke **server WA** `{WA_API_URL}` (POST /api/whatsapp/send).
4. **Server WA** menerima request kirim dari PHP (POST /send) → mengirim pesan ke user lewat Puppeteer atau Baileys.

## Checklist (tes di local)

### 1. Server WA (Node) jalan dan terhubung

- Di folder `wa/`: `node server.js` atau `npm start`.
- Buka tab Koneksi WA, scan QR sampai status **Terhubung**.
- Saat start, di console harus ada baris: **`Webhook pesan masuk: POST ...`** — itu URL yang dipakai untuk forward pesan ke PHP.

### 2. URL webhook dari Node ke PHP harus benar

- File **`wa/.env`** harus ada dan berisi **`UWABA_API_BASE_URL`**.
- Di **local XAMPP** biasanya:
  - Jika akses API lewat: `http://localhost/htdocs/api/public/...`  
    → set: **`UWABA_API_BASE_URL=http://localhost/htdocs/api/public`**  
    → webhook = `http://localhost/htdocs/api/public/api/wa/incoming`
  - Jika akses API lewat: `http://localhost/api/public/...` (vhost/rewrite)  
    → set: **`UWABA_API_BASE_URL=http://localhost/api/public`**  
    → webhook = `http://localhost/api/public/api/wa/incoming`
- **Tes manual:** dari terminal (atau Postman):
  ```bash
  curl -X POST "http://localhost/htdocs/api/public/api/wa/incoming" -H "Content-Type: application/json" -d "{\"from\":\"6281234567890\",\"message\":\"Daftar Notifikasi\"}"
  ```
  Ganti URL jika base Anda berbeda. Harus dapat response 200 dan di **error_log PHP** ada baris: `WhatsAppController::incoming saved id=...` dan `daftar_notif reply to ...` atau `no reply (handle returned null)`.

### 3. PHP API bisa memanggil Node untuk kirim balasan

- File **`api/.env`** (atau config): **`WA_API_URL`** dan **`WA_API_KEY`** harus di-set.
- Biasanya local:  
  **`WA_API_URL=http://127.0.0.1:3001/api/whatsapp/send`**  
  **`WA_API_KEY`** = sama persis dengan **`WA_API_KEY`** di **`wa/.env`**.
- Pastikan **server WA (Node)** benar-benar jalan di port yang sama dengan yang dipakai di `WA_API_URL` (mis. 3001). **WA_API_URL harus mengarah ke instance Node yang SAMA yang menerima pesan** (yang log-nya "Pesan masuk dari ... Forward OK"). Jika PHP memanggil URL lain (mis. server production), balasan akan dikirim dari server lain dan Anda tidak akan menerima di sesi lokal.

### 4. Tabel dan isi pesan

- Tabel **`daftar_notif_pending`** harus ada (migration sudah dijalankan).
- Pesan dari user harus **mengandung teks "Daftar Notifikasi"** (huruf besar/kecil tidak masalah). Bisa ada spasi di depan.

## Cek log

- **Console server WA (Node):**
  - **`[WA Puppeteer] Pesan masuk dari 62... forward ke API...`** / **`Forward OK`** → Pesan diterima oleh Puppeteer (whatsapp-web.js) dan sudah POST ke PHP. Ini yang dipakai saat Anda login lewat scan QR (Langkah 1).
  - **`[WA Baileys] messages.upsert ...`** / **`Pesan masuk diforward ke API`** → Pesan diterima oleh Baileys (bisa tidak muncul jika yang aktif adalah Puppeteer).
  - **`Gagal forward`** / **`Forward gagal: HTTP ...`** → URL salah / PHP tidak terjangkau.

- **Error log PHP** (XAMPP: `xampp/apache/logs/error.log` atau `php_error_log`):
  - **`WhatsAppController::incoming saved id=...`** → request sampai ke PHP dan pesan tersimpan.
  - **`daftar_notif reply to 62...`** → ada balasan yang akan dikirim.
  - **`daftar_notif: no reply (handle returned null)`** → DaftarNotifFlow tidak menghasilkan balasan (cek isi pesan / tabel).
  - **`DaftarNotifFlow: message does not contain "Daftar Notifikasi"`** → teks pesan tidak cocok.
  - **`DaftarNotifFlow: table daftar_notif_pending does not exist`** → jalankan migration.
  - **`sendMessage result: success=0`** → kirim ke Node gagal (URL/port/API key).

- **Jika "Forward OK" tapi Anda tidak menerima balasan sama sekali:**
  1. Cek **console Node**: apakah muncul **`[WA] POST /send to 62... chatId=...@lid len=...`** setelah Anda kirim pesan?  
     - **Tidak muncul** → PHP tidak memanggil Node (atau memanggil URL/port lain). Pastikan **api/.env** `WA_API_URL` mengarah ke base URL server Node yang sedang jalan (mis. `http://127.0.0.1:3001/api/whatsapp/send`).
  2. **Muncul** tapi **`send via Puppeteer: fail ...`** → kirim ke WA gagal; cek baris **`[WA Puppeteer] sendMessage error chatId=...`** untuk penyebab. Untuk pengirim **@lid**, server sekarang coba `getChatById` dulu lalu kirim lewat chat; jika masih gagal, bisa batasan library/whatsapp.

Dengan log di atas Anda bisa tahu persis di langkah mana alur putus (Node → PHP, PHP handle, atau PHP → Node kirim balasan).

---

## Tabel whatsapp___kontak tetap 0 untuk nomor kanonik (628...)

Kalau setelah selesai flow "Daftar Notifikasi" baris untuk **nomor yang dipakai di aplikasi** (mis. 6282232999921) masih **siap_terima_notif = 0**:

1. **Pesan pertama harus berisi "No WA: 6282232999921"** (dari teks wa.me yang diisi otomatis saat klik "Aktifkan via WhatsApp"). Cek log: **`DaftarNotifFlow: new daftar_notif entry ... nomor_kanonik=628...`** → artinya ter-parse. Kalau muncul **`(pesan tanpa No WA:)`** → buka wa.me lagi dari form (bukan ketik manual) dan kirim pesan yang sudah ada baris No WA.
2. Saat jawab "iya" kedua, cek log: **`DaftarNotifFlow: step 2 setKontakNotif ... nomor_kanonik=628...`** dan **`setKontakNotif juga untuk nomor_kanonik=628...`**. Kalau **nomor_kanonik=null** → pesan pertama tadi tidak mengandung No WA, ulangi dari langkah 1 dengan teks yang benar.
3. **Perbaikan sekali jalan** (aktifkan notif untuk satu nomor lewat SQL):
   ```sql
   UPDATE whatsapp___kontak SET siap_terima_notif = 1, updated_at = NOW() WHERE nomor = '6282232999921';
   ```
   Ganti `6282232999921` dengan nomor yang ingin diaktifkan.

## Nomor berbeda (kirim dari A, No WA: B)

Jika user **mengirim dari nomor A** tapi di pesan tertulis **No WA: B** (nomor biodata):

- Sistem menyimpan **nomor_kanonik = A** pada baris kontak untuk B. Saat **mengirim notifikasi** ke B (dari biodata), **WhatsAppService::resolveDeliveryTarget** mengalihkan kirim ke **A** sehingga pesan sampai di HP yang dipakai user.
- Di Dashboard ada penjelasan singkat: notifikasi dikirim ke nomor yang dipakai saat mendaftar; jika mengaktifkan dari HP/nomor lain, kirim dari nomor yang ingin menerima notifikasi.
