const axios  = require('axios');
const crypto = require('crypto');
const fs     = require('fs');
const moment = require('moment-timezone');
const dns    = require('dns').promises;

// ╔══════════════════════════════════════════════════════════════╗
// ║              CRYSKYY TELEGRAM BOT — telegram.js             ║
// ╚══════════════════════════════════════════════════════════════╝

module.exports = function startTelegramBot(TOKEN) {
  const API    = `https://api.telegram.org/bot${TOKEN}`;
  const PREFIX = '/';

  // ── State ──────────────────────────────────────────────────
  const notes       = new Map();  // chatId:key → val
  const warnMap     = new Map();  // chatId:userId → count
  const antiSpam    = new Map();  // userId → timestamp
  const tebakanGame = new Map();  // chatId → { angka, attempts }
  const pomodoros   = new Map();  // chatId → timeoutId
  const startTime   = Date.now();

  // ── Admin check (Telegram) ─────────────────────────────────
  const isAdmin = async (chatId, userId) => {
    try {
      const res = await tg('getChatMember', { chat_id: chatId, user_id: userId });
      return ['administrator','creator'].includes(res.result?.status);
    } catch { return false; }
  };

  // ── Core API call ──────────────────────────────────────────
  const tg = async (method, params = {}) => {
    try {
      const res = await axios.post(`${API}/${method}`, params, { timeout: 10000 });
      return res.data;
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  // ── Send helpers ───────────────────────────────────────────
  const send = (chat_id, text, extra = {}) =>
    tg('sendMessage', { chat_id, text, parse_mode: 'Markdown', ...extra });

  const reply = (msg, text, extra = {}) =>
    send(msg.chat.id, text, { reply_to_message_id: msg.message_id, ...extra });

  const sendPhoto = (chat_id, photo, caption = '', extra = {}) =>
    tg('sendPhoto', { chat_id, photo, caption, parse_mode: 'Markdown', ...extra });

  const sendDocument = (chat_id, document, caption = '', extra = {}) =>
    tg('sendDocument', { chat_id, document, caption, parse_mode: 'Markdown', ...extra });

  // ── Helpers ────────────────────────────────────────────────
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

  const formatUptime = (ms) => {
    const s = Math.floor(ms/1000);
    const d = Math.floor(s/86400), h = Math.floor((s%86400)/3600),
          mn = Math.floor((s%3600)/60), sc = s%60;
    return [d&&`${d}d`, h&&`${h}h`, mn&&`${mn}m`, `${sc}s`].filter(Boolean).join(' ');
  };

  // ── Long poll ──────────────────────────────────────────────
  let offset = 0;
  const poll = async () => {
    while (true) {
      try {
        const data = await tg('getUpdates', { offset, timeout: 30, limit: 100 });
        if (!data.ok || !data.result?.length) continue;
        for (const upd of data.result) {
          offset = upd.update_id + 1;
          handleUpdate(upd).catch(() => {});
        }
      } catch { await new Promise(r => setTimeout(r, 2000)); }
    }
  };

  // ╔══════════════════════════════════════════════════════════╗
  // ║                    UPDATE HANDLER                       ║
  // ╚══════════════════════════════════════════════════════════╝
  const handleUpdate = async (upd) => {
    const msg = upd.message || upd.edited_message || upd.channel_post;
    if (!msg || !msg.text) return;

    const text     = msg.text.trim();
    const chatId   = msg.chat.id;
    const userId   = msg.from?.id;
    const userName = msg.from?.first_name || 'User';
    const isGroup  = msg.chat.type !== 'private';
    const quotedMsg = msg.reply_to_message;

    if (!text.startsWith(PREFIX)) return;

    // Anti-spam: 1.5 detik per user
    const now  = Date.now();
    const last = antiSpam.get(userId) || 0;
    if (now - last < 1500) return;
    antiSpam.set(userId, now);

    // Parse command & args
    const parts   = text.slice(PREFIX.length).trim().split(/\s+/);
    const command = parts[0].split('@')[0].toLowerCase();
    const args    = parts.slice(1);
    const q       = args.join(' ');

    // ── COMMAND SWITCH ────────────────────────────────────────
    switch (command) {

      // ════════════════════════════════════════════════════════
      //  MENU
      // ════════════════════════════════════════════════════════
      case 'start':
      case 'menu':
      case 'help': {
        const menuText =
          `🤖 *Cryskyy Telegram Bot*\n` +
          `📡 v1.3.0 | @CYX\\_Corporation\n\n` +
          `⚙️ *Utils*\n` +
          `/ping /uptime /info /stats\n` +
          `/calc /random /suhu /bmi /kurs\n` +
          `/b64enc /b64dec /reverse /charcount\n` +
          `/morse /demorse /rot13 /caesar\n` +
          `/genpass /xorenc /xordec /hash\n` +
          `/qr /lorem /countdown /age /zodiak\n` +
          `/splitbill /timestamp /urlencode /urldecode\n\n` +
          `🌐 *Network*\n` +
          `/myip /ipinfo /dns /rdns /whois\n` +
          `/cekweb /loadtime /pagesize /header\n` +
          `/sslcheck /pinghost /webx\n\n` +
          `🎮 *Fun*\n` +
          `/quote /coin /dice /truth /dare\n` +
          `/tebak /stoptebak /pomodoro\n` +
          `/cuaca /rps /roast /compliment\n\n` +
          `📝 *Catatan*\n` +
          `/setnote /getnote /delnote\n\n` +
          `👥 *Grup (Admin)*\n` +
          `/warn /resetwarn /kick /promote /demote\n` +
          `/groupinfo /tagall /mute /unmute\n\n` +
          `_Prefix: /${PREFIX === '/' ? '' : PREFIX}_`;
        reply(msg, menuText);
        break;
      }

      // ════════════════════════════════════════════════════════
      //  BASIC UTILS
      // ════════════════════════════════════════════════════════
      case 'ping': {
        const t0 = Date.now();
        const m2 = await send(chatId, '🏓 Pong...');
        const lat = Date.now() - t0;
        tg('editMessageText', {
          chat_id: chatId,
          message_id: m2.result?.message_id,
          text: `🏓 *Pong!*\n⏱️ Latency: *${lat}ms*`,
          parse_mode: 'Markdown'
        });
        break;
      }

      case 'uptime': {
        reply(msg,
          `⏳ *Bot Uptime*\n\n` +
          `🕐 Aktif : *${formatUptime(Date.now()-startTime)}*\n` +
          `📅 Sejak : ${moment(startTime).tz("Asia/Jakarta").format("DD/MM/YYYY HH:mm:ss")}`
        );
        break;
      }

      case 'info': {
        const u = msg.from;
        reply(msg,
          `📊 *INFO USER*\n\n` +
          `👤 Nama   : ${u.first_name} ${u.last_name||''}\n` +
          `🆔 ID     : \`${u.id}\`\n` +
          `👤 Username: ${u.username ? '@'+u.username : '-'}\n` +
          `🌐 Lang   : ${u.language_code||'-'}\n` +
          `🤖 Bot?   : ${u.is_bot ? 'Ya' : 'Tidak'}\n` +
          `💬 Chat   : ${msg.chat.title||'Private'} (${msg.chat.type})`
        );
        break;
      }

      case 'stats': {
        reply(msg,
          `📊 *Bot Stats*\n\n` +
          `⏱️ Uptime : *${formatUptime(Date.now()-startTime)}*\n` +
          `📝 Notes  : ${notes.size}\n` +
          `🎮 Games  : ${tebakanGame.size} aktif\n` +
          `🍅 Pomodoro: ${pomodoros.size} aktif\n` +
          `📅 Waktu  : ${moment().tz("Asia/Jakarta").format("HH:mm:ss · DD/MM/YYYY")}`
        );
        break;
      }

      // ════════════════════════════════════════════════════════
      //  TEXT UTILS
      // ════════════════════════════════════════════════════════
      case 'b64enc': {
        if (!q) { reply(msg, "❌ `/b64enc [teks]`"); break; }
        reply(msg, `🔤 *Base64 Encode*\n\n\`${Buffer.from(q).toString('base64')}\``);
        break;
      }

      case 'b64dec': {
        if (!q) { reply(msg, "❌ `/b64dec [base64]`"); break; }
        try { reply(msg, `🔓 *Base64 Decode*\n\n${Buffer.from(q,'base64').toString('utf-8')}`); }
        catch { reply(msg, "❌ String tidak valid!"); }
        break;
      }

      case 'reverse': {
        if (!q) { reply(msg, "❌ `/reverse [teks]`"); break; }
        reply(msg, `🔠 *Reverse*\n\n${q.split('').reverse().join('')}`);
        break;
      }

      case 'charcount': {
        if (!q) { reply(msg, "❌ `/charcount [teks]`"); break; }
        const words = q.trim().split(/\s+/).length;
        reply(msg,
          `📏 *Character Count*\n\n` +
          `📝 Dengan spasi : *${q.length}*\n` +
          `📝 Tanpa spasi  : *${q.replace(/\s/g,'').length}*\n` +
          `💬 Kata         : *${words}*`
        );
        break;
      }

      case 'morse': {
        if (!q) { reply(msg, "❌ `/morse [teks]`"); break; }
        const MENC = { A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..',0:'-----',1:'.----',2:'..---',3:'...--',4:'....-',5:'.....',6:'-....',7:'--...',8:'---..',9:'----.',' ':'/' };
        reply(msg, `📡 *Morse*\n\n📥 ${q}\n📤 \`${q.toUpperCase().split('').map(c=>MENC[c]||'?').join(' ')}\``);
        break;
      }

      case 'demorse': {
        if (!q) { reply(msg, "❌ `/demorse [kode morse]`"); break; }
        const MDEC = { '.-':'A','-...':'B','-.-.':'C','-..':'D','.':'E','..-.':'F','--.':'G','....':'H','..':'I','.---':'J','-.-':'K','.-..':'L','--':'M','-.':'N','---':'O','.--.':'P','--.-':'Q','.-.':'R','...':'S','-':'T','..-':'U','...-':'V','.--':'W','-..-':'X','-.--':'Y','--..':'Z','-----':'0','.----':'1','..---':'2','...--':'3','....-':'4','.....':'5','-....':'6','--...':'7','---..':'8','----.':'9','/':' ' };
        reply(msg, `📡 *Demorse*\n\n📥 \`${q}\`\n📤 *${q.trim().split(' ').map(c=>MDEC[c]||'?').join('')}*`);
        break;
      }

      case 'rot13': {
        if (!q) { reply(msg, "❌ `/rot13 [teks]`"); break; }
        const r13 = q.replace(/[a-zA-Z]/g, c => { const b = c<='Z'?65:97; return String.fromCharCode(((c.charCodeAt(0)-b+13)%26)+b); });
        reply(msg, `🔄 *ROT13*\n\n📥 ${q}\n📤 ${r13}`);
        break;
      }

      case 'caesar': {
        const shift = parseInt(args[0]); const cTxt = args.slice(1).join(' ');
        if (isNaN(shift)||!cTxt) { reply(msg, "❌ `/caesar [shift] [teks]`\nContoh: `/caesar 3 hello`"); break; }
        const enc = cTxt.replace(/[a-zA-Z]/g, c => { const b=c<='Z'?65:97; return String.fromCharCode(((c.charCodeAt(0)-b+shift%26+26)%26)+b); });
        reply(msg, `🔐 *Caesar*\n\n🔢 Shift : ${shift}\n📥 ${cTxt}\n📤 ${enc}`);
        break;
      }

      case 'hash': {
        if (!q) { reply(msg, "❌ `/hash [teks]`"); break; }
        reply(msg,
          `🔐 *Hash Generator*\n\n` +
          `📝 Input : \`${q}\`\n\n` +
          `🔵 MD5    : \`${crypto.createHash('md5').update(q).digest('hex')}\`\n` +
          `🟡 SHA1   : \`${crypto.createHash('sha1').update(q).digest('hex')}\`\n` +
          `🔴 SHA256 : \`${crypto.createHash('sha256').update(q).digest('hex')}\``
        );
        break;
      }

      case 'genpass': {
        const gpLen = Math.min(Math.max(parseInt(q)||16,8),64);
        const gpSet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}';
        const gpByt = crypto.randomBytes(gpLen); let gpPass = '';
        for (let i=0;i<gpLen;i++) gpPass += gpSet[gpByt[i]%gpSet.length];
        const gpScore = [/[A-Z]/.test(gpPass),/[a-z]/.test(gpPass),/[0-9]/.test(gpPass),/[^A-Za-z0-9]/.test(gpPass)].filter(Boolean).length;
        reply(msg,
          `🔐 *Password Generator*\n\n` +
          `🗝️ : \`${gpPass}\`\n` +
          `📏 Panjang : ${gpLen} karakter\n` +
          `💪 Kekuatan: ${gpScore===4?"🟢 Sangat Kuat":gpScore===3?"🟡 Kuat":"🔴 Lemah"}`
        );
        break;
      }

      case 'xorenc': {
        if (!q||!q.includes('|')) { reply(msg, "❌ `/xorenc [key]|[teks]`"); break; }
        const [xeK, xeT] = q.split('|');
        let xeE=''; for(let i=0;i<xeT.length;i++) xeE+=String.fromCharCode(xeT.charCodeAt(i)^xeK.charCodeAt(i%xeK.length));
        reply(msg, `🔐 *XOR Encrypt*\n\n🗝️ Key: \`${xeK}\`\n📤 \`${Buffer.from(xeE,'binary').toString('base64')}\``);
        break;
      }

      case 'xordec': {
        if (!q||!q.includes('|')) { reply(msg, "❌ `/xordec [key]|[base64]`"); break; }
        const [xdK, xdB] = q.split('|');
        try {
          const xdE=Buffer.from(xdB,'base64').toString('binary'); let xdD='';
          for(let i=0;i<xdE.length;i++) xdD+=String.fromCharCode(xdE.charCodeAt(i)^xdK.charCodeAt(i%xdK.length));
          reply(msg, `🔓 *XOR Decrypt*\n\n📤 *${xdD}*`);
        } catch { reply(msg, "❌ Data tidak valid!"); }
        break;
      }

      case 'urlencode': {
        if (!q) { reply(msg, "❌ `/urlencode [teks]`"); break; }
        reply(msg, `🔗 *URL Encode*\n\n\`${encodeURIComponent(q)}\``);
        break;
      }

      case 'urldecode': {
        if (!q) { reply(msg, "❌ `/urldecode [teks]`"); break; }
        try { reply(msg, `🔗 *URL Decode*\n\n${decodeURIComponent(q)}`); }
        catch { reply(msg, "❌ Tidak valid!"); }
        break;
      }

      case 'timestamp': {
        const tsN = q ? parseInt(q) : null;
        if (tsN) {
          const d = new Date(tsN.toString().length<=10 ? tsN*1000 : tsN);
          reply(msg, `⏱️ *Timestamp → Tanggal*\n\n📅 *${moment(d).tz("Asia/Jakarta").format("dddd, DD MMMM YYYY HH:mm:ss")} WIB*`);
        } else {
          reply(msg, `⏱️ *Timestamp Sekarang*\n\n🔢 Unix (s) : \`${Math.floor(Date.now()/1000)}\`\n🔢 Unix (ms): \`${Date.now()}\``);
        }
        break;
      }

      // ════════════════════════════════════════════════════════
      //  KALKULATOR & KONVERSI
      // ════════════════════════════════════════════════════════
      case 'calc': {
        if (!q) { reply(msg, "❌ `/calc [ekspresi]`\nContoh: `/calc 10 * 5 + 3`"); break; }
        try {
          if (!/^[\d\s\+\-\*\/\.\(\)%^]+$/.test(q)) throw new Error("Karakter tidak valid!");
          const hasil = Function(`"use strict"; return (${q})`)();
          reply(msg, `🔢 *Kalkulator*\n\n📥 \`${q}\`\n📤 *${hasil}*`);
        } catch (e) { reply(msg, `❌ Error: ${e.message}`); }
        break;
      }

      case 'random': {
        const rP = q.split('-'); const rMin=parseInt(rP[0])||1; const rMax=parseInt(rP[1])||100;
        if (rMin>=rMax) { reply(msg, "❌ `/random [min]-[max]`\nContoh: `/random 1-1000`"); break; }
        reply(msg, `🎰 *Random*\n\n📊 ${rMin} — ${rMax}\n🎯 Hasil: *${Math.floor(Math.random()*(rMax-rMin+1))+rMin}*`);
        break;
      }

      case 'suhu': {
        if (!q) { reply(msg, "❌ `/suhu [angka][c/f/k]`\nContoh: `/suhu 100c`"); break; }
        const sm = q.match(/^(-?\d+\.?\d*)([cfk])$/i);
        if (!sm) { reply(msg, "❌ Format salah!"); break; }
        const sv=parseFloat(sm[1]); const su=sm[2].toLowerCase();
        let sc,sf,sk;
        if(su==='c'){sc=sv;sf=sc*9/5+32;sk=sc+273.15;}
        else if(su==='f'){sf=sv;sc=(sf-32)*5/9;sk=sc+273.15;}
        else{sk=sv;sc=sk-273.15;sf=sc*9/5+32;}
        reply(msg, `🌡️ *Konversi Suhu*\n\n🔵 Celsius    : *${sc.toFixed(2)}°C*\n🔴 Fahrenheit : *${sf.toFixed(2)}°F*\n🟡 Kelvin     : *${sk.toFixed(2)} K*`);
        break;
      }

      case 'bmi': {
        if (!q) { reply(msg, "❌ `/bmi [berat] [tinggi]`\nContoh: `/bmi 65 170`"); break; }
        const [bw,bh]=q.split(' ').map(Number);
        if (!bw||!bh) { reply(msg, "❌ Format salah!"); break; }
        const bHm=bh/100; const bBmi=(bw/(bHm*bHm)).toFixed(1);
        let bCat,bSaran;
        if(bBmi<18.5){bCat="🔵 Kurus";bSaran="Tingkatkan asupan kalori bergizi.";}
        else if(bBmi<25){bCat="🟢 Normal";bSaran="Pertahankan pola hidup sehat!";}
        else if(bBmi<30){bCat="🟡 Overweight";bSaran="Kurangi lemak, perbanyak olahraga.";}
        else{bCat="🔴 Obesitas";bSaran="Konsultasi dokter atau ahli gizi.";}
        reply(msg, `⚖️ *BMI*\n\n📊 BMI : *${bBmi}*\n📋 Status : *${bCat}*\n💡 ${bSaran}`);
        break;
      }

      case 'kurs': {
        if (!q) { reply(msg, "❌ `/kurs [jumlah] [dari] [ke]`\nContoh: `/kurs 100 USD IDR`"); break; }
        const kP=q.toUpperCase().split(' '); const kAmt=parseFloat(kP[0]); const kFrom=kP[1]; const kTo=kP[2];
        if (isNaN(kAmt)||!kFrom||!kTo) { reply(msg, "❌ Format salah!"); break; }
        try {
          const kRes = await axios.get(`https://open.er-api.com/v6/latest/${kFrom}`,{timeout:8000});
          if (kRes.data.result!=='success') throw new Error('API error');
          const kRate=kRes.data.rates[kTo];
          if (!kRate) { reply(msg, `❌ Mata uang *${kTo}* tidak ditemukan!`); break; }
          reply(msg, `💱 *Konversi Kurs*\n\n💰 ${kAmt.toLocaleString()} *${kFrom}* = *${(kAmt*kRate).toFixed(2)} ${kTo}*\n📊 Rate: 1 ${kFrom} = ${kRate.toFixed(4)} ${kTo}`);
        } catch { reply(msg, "❌ Gagal mengambil kurs!"); }
        break;
      }

      case 'splitbill': {
        if (!q) { reply(msg, "❌ `/splitbill [total] [orang] [tip%]`\nContoh: `/splitbill 200000 4 10`"); break; }
        const sbP=q.split(' '); const sbT=parseFloat(sbP[0]); const sbO=parseInt(sbP[1]); const sbTip=parseFloat(sbP[2])||0;
        if (isNaN(sbT)||isNaN(sbO)||sbO<1) { reply(msg, "❌ Format salah!"); break; }
        const sbTA=sbT*(sbTip/100); const sbGT=sbT+sbTA;
        reply(msg,
          `🧾 *Split Bill*\n\n` +
          `💰 Total : Rp${sbT.toLocaleString('id-ID')}\n` +
          `💸 Tip (${sbTip}%): Rp${sbTA.toLocaleString('id-ID')}\n` +
          `📊 Grand Total: Rp${sbGT.toLocaleString('id-ID')}\n` +
          `👥 Orang: ${sbO}\n\n` +
          `💳 *Per orang: Rp${Math.ceil(sbGT/sbO).toLocaleString('id-ID')}*`
        );
        break;
      }

      case 'age': {
        if (!q) { reply(msg, "❌ `/age [DD/MM/YYYY]`\nContoh: `/age 17/08/2000`"); break; }
        const [ad,am,ay]=q.split('/').map(Number);
        if (!ad||!am||!ay) { reply(msg, "❌ Format salah!"); break; }
        const aBirth=new Date(ay,am-1,ad); const aToday=new Date();
        if (aBirth>aToday) { reply(msg, "❌ Tanggal lahir tidak boleh masa depan!"); break; }
        let aY=aToday.getFullYear()-aBirth.getFullYear(),aMo=aToday.getMonth()-aBirth.getMonth(),aDy=aToday.getDate()-aBirth.getDate();
        if(aDy<0){aMo--;aDy+=new Date(aToday.getFullYear(),aToday.getMonth(),0).getDate();}
        if(aMo<0){aY--;aMo+=12;}
        const aTD=Math.floor((aToday-aBirth)/86400000);
        const aNB=new Date(aToday.getFullYear(),am-1,ad);
        if(aNB<=aToday) aNB.setFullYear(aToday.getFullYear()+1);
        reply(msg,
          `🎂 *Kalkulator Umur*\n\n` +
          `📅 Lahir : ${q}\n` +
          `🎯 Umur  : *${aY} tahun, ${aMo} bulan, ${aDy} hari*\n` +
          `📊 Total : *${aTD.toLocaleString()} hari*\n` +
          `🎉 HUT   : *${Math.ceil((aNB-aToday)/86400000)} hari* lagi!`
        );
        break;
      }

      case 'zodiak': {
        if (!q) { reply(msg, "❌ `/zodiak [DD/MM]`\nContoh: `/zodiak 15/08`"); break; }
        const [zd,zm]=q.split('/').map(Number);
        if (!zd||!zm) { reply(msg, "❌ Format salah!"); break; }
        const zList=[
          {name:'♑ Capricorn',from:[12,22],to:[1,19],sifat:'Ambisius, disiplin, sabar'},
          {name:'♒ Aquarius',from:[1,20],to:[2,18],sifat:'Inovatif, bebas, humanis'},
          {name:'♓ Pisces',from:[2,19],to:[3,20],sifat:'Imajinatif, empati, lembut'},
          {name:'♈ Aries',from:[3,21],to:[4,19],sifat:'Berani, energik, impulsif'},
          {name:'♉ Taurus',from:[4,20],to:[5,20],sifat:'Stabil, setia, sabar'},
          {name:'♊ Gemini',from:[5,21],to:[6,20],sifat:'Komunikatif, adaptif'},
          {name:'♋ Cancer',from:[6,21],to:[7,22],sifat:'Penuh kasih, intuitif'},
          {name:'♌ Leo',from:[7,23],to:[8,22],sifat:'Percaya diri, loyal'},
          {name:'♍ Virgo',from:[8,23],to:[9,22],sifat:'Analitis, perfeksionis'},
          {name:'♎ Libra',from:[9,23],to:[10,22],sifat:'Adil, sosial, diplomatik'},
          {name:'♏ Scorpio',from:[10,23],to:[11,21],sifat:'Intensif, misterius'},
          {name:'♐ Sagittarius',from:[11,22],to:[12,21],sifat:'Optimis, petualang'}
        ];
        let zFound=null;
        for(const z of zList){const[fm,fd]=z.from,[tm,td]=z.to;if((zm===fm&&zd>=fd)||(zm===tm&&zd<=td)){zFound=z;break;}}
        if(!zFound&&zm===12&&zd>=22) zFound=zList[0];
        if (!zFound) { reply(msg, "❌ Tanggal tidak valid!"); break; }
        reply(msg, `🔮 *Zodiak*\n\n🌟 *${zFound.name}*\n✨ Sifat: ${zFound.sifat}`);
        break;
      }

      case 'countdown': {
        if (!q) { reply(msg, "❌ `/countdown [DD/MM/YYYY] [event]`\nContoh: `/countdown 25/12/2025 Natal`"); break; }
        const cdP=q.split(' '); const cdDStr=cdP[0]; const cdEv=cdP.slice(1).join(' ')||"Event";
        const [cdd,cdm,cdy]=cdDStr.split('/').map(Number);
        if(!cdd||!cdm||!cdy){reply(msg,"❌ Format salah!");break;}
        const cdTarget=new Date(cdy,cdm-1,cdd); const cdDiff=cdTarget-new Date();
        if(cdDiff<=0){reply(msg,`📅 *${cdEv}* sudah berlalu!`);break;}
        reply(msg,
          `⏳ *Countdown — ${cdEv}*\n\n` +
          `📅 Target : ${cdDStr}\n\n` +
          `\`\`\`\n` +
          ` ${Math.floor(cdDiff/86400000)} hari\n` +
          ` ${Math.floor(cdDiff%86400000/3600000)} jam\n` +
          ` ${Math.floor(cdDiff%3600000/60000)} menit\n` +
          ` ${Math.floor(cdDiff%60000/1000)} detik\n` +
          `\`\`\``
        );
        break;
      }

      case 'lorem': {
        const loremWords = ["lorem","ipsum","dolor","sit","amet","consectetur","adipiscing","elit","sed","do","eiusmod","tempor","incididunt","ut","labore","et","dolore","magna","aliqua","enim","ad","minim","veniam","quis","nostrud","exercitation","ullamco","laboris","nisi","aliquip","ex","ea","commodo","consequat"];
        const lCount=Math.min(Math.max(parseInt(q)||3,1),10); let lResult='';
        for(let s=0;s<lCount;s++){
          const wc=8+Math.floor(Math.random()*8);
          const words=Array.from({length:wc},()=>loremWords[Math.floor(Math.random()*loremWords.length)]);
          words[0]=words[0].charAt(0).toUpperCase()+words[0].slice(1);
          lResult+=words.join(' ')+'. ';
        }
        reply(msg, `📜 *Lorem Ipsum* (${lCount} kalimat)\n\n${lResult.trim()}`);
        break;
      }

      case 'qr': {
        if (!q) { reply(msg, "❌ `/qr [teks atau URL]`"); break; }
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(q)}&size=400x400&format=png&margin=10`;
        sendPhoto(chatId, qrUrl, `📱 *QR Code*\n\n📝 Data: ${q.length>50?q.substring(0,50)+'...':q}`);
        break;
      }

      // ════════════════════════════════════════════════════════
      //  NETWORK TOOLS
      // ════════════════════════════════════════════════════════
      case 'myip': {
        reply(msg, "🔍 Mengambil IP...");
        try {
          const res = await axios.get("https://api.ipify.org?format=json",{timeout:8000});
          const ip = res.data.ip;
          const geo = await axios.get(`http://ip-api.com/json/${ip}?fields=country,regionName,city,isp,timezone`,{timeout:8000});
          const d = geo.data;
          reply(msg, `🌐 *IP Bot*\n\n📍 *${ip}*\n🏳️ ${d.country}\n🏙️ ${d.city}, ${d.regionName}\n🕐 ${d.timezone}\n🏢 ${d.isp}`);
        } catch { reply(msg, "❌ Gagal!"); }
        break;
      }

      case 'ipinfo': {
        if (!q||!/^(\d{1,3}\.){3}\d{1,3}$/.test(q.trim())) { reply(msg, "❌ `/ipinfo [IP]`\nContoh: `/ipinfo 8.8.8.8`"); break; }
        try {
          const res = await axios.get(`http://ip-api.com/json/${q.trim()}?fields=status,country,regionName,city,zip,lat,lon,timezone,isp,org,as,query`,{timeout:8000});
          const d=res.data;
          if(d.status!=='success'){reply(msg,"❌ IP tidak valid!");break;}
          reply(msg,
            `🌐 *IP Info — ${d.query}*\n\n` +
            `🏳️ ${d.country} · ${d.city}, ${d.regionName}\n` +
            `🕐 ${d.timezone}\n` +
            `📍 ${d.lat}, ${d.lon}\n` +
            `🏢 ${d.isp}\n` +
            `🔢 ${d.as||'-'}`
          );
        } catch { reply(msg, "❌ Gagal!"); }
        break;
      }

      case 'dns': {
        if (!q) { reply(msg, "❌ `/dns [domain]`\nContoh: `/dns google.com`"); break; }
        const dnsDomain=cleanDomain(q);
        const loadMsg = await reply(msg, `🔍 DNS Lookup *${dnsDomain}*...`);
        try {
          const results={};
          try{results.A=(await dns.resolve4(dnsDomain)).slice(0,3).join(', ');}catch{}
          try{const r=await dns.resolve6(dnsDomain);if(r.length)results.AAAA=r[0];}catch{}
          try{const r=await dns.resolveMx(dnsDomain);if(r.length)results.MX=r.slice(0,2).map(x=>`${x.exchange}(${x.priority})`).join(', ');}catch{}
          try{const r=await dns.resolveNs(dnsDomain);if(r.length)results.NS=r.slice(0,3).join(', ');}catch{}
          try{const r=await dns.resolveCname(dnsDomain);if(r.length)results.CNAME=r[0];}catch{}
          let txt=`🔍 *DNS — ${dnsDomain}*\n\n`;
          if(results.A)txt+=`📌 A : ${results.A}\n`;
          if(results.AAAA)txt+=`📌 AAAA : ${results.AAAA}\n`;
          if(results.CNAME)txt+=`🔗 CNAME : ${results.CNAME}\n`;
          if(results.MX)txt+=`📧 MX : ${results.MX}\n`;
          if(results.NS)txt+=`🖥️ NS : ${results.NS}\n`;
          if(Object.keys(results).length===0)txt+="❌ Tidak ada record.";
          tg('editMessageText',{chat_id:chatId,message_id:loadMsg.result?.message_id,text:txt,parse_mode:'Markdown'});
        } catch(e) { reply(msg, `❌ Gagal: ${e.message}`); }
        break;
      }

      case 'rdns': {
        if (!q||!/^(\d{1,3}\.){3}\d{1,3}$/.test(q.trim())) { reply(msg, "❌ `/rdns [IP]`"); break; }
        try {
          const h=await dns.reverse(q.trim());
          reply(msg, `🔄 *Reverse DNS*\n\n📍 IP: ${q}\n🌐 ${h.join(', ')}`);
        } catch(e) { reply(msg, `❌ Gagal: ${e.message}`); }
        break;
      }

      case 'whois': {
        if (!q) { reply(msg, "❌ `/whois [domain]`"); break; }
        const wDomain=cleanDomain(q);
        reply(msg, `🔍 WHOIS *${wDomain}*...`);
        try {
          const res=await axios.get(`https://who-dat.as93.net/${wDomain}`,{timeout:10000});
          const d=res.data;
          reply(msg,
            `📋 *WHOIS — ${wDomain}*\n\n` +
            `🏢 Registrar : ${d.registrar?.name||d.registrar||"-"}\n` +
            `📅 Dibuat    : ${d.creation_date?.[0]||d.created_date||"-"}\n` +
            `📅 Expired   : ${d.expiration_date?.[0]||d.expiry_date||"-"}\n` +
            `📊 Status    : ${Array.isArray(d.status)?d.status.slice(0,2).join(', '):(d.status||"-")}\n` +
            `🖥️ NS        : ${Array.isArray(d.name_servers)?d.name_servers.slice(0,3).join(', '):"-"}`
          );
        } catch(e) { reply(msg, `❌ Gagal: ${e.message}`); }
        break;
      }

      case 'cekweb': {
        if (!q) { reply(msg, "❌ `/cekweb [url]`"); break; }
        let wUrl=q.trim(); if(!wUrl.startsWith('http')) wUrl='https://'+wUrl;
        const t0=Date.now();
        try {
          const wRes=await axios.get(wUrl,{timeout:10000,validateStatus:()=>true});
          const wms=Date.now()-t0; const ws=wRes.status;
          const wE=ws<300?"🟢":ws<400?"🟡":"🔴";
          reply(msg,
            `${wE} *Website Checker*\n\n` +
            `🌐 ${wUrl}\n` +
            `📊 Status : *${ws}*\n` +
            `⏱️ Latency: *${wms}ms*\n` +
            `📋 Server : ${wRes.headers?.server||'-'}\n\n` +
            `${ws<400?"✅ *ONLINE*":"❌ *DOWN*"}`
          );
        } catch(e) { reply(msg, `🔴 *OFFLINE*\n\n${wUrl}\n⏱️ ${Date.now()-t0}ms\n${e.message}`); }
        break;
      }

      case 'sslcheck': {
        if (!q) { reply(msg, "❌ `/sslcheck [domain]`"); break; }
        const sslDomain=cleanDomain(q);
        reply(msg, `🔒 Cek SSL *${sslDomain}*...`);
        try {
          const tls=require('tls');
          let sslInfo={valid:false,issuer:"N/A",expiry:"N/A",daysLeft:"N/A",subject:"N/A"};
          const tlsSocket=tls.connect({host:sslDomain,port:443,rejectUnauthorized:false,timeout:8000});
          await new Promise(resolve=>{
            tlsSocket.once('secureConnect',()=>{
              const cert=tlsSocket.getPeerCertificate();
              sslInfo.valid=true;
              sslInfo.issuer=cert.issuer?.CN||cert.issuer?.O||"Unknown";
              sslInfo.expiry=new Date(cert.valid_to).toLocaleDateString('id-ID');
              const daysLeft=Math.ceil((new Date(cert.valid_to)-new Date())/86400000);
              sslInfo.daysLeft=daysLeft>0?`${daysLeft} hari`:"⌛ Expired";
              sslInfo.subject=cert.subject?.CN||"N/A";
              tlsSocket.destroy();resolve();
            });
            tlsSocket.once('error',()=>{tlsSocket.destroy();resolve();});
            setTimeout(()=>{tlsSocket.destroy();resolve();},8000);
          });
          reply(msg,
            `🔒 *SSL — ${sslDomain}*\n\n` +
            `✅ Valid   : *${sslInfo.valid?'Ya':'Tidak'}*\n` +
            (sslInfo.valid?`🏛️ Issuer  : ${sslInfo.issuer}\n🌐 Subject : ${sslInfo.subject}\n📅 Expired : ${sslInfo.expiry}\n⏳ Sisa    : *${sslInfo.daysLeft}*\n`:'')
          );
        } catch(e) { reply(msg, `❌ Gagal: ${e.message}`); }
        break;
      }

      case 'pinghost': {
        if (!q) { reply(msg, "❌ `/pinghost [host]`"); break; }
        const phHost=cleanDomain(q)||q;
        reply(msg, `🏓 Ping *${phHost}*...`);
        try {
          const times=[];
          for(let i=0;i<3;i++){
            const t0=Date.now();
            await axios.get(`https://${phHost}`,{timeout:5000,validateStatus:()=>true}).catch(()=>axios.get(`http://${phHost}`,{timeout:5000,validateStatus:()=>true}));
            times.push(Date.now()-t0);
            await new Promise(r=>setTimeout(r,300));
          }
          const avg=Math.round(times.reduce((a,b)=>a+b,0)/times.length);
          reply(msg,
            `🏓 *Ping — ${phHost}*\n\n` +
            times.map((t,i)=>`   ${i+1}. ${t}ms`).join('\n')+'\n\n' +
            `⚡ Min: *${Math.min(...times)}ms* | Avg: *${avg}ms* | Max: *${Math.max(...times)}ms*\n\n` +
            `${avg<200?"🟢 Latensi Baik":avg<500?"🟡 Sedang":"🔴 Tinggi"}`
          );
        } catch(e) { reply(msg, `❌ Gagal: ${e.message}`); }
        break;
      }

      case 'webx': {
        if (!q) { reply(msg, "❌ `/webx [domain]`"); break; }
        let wxDomain=q.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*$/,'').split(':')[0];
        const loadMsg2 = await reply(msg, `🔍 Scanning *${wxDomain}*...\n⏳ 10-20 detik`);
        try {
          let dnsR={};
          try{const[a,ns]=await Promise.all([dns.resolve4(wxDomain).catch(()=>[]),dns.resolveNs(wxDomain).catch(()=>[])]);dnsR={a,ns};}catch{}
          const wxIp=dnsR.a?.[0]||"Unknown";
          let geo={};
          if(wxIp!=="Unknown"){try{const gR=await axios.get(`http://ip-api.com/json/${wxIp}?fields=status,country,city,isp`,{timeout:5000});if(gR.data.status==='success')geo=gR.data;}catch{}}
          let wxPing="N/A";
          try{const s=Date.now();await axios.get(`https://${wxDomain}`,{timeout:5000});wxPing=`${Date.now()-s}ms`;}catch{}
          let sslV=false;
          try{const tls=require('tls');const s=tls.connect({host:wxDomain,port:443,rejectUnauthorized:false});await new Promise(r=>{s.once('secureConnect',()=>{sslV=true;s.destroy();r();});s.once('error',()=>{s.destroy();r();});setTimeout(()=>{s.destroy();r();},5000);});}catch{}
          const result=
            `🌐 *WebX — ${wxDomain}*\n\n`+
            `📡 IP  : ${dnsR.a?.join(', ')||'N/A'}\n`+
            (dnsR.ns?.length?`🖥️ NS  : ${dnsR.ns.slice(0,2).join(', ')}\n`:'')+
            (geo.country?`🗺️ GEO : ${geo.country} — ${geo.city} · ${geo.isp}\n`:'')+
            `⚡ Ping: ${wxPing}\n`+
            `🔒 SSL : ${sslV?"✅ Valid":"❌ Tidak"}`;
          tg('editMessageText',{chat_id:chatId,message_id:loadMsg2.result?.message_id,text:result,parse_mode:'Markdown'});
        } catch(e) { reply(msg, `❌ Gagal: ${e.message}`); }
        break;
      }

      case 'cuaca': {
        if (!q) { reply(msg, "❌ `/cuaca [kota]`"); break; }
        reply(msg, `🌤️ Mencari cuaca *${q}*...`);
        try {
          const gR=await axios.get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=id`,{timeout:8000});
          const geo=gR.data?.results?.[0];
          if(!geo){reply(msg,`❌ Kota *${q}* tidak ditemukan!`);break;}
          const wR=await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,apparent_temperature&timezone=auto`,{timeout:8000});
          const cur=wR.data.current; const wc=cur.weather_code;
          let wD,wE;
          if(wc===0){wD="Cerah";wE="☀️";}else if(wc<=3){wD="Berawan";wE="⛅";}else if(wc<=49){wD="Berkabut";wE="🌫️";}else if(wc<=69){wD="Hujan";wE="🌧️";}else if(wc<=79){wD="Salju";wE="❄️";}else{wD="Badai";wE="⛈️";}
          reply(msg,
            `${wE} *Cuaca — ${geo.name}, ${geo.country}*\n\n` +
            `🌡️ Suhu   : *${cur.temperature_2m}°C* (terasa ${cur.apparent_temperature}°C)\n` +
            `💧 Lembab : *${cur.relative_humidity_2m}%*\n` +
            `💨 Angin  : *${cur.wind_speed_10m} km/h*\n` +
            `☁️ Kondisi: *${wD}*`
          );
        } catch { reply(msg, "❌ Gagal mengambil data cuaca!"); }
        break;
      }

      // ════════════════════════════════════════════════════════
      //  FUN
      // ════════════════════════════════════════════════════════
      case 'quote': {
        const quotes = [
          "💡 _\"The best way to predict the future is to create it.\"_ — Drucker",
          "🚀 _\"Stay hungry, stay foolish.\"_ — Steve Jobs",
          "🌊 _\"In the middle of every difficulty lies opportunity.\"_ — Einstein",
          "🔥 _\"It does not matter how slowly you go as long as you do not stop.\"_ — Confucius",
          "💎 _\"Talk is cheap. Show me the code.\"_ — Linus Torvalds",
          "🌟 _\"Simplicity is the soul of efficiency.\"_ — Austin Freeman",
          "🧠 _\"Make it work, make it right, make it fast.\"_ — Kent Beck",
          "🔮 _\"Any sufficiently advanced technology is indistinguishable from magic.\"_ — Arthur C. Clarke",
          "🎯 _\"First, solve the problem. Then, write the code.\"_ — John Johnson",
          "🌈 _\"The only way to do great work is to love what you do.\"_ — Steve Jobs"
        ];
        reply(msg, `📜 *Random Quote*\n\n${quotes[Math.floor(Math.random()*quotes.length)]}`);
        break;
      }

      case 'coin': {
        const hasil = Math.random() < 0.5 ? '🪙 *HEADS*' : '🪙 *TAILS*';
        reply(msg, `🪙 *Lempar Koin*\n\n_Memutar..._\n\nHasil: ${hasil}`);
        break;
      }

      case 'dice': {
        const n = Math.min(Math.max(parseInt(q)||1,1),5);
        const diceEmoji = ['⚀','⚁','⚂','⚃','⚄','⚅'];
        const rolls = Array.from({length:n}, () => Math.floor(Math.random()*6));
        const total = rolls.reduce((a,b)=>a+b,0)+n;
        reply(msg, `🎲 *Lempar Dadu ${n}x*\n\n${rolls.map(r=>diceEmoji[r]).join(' ')}\n\n🔢 Total: *${total}*`);
        break;
      }

      case 'rps': {
        const choices = ['🪨 Batu','📄 Kertas','✂️ Gunting'];
        const botPick = choices[Math.floor(Math.random()*3)];
        const userPick = q ? (q.toLowerCase().includes('batu')||q.toLowerCase().includes('rock'))?choices[0]:q.toLowerCase().includes('kertas')||q.toLowerCase().includes('paper')?choices[1]:choices[2] : choices[Math.floor(Math.random()*3)];
        const win = (userPick===choices[0]&&botPick===choices[2])||(userPick===choices[1]&&botPick===choices[0])||(userPick===choices[2]&&botPick===choices[1]);
        const draw = userPick===botPick;
        reply(msg,
          `✊ *Rock Paper Scissors*\n\n` +
          `👤 Kamu : ${userPick}\n` +
          `🤖 Bot  : ${botPick}\n\n` +
          `${draw?"🟡 *SERI!*":win?"🟢 *KAMU MENANG!*":"🔴 *BOT MENANG!*"}`
        );
        break;
      }

      case 'truth': {
        const truths = [
          "Apa hal paling memalukan yang pernah kamu lakukan?",
          "Siapa yang paling kamu kagumi dalam hidupmu?",
          "Apa rahasia terbesar yang belum kamu ceritakan ke siapapun?",
          "Kalau bisa jadi orang lain selama 1 hari, kamu mau jadi siapa?",
          "Apa hal yang paling kamu sesali dalam hidupmu?",
          "Siapa yang pernah bikin kamu nangis paling keras?",
          "Apa hal paling gila yang pernah kamu lakuin karena berani-beranian?",
          "Kalau bisa mengulang satu momen, kamu mau ulang momen apa?",
          "Apa yang paling kamu takutin di dunia ini?",
          "Sebutkan 3 hal yang tidak ada orang yang tahu tentang kamu!"
        ];
        reply(msg, `🎭 *TRUTH*\n\n❓ ${truths[Math.floor(Math.random()*truths.length)]}`);
        break;
      }

      case 'dare': {
        const dares = [
          "Kirim selfie paling aneh yang bisa kamu buat sekarang!",
          "Ketik 'Aku suka bau ketiak' di grup ini!",
          "Ceritakan joke paling garing yang kamu tahu!",
          "Tag 3 orang secara random dan bilang 'I love you'!",
          "Tulis status WA/IG yang memalukan selama 5 menit!",
          "Nyanyi lagu favorit kamu (kirim voice note)!",
          "Tiru gaya bicara presenter TV selama 1 menit!",
          "Kirim foto barang paling aneh yang ada di sekitarmu!",
          "Ceritakan mimpi paling aneh yang pernah kamu alami!",
          "Bilang 'saya adalah aktor terbaik dunia' 3 kali!"
        ];
        reply(msg, `🎭 *DARE*\n\n🔥 ${dares[Math.floor(Math.random()*dares.length)]}`);
        break;
      }

      case 'roast': {
        const roasts = [
          "Otakmu kayak RAM 256MB — cuma cukup buat satu tab.",
          "Skill codingmu kayak lorem ipsum — penuh tapi nggak ada artinya.",
          "Kamu itu kayak loading 99% — bikin harap tapi nggak pernah selesai.",
          "Kecerdasanmu kayak sinyal 2G — lambat dan sering ilang.",
          "Kamu itu seperti semicolon di Python — nggak diperlukan.",
          "Response time kamu lebih lambat dari API gratis.",
          "IQ kamu kayak IP lokal — nggak bisa diakses dari luar.",
          "Kamu itu kayak bug yang susah di-reproduce — misterius dan bikin frustrasi.",
          "Nalar kamu kayak while(true) tanpa break — nggak ada ujungnya.",
          "Memori kamu kayak sessionStorage — hilang begitu di-refresh."
        ];
        const target = msg.reply_to_message?.from?.first_name || userName;
        reply(msg, `🔥 *Roast untuk ${target}*\n\n${roasts[Math.floor(Math.random()*roasts.length)]}`);
        break;
      }

      case 'compliment': {
        const compliments = [
          "Kamu itu kayak fiber optic — cepat, andal, dan koneksi yang luar biasa!",
          "Ide-idemu kayak full-stack developer — lengkap dan powerful!",
          "Kamu itu kayak HTTPS — aman, terenkripsi, dan terpercaya.",
          "Energimu kayak server 24/7 — nggak pernah down!",
          "Kamu kayak open source — transparan, berguna, dan diapresiasi banyak orang.",
          "Kreativitasmu kayak AI generatif — selalu menghasilkan sesuatu yang luar biasa!",
          "Kamu kayak dark mode — elegan, nyaman, dan bikin nyaman semua orang.",
          "Senyummu kayak successful build — bikin semua orang senang!",
          "Kamu itu kayak clean code — mudah dipahami dan disukai siapapun.",
          "Kamu kayak CDN — selalu hadir di mana pun dibutuhkan!"
        ];
        const target = msg.reply_to_message?.from?.first_name || userName;
        reply(msg, `💝 *Compliment untuk ${target}*\n\n${compliments[Math.floor(Math.random()*compliments.length)]}`);
        break;
      }

      case 'tebak': {
        if (!global.tebakanTg) global.tebakanTg = new Map();
        const tState = global.tebakanTg.get(chatId);
        if (!tState) { reply(msg, "❌ Belum ada sesi!\nAdmin mulai dengan: `/setangka [1-1000]`"); break; }
        const tTebak = parseInt(q);
        if (isNaN(tTebak)) { reply(msg, "❌ `/tebak [angka]`"); break; }
        tState.attempts++;
        const tDiff = Math.abs(tTebak - tState.angka);
        if (tTebak === tState.angka) {
          const att = tState.attempts;
          global.tebakanTg.delete(chatId);
          reply(msg, `🎉 *BENAR!* ${userName} menebak!\n\n🎯 Angka : *${tState.angka}*\n🔢 Percobaan: *${att} kali*\n\n${att<=3?"🏆 LUAR BIASA!":att<=7?"👍 Bagus!":"😅 Akhirnya!"}`);
        } else {
          const hint=tDiff<=10?"🔥 Sangat dekat!":tDiff<=50?"🌡️ Lumayan dekat":tDiff<=100?"❄️ Agak jauh":"🧊 Sangat jauh";
          reply(msg, `❌ *Salah!*\n\n${tTebak<tState.angka?"⬆️ Terlalu kecil!":"⬇️ Terlalu besar!"}\n${hint}\n\n🔢 Percobaan ke-${tState.attempts}`);
        }
        break;
      }

      case 'setangka': {
        if (!isGroup) { reply(msg, "❌ Hanya di grup!"); break; }
        const isAdm = await isAdmin(chatId, userId);
        if (!isAdm) { reply(msg, "❌ Admin only!"); break; }
        const sAngka = parseInt(q);
        if (isNaN(sAngka)||sAngka<1||sAngka>1000) { reply(msg, "❌ `/setangka [1-1000]`"); break; }
        if (!global.tebakanTg) global.tebakanTg = new Map();
        global.tebakanTg.set(chatId, { angka: sAngka, attempts: 0 });
        reply(msg, `✅ *Tebak angka dimulai!*\n\n🎯 Angka tersembunyi (1-1000)\nGunakan /tebak [angka]`);
        break;
      }

      case 'stoptebak': {
        if (!global.tebakanTg) global.tebakanTg = new Map();
        const stSt = global.tebakanTg.get(chatId);
        if (!stSt) { reply(msg, "❌ Tidak ada sesi aktif!"); break; }
        const stJwb = stSt.angka;
        global.tebakanTg.delete(chatId);
        reply(msg, `🛑 *Sesi dihentikan!*\n\n🎯 Jawaban: *${stJwb}*`);
        break;
      }

      case 'pomodoro': {
        const pomM = parseInt(q)||25;
        if (pomM<1||pomM>120) { reply(msg, "❌ Waktu 1-120 menit!"); break; }
        if (pomodoros.has(`${chatId}:${userId}`)) {
          clearTimeout(pomodoros.get(`${chatId}:${userId}`));
        }
        reply(msg, `🍅 *Pomodoro ${pomM} menit dimulai!*\n🎯 Fokus, ${userName}!\n\n_Bot akan mengingatkanmu setelah ${pomM} menit._`);
        const t = setTimeout(async () => {
          pomodoros.delete(`${chatId}:${userId}`);
          send(chatId, `⏰ @${msg.from?.username||userName}! *Pomodoro ${pomM} menit selesai!*\n\n✅ Istirahat sebentar!`);
        }, pomM * 60 * 1000);
        pomodoros.set(`${chatId}:${userId}`, t);
        break;
      }

      // ════════════════════════════════════════════════════════
      //  CATATAN
      // ════════════════════════════════════════════════════════
      case 'setnote': {
        const nP=q.split('|');
        if(nP.length<2){reply(msg,"❌ `/setnote [judul]|[isi]`");break;}
        const nk=`${chatId}:${nP[0].trim().toLowerCase()}`;
        const nv=nP.slice(1).join('|').trim();
        notes.set(nk,{val:nv,by:userName,time:moment().tz("Asia/Jakarta").format("DD/MM HH:mm")});
        reply(msg,`📝 *Catatan disimpan!*\n\n📌 Judul: *${nP[0].trim()}*\n📄 Isi  : ${nv}`);
        break;
      }

      case 'getnote': {
        if (!q) {
          const myNotes=[...notes.keys()].filter(k=>k.startsWith(`${chatId}:`));
          if(!myNotes.length){reply(msg,"📋 Belum ada catatan.");break;}
          reply(msg,`📋 *Daftar Catatan*\n\n${myNotes.map((k,i)=>`${i+1}. ${k.split(':')[1]}`).join('\n')}`);
          break;
        }
        const nn=notes.get(`${chatId}:${q.toLowerCase()}`);
        if(!nn){reply(msg,`❌ Catatan *${q}* tidak ditemukan!`);break;}
        reply(msg,`📖 *${q}*\n\n${nn.val}\n\n_Oleh ${nn.by} · ${nn.time}_`);
        break;
      }

      case 'delnote': {
        if(!q){reply(msg,"❌ `/delnote [judul]`");break;}
        const dk=`${chatId}:${q.toLowerCase()}`;
        if(!notes.has(dk)){reply(msg,`❌ Catatan *${q}* tidak ada!`);break;}
        notes.delete(dk);
        reply(msg,`🗑️ Catatan *${q}* dihapus!`);
        break;
      }

      // ════════════════════════════════════════════════════════
      //  GRUP (Admin)
      // ════════════════════════════════════════════════════════
      case 'groupinfo': {
        if(!isGroup){reply(msg,"❌ Hanya di grup!");break;}
        const chat=msg.chat;
        try {
          const cnt=await tg('getChatMemberCount',{chat_id:chatId});
          reply(msg,
            `🏠 *Group Info*\n\n` +
            `📛 Nama : ${chat.title}\n` +
            `🆔 ID   : \`${chatId}\`\n` +
            `👥 Member: ${cnt.result||'-'}\n` +
            `📝 Tipe : ${chat.type}`
          );
        } catch {reply(msg,"❌ Gagal!");}
        break;
      }

      case 'warn': {
        if(!isGroup){reply(msg,"❌ Hanya di grup!");break;}
        const isAdm2=await isAdmin(chatId,userId);
        if(!isAdm2){reply(msg,"❌ Admin only!");break;}
        const wTarget=msg.reply_to_message?.from?.id;
        if(!wTarget){reply(msg,"❌ Reply pesan user untuk warn!");break;}
        const wName=msg.reply_to_message?.from?.first_name||"User";
        const wK=`${chatId}:${wTarget}`;
        const wCnt=(warnMap.get(wK)||0)+1;
        warnMap.set(wK,wCnt);
        if(wCnt>=3){
          try{await tg('banChatMember',{chat_id:chatId,user_id:wTarget});}catch{}
          warnMap.delete(wK);
          reply(msg,`⛔ *${wName}* mendapat 3 peringatan dan di-kick!`);
        } else {
          reply(msg,`⚠️ *Peringatan ${wCnt}/3* untuk *${wName}*\n\n${q||"Harap patuhi peraturan!"}`);
        }
        break;
      }

      case 'resetwarn': {
        const isAdm3=await isAdmin(chatId,userId);
        if(!isAdm3){reply(msg,"❌ Admin only!");break;}
        const rwTarget=msg.reply_to_message?.from?.id;
        if(!rwTarget){reply(msg,"❌ Reply pesan user!");break;}
        warnMap.delete(`${chatId}:${rwTarget}`);
        reply(msg,`✅ Peringatan *${msg.reply_to_message?.from?.first_name}* direset!`);
        break;
      }

      case 'kick': {
        if(!isGroup){reply(msg,"❌ Hanya di grup!");break;}
        const isAdm4=await isAdmin(chatId,userId);
        if(!isAdm4){reply(msg,"❌ Admin only!");break;}
        const kTarget=msg.reply_to_message?.from?.id;
        if(!kTarget){reply(msg,"❌ Reply pesan user untuk kick!");break;}
        try{
          await tg('banChatMember',{chat_id:chatId,user_id:kTarget});
          await tg('unbanChatMember',{chat_id:chatId,user_id:kTarget});
          reply(msg,`✅ *${msg.reply_to_message?.from?.first_name}* di-kick!`);
        }catch{reply(msg,"❌ Gagal kick!");}
        break;
      }

      case 'promote': {
        if(!isGroup){reply(msg,"❌ Hanya di grup!");break;}
        const isAdm5=await isAdmin(chatId,userId);
        if(!isAdm5){reply(msg,"❌ Admin only!");break;}
        const pTarget=msg.reply_to_message?.from?.id;
        if(!pTarget){reply(msg,"❌ Reply pesan user!");break;}
        try{
          await tg('promoteChatMember',{chat_id:chatId,user_id:pTarget,can_manage_chat:true,can_delete_messages:true,can_manage_video_chats:true,can_restrict_members:true,can_promote_members:false,can_change_info:true,can_invite_users:true,can_pin_messages:true});
          reply(msg,`✅ *${msg.reply_to_message?.from?.first_name}* jadi admin!`);
        }catch{reply(msg,"❌ Gagal!");}
        break;
      }

      case 'demote': {
        if(!isGroup){reply(msg,"❌ Hanya di grup!");break;}
        const isAdm6=await isAdmin(chatId,userId);
        if(!isAdm6){reply(msg,"❌ Admin only!");break;}
        const dTarget=msg.reply_to_message?.from?.id;
        if(!dTarget){reply(msg,"❌ Reply pesan user!");break;}
        try{
          await tg('promoteChatMember',{chat_id:chatId,user_id:dTarget});
          reply(msg,`✅ *${msg.reply_to_message?.from?.first_name}* diturunkan!`);
        }catch{reply(msg,"❌ Gagal!");}
        break;
      }

      case 'mute': {
        if(!isGroup){reply(msg,"❌ Hanya di grup!");break;}
        const isAdm7=await isAdmin(chatId,userId);
        if(!isAdm7){reply(msg,"❌ Admin only!");break;}
        const mTarget=msg.reply_to_message?.from?.id;
        if(!mTarget){reply(msg,"❌ Reply pesan user!");break;}
        const muteMin=parseInt(q)||5;
        try{
          await tg('restrictChatMember',{chat_id:chatId,user_id:mTarget,permissions:{can_send_messages:false,can_send_audios:false,can_send_documents:false,can_send_photos:false,can_send_videos:false,can_send_video_notes:false,can_send_voice_notes:false,can_send_polls:false,can_send_other_messages:false},until_date:Math.floor(Date.now()/1000)+muteMin*60});
          reply(msg,`🔇 *${msg.reply_to_message?.from?.first_name}* di-mute ${muteMin} menit!`);
        }catch{reply(msg,"❌ Gagal!");}
        break;
      }

      case 'unmute': {
        if(!isGroup){reply(msg,"❌ Hanya di grup!");break;}
        const isAdm8=await isAdmin(chatId,userId);
        if(!isAdm8){reply(msg,"❌ Admin only!");break;}
        const umTarget=msg.reply_to_message?.from?.id;
        if(!umTarget){reply(msg,"❌ Reply pesan user!");break;}
        try{
          await tg('restrictChatMember',{chat_id:chatId,user_id:umTarget,permissions:{can_send_messages:true,can_send_audios:true,can_send_documents:true,can_send_photos:true,can_send_videos:true,can_send_video_notes:true,can_send_voice_notes:true,can_send_polls:true,can_send_other_messages:true}});
          reply(msg,`🔊 *${msg.reply_to_message?.from?.first_name}* di-unmute!`);
        }catch{reply(msg,"❌ Gagal!");}
        break;
      }

      case 'tagall': {
        if(!isGroup){reply(msg,"❌ Hanya di grup!");break;}
        const isAdm9=await isAdmin(chatId,userId);
        if(!isAdm9){reply(msg,"❌ Admin only!");break;}
        try{
          const members=await tg('getChatAdministrators',{chat_id:chatId});
          const mentions=members.result?.map(m=>`[${m.user.first_name}](tg://user?id=${m.user.id})`).join(' ')||'';
          send(chatId,`📢 *${q||"Perhatian semua!"}*\n\n${mentions}`,{parse_mode:'Markdown'});
        }catch{reply(msg,"❌ Gagal!");}
        break;
      }

      default: break;
    }
  };

  // ── Start polling ──────────────────────────────────────────
  poll();
  console.log(`\x1b[34m  ✈️  Telegram bot aktif & polling...\x1b[0m`);
};