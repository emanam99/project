/** Selaras api/src/Helpers/AiAssistantReplyStyleHelper.php */
export const EBEDDIEN_AI_SPLIT_MARKER = '---EBEDDIEN_SPLIT---'

/**
 * @param {string} text
 * @returns {string[]}
 */
export function splitAiReplyForBubbles(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return []
  if (!raw.includes(EBEDDIEN_AI_SPLIT_MARKER)) {
    return [raw]
  }
  return raw
    .split(EBEDDIEN_AI_SPLIT_MARKER)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * @param {string} content
 * @param {string[]|null|undefined} replyParts dari API
 * @returns {string[]}
 */
export function resolveAssistantReplyParts(content, replyParts) {
  if (Array.isArray(replyParts) && replyParts.length > 0) {
    return replyParts.map((s) => String(s ?? '').trim()).filter(Boolean)
  }
  return splitAiReplyForBubbles(content)
}

/**
 * @param {string} content
 * @param {string[]|null|undefined} replyParts
 * @param {{ thinking?: string, msgId: () => string }} opts
 * @returns {object[]}
 */
export function buildAssistantMessageRows(content, replyParts, { thinking, msgId }) {
  const parts = resolveAssistantReplyParts(content, replyParts)
  const now = new Date().toISOString()
  if (parts.length === 0) {
    return [
      {
        id: msgId(),
        role: 'assistant',
        content: '_(tidak ada teks)_',
        thinking: thinking || undefined,
        createdAt: now
      }
    ]
  }
  return parts.map((part, i) => ({
    id: msgId(),
    role: 'assistant',
    content: part,
    thinking: i === 0 ? thinking || undefined : undefined,
    createdAt: now
  }))
}
