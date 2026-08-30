import type { ReactNode } from 'react'
import {
  READER_ARABIC_FACES,
  READER_FONT_STEPS,
  READER_LATIN_FACES,
  READER_LINE_HEIGHT_STEPS,
  type ReaderArabicFaceId,
  type ReaderFontFaces,
  type ReaderLatinFaceId,
} from '../../hooks/useReaderFontScale'
import type { WiridTitleLang } from '../../hooks/useTitleLang'

export type ReaderDisplaySettingsProps = {
  scale: number
  stepIndex: number
  onBumpDown: () => void
  onBumpUp: () => void
  canBumpDown: boolean
  canBumpUp: boolean
  lineHeight: number
  lineStepIndex: number
  onBumpLineDown: () => void
  onBumpLineUp: () => void
  canBumpLineDown: boolean
  canBumpLineUp: boolean
  faces: ReaderFontFaces
  onAyatFace: (id: ReaderArabicFaceId) => void
  onWiridFace: (id: ReaderArabicFaceId) => void
  onNadhomFace: (id: ReaderArabicFaceId) => void
  onLatinFace: (id: ReaderLatinFaceId) => void
  /** Tampilkan pilihan bahasa judul (Indonesia / Arab) */
  showTitleLang?: boolean
  titleLang?: WiridTitleLang
  onTitleLang?: (lang: WiridTitleLang) => void
  /** panel = offcanvas baca; page = halaman /pengaturan */
  variant?: 'panel' | 'page'
}

function lineHeightLabel(i: number) {
  if (i === 0) return 'Sangat rapat'
  if (i <= 2) return 'Rapat'
  if (i === 3) return 'Sedang'
  if (i === 4) return 'Standar'
  if (i <= 5) return 'Lega'
  return 'Sangat lega'
}

function scaleLabel(stepIndex: number) {
  if (stepIndex <= 1) return 'Kecil'
  if (stepIndex === 2) return 'Standar'
  if (stepIndex <= 5) return 'Besar'
  if (stepIndex <= 9) return 'Sangat besar'
  return 'Maksimum'
}

function FaceSelectField<T extends string>({
  label,
  options,
  value,
  onChange,
  layout = 'stack',
}: {
  label: string
  options: readonly { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
  layout?: 'stack' | 'row'
}) {
  const fieldClass =
    layout === 'row' ? 'settings-row settings-row--select' : 'reader-font-select-field'

  return (
    <label className={fieldClass}>
      <span className={layout === 'row' ? 'settings-row__label' : 'reader-font-select-field__label'}>
        {label}
      </span>
      <select
        className="reader-font-select"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={label}
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function SettingsSection({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="settings-section">
      <header className="settings-section__head">
        <h3 className="settings-section__title">{title}</h3>
        {hint ? <p className="settings-section__hint">{hint}</p> : null}
      </header>
      <div className="settings-section__body">{children}</div>
    </section>
  )
}

function StepControlRow({
  label,
  meta,
  stepCount,
  stepIndex,
  canDown,
  canUp,
  onDown,
  onUp,
  downLabel,
  upLabel,
  downTitle,
}: {
  label: string
  meta: string
  stepCount: number
  stepIndex: number
  canDown: boolean
  canUp: boolean
  onDown: () => void
  onUp: () => void
  downLabel: string
  upLabel: string
  downTitle?: string
}) {
  return (
    <div className="settings-step-control">
      <div className="settings-step-control__info">
        <span className="settings-step-control__label">{label}</span>
        <span className="settings-step-control__meta">{meta}</span>
      </div>
      <div className="reader-font-panel-row settings-step-control__row">
        <button
          type="button"
          className="theme-btn reader-font-bump"
          disabled={!canDown}
          onClick={onDown}
          title={downTitle}
          aria-label={downTitle ?? downLabel}
        >
          {downLabel}
        </button>
        <div className="reader-font-steps" aria-hidden="true">
          {Array.from({ length: stepCount }, (_, i) => (
            <span key={i} className={`reader-font-step-dot${i === stepIndex ? ' active' : ''}`} />
          ))}
        </div>
        <button type="button" className="theme-btn reader-font-bump" disabled={!canUp} onClick={onUp}>
          {upLabel}
        </button>
      </div>
    </div>
  )
}

export function ReaderDisplaySettings({
  scale,
  stepIndex,
  onBumpDown,
  onBumpUp,
  canBumpDown,
  canBumpUp,
  lineHeight,
  lineStepIndex,
  onBumpLineDown,
  onBumpLineUp,
  canBumpLineDown,
  canBumpLineUp,
  faces,
  onAyatFace,
  onWiridFace,
  onNadhomFace,
  onLatinFace,
  showTitleLang,
  titleLang = 'id',
  onTitleLang,
  variant = 'panel',
}: ReaderDisplaySettingsProps) {
  if (variant === 'page') {
    return (
      <div className="reader-display-settings reader-display-settings--page settings-stack">
        {showTitleLang && onTitleLang ? (
          <SettingsSection title="Bahasa tampilan" hint="Nama bab dan judul wirid di seluruh aplikasi">
            <div className="reader-title-lang-toggle" role="group" aria-label="Bahasa judul">
              <button
                type="button"
                className={`reader-title-lang-btn${titleLang === 'id' ? ' active' : ''}`}
                onClick={() => onTitleLang('id')}
                aria-pressed={titleLang === 'id'}
              >
                Indonesia
              </button>
              <button
                type="button"
                className={`reader-title-lang-btn${titleLang === 'ar' ? ' active' : ''}`}
                onClick={() => onTitleLang('ar')}
                aria-pressed={titleLang === 'ar'}
              >
                Arab
              </button>
            </div>
          </SettingsSection>
        ) : null}

        <SettingsSection title="Font teks bacaan">
          <div className="settings-row-group">
            <FaceSelectField
              label="Ayat"
              layout="row"
              options={READER_ARABIC_FACES}
              value={faces.ayat}
              onChange={onAyatFace}
            />
            <FaceSelectField
              label="Wirid"
              layout="row"
              options={READER_ARABIC_FACES}
              value={faces.wirid}
              onChange={onWiridFace}
            />
            <FaceSelectField
              label="Nadhom"
              layout="row"
              options={READER_ARABIC_FACES}
              value={faces.nadhom}
              onChange={onNadhomFace}
            />
            <FaceSelectField
              label="Judul & Latin"
              layout="row"
              options={READER_LATIN_FACES}
              value={faces.latin}
              onChange={onLatinFace}
            />
          </div>
        </SettingsSection>

        <SettingsSection title="Ukuran teks">
          <StepControlRow
            label="Skala teks"
            meta={`${scaleLabel(stepIndex)} · ${Math.round(scale * 100)}%`}
            stepCount={READER_FONT_STEPS.length}
            stepIndex={stepIndex}
            canDown={canBumpDown}
            canUp={canBumpUp}
            onDown={onBumpDown}
            onUp={onBumpUp}
            downLabel="A−"
            upLabel="A+"
          />
        </SettingsSection>

        <SettingsSection title="Renggang baris">
          <StepControlRow
            label="Jarak antar baris"
            meta={`${lineHeightLabel(lineStepIndex)} · ${lineHeight.toFixed(2).replace('.', ',')}`}
            stepCount={READER_LINE_HEIGHT_STEPS.length}
            stepIndex={lineStepIndex}
            canDown={canBumpLineDown}
            canUp={canBumpLineUp}
            onDown={onBumpLineDown}
            onUp={onBumpLineUp}
            downLabel="≡−"
            upLabel="≡+"
            downTitle="Perpendek jarak antar baris"
          />
        </SettingsSection>
      </div>
    )
  }

  const rootClass = 'reader-display-settings'

  return (
    <div className={rootClass}>
      {showTitleLang && onTitleLang && (
        <>
          <h3 className="reader-font-panel-section">Bahasa tampilan</h3>
          <p className="reader-font-panel-meta">Nama bab dan judul wirid di seluruh aplikasi</p>
          <div className="reader-title-lang-toggle" role="group" aria-label="Bahasa judul">
            <button
              type="button"
              className={`reader-title-lang-btn${titleLang === 'id' ? ' active' : ''}`}
              onClick={() => onTitleLang('id')}
              aria-pressed={titleLang === 'id'}
            >
              Indonesia
            </button>
            <button
              type="button"
              className={`reader-title-lang-btn${titleLang === 'ar' ? ' active' : ''}`}
              onClick={() => onTitleLang('ar')}
              aria-pressed={titleLang === 'ar'}
            >
              Arab
            </button>
          </div>
          <hr className="reader-font-panel-divider" />
        </>
      )}

      <h3 className="reader-font-panel-section">Font teks bacaan</h3>
      <div className="reader-font-select-stack">
        <FaceSelectField
          label="Font Ayat"
          options={READER_ARABIC_FACES}
          value={faces.ayat}
          onChange={onAyatFace}
        />
        <FaceSelectField
          label="Font Wirid"
          options={READER_ARABIC_FACES}
          value={faces.wirid}
          onChange={onWiridFace}
        />
        <FaceSelectField
          label="Font Nadhom"
          options={READER_ARABIC_FACES}
          value={faces.nadhom}
          onChange={onNadhomFace}
        />
        <FaceSelectField
          label="Font Judul & Latin"
          options={READER_LATIN_FACES}
          value={faces.latin}
          onChange={onLatinFace}
        />
      </div>

      <hr className="reader-font-panel-divider" />
      <h3 className="reader-font-panel-section">Ukuran teks</h3>
      <p className="reader-font-panel-meta">
        {scaleLabel(stepIndex)} · {Math.round(scale * 100)}%
      </p>
      <div className="reader-font-panel-row">
        <button type="button" className="theme-btn reader-font-bump" disabled={!canBumpDown} onClick={onBumpDown}>
          A−
        </button>
        <div className="reader-font-steps" aria-hidden="true">
          {READER_FONT_STEPS.map((s, i) => (
            <span key={s} className={`reader-font-step-dot${i === stepIndex ? ' active' : ''}`} />
          ))}
        </div>
        <button type="button" className="theme-btn reader-font-bump" disabled={!canBumpUp} onClick={onBumpUp}>
          A+
        </button>
      </div>

      <hr className="reader-font-panel-divider" />
      <h3 className="reader-font-panel-section">Renggang baris dalam paragraf</h3>
      <p className="reader-font-panel-meta">
        {lineHeightLabel(lineStepIndex)} · {lineHeight.toFixed(2).replace('.', ',')}
      </p>
      <div className="reader-font-panel-row">
        <button
          type="button"
          className="theme-btn reader-font-bump"
          disabled={!canBumpLineDown}
          onClick={onBumpLineDown}
          title="Perpendek jarak antar baris"
          aria-label="Perpendek jarak antar baris"
        >
          ≡−
        </button>
        <div className="reader-font-steps" aria-hidden="true">
          {READER_LINE_HEIGHT_STEPS.map((s, i) => (
            <span key={s} className={`reader-font-step-dot${i === lineStepIndex ? ' active' : ''}`} />
          ))}
        </div>
        <button
          type="button"
          className="theme-btn reader-font-bump"
          disabled={!canBumpLineUp}
          onClick={onBumpLineUp}
          title="Perpanjang jarak antar baris"
          aria-label="Perpanjang jarak antar baris"
        >
          ≡+
        </button>
      </div>
    </div>
  )
}
