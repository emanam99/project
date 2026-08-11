/**
 * Ikon centang ala WA untuk pesan sendiri (bubble gelap): terkirim / diterima / dibaca.
 * @param {'pending'|'failed'|'sent'|'delivered'|'read'} phase
 */
export default function MessageStatusIcon({ phase }) {
  const iconClass = 'h-3.5 w-3.5 shrink-0 inline-block'

  if (phase === 'pending') {
    return (
      <span className="inline-flex shrink-0 text-white/80" title="Mengirim…" aria-label="Mengirim">
        <svg className={`${iconClass} animate-pulse`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </span>
    )
  }
  if (phase === 'failed') {
    return (
      <span className="inline-flex shrink-0 text-red-200" title="Gagal mengirim" aria-label="Gagal mengirim">
        <svg className={iconClass} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
        </svg>
      </span>
    )
  }
  if (phase === 'read') {
    return (
      <span className="inline-flex shrink-0" title="Dibaca (centang biru)" aria-label="Dibaca">
        <svg
          className={`${iconClass} text-sky-200`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 16 12"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M1.5 6L4 8.5L9 2" />
          <path d="M6.5 6L9 8.5L14.5 2" />
        </svg>
      </span>
    )
  }
  if (phase === 'delivered') {
    return (
      <span className="inline-flex shrink-0 text-white/90" title="Diterima (centang 2)" aria-label="Diterima ke perangkat">
        <svg
          className={iconClass}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 16 12"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M1.5 6L4 8.5L9 2" />
          <path d="M6.5 6L9 8.5L14.5 2" />
        </svg>
      </span>
    )
  }
  return (
    <span className="inline-flex shrink-0 text-white/90" title="Terkirim (centang 1)" aria-label="Terkirim ke server">
      <svg className={iconClass} fill="currentColor" viewBox="0 0 20 20" aria-hidden>
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
    </span>
  )
}
