import { useState } from 'react'
import { useTheme, type FontSizeId, type ThemeMode } from '../contexts/ThemeContext'
import { usePageTitle } from '../contexts/PageTitleContext'
import PwaInstallButton from '../components/PwaInstallButton'
import { usePwaInstallPrompt } from '../hooks/usePwaInstallPrompt'
import { APP_VERSION } from '../config/version'
import { getJatuhTempoHari, setJatuhTempoHari } from '../utils/tagihanSettings'

function SunIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
      />
    </svg>
  )
}

const THEME_CHOICES: Array<{ id: ThemeMode; label: string; desc: string; Icon: typeof SunIcon }> = [
  { id: 'light', label: 'Terang', desc: 'Cocok untuk siang hari', Icon: SunIcon },
  { id: 'dark', label: 'Gelap', desc: 'Lebih nyaman di malam hari', Icon: MoonIcon },
]

export default function SettingsPage() {
  usePageTitle('Pengaturan')
  const { theme, setTheme, fontSize, setFontSize, fontSizeOptions, fontSizePx } = useTheme()
  const { installed, canInstall } = usePwaInstallPrompt()
  const fontSizeIndex = Math.max(0, fontSizeOptions.findIndex((o) => o.id === fontSize))
  const fontFillPct = (fontSizeIndex / Math.max(1, fontSizeOptions.length - 1)) * 100
  const fontSizeLabel = fontSizeOptions.find((o) => o.id === fontSize)?.label || 'Sedang'
  const [jatuhHari, setJatuhHari] = useState(() => getJatuhTempoHari())

  const onJatuhHariChange = (raw: string) => {
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    const clamped = Math.min(31, Math.max(1, Math.round(n)))
    setJatuhHari(clamped)
    setJatuhTempoHari(clamped)
  }

  return (
    <div className="space-y-3.5 max-w-xl">
      <section className="ui-card p-3 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="ui-section-title">Aplikasi</h2>
            <p className="text-[12.5px] text-muted mt-0.5">
              Versi <span className="font-semibold text-ink tabular-nums">{APP_VERSION}</span>
              {' · '}
              {installed ? 'Terpasang sebagai aplikasi' : canInstall ? 'Siap diinstall' : 'Mode browser'}
            </p>
          </div>
          <PwaInstallButton />
        </div>
      </section>

      <section className="ui-card p-3 space-y-3">
        <div>
          <h2 className="ui-section-title">Tagihan</h2>
          <p className="text-[12.5px] text-muted mt-0.5">
            Tanggal jatuh tempo otomatis saat membuat tagihan baru.
          </p>
        </div>
        <div>
          <label className="ui-label" htmlFor="jatuh-tempo-hari">
            Jatuh tempo setiap tanggal
          </label>
          <div className="flex items-center gap-2">
            <input
              id="jatuh-tempo-hari"
              type="number"
              min={1}
              max={31}
              className="ui-input w-24"
              value={jatuhHari}
              onChange={(e) => onJatuhHariChange(e.target.value)}
            />
            <span className="text-[13px] text-muted">tiap bulan</span>
          </div>
        </div>
      </section>

      <section className="ui-card p-3 space-y-4">
        <div>
          <h2 className="ui-section-title">Tampilan</h2>
          <p className="text-[12.5px] text-muted mt-0.5">Tema dan ukuran teks di perangkat ini.</p>
        </div>

        <div className="space-y-2">
          <div className="text-[12px] font-semibold text-ink">Tema</div>
          <div className="grid grid-cols-2 gap-2">
            {THEME_CHOICES.map(({ id, label, desc, Icon }) => {
              const active = theme === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTheme(id)}
                  aria-pressed={active}
                  className={[
                    'rounded-xl border p-3 text-left transition',
                    active
                      ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))] shadow-sm'
                      : 'border-line bg-surface hover:bg-surface-soft',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={[
                        'h-9 w-9 rounded-lg grid place-items-center',
                        active ? 'bg-[var(--accent)] text-white' : 'bg-surface-soft text-ink',
                      ].join(' ')}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-ink">{label}</div>
                      <div className="text-[11px] text-muted">{desc}</div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[12px] font-semibold text-ink">Ukuran teks</div>
            <p className="text-[12px] text-muted">
              {fontSizeLabel}
              {' · '}
              <span className="font-semibold text-ink tabular-nums">{fontSizePx}px</span>
            </p>
          </div>

          <div className="px-0.5" role="radiogroup" aria-label="Ukuran font">
            <div className="flex items-end justify-between gap-2 mb-1.5">
              <span className="font-display font-bold text-ink leading-none select-none" style={{ fontSize: 12 }} aria-hidden>
                A
              </span>
              <span className="font-display font-bold text-ink leading-none select-none" style={{ fontSize: 18 }} aria-hidden>
                A
              </span>
            </div>

            <div className="relative h-9">
              <div className="absolute left-3 right-3 top-1/2 -translate-y-1/2 h-1 rounded-full bg-surface-soft" aria-hidden />
              <div
                className="absolute left-3 top-1/2 -translate-y-1/2 h-1 rounded-full bg-[var(--accent)] transition-[width] duration-200"
                style={{ width: `calc((100% - 1.5rem) * ${fontFillPct / 100})` }}
                aria-hidden
              />
              <div className="absolute inset-0 flex items-center justify-between">
                {fontSizeOptions.map((opt) => {
                  const active = fontSize === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={`${opt.label} (${opt.hint})`}
                      title={opt.label}
                      onClick={() => setFontSize(opt.id as FontSizeId)}
                      className="relative z-[1] flex h-9 w-9 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    >
                      <span
                        className={[
                          'rounded-full border-2 transition',
                          active
                            ? 'h-4 w-4 border-[var(--accent)] bg-[var(--accent)] shadow-sm'
                            : 'h-2.5 w-2.5 border-[color-mix(in_srgb,var(--line)_80%,var(--muted))] bg-surface hover:border-[var(--accent)] hover:scale-110',
                        ].join(' ')}
                      />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <p className="text-[11px] text-muted px-0.5">
        Preferensi disimpan di perangkat ini saja (tidak ikut ke akun lain).
      </p>
    </div>
  )
}
