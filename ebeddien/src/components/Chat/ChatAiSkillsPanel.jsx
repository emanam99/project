import { useState } from 'react'
import { CHAT_AI_SKILL_GROUPS } from '../../config/chatAiSkillsCatalog'

function SkillGroupsList({ access, scrollClassName, groupTitleClass, skillItemClass, badgeClass }) {
  return (
    <div className={scrollClassName}>
      {CHAT_AI_SKILL_GROUPS.map((group) => (
        <section key={group.id}>
          <h4 className={groupTitleClass}>{group.title}</h4>
          {group.subtitle ? <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 sm:text-xs">{group.subtitle}</p> : null}
          <ul className="mt-2 space-y-2 border-l-2 border-primary-200/80 pl-3 dark:border-primary-800/60">
            {group.skills.map((sk, i) => {
              const key = sk.requiresAccess
              const allowed = key == null || access[key] === true
              return (
                <li key={`${group.id}-${i}`} className={skillItemClass}>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{sk.title}</span>
                  {!allowed ? (
                    <span className={badgeClass}>
                      Perlu akses
                    </span>
                  ) : null}
                  <p className="mt-0.5 text-gray-600 dark:text-gray-400">{sk.description}</p>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

/**
 * @param {{ starter?: object, access?: Record<string, boolean>, variant?: 'collapse' | 'page' }} props
 * - collapse: panel accordion (area Obrolan — tidak dipakai jika skill hanya di tab Kemampuan).
 * - page: konten penuh untuk tab Kemampuan.
 */
export default function ChatAiSkillsPanel({ starter, access = {}, variant = 'collapse' }) {
  const [open, setOpen] = useState(false)

  const hintCollapse =
    starter?.toolbarHint || 'text-xs leading-snug text-gray-600 dark:text-gray-400'
  const titleCls =
    starter?.toolbarLabel || 'mb-2 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400'

  if (variant === 'page') {
    return (
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          Fitur di bawah bergantung pada pengaturan lembaga dan{' '}
          <strong className="font-medium text-gray-800 dark:text-gray-200">role</strong> Anda. Super admin dapat mengatur role per
          aksi di menu <span className="font-medium">Pengaturan → Fitur</span> (baris bertipe &quot;Aksi&quot;, tombol &quot;Atur role&quot;).
        </p>
        <SkillGroupsList
          access={access}
          scrollClassName="space-y-5"
          groupTitleClass="text-sm font-semibold text-gray-900 dark:text-gray-100"
          skillItemClass="text-xs sm:text-sm leading-snug"
          badgeClass="ml-1.5 rounded bg-gray-200/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600 dark:bg-gray-700 dark:text-gray-400"
        />
      </div>
    )
  }

  return (
    <div className={`mx-auto max-w-2xl text-left ${starter?.toolbarRoot || ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-200/90 bg-gray-50/90 px-3 py-2 text-left text-xs transition hover:bg-gray-100/90 dark:border-gray-600 dark:bg-gray-900/50 dark:hover:bg-gray-800/70 sm:text-sm"
        aria-expanded={open}
      >
        <span className={titleCls}>Kemampuan AI — apa saja yang bisa?</span>
        <svg
          className={`h-4 w-4 shrink-0 text-gray-500 transition-transform dark:text-gray-400 ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open ? (
        <div className="mt-3 space-y-4 rounded-xl border border-gray-200/80 bg-white/90 p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900/60 sm:p-4">
          <p className={hintCollapse}>
            Fitur di bawah bergantung pada pengaturan lembaga dan{' '}
            <strong className="font-medium text-gray-800 dark:text-gray-200">role</strong> Anda. Super admin dapat mengatur role per
            aksi di menu <span className="font-medium">Pengaturan → Fitur</span> (baris bertipe &quot;Aksi&quot;, tombol &quot;Atur role&quot;).
          </p>
          <SkillGroupsList
            access={access}
            scrollClassName="space-y-4 max-h-[min(22rem,50vh)] overflow-y-auto chat-scrollbar pr-1"
            groupTitleClass="text-xs font-semibold text-gray-900 dark:text-gray-100"
            skillItemClass="text-[11px] sm:text-xs leading-snug"
            badgeClass="ml-1.5 rounded bg-gray-200/90 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-gray-600 dark:bg-gray-700 dark:text-gray-400"
          />
        </div>
      ) : null}
    </div>
  )
}
