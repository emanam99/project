Deploy Evolution API
WhatsApp API open-source untuk chatbot, automasi, dan integrasi platform pesan

Tentang Evolution API
Evolution API adalah platform open-source yang memudahkan integrasi WhatsApp dan layanan pesan lainnya dalam satu sistem. Berbasis library Baileys, platform ini membantu developer mengotomatiskan percakapan WhatsApp, membuat chatbot interaktif, mengelola layanan pelanggan, dan memproses pesan secara...

## Integrasi eBeddien

- **Jalankan Evolution di PC lokal:** folder `evo/` di repo ini berisi `docker-compose.yml` + `.env.example` — ikuti `evo/CARA-PAKAI.md`.
- Di backend API set environment: `EVOLUTION_API_BASE_URL` (mis. `https://evo.alutsmani.id`) dan `EVOLUTION_API_KEY` (header `apikey` ke Evolution).
- Di eBeddien: **Setting → Evolution WA** (Super Admin) untuk cek info server, daftar instance, status koneksi, ambil QR, dan logout instance.
- Dokumentasi API: [Get Information](https://doc.evolution-api.com/v2/api-reference/get-information) dan indeks lengkap: [llms.txt](https://doc.evolution-api.com/llms.txt).

**Jangan** menyimpan API key di file dokumentasi atau commit ke git — hanya di `.env` server.
