import Dexie from 'dexie'

const db = new Dexie('ebeddien_local_cache')

db.version(1).stores({
  chat_users: '++id,[owner_users_id+user_id],[owner_users_id+updated_at],[owner_users_id+foto_version]',
  chat_conversations: '++id,[owner_users_id+conversation_id],[owner_users_id+peer_id],[owner_users_id+last_at],[owner_users_id+updated_at]',
  chat_messages: '++id,[owner_users_id+message_id],[owner_users_id+conversation_id+created_at],[owner_users_id+peer_id+created_at],[owner_users_id+updated_at]',
  chat_meta: '++id,[owner_users_id+key],[owner_users_id+updated_at]',
})

const nowIso = () => new Date().toISOString()

/** Batas "fresh" cache sebelum boleh skip fetch ke server (stale-while-revalidate). */
export const CHAT_CACHE_TTL_MS = {
  /** Daftar kontak + foto path (GET /chat/users) */
  USERS: 10 * 60 * 1000,
  /** Daftar percakapan (GET /chat/conversations) */
  CONVERSATIONS: 30 * 1000,
  /** Riwayat pesan per room (GET /chat/messages) */
  MESSAGES: 15 * 1000,
}

/**
 * @param {object|null} meta - nilai dari getMeta, harus punya field `at` (ISO string)
 * @param {number} ttlMs
 * @returns {boolean} true jika perlu sync dari server (cache tidak ada atau sudah stale)
 */
export function shouldSyncFromServer(meta, ttlMs) {
  if (!meta?.at) return true
  const t = new Date(meta.at).getTime()
  if (!Number.isFinite(t)) return true
  return Date.now() - t > ttlMs
}

function normalizeFotoUrl(rawPath) {
  const raw = String(rawPath || '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  let path = raw.startsWith('/') ? raw : `/${raw}`
  // File profil pengurus tersimpan di api/uploads/*, bukan root /uploads/*
  if (path === '/uploads' || path.startsWith('/uploads/')) {
    path = `/api${path}`
  }
  if (path === 'uploads' || path.startsWith('uploads/')) {
    path = `/api/${path}`
  }
  return `${window.location.origin}${path}`
}

function normalizeUserRecord(ownerUsersId, user) {
  const userId = Number(user?.id)
  if (!ownerUsersId || !userId) return null
  const fotoProfil = String(user?.foto_profil || '').trim() || null
  const fotoVersion = fotoProfil || null
  return {
    owner_users_id: Number(ownerUsersId),
    user_id: userId,
    username: user?.username || null,
    nama: user?.nama || null,
    display_name: user?.display_name || user?.nama || user?.username || `User ${userId}`,
    foto_profil: fotoProfil,
    foto_version: fotoVersion,
    foto_url: normalizeFotoUrl(fotoProfil),
    last_seen_at: user?.last_seen_at || null,
    updated_at: nowIso(),
  }
}

function normalizeConversationRecord(ownerUsersId, conversation) {
  const conversationId = Number(conversation?.conversation_id)
  if (!ownerUsersId || !conversationId) return null
  const groupPhoto = String(conversation?.group_photo || '').trim() || null
  return {
    owner_users_id: Number(ownerUsersId),
    conversation_id: conversationId,
    peer_id: conversation?.peer_id != null ? Number(conversation.peer_id) : null,
    peer_name: conversation?.peer_name ?? conversation?.name ?? null,
    group_photo: groupPhoto,
    is_self: conversation?.is_self === true,
    last_message: conversation?.last_message ?? null,
    last_at: conversation?.last_at ?? null,
    unread_count: Number(conversation?.unread_count || 0),
    updated_at: nowIso(),
  }
}

function normalizeMessageRecord(ownerUsersId, message, conversationId = null, peerId = null) {
  const messageId = message?.id != null ? Number(message.id) : null
  const createdAt = message?.created_at ?? message?.tanggal_dibuat ?? nowIso()
  if (!ownerUsersId) return null
  const su = message?.sender_username != null ? String(message.sender_username).trim() : ''
  const sd = message?.sender_display_name != null ? String(message.sender_display_name).trim() : ''
  return {
    owner_users_id: Number(ownerUsersId),
    message_id: Number.isFinite(messageId) && messageId > 0 ? messageId : null,
    local_temp_id: message?.tempId != null ? String(message.tempId) : null,
    conversation_id: conversationId != null ? Number(conversationId) : (message?.conversation_id != null ? Number(message.conversation_id) : null),
    peer_id: peerId != null ? Number(peerId) : (message?.peer_id != null ? Number(message.peer_id) : null),
    sender_id: message?.sender_id != null ? Number(message.sender_id) : (message?.from_user_id != null ? Number(message.from_user_id) : null),
    to_user_id: message?.to_user_id != null ? Number(message.to_user_id) : null,
    message: String(message?.message || ''),
    created_at: createdAt,
    sender_username: su || null,
    sender_display_name: sd || null,
    updated_at: nowIso(),
  }
}

export const chatDexieStore = {
  async upsertUsers(ownerUsersId, users = []) {
    const rows = users.map((u) => normalizeUserRecord(ownerUsersId, u)).filter(Boolean)
    if (rows.length === 0) return
    await db.transaction('rw', db.chat_users, async () => {
      for (const row of rows) {
        const existing = await db.chat_users
          .where('[owner_users_id+user_id]')
          .equals([row.owner_users_id, row.user_id])
          .first()
        if (existing?.id) await db.chat_users.update(existing.id, row)
        else await db.chat_users.add(row)
      }
    })
  },

  async getUsers(ownerUsersId) {
    if (!ownerUsersId) return []
    return db.chat_users
      .where('[owner_users_id+updated_at]')
      .between([Number(ownerUsersId), Dexie.minKey], [Number(ownerUsersId), Dexie.maxKey])
      .reverse()
      .sortBy('updated_at')
  },

  async upsertConversations(ownerUsersId, conversations = []) {
    const rows = conversations.map((c) => normalizeConversationRecord(ownerUsersId, c)).filter(Boolean)
    if (rows.length === 0) return
    await db.transaction('rw', db.chat_conversations, async () => {
      for (const row of rows) {
        const existing = await db.chat_conversations
          .where('[owner_users_id+conversation_id]')
          .equals([row.owner_users_id, row.conversation_id])
          .first()
        if (existing?.id) await db.chat_conversations.update(existing.id, row)
        else await db.chat_conversations.add(row)
      }
    })
  },

  async getConversations(ownerUsersId) {
    if (!ownerUsersId) return []
    const rows = await db.chat_conversations
      .where('[owner_users_id+updated_at]')
      .between([Number(ownerUsersId), Dexie.minKey], [Number(ownerUsersId), Dexie.maxKey])
      .toArray()
    return rows.sort((a, b) => {
      const ta = a.last_at ? new Date(a.last_at).getTime() : 0
      const tb = b.last_at ? new Date(b.last_at).getTime() : 0
      return tb - ta
    })
  },

  async upsertMessages(ownerUsersId, messages = [], options = {}) {
    const conversationId = options.conversationId != null ? Number(options.conversationId) : null
    const peerId = options.peerId != null ? Number(options.peerId) : null
    const rows = messages.map((m) => normalizeMessageRecord(ownerUsersId, m, conversationId, peerId)).filter(Boolean)
    if (rows.length === 0) return
    await db.transaction('rw', db.chat_messages, async () => {
      for (const row of rows) {
        if (row.message_id) {
          const existing = await db.chat_messages
            .where('[owner_users_id+message_id]')
            .equals([row.owner_users_id, row.message_id])
            .first()
          if (existing?.id) await db.chat_messages.update(existing.id, row)
          else await db.chat_messages.add(row)
        } else {
          await db.chat_messages.add(row)
        }
      }
    })
  },

  async getMessages(ownerUsersId, options = {}) {
    if (!ownerUsersId) return []
    const conversationId = options.conversationId != null ? Number(options.conversationId) : null
    const peerId = options.peerId != null ? Number(options.peerId) : null
    const limit = Number(options.limit || 20)
    const beforeCreatedAt = options.beforeCreatedAt ? String(options.beforeCreatedAt) : null
    let rows = []
    if (conversationId) {
      rows = await db.chat_messages
        .where('[owner_users_id+conversation_id+created_at]')
        .between([Number(ownerUsersId), conversationId, Dexie.minKey], [Number(ownerUsersId), conversationId, Dexie.maxKey])
        .toArray()
    } else if (peerId) {
      rows = await db.chat_messages
        .where('[owner_users_id+peer_id+created_at]')
        .between([Number(ownerUsersId), peerId, Dexie.minKey], [Number(ownerUsersId), peerId, Dexie.maxKey])
        .toArray()
    }
    rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    if (beforeCreatedAt) {
      rows = rows.filter((r) => String(r.created_at || '') < beforeCreatedAt)
      rows = rows.slice(-Math.max(1, limit))
    } else {
      rows = rows.slice(-Math.max(1, limit))
    }
    return rows.map((r) => ({
      id: r.message_id ?? r.local_temp_id,
      conversation_id: r.conversation_id,
      peer_id: r.peer_id,
      sender_id: r.sender_id,
      to_user_id: r.to_user_id,
      message: r.message,
      created_at: r.created_at,
      tempId: r.local_temp_id ?? undefined,
      sender_username: r.sender_username ?? undefined,
      sender_display_name: r.sender_display_name ?? undefined,
    }))
  },

  async setMeta(ownerUsersId, key, value) {
    if (!ownerUsersId || !key) return
    const existing = await db.chat_meta.where('[owner_users_id+key]').equals([Number(ownerUsersId), String(key)]).first()
    const row = {
      owner_users_id: Number(ownerUsersId),
      key: String(key),
      value: value == null ? null : JSON.stringify(value),
      updated_at: nowIso(),
    }
    if (existing?.id) await db.chat_meta.update(existing.id, row)
    else await db.chat_meta.add(row)
  },

  async getMeta(ownerUsersId, key) {
    if (!ownerUsersId || !key) return null
    const existing = await db.chat_meta.where('[owner_users_id+key]').equals([Number(ownerUsersId), String(key)]).first()
    if (!existing?.value) return null
    try {
      return JSON.parse(existing.value)
    } catch {
      return null
    }
  },

  /** Hapus cache lokal satu room (percakapan + pesan + meta sync) setelah keluar/hapus di server. */
  async removeConversationRoom(ownerUsersId, options = {}) {
    if (!ownerUsersId) return
    const conversationId = options.conversationId != null ? Number(options.conversationId) : null
    const peerId = options.peerId != null ? Number(options.peerId) : null
    const oid = Number(ownerUsersId)
    await db.transaction('rw', db.chat_conversations, db.chat_messages, db.chat_meta, async () => {
      if (conversationId) {
        const convRows = await db.chat_conversations
          .where('[owner_users_id+conversation_id]')
          .equals([oid, conversationId])
          .toArray()
        if (convRows.length) await db.chat_conversations.bulkDelete(convRows.map((r) => r.id))
        const msgRows = await db.chat_messages
          .where('[owner_users_id+conversation_id+created_at]')
          .between([oid, conversationId, Dexie.minKey], [oid, conversationId, Dexie.maxKey])
          .toArray()
        if (msgRows.length) await db.chat_messages.bulkDelete(msgRows.map((r) => r.id))
      }
      if (peerId) {
        const msgPeer = await db.chat_messages
          .where('[owner_users_id+peer_id+created_at]')
          .between([oid, peerId, Dexie.minKey], [oid, peerId, Dexie.maxKey])
          .toArray()
        if (msgPeer.length) await db.chat_messages.bulkDelete(msgPeer.map((r) => r.id))
      }
      const keys = []
      if (conversationId) keys.push(`last_messages_sync_${conversationId}`)
      if (peerId) keys.push(`last_messages_sync_peer_${peerId}`)
      for (const key of keys) {
        const row = await db.chat_meta.where('[owner_users_id+key]').equals([oid, key]).first()
        if (row?.id) await db.chat_meta.delete(row.id)
      }
    })
  },

  async pruneOldData(ownerUsersId, options = {}) {
    if (!ownerUsersId) return
    const now = Date.now()
    const messagesMaxAgeMs = Number(options.messagesMaxAgeMs || 30 * 24 * 60 * 60 * 1000) // 30 hari
    const usersMaxAgeMs = Number(options.usersMaxAgeMs || 90 * 24 * 60 * 60 * 1000) // 90 hari
    const conversationsMaxAgeMs = Number(options.conversationsMaxAgeMs || 90 * 24 * 60 * 60 * 1000) // 90 hari
    const metaMaxAgeMs = Number(options.metaMaxAgeMs || 30 * 24 * 60 * 60 * 1000) // 30 hari

    const users = await db.chat_users.where('[owner_users_id+updated_at]')
      .between([Number(ownerUsersId), Dexie.minKey], [Number(ownerUsersId), Dexie.maxKey])
      .toArray()
    const usersDeleteIds = users
      .filter((r) => (now - new Date(r.updated_at || 0).getTime()) > usersMaxAgeMs)
      .map((r) => r.id)

    const conversations = await db.chat_conversations.where('[owner_users_id+updated_at]')
      .between([Number(ownerUsersId), Dexie.minKey], [Number(ownerUsersId), Dexie.maxKey])
      .toArray()
    const conversationsDeleteIds = conversations
      .filter((r) => (now - new Date(r.updated_at || 0).getTime()) > conversationsMaxAgeMs)
      .map((r) => r.id)

    const messages = await db.chat_messages.where('[owner_users_id+updated_at]')
      .between([Number(ownerUsersId), Dexie.minKey], [Number(ownerUsersId), Dexie.maxKey])
      .toArray()
    const messagesDeleteIds = messages
      .filter((r) => (now - new Date(r.updated_at || 0).getTime()) > messagesMaxAgeMs)
      .map((r) => r.id)

    const meta = await db.chat_meta.where('[owner_users_id+updated_at]')
      .between([Number(ownerUsersId), Dexie.minKey], [Number(ownerUsersId), Dexie.maxKey])
      .toArray()
    const metaDeleteIds = meta
      .filter((r) => (now - new Date(r.updated_at || 0).getTime()) > metaMaxAgeMs)
      .map((r) => r.id)

    await db.transaction('rw', db.chat_users, db.chat_conversations, db.chat_messages, db.chat_meta, async () => {
      if (usersDeleteIds.length) await db.chat_users.bulkDelete(usersDeleteIds)
      if (conversationsDeleteIds.length) await db.chat_conversations.bulkDelete(conversationsDeleteIds)
      if (messagesDeleteIds.length) await db.chat_messages.bulkDelete(messagesDeleteIds)
      if (metaDeleteIds.length) await db.chat_meta.bulkDelete(metaDeleteIds)
    })
  },
}

export default chatDexieStore
