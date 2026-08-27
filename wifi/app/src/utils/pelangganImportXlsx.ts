export type PelangganImportPayload = {
  nama: string
  email?: string | null
  no_hp?: string | null
  alamat?: string | null
  paket?: string | null
  keterangan?: string | null
  aktif?: boolean
}

export type PelangganImportRow = PelangganImportPayload & {
  /** Nomor baris Excel (1-based data, setelah header). */
  rowNumber: number
  ok: boolean
  errors: string[]
}

const HEADER_ALIASES: Record<keyof Omit<PelangganImportPayload, never>, string[]> = {
  nama: ['nama', 'name', 'pelanggan'],
  email: ['email', 'e-mail', 'mail'],
  no_hp: ['no hp', 'no_hp', 'hp', 'telepon', 'telp', 'no. hp', 'nomor hp', 'phone'],
  alamat: ['alamat', 'address'],
  paket: ['paket', 'package'],
  keterangan: ['keterangan', 'ket', 'catatan', 'note', 'notes'],
  aktif: ['aktif', 'status', 'active'],
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function normHeader(h: unknown): string {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Hindari notasi ilmiah untuk nomor HP dari Excel
    return String(v)
  }
  return String(v).trim()
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Parse nilai Aktif dari Excel. null = kosong (default aktif). */
export function parseAktifCell(raw: string): { ok: true; value: boolean | null } | { ok: false } {
  const s = raw.trim().toLowerCase()
  if (s === '') return { ok: true, value: null }
  if (['1', 'ya', 'yes', 'true', 'aktif', 'a', 'y'].includes(s)) return { ok: true, value: true }
  if (['0', 'tidak', 'no', 'false', 'nonaktif', 'non aktif', 'n'].includes(s)) {
    return { ok: true, value: false }
  }
  return { ok: false }
}

function mapHeaders(headers: unknown[]): Partial<Record<keyof PelangganImportPayload, number>> {
  const map: Partial<Record<keyof PelangganImportPayload, number>> = {}
  headers.forEach((h, i) => {
    const key = normHeader(h)
    if (!key) return
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [
      keyof PelangganImportPayload,
      string[],
    ][]) {
      if (map[field] !== undefined) continue
      if (aliases.includes(key)) {
        map[field] = i
      }
    }
  })
  return map
}

/** Unduh template Excel kosong + 1 baris contoh. */
export async function downloadPelangganTemplate(): Promise<void> {
  const XLSX = await import('xlsx')
  const rows = [
    {
      Nama: 'Budi Santoso',
      Email: 'budi@contoh.com',
      'No HP': '081234567890',
      Alamat: 'Jl. Contoh No. 1',
      Paket: '20 Mbps',
      Keterangan: '',
      Aktif: 1,
    },
    {
      Nama: '',
      Email: '',
      'No HP': '',
      Alamat: '',
      Paket: '',
      Keterangan: '',
      Aktif: '',
    },
  ]
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 22 },
    { wch: 26 },
    { wch: 16 },
    { wch: 28 },
    { wch: 14 },
    { wch: 20 },
    { wch: 8 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Pelanggan')

  const petunjuk = [
    { Kolom: 'Nama', Wajib: 'Ya', Keterangan: 'Nama pelanggan' },
    { Kolom: 'Email', Wajib: 'Tidak', Keterangan: 'Opsional; otomatis hubungkan/buat akun user' },
    { Kolom: 'No HP', Wajib: 'Tidak', Keterangan: '' },
    { Kolom: 'Alamat', Wajib: 'Tidak', Keterangan: '' },
    { Kolom: 'Paket', Wajib: 'Tidak', Keterangan: '' },
    { Kolom: 'Keterangan', Wajib: 'Tidak', Keterangan: '' },
    {
      Kolom: 'Aktif',
      Wajib: 'Tidak',
      Keterangan: '1/0, ya/tidak, aktif/nonaktif. Kosong = aktif',
    },
  ]
  const wsHint = XLSX.utils.json_to_sheet(petunjuk)
  wsHint['!cols'] = [{ wch: 14 }, { wch: 8 }, { wch: 48 }]
  XLSX.utils.book_append_sheet(wb, wsHint, 'Petunjuk')

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  downloadBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'template-pelanggan-wifi.xlsx',
  )
}

/** Baca file Excel → baris tervalidasi. */
export async function parsePelangganImportFile(file: File): Promise<PelangganImportRow[]> {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheetName =
    wb.SheetNames.find((n) => normHeader(n) === 'pelanggan') || wb.SheetNames[0]
  if (!sheetName) {
    throw new Error('File Excel tidak berisi sheet')
  }
  const sheet = wb.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][]

  if (!matrix.length) {
    throw new Error('Sheet kosong')
  }

  const headerRow = matrix[0] || []
  const col = mapHeaders(headerRow)
  if (col.nama === undefined) {
    throw new Error('Kolom "Nama" wajib ada di baris header')
  }

  const rawRows: PelangganImportRow[] = []
  for (let i = 1; i < matrix.length; i++) {
    const line = matrix[i] || []
    const get = (field: keyof PelangganImportPayload) => {
      const idx = col[field]
      if (idx === undefined) return ''
      return cellStr(line[idx])
    }

    const nama = get('nama')
    const email = get('email')
    const no_hp = get('no_hp')
    const alamat = get('alamat')
    const paket = get('paket')
    const keterangan = get('keterangan')
    const aktifRaw = get('aktif')

    // Lewati baris sepenuhnya kosong
    if (![nama, email, no_hp, alamat, paket, keterangan, aktifRaw].some((v) => v !== '')) {
      continue
    }

    const errors: string[] = []
    if (nama === '') errors.push('Nama wajib diisi')

    let emailNorm: string | null = null
    if (email !== '') {
      emailNorm = email.toLowerCase()
      if (!isValidEmail(emailNorm)) errors.push('Email tidak valid')
    }

    const aktifParsed = parseAktifCell(aktifRaw)
    if (!aktifParsed.ok) {
      errors.push('Aktif tidak dikenali (pakai 1/0, ya/tidak, aktif/nonaktif)')
    }

    rawRows.push({
      rowNumber: i + 1,
      nama,
      email: emailNorm,
      no_hp: no_hp || null,
      alamat: alamat || null,
      paket: paket || null,
      keterangan: keterangan || null,
      aktif: aktifParsed.ok ? (aktifParsed.value === null ? true : aktifParsed.value) : true,
      ok: errors.length === 0,
      errors,
    })
  }

  // Duplikat email dalam file
  const emailFirst = new Map<string, number>()
  for (const row of rawRows) {
    if (!row.email) continue
    const prev = emailFirst.get(row.email)
    if (prev === undefined) {
      emailFirst.set(row.email, row.rowNumber)
      continue
    }
    row.ok = false
    row.errors.push(`Email sama dengan baris ${prev}`)
  }

  return rawRows
}

export function pelangganImportPayloads(rows: PelangganImportRow[]): PelangganImportPayload[] {
  return rows
    .filter((r) => r.ok)
    .map((r) => ({
      nama: r.nama,
      email: r.email || null,
      no_hp: r.no_hp,
      alamat: r.alamat,
      paket: r.paket,
      keterangan: r.keterangan,
      aktif: r.aktif !== false,
    }))
}
