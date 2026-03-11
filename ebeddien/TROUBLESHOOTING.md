# Troubleshooting Login Error

## Error: `ERR_FAILED` atau `Failed to load resource`

Ini berarti request tidak sampai ke backend server. Berikut langkah-langkah untuk memperbaikinya:

### 1. Pastikan XAMPP Apache Berjalan
- Buka XAMPP Control Panel
- Pastikan Apache status: **Running** (hijau)
- Jika tidak running, klik **Start**

### 2. Test Backend API Langsung
Buka browser dan akses:
```
http://localhost/backend/public/api/auth/login
```

Jika muncul error JSON (bukan 404), berarti backend berjalan.

### 3. Cek CORS Configuration
Backend sudah dikonfigurasi untuk mengizinkan:
- `http://localhost:5173` (Vite React frontend)
- `http://localhost` (Frontend lama)
- `http://localhost:5500`, `http://localhost:3000`, `http://localhost:8080`

### 4. Cek Network Tab di Browser
1. Buka Developer Tools (F12)
2. Tab **Network**
3. Coba login lagi
4. Cek request ke `/backend/public/api/auth/login`
5. Lihat:
   - **Status Code**: Harus 200 atau 401 (bukan ERR_FAILED)
   - **Request Headers**: Harus ada `Origin: http://localhost:5173`
   - **Response Headers**: Harus ada `Access-Control-Allow-Origin`

### 5. Jika Masih ERR_FAILED

**Cek apakah backend bisa diakses:**
```bash
# Test dengan curl (jika ada)
curl -X POST http://localhost/backend/public/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:5173" \
  -d '{"id":"test","password":"test"}'
```

**Atau test di browser console:**
```javascript
fetch('http://localhost/backend/public/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ id: 'test', password: 'test' })
})
.then(r => r.json())
.then(console.log)
.catch(console.error)
```

### 6. Restart XAMPP
Jika masih error, coba:
1. Stop Apache di XAMPP
2. Start lagi Apache
3. Refresh browser dan coba login lagi

### 7. Cek Error Log
Cek file `backend/error.log` untuk melihat error detail dari backend.

## Error Lainnya

### CORS Error
Jika muncul error CORS di console:
- Pastikan `http://localhost:5173` ada di `allowed_origins` di `backend/config.php`
- Restart Apache setelah mengubah config

### 401 Unauthorized
- ID atau password salah
- User tidak aktif
- Cek credentials di database

### 500 Internal Server Error
- Cek `backend/error.log`
- Pastikan database connection berjalan
- Pastikan semua dependencies terinstall

