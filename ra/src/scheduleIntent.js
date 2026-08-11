const axios = require('axios');
const { DateTime } = require('luxon');
const relay = require('./relayAgent');
const scheduleTime = require('./scheduleTime');

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

function normalizeRepeatKind(s) {
  const x = String(s || '')
    .toLowerCase()
    .trim();
  if (x === 'daily' || x === 'harian' || x === 'tiap hari' || x === 'everyday' || x === 'every day')
    return 'daily';
  if (x === 'weekly' || x === 'mingguan' || x === 'tiap minggu' || x === 'every week') return 'weekly';
  return 'once';
}

function getScheduleTimeZone() {
  return scheduleTime.getScheduleTimeZone();
}

/** Legacy: tanggal+jam di zona SCHEDULE_TZ. */
function jakartaLocalToUtcIso(dateYmd, timeHm) {
  return scheduleTime.zonedYmdHmToUtcIso(dateYmd, timeHm, getScheduleTimeZone());
}

function resolveScheduleTargetJid(targetToken, aliasesMap) {
  const raw = String(targetToken || '').trim();
  if (!raw) return null;
  const d = digitsOnly(raw);
  if (d.length >= 10 && d.length <= 15 && /^\d+$/.test(d)) return `${d}@c.us`;
  return relay.resolveRelayJidFromAliases(raw, aliasesMap);
}

/**
 * Dari JSON parser AI → parameter insert DB (sekali / harian / mingguan).
 */
function buildScheduleInsertFromAi(sch, zone) {
  const z = zone || scheduleTime.getScheduleTimeZone();
  let repeatKind = normalizeRepeatKind(sch.repeatKind);
  if (!sch.repeatKind && sch.whenIso) repeatKind = 'once';

  let repeatDow =
    sch.repeatDow !== undefined && sch.repeatDow !== null && sch.repeatDow !== ''
      ? Number(sch.repeatDow)
      : null;
  if (!Number.isInteger(repeatDow) || repeatDow < 0 || repeatDow > 6) repeatDow = null;

  const dn = sch.repeatDowName || sch.hari;
  if (repeatDow == null && dn) {
    const p = scheduleTime.parseIndonesianDayToken(dn);
    if (p != null) repeatDow = p;
  }

  let repeatTimeLocal = sch.repeatTimeLocal ? scheduleTime.padTimePart(sch.repeatTimeLocal) : null;

  if (repeatKind === 'once') {
    const w = String(sch.whenIso || '').trim();
    if (!w) return { error: 'Waktu sekali kirim tidak jelas.' };
    return {
      scheduledAtIso: w,
      repeatKind: 'once',
      repeatDow: null,
      repeatTimeLocal: null,
      timezone: z,
    };
  }

  if (sch.whenIso && !repeatTimeLocal) {
    const dt = DateTime.fromISO(String(sch.whenIso), { zone: 'utc' });
    if (dt.isValid) {
      const local = dt.setZone(z);
      repeatTimeLocal = local.toFormat('HH:mm');
      if (repeatKind === 'weekly' && repeatDow == null) {
        repeatDow = scheduleTime.luxonWeekdayToJs(local.weekday);
      }
    }
  }

  if (repeatKind === 'daily') {
    if (!repeatTimeLocal) {
      return { error: 'Jam pengulangan harian tidak jelas (contoh pukul 09:00).' };
    }
    const next = scheduleTime.nextDailyFromNow(repeatTimeLocal, z);
    if (!next) return { error: 'Gagal hitung jadwal harian.' };
    return {
      scheduledAtIso: next,
      repeatKind: 'daily',
      repeatDow: null,
      repeatTimeLocal,
      timezone: z,
    };
  }

  if (repeatKind === 'weekly') {
    if (repeatDow == null) {
      return { error: 'Hari mingguan tidak jelas (mis. setiap Senin).' };
    }
    if (!repeatTimeLocal) {
      return { error: 'Jam pengulangan mingguan tidak jelas.' };
    }
    const next = scheduleTime.nextWeeklyFromNow(repeatDow, repeatTimeLocal, z);
    if (!next) return { error: 'Gagal hitung jadwal mingguan.' };
    return {
      scheduledAtIso: next,
      repeatKind: 'weekly',
      repeatDow,
      repeatTimeLocal,
      timezone: z,
    };
  }

  return { error: 'Jenis pengulangan tidak dikenali.' };
}

/**
 * `.jadwal harian Ra 09:00 teks`
 * `.jadwal mingguan senin Ra 09:00 teks`
 * `.jadwal Ra 2026-03-31 09:00 teks` (sekali)
 */
function parseStrictJadwalCommand(bodySelf) {
  const t = String(bodySelf || '').trim();
  const zone = getScheduleTimeZone();

  const mHarian = t.match(/^\.jadwal\s+harian\s+(\S+)\s+(\d{1,2}:\d{2})\s+([\s\S]+)$/i);
  if (mHarian) {
    const [, target, tim, msg] = mHarian;
    const tl = scheduleTime.padTimePart(tim);
    const scheduledAtIso = scheduleTime.nextDailyFromNow(tl, zone);
    return {
      ok: true,
      target: target.trim(),
      message: msg.trim(),
      scheduledAtIso,
      repeatKind: 'daily',
      repeatDow: null,
      repeatTimeLocal: tl,
      timezone: zone,
    };
  }

  const mWeek = t.match(
    /^\.jadwal\s+mingguan\s+(minggu|ahad|senin|selasa|rabu|kamis|jumat|sabtu)\s+(\S+)\s+(\d{1,2}:\d{2})\s+([\s\S]+)$/i
  );
  if (mWeek) {
    const [, dayWord, target, tim, msg] = mWeek;
    const dow = scheduleTime.parseIndonesianDayToken(dayWord);
    if (dow === null) return { ok: false, error: 'Nama hari tidak dikenali.' };
    const tl = scheduleTime.padTimePart(tim);
    const scheduledAtIso = scheduleTime.nextWeeklyFromNow(dow, tl, zone);
    if (!scheduledAtIso) return { ok: false, error: 'Gagal hitung jadwal mingguan.' };
    return {
      ok: true,
      target: target.trim(),
      message: msg.trim(),
      scheduledAtIso,
      repeatKind: 'weekly',
      repeatDow: dow,
      repeatTimeLocal: tl,
      timezone: zone,
    };
  }

  const mIso = t.match(/^\.jadwal\s+(\S+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s+([\s\S]+)$/i);
  if (mIso) {
    const [, target, ymd, tim, msg] = mIso;
    const scheduledAtIso = scheduleTime.zonedYmdHmToUtcIso(ymd, tim, zone);
    if (!scheduledAtIso) return { ok: false, error: 'Tanggal/jam tidak valid.' };
    return {
      ok: true,
      target: target.trim(),
      message: msg.trim(),
      scheduledAtIso,
      repeatKind: 'once',
      repeatDow: null,
      repeatTimeLocal: null,
      timezone: zone,
    };
  }
  const mDm = t.match(
    /^\.jadwal\s+(\S+)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}:\d{2})\s+([\s\S]+)$/i
  );
  if (mDm) {
    const [, target, dd, mm, yyyy, tim, msg] = mDm;
    const ymd = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    const scheduledAtIso = scheduleTime.zonedYmdHmToUtcIso(ymd, tim, zone);
    if (!scheduledAtIso) return { ok: false, error: 'Tanggal/jam tidak valid.' };
    return {
      ok: true,
      target: target.trim(),
      message: msg.trim(),
      scheduledAtIso,
      repeatKind: 'once',
      repeatDow: null,
      repeatTimeLocal: null,
      timezone: zone,
    };
  }
  return null;
}

function looksLikeScheduleIntent(text) {
  const t = String(text || '');
  if (t.length > 900) return false;
  return /jadwal|jadwalkan|nanti\s+kirim|kirim\s+nanti|besok|lusa|jam\s*\d|pukul\s*\d|tanggal\s+\d|ingatkan|reminder|schedule|set\s*alarm|alarm\s|minggu\s+depan|hari\s+ini|setiap|harian|mingguan|tiap\s+hari|tiap\s+minggu|senin|selasa|rabu|kamis|jumat|sabtu|minggu|ahad/i.test(
    t
  );
}

function formatNowForPrompt() {
  const zone = getScheduleTimeZone();
  const dt = DateTime.now().setZone(zone);
  return {
    utcIso: DateTime.utc().toISO(),
    localHuman: dt.isValid ? dt.toFormat('cccc, dd LLLL yyyy HH:mm', { locale: 'id' }) : dt.toISO(),
    scheduleZone: zone,
  };
}

async function parseScheduleIntent(bodyText, apiKey, model, relayKeys) {
  if (!apiKey || !String(bodyText || '').trim()) {
    return { schedule: false };
  }
  const keys = Array.isArray(relayKeys) ? relayKeys.filter(Boolean).join(', ') : '';
  const { utcIso, localHuman, scheduleZone } = formatNowForPrompt();

  const sys = `Kamu parser untuk penjadwalan kirim pesan WhatsApp. Teks = perintah TUAN (titik di depan sudah dipotong).

Zona waktu jadwal (semua jam lokal TUAN di zona ini): *${scheduleZone}*
- Sekarang UTC: ${utcIso}
- Sekarang lokal (${scheduleZone}): ${localHuman}

Kunci relay terdaftar (tujuan = salah satu ATAU nomor WA 10–15 digit): ${keys || '(kosong — target harus nomor jelas)'}

Tugas: apakah TUAN meminta *menjadwalkan* pengiriman (bukan kirim sekarang)?
schedule=true untuk: jadwal, besok jam X, setiap hari jam Y, setiap Senin jam Z, mingguan, harian, reminder, dll.
schedule=false untuk: kirim sekarang/sampaikan sekarang, obrolan biasa.

Balas HANYA satu objek JSON (tanpa markdown), kunci:
- "schedule": boolean
- "targetName": string — kunci relay atau nomor digit
- "repeatKind": "once" | "daily" | "weekly" — once = satu kali; daily = tiap hari jam sama; weekly = tiap minggu hari tertentu
- "repeatDow": number atau null — hari untuk weekly: 0=Minggu, 1=Senin, … 6=Sabtu (sama JavaScript getDay)
- "repeatTimeLocal": string atau null — "HH:mm" di zona ${scheduleZone} untuk daily/weekly
- "repeatDowName": string atau null — opsional nama hari Indonesia jika repeatDow tidak jelas
- "whenIso": string — untuk once: waktu kirim ISO 8601 UTC, >1 menit dari sekarang. Untuk daily/weekly boleh kosong jika repeatTimeLocal + repeatDow cukup; boleh diisi sebagai petunjuk pertama kali kirim
- "messageToTarget": string — teks siap kirim (natural)
- "ackToTuan": string — konfirmasi hormat ke Tuan/Baginda

Jika tidak yakin: schedule=false dan kosongkan string lain.`;

  try {
    const payload = {
      model: model || 'deepseek-chat',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: String(bodyText).slice(0, 2000) },
      ],
      temperature: 0.15,
      max_tokens: 800,
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
    if (!parsed || typeof parsed.schedule !== 'boolean') {
      return { schedule: false };
    }
    return {
      schedule: !!parsed.schedule,
      targetName: String(parsed.targetName || '').trim(),
      whenIso: String(parsed.whenIso || '').trim(),
      messageToTarget: String(parsed.messageToTarget || '').trim(),
      ackToTuan: String(parsed.ackToTuan || '').trim(),
      repeatKind: parsed.repeatKind,
      repeatDow: parsed.repeatDow,
      repeatTimeLocal: parsed.repeatTimeLocal,
      repeatDowName: parsed.repeatDowName || parsed.hari,
    };
  } catch {
    return { schedule: false };
  }
}

function scheduleCommandsHelpText() {
  const z = getScheduleTimeZone();
  return (
    `*Jadwal kirim pesan* — zona: *${z}* (atur lewat *SCHEDULE_TZ* di .env, contoh Asia/Jakarta)\n\n` +
    `*Sekali kirim:*\n` +
    `_.jadwal Ra 2026-03-31 09:00 Teks..._\n` +
    `_.jadwal Ra 31/03/2026 14:30 Halo..._\n\n` +
    `*Harian* (jam sama tiap hari):\n` +
    `_.jadwal harian Ra 09:00 Pesan..._\n\n` +
    `*Mingguan* (contoh tiap Senin):\n` +
    `_.jadwal mingguan senin Ra 09:00 Pesan..._\n` +
    `_(hari: minggu, senin, … sabtu / ahad)_\n\n` +
    `*Bahasa alami* (dari chat bertitik, setelah relay tidak cocok):\n` +
    `Mis. _setiap hari jam 8 ke Ra: cek progres._ / _tiap Senin 09:00 …_\n\n` +
    `*Relay + waktu (Tuan):* _.bilang ke Ra … 1 jam dari sekarang._ — opsional: minta agar teks *disusun saat kirim* mengikuti gaya & ingatan chat si penerima (jelaskan di kalimat).\n\n` +
    `*Kontak relay (inbox):* _ingatkan aku 1 jam lagi untuk menulis_ → pengingat terjadwal; isi disesuaikan kepribadian/ingatan chat itu.\n\n` +
    `_.jadwalku_ — daftar pending\n` +
    `_.batalkjadwal N_ — batal urutan N\n\n` +
    `_Zona waktu mengikuti SCHEDULE_TZ (default Asia/Jakarta). Jadwal tersimpan per baris; pengulangan memakai jam di zona itu._`
  );
}

module.exports = {
  parseStrictJadwalCommand,
  resolveScheduleTargetJid,
  looksLikeScheduleIntent,
  parseScheduleIntent,
  scheduleCommandsHelpText,
  jakartaLocalToUtcIso,
  getScheduleTimeZone,
  buildScheduleInsertFromAi,
  normalizeRepeatKind,
};
