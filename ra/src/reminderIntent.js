const axios = require('axios');

const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

function tryParseJsonObject(text) {
  const t = String(text || '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Heuristik ringan sebelum panggil API. */
function looksLikeInboxReminder(text) {
  const t = String(text || '');
  if (t.length > 600) return false;
  const hasRemind =
    /ingat(?:kan|i|in)?|inget(?:in)?|remind|pengingat|tolong\s+ingat|jangan\s+lupa|ingetin|ingatin/i.test(
      t
    );
  const hasTime =
    /\d|jam|j\b|menit|mnt|detik|nanti|besok|lusa|pagi|siang|sore|malam|dari\s+sekarang|sejam|setengah\s+jam|an\s+hour|minutes?/i.test(
      t
    );
  return hasRemind && hasTime;
}

/**
 * Pengingat ke diri sendiri (pengirim = penerima nanti), dari kontak relay (inbox).
 */
async function parseInboxReminderIntent(bodyText, apiKey, model, timeContext = {}) {
  if (!apiKey || !String(bodyText || '').trim()) {
    return { reminder: false };
  }
  const zone = String(timeContext.scheduleZone || 'Asia/Jakarta');
  const utcIso = String(timeContext.utcIso || new Date().toISOString());
  const localHuman = String(timeContext.localHuman || utcIso);

  const sys = `Kamu parser untuk pengingat WhatsApp. Teks = permintaan lawan bicara (inbox) — bukan perintah relay "bilang ke orang lain".

Tugas: apakah ia meminta *diingatkan nanti* di chat ini (ke dirinya sendiri)?

Zona waktu: *${zone}*
- Sekarang UTC: ${utcIso}
- Sekarang lokal: ${localHuman}

Bukan pengingat jika: menyuruh menyampaikan ke orang lain (itu relay), obrolan biasa tanpa waktu, atau hanya "ingat ya" tanpa kapan.

Balas HANYA satu objek JSON (tanpa markdown):
- "reminder": boolean
- "whenIso": string — waktu kirim pengingat, ISO 8601 UTC, minimal ~2 menit dari waktu UTC di atas. Hitung dari "1 jam lagi", "30 menit", "besok jam 9", dll.
- "topicText": string — ringkas apa yang diingatkan (untuk AI menyusun nanti), mis. "menulis laporan". Tanpa frasa waktu panjang.
- "ackReply": string — balasan singkat natural ke pengguna (1–2 kalimat) bahwa pengingat dicatat; bahasa Indonesia.

Jika bukan pengingat: reminder=false, whenIso "", topicText "", ackReply "".`;

  try {
    const payload = {
      model: model || 'deepseek-chat',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: String(bodyText).slice(0, 1500) },
      ],
      temperature: 0.15,
      max_tokens: 500,
    };
    const { data } = await axios.post(DEEPSEEK_URL, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 90000,
    });
    const raw = data?.choices?.[0]?.message?.content;
    const parsed = tryParseJsonObject(raw);
    if (!parsed || typeof parsed.reminder !== 'boolean') {
      return { reminder: false };
    }
    return {
      reminder: !!parsed.reminder,
      whenIso: String(parsed.whenIso || '').trim(),
      topicText: String(parsed.topicText || '').trim(),
      ackReply: String(parsed.ackReply || '').trim(),
    };
  } catch {
    return { reminder: false };
  }
}

module.exports = {
  looksLikeInboxReminder,
  parseInboxReminderIntent,
};
