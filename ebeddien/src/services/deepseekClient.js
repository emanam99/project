import { deepseekAPI } from './api'

const TOKEN_KEY = 'ebeddien_deepseek_token'
const SESSION_KEY = 'ebeddien_deepseek_session_id'
const PARENT_MSG_KEY = 'ebeddien_deepseek_parent_msg_id'

export function getStoredDeepseekToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function getStoredDeepseekSessionId() {
  try {
    return sessionStorage.getItem(SESSION_KEY) || ''
  } catch {
    return ''
  }
}

export function getStoredDeepseekParentMessageId() {
  try {
    return sessionStorage.getItem(PARENT_MSG_KEY) || ''
  } catch {
    return ''
  }
}

export function setDeepseekParentMessageId(id) {
  try {
    if (id != null && String(id).trim() !== '') sessionStorage.setItem(PARENT_MSG_KEY, String(id))
    else sessionStorage.removeItem(PARENT_MSG_KEY)
  } catch {
    /* ignore */
  }
}

export function setDeepseekAuth(token, sessionId) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
    if (sessionId) sessionStorage.setItem(SESSION_KEY, sessionId)
    else sessionStorage.removeItem(SESSION_KEY)
    if (!sessionId) sessionStorage.removeItem(PARENT_MSG_KEY)
  } catch {
    /* ignore */
  }
}

export function clearDeepseekAuth() {
  setDeepseekAuth('', '')
  setDeepseekParentMessageId('')
}

/**
 * Sesi chat mode alternatif — lewat API PHP → proxy Node di server.
 * @param {string} token
 */
export async function deepseekProxyCreateSession(token) {
  return deepseekAPI.proxySession(token)
}

/**
 * Kirim pesan — lewat API PHP → proxy Node (PoW + jawaban).
 * @param {{ token: string, sessionId: string|number, prompt: string, thinkingEnabled?: boolean, searchEnabled?: boolean, parentMessageId?: string|number, clientUserTurn?: number }} p
 */
export async function deepseekProxyChat(p) {
  const body = {
    token: p.token,
    sessionId: p.sessionId,
    prompt: p.prompt,
    thinkingEnabled: !!p.thinkingEnabled,
    searchEnabled: !!p.searchEnabled,
  }
  if (p.parentMessageId != null && String(p.parentMessageId).trim() !== '') {
    body.parentMessageId = p.parentMessageId
  }
  if (p.clientUserTurn != null && Number.isFinite(Number(p.clientUserTurn))) {
    body.clientUserTurn = Number(p.clientUserTurn)
  }
  return deepseekAPI.proxyChat(body)
}
