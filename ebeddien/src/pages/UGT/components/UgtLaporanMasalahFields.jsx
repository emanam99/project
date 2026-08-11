import { motion, AnimatePresence } from 'framer-motion'
import { emptyMasalahRow } from '../../../utils/ugtLaporanMasalah'

const fieldCls =
  'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm'

/**
 * Daftar masalah dinamis: badge jumlah di atas, tombol tambah di bawah daftar, animasi masuk/keluar.
 */
export default function UgtLaporanMasalahFields({ items, onChange }) {
  const list = Array.isArray(items) && items.length > 0 ? items : [emptyMasalahRow()]

  const setItems = (next) => onChange?.(next)

  const updateField = (idx, field, value) => {
    setItems(
      list.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    )
  }

  const addRow = () => setItems([...list, emptyMasalahRow()])

  const removeRow = (idx) => {
    if (list.length <= 1) return
    setItems(list.filter((_, i) => i !== idx))
  }

  return (
    <motion.div
      layout
      className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3"
    >
      <motion.div layout className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Masalah</label>
        <span
          className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-200 text-xs font-semibold tabular-nums"
          aria-label={`${list.length} masalah`}
        >
          {list.length}
        </span>
      </motion.div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Ikut tersimpan bersama laporan; bisa lebih dari satu entri.
      </p>

      <div className="space-y-3">
        <AnimatePresence mode="popLayout" initial={false}>
          {list.map((item, idx) => (
            <motion.div
              key={item._key ?? `idx-${idx}`}
              layout
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="rounded-lg border border-gray-200 dark:border-gray-600 p-3 space-y-2 bg-gray-50/50 dark:bg-gray-900/20"
            >
              <motion.div layout className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">#{idx + 1}</span>
                {list.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline"
                  >
                    Hapus
                  </button>
                ) : null}
              </motion.div>
              <textarea
                value={item.masalah}
                onChange={(e) => updateField(idx, 'masalah', e.target.value)}
                rows={2}
                placeholder="Masalah yang ditemukan"
                className={fieldCls}
              />
              <textarea
                value={item.solusi}
                onChange={(e) => updateField(idx, 'solusi', e.target.value)}
                rows={2}
                placeholder="Solusi yang sudah dilakukan"
                className={fieldCls}
              />
              <textarea
                value={item.saran}
                onChange={(e) => updateField(idx, 'saran', e.target.value)}
                rows={2}
                placeholder="Saran tindak lanjut bagi pengurus UGB"
                className={fieldCls}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <motion.div layout transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
        <button
          type="button"
          onClick={addRow}
          className="w-full py-2.5 rounded-lg border border-dashed border-teal-400/80 dark:border-teal-500/60 text-sm font-medium text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
        >
          + Tambah masalah
        </button>
      </motion.div>
    </motion.div>
  )
}
