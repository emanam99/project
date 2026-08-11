/**
 * Siluet kepala + bahu untuk panduan pas foto 3×4 (kamera & crop upload).
 * viewBox 0 0 100 133⅓ ≈ rasio 3:4; siluet di bagian atas agar wajah mengisi area pas foto.
 */
export default function PortraitGuideSilhouette({ className = '', strokeClassName = 'stroke-white/80' }) {
  return (
    <svg
      viewBox="0 0 100 133.33"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      aria-hidden
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Kepala */}
      <ellipse
        cx="50"
        cy="40"
        rx="17"
        ry="21"
        fill="none"
        className={strokeClassName}
        strokeWidth="1.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Leher singkat + bahu (siluet potret) */}
      <path
        d="M 43 59
           C 43 66, 41 70, 38 74
           C 28 84, 16 93, 10 100
           L 10 112
           L 90 112
           L 90 100
           C 84 93, 72 84, 62 74
           C 59 70, 57 66, 57 59"
        fill="none"
        className={strokeClassName}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
