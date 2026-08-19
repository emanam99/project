import AssetPanel from './components/AssetPanel'
import BottomToolbar from './components/BottomToolbar'
import CanvasEditor from './components/CanvasEditor'
import Header from './components/Header'
import LeftRail from './components/LeftRail'
import RightPanel from './components/RightPanel'

export default function App() {
  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[#f4f4f6] text-[#2b2b32]">
      <Header />
      <div className="flex min-h-0 flex-1">
        <LeftRail />
        <AssetPanel />
        <main className="relative min-w-0 flex-1">
          <CanvasEditor />
          <BottomToolbar />
        </main>
        <RightPanel />
      </div>
    </div>
  )
}
