type MaterialIconProps = {
  /** Nama ikon Material Symbols, mis. `home`, `groups` */
  name: string
  className?: string
  /** FILL=1 (solid) */
  filled?: boolean
  /** Ukuran font dalam px (default dari CSS) */
  size?: number
  title?: string
}

/**
 * Material Symbols Outlined (Google Fonts) — format seragam di seluruh app.
 * Browse: https://fonts.google.com/icons
 */
export default function MaterialIcon({
  name,
  className = '',
  filled = false,
  size,
  title,
}: MaterialIconProps) {
  return (
    <span
      className={`material-symbols-outlined ${className}`.trim()}
      style={{
        fontVariationSettings: filled
          ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
          : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
        ...(size ? { fontSize: size } : null),
      }}
      title={title}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {name}
    </span>
  )
}
