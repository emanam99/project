/***
  @ Base: https://play.google.com/store/apps/details?id=com.deepseek.chat
  @ Author: Shannz
  @ Note: DeepSeek AI wrapper.
***/

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { logThreadAfterStream } from './thread-log.mjs';
import { logNewlineDiagnostics } from './newline-log.mjs';
import { normalizeMarkdownStreamGaps } from './markdown-gap.mjs';
import vm from 'vm';
import FormData from 'form-data';

const CONFIG = {
  BASE_URL: 'https://chat.deepseek.com/api/v0',
  HEADERS: {
    'User-Agent': 'DeepSeek/1.6.4 Android/35',
    Accept: 'application/json',
    'x-client-platform': 'android',
    'x-client-version': '1.6.4',
    'x-client-locale': 'id',
    'x-client-bundle-id': 'com.deepseek.chat',
    'x-rangers-id': '7392079989945982465',
    'accept-charset': 'UTF-8'
  }
};

const WORKER_URL = 'https://static.deepseek.com/chat/static/33614.25c7f8f220.js';
const WASM_URL = 'https://static.deepseek.com/chat/static/sha3_wasm_bg.7b9ca65ddd.wasm';

let workerCache = null;
let wasmCache = null;

/**
 * Ekstraksi teks dari objek JSON DeepSeek (stream chunk atau body utuh).
 * Dipakai untuk fallback jika SSE tidak terparsing atau respons bukan text/event-stream.
 */
function extractFallbackDeepStatic(root) {
  if (root == null) return '';
  /** parentKey === 'fragments' → anak array adalah paragraf terpisah (DeepSeek). */
  const walk = (node, depth, parentKey) => {
    if (depth > 52) return '';
    if (node == null) return '';
    if (typeof node === 'string') return node;
    if (typeof node !== 'object') return '';
    if (Array.isArray(node)) {
      const parts = node.map((x) => walk(x, depth + 1, parentKey));
      if (parentKey === 'fragments') return parts.filter(Boolean).join('\n\n');
      return parts.join('');
    }
    if (Object.prototype.hasOwnProperty.call(node, 'v')) {
      return walk(node.v, depth + 1, 'v');
    }
    let out = '';
    for (const k of ['content', 'delta', 'text', 'message', 'answer', 'result', 't', 'c']) {
      const v = node[k];
      if (typeof v === 'string') out += v;
      else if (v && typeof v === 'object') out += walk(v, depth + 1, k);
    }
    for (const k of [
      'data',
      'biz_data',
      'message',
      'result',
      'chunk',
      'fragments',
      'fragment',
      'choices',
      'response'
    ]) {
      if (node[k] != null && typeof node[k] === 'object') {
        out += walk(node[k], depth + 1, k);
      }
    }
    return out;
  };
  return walk(root, 0, undefined);
}

/**
 * Respons API DeepSeek (bukan SSE): { code, data: { biz_data: ... } } atau error.
 */
function extractReplyFromEnvelope(j) {
  if (j == null) return '';
  if (typeof j === 'string') return j;
  if (typeof j !== 'object') return '';
  if (Array.isArray(j)) return j.map((x) => extractReplyFromEnvelope(x)).join('');
  const code = j.code;
  if (code !== undefined && code !== 0 && code !== '0') {
    const msg = j.msg ?? j.message ?? j.data?.msg ?? j.data?.biz_msg;
    if (typeof msg === 'string' && msg.trim()) return '';
  }
  const bd = j.data?.biz_data ?? j.biz_data ?? j.data?.data?.biz_data;
  if (bd && typeof bd === 'object') {
    for (const k of ['content', 'text', 'answer', 'response', 'message']) {
      if (typeof bd[k] === 'string' && bd[k].trim()) return bd[k];
    }
    if (bd.message && typeof bd.message === 'object') {
      const m = bd.message;
      for (const k of ['content', 'text', 'answer']) {
        if (typeof m[k] === 'string' && m[k].trim()) return m[k];
      }
    }
    const deep = extractFallbackDeepStatic(bd);
    if (deep.trim()) return deep;
  }
  const inner = j.data ?? j.result;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    const t = extractReplyFromEnvelope(inner);
    if (t) return t;
  }
  return extractFallbackDeepStatic(j);
}

const utils = {
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  generateDeviceId() {
    const baseId =
      'BUelgEoBdkHyhwE8q/4YOodITQ1Ef99t7Y5KAR4CyHwdApr+lf4LJ+QAKXEUJ2lLtPQ+mmFtt6MpbWxpRmnWITA==';
    const chars = baseId.split('');
    const start = 50;
    const end = 70;
    const changes = Math.floor(Math.random() * 3) + 2;
    const possibleChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < changes; i += 1) {
      const randomIndex = Math.floor(Math.random() * (end - start)) + start;
      chars[randomIndex] = possibleChars.charAt(Math.floor(Math.random() * possibleChars.length));
    }
    return chars.join('');
  },

  parseSSE(chunk) {
    const lines = chunk
      .toString()
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n');
    const events = [];
    let currentEvent = { event: 'message', data: '' };

    for (let line of lines) {
      // BOM di awal stream/bar pertama membuat baris jadi "\uFEFFdata: ..." → tidak dikenali → chunk pertama (sering 1 huruf) hilang ("alo" bukan "Halo").
      line = line.replace(/^\uFEFF/, '');
      const eventMatch = /^event:(.*)$/i.exec(line);
      const dataMatch = /^data:(.*)$/i.exec(line);
      if (eventMatch) {
        if (currentEvent.data !== '') events.push({ ...currentEvent });
        currentEvent = { event: eventMatch[1].trim(), data: '' };
      } else if (dataMatch) {
        let payload = dataMatch[1];
        if (payload.startsWith(' ')) payload = payload.slice(1);
        // SSE: beberapa baris "data:" digabung dengan \n — jangan trim per baris (bisa memutus teks/JSON)
        if (currentEvent.data !== '') currentEvent.data += '\n';
        currentEvent.data += payload;
      } else if (line === '' && currentEvent.data !== '') {
        events.push({ ...currentEvent });
        currentEvent = { event: 'message', data: '' };
      } else if (currentEvent.data !== '' && line !== '') {
        /** Lanjutan isi tanpa prefiks "data:" (bukan baris SSE event/id/retry). */
        if (!/^(event|id|retry):/i.test(line)) {
          currentEvent.data += `\n${line}`;
        }
      }
    }

    if (currentEvent.data !== '') events.push(currentEvent);
    return events;
  }
};

/**
 * Jika parser SSE utama tidak mengisi teks: coba JSON respons utuh (bukan SSE),
 * lalu parse ulang dengan parseSSE (gabung beberapa baris data:).
 */
function extractReplyFromRawStream(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const s = raw.replace(/^\uFEFF/, '').trim();
  if (!s) return '';
  try {
    const j = JSON.parse(s);
    const t = extractReplyFromEnvelope(j);
    if (t) return t;
  } catch {
    /* bukan satu JSON */
  }
  const events = utils.parseSSE(`${s}\n\n`);
  let acc = '';
  for (const ev of events) {
    if (!ev.data || ev.event === 'title' || ev.event === 'keep-alive') continue;
    const rawData = ev.data.replace(/^\uFEFF/, '').trim();
    if (!rawData || rawData === '[DONE]') continue;
    try {
      const j = JSON.parse(rawData);
      acc += extractFallbackDeepStatic(j);
    } catch {
      /* skip */
    }
  }
  return acc;
}

/**
 * Ambil id pesan dari chunk SSE (untuk parent_message_id putaran berikutnya).
 * API chat.deepseek.com (Android) kadang pakai nama field lain; `id` hanya jika angka panjang (snowflake).
 */
function pickMessageIdFromChunk(obj, depth = 0) {
  if (obj == null || depth > 12) return null;
  if (Array.isArray(obj)) {
    let last = null;
    for (const el of obj) {
      const x = pickMessageIdFromChunk(el, depth + 1);
      if (x) last = x;
    }
    return last;
  }
  if (typeof obj !== 'object') return null;
  const tryKeys = [
    'message_id',
    'chat_message_id',
    'assistant_message_id',
    'msg_id',
    'last_message_id',
    'lastMessageId'
  ];
  for (const k of tryKeys) {
    const v = obj[k];
    if (v != null && v !== '' && (typeof v === 'string' || typeof v === 'number')) {
      const s = String(v).trim();
      if (s && s !== '0') return s;
    }
  }
  if (obj.id != null && (typeof obj.id === 'string' || typeof obj.id === 'number')) {
    const s = String(obj.id).trim();
    if (/^\d{10,}$/.test(s)) return s;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return s;
  }
  if (obj.message && typeof obj.message === 'object') {
    const m = obj.message;
    const mid = m.message_id ?? m.chat_message_id ?? m.id;
    if (mid != null && String(mid).trim() !== '' && String(mid) !== '0') return String(mid).trim();
  }
  for (const nk of ['biz_data', 'data', 'response']) {
    if (obj[nk] && typeof obj[nk] === 'object') {
      const x = pickMessageIdFromChunk(obj[nk], depth + 1);
      if (x) return x;
    }
  }
  if (obj.v != null && typeof obj.v === 'object' && !Array.isArray(obj.v)) {
    const x = pickMessageIdFromChunk(obj.v, depth + 1);
    if (x) return x;
  }
  if (Array.isArray(obj.v)) {
    let last = null;
    for (const el of obj.v) {
      const x = pickMessageIdFromChunk(el, depth + 1);
      if (x) last = x;
    }
    return last;
  }
  return null;
}

/**
 * Jika parser JSON tidak menemukan id di objek, ambil dari teks mentah stream.
 * API sering memakai UUID untuk message_id (bukan hanya angka panjang).
 */
function extractLastMessageIdFromRaw(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const numLong = '[0-9]{6,}';
  const numAny = '[0-9]+';
  /** message_id bisa angka kecil (mis. 4) di stream Android; response_message_id di event ready. */
  const patterns = [
    new RegExp(`"response_message_id"\\s*:\\s*"?(${uuid}|${numAny})"?`, 'gi'),
    new RegExp(`"message_id"\\s*:\\s*"?(${uuid}|${numLong}|${numAny})"?`, 'gi'),
    new RegExp(`"chat_message_id"\\s*:\\s*"?(${uuid}|${numLong}|${numAny})"?`, 'gi'),
    new RegExp(`"assistant_message_id"\\s*:\\s*"?(${uuid}|${numLong}|${numAny})"?`, 'gi'),
    new RegExp(`"msg_id"\\s*:\\s*"?(${uuid}|${numLong}|${numAny})"?`, 'gi'),
    new RegExp(`"last_message_id"\\s*:\\s*"?(${uuid}|${numLong}|${numAny})"?`, 'gi')
  ];
  let last = null;
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(raw)) !== null) {
      last = m[1];
    }
  }
  return last;
}

/** API kadang minta number untuk id numerik pendek; snowflake panjang tetap string. */
function normalizeParentForApi(mid) {
  const s = String(mid).trim();
  if (!s) return undefined;
  if (/^\d+$/.test(s)) {
    if (s.length > 16) return s;
    const n = Number(s);
    return Number.isSafeInteger(n) ? n : s;
  }
  return s;
}

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const data = [];
        res.on('data', (chunk) => data.push(chunk));
        res.on('end', () => resolve(Buffer.concat(data)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

async function loadAssets() {
  if (!workerCache) workerCache = (await download(WORKER_URL)).toString();
  if (!wasmCache) wasmCache = await download(WASM_URL);
  return { workerScript: workerCache, wasmBuffer: wasmCache };
}

function generateFinalToken(originalPayload, answer) {
  const jsonBody = {
    algorithm: originalPayload.algorithm,
    challenge: originalPayload.challenge,
    salt: originalPayload.salt,
    answer,
    signature: originalPayload.signature,
    target_path: originalPayload.target_path
  };
  return Buffer.from(JSON.stringify(jsonBody)).toString('base64');
}

async function solvePow(payload) {
  const cleanPayload = {
    algorithm: payload.algorithm,
    challenge: payload.challenge,
    salt: payload.salt,
    difficulty: payload.difficulty,
    signature: payload.signature,
    expireAt: payload.expire_at || payload.expireAt
  };

  const { workerScript, wasmBuffer } = await loadAssets();

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('PoW timeout'));
    }, 60000);

    class MockResponse {
      constructor(buffer) {
        this.buffer = buffer;
        this.ok = true;
        this.status = 200;
        this.headers = { get: () => 'application/wasm' };
      }

      async arrayBuffer() {
        return this.buffer;
      }
    }

    const sandbox = {
      console: { log: () => {} },
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      TextEncoder,
      TextDecoder,
      URL,
      Response: MockResponse,
      location: {
        href: WORKER_URL,
        origin: 'https://static.deepseek.com',
        pathname: '/chat/static/33614.25c7f8f220.js',
        toString: () => WORKER_URL
      },
      WebAssembly: {
        Module: WebAssembly.Module,
        Instance: WebAssembly.Instance,
        instantiate: WebAssembly.instantiate,
        validate: WebAssembly.validate,
        Memory: WebAssembly.Memory,
        Table: WebAssembly.Table,
        Global: WebAssembly.Global,
        CompileError: WebAssembly.CompileError,
        LinkError: WebAssembly.LinkError,
        RuntimeError: WebAssembly.RuntimeError
      },
      fetch: async (input) => {
        if (input.toString().includes('wasm')) return new MockResponse(wasmBuffer);
        throw new Error('Blocked');
      },
      postMessage: (msg) => {
        if (msg && msg.type === 'pow-answer') {
          clearTimeout(timeoutId);
          resolve(generateFinalToken(payload, msg.answer.answer));
        } else if (msg && msg.type === 'pow-error') {
          clearTimeout(timeoutId);
          reject(new Error(`POW worker error: ${JSON.stringify(msg.error)}`));
        }
      }
    };

    sandbox.self = sandbox;
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    const context = vm.createContext(sandbox);

    try {
      vm.runInContext(workerScript, context);
      setTimeout(() => {
        if (sandbox.onmessage) {
          sandbox.onmessage({ data: { type: 'pow-challenge', challenge: cleanPayload } });
        } else if (sandbox.self && sandbox.self.onmessage) {
          sandbox.self.onmessage({ data: { type: 'pow-challenge', challenge: cleanPayload } });
        } else {
          reject(new Error('Worker tidak memiliki handler onmessage'));
        }
      }, 1000);
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

async function getPowToken(token, targetPath) {
  try {
    const response = await axios.post(
      `${CONFIG.BASE_URL}/chat/create_pow_challenge`,
      { target_path: targetPath },
      { headers: { ...CONFIG.HEADERS, Authorization: `Bearer ${token}` } }
    );
    const challengeData = response.data.data.biz_data.challenge;
    return await solvePow(challengeData);
  } catch {
    return null;
  }
}

export const deepseek = {
  async login(email, password) {
    try {
      const deviceId = utils.generateDeviceId();
      const response = await axios.post(
        `${CONFIG.BASE_URL}/users/login`,
        { email, password, device_id: deviceId, os: 'android' },
        { headers: CONFIG.HEADERS }
      );

      if (response.data.code !== 0) throw new Error(response.data.msg);

      return {
        token: response.data.data.biz_data.user.token,
        user: response.data.data.biz_data.user
      };
    } catch (error) {
      console.error(`Login error: ${error.message}`);
      return null;
    }
  },

  async createSession(token) {
    try {
      const response = await axios.post(
        `${CONFIG.BASE_URL}/chat_session/create`,
        {},
        { headers: { ...CONFIG.HEADERS, Authorization: `Bearer ${token}` } }
      );
      if (response.data.code !== 0) throw new Error('Failed to create session');
      return response.data.data.biz_data.id;
    } catch (error) {
      console.error(`Create session error: ${error.message}`);
      return null;
    }
  },

  async deleteSession(token, sessionId) {
    try {
      const response = await axios.post(
        `${CONFIG.BASE_URL}/chat_session/delete`,
        { chat_session_id: sessionId },
        { headers: { ...CONFIG.HEADERS, Authorization: `Bearer ${token}` } }
      );
      return response.data.code === 0;
    } catch (error) {
      console.error(`Delete session error: ${error.message}`);
      return false;
    }
  },

  async upload(token, filePath) {
    try {
      if (!fs.existsSync(filePath)) throw new Error('File not found');
      const stats = fs.statSync(filePath);
      const stream = fs.createReadStream(filePath);
      const powToken = await getPowToken(token, '/api/v0/file/upload_file');
      if (!powToken) throw new Error('Failed to solve PoW for upload');

      const form = new FormData();
      form.append('file', stream);

      const headers = {
        ...CONFIG.HEADERS,
        ...form.getHeaders(),
        Authorization: `Bearer ${token}`,
        'x-ds-pow-response': powToken,
        'x-file-size': stats.size.toString(),
        'x-thinking-enabled': '0'
      };

      const response = await axios.post(`${CONFIG.BASE_URL}/file/upload_file`, form, { headers });
      if (response.data.code !== 0) throw new Error('Upload init failed');

      const fileId = response.data.data.biz_data.id;
      let attempts = 0;
      const maxAttempts = 30;

      while (attempts < maxAttempts) {
        await utils.sleep(2000);
        const checkRes = await axios.get(`${CONFIG.BASE_URL}/file/fetch_files?file_ids=${fileId}`, {
          headers: { ...CONFIG.HEADERS, Authorization: `Bearer ${token}` }
        });

        if (checkRes.data.code === 0) {
          const fileData = checkRes.data.data.biz_data.files[0];
          if (fileData.status === 'SUCCESS') return fileId;
          if (fileData.status === 'FAILED') return null;
        }
        attempts += 1;
      }
      return null;
    } catch (error) {
      console.error(`Upload error: ${error.message}`);
      return null;
    }
  },

  async chat(token, sessionId, prompt, options = {}) {
    try {
      const useStream = options.stream !== false;
      const powToken = await getPowToken(token, '/api/v0/chat/completion');
      if (!powToken) throw new Error('Failed to solve PoW');

      const parentMid =
        options.parentMessageId != null && String(options.parentMessageId).trim() !== ''
          ? String(options.parentMessageId).trim()
          : null;

      const buildPayload = (includeParent) => {
        const p = {
          chat_session_id: sessionId,
          prompt,
          ref_file_ids: options.fileIds || [],
          thinking_enabled: options.thinkingEnabled || false,
          search_enabled: options.searchEnabled || false,
          audio_id: null
        };
        if (includeParent && parentMid) {
          const np = normalizeParentForApi(parentMid);
          if (np !== undefined) p.parent_message_id = np;
        }
        return p;
      };

      const postHeaders = {
        ...CONFIG.HEADERS,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-ds-pow-response': powToken
      };

      let clearedParentChain = false;
      let response;
      try {
        response = await axios.post(`${CONFIG.BASE_URL}/chat/completion`, buildPayload(true), {
          headers: postHeaders,
          responseType: 'stream'
        });
      } catch (err) {
        const st = err.response?.status;
        if (st === 422 && parentMid) {
          console.warn('[deepseek] chat/completion 422 — parent_message_id ditolak, ulang tanpa parent');
          clearedParentChain = true;
          response = await axios.post(`${CONFIG.BASE_URL}/chat/completion`, buildPayload(false), {
            headers: postHeaders,
            responseType: 'stream'
          });
        } else {
          throw err;
        }
      }

      if (process.env.DEEPSEEK_DEBUG_CHAT === '1') {
        const hdrs = { ...response.headers };
        if (hdrs.authorization) hdrs.authorization = '[REDACTED]';
        if (hdrs['set-cookie']) hdrs['set-cookie'] = '[REDACTED]';
        console.log('');
        console.log(
          '========== [deepseek] RESPONS ASLI DARI DEEPSEEK (upstream) — bukan PHP/api lokal =========='
        );
        console.log(
          '[deepseek] Endpoint:',
          `${CONFIG.BASE_URL}/chat/completion`,
          '(body stream = teks yang sama yang dikirim server DeepSeek ke klien)'
        );
        console.log('[deepseek] HTTP status:', response.status);
        console.log('[deepseek] Header (token disembunyikan):', hdrs);
        console.log(
          '[deepseek] Isi body mentah (SSE) akan dicetak di log saat stream selesai (lihat blok "BODY MENTAH").'
        );
        console.log('================================================================================');
      }

      let fullText = '';
      let thoughtText = '';
      let searchResults = [];
      let sessionTitle = '';
      let buffer = '';
      /** Seluruh body HTTP (untuk fallback jika bukan SSE atau parser SSE gagal). */
      let rawStreamAccum = '';
      /** Id pesan terakhir dari stream (untuk parent_message_id putaran berikutnya). */
      let streamLastMessageId = null;
      const thinkingOn = !!options.thinkingEnabled;

      const findFragmentType = (obj) => {
        if (obj.type === 'THINK' || obj.type === 'SEARCH' || obj.type === 'RESPONSE') return obj.type;
        if (Array.isArray(obj.v)) {
          for (const item of obj.v) {
            const found = findFragmentType(item);
            if (found) return found;
          }
        }
        return null;
      };

      /**
       * Kumpulkan teks dari pohon fragmen DeepSeek.
       * Penting: `v` bisa berisi string mentah per potongan stream; dulu kita mengembalikan ''
       * untuk typeof string → huruf pertama (mis. "B" dari "Berdasarkan") hilang di join().
       */
      const extractText = (obj) => {
        if (obj == null) return '';
        if (typeof obj === 'string') return obj;
        if (typeof obj !== 'object') return '';
        if (obj.content && typeof obj.content === 'string') return obj.content;
        /** Stream Android: {"p":".../content","o":"APPEND","v":"alo"} — v string, bukan objek. */
        if (typeof obj.v === 'string' && obj.p && typeof obj.p === 'string' && /fragment|content/i.test(obj.p)) {
          return obj.v;
        }
        /** Beberapa fragmen RESPONSE dalam satu objek = paragraf terpisah; join('') menyatukan tanpa jeda. */
        if (Array.isArray(obj.fragments)) {
          const parts = obj.fragments.map(extractText).filter((x) => x !== '');
          if (parts.length <= 1) return parts.join('');
          return parts.join('\n\n');
        }
        if (obj.response && typeof obj.response === 'object') {
          const r = extractText(obj.response);
          if (r) return r;
        }
        if (Array.isArray(obj.v)) return obj.v.map(extractText).join('');
        // DeepSeek kadang mengirim satu fragmen sebagai objek, bukan array:
        if (obj.v != null && typeof obj.v === 'object') return extractText(obj.v);
        return '';
      };

      /**
       * Pisahkan teks THINK vs jawaban menurut subtree `type`, bukan satu tipe global per chunk.
       * Kalau pakai findFragmentType + extractText sekaligus: elemen pertama di `v` bertipe THINK
       * membuat seluruh teks (termasuk huruf pertama RESPONSE) dianggap THINK → di UI terlihat
       * jawaban tanpa huruf pertama ("entu" bukan "Tentu").
       */
      const extractThinkingAndResponse = (root) => {
        let thinking = '';
        let response = '';
        const walk = (node, ctx) => {
          if (node == null) return;
          if (typeof node === 'string') {
            if (ctx === 'THINK') thinking += node;
            else response += node;
            return;
          }
          if (typeof node !== 'object') return;
          if (Array.isArray(node)) {
            for (const item of node) walk(item, ctx);
            return;
          }

          let nextCtx = ctx;
          if (node.type === 'THINK' || node.type === 'RESPONSE' || node.type === 'SEARCH') {
            nextCtx = node.type === 'THINK' ? 'THINK' : 'RESPONSE';
          }

          if (node.content && typeof node.content === 'string') {
            if (nextCtx === 'THINK') thinking += node.content;
            else response += node.content;
          }

          if (Array.isArray(node.v)) {
            for (const item of node.v) walk(item, nextCtx);
          } else if (node.v != null && typeof node.v === 'string') {
            walk(node.v, nextCtx);
          } else if (node.v != null && typeof node.v === 'object') {
            walk(node.v, nextCtx);
          }
          /** v.response.fragments (bukan hanya v: [...]) */
          if (node.response && typeof node.response === 'object') walk(node.response, nextCtx);
          if (Array.isArray(node.fragments)) {
            for (let fi = 0; fi < node.fragments.length; fi++) {
              const item = node.fragments[fi];
              if (
                fi > 0 &&
                nextCtx !== 'THINK' &&
                item?.type === 'RESPONSE' &&
                node.fragments[fi - 1]?.type === 'RESPONSE'
              ) {
                response += '\n\n';
              }
              walk(item, nextCtx);
            }
          }
        };
        walk(root, null);
        return { thinking, response };
      };

      /** Hanya penanda stream (FINISHED, [DONE]). Jangan anggap string kosong = kontrol:
       *  kalau tAdd="" tapi rAdd="Berdasarkan...", cek `isStreamControlString(tAdd)` dulu → true
       *  untuk '' membuat seluruh chunk di-skip → huruf pertama (sering di chunk terpisah) hilang. */
      const isStreamControlString = (s) => {
        if (typeof s !== 'string') return false;
        const t = s.trim();
        if (t === '') return false;
        if (t === '[DONE]') return true;
        return /^FINISHED+$/i.test(t);
      };

      const stripTrailingFinished = (s) =>
        (s || '').replace(/(?:FINISHED)+$/gi, '').trimEnd();

      /**
       * Tarik teks dari struktur DeepSeek yang tidak selalu memakai `v` di root (mis. data.biz_data, fragment).
       */
      const extractFallbackDeep = (root) => extractFallbackDeepStatic(root);

      const tryParseJsonPayload = (raw) => {
        const rawData = raw.replace(/^\uFEFF/, '').trim();
        if (!rawData || rawData === '[DONE]') return null;
        try {
          return JSON.parse(rawData);
        } catch {
          const lines = rawData.split('\n');
          const objs = [];
          for (const ln of lines) {
            const t = ln.trim();
            if (!t) continue;
            try {
              objs.push(JSON.parse(t));
            } catch {
              /* skip baris bukan-JSON */
            }
          }
          if (objs.length === 1) return objs[0];
          if (objs.length > 1) return { __multi: objs };
          return null;
        }
      };

      const processSseEvents = (events) => {
        for (const event of events) {
          if (!event.data || event.data === ':' || event.event === 'keep-alive') continue;

          if (event.event === 'title') {
            try {
              const titleData = JSON.parse(event.data.trim());
              sessionTitle = titleData.content;
            } catch {
              // Ignore malformed title payload
            }
            continue;
          }

          const rawData = event.data.replace(/^\uFEFF/, '').trim();
          if (rawData === '' || rawData === '[DONE]') continue;
          if (isStreamControlString(rawData)) continue;

          try {
            const parsedRoot = tryParseJsonPayload(rawData);
            if (parsedRoot == null) continue;

            const handleOneParsed = (parsed) => {
              // SSE kadang mengirim penanda selesai sebagai JSON string: "FINISHED" (dua event → "FINISHEDFINISHED").
              if (typeof parsed === 'string') {
                if (isStreamControlString(parsed)) return;
                fullText += parsed;
                return;
              }

              let resultsFound = null;
              if (parsed.p && parsed.p.endsWith('results') && Array.isArray(parsed.v)) {
                resultsFound = parsed.v;
              } else if (parsed.v && Array.isArray(parsed.v)) {
                const searchInV = (arr) => {
                  for (const item of arr) {
                    if (item.results && Array.isArray(item.results)) return item.results;
                    if (item.v && Array.isArray(item.v)) {
                      const found = searchInV(item.v);
                      if (found) return found;
                    }
                  }
                  return null;
                };
                resultsFound = searchInV(parsed.v);
              }

              if (resultsFound) searchResults = [...searchResults, ...resultsFound];

              const typed = extractThinkingAndResponse(parsed);
              let tAdd = stripTrailingFinished(typed.thinking);
              let rAdd = stripTrailingFinished(typed.response);

              if (tAdd === '' && rAdd === '') {
                let legacy = extractText(parsed);
                if (!legacy && typeof parsed.v === 'string') legacy = parsed.v;
                if (!legacy && typeof parsed.delta === 'string') legacy = parsed.delta;
                if (!legacy && typeof parsed.text === 'string') legacy = parsed.text;
                if (!legacy) legacy = extractFallbackDeep(parsed);
                if (legacy) {
                  const explicitType = findFragmentType(parsed);
                  if (thinkingOn && explicitType === 'THINK') tAdd = stripTrailingFinished(legacy);
                  else rAdd = stripTrailingFinished(legacy);
                }
              }

              if (isStreamControlString(tAdd) || isStreamControlString(rAdd)) return;

              if (thinkingOn) {
                if (tAdd) thoughtText += tAdd;
                if (rAdd) fullText += rAdd;
              } else {
                /** Mode berpikir mati: jangan buang tAdd jika rAdd juga ada.
                 * Satu chunk sering memecah THINK + RESPONSE; "else if (rAdd)" saja membuat
                 * huruf pertama (mis. "S" di tAdd) hilang → "aya kenal". */
                const merged = `${tAdd || ''}${rAdd || ''}`;
                if (merged) fullText += merged;
              }

              const mid = pickMessageIdFromChunk(parsed);
              if (mid) streamLastMessageId = mid;
            };

            if (parsedRoot && typeof parsedRoot === 'object' && Array.isArray(parsedRoot.__multi)) {
              for (const p of parsedRoot.__multi) handleOneParsed(p);
            } else {
              handleOneParsed(parsedRoot);
            }
          } catch {
            // Ignore malformed event payload
          }
        }
      };

      const flushBufferBlocks = () => {
        const normalized = buffer
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .replace(/^\uFEFF+/, '');
        /** Jangan split('\n\n') mentah: pola itu bisa muncul di dalam payload (JSON multi-baris
         *  atau teks) → event terpotong, JSON gagal, teks tergabung tanpa jeda baris. */
        const re = /\n\n(?=(?:data:|event:))/i;
        if (!re.test(normalized)) {
          buffer = normalized;
          return;
        }
        const chunks = normalized.split(re);
        buffer = chunks.pop() || '';
        for (const block of chunks) {
          if (block.trim()) processSseEvents(utils.parseSSE(`${block}\n\n`));
        }
      };

      return await new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => {
          const chunkStr =
            typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
          rawStreamAccum += chunkStr;
          buffer += chunkStr;
          flushBufferBlocks();
        });

        response.data.on('end', () => {
          if (buffer.trim()) {
            const tail = buffer
              .replace(/\r\n/g, '\n')
              .replace(/\r/g, '\n')
              .replace(/^\uFEFF+/, '');
            buffer = '';
            processSseEvents(utils.parseSSE(`${tail}\n\n`));
          }

          // Jangan .trim() penuh — bisa memotong format; cukup BOM + trim akhir (stripTrailingFinished sudah trimEnd).
          let reply = stripTrailingFinished((fullText || '').replace(/^\uFEFF/, '').trimEnd());
          if (!reply && rawStreamAccum.trim()) {
            const fb = extractReplyFromRawStream(rawStreamAccum);
            if (fb && fb.trim()) {
              fullText = fb;
              reply = stripTrailingFinished(fullText.replace(/^\uFEFF/, '').trimEnd());
            } else {
              console.error(
                '[deepseek] Jawaban kosong setelah SSE + fallback. Pratinjau body:',
                rawStreamAccum.slice(0, 1200)
              );
            }
          }
          if (!streamLastMessageId && rawStreamAccum) {
            const fromRaw = extractLastMessageIdFromRaw(rawStreamAccum);
            if (fromRaw) streamLastMessageId = fromRaw;
          }

          /** Stream Android sering mengirim markdown tanpa \\n — sisipkan jeda sebelum ---, ##, dll. */
          const replyBeforeGap = reply;
          reply = normalizeMarkdownStreamGaps(reply);
          const thinkingOut = normalizeMarkdownStreamGaps(
            stripTrailingFinished(thoughtText.replace(/^\uFEFF/, '').trimEnd())
          );

          logNewlineDiagnostics({
            phase: 'deepseek.js — fullText (sebelum trimEnd / stripTrailingFinished)',
            text: fullText,
            hint: 'Jika di sini sudah tidak ada \\n, stream mengirim satu baris / join("") — lalu cek reply setelah normalizeMarkdownStreamGaps.'
          });
          logNewlineDiagnostics({
            phase: 'deepseek.js — reply (setelah stripTrailingFinished, sebelum normalizeMarkdownStreamGaps)',
            text: replyBeforeGap,
            hint: 'Perbandingan dengan langkah berikut.'
          });
          logNewlineDiagnostics({
            phase: 'deepseek.js — reply (setelah normalizeMarkdownStreamGaps, dikirim ke proxy)',
            text: reply,
            hint: 'Jika jumlah \\n naik, penyisipan jeda markdown berhasil.'
          });
          if (thinkingOn && thoughtText) {
            logNewlineDiagnostics({
              phase: 'deepseek.js — thinking (panel berpikir)',
              text: thinkingOut,
              hint: 'Terpisah dari jawaban utama.'
            });
          }

          logThreadAfterStream({
            sessionId,
            parentMid,
            streamLastMessageId,
            clearedParentChain
          });

          if (process.env.DEEPSEEK_DEBUG_CHAT === '1') {
            const len = rawStreamAccum.length;
            const maxFull = 500000;
            console.log('');
            console.log(
              '========== [deepseek] BODY MENTAH RESPONS ASLI DEEPSEEK (SSE / text/event-stream) =========='
            );
            console.log(
              '[deepseek] rawStreamAccum = gabungan chunk byte dari response.data axios (tanpa ubah isi dari jaringan).'
            );
            console.log('[deepseek] Panjang body (char):', len);
            console.log('[deepseek] Setelah parser (fullText):', fullText.length, '| reply akhir:', reply.length);
            console.log('[deepseek] streamLastMessageId (ekstraksi):', streamLastMessageId);
            if (len <= maxFull) {
              console.log('[deepseek] ----- SELURUH BODY ASLI DARI DEEPSEEK (mulai) -----');
              console.log(rawStreamAccum);
              console.log('[deepseek] ----- SELURUH BODY ASLI DARI DEEPSEEK (selesai) -----');
            } else {
              console.log(`[deepseek] Body > ${maxFull} char — tampil AWAL + AKHIR masing-masing 250k`);
              console.log('[deepseek] ----- AWAL (250k) -----');
              console.log(rawStreamAccum.slice(0, 250000));
              console.log('[deepseek] ----- AKHIR (250k) -----');
              console.log(rawStreamAccum.slice(-250000));
            }
            if (process.env.DEEPSEEK_DEBUG_WRITE_RAW_FILE === '1') {
              try {
                const f = path.join(process.cwd(), 'deepseek-last-raw-response-from-upstream.txt');
                fs.writeFileSync(f, rawStreamAccum, 'utf8');
                console.log('[deepseek] Body asli juga disimpan ke file:', f);
              } catch (e) {
                console.warn('[deepseek] Gagal menulis file debug:', e?.message || e);
              }
            }
            console.log('================================================================================');
            console.log('');
          }

          if (useStream) resolve(reply || 'No response');
          else {
            resolve({
              status: 'success',
              session_title: sessionTitle,
              thinking: thinkingOut,
              search_results: searchResults,
              response: reply,
              lastMessageId: streamLastMessageId,
              clearParentMessageId: clearedParentChain
            });
          }
        });

        response.data.on('error', (error) => {
          if (useStream) reject(error);
          else resolve({ status: 'error', message: error.message });
        });
      });
    } catch (error) {
      console.error(`Chat error: ${error.message}`);
      return options.stream !== false ? null : { status: 'error', message: error.message };
    }
  }
};

export default deepseek;
