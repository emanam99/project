import { useState } from 'react'
import FieldInfoButton from './FieldInfoButton'
import NikInfoOffcanvas from './NikInfoOffcanvas'

/**
 * Label NIK + tombol Info (modal) — pola aplikasi daftar.
 */
export default function NikFieldLabel({
  label = 'NIK',
  required = false,
  className = '',
}) {
  const [infoOpen, setInfoOpen] = useState(false)

  return (
    <>
      <div className={`flex items-center gap-2 mb-1 ${className}`.trim()}>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          {label}
          {required ? <span className="text-red-500"> *</span> : null}
        </label>
        <FieldInfoButton onClick={() => setInfoOpen(true)} title="Info NIK" />
      </div>
      <NikInfoOffcanvas isOpen={infoOpen} onClose={() => setInfoOpen(false)} />
    </>
  )
}
