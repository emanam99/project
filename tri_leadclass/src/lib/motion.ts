/** Konfigurasi animasi situs — transisi halaman & scroll (AOS) */

export const motionEase = 'cubic-bezier(0.32, 0.72, 0, 1)';

export const sitePageTransition = {
  forwards: {
    old: {
      name: 'site-page-out',
      duration: '0.22s',
      easing: motionEase,
      fillMode: 'forwards' as const,
    },
    new: {
      name: 'site-page-in',
      duration: '0.36s',
      easing: motionEase,
      fillMode: 'backwards' as const,
    },
  },
  backwards: {
    old: {
      name: 'site-page-out-back',
      duration: '0.22s',
      easing: motionEase,
      fillMode: 'forwards' as const,
    },
    new: {
      name: 'site-page-in-back',
      duration: '0.36s',
      easing: motionEase,
      fillMode: 'backwards' as const,
    },
  },
};

export const portalPageTransition = sitePageTransition;

export const AOS_DEFAULTS = {
  duration: 680,
  once: true,
  offset: 56,
  easing: 'ease-out-cubic',
  delay: 0,
} as const;
