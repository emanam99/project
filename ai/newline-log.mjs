/**
 * Deteksi / log karakter baris baru dalam teks agregat (DeepSeek → proxy).
 * Aktifkan: DEEPSEEK_DEBUG_NEWLINES=1 di .env (folder ai)
 */

export function enabled() {
  return process.env.DEEPSEEK_DEBUG_NEWLINES === '1';
}

/**
 * @param {{ phase: string, text: string | null | undefined, hint?: string }} ctx
 */
export function logNewlineDiagnostics(ctx) {
  if (!enabled()) return;
  const { phase, text, hint } = ctx;
  const s = text == null ? '' : String(text);
  const n = (s.match(/\n/g) || []).length;
  const dbl = (s.match(/\n\n+/g) || []).length;
  const cr = (s.match(/\r/g) || []).length;
  const tabs = (s.match(/\t/g) || []).length;
  const maxPreview = 500;
  let preview = s;
  if (s.length > maxPreview) {
    preview = `${s.slice(0, 250)}\n… [potong ${s.length - maxPreview} char] …\n${s.slice(-250)}`;
  }
  const escaped = preview.replace(/\r\n/g, '\\r\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\r');

  console.log('');
  console.log(`========== [newline] ${phase} ==========`);
  if (hint) console.log('[newline] catatan:', hint);
  console.log('[newline] panjang (char):', s.length);
  console.log('[newline] jumlah \\n:', n, '| blok \\n\\n+ (paragraf):', dbl, '| \\r:', cr, '| tab:', tabs);

  const issues = [];
  if (s.length > 200 && n === 0) {
    issues.push(
      'Teks panjang tanpa satupun \\n — kemungkinan: stream digabung join("") tanpa jeda, atau model memang satu baris.'
    );
  }
  if (cr > 0 && !s.includes('\n') && s.includes('\r')) {
    issues.push('Hanya \\r tanpa \\n — normalisasi \\r\\n → \\n disarankan di UI.');
  }
  if (dbl === 0 && n >= 3 && s.length > 300) {
    issues.push(
      'Banyak \\n tunggal tapi tidak ada \\n\\n — di Markdown, remark-breaks menampilkan \\n sebagai baris baru; paragraf butuh \\n\\n.'
    );
  }
  if (issues.length) {
    issues.forEach((msg) => console.warn('[newline] ⚠', msg));
  } else {
    console.log('[newline] ✓ Tidak ada flag newline yang mencurigakan (heuristik).');
  }

  console.log('[newline] pratinjau (newline di-escape):');
  console.log(escaped);
  console.log('========================================');
}
