import { Navigate, Route, Routes } from 'react-router-dom'
import { DesktopSidebar } from './components/layout/DesktopSidebar'
import { MobileBottomNav } from './components/layout/MobileBottomNav'
import { MobileTopbar } from './components/layout/MobileTopbar'
import { useReaderData } from './hooks/useReaderData'
import { useTheme } from './hooks/useTheme'
import { BabDetailPage } from './pages/BabDetailPage'
import { HomePage } from './pages/HomePage'
import { ListBabPage } from './pages/ListBabPage'
import { WiridDetailPage } from './pages/WiridDetailPage'

export default function App() {
  const { state, refreshData, syncInfo } = useReaderData()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="app-shell modern-layout">
      <DesktopSidebar
        state={state}
        syncInfo={syncInfo}
        onRefresh={() => refreshData()}
        onToggleTheme={toggleTheme}
        theme={theme}
      />

      <div className="main-view">
        <MobileTopbar syncInfo={syncInfo} onToggleTheme={toggleTheme} theme={theme} />

        <main className="content route-content">
          {state.loading ? (
            <p className="muted">Memuat data...</p>
          ) : (
            <Routes>
              <Route path="/" element={<HomePage state={state} />} />
              <Route path="/list" element={<ListBabPage rows={state.rows} />} />
              <Route path="/list/:babSlug" element={<BabDetailPage rows={state.rows} />} />
              <Route path="/list/:babSlug/:wiridSlug" element={<WiridDetailPage rows={state.rows} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </main>
      </div>

      <MobileBottomNav />
    </div>
  )
}
