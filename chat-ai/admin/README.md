# Chat AI Al-Utsmani

Aplikasi chat AI yang menggunakan data training dari Pesantren Salafiyah Al-Utsmani dengan integrasi Gemini AI.

## Fitur

- Chat dengan AI yang dilatih dengan data pesantren
- Otomatis menampilkan disclaimer + jawaban AI asli ketika pertanyaan tidak ada di training data
- Penyimpanan riwayat chat menggunakan IndexedDB
- Interface yang responsif dan modern

## Setup API Key

1. Dapatkan API Key Gemini dari [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Buka file `index.html`
3. Cari baris ini:
   ```javascript
   const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE";
   ```
4. Ganti `YOUR_GEMINI_API_KEY_HERE` dengan API key Gemini Anda yang sebenarnya

## Troubleshooting

### Model yang Digunakan
- Aplikasi menggunakan model `gemini-1.5-pro-latest` (versi terbaru dari Gemini 1.5 Pro)
- Model ini mendukung hingga 2 juta tokens dan merupakan versi stabil
- Jika masih error, gunakan file `check-models.html` untuk melihat model yang tersedia

### Opsi Model Lainnya
- **Gemini 1.5 Flash Latest**: Lebih cepat, cocok untuk chat real-time
- **Gemini 2.5 Flash**: Versi terbaru, lebih canggih (1M tokens)
- **Gemini 1.5 Flash-8B**: Paling hemat biaya (direkomendasikan untuk free tier)
- Gunakan `model-selector.html` untuk memilih model yang sesuai

### Troubleshooting Quota
- Jika mendapat error 429, berarti quota habis
- Gunakan model yang lebih hemat seperti `gemini-1.5-flash-8b-latest`
- Lihat `quota-info.html` untuk informasi lengkap tentang quota
- Tunggu beberapa menit atau upgrade ke plan berbayar

### Test API
- Gunakan `test-api.html` untuk menguji API key
- Gunakan `check-models.html` untuk melihat model yang tersedia

## Cara Kerja

1. **Training Data**: Aplikasi akan mengambil data training dari `https://alutsmani.id/psa/chat/api/training.php`
2. **Pencarian Jawaban**: Ketika user bertanya, sistem akan mencari jawaban yang cocok dari training data
3. **Fallback ke AI**: Jika tidak ada jawaban yang cocok, sistem akan menggunakan Gemini AI untuk memberikan jawaban
4. **Disclaimer**: Setiap jawaban AI akan disertai disclaimer bahwa ini bukan jawaban resmi dari pesantren

## Struktur File

- `index.html` - File utama aplikasi chat
- `training.html` - Halaman untuk mengelola data training (jika ada)

## Teknologi yang Digunakan

- HTML5 + CSS3 + JavaScript
- Tailwind CSS untuk styling
- Dexie.js untuk IndexedDB
- Google Gemini AI API 