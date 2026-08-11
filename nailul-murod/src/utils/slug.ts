export function slugify(v: string) {
  return String(v || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
}

export function parseWiridIdFromSlug(v: string | undefined) {
  return Number((v || '').split('-').pop() || 0)
}
