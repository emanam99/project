/**
 * Store daftar user online (in-memory).
 * Key: socket.id, Value: { ip, user_id, nama, halaman, connectedAt }
 */
const onlineUsers = new Map();

export function addUser(socketId, data) {
  const existing = onlineUsers.get(socketId);
  const connectedAt = existing?.connectedAt ?? Date.now();
  onlineUsers.set(socketId, {
    ip: data.ip ?? existing?.ip ?? '',
    user_id: data.user_id ?? existing?.user_id ?? '',
    nama: data.nama ?? existing?.nama ?? '',
    halaman: data.halaman ?? existing?.halaman ?? '',
    connectedAt,
  });
}

export function updatePage(socketId, halaman) {
  const u = onlineUsers.get(socketId);
  if (u) u.halaman = halaman;
}

export function updateUser(socketId, data) {
  const u = onlineUsers.get(socketId);
  if (!u) return;
  if (data.user_id !== undefined) u.user_id = data.user_id;
  if (data.nama !== undefined) u.nama = data.nama;
  if (data.halaman !== undefined) u.halaman = data.halaman;
}

export function removeUser(socketId) {
  onlineUsers.delete(socketId);
}

export function getAll() {
  return Array.from(onlineUsers.entries()).map(([socketId, u]) => ({
    socketId,
    ip: u.ip,
    user_id: u.user_id,
    nama: u.nama,
    halaman: u.halaman,
    connectedAt: u.connectedAt,
  }));
}

export function getCount() {
  return onlineUsers.size;
}

/** Mengembalikan semua socket.id yang terikat ke user_id (untuk chat: kirim ke salah satu/pertama). */
export function getSocketIdsByUserId(userId) {
  const id = String(userId ?? '');
  if (!id) return [];
  return Array.from(onlineUsers.entries())
    .filter(([, u]) => u.user_id === id)
    .map(([socketId]) => socketId);
}

/** Socket.id pertama yang terikat ke user_id, atau null jika offline. */
export function getSocketIdByUserId(userId) {
  const ids = getSocketIdsByUserId(userId);
  return ids.length > 0 ? ids[0] : null;
}
