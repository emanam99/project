/**
 * Memastikan Chromium/Chrome untuk Puppeteer terunduh.
 * Puppeteer mengunduh Chromium otomatis saat pertama kali launch.
 * Jalankan: npm run ensure-browser (setelah npm install berhasil).
 * Ekstensi .cjs agar jalan di project "type": "module".
 */
async function main() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (e) {
    console.warn('[ensure-browser] puppeteer belum terpasang. Jalankan: npm install');
    process.exit(0);
  }

  const executablePath = puppeteer.executablePath && puppeteer.executablePath();
  if (executablePath) {
    const fs = require('fs');
    if (fs.existsSync(executablePath)) {
      console.log('[ensure-browser] Chromium sudah ada:', executablePath);
      process.exit(0);
      return;
    }
  }

  console.log('[ensure-browser] Mengunduh Chromium (sekali saja, ~150–300 MB)...');
  try {
    const browser = await puppeteer.launch({ headless: true });
    await browser.close();
    console.log('[ensure-browser] Chromium siap.');
  } catch (err) {
    console.error('[ensure-browser] Gagal:', err.message);
    console.warn('[ensure-browser] Pastikan koneksi internet aktif. Atau gunakan Chrome sistem dengan PUPPETEER_EXECUTABLE_PATH.');
    process.exit(1);
  }
}

main();
