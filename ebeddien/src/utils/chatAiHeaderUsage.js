/** Sinkron count AI (hari ini / limit) antara DeepseekChat dan Header */
export const CHAT_AI_USAGE_HEADER_EVENT = 'ebeddien-chat-ai-usage-updated'

export function dispatchChatAiUsageHeaderUpdate(aiTodayCount, aiDailyLimit) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(CHAT_AI_USAGE_HEADER_EVENT, {
      detail: {
        aiTodayCount: Math.max(0, Number(aiTodayCount) || 0),
        aiDailyLimit: Math.max(0, Number(aiDailyLimit) || 0),
      },
    })
  )
}
