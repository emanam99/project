import { addUser, updatePage, updateUser, removeUser, getCount, getAll, getSocketIdByUserId } from './store.js';
import { saveMessage, updatePresence } from './chatRepository.js';

function getIp(socket) {
  const headers = socket.handshake?.headers || {};
  const forwarded = headers['x-forwarded-for'];
  if (forwarded) {
    const first = typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded[0];
    const ip = (first && first.trim());
    if (ip) return ip;
  }
  const realIp = headers['x-real-ip'];
  const realIpStr = Array.isArray(realIp) ? realIp[0] : realIp;
  if (realIpStr && typeof realIpStr === 'string') {
    const ip = realIpStr.trim();
    if (ip) return ip;
  }
  const addr = socket.handshake?.address;
  if (addr) {
    const ip = addr.replace(/^::ffff:/, '');
    if (ip && ip !== '::1' && ip !== '127.0.0.1') return ip;
  }
  return 'unknown';
}

function broadcastUsers(io) {
  io.emit('users_updated', { users: getAll(), count: getCount() });
}

export function attachSocket(io) {
  io.on('connection', (socket) => {
    const ip = getIp(socket);
    addUser(socket.id, { ip, user_id: '', nama: '', halaman: '' });
    broadcastUsers(io);

    socket.on('connect_visitor', (data) => {
      const halaman = data?.halaman ?? '';
      updatePage(socket.id, halaman);
      socket.emit('connect_visitor_ok', { halaman });
      broadcastUsers(io);
    });

    socket.on('connect_user', (data) => {
      const user_id = String(data?.user_id ?? '');
      updateUser(socket.id, {
        user_id,
        nama: String(data?.nama ?? ''),
        halaman: String(data?.halaman ?? ''),
      });
      if (user_id) updatePresence({ user_id }).catch(() => {});
      socket.emit('connect_user_ok', { socketId: socket.id });
      broadcastUsers(io);
    });

    socket.on('change_page', (data) => {
      const halaman = data?.halaman ?? '';
      updatePage(socket.id, halaman);
      socket.emit('change_page_ok', { halaman });
      broadcastUsers(io);
    });

    socket.on('send_message', async (data) => {
      const from_user_id = data?.from_user_id != null ? String(data.from_user_id) : '';
      const to_user_id = data?.to_user_id != null ? String(data.to_user_id) : '';
      const message = typeof data?.message === 'string' ? data.message.trim() : '';
      if (!from_user_id || !to_user_id || !message) {
        socket.emit('send_message_result', { success: false, reason: 'invalid_data' });
        return;
      }
      try {
        const result = await saveMessage({ from_user_id, to_user_id, message });
        const { id, created_at, conversation_id, sender_id } = result;
        const isSelf = from_user_id === to_user_id;
        const payload = {
          id,
          conversation_id: conversation_id ?? null,
          sender_id: sender_id ?? from_user_id,
          from_user_id,
          to_user_id,
          message,
          created_at,
        };
        // Chat ke diri sendiri: cukup simpan di DB, jangan emit receive_message (client sudah dapat dari send_message_result)
        const toSocketId = isSelf ? null : getSocketIdByUserId(to_user_id);
        if (toSocketId) {
          io.to(toSocketId).emit('receive_message', payload);
        }
        socket.emit('send_message_result', {
          success: true,
          id,
          conversation_id: conversation_id ?? null,
          created_at,
          ...(!toSocketId && !isSelf ? { reason: 'user_offline' } : {}),
        });
      } catch (err) {
        console.error('send_message save error', err);
        socket.emit('send_message_result', { success: false, reason: 'server_error' });
      }
    });

    // Typing indicator: terusan ke penerima (to_user_id = users.id)
    socket.on('typing_start', (data) => {
      const to_user_id = data?.to_user_id != null ? String(data.to_user_id) : '';
      if (!to_user_id) return;
      const toSocketId = getSocketIdByUserId(to_user_id);
      if (toSocketId) {
        io.to(toSocketId).emit('user_typing', {
          from_user_id: data?.from_user_id,
          from_name: data?.from_name ?? '',
        });
      }
    });
    socket.on('typing_stop', (data) => {
      const to_user_id = data?.to_user_id != null ? String(data.to_user_id) : '';
      if (!to_user_id) return;
      const toSocketId = getSocketIdByUserId(to_user_id);
      if (toSocketId) {
        io.to(toSocketId).emit('user_typing_stop', {
          from_user_id: data?.from_user_id,
        });
      }
    });

    socket.on('disconnect', () => {
      removeUser(socket.id);
      broadcastUsers(io);
    });
  });
}
