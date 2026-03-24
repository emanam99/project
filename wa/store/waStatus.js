/**
 * Store status WA — multi-session (max 10).
 * Setiap sessionId: status, qrCode, phoneNumber, baileysStatus, baileysQrCode, baileysPhoneNumber.
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

/** Kembalikan semua sessions untuk GET /status (multi-WA). Juga backward compat: data.status = sessions.default */
export function getWaStatus(sessionId = null) {
  if (sessionId) {
    const s = getSession(sessionId);
    return {
      status: s.status || 'disconnected',
      qrCode: s.qrCode || null,
      phoneNumber: s.phoneNumber || null,
      baileysStatus: s.baileysStatus || 'disconnected',
      baileysQrCode: s.baileysQrCode || null,
      baileysPhoneNumber: s.baileysPhoneNumber || null,
    };
  }
  const out = { sessions: {} };
  for (const id of Object.keys(sessions)) {
    const s = sessions[id];
    out.sessions[id] = {
      status: s.status || 'disconnected',
      qrCode: s.qrCode || null,
      phoneNumber: s.phoneNumber || null,
      baileysStatus: s.baileysStatus || 'disconnected',
      baileysQrCode: s.baileysQrCode || null,
      baileysPhoneNumber: s.baileysPhoneNumber || null,
    };
  }
  if (sessions[DEFAULT_SESSION]) {
    const s0 = sessions[DEFAULT_SESSION];
    out.status = s0.status || 'disconnected';
    out.qrCode = s0.qrCode || null;
    out.phoneNumber = s0.phoneNumber || null;
    out.baileysStatus = s0.baileysStatus || 'disconnected';
    out.baileysQrCode = s0.baileysQrCode || null;
    out.baileysPhoneNumber = s0.baileysPhoneNumber || null;
  } else {
    out.status = 'disconnected';
    out.qrCode = null;
    out.phoneNumber = null;
    out.baileysStatus = 'disconnected';
    out.baileysQrCode = null;
    out.baileysPhoneNumber = null;
  }
  return out;
}

export function setWaStatus(sessionId, update) {
  if (typeof sessionId === 'object' && update === undefined) {
    update = sessionId;
    sessionId = DEFAULT_SESSION;
  }
  const id = sessionId || DEFAULT_SESSION;
  const s = getSession(id);
  if (update.status !== undefined) s.status = update.status;
  if (update.qrCode !== undefined) s.qrCode = update.qrCode;
  if (update.phoneNumber !== undefined) s.phoneNumber = update.phoneNumber;
  if (update.baileysStatus !== undefined) s.baileysStatus = update.baileysStatus;
  if (update.baileysQrCode !== undefined) s.baileysQrCode = update.baileysQrCode;
  if (update.baileysPhoneNumber !== undefined) s.baileysPhoneNumber = update.baileysPhoneNumber;
}

export function getSessionIds() {
  return Object.keys(sessions);
}

export function deleteWaSession(sessionId) {
  const id = sessionId || DEFAULT_SESSION;
  if (Object.prototype.hasOwnProperty.call(sessions, id)) {
    delete sessions[id];
  }
}
