/**
 * Kunci ingatan per kontak: biasanya digit nomor WA (10–15), atau JID penuh untuk @lid tanpa pn.
 */

function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}

/** Dari nilai relay (628...@c.us atau 6285...) → kunci scope untuk DB. */
function scopeKeyFromRelayTarget(targetVal) {
  const v = String(targetVal || '').trim();
  if (!v) return null;
  if (v.includes('@')) {
    const part = v.split('@')[0] || '';
    const d = digitsOnly(part.split(':')[0]);
    if (d.length >= 10 && d.length <= 15) return d;
    return null;
  }
  const d = digitsOnly(v);
  if (d.length >= 10 && d.length <= 15) return d;
  return null;
}

/** Untuk .aktifnomor / menu .atur: scope ingatan → JID yang dipakai getAliasBundle. */
function scopeKeyToAssistantJid(scopeKey) {
  const sk = String(scopeKey || '');
  if (!sk || sk === 'legacy_global') return null;
  if (/^\d{10,15}$/.test(sk)) return `${sk}@c.us`;
  if (sk.includes('@')) return sk;
  return null;
}

/** Dari canonical chat WA (mis. 628...@c.us atau @lid). */
function memoryScopeKeyFromCanonical(canonical) {
  if (!canonical || typeof canonical !== 'string') return '__unknown__';
  const at = canonical.indexOf('@');
  if (at < 0) {
    const d = digitsOnly(canonical);
    return d.length >= 10 && d.length <= 15 ? d : canonical;
  }
  const local = canonical.slice(0, at);
  const domain = canonical.slice(at + 1).toLowerCase();
  const d = digitsOnly(local.split(':')[0]);
  if (domain === 'c.us' && d.length >= 10 && d.length <= 15) return d;
  return canonical;
}

module.exports = {
  digitsOnly,
  scopeKeyFromRelayTarget,
  scopeKeyToAssistantJid,
  memoryScopeKeyFromCanonical,
};
