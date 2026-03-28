import { NavLink } from 'react-router-dom'
import { usePendaftaranFiturAccess } from '../../../hooks/usePendaftaranFiturAccess'

const SubNavPendaftaran = () => {
  const access = usePendaftaranFiturAccess()
  const tabs = [
    { path: '/pendaftaran/item', label: 'Item', end: true, can: access.routeItem },
    { path: '/pendaftaran/item/set', label: 'Item Set', can: access.routeManageItemSet },
    { path: '/pendaftaran/item/kondisi', label: 'Kondisi', can: access.routeManageKondisi },
    { path: '/pendaftaran/item/registrasi', label: 'Registrasi', can: access.routeKondisiRegistrasi },
    { path: '/pendaftaran/item/assign', label: 'Assign', can: access.routeAssignItem },
    { path: '/pendaftaran/item/simulasi', label: 'Simulasi', can: access.routeSimulasi }
  ].filter((t) => t.can)

  if (tabs.length === 0) return null

  return (
    <div className="flex flex-nowrap overflow-x-auto bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4 p-1 scrollbar-hide">
      {tabs.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          end={tab.end === true}
          className={({ isActive }) =>
            `flex-1 min-w-[100px] text-center py-2 px-3 text-sm font-medium rounded-md transition-all duration-200 ${
              isActive
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-200'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  )
}

export default SubNavPendaftaran
