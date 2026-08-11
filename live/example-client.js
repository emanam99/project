/**
 * Contoh client untuk terhubung ke server live (Socket.IO).
 * Gunakan di website Slim PHP: include script Socket.IO dari CDN lalu script ini.
 *
 * Production: wss://live.alutsmani.id
 * Staging:    wss://live2.alutsmani.id
 * Lokal:      ws://localhost:3003
 */
(function () {
  const LIVE_URL = 'https://live.alutsmani.id'; // ganti ke live2... untuk staging
  const socket = io(LIVE_URL, { transports: ['websocket', 'polling'] });

  // Data user (dari PHP/Session atau form)
  const user = {
    user_id: window.LIVE_USER_ID || '0',
    nama: window.LIVE_USER_NAMA || 'Guest',
    halaman: window.LIVE_HALAMAN || document.location.pathname || '/',
  };

  socket.on('connect', () => {
    socket.emit('connect_user', user);
  });

  socket.on('connect_user_ok', (data) => {
    console.log('Live: terhubung', data.socketId);
  });

  socket.on('change_page_ok', (data) => {
    console.log('Live: halaman diperbarui', data.halaman);
  });

  socket.on('disconnect', (reason) => {
    console.log('Live: putus', reason);
  });

  // Saat pindah halaman (SPA atau navigasi), panggil:
  window.LIVE_CHANGE_PAGE = function (halaman) {
    if (typeof halaman !== 'string') halaman = window.LIVE_HALAMAN || document.location.pathname || '/';
    socket.emit('change_page', { halaman });
  };

  // Simpan referensi socket jika perlu
  window.LIVE_SOCKET = socket;
})();
