require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { openAndInit } = require('./database');
const { createSelfAdmin } = require('./selfAdmin');
const relay = require('./relayAgent');
const scheduleIntent = require('./scheduleIntent');
const scheduleTime = require('./scheduleTime');
const reminderIntent = require('./reminderIntent');
const memoryAuto = require('./memoryAuto');
const {
  memoryScopeKeyFromCanonical,
  scopeKeyToAssistantJid,
  scopeKeyFromRelayTarget,
} = require('./memoryScope');

const ROOT = path.join(__dirname, '..');
const SESSION_PATH = path.join(ROOT, 'data', 'whatsapp-session');

function resolveChromeExecutable() {
  if (process.env.CHROME_PATH && process.env.CHROME_PATH.trim()) {
    return process.env.CHROME_PATH.trim();
  }
  const fsSync = require('fs');
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
    for (const p of candidates) {
      if (p && fsSync.existsSync(p)) return p;
    }
  }
  if (process.platform === 'linux') {
    for (const p of [
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
    ]) {
      if (fsSync.existsSync(p)) return p;
    }
    const cacheBase = path.join(process.env.HOME || '', '.cache', 'puppeteer', 'chrome');
    if (fsSync.existsSync(cacheBase)) {
      const vers = fsSync.readdirSync(cacheBase).filter((n) => /^\d/.test(n)).sort().reverse();
      for (const v of vers) {
        const chrome = path.join(cacheBase, v, 'chrome-linux64', 'chrome');
        if (fsSync.existsSync(chrome)) return chrome;
      }
    }
  }
  return undefined;
}

const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
const HISTORY_TAIL = 5;
const MAX_MESSAGES_PER_CHAT = 500;

function log(...args) {
  const ts = new Date().toISOString();
  console.log(`[${ts}]`, ...args);
}

function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}

function parseOwnerNumbers() {
  const raw = process.env.OWNER_NUMBERS || '';
  return raw
    .split(/[,\s]+/)
    .map((x) => digitsOnly(x))
    .filter(Boolean);
}

function jidToDigits(jid) {
  if (!jid || typeof jid !== 'string') return '';
  const part = jid.split('@')[0] || '';
  return digitsOnly(part.split(':')[0]);
}

/** Relay terjadwal: kirim `body` mentah hanya bila perintah Tuan jelas-jelas literal (OTP, URL, kutip panjang). */
function scheduledRelayShouldUsePlainBody(bodyRaw) {
  const s = String(bodyRaw || '');
  if (/\b(otp|kode\s+verifikasi|password|pin\b|http|https:\/\/)/i.test(s)) return true;
  if (/persis\s|apa\s+adanya|jangan\s+diubah|teks\s+ini\s+persis|copy\s+paste\s+ini/i.test(s))
    return true;
  if (/["'`][^"'`]{80,}["'`]/.test(s)) return true;
  return false;
}

function lastNForApi(entries, n) {
  const slice = entries.slice(-n);
  return slice.map(({ role, content }) => ({
    role: role === 'assistant' ? 'assistant' : 'user',
    content,
  }));
}

async function callDeepSeek(personality, apiMessages, opts = {}) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY kosong (isi di .env)');

  const payload = {
    model: personality.model || 'deepseek-chat',
    messages: apiMessages,
    temperature: 0.7,
  };
  if (opts.maxTokens != null && Number.isFinite(opts.maxTokens)) {
    payload.max_tokens = Math.min(8192, Math.max(256, opts.maxTokens));
  }

  const { data } = await axios.post(
    DEEPSEEK_URL,
    payload,
    {
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    }
  );

  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Respons DeepSeek tidak berisi teks');
  return String(text).trim();
}

function isOwnerCommandAllowed(msg, myDigits, ownerDigitsList) {
  if (!msg.fromMe) return false;
  if (ownerDigitsList.length === 0) return true;
  return ownerDigitsList.includes(myDigits);
}

/**
 * WhatsApp sering memakai @lid dan @c.us untuk kontak yang sama.
 * Satukan agar .aktif / pengecekan AI cocok dengan pesan masuk apa pun.
 */
async function getAliasBundle(client, chatSerializedId) {
  const aliases = new Set([chatSerializedId]);
  let canonical = chatSerializedId;
  try {
    const rows = await client.getContactLidAndPhone([chatSerializedId]);
    const r = rows && rows[0];
    if (r?.lid) aliases.add(r.lid);
    if (r?.pn) {
      aliases.add(r.pn);
      canonical = r.pn;
    } else if (r?.lid) {
      canonical = r.lid;
    }
  } catch (e) {
    log('getAliasBundle:', e.message);
  }
  return { aliases: [...aliases], canonical };
}

function aliasesEnabled(enabledSet, aliases) {
  return aliases.some((id) => enabledSet.has(id));
}

function enableAliases(enabledSet, aliases) {
  for (const id of aliases) enabledSet.add(id);
}

function disableAliases(enabledSet, aliases) {
  for (const id of aliases) enabledSet.delete(id);
}

/** Pesan fromMe yang kita kirim (balasan bot) memicu message_create — jangan diproses lagi AI. */
const outboundWaIds = new Set();
const OUTBOUND_ID_CAP = 400;

function markOurOutbound(sentMessage) {
  const id = sentMessage?.id?._serialized;
  if (!id) return;
  outboundWaIds.add(id);
  if (outboundWaIds.size > OUTBOUND_ID_CAP) {
    outboundWaIds.clear();
  }
}

function consumeIfOurOutbound(msg) {
  const id = msg?.id?._serialized;
  if (!id || !outboundWaIds.has(id)) return false;
  outboundWaIds.delete(id);
  return true;
}

/**
 * Kumpulkan semua JID (termasuk @lid) per entri relay-aliases.
 */
async function expandRelayTargetJids(waClient, aliasesMap) {
  const out = [];
  for (const nick of Object.keys(aliasesMap || {})) {
    const jid = relay.resolveRelayJidFromAliases(nick, aliasesMap);
    if (!jid) continue;
    try {
      const bundle = await getAliasBundle(waClient, jid);
      out.push({ nick, jids: bundle.aliases });
    } catch {
      out.push({ nick, jids: [jid] });
    }
  }
  return out;
}

/**
 * Identitas Em Anam + aturan nama Ra hanya untuk chat yang cocok relay-aliases.
 */
async function buildIdentityAndRaLine(waClient, canonical, db) {
  const aliasesMap = relay.loadRelayAliases(db);
  const entries = await expandRelayTargetJids(waClient, aliasesMap);
  let block =
    '--- Identitas & nama kontak (WAJIB ikuti) ---\n' +
    'Jika ditanya siapa kamu, siapa pembuatmu, atau siapa yang menciptakan kamu: jawab bahwa kamu asisten virtual yang dibuat Em Anam.\n';
  let matchedNick = '';
  for (const { nick, jids } of entries) {
    if (jids.includes(canonical)) {
      matchedNick = nick;
      break;
    }
  }
  if (matchedNick) {
    block +=
      `Chat ini adalah percakapan dengan kontak terdaftar di relay-aliases, panggilan: "${matchedNick}". Hanya di chat inilah nama itu tepat untuk menyapa lawan bicara.\n`;
  } else {
    block +=
      'Chat ini bukan kontak relay terdaftar. Dilarang memanggil lawan bicara "Ra" atau nama panggilan lain dari daftar relay — mereka bukan orang tersebut.\n';
  }
  return block;
}

/** Kontak yang ada di relay-aliases (mis. Ra) boleh .aktif / .nonaktif di chat dengan Anda. */
async function isRelayTrustedContact(waClient, canonical, aliasesMap) {
  const entries = await expandRelayTargetJids(waClient, aliasesMap);
  return entries.some(({ jids }) => jids.includes(canonical));
}

async function main() {
  const db = openAndInit(ROOT, log);
  let enabledSet = db.loadEnabledSet();
  let myDigits = '';
  const ownerDigitsList = parseOwnerNumbers();

  if (!process.env.DEEPSEEK_API_KEY) {
    log('PERINGATAN: DEEPSEEK_API_KEY belum di .env — balasan AI akan gagal sampai diisi.');
  }

  const executablePath = resolveChromeExecutable();
  if (!executablePath) {
    log('PERINGATAN: Chrome tidak terdeteksi. Linux: apt install chromium / atau set CHROME_PATH. Windows: set CHROME_PATH ke chrome.exe / msedge.exe');
  } else {
    log('Menggunakan browser:', executablePath);
  }

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: SESSION_PATH }),
    puppeteer: {
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    },
  });

  const assistantControl = {
    async isEnabledForScope(scopeKey) {
      const jid = scopeKeyToAssistantJid(scopeKey);
      if (!jid) return false;
      try {
        const { aliases } = await getAliasBundle(client, jid);
        return aliasesEnabled(enabledSet, aliases);
      } catch (e) {
        log('assistantControl.isEnabledForScope:', e.message);
        return false;
      }
    },
    async setAssistantEnabled(scopeKey, on) {
      const jid = scopeKeyToAssistantJid(scopeKey);
      if (!jid) {
        return {
          ok: false,
          text: 'Kontak ini tidak punya nomor yang dikenali untuk daftar aktif.',
        };
      }
      try {
        const { aliases } = await getAliasBundle(client, jid);
        if (on) {
          enableAliases(enabledSet, aliases);
          log('[menu .atur] AI aktif', scopeKey, aliases.join(', '));
        } else {
          disableAliases(enabledSet, aliases);
          log('[menu .atur] AI nonaktif', scopeKey, aliases.join(', '));
        }
        db.saveEnabledSet(enabledSet);
        return {
          ok: true,
          text: on
            ? '✓ Balasan AI *aktif* untuk kontak ini (setara .aktif / .aktifnomor).'
            : '✓ Balasan AI *nonaktif* untuk kontak ini.',
        };
      } catch (e) {
        log('assistantControl.setAssistantEnabled:', e.message);
        return { ok: false, text: `Gagal: ${e.message}` };
      }
    },
  };

  async function getEnabledContactsReport() {
    if (!client.info?.wid) {
      return 'WhatsApp belum siap — tunggu sampai tersambung lalu coba _.atur_ → _.9_ lagi.';
    }
    const rawIds = [...db.loadEnabledSet()].sort();
    if (!rawIds.length) {
      return (
        'Belum ada kontak dengan *balasan AI aktif*.\n\n' +
        '_.aktifnomor 628…_ · _.aktif_ di chat terkait · atau menu *.6* → pilih kontak → *.6* aktifkan.'
      );
    }

    const aliasesMap = relay.loadRelayAliases(db);
    const seenKey = new Set();
    const groups = [];
    for (const chatId of rawIds) {
      try {
        const { aliases, canonical } = await getAliasBundle(client, chatId);
        const key = [...new Set(aliases)].sort().join('|');
        if (seenKey.has(key)) continue;
        seenKey.add(key);
        groups.push({ chatId, canonical, aliases });
      } catch (e) {
        const key = `err:${chatId}`;
        if (seenKey.has(key)) continue;
        seenKey.add(key);
        groups.push({ chatId, canonical: chatId, aliases: [chatId], error: e.message });
      }
    }

    const maxShow = 28;
    const slice = groups.slice(0, maxShow);
    const lines = [];

    for (const g of slice) {
      if (g.error) {
        lines.push(`• _${String(g.chatId).slice(0, 40)}_\n  _(${g.error})_`);
        continue;
      }
      const { canonical, aliases, chatId } = g;
      const dCanon = jidToDigits(canonical);
      const tryIds = [chatId, canonical, ...aliases];
      let displayName = '';
      for (const tid of tryIds) {
        try {
          const c = await client.getContactById(tid);
          const n = String(c.pushname || c.name || c.shortName || '').trim();
          if (n) {
            displayName = n;
            break;
          }
        } catch (_) {
          /* lanjut */
        }
      }
      if (!displayName) {
        for (const tid of tryIds) {
          try {
            const ch = await client.getChatById(tid);
            const n = String(ch.name || '').trim();
            if (n) {
              displayName = n;
              break;
            }
          } catch (_) {
            /* lanjut */
          }
        }
      }
      const num =
        dCanon ||
        jidToDigits(chatId) ||
        (canonical && canonical.includes('@') ? canonical.split('@')[0] : canonical) ||
        '—';
      const nm = displayName || '(tanpa nama di WA)';

      let relayLine = '';
      let matchedRelay = false;
      if (dCanon.length >= 10 && dCanon.length <= 15) {
        for (const [k, v] of Object.entries(aliasesMap)) {
          const sk = scopeKeyFromRelayTarget(v);
          if (sk && sk === dCanon) {
            relayLine = `\n  _Relay:_ *${k}*`;
            matchedRelay = true;
            break;
          }
        }
      }
      if (!matchedRelay) {
        relayLine =
          '\n  _(tidak ada di relay — aktif lewat .aktif / .aktifnomor / menu kontak)_';
      }

      const jidNote =
        aliases.length > 1
          ? `\n  _JID:_ ${aliases
              .map((j) => String(j).split('@')[0])
              .slice(0, 4)
              .join(', ')}${aliases.length > 4 ? '…' : ''}`
          : '';

      lines.push(`• *${nm}*\n  _Nomor:_ ${num}${relayLine}${jidNote}`);
    }

    let tail = '';
    if (groups.length > maxShow) {
      tail = `\n\n_… ${groups.length - maxShow} kontak lain (banyak ID — nonaktifkan per nomor bila perlu)._`;
    }
    if (rawIds.length > groups.length) {
      tail += `\n_${rawIds.length - groups.length} ID duplikat (@c.us/@lid) sudah digabung per orang._`;
    }

    return (
      `*Kontak dengan AI aktif* (${groups.length} orang / grup — dari ${rawIds.length} ID tersimpan)\n\n` +
      lines.join('\n\n') +
      tail
    );
  }

  const selfAdmin = createSelfAdmin({
    db,
    log,
    assistantControl,
    getEnabledContactsReport,
  });

  client.on('qr', (qr) => {
    log('Scan QR WhatsApp (Web):');
    qrcode.generate(qr, { small: true });
  });

  client.on('authenticated', () => {
    log('WhatsApp terautentikasi (sesi disimpan di data/whatsapp-session — jangan dihapus manual).');
  });

  client.on('auth_failure', (m) => log('Gagal autentikasi WA:', m));

  client.on('ready', async () => {
    const wid = client.info?.wid?._serialized || '';
    myDigits = jidToDigits(wid);
    log('WhatsApp siap. Nomor login (normalized):', myDigits || '(tidak terbaca)');
    log('Atur AI: chat ke *diri sendiri*, kirim .atur (menu angka: kepribadian & ingatan).');
    log('Admin nomor (chat diri sendiri): .aktifnomor 628... dan .nonaktifnomor 628... — pakai angka sama seperti di log WA.');
    log('AI membalas: pesan lawan bicara otomatis; pesan Anda hanya jika diawali titik (.) — misal `.halo` → AI balas (titik tidak disimpan). .aktif/.nonaktif tetap.');
    log('Agen relay: hanya ke kontak yang KUNCI-nya ada di database relay (nilai = nomor 62... atau 628...@c.us).');
    log('Kontak yang terdaftar di relay juga boleh .aktif / .nonaktif di chat ke Anda (walau AI sedang mati).');
    log('Per kontak: ingatan + opsional kepribadian khusus (.atur → .6 / .7). Default global: .4. Relay baru (.7) = pakai kepribadian aktif saat disimpan.');
    log('Jadwal kirim WA: .jadwal / .jadwalku / .batalkjadwal di chat diri; atau perintah dengan titik yang menyebut jadwal/waktu (parser DeepSeek).');
    log('[jadwal] Zona waktu SCHEDULE_TZ =', scheduleTime.getScheduleTimeZone());
    if (ownerDigitsList.length) {
      log('OWNER_NUMBERS aktif — hanya nomor terdaftar yang bisa toggle (cek cocok dengan', myDigits, ')');
    }
    startScheduleWorker();
  });

  client.on('disconnected', (reason) => {
    log('Terputus:', reason);
  });

  async function replyAndTrack(msg, text) {
    const sent = await msg.reply(text);
    markOurOutbound(sent);
    return sent;
  }

  async function handleScheduleSelfCommands(msg, bodySelf) {
    const t = bodySelf.trim();
    if (!/^\.(jadwal|jadwalku|batalkjadwal)\b/i.test(t)) return false;
    if (/^\.jadwalku\b/i.test(t)) {
      const rows = db.listScheduledPendingOrdered();
      if (!rows.length) {
        await replyAndTrack(msg, 'Belum ada jadwal menunggu.');
        return true;
      }
      const fmt = rows.map((r, i) => {
        const tz = r.schedule_timezone || scheduleTime.getScheduleTimeZone();
        const when = new Date(r.scheduled_at).toLocaleString('id-ID', {
          timeZone: tz,
          dateStyle: 'short',
          timeStyle: 'short',
        });
        const preview = String(r.body).slice(0, 72).replace(/\n/g, ' ');
        const tail = r.body.length > 72 ? '…' : '';
        const rep = scheduleTime.formatRepeatLabel(r);
        const ai = (r.body_mode || 'plain') === 'personality' ? ' · _gaya AI_' : '';
        return `${i + 1}) *${r.target_label || '?'}*\n   _${when}_ (${tz}) · _${rep}_${ai}\n   ${preview}${tail}`;
      });
      await replyAndTrack(
        msg,
        '*Jadwal menunggu kirim:*\n\n' + fmt.join('\n\n') + '\n\n_.batalkjadwal N_ untuk batal (N = nomor di atas).'
      );
      return true;
    }
    if (/^\.batalkjadwal\b/i.test(t)) {
      const m = t.match(/^\.batalkjadwal\s+(\d+)\s*$/i);
      if (!m) {
        await replyAndTrack(msg, 'Format: _.batalkjadwal 2_ (nomor dari _.jadwalku_).');
        return true;
      }
      const r = db.cancelScheduledByListIndex(m[1]);
      await replyAndTrack(
        msg,
        r.ok ? '✓ Jadwal itu dibatalkan.' : 'Nomor tidak valid atau jadwal sudah tidak pending.'
      );
      return true;
    }
    if (/^\.jadwal\b/i.test(t)) {
      const parsed = scheduleIntent.parseStrictJadwalCommand(t);
      if (!parsed) {
        await replyAndTrack(
          msg,
          'Format (zona = *' +
            scheduleTime.getScheduleTimeZone() +
            '* lewat SCHEDULE_TZ):\n' +
            '_.jadwal Ra 2026-03-31 09:00 Teks..._ (sekali)\n' +
            '_.jadwal harian Ra 09:00 Teks..._\n' +
            '_.jadwal mingguan senin Ra 09:00 Teks..._\n' +
            '_.jadwalku_ · _.batalkjadwal N_ · _.atur_ → _.8_'
        );
        return true;
      }
      if (!parsed.ok) {
        await replyAndTrack(msg, parsed.error || 'Tanggal/jam tidak valid.');
        return true;
      }
      const aliasesMap = relay.loadRelayAliases(db);
      const jid = scheduleIntent.resolveScheduleTargetJid(parsed.target, aliasesMap);
      if (!jid) {
        await replyAndTrack(
          msg,
          `Target *${parsed.target}* tidak dikenali. Pakai kunci relay (_.atur_ → _.7_) atau nomor WA 10–15 digit.`
        );
        return true;
      }
      const whenMs = new Date(parsed.scheduledAtIso).getTime();
      if (Number.isNaN(whenMs) || whenMs <= Date.now() + 60000) {
        await replyAndTrack(
          msg,
          'Waktu kirim pertama harus minimal *sekitar 1 menit* di depan sekarang (zona ' +
            (parsed.timezone || scheduleTime.getScheduleTimeZone()) +
            ').'
        );
        return true;
      }
      const label = `${parsed.target} → ${jid.split('@')[0]}`;
      const id = db.insertScheduledMessage({
        targetJid: jid,
        targetLabel: label,
        body: parsed.message,
        scheduledAtIso: parsed.scheduledAtIso,
        repeatKind: parsed.repeatKind || 'once',
        repeatDow: parsed.repeatDow,
        repeatTimeLocal: parsed.repeatTimeLocal,
        scheduleTimezone: parsed.timezone || scheduleTime.getScheduleTimeZone(),
      });
      const tz = parsed.timezone || scheduleTime.getScheduleTimeZone();
      const whenLocal = new Date(parsed.scheduledAtIso).toLocaleString('id-ID', {
        timeZone: tz,
        dateStyle: 'long',
        timeStyle: 'short',
      });
      const pv = parsed.message.length > 180 ? `${parsed.message.slice(0, 180)}…` : parsed.message;
      const rep = scheduleTime.formatRepeatLabel({
        repeat_kind: parsed.repeatKind || 'once',
        repeat_dow: parsed.repeatDow,
      });
      await replyAndTrack(
        msg,
        `✓ *Jadwal disimpan*\n*Tujuan:* ${label}\n*Kirim berikutnya (${tz}):* ${whenLocal}\n*Pola:* _${rep}_\n*Pesan:* ${pv}\n_id:_ ${id}`
      );
      log('[jadwal] dibuat', id, label, parsed.scheduledAtIso);
      return true;
    }
    return false;
  }

  async function processScheduledRow(row) {
    let textToSend = row.body;
    const mode = row.body_mode || 'plain';
    const sk = row.scope_key;
    if (mode === 'personality' && sk && process.env.DEEPSEEK_API_KEY) {
      try {
        const { canonical: targetCanon } = await getAliasBundle(client, row.target_jid);
        const profile = selfAdmin.getReplyProfile(sk);
        const identityBlock = await buildIdentityAndRaLine(client, targetCanon, db);
        const sourceKind = row.source_kind || 'tuan';
        const brief = String(row.body).slice(0, 1200);
        const looksPoetic =
          /\b(puisi|pantun|syair|bait|rima|gubah|gubahan|madah)\b/i.test(brief) ||
          /\b(poem|verse)\b/i.test(brief);
        const roleBlock =
          sourceKind === 'inbox'
            ? '\n\n--- Pengingat terjadwal (inbox) ---\n' +
              'Lawan bicara meminta pengingat di chat ini. Tulis SATU pesan WhatsApp singkat (1–3 kalimat), natural, sesuai kepribadianmu untuk percakapan ini. ' +
              'Jangan menyebut bot/AI/sistem/jadwal teknis.\nTopik pengingat:\n'
            : looksPoetic
              ? '\n\n--- Pesan terjadwal ---\n' +
                'Tuan meminta karya atau pesan bermakna untuk penerima. Hasilkan *utuh* sesuai jenisnya (contoh puisi: beberapa bait, bukan judul atau satu baris ringkas). ' +
                'Natural untuk WhatsApp, selaras kepribadian dan konteks chat. Jangan menyebut bot/AI/sistem/jadwal.\nPermintaan/inti:\n'
              : '\n\n--- Pesan terjadwal ---\n' +
                'Tulis SATU pesan WhatsApp singkat (1–3 kalimat) untuk penerima, selaras dengan kepribadian dan konteks chat ini.\nTopik/inti yang harus disampaikan:\n';
        const apiMessages = [
          {
            role: 'system',
            content: `${profile.systemPrompt}\n\n${identityBlock}${roleBlock}"${brief}"`,
          },
          {
            role: 'user',
            content: looksPoetic
              ? 'Keluarkan karya/teks siap kirim utuh (tanpa pembuka seperti "Berikut puisinya").'
              : 'Keluarkan teks pesan siap kirim saja (tanpa pembuka meta).',
          },
        ];
        textToSend = await callDeepSeek(
          profile,
          apiMessages,
          looksPoetic ? { maxTokens: 2800 } : {}
        );
      } catch (e) {
        log('[jadwal] compose personality gagal, pakai body mentah:', e.message);
        textToSend = row.body;
      }
    }

    const sent = await client.sendMessage(row.target_jid, textToSend);
    markOurOutbound(sent);
    const rk = String(row.repeat_kind || 'once').toLowerCase();
    if (rk === 'daily' || rk === 'weekly') {
      const next = scheduleTime.computeNextFireAfterSend(row);
      if (next) {
        db.rescheduleRecurringPending(row.id, next);
        log('[jadwal] terkirim (ulang)', row.id, '→', next, row.target_label || '');
      } else {
        db.markScheduledFailed(row.id, 'gagal hitung jadwal berikutnya');
        log('[jadwal] gagal recurrence', row.id);
      }
    } else {
      db.markScheduledSent(row.id);
    }
    try {
      const { canonical } = await getAliasBundle(client, row.target_jid);
      db.appendHistory(canonical, 'assistant', textToSend, MAX_MESSAGES_PER_CHAT);
    } catch (_) {
      /* abaikan */
    }
    log('[jadwal] terkirim', row.id, row.target_label || row.target_jid, mode);
  }

  function startScheduleWorker() {
    const tickMs = 30000;
    setInterval(() => {
      (async () => {
        try {
          if (!client.info?.wid) return;
          const now = new Date().toISOString();
          const batch = db.claimScheduledDue(now, 12);
          for (const row of batch) {
            try {
              await processScheduledRow(row);
            } catch (e) {
              const em = e?.message || String(e);
              db.markScheduledFailed(row.id, em);
              log('[jadwal] gagal kirim', row.id, em);
            }
          }
        } catch (e) {
          log('[jadwal] worker:', e.message);
        }
      })();
    }, tickMs);
    log('[jadwal] worker setiap', tickMs / 1000, 'detik');
  }

  /** Satu alur riwayat: user (inbox / tuan) → assistant. */
  async function runAiReply(msg, canonical, bodyRaw, fromOwner, waClient) {
    if (msg.hasMedia && !bodyRaw) {
      const line = fromOwner ? '[Tuan: media tanpa teks]' : '[Inbox: media tanpa teks]';
      log(fromOwner ? 'Media dari Anda (tanpa teks, hanya riwayat):' : 'Pesan media (abaikan AI):', canonical);
      db.appendHistory(canonical, 'user', line, MAX_MESSAGES_PER_CHAT);
      return;
    }
    if (!bodyRaw) return;

    const memScope = memoryScopeKeyFromCanonical(canonical);

    const stored = fromOwner ? `[Tuan] ${bodyRaw}` : `[Inbox] ${bodyRaw}`;
    log(
      fromOwner ? 'Pesan Anda (.) → AI:' : 'Pesan masuk (AI on):',
      canonical,
      bodyRaw.slice(0, 120)
    );

    db.appendHistory(canonical, 'user', stored, MAX_MESSAGES_PER_CHAT);

    if (fromOwner && process.env.DEEPSEEK_API_KEY) {
      const profileEarly = selfAdmin.getReplyProfile(memScope);
      const aliasesMap = relay.loadRelayAliases(db);
      const schedTz = scheduleTime.getScheduleTimeZone();
      const relayTimeCtx = {
        scheduleZone: schedTz,
        utcIso: new Date().toISOString(),
        localHuman: new Date().toLocaleString('id-ID', {
          timeZone: schedTz,
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
      };
      const parsed = await relay.parseRelayIntent(
        bodyRaw,
        process.env.DEEPSEEK_API_KEY,
        profileEarly.model,
        relayTimeCtx
      );
      if (
        parsed.relay &&
        parsed.targetName &&
        parsed.messageToTarget &&
        parsed.ackToTuan
      ) {
        const targetJid = relay.resolveRelayJidFromAliases(parsed.targetName, aliasesMap);
        if (!targetJid) {
          const fail =
            `Ampun, Baginda. Hamba tidak mengirim: relay hanya ke nama yang terdaftar di database relay. ` +
            `Pastikan "${parsed.targetName}" ada sebagai kunci di sana, dan nilainya nomor WA (mis. 6285...) atau JID 628...@c.us. Hamba tidak mencari buku kontak.`;
          db.appendHistory(canonical, 'assistant', fail, MAX_MESSAGES_PER_CHAT);
          await replyAndTrack(msg, fail);
          log('[relay] ditolak — bukan alias terdaftar atau nilai tidak valid:', parsed.targetName);
          return;
        }

        const whenIso = String(parsed.whenIso || '').trim();
        const whenMs = whenIso ? Date.parse(whenIso) : NaN;
        const isFuture = !Number.isNaN(whenMs) && whenMs > Date.now() + 60000;
        const wantsLater = parsed.deliverNow === false || isFuture;

        if (wantsLater) {
          if (!isFuture) {
            await replyAndTrack(
              msg,
              'Ampun, Tuan — waktu kirim ke *' +
                parsed.targetName +
                '* kurang jelas atau kurang dari ~1 menit ke depan. ' +
                'Contoh: *1 jam dari sekarang*, *besok jam 9*, *30 menit lagi*. ' +
                `(Zona: *${schedTz}*.)`
            );
            db.appendHistory(canonical, 'assistant', '[relay dijadwalkan — waktu ditolak]', MAX_MESSAGES_PER_CHAT);
            return;
          }
          const label = `${parsed.targetName} → ${targetJid.split('@')[0]}`;
          const { canonical: targetCanonSched } = await getAliasBundle(waClient, targetJid);
          const targetScopeSched = memoryScopeKeyFromCanonical(targetCanonSched);
          const msgT = String(parsed.messageToTarget || '');
          const longLiteralForward =
            parsed.composePersonality === false && msgT.length > 400;
          const usePersRelay =
            isFuture &&
            !!msgT &&
            !scheduledRelayShouldUsePlainBody(bodyRaw) &&
            !longLiteralForward;
          const id = db.insertScheduledMessage({
            targetJid,
            targetLabel: label,
            body: parsed.messageToTarget,
            scheduledAtIso: whenIso,
            repeatKind: 'once',
            repeatDow: null,
            repeatTimeLocal: null,
            scheduleTimezone: schedTz,
            bodyMode: usePersRelay ? 'personality' : 'plain',
            scopeKey: usePersRelay ? targetScopeSched : null,
            sourceKind: 'tuan',
          });
          const whenLocal = new Date(whenIso).toLocaleString('id-ID', {
            timeZone: schedTz,
            dateStyle: 'long',
            timeStyle: 'short',
          });
          const persNote = usePersRelay
            ? '\n_Teks akan disusun saat kirim (kepribadian + ingatan untuk chat si penerima)._'
            : '';
          await replyAndTrack(
            msg,
            `${parsed.ackToTuan}\n\n✓ *Pesan dijadwalkan* ke *${parsed.targetName}* — kirim sekitar *${whenLocal}* (${schedTz}).${persNote}\n_id:_ ${id}`
          );
          db.appendHistory(
            canonical,
            'assistant',
            `${parsed.ackToTuan} [relay jadwal → ${parsed.targetName} @ ${whenLocal}]`,
            MAX_MESSAGES_PER_CHAT
          );
          log('[relay] dijadwalkan', parsed.targetName, whenIso, id);
          return;
        }

        await replyAndTrack(msg, parsed.ackToTuan);
        db.appendHistory(canonical, 'assistant', parsed.ackToTuan, MAX_MESSAGES_PER_CHAT);
        try {
          const sent = await waClient.sendMessage(targetJid, parsed.messageToTarget);
          markOurOutbound(sent);
          const { canonical: targetCanon } = await getAliasBundle(waClient, targetJid);
          db.appendHistory(targetCanon, 'user', `[Tuan] ${parsed.messageToTarget}`, MAX_MESSAGES_PER_CHAT);
          log('[relay] disampaikan ke', parsed.targetName, '→', targetCanon);
        } catch (e) {
          log('[relay] gagal kirim:', e.message);
          const err2 =
            'Ampun, Tuan. Hamba gagal mengirim pesan ke tujuan. Mohon periksa nomor/kontak atau coba lagi.';
          db.appendHistory(canonical, 'assistant', err2, MAX_MESSAGES_PER_CHAT);
          await replyAndTrack(msg, err2);
        }
        return;
      }

      if (scheduleIntent.looksLikeScheduleIntent(bodyRaw)) {
        const relayKeys = Object.keys(aliasesMap);
        const sch = await scheduleIntent.parseScheduleIntent(
          bodyRaw,
          process.env.DEEPSEEK_API_KEY,
          profileEarly.model,
          relayKeys
        );
        if (sch.schedule && sch.targetName && sch.messageToTarget) {
          const built = scheduleIntent.buildScheduleInsertFromAi(
            sch,
            scheduleTime.getScheduleTimeZone()
          );
          if (built.error) {
            const rk0 = scheduleIntent.normalizeRepeatKind(sch.repeatKind);
            const hasWhen = String(sch.whenIso || '').trim().length > 0;
            if (rk0 !== 'once' || hasWhen) {
              await replyAndTrack(
                msg,
                `Ampun, Tuan — ${built.error} Mohon perjelas waktu/hari (zona *${scheduleTime.getScheduleTimeZone()}*).`
              );
              db.appendHistory(canonical, 'assistant', built.error, MAX_MESSAGES_PER_CHAT);
              return;
            }
          } else {
          const targetJid = scheduleIntent.resolveScheduleTargetJid(sch.targetName, aliasesMap);
          if (!targetJid) {
            const fail =
              `Ampun, Baginda. Hamba tidak mengenali tujuan "${sch.targetName}" — ` +
              `pakai kunci relay yang terdaftar (_.atur_ → _.7_) atau sebut nomor WA 10–15 digit.`;
            db.appendHistory(canonical, 'assistant', fail, MAX_MESSAGES_PER_CHAT);
            await replyAndTrack(msg, fail);
            log('[jadwal] ditolak — target:', sch.targetName);
            return;
          }
          const whenMs = new Date(built.scheduledAtIso).getTime();
          if (Number.isNaN(whenMs) || whenMs <= Date.now() + 60000) {
            const soft = sch.ackToTuan || 'Baik, Tuan.';
            await replyAndTrack(
              msg,
              `${soft}\n\n_(Waktu pertama kurang dari ~1 menit ke depan — mohon ulang.)_`
            );
            db.appendHistory(canonical, 'assistant', soft + ' [jadwal: waktu ditolak]', MAX_MESSAGES_PER_CHAT);
            return;
          }
          const { canonical: schTCanon } = await getAliasBundle(waClient, targetJid);
          const schTScope = memoryScopeKeyFromCanonical(schTCanon);
          const id = db.insertScheduledMessage({
            targetJid,
            targetLabel: `${sch.targetName} → ${targetJid.split('@')[0]}`,
            body: sch.messageToTarget,
            scheduledAtIso: built.scheduledAtIso,
            repeatKind: built.repeatKind,
            repeatDow: built.repeatDow,
            repeatTimeLocal: built.repeatTimeLocal,
            scheduleTimezone: built.timezone,
            bodyMode: 'personality',
            scopeKey: schTScope,
            sourceKind: 'tuan',
          });
          const tz = built.timezone || scheduleTime.getScheduleTimeZone();
          const whenLocal = new Date(built.scheduledAtIso).toLocaleString('id-ID', {
            timeZone: tz,
            dateStyle: 'long',
            timeStyle: 'short',
          });
          const rep = scheduleTime.formatRepeatLabel({
            repeat_kind: built.repeatKind,
            repeat_dow: built.repeatDow,
          });
          const ack = sch.ackToTuan || 'Baik, Tuan. Jadwal hamba catat.';
          await replyAndTrack(
            msg,
            `${ack}\n\n✓ *Disimpan* — berikutnya *${whenLocal}* (${tz}) · _${rep}_\n_Teks kirim disesuaikan kepribadian + ingatan untuk chat tujuan._\n_id:_ ${id}`
          );
          db.appendHistory(
            canonical,
            'assistant',
            `${ack} [jadwal: ${whenLocal} ${tz} ${rep}]`,
            MAX_MESSAGES_PER_CHAT
          );
          log('[jadwal] bahasa alami', id, sch.targetName, built.scheduledAtIso, built.repeatKind);
          return;
          }
        }
      }
    }

    const historyEntries = db.getHistoryEntries(canonical);
    const contextMessages = lastNForApi(historyEntries, HISTORY_TAIL);
    const profile = selfAdmin.getReplyProfile(memScope);

    const styleThisTurn = fromOwner
      ? '\n\n--- Gaya untuk balasan INI (pemicu = TUAN) — WAJIB ---\n' +
        'Yang berbicara adalah pemilikmu (pesan [Tuan], dipicu titik). Balasanmu harus menunjukkan *tunduk, patuh, dan kepatuhan mutlak* — bukan setengah-setengah.\n' +
        '• WAJIB menyapa atau merujuk kepada beliau dengan "Tuan" dan/atau "Baginda" (minimal salah satu di setiap balasan; boleh berganti agar tidak kaku).\n' +
        '• Nada: hamba/yang setia kepada Tuan; siap melaksanakan; mohon arahan; mengakui kedudukan Tuan di atasmu. Dilarang gaya setara, bercanda kasar, singkatan receh, atau nada teman.\n' +
        '• Isi tetap membantu dan jelas; panjang sesuai kebutuhan. Bahasa mengikuti bahasa Tuan (biasanya Indonesia).\n' +
        '• Jangan memanggil "kamu" ke Tuan; gunakan "Tuan"/"Baginda" atau "diri hamba" bila perlu.'
      : '\n\n--- Gaya untuk balasan INI (pemicu = INBOX) ---\n' +
        'Yang memicu balasan adalah lawan bicara di inbox. Ikuti kepribadian utama di atas: natural, hangat, cocok obrolan WhatsApp biasa — jangan memanggil mereka Tuan/Baginda atau gaya tunduk kepatuhan (itu khusus untuk pemilik akun saja).';

    const identityBlock = await buildIdentityAndRaLine(waClient, canonical, db);

    const apiMessages = [
      {
        role: 'system',
        content:
          `${profile.systemPrompt}\n\n` +
          `${identityBlock}\n` +
          `--- Konteks saluran WhatsApp ---\n` +
          `Kamu membalas di satu chat: ada dua sumber pesan "user" di riwayat:\n` +
          `• Baris berawalan [Inbox] = pesan masuk dari lawan bicara (inbox). Bukan pembuatmu.\n` +
          `• Baris user tanpa awalan [Tuan]/[Anda]/[Inbox] = format lama; anggap itu juga dari inbox (lawan bicara).\n` +
          `• Baris berawalan [Tuan] (atau riwayat lama [Anda]) = pemilik akun yang menjalankan bot — tuanmu.\n` +
          `• Pesan assistant = balasanmu sebelumnya.\n` +
          `Tuan memicu balasan dengan pesan diawali titik (.); titik tidak ikut di isi [Tuan]. Jangan mengulang balasan tanpa perlu.` +
          styleThisTurn,
      },
      ...contextMessages,
    ];

    let replyText;
    try {
      replyText = await callDeepSeek(profile, apiMessages);
    } catch (e) {
      log('DeepSeek error:', e.response?.data || e.message);
      const errMsg = fromOwner
        ? 'Ampun, Tuan. Hamba mengalami gangguan sementara. Mohon Baginda mencoba lagi sebentar.'
        : 'Maaf, AI sementara error. Coba lagi nanti.';
      await replyAndTrack(msg, errMsg);
      return;
    }

    db.appendHistory(canonical, 'assistant', replyText, MAX_MESSAGES_PER_CHAT);
    await replyAndTrack(msg, replyText);
    log('Balasan AI terkirim:', canonical);

    try {
      if (
        process.env.DEEPSEEK_API_KEY &&
        memoryAuto.shouldTryExtractCalling(bodyRaw)
      ) {
        const lines = await memoryAuto.extractCallingMemories({
          userText: bodyRaw,
          assistantText: replyText,
          roleHint: fromOwner ? 'tuan' : 'inbox',
          apiKey: process.env.DEEPSEEK_API_KEY,
          model: profile.model,
        });
        if (lines.length) {
          memoryAuto.appendAutoMemories({ db, log, lines, scopeKey: memScope });
        }
      }
    } catch (e) {
      log('[memory-auto]', e.message);
    }
  }

  // Pesan dari akun Anda (HP/Web) tidak memicu event `message`, hanya `message_create`.
  client.on('message_create', async (msg) => {
    try {
      if (msg.from === 'status@broadcast') return;
      if (!msg.fromMe) return;
      if (consumeIfOurOutbound(msg)) return;

      const chat = await msg.getChat();
      if (chat.isGroup) return;

      if (selfAdmin.isSelfChat(chat, client)) {
        const bodySelf = (msg.body || '').trim();
        if (!isOwnerCommandAllowed(msg, myDigits, ownerDigitsList)) {
          return;
        }
        const mAktifNomor = bodySelf.match(/^\.aktifnomor\s+([\d\s]+)/i);
        const mNonNomor = bodySelf.match(/^\.nonaktifnomor\s+([\d\s]+)/i);
        if (mAktifNomor) {
          const d = digitsOnly(mAktifNomor[1]);
          if (d.length < 10 || d.length > 15) {
            await replyAndTrack(msg, 'Format: .aktifnomor 6285895859744 (10–15 digit).');
            return;
          }
          const jid = `${d}@c.us`;
          const { aliases: als } = await getAliasBundle(client, jid);
          enableAliases(enabledSet, als);
          db.saveEnabledSet(enabledSet);
          await replyAndTrack(
            msg,
            `✓ AI aktif untuk nomor ${d}. ID tersimpan: ${als.join(', ')}`
          );
          log('[admin] .aktifnomor', d, als);
          return;
        }
        if (mNonNomor) {
          const d = digitsOnly(mNonNomor[1]);
          if (d.length < 10 || d.length > 15) {
            await replyAndTrack(msg, 'Format: .nonaktifnomor 6285895859744 (10–15 digit).');
            return;
          }
          const jid = `${d}@c.us`;
          const { aliases: als } = await getAliasBundle(client, jid);
          disableAliases(enabledSet, als);
          db.saveEnabledSet(enabledSet);
          await replyAndTrack(
            msg,
            `✓ AI nonaktif untuk nomor ${d}. ID dihapus dari daftar: ${als.join(', ')}`
          );
          log('[admin] .nonaktifnomor', d, als);
          return;
        }
        if (await handleScheduleSelfCommands(msg, bodySelf)) return;
        // Balasan bot di chat diri tidak diawali titik → tidak masuk handle (hindari loop).
        if (!bodySelf.startsWith('.')) {
          return;
        }
        const handled = await selfAdmin.handle(msg, chat);
        if (handled) return;
        return;
      }

      const bodyRaw = (msg.body || '').trim();
      const bodyLower = bodyRaw.toLowerCase();

      if (bodyLower === '.aktif' || bodyLower === '.nonaktif') {
        if (!isOwnerCommandAllowed(msg, myDigits, ownerDigitsList)) {
          return;
        }
        const chatId = chat.id._serialized;
        const { aliases } = await getAliasBundle(client, chatId);
        if (bodyLower === '.aktif') {
          enableAliases(enabledSet, aliases);
          db.saveEnabledSet(enabledSet);
          log('AI AKTIF untuk:', aliases.join(', '));
          await replyAndTrack(msg, '✓ Balasan otomatis AI aktif untuk percakapan ini.');
          return;
        }
        disableAliases(enabledSet, aliases);
        db.saveEnabledSet(enabledSet);
        log('AI NONAKTIF untuk:', aliases.join(', '));
        await replyAndTrack(msg, '✓ Balasan otomatis AI dimatikan untuk percakapan ini.');
        return;
      }

      if (!isOwnerCommandAllowed(msg, myDigits, ownerDigitsList)) {
        return;
      }

      const chatId = chat.id._serialized;
      const { aliases, canonical } = await getAliasBundle(client, chatId);
      if (!aliasesEnabled(enabledSet, aliases)) {
        return;
      }

      // Hanya pesan Anda yang diawali titik (.) yang memicu AI — hindari balasan AI memicu AI lagi.
      if (!bodyRaw.startsWith('.')) {
        return;
      }
      const afterDot = bodyRaw.slice(1).replace(/^\s+/, '');
      if (!afterDot && !msg.hasMedia) {
        return;
      }
      if (msg.hasMedia && !afterDot) {
        return;
      }

      await runAiReply(msg, canonical, afterDot, true, client);
    } catch (e) {
      const em = e?.message != null ? String(e.message) : String(e);
      log('message_create error:', em);
      try {
        const detail = em.length > 450 ? `${em.slice(0, 450)}…` : em;
        await replyAndTrack(
          msg,
          `*Maaf, Tuan — ada gangguan saat memproses perintah.*\n\n_${detail}_`
        );
      } catch (replyErr) {
        log('message_create: tidak bisa kirim penjelasan error:', replyErr.message);
      }
    }
  });

  client.on('message', async (msg) => {
    try {
      if (msg.from === 'status@broadcast') return;

      const chat = await msg.getChat();
      if (chat.isGroup) return;

      const chatId = chat.id._serialized;
      const bodyRaw = (msg.body || '').trim();

      if (msg.fromMe) {
        return;
      }

      const { aliases, canonical } = await getAliasBundle(client, chatId);
      const bodyLower = bodyRaw.toLowerCase();
      const relayAliasesMap = relay.loadRelayAliases(db);
      const relayMayToggle = await isRelayTrustedContact(client, canonical, relayAliasesMap);

      if (
        relayMayToggle &&
        (bodyLower === '.aktif' || bodyLower === '.nonaktif')
      ) {
        if (bodyLower === '.aktif') {
          enableAliases(enabledSet, aliases);
          db.saveEnabledSet(enabledSet);
          await replyAndTrack(msg, '✓ Balasan otomatis AI aktif untuk chat ini.');
          log('[.aktif dari kontak relay]', canonical);
        } else {
          disableAliases(enabledSet, aliases);
          db.saveEnabledSet(enabledSet);
          await replyAndTrack(msg, '✓ Balasan otomatis AI nonaktif untuk chat ini.');
          log('[.nonaktif dari kontak relay]', canonical);
        }
        return;
      }

      const on = aliasesEnabled(enabledSet, aliases);

      if (!on) {
        log('Pesan masuk (AI off):', chatId, bodyRaw.slice(0, 80));
        return;
      }

      if (relayMayToggle && process.env.DEEPSEEK_API_KEY && reminderIntent.looksLikeInboxReminder(bodyRaw)) {
        const memScopeRm = memoryScopeKeyFromCanonical(canonical);
        const profRm = selfAdmin.getReplyProfile(memScopeRm);
        const schedTzRm = scheduleTime.getScheduleTimeZone();
        const relayTimeCtxRm = {
          scheduleZone: schedTzRm,
          utcIso: new Date().toISOString(),
          localHuman: new Date().toLocaleString('id-ID', {
            timeZone: schedTzRm,
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
        };
        const rim = await reminderIntent.parseInboxReminderIntent(
          bodyRaw,
          process.env.DEEPSEEK_API_KEY,
          profRm.model || 'deepseek-chat',
          relayTimeCtxRm
        );
        if (rim.reminder && rim.topicText && rim.whenIso) {
          const wMs = Date.parse(rim.whenIso);
          if (!Number.isNaN(wMs) && wMs > Date.now() + 60000) {
            const id = db.insertScheduledMessage({
              targetJid: chatId,
              targetLabel: `pengingat · ${canonical.split('@')[0]}`,
              body: rim.topicText,
              scheduledAtIso: rim.whenIso,
              repeatKind: 'once',
              scheduleTimezone: schedTzRm,
              bodyMode: 'personality',
              scopeKey: memScopeRm,
              sourceKind: 'inbox',
            });
            const whenLocalRm = new Date(rim.whenIso).toLocaleString('id-ID', {
              timeZone: schedTzRm,
              dateStyle: 'long',
              timeStyle: 'short',
            });
            const ack = rim.ackReply || `Baik, hamba ingatkan sekitar ${whenLocalRm}.`;
            db.appendHistory(canonical, 'user', `[Inbox] ${bodyRaw}`, MAX_MESSAGES_PER_CHAT);
            await replyAndTrack(
              msg,
              `${ack}\n\n_Pesan pengingat nanti disesuaikan gaya & ingatan chat ini._\n_id:_ ${id}`
            );
            db.appendHistory(canonical, 'assistant', ack, MAX_MESSAGES_PER_CHAT);
            log('[pengingat inbox]', id, canonical.slice(0, 40));
            return;
          }
        }
      }

      await runAiReply(msg, canonical, bodyRaw, false, client);
    } catch (e) {
      const em = e?.message != null ? String(e.message) : String(e);
      log('message handler error:', em);
      try {
        const detail = em.length > 450 ? `${em.slice(0, 450)}…` : em;
        await replyAndTrack(
          msg,
          `*Maaf — ada gangguan memproses pesan ini.*\n\n_${detail}_`
        );
      } catch (replyErr) {
        log('message: tidak bisa kirim penjelasan error:', replyErr.message);
      }
    }
  });

  log('Menghubungkan ke WhatsApp…');
  try {
    await client.initialize();
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    if (/profile appears to be in use|SingletonLock|another computer/i.test(msg)) {
      log('');
      log('ERROR: Profil WA/Chromium sedang dipakai proses lain (folder data sama: data/whatsapp-session).');
      log('  Jangan jalankan Docker dan npm start bersamaan untuk satu folder /var/www/ra.');
      log('  Hentikan container:  cd /var/www/ra && docker compose stop');
      log('  Lalu opsional hapus kunci:  rm -f data/whatsapp-session/session/SingletonLock data/whatsapp-session/session/SingletonSocket data/whatsapp-session/session/SingletonCookie');
      log('  Produksi disarankan hanya: docker compose up -d');
      log('');
    }
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
