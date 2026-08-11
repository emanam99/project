/** Animasi transisi halaman admin — nuansa app mobile (iOS-like spring) */
const ease = 'cubic-bezier(0.32, 0.72, 0, 1)';

export const adminPageTransition = {
  forwards: {
    old: {
      name: 'admin-page-out',
      duration: '0.2s',
      easing: ease,
      fillMode: 'forwards' as const,
    },
    new: {
      name: 'admin-page-in',
      duration: '0.32s',
      easing: ease,
      fillMode: 'backwards' as const,
    },
  },
  backwards: {
    old: {
      name: 'admin-page-out-back',
      duration: '0.2s',
      easing: ease,
      fillMode: 'forwards' as const,
    },
    new: {
      name: 'admin-page-in-back',
      duration: '0.32s',
      easing: ease,
      fillMode: 'backwards' as const,
    },
  },
};

export const adminHeaderTransition = {
  forwards: {
    old: { name: 'admin-header-out', duration: '0.16s', easing: ease, fillMode: 'forwards' as const },
    new: { name: 'admin-header-in', duration: '0.24s', easing: ease, fillMode: 'backwards' as const },
  },
  backwards: {
    old: { name: 'admin-header-out-back', duration: '0.16s', easing: ease, fillMode: 'forwards' as const },
    new: { name: 'admin-header-in-back', duration: '0.24s', easing: ease, fillMode: 'backwards' as const },
  },
};

export function cleanAdminTitle(raw: string): string {
  let t = raw.replace(/\s*[—–-]\s*TRI_LEADCLASS\s*/gi, '').trim();
  t = t.replace(/\s+Admin\s*$/i, '').trim();
  return t || 'Admin';
}
