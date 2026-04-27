import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { DesktopSidebar } from './components/layout/DesktopSidebar'
import { MobileBottomNav } from './components/layout/MobileBottomNav'
import { MobileTopbar } from './components/layout/MobileTopbar'
import { BabDetailPage, HomePage, ListBabPage, WiridDetailPage } from './features/wirid/pages'
import { usePwaInstallPrompt } from './hooks/usePwaInstallPrompt'
import { useReaderData } from './hooks/useReaderData'
import { useTheme } from './hooks/useTheme'

export default function App() {
  const { state, refreshData, syncInfo } = useReaderData()
  const { theme, toggleTheme } = useTheme()
  const { canInstall, installReady, installed, promptInstall } = usePwaInstallPrompt()
  const location = useLocation()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className={`app-shell modern-layout${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
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
      />

      <div className="main-view">
        <MobileTopbar
          onToggleTheme={toggleTheme}
          theme={theme}
          canInstall={canInstall}
          onInstall={() => void promptInstall()}
        />

        <main className="content route-content">
          {state.loading ? (
            <p className="muted">Memuat data...</p>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                className="route-transition-wrap"
                initial={{ opacity: 0, y: 10, scale: 0.995 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.995 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <Routes location={location}>
                  <Route path="/" element={<HomePage state={state} />} />
                  <Route path="/list" element={<ListBabPage rows={state.rows} />} />
                  <Route path="/list/:babSlug" element={<BabDetailPage rows={state.rows} />} />
                  <Route path="/list/:babSlug/:wiridSlug" element={<WiridDetailPage rows={state.rows} />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>

      <MobileBottomNav />
    </div>
  )
}
