/**
 * Cek cepat sebelum nodemon/server — hindari error MODULE_NOT_FOUND yang membingungkan.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const marker = path.join(root, 'node_modules', 'whatsapp-web.js', 'package.json');

if (!fs.existsSync(marker)) {
  console.error('');
  console.error('[WA] Dependensi belum terpasang: whatsapp-web.js tidak ada di node_modules.');
  console.error('    Dari folder wa jalankan:');
  console.error('      npm run install:safe');
  console.error('    (npm install biasa sering gagal unduh Chrome di Windows — pakai install:safe)');
  console.error('    Cache Chrome rusak? Hapus folder: %USERPROFILE%\\.cache\\puppeteer\\chrome');
  console.error('');
  process.exit(1);
}
