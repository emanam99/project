const crypto = require('crypto');
const { scopeKeyFromRelayTarget, digitsOnly, scopeKeyToAssistantJid } = require('./memoryScope');
const scheduleIntent = require('./scheduleIntent');

const DEFAULT_AI_MODEL = 'deepseek-chat';

const STEP = {
  IDLE: 'idle',
  MAIN: 'main',
  PERS_NEW_NAME: 'pers_new_name',
  PERS_NEW_PROMPT: 'pers_new_prompt',
  PERS_LIST_EDIT: 'pers_list_edit',
  PERS_EDIT_MENU: 'pers_edit_menu',
  PERS_EDIT_NAME: 'pers_edit_name',
  PERS_EDIT_PROMPT: 'pers_edit_prompt',
  PERS_PROMPT_VIEW: 'pers_prompt_view',
  PERS_LIST_DEL: 'pers_list_del',
  PERS_DEL_CONFIRM: 'pers_del_confirm',
  PERS_LIST_ACTIVE: 'pers_list_active',
  RELAY_MEM_PICK: 'relay_mem_pick',
  RELAY_MEM_OTHER_DIGITS: 'relay_mem_other_digits',
  RELAY_MEM_MENU: 'relay_mem_menu',
  RELAY_MEM_NEW: 'relay_mem_new',
  RELAY_MEM_LIST_EDIT: 'relay_mem_list_edit',
  RELAY_MEM_EDIT_TEXT: 'relay_mem_edit_text',
  RELAY_MEM_LIST_DEL: 'relay_mem_list_del',
  RELAY_MEM_PERS_LIST: 'relay_mem_pers_list',
  RELAY_CRUD_MAIN: 'relay_crud_main',
  RELAY_ADD_KEY: 'relay_add_key',
  RELAY_ADD_TARGET: 'relay_add_target',
  RELAY_DEL_PICK: 'relay_del_pick',
  RELAY_EDIT_PICK: 'relay_edit_pick',
  RELAY_EDIT_MENU: 'relay_edit_menu',
  RELAY_EDIT_TARGET: 'relay_edit_target',
  RELAY_EDIT_KEY_NEW: 'relay_edit_key_new',
};

function newPid() {
  return 'p_' + crypto.randomBytes(5).toString('hex');
}
function newMid() {
  return 'm_' + crypto.randomBytes(4).toString('hex');
}

function jidToDigits(jid) {
  if (!jid || typeof jid !== 'string') return '';
  const part = jid.split('@')[0] || '';
  return String(part.split(':')[0]).replace(/\D/g, '');
}

function isSelfChat(chat, client) {
  if (!client?.info?.wid || chat.isGroup) return false;
  const dChat = jidToDigits(chat.id?._serialized || '');
  const dMe = jidToDigits(client.info.wid._serialized || '');
  return dChat.length > 0 && dChat === dMe;
}

/** Pratinjau prompt untuk WhatsApp (~4k limit); data di DB tidak dipotong. */
function truncatePreview(text, maxChars) {
  const t = String(text || '');
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars) + '\n\n_(…dipotong di chat; teks asli tetap tersimpan)_';
}

/** Submenu setelah pilih kepribadian untuk diedit (.2 → .atur). */
function personalityEditSubmenuText(p) {
  return (
    `*Edit kepribadian: ${p.name}*\n` +
    `Pilih:\n` +
    `*.1* Ubah nama\n` +
    `*.2* Ubah system prompt (langsung)\n` +
    `*.3* Lihat isi prompt saat ini (panjang)\n` +
    `*.0* Batal`
  );
}

function mainMenuText() {
  return (
    `[Atur AI — chat ke diri sendiri]\n` +
    `Semua balasan AI memakai DeepSeek (${DEFAULT_AI_MODEL}) — satu jalur untuk semua kepribadian.\n` +
    `Semua jawaban Anda harus diawali titik agar tidak bentrok dengan pesan bot.\n` +
    `Pilih (kirim .1 / .2 / … / .0):\n` +
    `.1 — Buat kepribadian baru\n` +
    `.2 — Edit kepribadian\n` +
    `.3 — Hapus kepribadian\n` +
    `.4 — Kepribadian *aktif global* (default kontak tanpa khusus)\n` +
    `.5 — Lihat daftar *relay* (nama → nomor, ingatan, kepribadian khusus)\n` +
    `.6 — *Kontak:* ingatan + kepribadian per nomor/relay\n` +
    `.7 — *Relay:* tambah / hapus / edit (nama→nomor)\n` +
    `.8 — *Jadwal kirim pesan* (perintah .jadwal / bahasa alami)\n` +
    `.9 — *Siapa saja* yang AI-nya aktif (nama + nomor, termasuk di luar relay)\n` +
    `.0 — Keluar\n\n` +
    `Lainnya: .aktifnomor 628… / .nonaktifnomor 628… · .jadwal / .jadwalku / .batalkjadwal\n` +
    `Atau *.6* pilih kontak → di menu kontak *.6* / *.7* untuk AI on/off (tanpa perlu .aktif di chat lawan).\n` +
    `.atur — buka menu ini lagi. .batal — batalkan wizard.`
  );
}

function canToggleAssistantForScope(scopeKey) {
  return scopeKeyToAssistantJid(scopeKey) != null;
}

function createSelfAdmin({ db, log, assistantControl, getEnabledContactsReport }) {
  function ensurePersonalities() {
    let data = db.getPersonalities();
    if (data && Array.isArray(data.personalities)) return data;
    const id = 'p_default';
    data = {
      activePersonalityId: id,
      personalities: [
        {
          id,
          name: 'Default',
          model: DEFAULT_AI_MODEL,
          systemPrompt: 'Kamu membantu pengguna dengan ramah.',
        },
      ],
    };
    db.setPersonalities(data);
    return data;
  }

  function savePersonalities(data) {
    db.setPersonalities(data);
  }

  function loadState() {
    const s = db.getSelfAdminState();
    if (!s.step) s.step = STEP.IDLE;
    if (!s.draft) s.draft = {};
    return s;
  }

  function saveState(s) {
    db.setSelfAdminState(s);
  }

  function listPersonalitiesText(pers, activeId) {
    if (!pers.personalities.length) return '(kosong)';
    return pers.personalities
      .map((p, i) => {
        const mark = p.id === activeId ? ' *aktif*' : '';
        return `${i + 1}) ${p.name}${mark}`;
      })
      .join('\n');
  }

  function listMemoriesText(items) {
    if (!items.length) return '(belum ada ingatan)';
    return items.map((m, i) => `${i + 1}) ${m.text}`).join('\n\n');
  }

  function personalityLineForScope(scopeKey, persData) {
    if (scopeKey === 'legacy_global') return '';
    const ov = db.getContactPersonalityOverride(scopeKey);
    const g = persData.personalities.find((x) => x.id === persData.activePersonalityId);
    const gname = g ? g.name : '?';
    if (!ov) {
      return `*Kepribadian:* ikut global aktif (*${gname}*)\n*.4* set khusus kontak ini\n`;
    }
    const po = persData.personalities.find((x) => x.id === ov);
    const nm = po ? po.name : '(hapus kepribadian itu?)';
    return `*Kepribadian khusus:* *${nm}*\n*.4* ganti · *.5* ikut global lagi\n`;
  }

  async function showRelayMemoryMenu(msg, scopeKey, label) {
    const persData = ensurePersonalities();
    const data = db.getMemoriesForScope(scopeKey);
    const preview = listMemoriesText(data.items);
    const isLegacy = scopeKey === 'legacy_global';
    const note = isLegacy
      ? '\n_(Ini ingatan tanpa kontak; tidak dipakai AI sampai dipindah ke nomor.)_\n'
      : '';
    const persLine = personalityLineForScope(scopeKey, persData);
    let aiLine = '';
    if (assistantControl && canToggleAssistantForScope(scopeKey)) {
      try {
        const on = await assistantControl.isEnabledForScope(scopeKey);
        aiLine =
          `\n*Balasan AI:* ${on ? '✓ *aktif*' : '✕ *nonaktif*'}\n` +
          `*.6* aktifkan · *.7* nonaktifkan\n`;
      } catch (e) {
        log('[self-admin] cek AI status:', e.message);
      }
    }
    await reply(
      msg,
      `*Kontak — ${label}*\n` +
        `_(scope: ${scopeKey})_${note}\n` +
        persLine +
        aiLine +
        `\n*Ingatan:*\n${preview}\n\n` +
        `────────\n` +
        `*.1* tambah ingatan · *.2* edit · *.3* hapus\n` +
        `*.4* kepribadian · *.5* ikut global (hapus khusus)\n` +
        `*.9* ganti kontak · *.0* selesai`
    );
  }

  /** Nomor baru / baru di-atur: kunci kepribadian = yang aktif global saat ini (sekali). */
  function pinActivePersonalityIfUnset(scopeKey) {
    const sk = String(scopeKey || '');
    if (!sk || sk === 'legacy_global' || sk === '__unknown__') return;
    if (db.getContactPersonalityOverride(sk)) return;
    const p = ensurePersonalities();
    db.setContactPersonalityOverride(sk, p.activePersonalityId);
  }

  function getPersByIndex(pers, n) {
    const i = n - 1;
    if (i < 0 || i >= pers.personalities.length) return null;
    return pers.personalities[i];
  }

  async function reply(msg, text) {
    await msg.reply(text);
  }

  /** Baris daftar kontak (.6) dengan status AI bila assistantControl ada. */
  async function relayPickLinesWithAiStatus(list) {
    const lines = [];
    for (let i = 0; i < list.length; i++) {
      const x = list[i];
      const c = db.countMemoriesForScope(x.scopeKey);
      let st = '';
      if (assistantControl && canToggleAssistantForScope(x.scopeKey)) {
        try {
          const on = await assistantControl.isEnabledForScope(x.scopeKey);
          st = on ? ' · _AI aktif_' : ' · _AI mati_';
        } catch (_) {
          /* abaikan */
        }
      }
      lines.push(`${i + 1}) *${x.alias}* → ${x.target}\n   _${c} ingatan_${st}`);
    }
    return lines;
  }

  /** Kepribadian: override per scope, else ikut aktif global. Ingatan per scope. */
  function getReplyProfile(memoryScopeKey) {
    const p = ensurePersonalities();
    const sk = String(memoryScopeKey || '__unknown__');
    const mem = db.getMemoriesForScope(sk);
    const globalActive =
      p.personalities.find((x) => x.id === p.activePersonalityId) || p.personalities[0];
    let chosen = globalActive;
    const ov = db.getContactPersonalityOverride(sk);
    if (ov) {
      const byOv = p.personalities.find((x) => x.id === ov);
      if (byOv) chosen = byOv;
    }
    if (!chosen) {
      return { model: DEFAULT_AI_MODEL, systemPrompt: 'Kamu membantu dengan ramah.' };
    }
    let system = chosen.systemPrompt;
    if (mem.items.length) {
      system +=
        '\n\nHal berikut khusus untuk percakapan dengan kontak ini — harus kamu ingat:\n' +
        mem.items.map((m) => `- ${m.text}`).join('\n');
    }
    return { model: DEFAULT_AI_MODEL, systemPrompt: system };
  }

  async function handle(msg, chat) {
    const bodyRaw = (msg.body || '').trim();
    if (!bodyRaw.startsWith('.')) {
      return false;
    }
    const cmd = bodyRaw.slice(1).replace(/^\s+/, '');
    const cmdLower = cmd.toLowerCase();

    if (cmdLower === 'atur') {
      const s = { step: STEP.MAIN, draft: {} };
      saveState(s);
      await reply(msg, mainMenuText());
      log('[self-admin] menu utama dibuka');
      return true;
    }

    let state = loadState();
    if (state.step === STEP.IDLE) return false;

    if (cmd === '0' && state.step === STEP.MAIN) {
      saveState({ step: STEP.IDLE, draft: {} });
      await reply(msg, 'Keluar dari menu atur.');
      return true;
    }

    if (cmdLower === 'batal') {
      saveState({ step: STEP.IDLE, draft: {} });
      await reply(msg, 'Dibatalkan. Kirim .atur untuk menu lagi.');
      return true;
    }

    if (state.step === 'pers_new_model' || state.step === 'pers_edit_model') {
      saveState({ step: STEP.IDLE, draft: {} });
      await reply(
        msg,
        'Wizard lama (pilih model) sudah tidak dipakai — semua kepribadian memakai DeepSeek yang sama. Kirim .atur untuk menu.'
      );
      return true;
    }

    if (
      state.step === 'mem_new' ||
      state.step === 'mem_list_edit' ||
      state.step === 'mem_edit_text' ||
      state.step === 'mem_list_del'
    ) {
      saveState({ step: STEP.IDLE, draft: {} });
      await reply(
        msg,
        'Menu ingatan lama sudah diganti. Kirim *.atur* lalu *.6* — ingatan sekarang *per kontak* (relay / nomor).'
      );
      return true;
    }

    const pers = ensurePersonalities();

    /* ---------- MAIN ---------- */
    if (state.step === STEP.MAIN) {
      const n = cmd;
      if (n === '1') {
        saveState({ step: STEP.PERS_NEW_NAME, draft: {} });
        await reply(
          msg,
          'Buat kepribadian baru.\nKirim *.namakepribadian* (satu baris, contoh: .AsistenKu)'
        );
        return true;
      }
      if (n === '2') {
        saveState({ step: STEP.PERS_LIST_EDIT, draft: { mode: 'edit' } });
        await reply(
          msg,
          `Pilih nomor untuk diedit — kirim .*nomor* atau *.0* batal:\n\n${listPersonalitiesText(pers, pers.activePersonalityId)}`
        );
        return true;
      }
      if (n === '3') {
        if (pers.personalities.length <= 1) {
          await reply(msg, 'Minimal harus ada 1 kepribadian. Tambah dulu baru hapus.');
          return true;
        }
        saveState({ step: STEP.PERS_LIST_DEL, draft: {} });
        await reply(
          msg,
          `Pilih nomor yang *dihapus* — kirim .*nomor* atau *.0* batal:\n\n${listPersonalitiesText(pers, pers.activePersonalityId)}`
        );
        return true;
      }
      if (n === '4') {
        saveState({ step: STEP.PERS_LIST_ACTIVE, draft: {} });
        await reply(
          msg,
          `Pilih nomor *aktif* — kirim .*nomor*:\n\n${listPersonalitiesText(pers, pers.activePersonalityId)}`
        );
        return true;
      }
      if (n === '5') {
        const map = db.getRelayAliasesMap();
        const keys = Object.keys(map).sort();
        const legacyN = db.countLegacyGlobalMemories();
        if (!keys.length) {
          await reply(
            msg,
            'Belum ada entri *relay*. Tambah lewat *.7* (tambah relay).\n\n' +
              'Atau *.6* → *Nomor lain* untuk kontak tanpa nama relay.\n' +
              (legacyN
                ? `\n_(Legacy: ${legacyN} baris — .6 paling bawah.)_`
                : '')
          );
          return true;
        }
        const lines = keys.map((k) => {
          const sk = scopeKeyFromRelayTarget(map[k]);
          const cnt = sk ? db.countMemoriesForScope(sk) : 0;
          let pnote = '';
          if (sk) {
            const ovid = db.getContactPersonalityOverride(sk);
            if (ovid) {
              const pp = pers.personalities.find((x) => x.id === ovid);
              pnote = pp ? ` · _khusus: ${pp.name}_` : ' · _khusus: ?_';
            } else {
              const ga = pers.personalities.find((x) => x.id === pers.activePersonalityId);
              pnote = ga ? ` · _ikut global: ${ga.name}_` : '';
            }
          }
          return `• *${k}* → ${map[k]}\n  _${cnt} ingatan_${pnote}`;
        });
        let tail = '';
        if (legacyN) {
          tail = `\n\n⚠️ *Legacy (tanpa kontak):* ${legacyN} baris — buka *.6* → opsi paling bawah untuk lihat/hapus.`;
        }
        await reply(
          msg,
          '*Daftar relay*\n(kunci yang dipakai agen relay & ingatan per nomor)\n\n' +
            lines.join('\n\n') +
            tail +
            '\n\n*Kelola isi ingatan:* kirim *.6*'
        );
        return true;
      }
      if (n === '6') {
        const map = db.getRelayAliasesMap();
        const keys = Object.keys(map).sort();
        const list = [];
        for (const k of keys) {
          const sk = scopeKeyFromRelayTarget(map[k]);
          if (sk) list.push({ alias: k, target: map[k], scopeKey: sk });
        }
        const legacyN = db.countLegacyGlobalMemories();
        if (!list.length && !keys.length) {
          saveState({ step: STEP.RELAY_MEM_OTHER_DIGITS, draft: {} });
          await reply(
            msg,
            'Belum ada relay. Kirim *.nomor WA* 10–15 digit — ingatan & kepribadian (default = *aktif global* saat ini) untuk nomor itu.\n\nAtau *.7* untuk tambah relay dulu.'
          );
          return true;
        }
        if (!list.length && keys.length) {
          await reply(msg, 'Relay ada tapi nomor tidak valid. Perbaiki nilai target di database relay.');
          return true;
        }
        saveState({ step: STEP.RELAY_MEM_PICK, draft: { relayPickList: list, legacyCount: legacyN } });
        const lines = await relayPickLinesWithAiStatus(list);
        let extra = `${list.length + 1}) *Nomor lain* (tidak di daftar relay)`;
        if (legacyN > 0) {
          extra += `\n${list.length + 2}) *Ingatan legacy* (tanpa kontak, ${legacyN} baris)`;
        }
        await reply(
          msg,
          `Pilih kontak — kirim .*angka* atau *.0* batal:\n_(AI aktif/mati per baris — atur juga lewat menu kontak: .6 / .7)_\n\n${lines.join('\n\n')}\n\n${extra}`
        );
        return true;
      }
      if (n === '7') {
        saveState({ step: STEP.RELAY_CRUD_MAIN, draft: {} });
        await reply(
          msg,
          '*Kelola relay* (nama → nomor)\n\n' +
            `*.1* Tambah relay (kunci + nomor)\n` +
            `*.2* Hapus relay\n` +
            `*.3* Edit relay (ubah nomor atau nama kunci)\n` +
            `*.0* Kembali ke menu utama\n\n` +
            `_Tips: *.1* dengan kunci yang sudah ada = ganti nomor (sama seperti edit nomor). Tambah baru: nomor pakai kepribadian *aktif global* (${pers.personalities.find((x) => x.id === pers.activePersonalityId)?.name || '?'})._`
        );
        return true;
      }
      if (n === '8') {
        await reply(msg, scheduleIntent.scheduleCommandsHelpText());
        return true;
      }
      if (n === '9') {
        if (typeof getEnabledContactsReport !== 'function') {
          await reply(msg, 'Daftar AI aktif tidak tersedia.');
          return true;
        }
        const text = await getEnabledContactsReport();
        const maxLen = 3600;
        if (text.length <= maxLen) {
          await reply(msg, text);
        } else {
          await reply(msg, text.slice(0, maxLen) + '\n\n_(pesan 2…)_');
          await reply(msg, text.slice(maxLen));
        }
        return true;
      }
      await reply(msg, 'Kirim .1–.9 atau .0.\n\n' + mainMenuText());
      return true;
    }

    /* ---------- PERSONALITY NEW ---------- */
    if (state.step === STEP.PERS_NEW_NAME) {
      if (!cmd) {
        await reply(msg, 'Nama tidak boleh kosong. Contoh: .AsistenKu');
        return true;
      }
      state.draft.name = cmd.slice(0, 80);
      state.step = STEP.PERS_NEW_PROMPT;
      saveState(state);
      await reply(
        msg,
        `Kirim *.system prompt* satu pesan (teks setelah titik = instruksi AI).\nModel API: ${DEFAULT_AI_MODEL} (sama untuk semua kepribadian).`
      );
      return true;
    }
    if (state.step === STEP.PERS_NEW_PROMPT) {
      if (!cmd) {
        await reply(msg, 'Prompt tidak boleh kosong.');
        return true;
      }
      const id = newPid();
      pers.personalities.push({
        id,
        name: state.draft.name,
        model: DEFAULT_AI_MODEL,
        systemPrompt: cmd.slice(0, 12000),
      });
      savePersonalities(pers);
      saveState({ step: STEP.IDLE, draft: {} });
      await reply(msg, `Kepribadian "${state.draft.name}" tersimpan (id: ${id}).`);
      log('[self-admin] kepribadian baru:', id);
      return true;
    }

    /* ---------- PERSONALITY EDIT ---------- */
    if (state.step === STEP.PERS_LIST_EDIT) {
      const num = parseInt(cmd, 10);
      if (cmd === '0') {
        saveState({ step: STEP.IDLE, draft: {} });
        await reply(msg, 'Batal.');
        return true;
      }
      const p = getPersByIndex(pers, num);
      if (!p) {
        await reply(msg, 'Nomor tidak valid. Kirim .*angka* atau .0');
        return true;
      }
      state.draft.editId = p.id;
      state.step = STEP.PERS_EDIT_MENU;
      saveState(state);
      await reply(msg, personalityEditSubmenuText(p));
      return true;
    }
    if (state.step === STEP.PERS_EDIT_MENU) {
      const id = state.draft.editId;
      const p = pers.personalities.find((x) => x.id === id);
      if (!p) {
        saveState({ step: STEP.IDLE, draft: {} });
        await reply(msg, 'Data hilang. .atur lagi.');
        return true;
      }
      if (cmd === '0') {
        saveState({ step: STEP.IDLE, draft: {} });
        await reply(msg, 'Batal.');
        return true;
      }
      if (cmd === '1') {
        state.step = STEP.PERS_EDIT_NAME;
        saveState(state);
        await reply(msg, `Nama sekarang: *${p.name}*\nKirim *.nama baru*`);
        return true;
      }
      if (cmd === '2') {
        state.step = STEP.PERS_EDIT_PROMPT;
        saveState(state);
        await reply(
          msg,
          `*Prompt saat ini (ringkas):*\n${truncatePreview(p.systemPrompt, 2800)}\n\nKirim *.prompt baru* (satu pesan, teks setelah titik).`
        );
        return true;
      }
      if (cmd === '3') {
        state.step = STEP.PERS_PROMPT_VIEW;
        saveState(state);
        const body = truncatePreview(p.systemPrompt, 3800);
        await reply(
          msg,
          `*System prompt — ${p.name}*\n\n${body}\n\n────────\n` +
            `*.1* Edit prompt (ganti teks)\n` +
            `*.9* Kembali ke menu edit kepribadian ini\n` +
            `*.0* Menu .atur utama`
        );
        return true;
      }
      await reply(msg, 'Kirim .1, .2, .3, atau .0.');
      return true;
    }
    if (state.step === STEP.PERS_PROMPT_VIEW) {
      const id = state.draft.editId;
      const p = pers.personalities.find((x) => x.id === id);
      if (!p) {
        saveState({ step: STEP.IDLE, draft: {} });
        await reply(msg, 'Data hilang. .atur lagi.');
        return true;
      }
      if (cmd === '1') {
        state.step = STEP.PERS_EDIT_PROMPT;
        saveState(state);
        await reply(msg, 'Kirim *.prompt baru* (satu pesan, teks setelah titik).');
        return true;
      }
      if (cmd === '9') {
        state.step = STEP.PERS_EDIT_MENU;
        saveState(state);
        await reply(msg, personalityEditSubmenuText(p));
        return true;
      }
      if (cmd === '0') {
        saveState({ step: STEP.MAIN, draft: {} });
        await reply(msg, mainMenuText());
        return true;
      }
      await reply(msg, 'Kirim *.1* edit · *.9* kembali ke menu edit · *.0* menu utama.');
      return true;
    }
    if (state.step === STEP.PERS_EDIT_NAME) {
      const id = state.draft.editId;
      const p = pers.personalities.find((x) => x.id === id);
      if (!cmd || !p) return true;
      p.name = cmd.slice(0, 80);
      savePersonalities(pers);
      saveState({ step: STEP.IDLE, draft: {} });
      await reply(msg, 'Nama diperbarui.');
      return true;
    }
    if (state.step === STEP.PERS_EDIT_PROMPT) {
      const id = state.draft.editId;
      const p = pers.personalities.find((x) => x.id === id);
      if (!cmd || !p) return true;
      p.systemPrompt = cmd.slice(0, 12000);
      savePersonalities(pers);
      saveState({ step: STEP.IDLE, draft: {} });
      await reply(msg, 'System prompt diperbarui.');
      return true;
    }

    /* ---------- PERSONALITY DELETE ---------- */
    if (state.step === STEP.PERS_LIST_DEL) {
      const num = parseInt(cmd, 10);
      if (cmd === '0') {
        saveState({ step: STEP.IDLE, draft: {} });
        await reply(msg, 'Batal.');
        return true;
      }
      const p = getPersByIndex(pers, num);
      if (!p) {
        await reply(msg, 'Nomor tidak valid.');
        return true;
      }
      state.draft.delId = p.id;
      state.step = STEP.PERS_DEL_CONFIRM;
      saveState(state);
      await reply(msg, `Yakin hapus "${p.name}"? Kirim *.YA* untuk konfirmasi atau .batal`);
      return true;
    }
    if (state.step === STEP.PERS_DEL_CONFIRM) {
      if (cmdLower !== 'ya') {
        await reply(msg, 'Batal hapus. Kirim .atur untuk menu.');
        saveState({ step: STEP.IDLE, draft: {} });
        return true;
      }
      const delId = state.draft.delId;
      if (pers.personalities.length <= 1) {
        saveState({ step: STEP.IDLE, draft: {} });
        await reply(msg, 'Tidak bisa menghapus kepribadian terakhir.');
        return true;
      }
      pers.personalities = pers.personalities.filter((x) => x.id !== delId);
      if (pers.activePersonalityId === delId) {
        pers.activePersonalityId = pers.personalities[0].id;
      }
      db.clearContactPersonalityByPersonalityId(delId);
      savePersonalities(pers);
      saveState({ step: STEP.IDLE, draft: {} });
      await reply(msg, 'Kepribadian dihapus. Jika yang aktif terhapus, aktif dipindah ke yang pertama. Override per kontak yang memakai ID itu juga dihapus.');
      log('[self-admin] hapus personality', delId);
      return true;
    }

    /* ---------- ACTIVE ---------- */
    if (state.step === STEP.PERS_LIST_ACTIVE) {
      if (cmd === '0') {
        saveState({ step: STEP.IDLE, draft: {} });
        await reply(msg, 'Batal.');
        return true;
      }
      const num = parseInt(cmd, 10);
      const p = getPersByIndex(pers, num);
      if (!p) {
        await reply(msg, 'Nomor tidak valid.');
        return true;
      }
      pers.activePersonalityId = p.id;
      savePersonalities(pers);
      saveState({ step: STEP.IDLE, draft: {} });
      await reply(msg, `Kepribadian aktif: *${p.name}*`);
      log('[self-admin] aktif:', p.id);
      return true;
    }

    /* ---------- RELAY / INGATAN PER KONTAK ---------- */
    if (state.step === STEP.RELAY_MEM_PICK) {
      const num = parseInt(cmd, 10);
      if (cmd === '0') {
        saveState({ step: STEP.IDLE, draft: {} });
        await reply(msg, 'Batal.');
        return true;
      }
      const list = state.draft.relayPickList || [];
      const legacyN = state.draft.legacyCount || 0;
      const otherIdx = list.length + 1;
      const legacyIdx = legacyN > 0 ? list.length + 2 : -1;
      if (num === otherIdx) {
        state.step = STEP.RELAY_MEM_OTHER_DIGITS;
        state.draft = {};
        saveState(state);
        await reply(msg, 'Kirim *.nomor WA* 10–15 digit (contoh *.6281234567890*).');
        return true;
      }
      if (legacyIdx > 0 && num === legacyIdx) {
        state.draft = { memoryScopeKey: 'legacy_global', memoryLabel: 'Legacy (tanpa kontak)' };
        state.step = STEP.RELAY_MEM_MENU;
        saveState(state);
        await showRelayMemoryMenu(msg, 'legacy_global', 'Legacy (tanpa kontak)');
        return true;
      }
      const entry = list[num - 1];
      if (!entry) {
        await reply(msg, 'Nomor tidak valid. Kirim angka dari daftar atau .0');
        return true;
      }
      state.draft = {
        memoryScopeKey: entry.scopeKey,
        memoryLabel: `${entry.alias} → ${entry.target}`,
      };
      state.step = STEP.RELAY_MEM_MENU;
      saveState(state);
      await showRelayMemoryMenu(msg, entry.scopeKey, state.draft.memoryLabel);
      return true;
    }

    if (state.step === STEP.RELAY_MEM_OTHER_DIGITS) {
      const d = digitsOnly(cmd);
      if (d.length < 10 || d.length > 15) {
        await reply(msg, 'Nomor tidak valid. Kirim 10–15 digit (contoh .6281234567890).');
        return true;
      }
      pinActivePersonalityIfUnset(d);
      state.draft = { memoryScopeKey: d, memoryLabel: d };
      state.step = STEP.RELAY_MEM_MENU;
      saveState(state);
      await showRelayMemoryMenu(msg, d, d);
      return true;
    }

    if (state.step === STEP.RELAY_MEM_MENU) {
      const sk = state.draft.memoryScopeKey;
      const label = state.draft.memoryLabel || sk;
      if (!sk) {
        saveState({ step: STEP.IDLE, draft: {} });
        await reply(msg, 'Sesi hilang. Kirim .atur → .6 lagi.');
        return true;
      }
      const data = db.getMemoriesForScope(sk);
      if (cmd === '0') {
        saveState({ step: STEP.IDLE, draft: {} });
        await reply(msg, 'Selesai. Kirim .atur untuk menu.');
        return true;
      }
      if (cmd === '9') {
        const map = db.getRelayAliasesMap();
        const keys = Object.keys(map).sort();
        const list = [];
        for (const k of keys) {
          const skey = scopeKeyFromRelayTarget(map[k]);
          if (skey) list.push({ alias: k, target: map[k], scopeKey: skey });
        }
        const legacyN = db.countLegacyGlobalMemories();
        if (!list.length && !keys.length) {
          saveState({ step: STEP.RELAY_MEM_OTHER_DIGITS, draft: {} });
          await reply(msg, 'Kirim *.nomor* 10–15 digit untuk kontak lain.');
          return true;
        }
        if (!list.length) {
          saveState({ step: STEP.IDLE, draft: {} });
          await reply(msg, 'Tidak ada relay valid. .atur → .6');
          return true;
        }
        saveState({ step: STEP.RELAY_MEM_PICK, draft: { relayPickList: list, legacyCount: legacyN } });
        const lines = await relayPickLinesWithAiStatus(list);
        let extra = `${list.length + 1}) *Nomor lain*`;
        if (legacyN > 0) extra += `\n${list.length + 2}) *Legacy* (${legacyN} baris)`;
        await reply(msg, `Pilih kontak:\n\n${lines.join('\n\n')}\n\n${extra}\n\n*.0* batal`);
        return true;
      }
      if (cmd === '1') {
        state.step = STEP.RELAY_MEM_NEW;
        saveState(state);
        await reply(msg, 'Kirim *.teks ingatan* (satu pesan setelah titik).');
        return true;
      }
      if (cmd === '2') {
        if (!data.items.length) {
          await reply(msg, 'Belum ada ingatan. Kirim *.1* untuk tambah.');
          return true;
        }
        state.step = STEP.RELAY_MEM_LIST_EDIT;
        saveState(state);
        await reply(
          msg,
          `Pilih nomor ingatan — .*angka* · *.0* kembali ke menu · *.9* ganti kontak:\n\n${listMemoriesText(data.items)}`
        );
        return true;
      }
      if (cmd === '3') {
        if (!data.items.length) {
          await reply(msg, 'Tidak ada yang dihapus.');
          return true;
        }
        state.step = STEP.RELAY_MEM_LIST_DEL;
        saveState(state);
        await reply(
          msg,
          `Pilih nomor *dihapus* — .*angka* · *.0* batal ke menu:\n\n${listMemoriesText(data.items)}`
        );
        return true;
      }
      if (cmd === '4') {
        if (sk === 'legacy_global') {
          await reply(msg, 'Legacy tidak punya kepribadian per kontak.');
          return true;
        }
        state.step = STEP.RELAY_MEM_PERS_LIST;
        saveState(state);
        await reply(
          msg,
          `Pilih *kepribadian* untuk *${label}*:\n\n${listPersonalitiesText(pers, pers.activePersonalityId)}\n\n*.9* ikut global aktif lagi (hapus khusus)\n*.0* batal ke menu kontak`
        );
        return true;
      }
      if (cmd === '5') {
        if (sk === 'legacy_global') {
          await reply(msg, 'Tidak berlaku untuk legacy.');
          return true;
        }
        db.deleteContactPersonalityOverride(sk);
        await reply(msg, 'Kontak ini lagi *mengikuti kepribadian aktif global*.');
        await showRelayMemoryMenu(msg, sk, label);
        return true;
      }
      if (cmd === '6') {
        if (!assistantControl || !canToggleAssistantForScope(sk)) {
          await reply(msg, 'Tidak bisa mengaktifkan AI dari menu untuk kontak ini.');
          return true;
        }
        const r = await assistantControl.setAssistantEnabled(sk, true);
        await reply(msg, r.text || (r.ok ? 'Selesai.' : 'Gagal.'));
        await showRelayMemoryMenu(msg, sk, label);
        return true;
      }
      if (cmd === '7') {
        if (!assistantControl || !canToggleAssistantForScope(sk)) {
          await reply(msg, 'Tidak bisa menonaktifkan AI dari menu untuk kontak ini.');
          return true;
        }
        const r = await assistantControl.setAssistantEnabled(sk, false);
        await reply(msg, r.text || (r.ok ? 'Selesai.' : 'Gagal.'));
        await showRelayMemoryMenu(msg, sk, label);
        return true;
      }
      const hint =
        assistantControl && canToggleAssistantForScope(sk)
          ? 'Kirim .1–.7 / .9 / .0.'
          : 'Kirim .1–.5 / .9 / .0.';
      await reply(msg, `Kontak: *${label}*\n${hint}`);
      return true;
    }

    if (state.step === STEP.RELAY_MEM_PERS_LIST) {
      const sk = state.draft.memoryScopeKey;
      const label = state.draft.memoryLabel || sk;
      if (!sk || sk === 'legacy_global') {
        saveState({ step: STEP.IDLE, draft: {} });
        await reply(msg, 'Sesi tidak valid.');
        return true;
      }
      if (cmd === '0') {
        state.step = STEP.RELAY_MEM_MENU;
        saveState(state);
        await showRelayMemoryMenu(msg, sk, label);
        return true;
      }
      if (cmd === '9') {
        db.deleteContactPersonalityOverride(sk);
        state.step = STEP.RELAY_MEM_MENU;
        saveState(state);
        await reply(msg, 'Kepribadian khusus dihapus — ikut global aktif.');
        await showRelayMemoryMenu(msg, sk, label);
        return true;
      }
      const num = parseInt(cmd, 10);
      const pSel = getPersByIndex(pers, num);
      if (!pSel) {
        await reply(msg, 'Nomor tidak valid.');
        return true;
      }
      db.setContactPersonalityOverride(sk, pSel.id);
      state.step = STEP.RELAY_MEM_MENU;
      saveState(state);
      await reply(msg, `Kepribadian untuk kontak ini: *${pSel.name}*`);
      await showRelayMemoryMenu(msg, sk, label);
      return true;
    }

    /* ---------- RELAY CRUD (.7) ---------- */
    if (state.step === STEP.RELAY_CRUD_MAIN) {
      if (cmd === '0') {
        saveState({ step: STEP.MAIN, draft: {} });
        await reply(msg, mainMenuText());
        return true;
      }
      if (cmd === '1') {
        state.step = STEP.RELAY_ADD_KEY;
        saveState(state);
        await reply(
          msg,
          'Tambah / ubah relay.\nKirim *.namaKunci* satu kata (contoh *.Ra* atau *.Budi*) — tanpa spasi, dipakai di perintah relay.'
        );
        return true;
      }
      if (cmd === '2') {
        const map = db.getRelayAliasesMap();
        const keys = Object.keys(map).sort();
        if (!keys.length) {
          await reply(msg, 'Belum ada relay untuk dihapus. *.7* → .1 untuk tambah.');
          return true;
        }
        saveState({ step: STEP.RELAY_DEL_PICK, draft: { relayDelKeys: keys } });
        const lines = keys.map((k, i) => `${i + 1}) *${k}* → ${map[k]}`);
        await reply(
          msg,
          `Pilih relay yang *dihapus* — .*angka* atau *.0* batal:\n\n${lines.join('\n')}`
        );
        return true;
      }
      if (cmd === '3') {
        const map = db.getRelayAliasesMap();
        const keys = Object.keys(map).sort();
        if (!keys.length) {
          await reply(msg, 'Belum ada relay. *.7* → .1 untuk tambah.');
          return true;
        }
        saveState({ step: STEP.RELAY_EDIT_PICK, draft: { relayEditPickKeys: keys } });
        const lines = keys.map((k, i) => `${i + 1}) *${k}* → ${map[k]}`);
        await reply(
          msg,
          `Pilih relay yang *diedit* — .*angka* atau *.0* batal:\n\n${lines.join('\n')}`
        );
        return true;
      }
      await reply(msg, 'Kirim .1, .2, .3, atau .0.');
      return true;
    }

    if (state.step === STEP.RELAY_ADD_KEY) {
      if (cmd === '0') {
        saveState({ step: STEP.RELAY_CRUD_MAIN, draft: {} });
        await reply(msg, '*.7* — relay: .1 tambah · .2 hapus · .3 edit · .0 menu');
        return true;
      }
      const key = cmd.replace(/^\s+/, '').slice(0, 40).trim();
      if (!key || /\s/.test(key)) {
        await reply(msg, 'Kunci satu token tanpa spasi, contoh .Ra atau .Budi');
        return true;
      }
      state.draft.relayNewKey = key;
      state.step = STEP.RELAY_ADD_TARGET;
      saveState(state);
      await reply(
        msg,
        `Kunci: *${key}*\nKirim *.nomor WA* 10–15 digit (contoh *.6281234567890*) atau *.628...@c.us* sebaris setelah titik.`
      );
      return true;
    }

    if (state.step === STEP.RELAY_ADD_TARGET) {
      if (cmd === '0') {
        saveState({ step: STEP.RELAY_CRUD_MAIN, draft: {} });
        await reply(msg, 'Batal tambah relay.');
        return true;
      }
      const aliasKey = state.draft.relayNewKey;
      if (!aliasKey) {
        saveState({ step: STEP.IDLE, draft: {} });
        await reply(msg, 'Sesi hilang. .atur → .7');
        return true;
      }
      let target = cmd.trim();
      const lower = target.toLowerCase();
      if (/^\d+@c\.us$/i.test(lower)) {
        target = lower.replace(/\s/g, '');
      } else {
        const d = digitsOnly(target);
        if (d.length < 10 || d.length > 15) {
          await reply(msg, 'Nomor tidak valid. 10–15 digit atau format 628...@c.us');
          return true;
        }
        target = d;
      }
      try {
        db.mergeRelayAlias(aliasKey, target);
      } catch (e) {
        await reply(msg, `Gagal simpan: ${e.message || e}`);
        return true;
      }
      const sk = scopeKeyFromRelayTarget(target);
      if (sk) {
        db.setContactPersonalityOverride(sk, pers.activePersonalityId);
      }
      saveState({ step: STEP.RELAY_CRUD_MAIN, draft: {} });
      await reply(
        msg,
        `✓ Relay *${aliasKey}* → ${target}\n` +
          `Kepribadian untuk nomor ini diset ke *${pers.personalities.find((x) => x.id === pers.activePersonalityId)?.name || '?'}* (aktif global saat ini).\n\n` +
          `Lanjut: *.6* → pilih *${aliasKey}* untuk ingatan / ubah kepribadian.`
      );
      log('[self-admin] relay merge', aliasKey, target);
      return true;
    }

    if (state.step === STEP.RELAY_EDIT_PICK) {
      const keys = state.draft.relayEditPickKeys || [];
      if (cmd === '0') {
        saveState({ step: STEP.RELAY_CRUD_MAIN, draft: {} });
        await reply(msg, '*.7* — kelola relay');
        return true;
      }
      const num = parseInt(cmd, 10);
      const k = keys[num - 1];
      if (!k) {
        await reply(msg, 'Nomor tidak valid.');
        return true;
      }
      const map = db.getRelayAliasesMap();
      const target = map[k];
      state.draft = { relayEditKey: k, relayEditTarget: target };
      state.step = STEP.RELAY_EDIT_MENU;
      saveState(state);
      await reply(
        msg,
        `*Edit relay*\n*${k}* → ${target}\n\n` +
          `*.1* Ubah *nomor* tujuan (kunci tetap)\n` +
          `*.2* Ubah *nama kunci* (nomor tetap)\n` +
          `*.9* Batal ke menu relay`
      );
      return true;
    }

    if (state.step === STEP.RELAY_EDIT_MENU) {
      const oldKey = state.draft.relayEditKey;
      const map = db.getRelayAliasesMap();
      const target = oldKey ? map[oldKey] : null;
      if (!oldKey || target == null) {
        saveState({ step: STEP.RELAY_CRUD_MAIN, draft: {} });
        await reply(msg, 'Entri tidak ditemukan. *.7* lagi.');
        return true;
      }
      if (cmd === '9') {
        saveState({ step: STEP.RELAY_CRUD_MAIN, draft: {} });
        await reply(msg, '*.7* — kelola relay');
        return true;
      }
      if (cmd === '1') {
        state.step = STEP.RELAY_EDIT_TARGET;
        saveState(state);
        await reply(
          msg,
          `Kunci *${oldKey}* — nomor sekarang: ${target}\nKirim *.nomor baru* 10–15 digit atau *.628...@c.us*`
        );
        return true;
      }
      if (cmd === '2') {
        state.step = STEP.RELAY_EDIT_KEY_NEW;
        saveState(state);
        await reply(msg, `Nomor tetap *${target}*\nKirim *.namaKunciBaru* (satu token, tanpa spasi).`);
        return true;
      }
      await reply(msg, 'Kirim .1, .2, atau .9.');
      return true;
    }

    if (state.step === STEP.RELAY_EDIT_TARGET) {
      const oldKey = state.draft.relayEditKey;
      if (cmd === '0' || cmd === '9') {
        state.draft = { relayEditKey: oldKey, relayEditTarget: db.getRelayAliasesMap()[oldKey] };
        state.step = STEP.RELAY_EDIT_MENU;
        saveState(state);
        const t = state.draft.relayEditTarget;
        await reply(
          msg,
          `*Edit relay*\n*${oldKey}* → ${t}\n\n*.1* Ubah nomor · *.2* Ubah kunci · *.9* Batal`
        );
        return true;
      }
      if (!oldKey) {
        saveState({ step: STEP.IDLE, draft: {} });
        await reply(msg, 'Sesi hilang.');
        return true;
      }
      let target = cmd.trim();
      const lower = target.toLowerCase();
      if (/^\d+@c\.us$/i.test(lower)) {
        target = lower.replace(/\s/g, '');
      } else {
        const d = digitsOnly(target);
        if (d.length < 10 || d.length > 15) {
          await reply(msg, 'Nomor tidak valid. 10–15 digit atau 628...@c.us');
          return true;
        }
        target = d;
      }
      try {
        db.mergeRelayAlias(oldKey, target);
      } catch (e) {
        await reply(msg, `Gagal: ${e.message || e}`);
        return true;
      }
      const sk = scopeKeyFromRelayTarget(target);
      if (sk) pinActivePersonalityIfUnset(sk);
      state.draft = { relayEditKey: oldKey, relayEditTarget: target };
      state.step = STEP.RELAY_EDIT_MENU;
      saveState(state);
      await reply(msg, `✓ *${oldKey}* sekarang → ${target}`);
      await reply(
        msg,
        `*Edit relay*\n*${oldKey}* → ${target}\n\n*.1* Ubah nomor · *.2* Ubah kunci · *.9* Menu relay`
      );
      return true;
    }

    if (state.step === STEP.RELAY_EDIT_KEY_NEW) {
      const oldKey = state.draft.relayEditKey;
      const map0 = db.getRelayAliasesMap();
      const target = oldKey ? map0[oldKey] : null;
      if (cmd === '0' || cmd === '9') {
        state.draft = { relayEditKey: oldKey, relayEditTarget: target };
        state.step = STEP.RELAY_EDIT_MENU;
        saveState(state);
        await reply(
          msg,
          `*Edit relay*\n*${oldKey}* → ${target}\n\n*.1* Ubah nomor · *.2* Ubah kunci · *.9* Menu relay`
        );
        return true;
      }
      if (!oldKey || target == null) {
        saveState({ step: STEP.IDLE, draft: {} });
        await reply(msg, 'Sesi hilang.');
        return true;
      }
      const newKey = cmd.replace(/^\s+/, '').slice(0, 40).trim();
      if (!newKey || /\s/.test(newKey)) {
        await reply(msg, 'Kunci satu token tanpa spasi.');
        return true;
      }
      if (newKey.toLowerCase() === String(oldKey).toLowerCase()) {
        await reply(msg, 'Nama kunci sama. Kirim nama lain atau .9');
        return true;
      }
      const map = db.getRelayAliasesMap();
      const conflict = Object.keys(map).find((k) => k.toLowerCase() === newKey.toLowerCase());
      if (conflict) {
        await reply(msg, `Kunci *${conflict}* sudah dipakai. Pilih nama lain.`);
        return true;
      }
      try {
        db.deleteRelayAliasKey(oldKey);
        db.mergeRelayAlias(newKey, target);
      } catch (e) {
        await reply(msg, `Gagal: ${e.message || e}`);
        return true;
      }
      state.draft = { relayEditKey: newKey, relayEditTarget: target };
      state.step = STEP.RELAY_EDIT_MENU;
      saveState(state);
      await reply(msg, `✓ Kunci *${oldKey}* diubah jadi *${newKey}* (nomor tetap ${target}).`);
      await reply(
        msg,
        `*Edit relay*\n*${newKey}* → ${target}\n\n*.1* Ubah nomor · *.2* Ubah kunci · *.9* Menu relay`
      );
      log('[self-admin] relay rename', oldKey, '→', newKey);
      return true;
    }

    if (state.step === STEP.RELAY_DEL_PICK) {
      const keys = state.draft.relayDelKeys || [];
      if (cmd === '0') {
        saveState({ step: STEP.RELAY_CRUD_MAIN, draft: {} });
        await reply(msg, '*.7* — kelola relay');
        return true;
      }
      const num = parseInt(cmd, 10);
      const k = keys[num - 1];
      if (!k) {
        await reply(msg, 'Nomor tidak valid.');
        return true;
      }
      db.deleteRelayAliasKey(k);
      saveState({ step: STEP.RELAY_CRUD_MAIN, draft: {} });
      await reply(
        msg,
        `✓ Entri relay *${k}* dihapus.\n_(Kepribadian & ingatan per nomor tetap di database jika sudah pernah di-set.)_`
      );
      log('[self-admin] relay hapus', k);
      return true;
    }

    if (state.step === STEP.RELAY_MEM_NEW) {
      const sk = state.draft.memoryScopeKey;
      if (!sk || !cmd) {
        await reply(msg, 'Teks tidak boleh kosong.');
        return true;
      }
      db.insertMemoryItemForScope(sk, {
        id: newMid(),
        text: cmd.slice(0, 2000),
        at: new Date().toISOString(),
        source: 'manual_self_admin',
      });
      state.step = STEP.RELAY_MEM_MENU;
      saveState(state);
      await reply(msg, 'Ingatan ditambahkan.');
      await showRelayMemoryMenu(msg, sk, state.draft.memoryLabel || sk);
      log('[self-admin] ingatan +', sk);
      return true;
    }

    if (state.step === STEP.RELAY_MEM_LIST_EDIT) {
      const sk = state.draft.memoryScopeKey;
      const data = db.getMemoriesForScope(sk);
      const num = parseInt(cmd, 10);
      if (cmd === '0') {
        state.step = STEP.RELAY_MEM_MENU;
        saveState(state);
        await showRelayMemoryMenu(msg, sk, state.draft.memoryLabel || sk);
        return true;
      }
      if (cmd === '9') {
        state.step = STEP.RELAY_MEM_MENU;
        saveState(state);
        await showRelayMemoryMenu(msg, sk, state.draft.memoryLabel || sk);
        return true;
      }
      const i = num - 1;
      if (i < 0 || i >= data.items.length) {
        await reply(msg, 'Nomor tidak valid.');
        return true;
      }
      state.draft.memIndex = i;
      state.step = STEP.RELAY_MEM_EDIT_TEXT;
      saveState(state);
      await reply(
        msg,
        `Ingatan ${num} saat ini:\n_${data.items[i].text.slice(0, 900)}${data.items[i].text.length > 900 ? '…' : ''}_\n\nKirim *.teks baru*`
      );
      return true;
    }

    if (state.step === STEP.RELAY_MEM_EDIT_TEXT) {
      const sk = state.draft.memoryScopeKey;
      const i = state.draft.memIndex;
      const data = db.getMemoriesForScope(sk);
      if (!cmd || i == null || !data.items[i]) {
        saveState({ step: STEP.IDLE, draft: {} });
        await reply(msg, 'Gagal. .atur lagi.');
        return true;
      }
      data.items[i].text = cmd.slice(0, 2000);
      data.items[i].at = new Date().toISOString();
      db.replaceMemoriesForScope(sk, data.items);
      state.step = STEP.RELAY_MEM_MENU;
      saveState(state);
      await reply(msg, 'Ingatan diperbarui.');
      await showRelayMemoryMenu(msg, sk, state.draft.memoryLabel || sk);
      return true;
    }

    if (state.step === STEP.RELAY_MEM_LIST_DEL) {
      const sk = state.draft.memoryScopeKey;
      const data = db.getMemoriesForScope(sk);
      if (cmd === '0') {
        state.step = STEP.RELAY_MEM_MENU;
        saveState(state);
        await showRelayMemoryMenu(msg, sk, state.draft.memoryLabel || sk);
        return true;
      }
      const num = parseInt(cmd, 10);
      const i = num - 1;
      if (i < 0 || i >= data.items.length) {
        await reply(msg, 'Nomor tidak valid.');
        return true;
      }
      data.items.splice(i, 1);
      db.replaceMemoriesForScope(sk, data.items);
      state.step = STEP.RELAY_MEM_MENU;
      saveState(state);
      await reply(msg, 'Ingatan dihapus.');
      await showRelayMemoryMenu(msg, sk, state.draft.memoryLabel || sk);
      return true;
    }

    await reply(msg, 'Gunakan .atur untuk buka menu, atau .batal.');
    return true;
  }

  return {
    isSelfChat,
    ensurePersonalities,
    getReplyProfile,
    handle,
  };
}

module.exports = { createSelfAdmin, STEP };
