# Checklist Keamanan Deploy Production

Gunakan daftar ini sebelum setiap rilis production API / eBeddien / myBeddien.

## Environment wajib (production)

- [ ] `APP_ENV=production`
- [ ] `JWT_SECRET` — minimal 32 karakter acak, unik per lingkungan
- [ ] `CORS_ALLOW_ALL` — **tidak** diset `true`
- [ ] `ALLOW_PUBLIC_PAYMENT_LOOKUP` — `false` (default)
- [ ] `WATZAP_WEBHOOK_SECRET` atau `EVOLUTION_WEBHOOK_SECRET` — diisi; URL webhook memakai `?secret=` atau header `X-Ebeddien-Webhook-Secret`
- [ ] `ABSEN_FINGERPRINT_ALLOWED_SN` / `ABSEN_FINGERPRINT_SECRET` — **opsional**; kosong = semua mesin iClock diterima (disengaja untuk multi-kantor)
- [ ] Kredensial DB **bukan** default `root`/kosong
- [ ] Hostinger: `DB_HOST=127.0.0.1` (hindari `localhost` → error socket / 503 Auth)
- [ ] File `.env` tidak dapat diakses via web server (`api/.env` di luar document root atau diblokir)

## Endpoint publik — review berkala

| Route | Kontrol |
|-------|---------|
| `GET /api/public/santri` | Rate limit IP; PII disamarkan tanpa JWT/view_token |
| `GET /api/public/ijin` | Rate limit; nama admin disamarkan tanpa token |
| `POST /api/public/shohifah` | Wajib `view_token` tulis atau JWT santri/staff |
| `GET /api/public/pembayaran/*` | Signed `X-Public-Payment-Token` (default wajib) |
| `POST /api/watzap/webhook` | Secret webhook |
| `GET /api/payment-transaction/callback` | Session ID sulit ditebak; pantau log |

## Otorisasi — pola IDOR

- [ ] Endpoint yang menerima `user_id` / `id_santri` / `id_pengurus` dari body/query harus dibinding ke JWT pemanggil atau fitur admin.
- [ ] `GET /api/user/{id}` — hanya diri sendiri, `super_admin`, atau `action.pengurus.edit` + cakupan lembaga; NIK/KK/email/WA ter-mask kecuali self/super_admin/`full_pii=1`.
- [ ] `GET /api/pendaftaran/get-all-pendaftar` — NIK/No.KK/telpon/email ter-mask; `include_pii=1` hanya role PSB/super_admin (diaudit); lean fields.
- [ ] `POST /api/v2/auth/send-otp-ganti-wa` — max 3/10 menit (IP + akun); error gateway tidak diekspos.
- [ ] `POST /api/user/update-password` dan `verify-password` — hanya akun sendiri.
- [ ] `PaymentTransactionController` — santri portal hanya transaksi milik sendiri; staff butuh assignment eBeddien.
- [ ] `POST /api/payment/public-token` — santri terikat; staff butuh assignment eBeddien.

## Frontend

- [ ] Production build tanpa source map publik (`hidden`)
- [ ] Tidak ada secret `VITE_*` selain URL publik / VAPID public key
- [ ] Header keamanan aktif di `.htaccess` (HSTS, CSP, X-Frame-Options)

## Logging & artefak

- [ ] `api/error.log` tidak di-commit; rotasi log aktif
- [ ] Webhook log tidak menyimpan PII berlebihan di production

## Setelah perubahan route publik

1. Uji akses anonim (tanpa token) — pastikan PII tersamarkan.
2. Uji dengan JWT santri A mengakses data santri B — harus 403.
3. Uji rate limit dengan burst request (>120/5 menit pada `/api/public/santri`).
