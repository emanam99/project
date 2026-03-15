/**
 * Warmer job: fetch active pairs dari API PHP, kirim pesan bolak-balik dengan jeda & typing.
 * Pakai Baileys jika connected; fallback Puppeteer (whatsapp-web.js) agar warmer jalan setelah Langkah 1 saja.
 */
import { getWaStatus } from '../store/waStatus.js';
import { sendMessageWithTypingBaileys, sendMessageBaileys, isBaileysConnected } from './waBaileys.js';
import { isPuppeteerReady, sendMessagePuppeteer } from './whatsappController.js';

const apiBase = (process.env.UWABA_API_BASE_URL || '').trim().replace(/\/$/, '');
const apiKey = (process.env.WA_API_KEY || '').trim();

let warmerRunning = false;
let warmerAbort = false;
const pairCounts = {}; // pairId -> conversations count
const pairRestUntil = {}; // pairId -> timestamp ms
/** Urutan pick skrip / pesan per pasangan+tema (import pertama dulu) */
const pickConversationIndex = {}; // key -> integer
const pickMessageIndex = {}; // key -> integer

function getPairsUrl() {
  if (!apiBase) return null;
  const base = apiBase.endsWith('/api') ? apiBase : apiBase + '/api';
  return base + '/warmer/runner/pairs';
}

function getPickMessageUrl(category, language, index = 0) {
  if (!apiBase) return null;
  const base = apiBase.endsWith('/api') ? apiBase : apiBase + '/api';
  return base + '/warmer/runner/pick-message?category=' + encodeURIComponent(category || 'education') + '&language=' + encodeURIComponent(language || 'id') + '&index=' + index;
}

function getPickConversationUrl(category, language, index = 0) {
  if (!apiBase) return null;
  const base = apiBase.endsWith('/api') ? apiBase : apiBase + '/api';
  return base + '/warmer/runner/pick-conversation?category=' + encodeURIComponent(category || 'education') + '&language=' + encodeURIComponent(language || 'id') + '&index=' + index;
}

async function fetchPairs() {
  const url = getPairsUrl();
  if (!url || !apiKey) return [];
  try {
    const res = await fetch(url, { headers: { 'X-API-Key': apiKey } });
    if (!res.ok) return [];
    const data = await res.json();
    return data?.data || [];
  } catch (e) {
    console.warn('[Warmer] fetch pairs error:', e?.message);
    return [];
  }
}

async function pickMessage(category, language, index = 0) {
  const url = getPickMessageUrl(category, language, index);
  if (!url || !apiKey) return null;
  try {
    const res = await fetch(url, { headers: { 'X-API-Key': apiKey } });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.data?.content;
    return typeof content === 'string' ? content : null;
  } catch (e) {
    return null;
  }
}

/** Ambil satu skrip percakapan utuh [ { from: 1|2, text }, ... ]. Kosong jika tidak ada. */
async function pickConversation(category, language, index = 0) {
  const url = getPickConversationUrl(category, language, index);
  if (!url || !apiKey) return [];
  try {
    const res = await fetch(url, { headers: { 'X-API-Key': apiKey } });
    if (!res.ok) return [];
    const data = await res.json();
    const list = data?.data;
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Durasi notif mengetik (detik) sesuai panjang tulisan: pendek = lebih singkat, panjang = lebih lama. */
function typingSecondsFromText(text) {
  const len = typeof text === 'string' ? text.trim().length : 0;
  const base = len <= 0 ? 1 : Math.min(8, 1 + Math.ceil(len / 25));
  const jitter = randomBetween(0, 1);
  return Math.max(1, Math.min(10, base + jitter * 0.5));
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function runPairLoop(pair) {
  const id = pair.id;
  const session1 = pair.session_id_1 || 'default';
  const session2 = pair.session_id_2;
  // Key unik per pasangan agar count/rest tidak tertukar antar pasangan (2 pasang = 2 slot state terpisah)
  const pairKey = (id != null && id !== '') ? String(id) : `${session1}_${session2}`;
  const waitMin = Math.max(5, Math.min(90, pair.wait_min_sec || 5));
  const waitMax = Math.max(waitMin, Math.min(90, pair.wait_max_sec || 90));
  const stopAfter = Math.max(1, pair.stop_after_conversations || 200);
  const restMinutes = Math.max(1, Math.min(120, pair.rest_minutes || 15));
  const useTyping = !!pair.use_typing;
  const category = pair.category || 'education';
  const language = pair.language || 'id';
  const seqKey = `${pairKey}_${category}`;
  if (pickConversationIndex[seqKey] == null) pickConversationIndex[seqKey] = 0;
  if (pickMessageIndex[seqKey] == null) pickMessageIndex[seqKey] = 0;

  const status = getWaStatus();
  const sessions = status.sessions || {};
  const phone1 = sessions[session1]?.baileysPhoneNumber || sessions[session1]?.phoneNumber;
  const phone2 = sessions[session2]?.baileysPhoneNumber || sessions[session2]?.phoneNumber;
  if (!phone1 || !phone2) {
    console.warn('[Warmer] Pair', pairKey, 'skip: nomor tidak tersedia');
    return;
  }
  const useBaileys = isBaileysConnected(session1) && isBaileysConnected(session2);
  const usePuppeteer = isPuppeteerReady(session1) && isPuppeteerReady(session2);
  if (!useBaileys && !usePuppeteer) {
    console.warn('[Warmer] Pair', pairKey, 'skip: Baileys/Puppeteer belum connected');
    return;
  }

  let count = pairCounts[pairKey] != null ? pairCounts[pairKey] : 0;
  const restUntil = pairRestUntil[pairKey] || 0;

  if (Date.now() < restUntil) return;

  if (count >= stopAfter) {
    pairCounts[pairKey] = 0;
    pairRestUntil[pairKey] = Date.now() + restMinutes * 60 * 1000;
    console.log('[Warmer] Pair', pairKey, 'berhenti setelah', stopAfter, 'percakapan, istirahat', restMinutes, 'menit');
    return;
  }

  const convIdx = pickConversationIndex[seqKey];
  const conversation = await pickConversation(category, language, convIdx);
  if (conversation.length > 0) {
    pickConversationIndex[seqKey] = convIdx + 1;
    for (let i = 0; i < conversation.length; i++) {
      if (warmerAbort) return;
      const item = conversation[i];
      const from = item.from === 2 ? 2 : 1;
      const text = (item.text && String(item.text).trim()) || (from === 1 ? 'Ok.' : 'Sip.');
      const typingSec = useTyping ? typingSecondsFromText(text) : 0;
      const isFrom1 = from === 1;
      const senderSession = isFrom1 ? session1 : session2;
      const targetPhone = isFrom1 ? phone2 : phone1;
      try {
        if (useBaileys) {
          if (useTyping) {
            await sendMessageWithTypingBaileys(senderSession, targetPhone, text, typingSec);
          } else {
            await sendMessageBaileys(senderSession, targetPhone, text, null, null);
          }
        } else {
          if (useTyping) await delay(typingSec * 1000);
          const res = await sendMessagePuppeteer(senderSession, targetPhone, text);
          if (!res?.ok) throw new Error(res?.error || 'Kirim gagal');
        }
      } catch (e) {
        console.warn('[Warmer] Pair', pairKey, 'send', from, 'error:', e?.message);
        return;
      }
      count++;
      pairCounts[pairKey] = count;
      if (i < conversation.length - 1) {
        const waitSec = randomBetween(waitMin, waitMax);
        await delay(waitSec * 1000);
      }
    }
    return;
  }

  // Fallback: pesan tunggal berurutan created_at (index, index+1)
  const msgIdx = pickMessageIndex[seqKey];
  const msg = await pickMessage(category, language, msgIdx);
  pickMessageIndex[seqKey] = msgIdx + 1;
  const text = (msg && msg.trim()) || 'Ok.';
  const typingSec = useTyping ? typingSecondsFromText(text) : 0;
  try {
    if (useBaileys) {
      if (useTyping) {
        await sendMessageWithTypingBaileys(session1, phone2, text, typingSec);
      } else {
        await sendMessageBaileys(session1, phone2, text, null, null);
      }
    } else {
      if (useTyping) await delay(typingSec * 1000);
      const res = await sendMessagePuppeteer(session1, phone2, text);
      if (!res?.ok) throw new Error(res?.error || 'Kirim gagal');
    }
    count++;
    pairCounts[pairKey] = count;
  } catch (e) {
    console.warn('[Warmer] Pair', pairKey, 'send 1->2 error:', e?.message);
    return;
  }

  const waitSec = randomBetween(waitMin, waitMax);
  await delay(waitSec * 1000);
  if (warmerAbort) return;

  let msg2 = await pickMessage(category, language, pickMessageIndex[seqKey]);
  pickMessageIndex[seqKey] = (pickMessageIndex[seqKey] || 0) + 1;
  let text2 = (msg2 && msg2.trim()) || 'Sip.';
  if (text2 === text) text2 = 'Waalaikumsalam.';
  const typingSec2 = useTyping ? typingSecondsFromText(text2) : 0;
  try {
    if (useBaileys) {
      if (useTyping) {
        await sendMessageWithTypingBaileys(session2, phone1, text2, typingSec2);
      } else {
        await sendMessageBaileys(session2, phone1, text2, null, null);
      }
    } else {
      if (useTyping) await delay(typingSec2 * 1000);
      const res = await sendMessagePuppeteer(session2, phone1, text2);
      if (!res?.ok) throw new Error(res?.error || 'Kirim gagal');
    }
    count++;
    pairCounts[pairKey] = count;
  } catch (e) {
    console.warn('[Warmer] Pair', pairKey, 'send 2->1 error:', e?.message);
  }
}

async function warmerLoop() {
  if (!apiBase || !apiKey) {
    console.warn('[Warmer] UWABA_API_BASE_URL atau WA_API_KEY tidak di-set');
    return;
  }
  let pairs = await fetchPairs();
  if (pairs.length === 0) {
    if (warmerRunning && !warmerAbort) setTimeout(warmerLoop, 60000);
    return;
  }
  // Satu pasangan hanya jalan sekali per putaran (hindari duplikat dari API / pesan ganda)
  const seen = new Set();
  pairs = pairs.filter((p) => {
    const key = (p.id != null && p.id !== '') ? String(p.id) : `${p.session_id_1 || 'default'}_${p.session_id_2}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Jalankan semua pasangan dalam satu putaran (paralel) agar pasangan ke-2 dan seterusnya ikut jalan
  await Promise.all(pairs.map((pair) => runPairLoop(pair).catch((e) => {
    console.warn('[Warmer] Pair', pair.id ?? `${pair.session_id_1}_${pair.session_id_2}`, 'error:', e?.message);
  })));
  if (warmerRunning && !warmerAbort) {
    setTimeout(warmerLoop, 60000);
  }
}

export function isWarmerRunning() {
  return warmerRunning;
}

export function startWarmer() {
  if (warmerRunning) return { success: true, message: 'Warmer sudah berjalan' };
  warmerRunning = true;
  warmerAbort = false;
  warmerLoop().catch((e) => {
    console.error('[Warmer] Loop error:', e?.message);
    warmerRunning = false;
  });
  return { success: true, message: 'Warmer dimulai' };
}

export function stopWarmer() {
  warmerAbort = true;
  warmerRunning = false;
  return { success: true, message: 'Warmer dihentikan' };
}

export function getWarmerStatus() {
  return {
    running: warmerRunning,
    pairCounts: { ...pairCounts },
    pairRestUntil: { ...pairRestUntil },
  };
}
