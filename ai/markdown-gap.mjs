/**
 * Stream chat.deepseek.com sering mengirim markdown tanpa karakter \n (satu baris panjang).
 * Sisipkan jeda sebelum penanda umum agar Markdown / remark-breaks bisa memformat.
 * Hanya dipakai bila teks masih "kurang" newline (heuristik).
 */

/** Jalankan satu putaran aturan; dua putaran menangkap pola yang saling bergantung. */
function applyMarkdownGapRules(s) {
  /**
   * Daftar markdown menempel satu baris:
   * - **Label:** [url](url)- **Label2:** …
   * - **Intro:**- **Item** …
   */
  s = s.replace(
    /\*\*([^*]+):\*\*(\[[^\]]+\]\([^)]+\))\s*-\s+(?=\*\*)/g,
    '**$1:**$2\n- '
  );
  s = s.replace(/\*\*([^*]+)\*\*:\s*-\s+(?=\*\*)/g, '**$1**:\n- ');
  s = s.replace(/\[[^\]]*\]\([^)]+\)\s*-\s+(?=\*\*)/g, (m) => m.replace(/\s*-\s+/, '\n- '));

  /** Tautan markdown menempel langsung ke kalimat berikutnya: ](url)Jika … */
  s = s.replace(
    /(\]\([^)]+\))(?=(Jika|Mohon|Anda|Apakah|Tentu|Silakan|Untuk|Namun|Bila|Ini)\b)/g,
    '$1\n\n'
  );

  /** --- sebagai HR menempel setelah : ; atau angka (sebelum ** atau teks) */
  s = s.replace(/([:;])(---+)(?=\*\*)/g, '$1\n\n$2');
  s = s.replace(/([^\n])(---+)(?=\*\*)/g, '$1\n\n$2');
  s = s.replace(/([\d.,])(---+)(?=[A-Za-zÀ-ÿ])/g, '$1\n\n$2');
  s = s.replace(/([:;])(---+)(?=[#\s-]|$)/g, '$1\n\n$2');
  s = s.replace(/([^\n])(---+)(#{1,6})/g, '$1\n\n$2$3');
  s = s.replace(/(---+)(#{1,6})/g, '$1\n\n$2');
  /** --- lalu kata pembuka (bukan ---https / URL) */
  s = s.replace(
    /(---+)(Setelah|Anda|Jika|Untuk|Mohon|Apakah|Berikut|Namun|Oleh|Tentu|Silakan|Bila|Ini)\b/g,
    '$1\n\n$2'
  );

  /** Heading ATX menempel setelah teks */
  s = s.replace(/([^\n#])(#{1,6}\s+)/g, '$1\n\n$2');

  /** **judul**### */
  s = s.replace(/\*\*([^*]+)\*\*(#{1,6}\d*)/g, '**$1**\n\n$2');

  /** Dua label bold menempel: **Status:****Kategori:** */
  s = s.replace(/\*\*([^*]+):\*\*(\*\*[^*]+:\*\*)/g, '**$1:**\n\n$2');

  /** (isi)- **Formal:** — daftar checklist (ada "-" sebelum **Label:**) */
  s = s.replace(/\)\s*-\s+\*\*([^*]+):\*\*/g, ')\n- **$1:**');

  /** )**Kategori:** — field berikut setelah tutup kurung (tanpa "-" di antara ) dan **) */
  s = s.replace(/\)\*\*([^*]+):\*\*/g, ')\n\n**$1:**');

  /**
   * Rupiah / ribuan lalu item bernomor bold: 500.000**3. Jika
   * Minimal 3 digit di kiri agar tidak memecah **2.** daftar.
   */
  s = s.replace(/([\d.,]{3,})(\*{2}\d+\.\s)/g, '$1\n\n$2');

  /** Kata Indonesia menempel angka (stream): atau5000 → atau 5000 */
  s = s.replace(/\b(atau|dan|ataupun)(\d)/gi, '$1 $2');

  /** Daftar "- " setelah titik/kolon */
  s = s.replace(/([.!?:])(-\s+\*\*)/g, '$1\n$2');

  /** **judul**- item daftar */
  s = s.replace(/\*\*([^*]+)\*\*(-\s)/g, '**$1**\n$2');

  /** Kalimat: ).Silakan / ).Anda (setelah tutup kurung + titik + kata besar Indonesia umum) */
  s = s.replace(
    /\)\.(Silakan|Anda|Tentu|Jika|Untuk|Mohon|Setelah|Apakah|Berikut|Namun|Oleh)/g,
    ').\n\n$1'
  );

  return s;
}

export function normalizeMarkdownStreamGaps(text) {
  if (text == null || typeof text !== 'string') return text;
  let s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const n = (s.match(/\n/g) || []).length;
  const avgLine = s.length / Math.max(n + 1, 1);
  /** Sudah banyak baris pendek → jangan ubah */
  if (n >= 40 && avgLine < 90) return s;

  s = applyMarkdownGapRules(s);
  s = applyMarkdownGapRules(s);
  return s;
}
