const crypto = require('crypto');
const axios = require('axios');

const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

function newMid() {
  return 'm_' + crypto.randomBytes(4).toString('hex');
}

/**
 * Hemat API: hanya jalankan ekstraksi jika ada indikasi pembicaraan soal nama/panggilan.
 */
function shouldTryExtractCalling(text) {
  const t = String(text || '').toLowerCase();
  if (t.length < 4) return false;
  return (
    /\bpanggil\b/.test(t) ||
    /\bsapa(n)?\b/.test(t) ||
    /\bpanggilan\b/.test(t) ||
    /\bmanggil\b/.test(t) ||
    /\bdipanggil\b/.test(t) ||
    /\bsebut(a)?\b/.test(t) ||
    /\bnama\s+(saya|aku|gue|gw|kamu|lo|elu|mu|nya)\b/.test(t) ||
    /\b(gue|aku|saya|gw)\s+(mau|ingin)\s+dipanggil\b/.test(t) ||
    /\bpanggil\s+(aku|gue|saya|gw)\b/.test(t) ||
    /\bjulukan\b/.test(t) ||
    /\bnickname\b/.test(t)
  );
}

function tryParseJsonObject(text) {
  const s = String(text || '').trim();
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch {
    return null;
  }
}

function isNearDuplicate(items, line) {
  const L = line.toLowerCase().trim();
  if (L.length < 8) return true;
  for (const m of items) {
    const t = String(m.text || '').toLowerCase();
    if (t === L) return true;
    const n = Math.min(28, L.length, t.length);
    if (n >= 12 && (t.slice(0, n) === L.slice(0, n) || t.includes(L.slice(0, 20)) || L.includes(t.slice(0, 20)))) {
      return true;
    }
  }
  return false;
}

/**
 * Ekstrak kalimat ingatan soal panggilan (siapa memanggil siapa apa).
 */
async function extractCallingMemories({
  userText,
  assistantText,
  roleHint,
  apiKey,
  model,
}) {
  if (!apiKey) return [];
  const who = roleHint === 'tuan' ? 'pemilik akun (Tuan)' : 'lawan bicara di inbox';
  const sys = `Kamu mengekstrak PREFERENSI PANGGILAN dari satu putaran chat WhatsApp.

Pihak yang menulis pesan user: ${who}.

Tugas: Apakah user secara EKSPLISIT menetapkan atau meminta sesuatu tentang:
- bagaimana AI harus memanggil mereka,
- bagaimana mereka memanggil AI,
- nama panggilan / julukan / gelar yang harus dipakai,
- larangan memakai nama/panggilan tertentu?

Jika YA, balas HANYA JSON valid:
{"items":["satu kalimat ingatan singkat bahasa Indonesia, netral, untuk system prompt AI", ...]}
Maksimal 3 item. Satu fakta eksplisit per item. Tanpa markdown.

Jika tidak ada aturan baru yang jelas dari user: {"items":[]}

Jangan menebak. Jangan menyimpulkan dari konteks yang tidak disebut user.`;

  const userBlock = `Pesan user:\n${String(userText).slice(0, 2500)}\n\nBalasan assistant:\n${String(assistantText).slice(0, 1500)}`;

  try {
    const { data } = await axios.post(
      DEEPSEEK_URL,
      {
        model: model || 'deepseek-chat',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: userBlock },
        ],
        temperature: 0.15,
        max_tokens: 400,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );
    const raw = data?.choices?.[0]?.message?.content;
    const parsed = tryParseJsonObject(raw);
    if (!parsed || !Array.isArray(parsed.items)) return [];
    return parsed.items
      .map((x) => String(x || '').trim())
      .filter((x) => x.length >= 6 && x.length <= 500);
  } catch {
    return [];
  }
}

function appendAutoMemories({ db, log, lines, scopeKey }) {
  if (!lines.length) return;
  const sk = String(scopeKey || '__unknown__');
  const data = db.getMemoriesForScope(sk);
  if (!Array.isArray(data.items)) data.items = [];
  let added = 0;
  for (const text of lines) {
    if (isNearDuplicate(data.items, text)) continue;
    data.items.push({
      id: newMid(),
      text,
      at: new Date().toISOString(),
      source: 'auto_calling',
    });
    added += 1;
  }
  if (added > 0) {
    db.replaceMemoriesForScope(sk, data.items);
    log('[memory-auto] +', added, 'ingatan untuk', sk);
  }
}

module.exports = {
  shouldTryExtractCalling,
  extractCallingMemories,
  appendAutoMemories,
};
