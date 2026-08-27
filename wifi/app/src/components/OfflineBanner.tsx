import { useOnlineStatus } from '../hooks/useOnlineStatus'

type Props = {
  /** Absolute di atas viewport (login). Default: di dalam header sticky. */
  absolute?: boolean
  className?: string
}

/** Garis horizontal penanda offline di atas header / layar. */
export default function OfflineBanner({ absolute = false, className = '' }: Props) {
  const online = useOnlineStatus()
  if (online) return null

  return (
    <div
      className={[
        absolute ? 'absolute inset-x-0 top-0 z-30' : 'w-full',
        className,
      ].join(' ')}
      role="status"
      aria-live="polite"
      aria-label="Mode offline"
    >
      <div className="relative h-[3px] w-full overflow-hidden bg-amber-500/25">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400 animate-offline-pulse" />
      </div>
      <div className="flex items-center justify-center gap-1.5 bg-amber-500/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" aria-hidden />
        Offline
      </div>
    </div>
  )
}
