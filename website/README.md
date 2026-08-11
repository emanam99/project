# Website Pesantren (Astro + React, hybrid SSR)

Aplikasi web publik pesantren yang membaca konten dari API Slim eBeddien
(`/api/public/website/*`). Dibangun dengan **Astro 5** (`output: 'hybrid'`),
**React** untuk navigasi persisten, **Tailwind CSS**, **@astrojs/sitemap**, dan
**@vite-pwa/astro** untuk PWA.

## Struktur singkat

```
website/
├─ astro.config.mjs           # hybrid mode + sitemap dinamis (build-time fetch)
├─ tailwind.config.mjs
├─ src/
│  ├─ layouts/Layout.astro    # <ViewTransitions /> + nav persisten
│  ├─ components/
│  │  ├─ Navigation.tsx       # sidebar desktop + bottom-nav mobile (React)
│  │  ├─ SEO.astro            # meta + OG + JSON-LD
│  │  └─ SmartImage.astro     # <img> + placeholder fallback
│  ├─ lib/
│  │  ├─ api.ts               # fetch wrapper ke /api/public/website/*
│  │  └─ seo.ts               # builder title/description/OG
│  ├─ pages/
│  │  ├─ index.astro          # beranda (prerender)
│  │  ├─ berita/index.astro   # list (SSR)
│  │  ├─ berita/[slug].astro  # detail dinamis (SSR + JSON-LD NewsArticle)
│  │  ├─ kategori/[slug].astro
│  │  ├─ galeri/index.astro
│  │  ├─ halaman/[slug].astro # Tentang/Kontak/dll
│  │  ├─ healthz.ts           # liveness untuk Docker
│  │  ├─ sitemap-index.xml.ts # fallback sitemap (dev)
│  │  └─ api/revalidate.ts    # webhook opsional dari admin
│  └─ styles/global.css
└─ public/
   ├─ manifest.webmanifest
   └─ images/                 # taruh placeholder-pesantren.jpg di sini
```

## Konfigurasi

Salin `.env.example` ke `.env` lalu sesuaikan:

```
PUBLIC_SITE_URL=https://pesantren.alutsmani.id
PUBLIC_API_BASE_URL=https://api.alutsmani.id
REVALIDATE_SECRET=opsional
```

## Pengembangan lokal

```bash
cd website
npm install
npm run dev    # http://localhost:4321
```

## Build & jalankan

```bash
npm run build
npm start      # node ./dist/server/entry.mjs (port 4321)
```

## Docker (multi-stage Alpine)

```bash
docker build \
  --build-arg PUBLIC_SITE_URL=https://pesantren.alutsmani.id \
  --build-arg PUBLIC_API_BASE_URL=https://api.alutsmani.id \
  -t pesantren-web ./website

docker run -d --name pesantren-web -p 4321:4321 \
  -e PUBLIC_SITE_URL=https://pesantren.alutsmani.id \
  -e PUBLIC_API_BASE_URL=https://api.alutsmani.id \
  pesantren-web
```

Healthcheck: `GET /healthz` (status `200`).

## Sitemap dinamis

`astro.config.mjs` melakukan build-time fetch ke
`GET /api/public/website/sitemap` untuk daftar slug berita/halaman/kategori
yang sudah publish. Tiap rebuild → sitemap otomatis ter-update untuk Google.

Untuk update lebih sering tanpa rebuild penuh, panggil
`POST /api/revalidate?secret=...` (opsional) sebagai sinyal ke pipeline CI.

## Catatan optimasi gambar

`SmartImage` memakai `<img>` (bukan import asset Astro) supaya URL absolut dari
shared hosting bisa langsung dipakai. Jika `src` kosong → fallback ke
`/images/placeholder-pesantren.jpg`. Pastikan file placeholder ada di
`public/images/`.
