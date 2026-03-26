const ACTIVE_MS = 8000

export function normalizeIncomingChatPayload(payload) {
  if (!payload || typeof payload !== 'object') return null

  const fromUserId = Number(payload.sender_id ?? payload.from_user_id)
  const toUserId = Number(payload.to_user_id)
  const message = String(payload.message ?? '').trim()

  if (!Number.isFinite(fromUserId) || !message) return null

  return {
    id: payload.id ?? `${fromUserId}-${Date.now()}`,
    conversationId: payload.conversation_id != null ? Number(payload.conversation_id) : null,
    fromUserId,
    toUserId: Number.isFinite(toUserId) ? toUserId : null,
    senderName: String(payload.from_name ?? payload.sender_name ?? payload.nama_pengirim ?? `User ${fromUserId}`),
    message,
    createdAt: payload.created_at ?? new Date().toISOString(),
  }
}

export function buildNotificationKey(item) {
  return `${item.id}-${item.fromUserId}-${item.createdAt}`
}

export function isNotificationFresh(createdAtIso) {
  const ts = new Date(createdAtIso).getTime()
  if (!Number.isFinite(ts)) return true
  return Date.now() - ts <= ACTIVE_MS
}
