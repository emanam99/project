import AnimatedOutlet from './AnimatedOutlet'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import PwaInstallPrompt from './PwaInstallPrompt'
import AppHeader from './layout/AppHeader'

/** Pola titik halus (sama ide dengan eBeddien Layout) */
const BG_PATTERN =
  "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")"

export default function Layout() {
  return (
    <div className="flex h-screen max-h-screen min-h-0 overflow-hidden relative w-full">
      <div className="absolute inset-0 bg-linear-to-br from-primary-50 via-white to-primary-100 dark:from-gray-900 dark:via-slate-900 dark:to-slate-950 pointer-events-none">
        <div
          className="absolute inset-0 opacity-[0.06] dark:opacity-[0.09]"
          style={{ backgroundImage: BG_PATTERN }}
          aria-hidden
        />
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary-200/25 dark:bg-primary-800/20 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4" aria-hidden />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-primary-300/20 dark:bg-primary-700/15 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" aria-hidden />
        <div className="absolute top-1/2 left-1/2 w-56 h-56 bg-primary-400/10 dark:bg-primary-600/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" aria-hidden />
      </div>

      <div className="relative z-10 flex flex-1 min-h-0 min-w-0 w-full">
        <Sidebar />

        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          <AppHeader />

          <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-0 relative px-2 sm:px-3">
            <AnimatedOutlet />
          </main>
        </div>
      </div>

      <BottomNav />

      <PwaInstallPrompt />
    </div>
  )
}
