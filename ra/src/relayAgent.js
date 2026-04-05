const axios = require('axios');

const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}

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

/**
 * Deteksi perintah "bilang ke X / sampaikan …" + opsional *kapan* kirim (terjadwal / relatif).
 * @param {object} [timeContext] — { scheduleZone, utcIso, localHuman }
 */
async function parseRelayIntent(bodyText, apiKey, model, timeContext = {}) {
  if (!apiKey || !String(bodyText || '').trim()) {
    return { relay: false };
  }
  const zone = String(timeContext.scheduleZone || 'Asia/Jakarta');
  const utcIso = String(timeContext.utcIso || new Date().toISOString());
  const localHuman = String(timeContext.localHuman || utcIso);

  const sys = `Kamu parser untuk agen WhatsApp. Teks berikut adalah perintah TUAN (tanpa titik di depan; titik sudah dipotong — mis. ".bilang ke Ra ..." datang sebagai "bilang ke Ra ...").

Tugas: tentukan apakah TUAN meminta menyampaikan/menginformasikan/mengabarkan sesuatu kepada orang lain lewat *relay* (kontak terdaftar).

PENTING — target "targetName":
- Hanya KUNCI relay yang tuan daftarkan (contoh: Ra, Budi). Huruf besar/kecil bebas.
- Bukan nomor mentah kecuali itu memang nama kunci.

Waktu kirim (zona jadwal: *${zone}*):
- Sekarang UTC: ${utcIso}
- Sekarang lokal (${zone}): ${localHuman}
- "deliverNow": true → kirim *segera* (default jika tidak ada penundaan).
- "deliverNow": false → kirim *nanti*; WAJIB isi "whenIso" (ISO 8601 **UTC**, contoh 2026-03-30T05:00:00.000Z) hasil hitung dari kalimat tuan.
- Contoh penundaan: "1 jam dari sekarang", "30 menit lagi", "besok jam 9", "nanti malam jam 8", "lusa pagi" → konversi benar ke whenIso UTC, minimal ~2 menit setelah waktu UTC di atas.
- Jika tuan ingin nanti tapi waktu tidak bisa ditentukan → deliverNow false, whenIso "" (biar sistem minta perjelas).

"messageToTarget":
- Hanya isi yang akan dibaca penerima. *Jangan* sertakan frasa jadwal/waktu ("1 jam lagi", "besok", dll).

"composePersonality" (hanya relevan jika kirim *dijadwalkan* / whenIso di masa depan):
- true → WAJIB untuk: puisi, pantun, syair, cerita/dongeng, ucapan panjang, atau apa pun yang harus *dibuat* nanti (bukan sekadar menyalin satu kalimat). Pada waktu kirim sistem menyusun teks utuh dengan *kepribadian + ingatan* penerima. Isi "messageToTarget" sebagai *permintaan/inti* (tema, gaya, untuk siapa) — jangan tulis puisi utuh di sini.
- false → hanya jika Tuan minta meneruskan *teks pasti* (nomor/OTP/link/kutipan panjang) persis. Pada waktu kirim "messageToTarget" dikirim apa adanya.
- Default bila ragu untuk jadwal: true.

Balas HANYA satu objek JSON valid (tanpa markdown), kunci:
- "relay": boolean
- "targetName": string
- "deliverNow": boolean
- "whenIso": string — kosong jika kirim sekarang; jika dijadwalkan, waktu kirim UTC lengkap
- "composePersonality": boolean
- "ackToTuan": string — hormat ke Tuan/Baginda; jika dijadwalkan, sebut bahwa pesan akan dikirim nanti (boleh sebut jam manusia di zona ${zone})
- "messageToTarget": string — teks untuk penerima saja

relay=true untuk: bilang ke, sampaikan ke, kabarkan ke, ceritakan ke, infokan ke, kasih tau ke, tolong bilang, minta sampaikan, suruh bilang, beritahu, kabari, sampaikan pesan, dll.

relay=false untuk obrolan biasa tanpa menyuruh menyampaikan ke orang relay.

Bahasa Indonesia untuk ackToTuan dan messageToTarget kecuali tuan pakai bahasa lain.`;

  try {
    const payload = {
      model: model || 'deepseek-chat',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: String(bodyText).slice(0, 2000) },
      ],
      temperature: 0.2,
      max_tokens: 1000,
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
    if (!parsed || typeof parsed.relay !== 'boolean') {
      return { relay: false };
    }
    const whenIso = String(parsed.whenIso || '').trim();
    let deliverNow = parsed.deliverNow !== false;
    if (whenIso && !Number.isNaN(Date.parse(whenIso))) {
      const ms = Date.parse(whenIso);
      if (ms > Date.now() + 60000) deliverNow = false;
    }
    return {
      relay: !!parsed.relay,
      targetName: String(parsed.targetName || '').trim(),
      ackToTuan: String(parsed.ackToTuan || '').trim(),
      messageToTarget: String(parsed.messageToTarget || '').trim(),
      deliverNow,
      whenIso,
      composePersonality: !!parsed.composePersonality,
    };
  } catch {
    return { relay: false };
  }
}

function loadRelayAliases(db) {
  const a = db.getRelayAliasesMap();
  return a && typeof a === 'object' ? a : {};
}

/**
 * Hanya kirim relay jika targetName sama (case-insensitive) dengan KUNCI di aliases,
 * dan nilai adalah nomor (10–15 digit) atau JID ...@c.us
 */
function resolveRelayJidFromAliases(targetName, aliases) {
  if (!targetName || !aliases || typeof aliases !== 'object') return null;
  const t = String(targetName).trim().toLowerCase();
  const key = Object.keys(aliases).find((k) => String(k).trim().toLowerCase() === t);
  if (!key) return null;
  const v = aliases[key];
  if (v == null || String(v).trim() === '') return null;
  const val = String(v).trim();
  if (val.includes('@')) {
    const cleaned = val.replace(/\s/g, '');
    if (/^\d+@c\.us$/i.test(cleaned)) return cleaned;
    return null;
  }
  const d = digitsOnly(val);
  if (d.length >= 10 && d.length <= 15) return `${d}@c.us`;
  return null;
}

module.exports = {
  parseRelayIntent,
  loadRelayAliases,
  resolveRelayJidFromAliases,
};
