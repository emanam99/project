/**
 * Kolom yang boleh dirujuk dalam rumus (hanya yang "di atas" kolom yang sedang diedit).
 * @param {Array<{ id: number, col_key: string, label: string, sort_order: number }>} kolomRows
 * @param {{ sort_order: string|number, _editId: number|null, col_key?: string }} formKolom
 * @returns {Array<{ col_key: string, label: string, kind?: string }>}
 */
export function buildRumusColumnSuggestions(kolomRows, formKolom) {
  if (!Array.isArray(kolomRows) || kolomRows.length === 0) return []

  const sorted = [...kolomRows].sort((a, b) => {
    const d = (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
    if (d !== 0) return d
    return (Number(a.id) || 0) - (Number(b.id) || 0)
  })

  const editId = formKolom._editId
  if (editId) {
    const idx = sorted.findIndex((r) => r.id === editId)
    if (idx <= 0) return []
    return sorted.slice(0, idx).map((r) => ({
      col_key: r.col_key,
      label: r.label || r.col_key,
      kind: r.kind
    }))
  }

  const curSo = Number(formKolom.sort_order) || 0
  return sorted
    .filter((r) => (Number(r.sort_order) || 0) < curSo)
    .map((r) => ({
      col_key: r.col_key,
      label: r.label || r.col_key,
      kind: r.kind
    }))
}

const MAX_SUGGEST = 8

/** Daftar fungsi rumus Bisyaroh (selaras API). Argumen dipisah ; */
export const BISYAROH_FORMULA_FUNCTIONS = [
  { name: 'IF', args: ['kondisi (1/0)', 'nilai jika benar', 'nilai jika salah'], desc: 'Kondisi ≠ 0 dianggap benar.' },
  { name: 'SUM', args: ['nilai 1', 'nilai 2', '…'], variadic: true, desc: 'Jumlah semua argumen.' },
  { name: 'AVERAGE', aliases: ['AVG'], args: ['nilai 1', '…'], variadic: true, desc: 'Rata-rata.' },
  { name: 'MIN', args: ['nilai 1', '…'], variadic: true, desc: 'Nilai minimum.' },
  { name: 'MAX', args: ['nilai 1', '…'], variadic: true, desc: 'Nilai maksimum.' },
  { name: 'ABS', args: ['angka'], desc: 'Nilai mutlak.' },
  { name: 'ROUND', args: ['angka', 'digit (opsional)'], maxArgs: 2, desc: 'Pembulatan.' },
  { name: 'FLOOR', args: ['angka'], desc: 'Pembulatan ke bawah.' },
  { name: 'CEIL', args: ['angka'], desc: 'Pembulatan ke atas.' },
  { name: 'MOD', args: ['angka', 'pembagi'], desc: 'Sisa bagi.' },
  { name: 'POWER', aliases: ['POW'], args: ['basis', 'eksponen'], desc: 'Pangkat.' },
  { name: 'PERCENT', args: ['bagian', 'total'], desc: 'Persen: bagian ÷ total × 100.' },
  { name: 'AND', args: ['kondisi 1', '…'], variadic: true, desc: 'Semua argumen benar (1).' },
  { name: 'OR', args: ['kondisi 1', '…'], variadic: true, desc: 'Salah satu benar (1).' },
  { name: 'NOT', args: ['kondisi'], desc: 'Negasi (1→0, 0→1).' },
  {
    name: 'HASJABATAN',
    args: ['"nama jabatan"'],
    desc: '1 jika jabatan aktif mengandung teks (abaikan huruf besar/kecil).'
  },
  {
    name: 'CONTAINS',
    args: ['@pengurus[kolom], @jabatan[kolom], atau @[kolom]', '"teks"'],
    desc: '1 jika teks kolom mengandung substring (abaikan huruf besar/kecil).'
  },
  {
    name: 'ISEMPTY',
    aliases: ['BLANK'],
    args: ['@pengurus[kolom], @jabatan[kolom], @pj[kolom], atau @[kolom]'],
    desc: '1 jika kolom kosong (termasuk kolom input/rumus di atas).'
  },
  {
    name: 'LEN',
    args: ['@pengurus[kolom], @jabatan[kolom], @pj[kolom], atau @[kolom]'],
    desc: 'Panjang teks UTF-8. Perbandingan di luar LEN: IF(LEN(@[k]) > 8; …; …).'
  },
  {
    name: 'YEAR / TAHUN',
    args: ['rujukan tanggal'],
    desc: 'Ambil tahun (4 digit). Rujukan: @[kolom], @pengurus[…], @pj[tanggal_mulai], "2024-06-15".'
  },
  {
    name: 'MONTH / BULAN',
    args: ['rujukan tanggal'],
    desc: 'Ambil bulan (1–12).'
  },
  {
    name: 'DAY / TANGGAL',
    args: ['rujukan tanggal'],
    desc: 'Ambil tanggal/hari dalam bulan (1–31).'
  },
  {
    name: 'DATEVAL / TGLVAL',
    args: ['rujukan tanggal'],
    desc: 'Ubah tanggal jadi angka serial (hari). Kurangi dua DATEVAL untuk selisih hari: DATEVAL(@[a]) - DATEVAL(@[b]).'
  },
  {
    name: 'DATE / TGL',
    args: ['tahun', 'bulan', 'tanggal'],
    desc: 'Bangun tanggal dari angka: DATE(2024; 6; 15).'
  },
  {
    name: 'DAYS',
    args: ['tgl_akhir', 'tgl_awal'],
    desc: 'Selisih hari (akhir − awal). Contoh: DAYS(@pj[tanggal_selesai]; @pj[tanggal_mulai]).'
  },
  {
    name: 'DATEDIF',
    args: ['tgl_awal', 'tgl_akhir', 'satuan'],
    desc: 'Selisih D/HARI (hari), M/BULAN (bulan penuh), Y/TAHUN (tahun penuh).'
  },
  {
    name: 'DATEADD',
    args: ['tgl', 'n', 'satuan'],
    desc: 'Tambah/kurangi hari/bulan/tahun: DATEADD(@pj[tanggal_mulai]; 30; "D").'
  }
]

const FN_BY_NAME = new Map()
for (const fn of BISYAROH_FORMULA_FUNCTIONS) {
  FN_BY_NAME.set(fn.name, fn)
  for (const a of fn.aliases || []) {
    FN_BY_NAME.set(a, fn)
  }
}

export function getFormulaFunctionDef(name) {
  return FN_BY_NAME.get(String(name || '').toUpperCase()) || null
}

/**
 * @param {string} text
 * @param {number} cursorPos
 * @returns {{ start: number, filter: string } | null}
 */
export function parseOpenAtMention(text, cursorPos) {
  const before = text.slice(0, cursorPos)
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  const afterAt = before.slice(at + 1)
  if (afterAt.includes('[')) return null
  if (!/^[a-zA-Z0-9_]*$/.test(afterAt)) return null
  return { start: at, filter: afterAt }
}

/**
 * @param {string} text
 * @param {number} cursorPos
 * @returns {{ start: number, filter: string, kind: 'kolom'|'pengurus'|'jabatan'|'pj' } | null}
 */
export function parseAnyRumusMention(text, cursorPos) {
  const nsPatterns = [
    { kind: 'pengurus_jabatan', prefix: '@pengurus_jabatan[' },
    { kind: 'pj', prefix: '@pj[' },
    { kind: 'pengurus', prefix: '@pengurus[' },
    { kind: 'jabatan', prefix: '@jabatan[' }
  ]
  const before = text.slice(0, cursorPos)
  for (const { kind, prefix } of nsPatterns) {
    const idx = before.lastIndexOf(prefix)
    if (idx >= 0) {
      const tail = before.slice(idx + prefix.length)
      if (/^[a-zA-Z0-9_]*$/.test(tail)) {
        return { start: idx, filter: tail, kind }
      }
    }
  }
  const k = parseOpenAtMention(text, cursorPos)
  if (k) return { ...k, kind: 'kolom' }
  return null
}

/**
 * Mengetik nama fungsi (huruf) untuk autocomplete.
 * @param {string} text
 * @param {number} cursorPos
 */
export function parseFunctionTyping(text, cursorPos) {
  if (isInsideString(text, cursorPos)) return null
  const before = text.slice(0, cursorPos)
  const m = before.match(/(?:^|[^A-Za-z0-9_])([A-Za-z][A-Za-z0-9_]*)$/)
  if (!m) return null
  const filter = m[1]
  const start = cursorPos - filter.length
  return { start, filter }
}

/**
 * @param {Array<{ key: string, label: string }>} fields dari API
 * @param {string} filter
 */
export function filterPengurusFieldsForRumus(fields, filter) {
  if (!Array.isArray(fields) || fields.length === 0) return []
  const mapped = fields.map((f) => ({
    col_key: f.key,
    label: f.label || f.key
  }))
  return filterRumusSuggestions(mapped, filter)
}

export function filterRumusSuggestions(suggestions, filter) {
  const f = (filter || '').toLowerCase()
  const scored = suggestions.map((s) => {
    const k = (s.col_key || '').toLowerCase()
    const l = (s.label || '').toLowerCase()
    let score = 100
    if (f) {
      if (k.startsWith(f)) score = 0
      else if (k.includes(f)) score = 1
      else if (l.includes(f)) score = 2
      else score = 999
    }
    return { s, score }
  })
  return scored
    .filter((x) => x.score < 999)
    .sort((a, b) => a.score - b.score || a.s.col_key.localeCompare(b.s.col_key))
    .slice(0, MAX_SUGGEST)
    .map((x) => x.s)
}

export function filterFunctionSuggestions(filter) {
  const f = (filter || '').toUpperCase()
  const list = []
  const seen = new Set()
  for (const fn of BISYAROH_FORMULA_FUNCTIONS) {
    if (seen.has(fn.name)) continue
    seen.add(fn.name)
    const names = [fn.name, ...(fn.aliases || [])]
    let score = 100
    for (const n of names) {
      if (!f) score = 0
      else if (n.startsWith(f)) score = Math.min(score, 0)
      else if (n.includes(f)) score = Math.min(score, 1)
      else score = 999
    }
    if (score < 999) {
      list.push({ fn, score, insertName: fn.name })
    }
  }
  return list
    .sort((a, b) => a.score - b.score || a.insertName.localeCompare(b.insertName))
    .slice(0, MAX_SUGGEST)
    .map((x) => x)
}

/** @param {'pengurus'|'jabatan'|'pj'|'pengurus_jabatan'} kind */
export function rumusRefPrefix(kind) {
  if (kind === 'pengurus') return '@pengurus['
  if (kind === 'jabatan') return '@jabatan['
  if (kind === 'pj' || kind === 'pengurus_jabatan') return kind === 'pj' ? '@pj[' : '@pengurus_jabatan['
  return '@['
}

function isInsideString(text, pos) {
  let inStr = false
  let esc = false
  for (let i = 0; i < pos; i++) {
    const ch = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
  }
  return inStr
}

/**
 * @param {string} text
 * @returns {Array<{ name: string, open: number, close: number }>}
 */
function findFunctionCalls(text) {
  const calls = []
  const stack = []
  let inStr = false
  let esc = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') {
      inStr = true
      continue
    }
    if (ch === '(') {
      let j = i - 1
      while (j >= 0 && /\s/.test(text[j])) j--
      const nameEnd = j + 1
      while (j >= 0 && /[A-Za-z0-9_]/.test(text[j])) j--
      const rawName = text.slice(j + 1, nameEnd)
      const name = rawName.toUpperCase()
      const def = getFormulaFunctionDef(name)
      stack.push({ open: i, close: -1, name: def ? def.name : null })
      continue
    }
    if (ch === ')' && stack.length > 0) {
      const frame = stack.pop()
      frame.close = i
      if (frame.name != null) calls.push(frame)
    }
  }
  return calls
}

/**
 * @param {string} text
 * @param {number} open
 * @param {number} close
 * @returns {Array<{ start: number, end: number }>}
 */
function splitFunctionArgs(text, open, close) {
  const spans = []
  let start = open + 1
  let depth = 0
  let inStr = false
  let esc = false

  for (let i = open + 1; i < close; i++) {
    const ch = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') {
      inStr = true
      continue
    }
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ';' && depth === 0) {
      spans.push({ start, end: i })
      start = i + 1
    }
  }
  spans.push({ start, end: close })
  return spans
}

/**
 * Konteks argumen fungsi di posisi kursor (untuk tooltip & highlight).
 * @param {string} text
 * @param {number} cursorPos
 */
export function parseFormulaArgContext(text, cursorPos) {
  const pos = Math.max(0, Math.min(cursorPos, text.length))
  const calls = findFunctionCalls(text)
  const containing = calls
    .filter((c) => pos > c.open && pos <= c.close)
    .sort((a, b) => b.open - a.open)
  const call = containing[0]
  if (!call) return null

  const def = getFormulaFunctionDef(call.name)
  if (!def) return null

  const argSpans = splitFunctionArgs(text, call.open, call.close)
  let argIndex = 0
  for (let i = 0; i < argSpans.length; i++) {
    const sp = argSpans[i]
    if (pos >= sp.start && pos <= sp.end) {
      argIndex = i
      break
    }
    if (i < argSpans.length - 1 && pos > sp.end && pos < argSpans[i + 1].start) {
      argIndex = i + 1
      break
    }
  }

  const argSpan = argSpans[argIndex] || argSpans[argSpans.length - 1]
  const totalArgs = def.variadic ? Math.max(def.args.length, argSpans.length) : def.args.length
  const argLabel = def.variadic
    ? argIndex < def.args.length - 1
      ? def.args[argIndex]
      : def.args[def.args.length - 1]
    : def.args[argIndex] || `argumen ${argIndex + 1}`

  const signatureParts = []
  for (let i = 0; i < Math.max(def.args.length, argSpans.length); i++) {
    let label = def.variadic && i >= def.args.length - 1 ? def.args[def.args.length - 1] : def.args[i]
    if (!label) label = `arg ${i + 1}`
    signatureParts.push({ label, argIndex: i })
  }
  if (!def.variadic && def.maxArgs) {
    while (signatureParts.length > def.maxArgs) signatureParts.pop()
  }

  return {
    fnName: def.name,
    fnDesc: def.desc || '',
    argIndex,
    argTotal: def.variadic ? null : totalArgs,
    argLabel,
    argStart: argSpan?.start ?? call.open + 1,
    argEnd: argSpan?.end ?? call.close,
    callOpen: call.open,
    callClose: call.close,
    signatureParts: def.variadic
      ? [
          ...def.args.slice(0, -1).map((label, i) => ({ label, argIndex: i })),
          ...argSpans.slice(def.args.length - 1).map((_, j) => ({
            label: def.args[def.args.length - 1],
            argIndex: def.args.length - 1 + j
          }))
        ]
      : def.args.map((label, i) => ({ label, argIndex: i }))
  }
}

/**
 * Segmen teks untuk overlay highlight (argumen aktif = bold).
 * @returns {Array<{ text: string, bold: boolean }>}
 */
export function buildFormulaHighlightSegments(text, cursorPos) {
  const ctx = parseFormulaArgContext(text, cursorPos)
  if (!ctx || ctx.argStart == null || ctx.argEnd == null) {
    return [{ text, bold: false }]
  }
  const segs = []
  if (ctx.argStart > 0) segs.push({ text: text.slice(0, ctx.argStart), bold: false })
  segs.push({ text: text.slice(ctx.argStart, ctx.argEnd), bold: true })
  if (ctx.argEnd < text.length) segs.push({ text: text.slice(ctx.argEnd), bold: false })
  return segs
}

export function escapeHtmlRumus(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
