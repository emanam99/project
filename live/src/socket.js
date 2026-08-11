import { addUser, updatePage, updateUser, removeUser, getCount, getPublicUsers, getSocketIdByUserId } from './store.js';
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
  io.emit('users_updated', { users: getPublicUsers(), count: getCount() });
}

function sanitizeText(value, maxLength = 120) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function shouldThrottle(socket, key, minIntervalMs) {
  const now = Date.now();
  socket.data.rate = socket.data.rate || {};
  const last = socket.data.rate[key] || 0;
  if ((now - last) < minIntervalMs) {
    return true;
  }
  socket.data.rate[key] = now;
  return false;
}

export function attachSocket(io) {
  io.on('connection', (socket) => {
    const ip = getIp(socket);
    addUser(socket.id, { ip, user_id: '', nama: '', halaman: '' });
    broadcastUsers(io);

    socket.on('connect_visitor', (data) => {
      const halaman = sanitizeText(data?.halaman, 180);
      updatePage(socket.id, halaman);
      socket.emit('connect_visitor_ok', { halaman });
      broadcastUsers(io);
    });

    socket.on('connect_user', (data) => {
      const authenticatedUserId = socket.data?.authUserId ? String(socket.data.authUserId) : '';
      const user_id = authenticatedUserId || sanitizeText(data?.user_id, 32);
      if (!user_id) {
        socket.emit('connect_user_ok', { socketId: socket.id, ignored: true });
        return;
      }
      socket.data.userId = user_id;
      updateUser(socket.id, {
        user_id,
        nama: sanitizeText(data?.nama, 80),
        halaman: sanitizeText(data?.halaman, 180),
      });
      if (user_id) updatePresence({ user_id }).catch(() => {});
      socket.emit('connect_user_ok', { socketId: socket.id });
      broadcastUsers(io);
    });

    socket.on('change_page', (data) => {
      if (shouldThrottle(socket, 'change_page', 300)) return;
      const halaman = sanitizeText(data?.halaman, 180);
      updatePage(socket.id, halaman);
      socket.emit('change_page_ok', { halaman });
      broadcastUsers(io);
    });

    socket.on('join_chat_room', (data) => {
      const cid = data?.conversation_id != null ? parseInt(String(data.conversation_id), 10) : 0;
      if (cid > 0) socket.join(`chat_conv_${cid}`);
    });
    socket.on('leave_chat_room', (data) => {
      const cid = data?.conversation_id != null ? parseInt(String(data.conversation_id), 10) : 0;
      if (cid > 0) socket.leave(`chat_conv_${cid}`);
    });

    socket.on('send_message', async (data) => {
      const from_user_id = String(socket.data.userId || '');
      const to_user_id = data?.to_user_id != null ? String(data.to_user_id) : '';
      const message = sanitizeText(data?.message, 4000);
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

    // Typing: private (to_user_id) atau grup (conversation_id → room chat_conv_*)
    socket.on('typing_start', (data) => {
      if (shouldThrottle(socket, 'typing_start', 500)) return;
      const fromUserId = String(socket.data.userId || '');
      if (!fromUserId) return;
      const convId = data?.conversation_id != null ? parseInt(String(data.conversation_id), 10) : 0;
      if (convId > 0) {
        socket.to(`chat_conv_${convId}`).emit('chat_typing', {
          conversation_id: convId,
          from_user_id: fromUserId,
          from_name: sanitizeText(data?.from_name, 80),
          state: 'typing',
        });
        return;
      }
      const to_user_id = data?.to_user_id != null ? String(data.to_user_id) : '';
      if (!to_user_id) return;
      const toSocketId = getSocketIdByUserId(to_user_id);
      if (toSocketId) {
        io.to(toSocketId).emit('user_typing', {
          from_user_id: fromUserId,
          from_name: sanitizeText(data?.from_name, 80),
        });
      }
    });
    socket.on('typing_stop', (data) => {
      if (shouldThrottle(socket, 'typing_stop', 300)) return;
      const fromUserId = String(socket.data.userId || '');
      if (!fromUserId) return;
      const convId = data?.conversation_id != null ? parseInt(String(data.conversation_id), 10) : 0;
      if (convId > 0) {
        socket.to(`chat_conv_${convId}`).emit('chat_typing', {
          conversation_id: convId,
          from_user_id: fromUserId,
          state: 'idle',
        });
        return;
      }
      const to_user_id = data?.to_user_id != null ? String(data.to_user_id) : '';
      if (!to_user_id) return;
      const toSocketId = getSocketIdByUserId(to_user_id);
      if (toSocketId) {
        io.to(toSocketId).emit('user_typing_stop', {
          from_user_id: fromUserId,
        });
      }
    });

    socket.on('disconnect', () => {
      removeUser(socket.id);
      broadcastUsers(io);
    });
  });
}
