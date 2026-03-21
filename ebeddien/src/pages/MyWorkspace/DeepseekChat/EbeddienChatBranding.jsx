import { getGambarUrl } from '../../../config/images'

/** Logo ikon (sama seperti sidebar tertutup) */
export function EbeddienChatAvatarLogo({ loading, className = '' }) {
  return (
    <span
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15 ring-2 ring-white/25 ${className}`}
      aria-hidden
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
      ) : (
        <img
          src={getGambarUrl('/icon/ebeddienlogoputih.png')}
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 object-contain"
        />
      )}
    </span>
  )
}

/** Logo teks (sama seperti sidebar terbuka) — menggantikan nama teks */
export function EbeddienChatWordmark({ assistantName, className = '' }) {
  return (
    <img
      src={getGambarUrl('/icon/ebeddientextputih.png')}
      alt={assistantName}
      className={`h-7 w-auto max-w-[min(100%,15rem)] object-contain object-left sm:h-8 ${className}`}
    />
  )
}
