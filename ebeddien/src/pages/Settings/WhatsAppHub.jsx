import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { useAuthStore } from '../../store/authStore'
import { userHasSuperAdminAccess } from '../../utils/roleAccess'
import { getIcon } from '../../config/menuIcons.jsx'

const WA_CHOICES = [
  {
    code: 'menu.settings.evolution_wa',
    path: '/settings/evolution-wa',
    label: 'Evo',
    description: 'Evolution API — instance, webhook, dan kirim pesan via Evolution.',
    iconKey: 'whatsapp'
  },
  {
    code: 'menu.whatsapp_koneksi',
    path: '/whatsapp-koneksi',
    label: 'WhatsApp',
    description: 'Koneksi WhatsApp server sendiri — scan QR, multi-session, chat.',
    iconKey: 'whatsapp'
  },
  {
    code: 'menu.settings.watzap',
    path: '/settings/watzap',
    label: 'WatZap',
    description: 'Integrasi WatZap (api.watzap.id) — device dan kirim pesan.',
    iconKey: 'whatsapp'
  }
]

/**
 * Hub WhatsApp — pilih Evo / WhatsApp / WatZap.
 */
export default function WhatsAppHub() {
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)
  const user = useAuthStore((s) => s.user)
  const isSuper = userHasSuperAdminAccess(user)

  const choices = useMemo(() => {
    const set = new Set((Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []).map(String))
    const bypass = isSuper && set.size === 0
    return WA_CHOICES.filter((c) => bypass || set.has(c.code))
  }, [fiturMenuCodes, isSuper])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">WhatsApp</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Pilih penyedia atau koneksi yang ingin dikelola.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {choices.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Tidak ada submenu WhatsApp yang diizinkan untuk peran Anda.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3 max-w-4xl">
            {choices.map((c) => (
              <Link
                key={c.code}
                to={c.path}
                className="group flex flex-col gap-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/40 p-4 hover:border-teal-500 hover:bg-teal-50/60 dark:hover:bg-teal-900/20 transition-colors"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 group-hover:bg-teal-200 dark:group-hover:bg-teal-800/50">
                  {getIcon(c.iconKey, 'w-6 h-6')}
                </span>
                <span className="text-base font-semibold text-gray-900 dark:text-gray-100">{c.label}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{c.description}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
