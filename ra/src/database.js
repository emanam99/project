const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const KV_PERSONALITIES = 'personalities_json';
const KV_SELF_ADMIN = 'self_admin_state_json';

const { scopeKeyFromRelayTarget } = require('./memoryScope');

function readJsonFile(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS enabled_chats (chat_id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS messages_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_hist_chat ON messages_history(chat_id);
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      at TEXT NOT NULL,
      source TEXT,
      scope_key TEXT NOT NULL DEFAULT 'legacy_global'
    );
    CREATE TABLE IF NOT EXISTS relay_aliases (alias_key TEXT PRIMARY KEY, target TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS contact_personality (
      scope_key TEXT PRIMARY KEY,
      personality_id TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS scheduled_messages (
      id TEXT PRIMARY KEY,
      target_jid TEXT NOT NULL,
      target_label TEXT,
      body TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      sent_at TEXT,
      last_error TEXT,
      repeat_kind TEXT NOT NULL DEFAULT 'once',
      repeat_dow INTEGER,
      repeat_time_local TEXT,
      schedule_timezone TEXT,
      body_mode TEXT NOT NULL DEFAULT 'plain',
      scope_key TEXT,
      source_kind TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sched_pending ON scheduled_messages (status, scheduled_at);
  `);
}

function migrateFromJson(ROOT, db, log) {
  const insEn = db.prepare('INSERT OR IGNORE INTO enabled_chats (chat_id) VALUES (?)');
  if (db.prepare('SELECT COUNT(*) AS c FROM enabled_chats').get().c === 0) {
    const p = path.join(ROOT, 'data', 'enabled-chats.json');
    const d = readJsonFile(p);
    const arr = Array.isArray(d?.enabled) ? d.enabled : [];
    if (arr.length) {
      db.transaction(() => {
        for (const id of arr) insEn.run(id);
      })();
      log('[db] migrasi enabled-chats.json → SQLite');
    }
  }

  const insHist = db.prepare(
    'INSERT INTO messages_history (chat_id, role, content, at) VALUES (?,?,?,?)'
  );
  if (db.prepare('SELECT COUNT(*) AS c FROM messages_history').get().c === 0) {
    const p = path.join(ROOT, 'data', 'messages-history.json');
    const map = readJsonFile(p);
    if (map && typeof map === 'object') {
      let n = 0;
      db.transaction(() => {
        for (const chatId of Object.keys(map)) {
          const entries = map[chatId] || [];
          for (const e of entries) {
            insHist.run(
              chatId,
              e.role,
              String(e.content || ''),
              e.at || new Date().toISOString()
            );
            n += 1;
          }
        }
      })();
      if (n) log('[db] migrasi messages-history.json → SQLite (', n, 'baris)');
    }
  }

  const hasKvPers = db.prepare('SELECT 1 FROM app_kv WHERE key = ?').get(KV_PERSONALITIES);
  if (!hasKvPers) {
    let pers = readJsonFile(path.join(ROOT, 'config', 'personalities.json'));
    if (!pers?.personalities) {
      const old = readJsonFile(path.join(ROOT, 'config', 'personality.json'));
      pers = {
        activePersonalityId: 'p_default',
        personalities: [
          {
            id: 'p_default',
            name: old?.name || 'Default',
            model: old?.model || 'deepseek-chat',
            systemPrompt: old?.systemPrompt || 'Kamu membantu pengguna dengan ramah.',
          },
        ],
      };
      log('[db] migrasi personality(ies).json → SQLite');
    }
    if (pers?.personalities) {
      db.prepare('INSERT OR REPLACE INTO app_kv (key, value) VALUES (?, ?)').run(
        KV_PERSONALITIES,
        JSON.stringify(pers)
      );
    }
  }

  if (db.prepare('SELECT COUNT(*) AS c FROM memories').get().c === 0) {
    const p = path.join(ROOT, 'data', 'memories.json');
    const d = readJsonFile(p);
    const items = Array.isArray(d?.items) ? d.items : [];
    const insM = db.prepare(
      'INSERT OR REPLACE INTO memories (id, text, at, source, scope_key) VALUES (?,?,?,?,?)'
    );
    if (items.length) {
      db.transaction(() => {
        for (const it of items) {
          insM.run(
            it.id || `m_${Date.now()}`,
            String(it.text || ''),
            it.at || new Date().toISOString(),
            it.source || null,
            'legacy_global'
          );
        }
      })();
      log('[db] migrasi memories.json → SQLite');
    }
  }

  if (db.prepare('SELECT COUNT(*) AS c FROM relay_aliases').get().c === 0) {
    const p = path.join(ROOT, 'data', 'relay-aliases.json');
    const d = readJsonFile(p);
    const aliases = d?.aliases && typeof d.aliases === 'object' ? d.aliases : {};
    const insR = db.prepare('INSERT OR REPLACE INTO relay_aliases (alias_key, target) VALUES (?,?)');
    const keys = Object.keys(aliases);
    if (keys.length) {
      db.transaction(() => {
        for (const k of keys) {
          const v = aliases[k];
          if (v != null && String(v).trim() !== '') insR.run(k, String(v).trim());
        }
      })();
      log('[db] migrasi relay-aliases.json → SQLite');
    }
  }

  const hasState = db.prepare('SELECT 1 FROM app_kv WHERE key = ?').get(KV_SELF_ADMIN);
  if (!hasState) {
    const p = path.join(ROOT, 'data', 'self-admin-state.json');
    const s = readJsonFile(p);
    if (s && s.step) {
      db.prepare('INSERT OR REPLACE INTO app_kv (key, value) VALUES (?, ?)').run(
        KV_SELF_ADMIN,
        JSON.stringify({ step: s.step || 'idle', draft: s.draft || {} })
      );
      log('[db] migrasi self-admin-state.json → SQLite');
    }
  }
}

function ensureMemoriesScopeKeyColumn(db, log) {
  const cols = db.prepare('PRAGMA table_info(memories)').all();
  if (cols.some((c) => c.name === 'scope_key')) return;
  try {
    db.exec(`ALTER TABLE memories ADD COLUMN scope_key TEXT NOT NULL DEFAULT 'legacy_global'`);
    log('[db] kolom memories.scope_key ditambahkan');
  } catch (e) {
    log('[db] gagal tambah scope_key:', e.message);
  }
}

/** Satu relay di DB → pindahkan ingatan legacy ke scope nomor itu (sekali). */
function ensureScheduledMessagesExtraColumns(db, log) {
  const cols = db.prepare('PRAGMA table_info(scheduled_messages)').all();
  const names = new Set(cols.map((c) => c.name));
  let n = 0;
  const add = (sql) => {
    try {
      db.exec(sql);
      n += 1;
    } catch (e) {
      log('[db] migrasi scheduled_messages gagal:', e.message);
    }
  };
  if (!names.has('repeat_kind')) {
    add(`ALTER TABLE scheduled_messages ADD COLUMN repeat_kind TEXT NOT NULL DEFAULT 'once'`);
  }
  if (!names.has('repeat_dow')) {
    add('ALTER TABLE scheduled_messages ADD COLUMN repeat_dow INTEGER');
  }
  if (!names.has('repeat_time_local')) {
    add('ALTER TABLE scheduled_messages ADD COLUMN repeat_time_local TEXT');
  }
  if (!names.has('schedule_timezone')) {
    add('ALTER TABLE scheduled_messages ADD COLUMN schedule_timezone TEXT');
  }
  if (!names.has('body_mode')) {
    add(`ALTER TABLE scheduled_messages ADD COLUMN body_mode TEXT NOT NULL DEFAULT 'plain'`);
  }
  if (!names.has('scope_key')) {
    add('ALTER TABLE scheduled_messages ADD COLUMN scope_key TEXT');
  }
  if (!names.has('source_kind')) {
    add('ALTER TABLE scheduled_messages ADD COLUMN source_kind TEXT');
  }
  if (n) log('[db] scheduled_messages: kolom tambahan (', n, ')');
}

function migrateLegacyMemoriesIfSingleRelay(db, log) {
  const legacy = db.prepare("SELECT COUNT(*) AS c FROM memories WHERE scope_key = 'legacy_global'").get().c;
  if (!legacy) return;
  const relays = db.prepare('SELECT target FROM relay_aliases').all();
  if (relays.length !== 1) return;
  const sk = scopeKeyFromRelayTarget(relays[0].target);
  if (!sk) return;
  const u = db.prepare("UPDATE memories SET scope_key = ? WHERE scope_key = 'legacy_global'");
  const ch = u.run(sk);
  if (ch.changes > 0) {
    log('[db] ingatan legacy_global dipindah ke scope', sk, `(${ch.changes} baris, 1 relay)`);
  }
}

function trimHistory(db, chatId, maxKeep) {
  const row = db.prepare('SELECT COUNT(*) AS c FROM messages_history WHERE chat_id = ?').get(chatId);
  const excess = row.c - maxKeep;
  if (excess <= 0) return;
  db.prepare(
    `DELETE FROM messages_history WHERE id IN (
      SELECT id FROM messages_history WHERE chat_id = ? ORDER BY id ASC LIMIT ?
    )`
  ).run(chatId, excess);
}

/**
 * @param {string} ROOT
 * @param {function} log
 */
function openAndInit(ROOT, log) {
  const dataDir = path.join(ROOT, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'app.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  initSchema(db);
  ensureMemoriesScopeKeyColumn(db, log);
  migrateFromJson(ROOT, db, log);
  migrateLegacyMemoriesIfSingleRelay(db, log);
  ensureScheduledMessagesExtraColumns(db, log);
  log('[db] SQLite:', dbPath);

  return {
    _raw: db,

    loadEnabledSet() {
      const rows = db.prepare('SELECT chat_id FROM enabled_chats').all();
      return new Set(rows.map((r) => r.chat_id));
    },

    saveEnabledSet(set) {
      const del = db.prepare('DELETE FROM enabled_chats');
      const ins = db.prepare('INSERT INTO enabled_chats (chat_id) VALUES (?)');
      db.transaction(() => {
        del.run();
        for (const id of [...set].sort()) ins.run(id);
      })();
    },

    getHistoryEntries(chatId) {
      return db
        .prepare(
          'SELECT role, content, at FROM messages_history WHERE chat_id = ? ORDER BY id ASC'
        )
        .all(chatId);
    },

    appendHistory(chatId, role, content, maxPerChat) {
      const max = maxPerChat || 500;
      db.prepare(
        'INSERT INTO messages_history (chat_id, role, content, at) VALUES (?,?,?,?)'
      ).run(chatId, role, String(content).slice(0, 8000), new Date().toISOString());
      trimHistory(db, chatId, max);
    },

    getPersonalities() {
      const row = db.prepare('SELECT value FROM app_kv WHERE key = ?').get(KV_PERSONALITIES);
      if (!row?.value) return null;
      try {
        return JSON.parse(row.value);
      } catch {
        return null;
      }
    },

    setPersonalities(data) {
      db.prepare('INSERT OR REPLACE INTO app_kv (key, value) VALUES (?, ?)').run(
        KV_PERSONALITIES,
        JSON.stringify(data)
      );
    },

    getMemoriesForScope(scopeKey) {
      const sk = String(scopeKey || '__unknown__');
      const rows = db
        .prepare(
          'SELECT id, text, at, source FROM memories WHERE scope_key = ? ORDER BY at ASC'
        )
        .all(sk);
      return { items: rows.map((r) => ({ id: r.id, text: r.text, at: r.at, source: r.source })) };
    },

    countMemoriesForScope(scopeKey) {
      const sk = String(scopeKey || '');
      const row = db.prepare('SELECT COUNT(*) AS c FROM memories WHERE scope_key = ?').get(sk);
      return row ? row.c : 0;
    },

    replaceMemoriesForScope(scopeKey, items) {
      const sk = String(scopeKey || '__unknown__');
      db.prepare('DELETE FROM memories WHERE scope_key = ?').run(sk);
      const ins = db.prepare(
        'INSERT INTO memories (id, text, at, source, scope_key) VALUES (?,?,?,?,?)'
      );
      db.transaction(() => {
        for (const it of items) {
          ins.run(it.id, it.text, it.at, it.source || null, sk);
        }
      })();
    },

    insertMemoryItemForScope(scopeKey, item) {
      const sk = String(scopeKey || '__unknown__');
      db.prepare(
        'INSERT OR REPLACE INTO memories (id, text, at, source, scope_key) VALUES (?,?,?,?,?)'
      ).run(item.id, item.text, item.at, item.source || null, sk);
    },

    /** Hanya untuk admin: jumlah ingatan tanpa kontak (sebelum dipindah). */
    countLegacyGlobalMemories() {
      const row = db
        .prepare("SELECT COUNT(*) AS c FROM memories WHERE scope_key = 'legacy_global'")
        .get();
      return row ? row.c : 0;
    },

    getRelayAliasesMap() {
      const rows = db.prepare('SELECT alias_key, target FROM relay_aliases').all();
      const aliases = {};
      for (const r of rows) aliases[r.alias_key] = r.target;
      return aliases;
    },

    setRelayAliasesMap(aliases) {
      db.prepare('DELETE FROM relay_aliases').run();
      const ins = db.prepare('INSERT INTO relay_aliases (alias_key, target) VALUES (?,?)');
      db.transaction(() => {
        for (const k of Object.keys(aliases || {})) {
          const v = aliases[k];
          if (v != null && String(v).trim() !== '') ins.run(k, String(v).trim());
        }
      })();
    },

    mergeRelayAlias(aliasKey, target) {
      const k = String(aliasKey || '').trim();
      if (!k) throw new Error('Kunci relay kosong');
      const t = String(target || '').trim();
      if (!t) throw new Error('Nomor/target kosong');
      const map = this.getRelayAliasesMap();
      map[k] = t;
      this.setRelayAliasesMap(map);
    },

    deleteRelayAliasKey(aliasKey) {
      const k = String(aliasKey || '').trim();
      if (!k) return false;
      const map = this.getRelayAliasesMap();
      if (!Object.prototype.hasOwnProperty.call(map, k)) return false;
      delete map[k];
      this.setRelayAliasesMap(map);
      return true;
    },

    getContactPersonalityOverride(scopeKey) {
      const sk = String(scopeKey || '');
      if (!sk) return null;
      const row = db
        .prepare('SELECT personality_id FROM contact_personality WHERE scope_key = ?')
        .get(sk);
      return row ? row.personality_id : null;
    },

    setContactPersonalityOverride(scopeKey, personalityId) {
      const sk = String(scopeKey || '');
      const pid = String(personalityId || '').trim();
      if (!sk || !pid) return;
      db.prepare(
        'INSERT OR REPLACE INTO contact_personality (scope_key, personality_id, updated_at) VALUES (?,?,?)'
      ).run(sk, pid, new Date().toISOString());
    },

    deleteContactPersonalityOverride(scopeKey) {
      db.prepare('DELETE FROM contact_personality WHERE scope_key = ?').run(String(scopeKey || ''));
    },

    /** Hapus override yang merujuk personality_id (saat kepribadian dihapus). */
    clearContactPersonalityByPersonalityId(personalityId) {
      const pid = String(personalityId || '');
      db.prepare('DELETE FROM contact_personality WHERE personality_id = ?').run(pid);
    },

    getSelfAdminState() {
      const row = db.prepare('SELECT value FROM app_kv WHERE key = ?').get(KV_SELF_ADMIN);
      if (!row?.value) return { step: 'idle', draft: {} };
      try {
        const s = JSON.parse(row.value);
        return { step: s.step || 'idle', draft: s.draft || {} };
      } catch {
        return { step: 'idle', draft: {} };
      }
    },

    setSelfAdminState(s) {
      db.prepare('INSERT OR REPLACE INTO app_kv (key, value) VALUES (?, ?)').run(
        KV_SELF_ADMIN,
        JSON.stringify({ step: s.step, draft: s.draft || {} })
      );
    },

    insertScheduledMessage({
      targetJid,
      targetLabel,
      body,
      scheduledAtIso,
      repeatKind,
      repeatDow,
      repeatTimeLocal,
      scheduleTimezone,
      bodyMode,
      scopeKey,
      sourceKind,
    }) {
      const crypto = require('crypto');
      const id = `sched_${crypto.randomBytes(8).toString('hex')}`;
      const at = new Date().toISOString();
      const rk = String(repeatKind || 'once').toLowerCase();
      const rd =
        repeatDow === null || repeatDow === undefined || repeatDow === ''
          ? null
          : Number(repeatDow);
      const rtl =
        repeatTimeLocal != null && String(repeatTimeLocal).trim() !== ''
          ? String(repeatTimeLocal).trim().slice(0, 8)
          : null;
      const stz = scheduleTimezone != null ? String(scheduleTimezone).trim().slice(0, 80) : null;
      const bm =
        String(bodyMode || 'plain').toLowerCase() === 'personality' ? 'personality' : 'plain';
      const sk =
        scopeKey != null && String(scopeKey).trim() !== ''
          ? String(scopeKey).trim().slice(0, 200)
          : null;
      const src =
        sourceKind != null && String(sourceKind).trim() !== ''
          ? String(sourceKind).trim().slice(0, 24)
          : null;
      db.prepare(
        `INSERT INTO scheduled_messages (
          id, target_jid, target_label, body, scheduled_at, status, created_at,
          repeat_kind, repeat_dow, repeat_time_local, schedule_timezone,
          body_mode, scope_key, source_kind
        ) VALUES (?,?,?,?,?,'pending',?,?,?,?,?,?,?,?)`
      ).run(
        id,
        String(targetJid),
        targetLabel != null ? String(targetLabel).slice(0, 200) : null,
        String(body).slice(0, 4000),
        String(scheduledAtIso),
        at,
        rk === 'daily' || rk === 'weekly' ? rk : 'once',
        Number.isFinite(rd) ? rd : null,
        rtl,
        stz,
        bm,
        sk,
        src
      );
      return id;
    },

    /** Klaim baris pending → sending (hindari kirim ganda). */
    claimScheduledDue(nowIso, limit) {
      const lim = Math.min(50, Math.max(1, limit || 10));
      return db.transaction(() => {
        const rows = db
          .prepare(
            `SELECT * FROM scheduled_messages
             WHERE status = 'pending' AND scheduled_at <= ?
             ORDER BY scheduled_at ASC
             LIMIT ?`
          )
          .all(String(nowIso), lim);
        const out = [];
        for (const row of rows) {
          const u = db
            .prepare(`UPDATE scheduled_messages SET status = 'sending' WHERE id = ? AND status = 'pending'`)
            .run(row.id);
          if (u.changes) out.push(row);
        }
        return out;
      })();
    },

    markScheduledSent(id) {
      db.prepare(
        `UPDATE scheduled_messages SET status = 'sent', sent_at = ? WHERE id = ? AND status = 'sending'`
      ).run(new Date().toISOString(), String(id));
    },

    markScheduledFailed(id, errMsg) {
      db.prepare(
        `UPDATE scheduled_messages SET status = 'failed', last_error = ?, sent_at = ? WHERE id = ? AND status = 'sending'`
      ).run(String(errMsg || '').slice(0, 500), new Date().toISOString(), String(id));
    },

    /** Setelah kirim sukses jadwal harian/mingguan: jadwal berikutnya + pending. */
    rescheduleRecurringPending(id, nextScheduledAtIso) {
      db.prepare(
        `UPDATE scheduled_messages SET status = 'pending', scheduled_at = ?, sent_at = ? WHERE id = ? AND status = 'sending'`
      ).run(String(nextScheduledAtIso), new Date().toISOString(), String(id));
    },

    listScheduledPendingOrdered() {
      return db
        .prepare(
          `SELECT id, target_label, body, scheduled_at, status, created_at,
                  repeat_kind, repeat_dow, repeat_time_local, schedule_timezone,
                  body_mode, scope_key, source_kind
           FROM scheduled_messages
           WHERE status = 'pending'
           ORDER BY scheduled_at ASC`
        )
        .all();
    },

    cancelScheduledByListIndex(oneBased) {
      const n = parseInt(oneBased, 10);
      if (n < 1) return { ok: false, reason: 'nomor' };
      const rows = db
        .prepare(
          `SELECT id FROM scheduled_messages WHERE status = 'pending' ORDER BY scheduled_at ASC`
        )
        .all();
      const row = rows[n - 1];
      if (!row) return { ok: false, reason: 'tidak ada' };
      const u = db
        .prepare(`UPDATE scheduled_messages SET status = 'cancelled' WHERE id = ? AND status = 'pending'`)
        .run(row.id);
      return { ok: u.changes > 0, id: row.id };
    },
  };
}

module.exports = { openAndInit };
