import { Outlet } from 'react-router-dom'
import SubNavPendaftaran from './components/SubNavPendaftaran'

/** Sub-nav Item + anak rute (/pendaftaran/item, /set, /kondisi, …) */
export default function PendaftaranItemLayout() {
  return (
    <div className="h-full flex flex-col overflow-hidden min-h-0">
      <div className="flex-shrink-0 px-2 sm:px-3 pt-2 sm:pt-3">
        <SubNavPendaftaran />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <Outlet />
      </div>
    </div>
  )
}
