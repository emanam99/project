/**
 * Proxy ringkas untuk DeepSeek (PoW + chat) — dipanggil dari frontend eBeddien.
 * Jalankan: cd ai && npm install && npm start  (default port 3456)
 * VPS: DEEPSEEK_PROXY_PORT di .env (lihat deploy-ai-vps.ps1)
 */
import 'dotenv/config';
import express from 'express';
import { deepseek } from './deepseek.js';
import { logThreadProxyRoundtrip } from './thread-log.mjs';

const PORT = Number(process.env.DEEPSEEK_PROXY_PORT || 3456);

const app = express();
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Vary', 'Origin');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'deepseek-proxy' });
});

/** Body: { token } — token dari login DeepSeek */
app.post('/session', async (req, res) => {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token) {
      return res.status(400).json({ success: false, message: 'token wajib' });
    }
    const sessionId = await deepseek.createSession(token);
    if (!sessionId) {
      return res.status(502).json({ success: false, message: 'Gagal membuat sesi chat DeepSeek' });
    }
    return res.json({ success: true, data: { sessionId } });
  } catch (e) {
    console.error('session', e);
    return res.status(500).json({ success: false, message: 'Server proxy error' });
  }
});

/**
 * Body: { token, sessionId, prompt, thinkingEnabled?, searchEnabled? }
 * Membutuhkan waktu (PoW + streaming internal).
 */
app.post('/chat', async (req, res) => {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    const sessionId = req.body?.sessionId;
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    if (!token || !sessionId || !prompt) {
      return res.status(400).json({
        success: false,
        message: 'token, sessionId, dan prompt wajib diisi'
      });
    }
    const thinkingEnabled = !!req.body?.thinkingEnabled;
    const searchEnabled = !!req.body?.searchEnabled;
    const rawParent = req.body?.parentMessageId ?? req.body?.parent_message_id;
    const parentMessageId =
      rawParent != null && String(rawParent).trim() !== '' ? rawParent : undefined;

    const result = await deepseek.chat(token, sessionId, prompt, {
      stream: false,
      thinkingEnabled,
      searchEnabled,
      parentMessageId
    });

    const rawTurn = req.body?.clientUserTurn ?? req.body?._debugUserTurn;
    const clientUserTurn =
      rawTurn != null && rawTurn !== '' && !Number.isNaN(Number(rawTurn)) ? Number(rawTurn) : undefined;
    logThreadProxyRoundtrip({
      sessionId,
      parentMessageId,
      promptLen: prompt.length,
      promptPreview: prompt,
      result,
      clientUserTurn
    });

    /** Lokal: DEEPSEEK_DEBUG_CHAT=1 — body SSE mentah dari chat.deepseek.com ada di log [deepseek] di deepseek.js */
    if (process.env.DEEPSEEK_DEBUG_CHAT === '1') {
      try {
        console.log(
          '[deepseek-proxy] Objek JSON (hasil parse agregat, lokal) — untuk teks asli dari DeepSeek lihat log [deepseek] BODY MENTAH:',
          JSON.stringify(result, null, 2)
        );
      } catch {
        console.log('[deepseek-proxy] /chat result:', result);
      }
      console.log('[deepseek-proxy] /chat request meta:', {
        sessionId,
        parentMessageId: parentMessageId ?? null,
        promptLen: prompt.length
      });
    }

    if (result && typeof result === 'object' && result.status === 'error') {
      return res.status(502).json({
        success: false,
        message: result.message || 'Chat DeepSeek gagal',
        data: result
      });
    }

    return res.json({
      success: true,
      data: typeof result === 'object' && result !== null ? result : { response: String(result) }
    });
  } catch (e) {
    console.error('chat', e);
    return res.status(500).json({ success: false, message: e?.message || 'Server proxy error' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[deepseek-proxy] http://127.0.0.1:${PORT} (health: /health)`);
});
