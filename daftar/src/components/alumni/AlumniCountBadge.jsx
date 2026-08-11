import { useAlumniCount } from '../../hooks/useAlumniCount'
import RollingNumber from './RollingNumber'

/**
 * Total alumni menyatu dengan page (tanpa background kartu).
 */
export default function AlumniCountBadge({
  className = '',
  label = 'Alumni terdaftar',
  size = 'md',
  align = 'center',
}) {
  const { animatedTotal } = useAlumniCount()

  const alignClass =
    align === 'end' || align === 'right'
      ? 'items-end text-right'
      : align === 'start' || align === 'left'
        ? 'items-start text-left'
        : 'items-center text-center'

  return (
    <div className={`inline-flex flex-col ${alignClass} ${className}`}>
      <RollingNumber value={animatedTotal} size={size} />
      {label ? (
        <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">
          {label}
        </span>
      ) : null}
    </div>
  )
}
