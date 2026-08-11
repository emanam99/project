const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const fs = require('fs');

// Lokal: pakai file .env. Docker: env_file Compose mengisi process.env tanpa file di /app.
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath) && (!process.env.DEEPSEEK_API_KEY || !String(process.env.DEEPSEEK_API_KEY).trim())) {
  console.error('DEEPSEEK_API_KEY belum di-set. Lokal: salin .env.example jadi .env. Docker: isi env_file / environment.');
  process.exit(1);
}
if (!process.env.DEEPSEEK_API_KEY || !String(process.env.DEEPSEEK_API_KEY).trim()) {
  console.error('DEEPSEEK_API_KEY kosong di .env.');
  process.exit(1);
}
