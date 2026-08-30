-- Setelah salin data tenant SPPG-0001 ke DB cloudy, jalankan:
UPDATE sppg SET subdomain = 'sppgalutsmani' WHERE public_id = 'SPPG-0001' AND subdomain IS NULL;

-- Admin utama platform
UPDATE users SET role = 'super_admin' WHERE LOWER(email) = 'em.anam999@gmail.com';
