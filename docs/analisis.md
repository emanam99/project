# Audit PageSpeed - Rangkuman & Eksekusi Bertahap

## Baseline Temuan

- Unused JavaScript tinggi (estimasi ~416 KiB), main-thread work ~2.0s, long tasks terdeteksi.
- Render-blocking requests, image delivery, dan cache lifetime masih bisa dioptimasi.
- Temuan correctness/SEO: charset dan `robots.txt` invalid (terbaca sebagai HTML).
- Temuan reliability/security: browser console errors, missing source maps, rekomendasi hardening headers.

## Eksekusi Fase 1 (Performance Quick Wins)

- `ebeddien/src/App.jsx`
  - Komponen global berat (`GlobalChatNotifier`, `ChatOffcanvasHost`, `ChatAiOffcanvasHost`) diubah menjadi lazy import dan hanya dirender saat user authenticated.
- `ebeddien/index.html`
  - Font utama tetap critical, font sekunder diubah ke preload-as-style + `noscript` fallback untuk menurunkan render-blocking.
- `ebeddien/src/components/Auth/AuthLeftPanel.jsx`
  - Tambah `width` dan `height` eksplisit pada logo image auth, plus `fetchpriority` pada logo utama.
- `ebeddien/src/main.jsx`
  - Tracking open dipindah ke idle (atau timeout fallback), service worker registration ditunda setelah event `load`, logging dipersempit hanya di dev.

## Eksekusi Fase 2 (SEO/Correctness)

- Tambah file:
  - `ebeddien/public/robots.txt`
  - `daftar/public/robots.txt`
- Update rewrite agar `robots.txt`/`sitemap.xml` tidak ditelan fallback SPA:
  - `ebeddien/public/.htaccess`
  - `daftar/public/.htaccess`
  - `nailul-murod/public/.htaccess`
- Tambah `AddDefaultCharset UTF-8` di `.htaccess` terkait untuk memastikan default charset response.

## Eksekusi Fase 3 (Reliability & Security Baseline)

- Source maps (hidden di production) ditambahkan pada:
  - `ebeddien/vite.config.js`
  - `daftar/vite.config.js`
  - `mybeddien/vite.config.js`
- Baseline security headers ditambahkan di `.htaccess`:
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Frame-Options: SAMEORIGIN`
  - `Cross-Origin-Opener-Policy: same-origin-allow-popups`
  - `Permissions-Policy: geolocation=(), microphone=(), camera=()`
  - `Content-Security-Policy: upgrade-insecure-requests`
  - `Strict-Transport-Security` saat HTTPS aktif

## Fase 4 (Verifikasi & Rollout)

- Lint check pada file yang diubah: tidak ada error.
- Rollout lintas app yang sudah dikerjakan:
  - `ebeddien`: performance + SEO/correctness + security baseline
  - `daftar`: SEO/correctness + security baseline + source maps policy
  - `mybeddien`: source maps policy
  - `nailul-murod`: SEO rewrite exception + security baseline

## Langkah Verifikasi Manual Setelah Deploy

1. Akses:
   - `/robots.txt`
   - `/sitemap.xml` (jika tersedia)
   - pastikan respons bukan HTML SPA.
2. Cek header response HTML:
   - `Content-Type` mengandung `charset=UTF-8`.
3. Jalankan ulang PageSpeed (desktop + mobile) pada route utama.
4. Bandingkan metrik sebelum/sesudah untuk:
   - LCP, TBT, CLS, unused JS, dan render-blocking resources.
