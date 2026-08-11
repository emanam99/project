import jwt from 'jsonwebtoken';
import { JWT_ALGORITHM, JWT_SECRET } from './config.js';

function readBearerToken(socket) {
  const authToken = socket.handshake?.auth?.token;
  if (typeof authToken === 'string' && authToken.trim() !== '') return authToken.trim();

  const header = socket.handshake?.headers?.authorization || socket.handshake?.headers?.Authorization;
  if (typeof header === 'string') {
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (m?.[1]) return m[1].trim();
  }
  return '';
}

export function authenticateSocket(socket, next) {
  const token = readBearerToken(socket);
  if (!token || !JWT_SECRET) {
    socket.data.authUserId = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
    const payload = decoded?.data || {};
    const usersId = payload?.users_id != null ? String(payload.users_id) : '';
    const userId = payload?.user_id != null ? String(payload.user_id) : '';
    socket.data.authUserId = usersId || userId || null;
    return next();
  } catch {
    return next(new Error('Unauthorized'));
  }
}
