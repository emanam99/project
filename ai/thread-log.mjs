/**
 * Log diagnostik rantai percakapan (parent_message_id ↔ lastMessageId).
 * Aktifkan: DEEPSEEK_DEBUG_THREAD=1 di .env (folder ai)
 */

function enabled() {
  return process.env.DEEPSEEK_DEBUG_THREAD === '1';
}

function preview(s, max = 80) {
  if (s == null || typeof s !== 'string') return '(n/a)';
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/**
 * Setelah stream DeepSeek selesai (di dalam deepseek.js).
 */
export function logThreadAfterStream(ctx) {
  if (!enabled()) return;
  const { sessionId, parentMid, streamLastMessageId, clearedParentChain } = ctx;
  console.log('');
  console.log('========== [thread] Node deepseek.js — setelah stream SSE ==========');
  console.log('[thread] chat_session_id:', sessionId ?? '(kosong)');
  console.log('[thread] parent_message_id yang dikirim ke API:', parentMid ?? '(tidak ada — turn pertama atau reset)');
  console.log('[thread] lastMessageId terambil dari stream:', streamLastMessageId ?? '(null)');
  console.log('[thread] clearParentMessageId (retry 422):', !!clearedParentChain);
  printHints({
    parentInRequest: parentMid,
    lastOut: streamLastMessageId,
    clearChain: clearedParentChain,
    userTurn: null
  });
  console.log('====================================================================');
}

/**
 * Request + response di proxy Express (server.mjs).
 */
export function logThreadProxyRoundtrip(ctx) {
  if (!enabled()) return;
  const {
    sessionId,
    parentMessageId,
    promptLen,
    promptPreview: pp,
    result,
    clientUserTurn
  } = ctx;
  const lastId =
    result && typeof result === 'object'
      ? result.lastMessageId ?? result.last_message_id
      : null;
  const clear = result && typeof result === 'object' ? !!result.clearParentMessageId : false;

  console.log('');
  console.log('========== [thread] Proxy /chat — satu putaran (PHP → Node → DeepSeek) ==========');
  console.log('[thread] sessionId:', sessionId);
  console.log('[thread] clientUserTurn (opsional, dari browser):', clientUserTurn ?? '(tidak dikirim)');
  console.log('[thread] parentMessageId dari body request:', parentMessageId ?? '(tidak ada)');
  console.log('[thread] panjang prompt:', promptLen, '| pratinjau:', preview(pp ?? '', 100));
  console.log('[thread] lastMessageId di JSON balasan ke frontend:', lastId ?? '(null)');
  console.log('[thread] clearParentMessageId:', clear);
  printHints({
    parentInRequest: parentMessageId,
    lastOut: lastId,
    clearChain: clear,
    userTurn: clientUserTurn
  });
  console.log('==============================================================================');
}

function printHints({ parentInRequest, lastOut, clearChain, userTurn }) {
  const hints = [];
  if (userTurn != null && userTurn >= 2 && !parentInRequest) {
    hints.push(
      '⚠ Pesan user ke-' +
        userTurn +
        ' tanpa parent_message_id → server DeepSeek bisa memperlakukan sebagai obrolan baru / slot sama, bukan lanjutan utas.'
    );
  }
  if (!lastOut && !clearChain) {
    hints.push(
      '⚠ lastMessageId kosong → browser tidak bisa menyimpan parent untuk pesan berikutnya (rantai putus).'
    );
  }
  if (clearChain) {
    hints.push(
      'ℹ parent ditolak (422), diulang tanpa parent; utas di server bisa “terputus” sampai lastMessageId terisi lagi.'
    );
  }
  if (parentInRequest && lastOut && String(parentInRequest) !== String(lastOut)) {
    hints.push(
      'ℹ parent yang dikirim (' +
        parentInRequest +
        ') ≠ lastMessageId balasan (' +
        lastOut +
        ') — normal: parent = pesan sebelumnya, last = balasan baru.'
    );
  }
  if (hints.length === 0) {
    hints.push('✓ Tidak ada flag anomali pada kombinasi parent / last / clear.');
  }
  hints.forEach((h) => console.log('[thread]', h));
}
