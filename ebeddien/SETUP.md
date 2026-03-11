# Setup & Troubleshooting

## ✅ Perbaikan yang Sudah Dilakukan

1. **Routing** - Menghapus AnimatePresence yang konflik, animasi sudah ada di Layout
2. **Navigation** - Memperbaiki logic active state untuk NavLink
3. **Auth Check** - Menambahkan checkAuth di App.jsx untuk inisialisasi
4. **Protected Route** - Memperbaiki useEffect dependency
5. **Static Assets** - Setup proxy untuk gambar dan manifest.json

## 🚀 Cara Menjalankan

```bash
cd frontend
npm run dev
```

Aplikasi akan berjalan di: `http://localhost:5173`

## 🔧 Troubleshooting

### Error: Cannot find module
```bash
# Hapus node_modules dan install ulang
rm -rf node_modules package-lock.json
npm install
```

### Error: Port 5173 already in use
Ubah port di `vite.config.js`:
```js
server: {
  port: 5174, // atau port lain
}
```

### Gambar tidak muncul
- Pastikan XAMPP Apache berjalan
- Gambar diakses via proxy dari `http://localhost/gambar/`
- Cek console browser untuk error 404

### CORS Error
Pastikan backend PHP mengizinkan origin `http://localhost:5173` di CORS settings.

### Login tidak berfungsi
1. Pastikan backend PHP berjalan di XAMPP
2. Cek API endpoint: `http://localhost/backend/public/api/auth/login`
3. Cek console browser (F12) untuk error detail
4. Pastikan credentials benar

## 📝 Catatan

- Backend API: `http://localhost/backend/public/api`
- Static assets (gambar): `http://localhost/gambar/` (via proxy)
- Manifest: `http://localhost/manifest.json` (via proxy)

