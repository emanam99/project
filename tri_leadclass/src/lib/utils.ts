export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

/** Pecah teks menjadi paragraf; dukung baris kosong dan baris tunggal antar-paragraf. */
export function toParagraphs(content: string | null | undefined): string[] {
  if (!content) return [];
  const text = content.replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const paragraphs: string[] = [];

  for (const block of blocks) {
    if (block.includes('\n')) {
      for (const line of block.split(/\n/)) {
        const p = line.replace(/\s+/g, ' ').trim();
        if (p) paragraphs.push(p);
      }
    } else {
      const p = block.replace(/\s+/g, ' ').trim();
      if (p) paragraphs.push(p);
    }
  }

  return paragraphs;
}

/** Kelas font judul artikel — mengecil otomatis jika judul panjang. */
export function articleTitleClass(
  title: string,
  variant: 'hero' | 'featured' | 'card' | 'compact' = 'hero',
): string {
  const len = title.length;
  const base = 'font-serif font-bold text-slate-900 leading-tight';

  if (variant === 'hero') {
    if (len > 110) return `${base} text-2xl sm:text-3xl md:text-4xl`;
    if (len > 75) return `${base} text-3xl sm:text-4xl md:text-[2.65rem]`;
    if (len > 48) return `${base} text-3xl md:text-4xl lg:text-5xl`;
    return `${base} text-4xl md:text-5xl lg:text-6xl font-black leading-[1.12]`;
  }

  if (variant === 'featured') {
    if (len > 90) return `${base} text-2xl md:text-3xl`;
    if (len > 55) return `${base} text-2xl md:text-4xl`;
    return `${base} text-3xl md:text-5xl`;
  }

  if (variant === 'card') {
    if (len > 85) return `${base} text-base leading-snug`;
    if (len > 55) return `${base} text-lg leading-snug`;
    return `${base} text-xl`;
  }

  if (len > 70) return `${base} text-sm leading-snug`;
  return `${base} text-base leading-snug`;
}

/** Abstrak/excerpt multi-paragraf untuk tampilan web. */
export function formatExcerptParagraphs(text: string | null | undefined): string[] {
  return toParagraphs(text);
}

/** Tampilan jumlah view artikel (Bahasa Indonesia) */
export function formatViewCount(views: number): string {
  const n = Math.max(0, views);
  return `${n.toLocaleString('id-ID')} dilihat`;
}
