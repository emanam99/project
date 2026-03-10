/**
 * Store status WA — plain object, tanpa dependency Baileys.
 * Dipakai oleh GET /api/whatsapp/status di server.js agar polling tidak pernah 500.
 */

let status = 'disconnected';
let qrCode = null;
let phoneNumber = null;

export function getWaStatus() {
  return {
    status: typeof status === 'string' ? status : 'disconnected',
    qrCode: qrCode != null && typeof qrCode === 'string' ? qrCode : null,
    phoneNumber: phoneNumber != null && typeof phoneNumber === 'string' ? phoneNumber : null,
  };
}

export function setWaStatus(update) {
  if (update.status !== undefined) status = update.status;
  if (update.qrCode !== undefined) qrCode = update.qrCode;
  if (update.phoneNumber !== undefined) phoneNumber = update.phoneNumber;
}
