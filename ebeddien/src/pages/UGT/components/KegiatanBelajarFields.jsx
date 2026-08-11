import { AnimatePresence, motion } from 'framer-motion'
import { KEGIATAN_WAKTU_SLOTS } from '../kegiatanWaktuConfig'

const timeInputCls =
  'border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-teal-500'

const jamPanelTransition = { duration: 0.22, ease: [0.4, 0, 0.2, 1] }

/**
 * Centang Pagi / Siang / Malam + jam mulai–sampai per waktu (muncul bila dicentang).
 */
export default function KegiatanBelajarFields({ form, onFlagChange, onJamChange }) {
  return (
    <div className="space-y-3 mb-3">
      {KEGIATAN_WAKTU_SLOTS.map((slot) => (
        <KegiatanSlot key={slot.flag} slot={slot} form={form} onFlagChange={onFlagChange} onJamChange={onJamChange} />
      ))}
    </div>
  )
}

function KegiatanSlot({ slot, form, onFlagChange, onJamChange }) {
  const checked = !!form[slot.flag]

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-600 p-3 bg-gray-50/60 dark:bg-gray-900/30">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onFlagChange(slot.flag, e.target.checked)}
          className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
        />
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{slot.label}</span>
      </label>
      <AnimatePresence initial={false}>
        {checked ? (
          <motion.div
            key={`${slot.flag}-jam`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={jamPanelTransition}
            className="overflow-hidden"
          >
            <div className="mt-2 flex flex-wrap gap-2 items-end pl-6 pt-0.5">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Mulai (jam)</label>
                <input
                  type="time"
                  value={form[slot.mulai] || ''}
                  onChange={(e) => onJamChange(slot.mulai, e.target.value)}
                  className={timeInputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Sampai (jam)</label>
                <input
                  type="time"
                  value={form[slot.sampai] || ''}
                  onChange={(e) => onJamChange(slot.sampai, e.target.value)}
                  className={timeInputCls}
                />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
