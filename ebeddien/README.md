# UWABA Frontend - React + Vite

Frontend modern untuk aplikasi UWABA menggunakan React, Vite, React Router, dan Framer Motion.

## 🚀 Fitur

- ⚡ **Vite** - Build tool yang sangat cepat
- ⚛️ **React 18** - UI library modern
- 🎨 **Tailwind CSS** - Utility-first CSS framework
- 🎭 **Framer Motion** - Animasi halus dan transisi
- 🧭 **React Router** - Navigasi tanpa reload halaman
- 🔐 **Authentication** - JWT + CSRF protection
- 📱 **PWA Ready** - Progressive Web App support
- 🎯 **TypeScript Ready** - Siap untuk migrasi ke TypeScript

## 📁 Struktur Folder

```
frontend/
├── src/
│   ├── components/        # Komponen reusable
│   │   ├── Auth/         # Komponen authentication
│   │   └── Layout/       # Layout components (Header, Navigation)
│   ├── pages/            # Halaman aplikasi
│   │   ├── Login.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Pembayaran.jsx
│   │   ├── Uwaba.jsx
│   │   ├── Laporan.jsx
│   │   └── ManageUsers.jsx
│   ├── services/         # API services
│   │   └── api.js        # Axios instance & API functions
│   ├── store/            # State management (Zustand)
│   │   └── authStore.js
│   ├── App.jsx           # Root component dengan routing
│   ├── main.jsx          # Entry point
│   └── index.css         # Global styles
├── public/               # Static files
├── package.json
├── vite.config.js
└── tailwind.config.js
```

## 🛠️ Setup & Installation

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Development

```bash
npm run dev
```

Aplikasi akan berjalan di `http://localhost:5173`

### 3. Build untuk Production

```bash
npm run build
```

File hasil build akan ada di folder `../dist/` (satu level di atas frontend)

### 4. Preview Build

```bash
npm run preview
```

## 🔌 Integrasi dengan Backend PHP

Backend PHP berada di folder `../backend/`. API service sudah dikonfigurasi untuk:

- **Development**: `http://localhost/backend/public/api`
- **Production**: `{origin}/backend/public/api`

### API Endpoints yang Tersedia

Semua API functions ada di `src/services/api.js`:

- `authAPI` - Login, verify, logout
- `santriAPI` - Get, update data santri
- `paymentAPI` - Pembayaran & rincian
- `uwabaAPI` - Data UWABA
- `dashboardAPI` - Statistik dashboard
- `chatAPI` - Chat/riwayat

## 🎨 Styling

Menggunakan **Tailwind CSS** dengan konfigurasi custom:

- Primary color: `#0d9488` (teal-600)
- Font: Poppins
- Responsive design dengan breakpoints standard

## 🎭 Animasi

Menggunakan **Framer Motion** untuk:

- Page transitions
- Component animations
- Hover effects
- Loading states

## 📱 PWA Support

PWA sudah dikonfigurasi dengan:

- Service Worker (via vite-plugin-pwa) - Auto register & update
- Manifest.webmanifest - Lengkap dengan icons, screenshots, shortcuts
- Offline support - Caching untuk assets dan API
- Install prompt - Komponen InstallPrompt untuk memudahkan install
- Auto update - Service worker akan auto update ketika ada versi baru

### Cara Testing PWA:

1. **Development Mode:**
   ```bash
   npm run dev
   ```
   - Service worker akan aktif di development mode
   - Install prompt akan muncul setelah 3 detik (jika browser support)

2. **Production Build:**
   ```bash
   npm run build
   ```
   - File akan di-build ke folder `../dist/`
   - Manifest.webmanifest dan service worker akan otomatis ter-generate
   - Upload semua file di folder `dist/` ke server

3. **Testing Install:**
   - Buka aplikasi di browser (Chrome/Edge recommended)
   - Tunggu install prompt muncul di bagian atas
   - Atau klik menu browser > "Install UWABA"
   - Aplikasi akan terinstall dan bisa dibuka seperti aplikasi native

### Fitur PWA:

- ✅ Installable (bisa diinstall ke home screen)
- ✅ Offline support (cache assets dan data)
- ✅ Auto update (service worker auto update)
- ✅ App shortcuts (Dashboard, UWABA)
- ✅ Screenshots untuk app store listing
- ✅ Icons untuk berbagai ukuran (128px, 192px, 512px)

## 🔐 Authentication

Authentication menggunakan:

- JWT token (disimpan di localStorage)
- CSRF token (otomatis di-fetch dan di-attach)
- Protected routes dengan `ProtectedRoute` component
- Auto logout jika token invalid

## 🚀 Deploy ke Shared Hosting

1. Build aplikasi:
   ```bash
   npm run build
   ```

2. Upload isi folder `dist/` ke root shared hosting

3. Pastikan backend PHP sudah di-upload di folder `backend/`

4. Pastikan file `manifest.json` dan assets (gambar, dll) sudah di-upload

## 📝 Migrasi Bertahap

Struktur sudah disiapkan untuk migrasi bertahap:

1. **Halaman sudah dibuat** - Semua halaman utama sudah ada (kosong, siap diisi)
2. **API service ready** - Semua API functions sudah tersedia
3. **Components reusable** - Layout, Header, Navigation sudah siap
4. **State management** - Auth store sudah setup

### Cara Migrasi Komponen:

1. Copy logic dari file JS lama ke komponen React baru
2. Gunakan hooks (`useState`, `useEffect`, dll) untuk state management
3. Gunakan API service dari `src/services/api.js`
4. Tambahkan animasi dengan Framer Motion
5. Test di development mode

## 🐛 Troubleshooting

### Port sudah digunakan
Ubah port di `vite.config.js`:
```js
server: {
  port: 5174, // atau port lain
}
```

### CORS Error
Pastikan backend PHP sudah mengizinkan origin frontend di CORS settings.

### API tidak terhubung
Cek konfigurasi di `src/services/api.js` - fungsi `getSlimApiUrl()`

## 📚 Resources

- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)
- [React Router](https://reactrouter.com)
- [Framer Motion](https://www.framer.com/motion/)
- [Tailwind CSS](https://tailwindcss.com)
- [Zustand](https://zustand-demo.pmnd.rs)

## 🎯 Next Steps

1. Migrasi komponen Dashboard dengan data real
2. Migrasi halaman Pembayaran
3. Migrasi halaman UWABA
4. Tambahkan error boundaries
5. Optimasi bundle size
6. Setup testing (optional)

