const fs = require('fs');
const path = require('path');

const sessionDir = path.join(__dirname, '..', 'data', 'whatsapp-session');

if (fs.existsSync(sessionDir)) {
  fs.rmSync(sessionDir, { recursive: true, force: true });
  console.log('Sesi WhatsApp dihapus. Jalankan npm start dan scan QR lagi.');
} else {
  console.log('Tidak ada folder sesi untuk dihapus.');
}
