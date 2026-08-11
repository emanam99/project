/**
 * Ukuran font di area "Mulai percakapan" — kelas teks mengikuti `starter`.
 */
export default function EbeddienChatConversationStarterToolbar({ chatFontScale, setChatFontScale, starter }) {
  const st = starter
  const btnOn =
    'font-semibold text-white shadow-sm bg-primary-600 dark:bg-primary-500 border border-transparent'
  const btnOff =
    'font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 border border-transparent'

  return (
    <div
      className={`max-w-xl mx-auto w-full rounded-2xl border border-gray-200/90 dark:border-gray-600/80 bg-white/90 dark:bg-gray-800/90 shadow-sm text-left ${st.toolbarRoot}`}
    >
      <div>
        <p className={st.toolbarLabel}>Ukuran teks obrolan</p>
        <div
          className="flex w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/90 dark:bg-gray-900/50 p-0.5"
          role="group"
          aria-label="Ukuran font chat"
        >
          {[
            { key: 'sm', label: 'Kecil' },
            { key: 'md', label: 'Sedang' },
            { key: 'lg', label: 'Besar' }
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setChatFontScale(key)}
              title={label}
              className={`${st.toolbarBtn} rounded-lg ${chatFontScale === key ? btnOn : btnOff}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
