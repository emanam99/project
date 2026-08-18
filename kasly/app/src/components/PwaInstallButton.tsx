import { usePwaInstallPrompt } from '../hooks/usePwaInstallPrompt'

type Props = {
  className?: string
  /** compact = ikon saja (header HP) */
  compact?: boolean
}

function DownloadIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 3v12" strokeLinecap="round" />
      <path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" strokeLinecap="round" />
    </svg>
  )
}

export default function PwaInstallButton({ className = '', compact = false }: Props) {
  const { canInstall, promptInstall } = usePwaInstallPrompt()

  if (!canInstall) return null

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => void promptInstall()}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink hover:bg-surface-soft transition ${className}`}
        title="Install aplikasi Kasly"
        aria-label="Install aplikasi Kasly"
      >
        <DownloadIcon />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void promptInstall()}
      className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-line bg-surface text-[13px] font-semibold text-ink hover:bg-surface-soft transition ${className}`}
      title="Install aplikasi Kasly"
    >
      <DownloadIcon />
      Install
    </button>
  )
}
