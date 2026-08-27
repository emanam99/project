import { usePwaInstallPrompt } from '../hooks/usePwaInstallPrompt'

type Variant = 'default' | 'header' | 'login'

type Props = {
  className?: string
  /** @deprecated pakai variant="header" */
  compact?: boolean
  variant?: Variant
}

function DownloadIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 3v12" strokeLinecap="round" />
      <path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" strokeLinecap="round" />
    </svg>
  )
}

function PhoneIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path strokeLinecap="round" d="M11 18.5h2" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8.5v4m0 0 2-1.5M12 12.5l-2-1.5"
        opacity="0.9"
      />
    </svg>
  )
}

export default function PwaInstallButton({ className = '', compact = false, variant }: Props) {
  const { canInstall, promptInstall } = usePwaInstallPrompt()
  const resolved: Variant = variant ?? (compact ? 'header' : 'default')

  if (!canInstall) return null

  if (resolved === 'login') {
    return (
      <button
        type="button"
        onClick={() => void promptInstall()}
        className={[
          'group relative w-full overflow-hidden rounded-2xl border-2 border-[var(--accent)]',
          'bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))] px-4 py-3.5 text-left',
          'shadow-[0_10px_28px_-14px_color-mix(in_srgb,var(--accent)_55%,transparent)]',
          'transition hover:bg-[color-mix(in_srgb,var(--accent)_18%,var(--surface))]',
          'active:scale-[0.99]',
          className,
        ].join(' ')}
        title="Install aplikasi Wifi ke HP / desktop"
      >
        <span className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-sm">
            <PhoneIcon className="h-[22px] w-[22px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold text-ink leading-tight">Install aplikasi</span>
            <span className="block text-[11.5px] text-muted mt-0.5 leading-snug">
              Pasang di HP — buka seperti app, tanpa browser
            </span>
          </span>
          <DownloadIcon className="h-5 w-5 shrink-0 text-[var(--accent)]" />
        </span>
      </button>
    )
  }

  if (resolved === 'header') {
    return (
      <button
        type="button"
        onClick={() => void promptInstall()}
        className={[
          'inline-flex items-center gap-1.5 h-9 rounded-lg px-2.5 sm:px-3',
          'bg-[var(--accent)] text-white text-[12px] sm:text-[13px] font-bold',
          'shadow-sm shadow-[color-mix(in_srgb,var(--accent)_35%,transparent)]',
          'hover:bg-[var(--accent-hover)] transition active:scale-[0.98]',
          className,
        ].join(' ')}
        title="Install aplikasi Wifi"
        aria-label="Install aplikasi Wifi"
      >
        <DownloadIcon className="h-4 w-4" />
        <span>Install</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void promptInstall()}
      className={[
        'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg',
        'bg-[var(--accent)] text-white text-[13px] font-bold',
        'shadow-sm hover:bg-[var(--accent-hover)] transition',
        className,
      ].join(' ')}
      title="Install aplikasi Wifi"
    >
      <DownloadIcon />
      Install aplikasi
    </button>
  )
}
