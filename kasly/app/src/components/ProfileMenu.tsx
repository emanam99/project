import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { logout } from '../api/apiClient'
import { useTheme } from '../contexts/ThemeContext'
import { getStoredUser, type AuthUser } from '../utils/auth'

function initialsFromUser(user: AuthUser | null): string {
  const source = (user?.name || user?.email || '?').trim()
  if (!source) return '?'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase()
  }
  return source.charAt(0).toUpperCase()
}

function Avatar({
  user,
  sizeClass = 'h-8 w-8',
  textClass = 'text-[11px]',
}: {
  user: AuthUser | null
  sizeClass?: string
  textClass?: string
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const picture = user?.picture?.trim() || null
  const showImg = Boolean(picture) && !imgFailed
  const initials = useMemo(() => initialsFromUser(user), [user])

  useEffect(() => {
    setImgFailed(false)
  }, [picture])

  return (
    <span
      className={`${sizeClass} rounded-full overflow-hidden bg-[var(--accent)] text-white grid place-items-center font-semibold ring-2 ring-[var(--surface)]`}
    >
      {showImg ? (
        <img
          src={picture!}
          alt=""
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className={textClass}>{initials}</span>
      )}
    </span>
  )
}

type ProfileMenuProps = {
  user?: AuthUser | null
  className?: string
}

export default function ProfileMenu({ user: userProp, className = '' }: ProfileMenuProps) {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const user = userProp === undefined ? getStoredUser() : userProp
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const el = rootRef.current
      if (!el) return
      if (event.target instanceof Node && !el.contains(event.target)) {
        setOpen(false)
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const handleLogout = async () => {
    setOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  const displayName = user?.name?.trim() || user?.email || 'Pengguna'
  const isDark = theme === 'dark'

  return (
    <div ref={rootRef} className={`relative ${className}`.trim()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu profil"
      >
        <Avatar user={user} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 w-56 z-50 rounded-xl border border-line bg-surface-raised shadow-xl py-1.5 text-ink"
        >
          <div className="flex flex-col items-center px-3 pt-2.5 pb-2.5 border-b border-line">
            <Avatar user={user} sizeClass="h-11 w-11" textClass="text-sm" />
            <div className="mt-2 text-center min-w-0 w-full">
              <div className="font-semibold text-[13px] text-ink truncate">{displayName}</div>
              {user?.email && (
                <div className="text-[11px] text-muted truncate mt-0.5">{user.email}</div>
              )}
            </div>
          </div>

          <div className="px-2.5 py-2 flex items-center gap-2">
            <svg
              className="h-4 w-4 shrink-0 text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
              />
            </svg>
            <span className="flex-1 text-[13px] font-medium">Tema gelap</span>
            <button
              type="button"
              role="switch"
              aria-checked={isDark}
              aria-label="Toggle tema gelap atau terang"
              onClick={toggleTheme}
              className={[
                'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                isDark ? 'bg-[var(--accent)]' : 'bg-surface-soft border border-line',
              ].join(' ')}
            >
              <span
                className={[
                  'inline-block h-4 w-4 transform rounded-full bg-white shadow transition',
                  isDark ? 'translate-x-4' : 'translate-x-0.5',
                ].join(' ')}
              />
            </button>
          </div>

          <div className="border-t border-line my-0.5" />

          <button
            type="button"
            role="menuitem"
            onClick={() => void handleLogout()}
            className="w-full text-left px-3 py-2 text-[13px] font-medium text-[var(--danger)] hover:bg-[var(--danger-bg)] flex items-center gap-2 transition"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h4a2 2 0 012 2v1"
              />
            </svg>
            Keluar
          </button>
        </div>
      )}
    </div>
  )
}
