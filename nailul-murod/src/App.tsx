import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, matchPath, useNavigate } from 'react-router-dom'
import { AnimatedHeaderTitle } from './components/layout/AnimatedHeaderTitle'
import { DesktopSidebar } from './components/layout/DesktopSidebar'
import { MobileBottomNav } from './components/layout/MobileBottomNav'
import { MobileTopbar } from './components/layout/MobileTopbar'
import { ReaderFontSettingsPanel } from './components/reader/ReaderFontSettingsPanel'
import { ReaderPickOffcanvas } from './components/reader/ReaderPickOffcanvas'
import { SyiirLayoutToggleIcon } from './components/reader/SyiirLayoutToggleIcon'
import { SyiirReaderProvider, useSyiirReader } from './contexts/SyiirReaderContext'
import { useBerandaHeroChrome } from './hooks/useBerandaHeroChrome'
import { useAppHeaderTitle } from './hooks/usePageTitle'
import { useReaderFontScale } from './hooks/useReaderFontScale'
import { useWiridReaderRoute } from './hooks/useWiridReaderRoute'
import { BabDetailPage, HomePage, ListBabPage, SettingsPage, WiridDetailPage } from './features/wirid/pages'
import { parseWiridIdFromSlug } from './utils/slug'
import { usePwaInstallPrompt } from './hooks/usePwaInstallPrompt'
import { useReaderData } from './hooks/useReaderData'
import { useTheme } from './hooks/useTheme'
import { MainScrollContext } from './contexts/MainScrollContext'

const READER_FONT_PANEL_HISTORY_KEY = 'nmReaderFontPanel'
const READER_PICK_OFFCANVAS_HISTORY_KEY = 'nmReaderPickOffcanvas'

function SyiirReaderRouteSync({ isWiridReader }: { isWiridReader: boolean }) {
  const { registerHasSyiir } = useSyiirReader()
  useEffect(() => {
    if (!isWiridReader) registerHasSyiir(false)
  }, [isWiridReader, registerHasSyiir])
  return null
}

function AppContent() {
  const navigate = useNavigate()
  const { state, refreshData, syncInfo } = useReaderData()
  const { theme, toggleTheme } = useTheme()
  const { canInstall, installReady, installed, promptInstall } = usePwaInstallPrompt()
  const location = useLocation()
  const pageTitle = useAppHeaderTitle(location, state.rows, state.loading, state.babList)
  const isWiridReader = useWiridReaderRoute(location)
  const { hasSyiir, layoutMode: syiirLayoutMode, toggleLayoutMode } = useSyiirReader()
  const readerFont = useReaderFontScale()
  const [readerFontPanelOpen, setReaderFontPanelOpen] = useState(false)
  const [readerPickOpen, setReaderPickOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  /** Entri history dummy untuk panel font — tombol back menutup panel dulu */
  const readerFontHistoryPushed = useRef(false)
  const readerPickHistoryPushed = useRef(false)

  const readerMatch = matchPath({ path: '/list/:babSlug/:wiridSlug' }, location.pathname)
  const currentBabSlug = readerMatch?.params.babSlug
  const currentWiridId = readerMatch?.params.wiridSlug
    ? parseWiridIdFromSlug(readerMatch.params.wiridSlug)
    : undefined

  const openReaderFontPanel = () => {
    if (!readerFontHistoryPushed.current) {
      window.history.pushState({ [READER_FONT_PANEL_HISTORY_KEY]: 1 }, '')
      readerFontHistoryPushed.current = true
    }
    setReaderFontPanelOpen(true)
  }

  const closeReaderFontPanel = () => {
    setReaderFontPanelOpen(false)
    if (readerFontHistoryPushed.current) {
      readerFontHistoryPushed.current = false
      window.history.back()
    }
  }

  const openReaderPickOffcanvas = () => {
    if (!readerPickHistoryPushed.current) {
      window.history.pushState({ [READER_PICK_OFFCANVAS_HISTORY_KEY]: 1 }, '')
      readerPickHistoryPushed.current = true
    }
    setReaderPickOpen(true)
  }

  const closeReaderPickOffcanvas = () => {
    setReaderPickOpen(false)
    if (readerPickHistoryPushed.current) {
      readerPickHistoryPushed.current = false
      window.history.back()
    }
  }

  /** Pilih wirid dari offcanvas: ganti entri history dummy dengan URL bacaan baru. */
  const pickWiridFromOffcanvas = (path: string) => {
    setReaderPickOpen(false)
    const replaceDummy = readerPickHistoryPushed.current
    if (replaceDummy) {
      readerPickHistoryPushed.current = false
    }
    navigate(path, replaceDummy ? { replace: true } : undefined)
  }

  useEffect(() => {
    const onPopState = () => {
      setReaderFontPanelOpen((wasOpen) => {
        if (wasOpen && readerFontHistoryPushed.current) {
          readerFontHistoryPushed.current = false
          return false
        }
        return wasOpen
      })
      setReaderPickOpen((wasOpen) => {
        if (wasOpen && readerPickHistoryPushed.current) {
          readerPickHistoryPushed.current = false
          return false
        }
        return wasOpen
      })
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (!isWiridReader) {
      readerFontHistoryPushed.current = false
      readerPickHistoryPushed.current = false
      setReaderFontPanelOpen(false)
      setReaderPickOpen(false)
    }
  }, [isWiridReader])

  const mainScrollRef = useRef<HTMLElement>(null)
  const isBeranda = location.pathname === '/'
  const berandaHeroChrome = useBerandaHeroChrome(mainScrollRef, isBeranda, state.loading)

  /** List bab & list judul per bab: transisi pembungkus lebih panjang agar selaras dengan stagger kartu */
  const isListCardsRouteTransition = useMemo(() => {
    const p = location.pathname
    return p === '/list' || /^\/list\/[^/]+$/.test(p)
  }, [location.pathname])

  const routeWrapTransition = useMemo(
    () =>
      isListCardsRouteTransition
        ? { duration: 0.32, ease: [0.16, 1, 0.3, 1] as const }
        : { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
    [isListCardsRouteTransition],
  )

  useLayoutEffect(() => {
    mainScrollRef.current?.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <MainScrollContext.Provider value={mainScrollRef}>
    <SyiirReaderRouteSync isWiridReader={isWiridReader} />
    <div
      className={`app-shell modern-layout${sidebarCollapsed ? ' sidebar-collapsed' : ''}${isBeranda ? ' modern-layout--beranda' : ''}`}
    >
      <DesktopSidebar
        state={state}
        syncInfo={syncInfo}
        onRefresh={() => refreshData()}
        onToggleTheme={toggleTheme}
        theme={theme}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        canInstall={canInstall}
        installReady={installReady}
        installed={installed}
        onInstall={() => void promptInstall()}
        isReaderPickMode={isWiridReader}
        onListBabPick={openReaderPickOffcanvas}
      />

      <div className={`main-view${isBeranda ? ' main-view--beranda' : ''}`}>
        {berandaHeroChrome.enabled ? (
          <motion.div
            className="beranda-chrome-top"
            style={{
              y: berandaHeroChrome.topY,
              opacity: berandaHeroChrome.topOpacity,
              pointerEvents: berandaHeroChrome.topPointerEvents,
            }}
          >
            <MobileTopbar
              pageTitle={pageTitle}
              onToggleTheme={toggleTheme}
              theme={theme}
              canInstall={canInstall}
              onInstall={() => void promptInstall()}
            />
          </motion.div>
        ) : (
          <MobileTopbar
            pageTitle={pageTitle}
            onToggleTheme={toggleTheme}
            theme={theme}
            canInstall={canInstall}
            onInstall={() => void promptInstall()}
          />
        )}
        <div className="desktop-main-title">
          <div className="desktop-main-title-text">
            <AnimatedHeaderTitle title={pageTitle} />
          </div>
          <div className="desktop-main-title-actions">
            <button
              type="button"
              className="theme-btn desktop-header-theme-btn"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Alihkan ke tema terang' : 'Alihkan ke tema gelap'}
              title={theme === 'dark' ? 'Tema terang' : 'Tema gelap'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <AnimatePresence initial={false} mode="popLayout">
              {isWiridReader && hasSyiir && (
                <motion.button
                  key="desktop-syiir-layout-btn"
                  type="button"
                  className="theme-btn reader-font-header-btn syiir-layout-header-btn"
                  onClick={toggleLayoutMode}
                  aria-label={
                    syiirLayoutMode === 'paired'
                      ? 'Alihkan syi\'ir ke dua baris kanan–kiri'
                      : 'Alihkan syi\'ir ke satu baris berdampingan'
                  }
                  title={
                    syiirLayoutMode === 'paired'
                      ? 'Syi\'ir sejajar — klik untuk dua baris'
                      : 'Syi\'ir dua baris — klik untuk sejajar'
                  }
                  initial={{ opacity: 0, x: 12, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 12, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                >
                  <SyiirLayoutToggleIcon mode={syiirLayoutMode} />
                </motion.button>
              )}
              {isWiridReader && (
                <motion.button
                  key="desktop-reader-font-btn"
                  type="button"
                  className="theme-btn reader-font-header-btn"
                  onClick={openReaderFontPanel}
                  aria-label="Pengaturan ukuran dan jarak baris teks"
                  title="Ukuran & jarak teks"
                  initial={{ opacity: 0, x: 12, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 12, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                >
                  Aa
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        <motion.main
          ref={mainScrollRef}
          className={`content route-content${isBeranda ? ' route-content--beranda' : ''}`}
          style={
            berandaHeroChrome.enabled
              ? {
                  paddingTop: berandaHeroChrome.paddingTop,
                  paddingBottom: berandaHeroChrome.paddingBottom,
                }
              : undefined
          }
        >
          {state.loading ? (
            <p className="muted">Memuat data...</p>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                className="route-transition-wrap"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={routeWrapTransition}
              >
                <Routes location={location}>
                  <Route path="/" element={<HomePage state={state} />} />
                  <Route path="/list" element={<ListBabPage rows={state.rows} babList={state.babList} />} />
                  <Route path="/list/:babSlug" element={<BabDetailPage rows={state.rows} babList={state.babList} />} />
                  <Route path="/list/:babSlug/:wiridSlug" element={<WiridDetailPage rows={state.rows} />} />
                  <Route path="/pengaturan" element={<SettingsPage readerFont={readerFont} />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          )}
        </motion.main>
      </div>
    </div>

      {berandaHeroChrome.enabled ? (
        <motion.div
          className="beranda-chrome-bottom-host"
          style={{
            y: berandaHeroChrome.bottomY,
            opacity: berandaHeroChrome.bottomOpacity,
            pointerEvents: berandaHeroChrome.bottomPointerEvents,
          }}
        >
          <MobileBottomNav
            dockedInBerandaChrome
            showReaderFontSettings={isWiridReader}
            showSyiirLayoutToggle={isWiridReader && hasSyiir}
            syiirLayoutMode={syiirLayoutMode}
            onToggleSyiirLayout={toggleLayoutMode}
            onReaderFontSettings={openReaderFontPanel}
            isReaderPickMode={isWiridReader}
            onListBabPick={openReaderPickOffcanvas}
          />
        </motion.div>
      ) : (
        <MobileBottomNav
          showReaderFontSettings={isWiridReader}
          showSyiirLayoutToggle={isWiridReader && hasSyiir}
          syiirLayoutMode={syiirLayoutMode}
          onToggleSyiirLayout={toggleLayoutMode}
          onReaderFontSettings={openReaderFontPanel}
          isReaderPickMode={isWiridReader}
          onListBabPick={openReaderPickOffcanvas}
        />
      )}

      <ReaderPickOffcanvas
        isOpen={readerPickOpen}
        onClose={closeReaderPickOffcanvas}
        onPickWirid={pickWiridFromOffcanvas}
        rows={state.rows}
        babList={state.babList}
        currentBabSlug={currentBabSlug}
        currentWiridId={currentWiridId}
      />

      <ReaderFontSettingsPanel
        open={readerFontPanelOpen}
        onClose={closeReaderFontPanel}
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
    </MainScrollContext.Provider>
  )
}

export default function App() {
  return (
    <SyiirReaderProvider>
      <AppContent />
    </SyiirReaderProvider>
  )
}
