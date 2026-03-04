import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../../store/authStore'
import { useRef, useEffect, useState, useMemo } from 'react'
import { getNavFavorites, setNavFavorites, toggleNavFavorite } from '../../utils/navFavorites'

const navItems = [
  {
    path: '/dashboard-pembayaran',
    label: 'Dashboard',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    requiresRole: ['admin_uwaba', 'petugas_uwaba', 'super_admin']
  },
  {
    path: '/uwaba',
    label: 'UWABA',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    requiresRole: ['petugas_uwaba', 'admin_uwaba', 'super_admin']
  },
  {
    path: '/pendaftaran',
    label: 'Pendaftaran',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    requiresRole: ['admin_psb', 'petugas_psb', 'super_admin']
  },
  {
    path: '/laporan',
    label: 'Laporan',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    requiresRole: ['admin_uwaba', 'petugas_uwaba', 'admin_psb', 'petugas_psb', 'super_admin']
  },
  {
    path: '/converter',
    label: 'Converter',
    icon: (
      <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 4l4 4-4 4M20 8H4M8 20l-4-4 4-4M4 16h16" />
      </svg>
    )
  },
  {
    path: '/manage-users',
    label: 'User',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    requiresRole: ['super_admin', 'admin_cashless']
  },
  {
    path: '/pengurus',
    label: 'Pengurus',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    requiresSuperAdmin: true
  }
]

function Navigation() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuthStore()
  
  // Ambil NIS/ID dari URL (pembayaran pakai nis, pendaftaran pakai id; bawa keduanya agar data santri tetap)
  const idFromUrl = searchParams.get('nis') || searchParams.get('id')
  const [showExpandedMenu, setShowExpandedMenu] = useState(false)
  // Default terkunci: saat kunci, bintang (edit favorit) tidak ditampilkan
  const [menuLocked, setMenuLocked] = useState(true)
  
  const userLevel = user?.level?.toLowerCase()
  const userRole = (user?.role_key || user?.level || '').toLowerCase()
  const isAdminOrSuperAdmin = user && (userLevel === 'admin' || userRole === 'admin_uwaba' || userRole === 'admin_psb' || userRole === 'admin_lembaga' || userRole === 'super_admin')
  const isSuperAdmin = user && userRole === 'super_admin'
  
  // Helper untuk cek permission
  const hasPermission = (permission) => {
    if (!user || !user.permissions) {
      return false
    }
    return user.permissions.includes(permission)
  }
  
  // Helper untuk cek role - support multiple roles
  const hasRole = (roles) => {
    if (!user || !roles || !Array.isArray(roles)) {
      return false
    }
    
    // Cek dari all_roles (array semua role user) jika ada
    if (user.all_roles && Array.isArray(user.all_roles) && user.all_roles.length > 0) {
      const userRoles = user.all_roles.map(r => (r || '').toLowerCase()).filter(r => r) // Filter out empty strings
      const allowedRoles = roles.map(r => r.toLowerCase())
      const hasAccess = userRoles.some(userRole => allowedRoles.includes(userRole))
      
      return hasAccess
    }
    
    // Fallback: cek role_key utama
    const userRole = (user.role_key || user.level || '').toLowerCase()
    return roles.map(r => r.toLowerCase()).includes(userRole)
  }
  
  // Tentukan role utama user dengan prioritas: UWABA > PSB > Umroh > Ijin
  const hasUwabaRole = hasRole(['admin_uwaba', 'petugas_uwaba', 'super_admin'])
  const hasPsbRole = hasRole(['admin_psb', 'petugas_psb', 'super_admin'])
  const hasUmrohRole = hasRole(['petugas_umroh', 'super_admin'])
  const hasIjinRole = hasRole(['admin_ijin', 'petugas_ijin', 'super_admin'])
  
  // Grup My Workspace (Beranda + Profil) — ditampilkan untuk semua user di nav bawah
  const profilGroupItems = [
    { path: '/beranda', label: 'Beranda', icon: 'beranda' },
    { path: '/profil', label: 'Profil', icon: 'profil' }
  ]

  // Tentukan nav items berdasarkan role; grup My Workspace (Beranda + Profil) selalu di paling atas
  // Format: [...profilGroupItems, item1, item2, null (menu expanded), item3, item4, ...]
  const getNavItemsByRole = () => {
    let roleItems = []
    if (hasUwabaRole) {
      roleItems = [
        { path: '/dashboard-pembayaran', label: 'Dashboard', icon: 'dashboard' },
        { path: '/uwaba', label: 'UWABA', icon: 'uwaba' },
        null,
        { path: '/khusus', label: 'Khusus', icon: 'khusus' },
        { path: '/tunggakan', label: 'Tunggakan', icon: 'tunggakan' }
      ]
    } else if (hasPsbRole) {
      roleItems = [
        { path: '/dashboard-pendaftaran', label: 'Dashboard', icon: 'dashboard' },
        null,
        { path: '/pendaftaran/data-pendaftar', label: 'Data Pendaftar', icon: 'data' },
        { path: '/laporan', label: 'Laporan', icon: 'laporan' }
      ]
    } else if (hasUmrohRole) {
      roleItems = [
        { path: '/dashboard-umroh', label: 'Dashboard', icon: 'dashboard' },
        { path: '/umroh/jamaah', label: 'Jemaah', icon: 'jamaah' },
        null,
        { path: '/umroh/tabungan', label: 'Tabungan', icon: 'tabungan' },
        { path: '/laporan-umroh', label: 'Laporan', icon: 'laporan' }
      ]
    } else if (hasIjinRole) {
      const items = [
        { path: '/dashboard-ijin', label: 'Dashboard', icon: 'dashboard' },
        { path: '/ijin/data-ijin', label: 'Data Ijin', icon: 'ijin' },
        null
      ]
      if (hasRole(['admin_ijin', 'super_admin'])) {
        items.splice(2, 0, { path: '/ijin/data-boyong', label: 'Data Boyong', icon: 'boyong' })
      }
      roleItems = items
    }
    return [...profilGroupItems, ...roleItems]
  }
  
  const roleBasedNavItems = getNavItemsByRole()
  
  // Helper untuk render icon
  const renderIcon = (iconName) => {
    const iconClass = "w-6 h-6"
    switch(iconName) {
      case 'dashboard':
        return (
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        )
      case 'uwaba':
        return (
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        )
      case 'tunggakan':
        return (
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        )
      case 'khusus':
        return (
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.975-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.95-.69l1.52-4.674z" />
          </svg>
        )
      case 'laporan':
        return (
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )
      case 'pendaftaran':
        return (
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )
      case 'data':
        return (
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
        )
      case 'jamaah':
        return (
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        )
      case 'tabungan':
        return (
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      case 'ijin':
        return (
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )
      case 'boyong':
        return (
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        )
      case 'beranda':
        return (
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        )
      case 'profil':
        return (
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        )
      default:
        return null
    }
  }
  
  // Default menu navbar dari akses role (menu pertama yang dirender dari role)
  const defaultRolePaths = useMemo(() => {
    const fromRole = roleBasedNavItems.filter(item => item !== null).map(item => item.path)
    return fromRole.length > 0 ? fromRole : []
  }, [roleBasedNavItems])
  
  // Expanded menu items — grup My Workspace (Beranda + Profil) di paling atas, lalu grup lain
  const expandedMenuItems = [
    // 0. Grup My Workspace — semua user, paling atas
    {
      path: '/beranda',
      label: 'Beranda',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      )
    },
    {
      path: '/profil',
      label: 'Profil',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      showSeparator: true,
      groupLabel: 'My Workspace'
    },
    // 1. PSB Group: Dashboard Pendaftaran, Pendaftaran, Item, Manage Set, dll
    {
      path: '/dashboard-pendaftaran',
      label: 'Dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
      requiresRole: ['admin_psb', 'petugas_psb', 'super_admin']
    },
    {
      path: '/pendaftaran',
      label: 'Pendaftaran',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      requiresRole: ['admin_psb', 'petugas_psb', 'super_admin']
    },
    {
      path: '/pendaftaran/data-pendaftar',
      label: 'Data Pendaftar',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      requiresRole: ['admin_psb', 'petugas_psb', 'super_admin']
    },
    {
      path: '/pendaftaran/padukan-data',
      label: 'Padukan Data',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
      requiresRole: ['admin_psb', 'super_admin']
    },
    {
      path: '/pendaftaran/pengaturan',
      label: 'Pengaturan',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      requiresRole: ['super_admin']
    },
    {
      path: '/pendaftaran/item',
      label: 'Item',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      requiresRole: ['admin_psb', 'super_admin'],
      showSeparator: true, // Show separator after this group
      groupLabel: 'Pendaftaran' // Label untuk grup
    },
    // 2. UWABA Group: Dashboard Pembayaran, Manage Data, Laporan, UWABA, Khusus, Tunggakan
    {
      path: '/dashboard-pembayaran',
      label: 'Dashboard Pembayaran',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
      requiresRole: ['admin_uwaba', 'petugas_uwaba', 'super_admin']
    },
    {
      path: '/pembayaran/manage-data',
      label: 'Manage Data',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      requiresRole: ['petugas_uwaba', 'admin_uwaba', 'super_admin']
    },
    {
      path: '/laporan',
      label: 'Laporan',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      requiresRole: ['admin_uwaba', 'petugas_uwaba', 'admin_psb', 'petugas_psb', 'super_admin']
    },
    {
      path: '/uwaba',
      label: 'UWABA',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      requiresRole: ['petugas_uwaba', 'admin_uwaba', 'super_admin']
    },
    {
      path: '/khusus',
      label: 'Khusus',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.975-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.95-.69l1.52-4.674z" />
        </svg>
      ),
      requiresRole: ['petugas_uwaba', 'admin_uwaba', 'super_admin']
    },
    {
      path: '/tunggakan',
      label: 'Tunggakan',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
      requiresRole: ['petugas_uwaba', 'admin_uwaba', 'super_admin'],
      showSeparator: true,
      groupLabel: 'UWABA'
    },
    // UGT Group: Data Madrasah, Koordinator
    {
      path: '/ugt/data-madrasah',
      label: 'Data Madrasah',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      requiresRole: ['admin_ugt', 'koordinator_ugt', 'super_admin'],
      showSeparator: false,
      groupLabel: 'UGT'
    },
    {
      path: '/koordinator',
      label: 'Koordinator',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      requiresRole: ['admin_ugt', 'super_admin'],
      showSeparator: true,
      groupLabel: 'UGT'
    },
    // Cashless Group: Data Toko, Akun Cashless, Pengaturan Cashless (showSeparator di item terakhir agar semua masuk grup Cashless)
    {
      path: '/cashless/data-toko',
      label: 'Data Toko',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      requiresRole: ['admin_cashless', 'super_admin']
    },
    {
      path: '/cashless/topup',
      label: 'Top Up Dana',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      requiresRole: ['admin_cashless', 'petugas_cashless', 'super_admin']
    },
    {
      path: '/cashless/pembuatan-akun',
      label: 'Akun Cashless',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5M10 6V6a2 2 0 012-2h2a2 2 0 012 2v0M10 6h4m-4 6h4m-4 2h2m4 0h2" />
        </svg>
      ),
      requiresRole: ['admin_cashless', 'super_admin']
    },
    {
      path: '/cashless/pengaturan',
      label: 'Pengaturan Cashless',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      requiresRole: ['admin_cashless', 'super_admin'],
      showSeparator: true,
      groupLabel: 'Cashless'
    },
  // 3. Finance Group: Dashboard Keuangan, Pengeluaran, Pemasukan, Aktivitas
    {
      path: '/dashboard-keuangan',
      label: 'Dash Keuangan',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M15 3h4v4"
          />
        </svg>
      ),
      requiresRole: ['admin_uwaba', 'super_admin']
    },
    {
      path: '/pengeluaran',
      label: 'Pengeluaran',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      requiresRole: ['admin_uwaba', 'super_admin']
    },
    {
      path: '/pemasukan',
      label: 'Pemasukan',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      requiresRole: ['admin_uwaba', 'super_admin']
    },
    {
      path: '/aktivitas',
      label: 'Aktivitas',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      requiresRole: ['admin_uwaba', 'super_admin']
    },
    {
      path: '/aktivitas-tahun-ajaran',
      label: 'Aktivitas TA',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      requiresRole: ['admin_uwaba', 'super_admin'],
      showSeparator: true, // Show separator after this group
      groupLabel: 'Keuangan' // Label untuk grup
    },
    // 4. Umroh Group: hanya super_admin dan petugas_umroh
    {
      path: '/dashboard-umroh',
      label: 'Dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
      requiresRole: ['petugas_umroh', 'super_admin']
    },
    {
      path: '/umroh/jamaah',
      label: 'Jamaah',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      requiresRole: ['petugas_umroh', 'super_admin']
    },
    {
      path: '/umroh/tabungan',
      label: 'Tabungan',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      requiresRole: ['petugas_umroh', 'super_admin']
    },
    {
      path: '/laporan-umroh',
      label: 'Laporan Umroh',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      requiresRole: ['petugas_umroh', 'super_admin'],
      showSeparator: true, // Show separator after this group
      groupLabel: 'Umroh' // Label untuk grup
    },
    // 5. Ijin Group: Dashboard Ijin, Data Ijin
    {
      path: '/dashboard-ijin',
      label: 'Dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
      requiresRole: ['admin_ijin', 'petugas_ijin', 'super_admin']
    },
    {
      path: '/ijin/data-ijin',
      label: 'Data Ijin',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      requiresRole: ['admin_ijin', 'petugas_ijin', 'super_admin']
    },
    {
      path: '/ijin/data-boyong',
      label: 'Data Boyong',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
      ),
      requiresRole: ['admin_ijin', 'super_admin'],
      showSeparator: true,
      groupLabel: 'Ijin'
    },
    // ========== Grup Kalender (khusus, terpisah dari Ijin) ==========
    {
      path: '/kalender',
      label: 'Kalender',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )
    },
    {
      path: '/kalender/hari-penting',
      label: 'Hari Penting',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.975-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.95-.69l1.52-4.674z" />
        </svg>
      )
    },
    {
      path: '/converter',
      label: 'Converter',
      icon: (
        <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 4l4 4-4 4M20 8H4M8 20l-4-4 4-4M4 16h16" />
        </svg>
      )
    },
    {
      path: '/kalender/pengaturan',
      label: 'Pengaturan Kalender',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      requiresRole: ['admin_kalender', 'super_admin'],
      showSeparator: true,
      groupLabel: 'Kalender'
    },
    // 6. Setting (Dashboard Umum, User) → Grup Lembaga (Pengurus, Lembaga) → Jabatan, ...
    {
      path: '/dashboard-umum',
      label: 'Dashboard Umum',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
      requiresRole: ['admin_uwaba', 'petugas_uwaba', 'super_admin']
    },
    {
      path: '/manage-users',
      label: 'User',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      requiresRole: ['super_admin', 'admin_cashless'],
      showSeparator: true
    },
    // Grup Domisili
    {
      path: '/domisili/daerah',
      label: 'Daerah',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      requiresSuperAdmin: true
    },
    {
      path: '/domisili/kamar',
      label: 'Kamar',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
      requiresSuperAdmin: true,
      showSeparator: true,
      groupLabel: 'Domisili'
    },
    // Grup Lembaga
    {
      path: '/pengurus',
      label: 'Pengurus',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      requiresSuperAdmin: true
    },
    {
      path: '/lembaga',
      label: 'Lembaga',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      requiresSuperAdmin: true
    },
    {
      path: '/rombel',
      label: 'Rombel',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      requiresSuperAdmin: true
    },
    {
      path: '/rombel-santri',
      label: 'Rombel Santri',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      requiresSuperAdmin: true
    },
    {
      path: '/manage-jabatan',
      label: 'Jabatan',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      requiresSuperAdmin: true,
      showSeparator: true,
      groupLabel: 'Lembaga'
    },
    {
      path: '/manage-uploads',
      label: 'Kelola File',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      requiresSuperAdmin: true
    },
    {
      path: '/juara/data-juara',
      label: 'Data Juara',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
      ),
      requiresSuperAdmin: true,
      showSeparator: true,
      groupLabel: 'Setting'
    },
    // Grup Tentang — semua role; showSeparator + groupLabel di item terakhir agar satu grup
    {
      path: '/tentang',
      label: 'Tentang',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    {
      path: '/version',
      label: 'Versi',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      )
    },
    {
      path: '/info-aplikasi',
      label: 'Info Aplikasi',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      showSeparator: true,
      groupLabel: 'Tentang'
    }
  ]
  
  // Indeks grup per item (berdasarkan urutan asli expandedMenuItems); pembatas selalu antara beda grup
  const expandedGroupIndices = useMemo(() => {
    const out = []
    let g = 0
    for (let i = 0; i < expandedMenuItems.length; i++) {
      out[i] = g
      if (expandedMenuItems[i].showSeparator) g++
    }
    return out
  }, [])

  const expandedGroupLabels = useMemo(() => {
    const labels = {}
    expandedMenuItems.forEach((item, i) => {
      if (item.showSeparator && item.groupLabel) labels[expandedGroupIndices[i]] = item.groupLabel
    })
    return labels
  }, [expandedGroupIndices])

  // Filter expanded menu items dan bawa groupIndex agar pembatas antar grup selalu tampil
  const filteredExpandedItems = useMemo(() => {
    const canSee = (item) => {
      if (isSuperAdmin) return true // Super Admin bisa lihat semua menu (termasuk Umroh, Ijin, dll)
      if (item.requiresRole) return hasRole(item.requiresRole)
      if (item.requiresSuperAdmin) return isSuperAdmin
      if (item.requiresAdmin) return isAdminOrSuperAdmin
      if (item.requiresPermission) return user && hasPermission(item.requiresPermission)
      return true
    }
    return expandedMenuItems
      .map((item, i) => ({ item, groupIndex: expandedGroupIndices[i] }))
      .filter(({ item }) => canSee(item))
  }, [user, expandedGroupIndices, hasRole, isSuperAdmin, isAdminOrSuperAdmin, hasPermission])
  
  // Check if user has any expanded menu items (including permission-based items)
  const hasExpandedMenuItems = filteredExpandedItems.length > 0

  // Daftar path yang boleh tampil di navbar (role + expanded)
  const allAllowedNavPaths = useMemo(() => {
    const fromExpanded = filteredExpandedItems.map(e => e.item.path)
    const combined = [...defaultRolePaths, ...fromExpanded]
    return [...new Set(combined)]
  }, [defaultRolePaths, filteredExpandedItems])

  // Map path -> { path, label, icon } untuk item navbar (dari role + expanded)
  const itemsForNavbar = useMemo(() => {
    const map = {}
    filteredExpandedItems.forEach(({ item }) => {
      map[item.path] = { path: item.path, label: item.label, icon: item.icon }
    })
    roleBasedNavItems.forEach(entry => {
      if (entry && !map[entry.path]) {
        map[entry.path] = {
          path: entry.path,
          label: entry.label,
          icon: renderIcon(entry.icon)
        }
      }
    })
    return map
  }, [filteredExpandedItems, roleBasedNavItems])

  // Favorit navbar: path yang ditampilkan di bottom nav (custom per user, default = menu pertama dari role)
  const [navFavorites, setNavFavoritesState] = useState([])

  useEffect(() => {
    if (!user?.id) return
    const saved = getNavFavorites(user.id)
    const defaultPaths = defaultRolePaths.length ? defaultRolePaths : allAllowedNavPaths.slice(0, 5)
    if (saved && saved.length > 0) {
      const filtered = saved.filter(p => allAllowedNavPaths.includes(p))
      setNavFavoritesState(filtered.length ? filtered : defaultPaths)
    } else {
      setNavFavoritesState(defaultPaths)
    }
  }, [user?.id, defaultRolePaths.length, filteredExpandedItems.length])

  const handleToggleNavFavorite = (path, add) => {
    const next = toggleNavFavorite(navFavorites, path, add)
    setNavFavorites(user?.id, next)
    setNavFavoritesState(next)
  }

  // Item yang tampil di navbar: urutan sesuai favorit user (default = menu pertama dari role)
  const filteredNavItems = useMemo(() => {
    const paths = navFavorites.length > 0 ? navFavorites : defaultRolePaths.length ? defaultRolePaths : allAllowedNavPaths.slice(0, 5)
    return paths.map(path => itemsForNavbar[path]).filter(Boolean)
  }, [navFavorites, defaultRolePaths, allAllowedNavPaths, itemsForNavbar])

  // Flag untuk menentukan apakah menggunakan role-based navigation
  const usingRoleBasedNav = roleBasedNavItems.length > 0

  const isActivePath = (path) => {
    if (path === '/dashboard') {
      return location.pathname === '/' || location.pathname === '/dashboard'
    }
    if (path === '/dashboard-pendaftaran') {
      return location.pathname === '/dashboard-pendaftaran'
    }
    if (path === '/dashboard-umroh') {
      return location.pathname === '/dashboard-umroh'
    }
    if (path === '/dashboard-ijin') {
      return location.pathname === '/dashboard-ijin'
    }
    // Exact match for most paths
    if (location.pathname === path) {
      return true
    }
    // Special handling for /pendaftaran - also match sub-paths (tapi bukan /pendaftaran/data)
    if (path === '/pendaftaran' && location.pathname.startsWith('/pendaftaran') && location.pathname !== '/pendaftaran/data') {
      return true
    }
    // Special handling for /pendaftaran/data
    if (path === '/pendaftaran/data' && location.pathname === '/pendaftaran/data') {
      return true
    }
    // Special handling for /pendaftaran/data-pendaftar
    if (path === '/pendaftaran/data-pendaftar' && location.pathname === '/pendaftaran/data-pendaftar') {
      return true
    }
    // Special handling for /pendaftaran/padukan-data
    if (path === '/pendaftaran/padukan-data' && location.pathname === '/pendaftaran/padukan-data') {
      return true
    }
    // Special handling for /pendaftaran/pengaturan
    if (path === '/pendaftaran/pengaturan' && location.pathname === '/pendaftaran/pengaturan') {
      return true
    }
    // Special handling for /umroh - also match sub-paths
    if (path === '/umroh/jamaah' && location.pathname.startsWith('/umroh')) {
      return true
    }
    // Special handling for /laporan-umroh
    if (path === '/laporan-umroh' && location.pathname === '/laporan-umroh') {
      return true
    }
    // Data Ijin dan Data Boyong: exact path agar hanya satu yang aktif
    if (path === '/ijin/data-ijin') return location.pathname === '/ijin/data-ijin'
    if (path === '/ijin/data-boyong') return location.pathname === '/ijin/data-boyong'
    // Kalender: exact path
    if (path === '/kalender') return location.pathname === '/kalender'
    if (path === '/converter') return location.pathname === '/converter'
    if (path === '/kalender/hari-penting') return location.pathname === '/kalender/hari-penting'
    if (path === '/kalender/pengaturan') return location.pathname === '/kalender/pengaturan'
    // Special handling for /juara - also match sub-paths
    if (path === '/juara/data-juara' && location.pathname.startsWith('/juara')) {
      return true
    }
    // Special handling for /aktivitas-tahun-ajaran
    if (path === '/aktivitas-tahun-ajaran' && location.pathname === '/aktivitas-tahun-ajaran') {
      return true
    }
    // UGT - Data Madrasah, Koordinator
    if (path === '/ugt/data-madrasah' && location.pathname === '/ugt/data-madrasah') {
      return true
    }
    if (path === '/koordinator' && location.pathname === '/koordinator') {
      return true
    }
    if (path === '/cashless/data-toko' && location.pathname === '/cashless/data-toko') {
      return true
    }
    if (path === '/cashless/pembuatan-akun' && location.pathname === '/cashless/pembuatan-akun') {
      return true
    }
    if (path === '/cashless/pengaturan' && location.pathname === '/cashless/pengaturan') {
      return true
    }
    if (path === '/cashless/topup' && location.pathname === '/cashless/topup') {
      return true
    }
    if (path === '/beranda') return location.pathname === '/beranda'
    if (path === '/profil') return location.pathname === '/profil' || location.pathname.startsWith('/profil/')
    return false
  }

  // Split nav items for positioning expanded menu in the middle
  // Jika menggunakan role-based nav, menu expanded selalu di tengah (setelah 2 item pertama)
  let firstHalfNavItems, secondHalfNavItems
  if (usingRoleBasedNav) {
    // Role-based: [item1, item2, null, item3, item4] -> firstHalf: [item1, item2], secondHalf: [item3, item4]
    // Menu expanded akan muncul di antara firstHalf dan secondHalf
    firstHalfNavItems = filteredNavItems.slice(0, 2)
    secondHalfNavItems = filteredNavItems.slice(2)
  } else {
    // Default: split di tengah
    const midPoint = Math.ceil(filteredNavItems.length / 2)
    firstHalfNavItems = filteredNavItems.slice(0, midPoint)
    secondHalfNavItems = filteredNavItems.slice(midPoint)
  }
  
  // Calculate width based on number of items (add 1 if expanded menu exists)
  // Untuk layar pendek atau menu panjang, gunakan min-width agar bisa di-scroll
  const totalItems = filteredNavItems.length + (hasExpandedMenuItems ? 1 : 0)
  const minItemWidth = 70 // Minimum width per item in pixels (diperkecil dari 80)
  const calculatedWidth = totalItems > 0 ? `${100 / totalItems}%` : '20%'
  // Jika lebih dari 5 items, gunakan min-width untuk scroll, jika tidak gunakan percentage
  const itemWidth = totalItems > 5 ? `${minItemWidth}px` : calculatedWidth
  
  const navRef = useRef(null)
  const expandedMenuRef = useRef(null)
  const expandedMenuScrollRef = useRef(null)
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })
  const [showScrollbar, setShowScrollbar] = useState(false)
  const [showExpandedScrollbar, setShowExpandedScrollbar] = useState(false)
  const scrollTimeoutRef = useRef(null)
  const expandedScrollTimeoutRef = useRef(null)
  
  // Check if any expanded menu item is active
  const isExpandedMenuActive = filteredExpandedItems.some(item => isActivePath(item.path))
  
  // Find active index for sliding indicator - must match the actual render order
  // Render order: firstHalfNavItems -> Expanded Menu -> secondHalfNavItems
  let activeIndex = -1
  const firstHalfActiveIndex = firstHalfNavItems.findIndex(item => isActivePath(item.path))
  const secondHalfActiveIndex = secondHalfNavItems.findIndex(item => isActivePath(item.path))
  
  // Priority: Check navItems first (they are in the main nav bar)
  if (firstHalfActiveIndex >= 0) {
    activeIndex = firstHalfActiveIndex
  } else if (secondHalfActiveIndex >= 0) {
    activeIndex = firstHalfNavItems.length + (hasExpandedMenuItems ? 1 : 0) + secondHalfActiveIndex
  } else if (isExpandedMenuActive) {
    // Only use expanded menu index if no navItems match
    activeIndex = firstHalfNavItems.length
  }
  
  // Close expanded menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (expandedMenuRef.current && !expandedMenuRef.current.contains(event.target)) {
        setShowExpandedMenu(false)
      }
    }
    
    if (showExpandedMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showExpandedMenu])
  
  // Update indicator position when active tab changes
  useEffect(() => {
    if (navRef.current && activeIndex >= 0) {
      const navItems = navRef.current.querySelectorAll('[data-nav-item]')
      if (navItems[activeIndex]) {
        const activeItem = navItems[activeIndex]
        const rect = activeItem.getBoundingClientRect()
        const navRect = navRef.current.getBoundingClientRect()
        setIndicatorStyle({
          left: rect.left - navRect.left,
          width: rect.width
        })
      }
    }
  }, [location.pathname, activeIndex, firstHalfNavItems.length, secondHalfNavItems.length, hasExpandedMenuItems])
  
  // Close menu when route changes
  useEffect(() => {
    setShowExpandedMenu(false)
  }, [location.pathname])
  
  // Handle scroll untuk auto-hide scrollbar (horizontal nav)
  const handleNavScroll = () => {
    setShowScrollbar(true)
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    scrollTimeoutRef.current = setTimeout(() => {
      setShowScrollbar(false)
    }, 1500) // Hide scrollbar setelah 1.5 detik tidak scroll
  }

  // Handle scroll untuk auto-hide scrollbar (expanded menu)
  const handleExpandedMenuScroll = () => {
    setShowExpandedScrollbar(true)
    if (expandedScrollTimeoutRef.current) {
      clearTimeout(expandedScrollTimeoutRef.current)
    }
    expandedScrollTimeoutRef.current = setTimeout(() => {
      setShowExpandedScrollbar(false)
    }, 1500) // Hide scrollbar setelah 1.5 detik tidak scroll
  }

  useEffect(() => {
    const nav = navRef.current
    if (nav) {
      nav.addEventListener('scroll', handleNavScroll)
      return () => {
        nav.removeEventListener('scroll', handleNavScroll)
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current)
        }
      }
    }
  }, [])

  useEffect(() => {
    const expandedMenu = expandedMenuScrollRef.current
    if (expandedMenu) {
      expandedMenu.addEventListener('scroll', handleExpandedMenuScroll)
      expandedMenu.addEventListener('mouseenter', () => setShowExpandedScrollbar(true))
      expandedMenu.addEventListener('mouseleave', () => {
        setTimeout(() => setShowExpandedScrollbar(false), 500)
      })
      return () => {
        expandedMenu.removeEventListener('scroll', handleExpandedMenuScroll)
        expandedMenu.removeEventListener('mouseenter', () => setShowExpandedScrollbar(true))
        expandedMenu.removeEventListener('mouseleave', () => setShowExpandedScrollbar(false))
        if (expandedScrollTimeoutRef.current) {
          clearTimeout(expandedScrollTimeoutRef.current)
        }
      }
    }
  }, [showExpandedMenu])

  return (
    <nav 
      ref={navRef}
      className="sm:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)] flex justify-around z-[100] border-t border-gray-200 dark:border-gray-700 overflow-x-auto"
      style={{ 
        position: 'fixed', 
        bottom: 0, 
        left: 0, 
        right: 0,
        height: '64px',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
        scrollbarWidth: showScrollbar ? 'thin' : 'none', // Firefox - thin saat show, none saat hide
        msOverflowStyle: 'none', // IE and Edge
        WebkitOverflowScrolling: 'touch' // iOS smooth scrolling
      }}
      onScroll={handleNavScroll}
    >
      <style>{`
        /* Horizontal nav scrollbar - kecil, sesuai tema, auto-hide */
        nav::-webkit-scrollbar {
          height: ${showScrollbar ? '3px' : '0px'};
          transition: height 0.3s ease;
        }
        nav::-webkit-scrollbar-track {
          background: transparent;
        }
        nav::-webkit-scrollbar-thumb {
          background: ${showScrollbar ? 'rgba(156, 163, 175, 0.4)' : 'transparent'};
          border-radius: 3px;
          transition: background 0.3s ease;
        }
        nav::-webkit-scrollbar-thumb:hover {
          background: rgba(156, 163, 175, 0.6);
        }
        /* Dark mode untuk horizontal nav scrollbar */
        .dark nav::-webkit-scrollbar-thumb {
          background: ${showScrollbar ? 'rgba(107, 114, 128, 0.4)' : 'transparent'};
        }
        .dark nav::-webkit-scrollbar-thumb:hover {
          background: rgba(107, 114, 128, 0.6);
        }
      `}</style>
      {/* Sliding Indicator */}
      <motion.div
        className="absolute top-0 h-1 bg-gradient-to-r from-teal-500 to-teal-600 rounded-b-full pointer-events-none"
        initial={false}
        animate={{
          left: indicatorStyle.left,
          width: indicatorStyle.width
        }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 30
        }}
        style={{
          boxShadow: '0 2px 8px rgba(20, 184, 166, 0.4)',
          zIndex: 10
        }}
      />
      
      {/* First Half Nav Items */}
      {firstHalfNavItems.map((item, index) => {
        const isActive = isActivePath(item.path)
        
        // Path yang relevan untuk menyertakan NIS agar data santri tetap saat pindah (pendaftaran & pembayaran baca nis)
        const pathsWithNis = ['/pendaftaran', '/uwaba', '/tunggakan', '/khusus']
        const shouldIncludeNis = pathsWithNis.includes(item.path) && idFromUrl && /^\d{7}$/.test(idFromUrl)
        const linkTo = shouldIncludeNis ? `${item.path}?nis=${idFromUrl}` : item.path
        
        return (
            <NavLink
            key={item.path}
            to={linkTo}
            data-nav-item
            className={`relative flex flex-col items-center justify-center py-1.5 px-2 transition-all duration-300 ${
              isActive 
                ? 'text-teal-600 dark:text-teal-400' 
                : 'text-gray-500 dark:text-gray-400'
            }`}
            style={{ width: itemWidth }}
          >
            {/* Active Background */}
            <AnimatePresence>
              {isActive && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  className="absolute left-0 right-0 top-0 bottom-0 bg-teal-50 dark:bg-teal-900/20 rounded-t-2xl pointer-events-none overflow-hidden"
                  style={{
                    marginLeft: '8px',
                    marginRight: '8px',
                    zIndex: 1
                  }}
                />
              )}
            </AnimatePresence>
            
            {/* Icon di atas */}
            <motion.div
              animate={{ 
                scale: isActive ? 1.15 : 1,
                y: isActive ? -2 : 0
              }}
              transition={{ 
                type: 'spring', 
                stiffness: 400, 
                damping: 25 
              }}
              className="relative z-10 mb-0.5"
            >
              <div className="w-5 h-5">
                {item.icon}
              </div>
            </motion.div>
            
            {/* Nama di bawah icon */}
            <motion.span 
              animate={{ 
                fontSize: isActive ? '0.625rem' : '0.5625rem',
                fontWeight: isActive ? 600 : 500
              }}
              transition={{ 
                type: 'spring', 
                stiffness: 400, 
                damping: 25 
              }}
              className="relative z-10 leading-tight text-center"
            >
              {item.label}
            </motion.span>
          </NavLink>
        )
      })}
      
      {/* Arrow Button for Expanded Menu (Admin/Super Admin or users with permissions) - Placed in the middle */}
      {hasExpandedMenuItems && (
        <div className="relative flex items-center justify-center flex-shrink-0" ref={expandedMenuRef} style={{ width: itemWidth, minWidth: itemWidth, height: '64px' }}>
          <button
            onClick={() => setShowExpandedMenu(!showExpandedMenu)}
            data-nav-item
            className={`relative flex flex-col items-center justify-center py-1.5 px-2 transition-all duration-300 w-full ${
              showExpandedMenu || isExpandedMenuActive
                ? 'text-teal-600 dark:text-teal-400' 
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {/* Active Background */}
            <AnimatePresence>
              {(showExpandedMenu || isExpandedMenuActive) && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  className="absolute left-0 right-0 top-0 bottom-0 bg-teal-50 dark:bg-teal-900/20 rounded-t-2xl pointer-events-none overflow-hidden"
                  style={{
                    marginLeft: '8px',
                    marginRight: '8px',
                    zIndex: 1
                  }}
                />
              )}
            </AnimatePresence>
            
            {/* Icon di atas, nama di bawah */}
            <motion.div
              animate={{ 
                scale: (showExpandedMenu || isExpandedMenuActive) ? 1.15 : 1,
                y: (showExpandedMenu || isExpandedMenuActive) ? -2 : 0
              }}
              transition={{ 
                type: 'spring', 
                stiffness: 400, 
                damping: 25 
              }}
              className="relative z-10 w-5 h-5 mb-0.5"
            >
              <AnimatePresence mode="wait">
                {showExpandedMenu ? (
                  // X Icon (when menu is open)
                  <motion.svg
                    key="close"
                    initial={{ opacity: 0, rotate: -90, scale: 0.8 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    exit={{ opacity: 0, rotate: 90, scale: 0.8 }}
                    transition={{ 
                      type: 'spring', 
                      stiffness: 400, 
                      damping: 25,
                      duration: 0.2
                    }}
                    className="w-5 h-5" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                    strokeWidth="2.5"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </motion.svg>
                ) : (
                  // Grid Icon (when menu is closed)
                  <motion.svg
                    key="grid"
                    initial={{ opacity: 0, rotate: 90, scale: 0.8 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    exit={{ opacity: 0, rotate: -90, scale: 0.8 }}
                    transition={{ 
                      type: 'spring', 
                      stiffness: 400, 
                      damping: 25,
                      duration: 0.2
                    }}
                    className="w-5 h-5" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                    strokeWidth="2.5"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </motion.svg>
                )}
              </AnimatePresence>
            </motion.div>
            
            {/* Label */}
            <motion.span 
              animate={{ 
                fontSize: (showExpandedMenu || isExpandedMenuActive) ? '0.625rem' : '0.5625rem',
                fontWeight: (showExpandedMenu || isExpandedMenuActive) ? 600 : 500
              }}
              transition={{ 
                type: 'spring', 
                stiffness: 400, 
                damping: 25 
              }}
              className="relative z-10 leading-tight"
            >
              Menu
            </motion.span>
          </button>
          
          {/* Expanded Menu */}
          <AnimatePresence>
            {showExpandedMenu && (
              <>
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setShowExpandedMenu(false)}
                  className="fixed inset-0 bg-black bg-opacity-30 z-40"
                  style={{ top: 0, bottom: '64px' }}
                />
                {/* Menu Container */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  className="fixed bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-50"
                  style={{
                    bottom: 'calc(64px + 0.5rem)',
                    left: '5vw',
                    right: '5vw',
                    width: '90vw',
                    maxWidth: '400px',
                    maxHeight: 'calc(100vh - 64px - 100px - 1rem)', // Kurangi 100px untuk header
                    transform: 'translateX(-50%)'
                  }}
                >
                <div 
                  ref={expandedMenuScrollRef}
                  className="p-4 overflow-y-auto expanded-menu-scroll" 
                  style={{ 
                    maxHeight: 'calc(100vh - 64px - 100px - 1rem - 2rem)', // Kurangi 100px untuk header
                    scrollbarWidth: showExpandedScrollbar ? 'thin' : 'none',
                    msOverflowStyle: 'none'
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 px-0.5 flex-1">
                      {menuLocked ? 'Menu dikunci. Aktifkan edit untuk mengatur tampilan navbar.' : 'Sentuh bintang pada menu untuk menampilkan di navbar bawah.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setMenuLocked(!menuLocked)}
                      className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        menuLocked
                          ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                          : 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 hover:bg-teal-200 dark:hover:bg-teal-900/60'
                      }`}
                      title={menuLocked ? 'Buka untuk mode edit menu navbar' : 'Kunci menu'}
                    >
                      {menuLocked ? (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          Terkunci
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                          </svg>
                          Mode Edit
                        </>
                      )}
                    </button>
                  </div>
                  <style>{`
                    /* Expanded menu scrollbar - kecil, sesuai tema, auto-hide */
                    .expanded-menu-scroll::-webkit-scrollbar {
                      width: ${showExpandedScrollbar ? '3px' : '0px'};
                      transition: width 0.3s ease;
                    }
                    .expanded-menu-scroll::-webkit-scrollbar-track {
                      background: transparent;
                    }
                    .expanded-menu-scroll::-webkit-scrollbar-thumb {
                      background: ${showExpandedScrollbar ? 'rgba(156, 163, 175, 0.4)' : 'transparent'};
                      border-radius: 3px;
                      transition: background 0.3s ease;
                    }
                    .expanded-menu-scroll::-webkit-scrollbar-thumb:hover {
                      background: rgba(156, 163, 175, 0.6);
                    }
                    /* Dark mode untuk expanded menu scrollbar */
                    .dark .expanded-menu-scroll::-webkit-scrollbar-thumb {
                      background: ${showExpandedScrollbar ? 'rgba(107, 114, 128, 0.4)' : 'transparent'};
                    }
                    .dark .expanded-menu-scroll::-webkit-scrollbar-thumb:hover {
                      background: rgba(107, 114, 128, 0.6);
                    }
                  `}</style>
                  {/* Group items by groupIndex: pembatas selalu tampil antar grup */}
                  {(() => {
                    const groups = []
                    let currentGroup = []
                    let currentGroupIndex = null
                    
                    filteredExpandedItems.forEach((entry, index) => {
                      const { item, groupIndex } = entry
                      if (currentGroupIndex !== null && groupIndex !== currentGroupIndex) {
                        groups.push({
                          items: currentGroup,
                          showSeparator: true,
                          groupLabel: expandedGroupLabels[currentGroupIndex] ?? null
                        })
                        currentGroup = []
                      }
                      currentGroupIndex = groupIndex
                      currentGroup.push(item)
                    })
                    
                    if (currentGroup.length > 0) {
                      const isLastGroup = currentGroup.some(item => item.requiresSuperAdmin)
                      groups.push({
                        items: currentGroup,
                        showSeparator: false,
                        groupLabel: isLastGroup ? 'Setting' : (expandedGroupLabels[currentGroupIndex] ?? null)
                      })
                    }
                    
                    return groups.map((group, groupIndex) => (
                      <div key={groupIndex}>
                        {/* Nama grup di atas grup icon, tidak lurus dengan garis */}
                        {group.groupLabel && (
                          <div className="mb-2 mt-3 first:mt-0">
                            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              {group.groupLabel}
                            </span>
                          </div>
                        )}
                        <div className="grid grid-cols-3 gap-2">
                          {group.items.map((item) => {
                            const isActive = isActivePath(item.path)
                            const isPinned = navFavorites.includes(item.path)
                            // Path yang relevan untuk menyertakan NIS agar data santri tetap saat pindah
                            const pathsWithNis = ['/pendaftaran', '/uwaba', '/tunggakan', '/khusus']
                            const shouldIncludeNis = pathsWithNis.includes(item.path) && idFromUrl && /^\d{7}$/.test(idFromUrl)
                            const targetPath = shouldIncludeNis ? `${item.path}?nis=${idFromUrl}` : item.path
                            
                            return (
                              <div key={item.path} className="relative flex flex-col items-center">
                                <button
                                  onClick={() => {
                                    navigate(targetPath)
                                    setShowExpandedMenu(false)
                                  }}
                                  className={`flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-lg transition-colors w-full ${
                                    isActive
                                      ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400'
                                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                  }`}
                                >
                                  <div className="w-5 h-5">
                                    {item.icon}
                                  </div>
                                  <span className="text-xs font-medium text-center leading-tight">{item.label}</span>
                                </button>
                                {!menuLocked && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleToggleNavFavorite(item.path, !isPinned)
                                    }}
                                    className="absolute top-1 right-1 p-0.5 rounded-full text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                                    title={isPinned ? 'Sembunyikan dari navbar' : 'Tampilkan di navbar'}
                                    aria-label={isPinned ? 'Sembunyikan dari navbar' : 'Tampilkan di navbar'}
                                  >
                                    {isPinned ? (
                                      <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                      </svg>
                                    ) : (
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.975-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.95-.69l1.52-4.674z" />
                                      </svg>
                                    )}
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        {/* Garis pemisah di bawah grup (tanpa label di garis) */}
                        {group.showSeparator && groupIndex < groups.length - 1 && (
                          <div className="border-t border-gray-200 dark:border-gray-700 my-3" />
                        )}
                      </div>
                    ))
                  })()}
                </div>
              </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      )}
      
      {/* Second Half Nav Items */}
      {secondHalfNavItems.map((item, index) => {
        const isActive = isActivePath(item.path)
        
        // Path yang relevan untuk menyertakan NIS agar data santri tetap saat pindah (pendaftaran & pembayaran baca nis)
        const pathsWithNis = ['/pendaftaran', '/uwaba', '/tunggakan', '/khusus']
        const shouldIncludeNis = pathsWithNis.includes(item.path) && idFromUrl && /^\d{7}$/.test(idFromUrl)
        const linkTo = shouldIncludeNis ? `${item.path}?nis=${idFromUrl}` : item.path
        
        return (
            <NavLink
            key={item.path}
            to={linkTo}
            data-nav-item
            className={`relative flex flex-col items-center justify-center py-1.5 px-2 transition-all duration-300 flex-shrink-0 ${
              isActive 
                ? 'text-teal-600 dark:text-teal-400' 
                : 'text-gray-500 dark:text-gray-400'
            }`}
            style={{ width: itemWidth, minWidth: itemWidth }}
          >
            {/* Active Background */}
            <AnimatePresence>
              {isActive && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  className="absolute left-0 right-0 top-0 bottom-0 bg-teal-50 dark:bg-teal-900/20 rounded-t-2xl pointer-events-none overflow-hidden"
                  style={{
                    marginLeft: '8px',
                    marginRight: '8px',
                    zIndex: 1
                  }}
                />
              )}
            </AnimatePresence>
            
            {/* Icon di atas */}
            <motion.div
              animate={{ 
                scale: isActive ? 1.15 : 1,
                y: isActive ? -2 : 0
              }}
              transition={{ 
                type: 'spring', 
                stiffness: 400, 
                damping: 25 
              }}
              className="relative z-10 mb-0.5"
            >
              <div className="w-5 h-5">
                {item.icon}
              </div>
            </motion.div>
            
            {/* Nama di bawah icon */}
            <motion.span 
              animate={{ 
                fontSize: isActive ? '0.625rem' : '0.5625rem',
                fontWeight: isActive ? 600 : 500
              }}
              transition={{ 
                type: 'spring', 
                stiffness: 400, 
                damping: 25 
              }}
              className="relative z-10 leading-tight text-center"
            >
              {item.label}
            </motion.span>
          </NavLink>
        )
      })}
    </nav>
  )
}

export default Navigation

