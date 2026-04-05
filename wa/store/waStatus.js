/**
 * Store status WA — satu koneksi (id internal file auth: default / folder baileys-default).
 */

const DEFAULT_SESSION = 'default';
const sessions = {};

function getSession(sessionId) {
  const id = sessionId || DEFAULT_SESSION;
  if (!sessions[id]) {
    sessions[id] = {
      status: 'disconnected',
      qrCode: null,
      phoneNumber: null,
      baileysStatus: 'disconnected',
      baileysQrCode: null,
      baileysPhoneNumber: null,
    };
  }
  return sessions[id];
}

/** GET /status & /qr: satu objek datar (tanpa sessions / tanpa nama slot di JSON). */
export function getWaStatus(_sessionIdIgnored = null) {
  const s = getSession(DEFAULT_SESSION);
  return {
    status: s.status || 'disconnected',
    qrCode: s.qrCode || null,
    phoneNumber: s.phoneNumber || null,
    baileysStatus: s.baileysStatus || 'disconnected',
    baileysQrCode: s.baileysQrCode || null,
    baileysPhoneNumber: s.baileysPhoneNumber || null,
  };
}

export function setWaStatus(sessionId, update) {
  if (typeof sessionId === 'object' && update === undefined) {
    update = sessionId;
    sessionId = DEFAULT_SESSION;
  }
  const id = DEFAULT_SESSION;
  const s = getSession(id);
  if (update.status !== undefined) s.status = update.status;
  if (update.qrCode !== undefined) s.qrCode = update.qrCode;
  if (update.phoneNumber !== undefined) s.phoneNumber = update.phoneNumber;
  if (update.baileysStatus !== undefined) s.baileysStatus = update.baileysStatus;
  if (update.baileysQrCode !== undefined) s.baileysQrCode = update.baileysQrCode;
  if (update.baileysPhoneNumber !== undefined) s.baileysPhoneNumber = update.baileysPhoneNumber;
}

export function getSessionIds() {
  return Object.prototype.hasOwnProperty.call(sessions, DEFAULT_SESSION) ? [DEFAULT_SESSION] : [];
}

export function deleteWaSession(sessionId) {
  const id = sessionId || DEFAULT_SESSION;
  if (Object.prototype.hasOwnProperty.call(sessions, id)) {
    delete sessions[id];
  }
}
