import { useReaderFontScale } from '../../../hooks/useReaderFontScale'
import { useTitleLang } from '../../../hooks/useTitleLang'
import { ReaderDisplaySettings } from '../../../components/reader/ReaderDisplaySettings'
import { SettingsAbout } from '../components/SettingsAbout'

type Props = {
  readerFont?: ReturnType<typeof useReaderFontScale>
}

export function SettingsPage({ readerFont: readerFontProp }: Props) {
  const fallbackFont = useReaderFontScale()
  const readerFont = readerFontProp ?? fallbackFont
  const { lang, setLang } = useTitleLang()

  return (
    <section className="page-block settings-page">
      <ReaderDisplaySettings
        variant="page"
        showTitleLang
        titleLang={lang}
        onTitleLang={setLang}
        scale={readerFont.scale}
        stepIndex={readerFont.stepIndex}
        onBumpDown={readerFont.bumpDown}
        onBumpUp={readerFont.bumpUp}
        canBumpDown={readerFont.canBumpDown}
        canBumpUp={readerFont.canBumpUp}
        lineHeight={readerFont.lineHeight}
        lineStepIndex={readerFont.lineStepIndex}
        onBumpLineDown={readerFont.bumpLineDown}
        onBumpLineUp={readerFont.bumpLineUp}
        canBumpLineDown={readerFont.canBumpLineDown}
        canBumpLineUp={readerFont.canBumpLineUp}
        faces={readerFont.faces}
        onAyatFace={readerFont.setAyatFace}
        onWiridFace={readerFont.setWiridFace}
        onNadhomFace={readerFont.setNadhomFace}
        onLatinFace={readerFont.setLatinFace}
      />
      <SettingsAbout />
    </section>
  )
}
