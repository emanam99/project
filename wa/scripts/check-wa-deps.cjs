/**
 * Cek cepat sebelum nodemon/server — hindari error MODULE_NOT_FOUND yang membingungkan.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const marker = path.join(root, 'node_modules', '@whiskeysockets', 'baileys', 'package.json');

if (!fs.existsSync(marker)) {
  console.error('');
  console.error('[WA] Dependensi belum terpasang: @whiskeysockets/baileys tidak ada di node_modules.');
  console.error('    Dari folder wa jalankan: npm install');
  console.error('');
  process.exit(1);
}

const linkPreview = path.join(root, 'node_modules', 'link-preview-js', 'package.json');
if (!fs.existsSync(linkPreview)) {
  console.error('');
  console.error('[WA] Paket link-preview-js belum terpasang — preview link di WhatsApp tidak akan muncul.');
  console.error('    Baileys membutuhkan peer ini (opsional di npm). Dari folder wa: npm install link-preview-js');
  console.error('');
  process.exit(1);
}
