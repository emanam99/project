# Instalasi Backend WA

Backend ini memakai **whatsapp-web.js** (Puppeteer) — Chromium/Chrome dipakai untuk membuka WhatsApp Web. Chromium **bukan** penyebab error EBUSY; EBUSY terjadi karena **folder `node_modules`/`puppeteer` sedang dipakai proses lain**.

---

## 1. Penyebab error EBUSY (bukan karena Chromium belum terpasang)

Error **EBUSY** / "resource busy or locked" artinya **ada proses yang masih memakai folder** (biasanya `node_modules\puppeteer`):

- Proses **Node** yang menjalankan server WA (`npm run dev`).
- Proses **Chrome/Chromium** yang diluncurkan Puppeteer (sisa jalan dari tes sebelumnya).

**Yang perlu dilakukan:**

1. Tutup **semua terminal** yang menjalankan `npm run dev` atau `node server.js` di folder `wa`.
2. Buka **Task Manager** (Ctrl+Shift+Esc) → **Processes**:
   - Akhiri **Node.js JavaScript Runtime** (yang dari project ini).
   - Akhiri **Chrome** atau **Chromium** yang diluncurkan oleh WA.
3. Buka **terminal baru** dan jalankan:
   ```bash
   cd c:\xampp\htdocs\wa
   npm run reinstall
   ```
   Atau manual:
   ```bash
   rmdir /s /q node_modules
   del package-lock.json
   npm install
   ```
4. Jika masih EBUSY, **restart PC** lalu jalankan lagi `npm install` di folder `wa`.

---

## 2. Chromium ikut terinstall (otomatis + skrip)

- **Saat `npm install` berhasil**, Puppeteer (dependency whatsapp-web.js) akan **otomatis mengunduh Chromium** lewat script postinstall (biasanya ke cache user, mis. `~/.cache/puppeteer` atau di dalam `node_modules`).
- Jika Chromium belum ada (mis. install pertama gagal di tengah jalan), jalankan sekali:
  ```bash
  cd c:\xampp\htdocs\wa
  npm run ensure-browser
  ```
  Skrip ini akan memicu unduhan Chromium (sekali saja, ~150–300 MB) sehingga backend WA siap pakai.

**Menggunakan Chrome yang sudah terpasang di PC (opsional):**

- Set environment variable sebelum menjalankan server:
  - Windows (CMD): `set PUPPETEER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe`
  - Windows (PowerShell): `$env:PUPPETEER_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"`
- Lalu: `npm run dev`
- Dengan ini Puppeteer memakai Chrome sistem dan tidak perlu mengunduh Chromium.

---

## 3. Setelah instalasi

```bash
cd c:\xampp\htdocs\wa
npm run dev
```

Lalu di browser: buka UWABA → **Kelola Koneksi WA** → **Hubungkan** → scan QR.

---

## 4. WhatsApp Business — Terputus setelah scan QR

Jika **WhatsApp biasa** bisa login tapi **WhatsApp Business** langsung "Terputus" setelah scan:

1. **Pakai library terbaru dari GitHub**  
   Di `package.json` sudah diset: `"whatsapp-web.js": "github:pedroslopez/whatsapp-web.js#main"`  
   Lalu jalankan:
   ```bash
   rm -rf node_modules package-lock.json   # atau di Windows: rmdir /s /q node_modules & del package-lock.json
   npm install
   ```

2. **Di HP (akun Business):**
   - Update **WhatsApp Business** ke versi terbaru.
   - Buka **Pengaturan → Perangkat tertaut** (Linked devices).
   - Jika sudah ada 4 perangkat, **log out** salah satu (atau yang lama tidak dipakai), lalu scan QR lagi dari UWABA.

3. **Satu backend = satu akun**  
   Jika sebelumnya pernah login dengan nomor biasa, klik **Logout (hapus sesi)** di halaman Kelola Koneksi WA, lalu **Hubungkan** lagi dan scan QR dengan akun Business.

4. **Puppeteer & User-Agent**  
   Di controller sudah ditambah argumen Puppeteer dan User-Agent yang mendukung sesi WhatsApp Web/Business; tidak perlu diubah kecuali ada masalah spesifik.

---

## 5. Hostinger shared hosting (Node.js) — batasan penting

**Puppeteer / headless Chrome tidak didukung di Hostinger shared hosting.**

- Shared hosting umumnya:
  - Tidak mengizinkan menjalankan browser (Chromium/Chrome).
  - Tidak menyediakan dependensi yang dibutuhkan (lib, display, dll.).
  - Membatasi proses dan resource sehingga proses browser tidak dijamin jalan.
- Dukungan headless (Puppeteer/Selenium) biasanya hanya di **VPS / Dedicated** (termasuk Hostinger VPS).

**Opsi jika mau deploy:**

1. **Hostinger VPS** (atau VPS lain): install Node.js + dependency seperti biasa, jalankan backend WA seperti di PC; Chromium bisa diunduh dengan `npm run ensure-browser` (lingkungan Linux).
2. **Tetap pakai shared hanya untuk situs/PHP**: jalankan **backend WA di tempat lain** (PC kantor, VPS, atau layanan yang mendukung Node + Puppeteer), lalu dari Hostinger (PHP/uwaba) panggil API backend WA lewat URL (mis. `VITE_WA_BACKEND_URL` di frontend).
3. **Layanan pihak ketiga**: gunakan layanan WhatsApp API resmi (atau proxy yang mendukung headless) dan sesuaikan backend agar memakai API tersebut, tanpa Puppeteer di shared hosting.

Ringkasnya: **backend WA (whatsapp-web.js + Puppeteer) sebaiknya dijalankan di VPS atau server yang mendukung Node.js + browser, bukan di shared hosting.**

---

## 6. QR terus muncul / tidak bisa login / sesi tidak tersimpan

Jika setiap kali buka halaman atau restart server **selalu muncul QR baru** padahal sudah pernah scan:

1. **Jangan klik "Hubungkan" berkali-kali**  
   Saat status "Menghubungkan..." atau QR sudah tampil, **jangan** klik Hubungkan lagi. Satu client sedang memulihkan sesi dari disk atau menunggu scan; kalau di-interrupt, sesi bisa gagal tersimpan. Cukup **tunggu** sampai status jadi "Terhubung" atau scan satu QR.

2. **Setelah scan QR, tunggu 1–2 menit**  
   Sesi disimpan ke disk setelah "Authenticated". Jangan matikan server atau putus koneksi segera setelah scan; biarkan sampai status "Terhubung" dan tunggu sebentar agar file session selesai ditulis.

3. **Restart server sekali saja setelah perbaikan**  
   Matikan server WA (Ctrl+C), jalankan lagi `npm run dev`. Backend akan otomatis memulihkan sesi dari folder `whatsapp-sessions/wwebjs`. Jika sesi valid, status jadi "Terhubung" tanpa QR.

4. **Jika masih selalu QR:**  
   - Cek log terminal: apakah ada `[WA] Auth failure`? Itu artinya WhatsApp menolak sesi (mis. sudah logout dari HP atau perangkat tertaut penuh).  
   - Coba **Logout (hapus sesi)** di halaman Kelola Koneksi WA, lalu **Hubungkan** sekali lagi, scan QR, dan tunggu sampai "Terhubung" + 1–2 menit sebelum menutup/restart server.  
   - Pastikan folder `wa/whatsapp-sessions` tidak dihapus dan punya izin tulis (tidak read-only).
