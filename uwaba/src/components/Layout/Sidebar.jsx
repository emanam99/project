import { NavLink, useLocation, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useSidebarStore } from '../../store/sidebarStore'
import { getGambarUrl } from '../../config/images'

// Label tiap grup — urutan & nama sama seperti halaman Semua Menu (navMenuConfig + groupOrder)
const GROUP_LABELS = [
  'My Workspace', 'Pendaftaran', 'UWABA', 'UGT', 'Cashless', 'Keuangan', 'Umroh', 'Ijin',
  'Kalender', 'Kalender Pesantren', 'Domisili', 'Lembaga', 'Setting', 'Tentang'
]

// Urutan grup: 0. My Workspace (paling atas), 1. Pendaftaran, 2. UWABA, 2b. UGT, 3. Keuangan, 4. Umroh, 5. Ijin, 6. Kalender, 7. Setting
const navItems = [
  // 0. Grup My Workspace — semua user, paling atas
  {
    path: '/beranda',
    label: 'Beranda',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    )
  },
  {
    path: '/profil',
    label: 'Profil',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    )
  },
  {
    path: '/aktivitas-saya',
    label: 'Aktivitas Saya',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    showSeparatorAfter: true
  },
  // 1. PSB Group: Dashboard Pendaftaran, Pendaftaran, Item, Manage Set, dll
  {
    path: '/dashboard-pendaftaran',
    label: 'Dashboard',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    requiresRole: ['admin_psb', 'petugas_psb', 'super_admin']
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
    path: '/pendaftaran/item',
    label: 'Item',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    requiresSuperAdmin: true
  },
  {
    path: '/pendaftaran/data-pendaftar',
    label: 'Data Pendaftar',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    requiresRole: ['admin_psb', 'petugas_psb', 'super_admin']
  },
  {
    path: '/pendaftaran/padukan-data',
    label: 'Padukan Data',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
    requiresSuperAdmin: true
  },
  {
    path: '/pendaftaran/pengaturan',
    label: 'Pengaturan',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    requiresRole: ['super_admin'],
    showSeparatorAfter: true // Set, Kondisi, Registrasi, Assign, Simulasi hanya sebagai tab di page Item
  },
  // 2. UWABA Group: Dashboard Pembayaran, UWABA, Tunggakan, Khusus, Laporan
  {
    path: '/dashboard-pembayaran',
    label: 'Dashboard Pembayaran',
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
    path: '/tunggakan',
    label: 'Tunggakan',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
    requiresRole: ['petugas_uwaba', 'admin_uwaba', 'super_admin']
  },
  {
    path: '/khusus',
    label: 'Khusus',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.975-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.95-.69l1.52-4.674z" />
      </svg>
    ),
    requiresRole: ['petugas_uwaba', 'admin_uwaba', 'super_admin']
  },
  {
    path: '/pembayaran/manage-data',
    label: 'Manage Data',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    requiresRole: ['petugas_uwaba', 'admin_uwaba', 'super_admin']
  },
  {
    path: '/laporan',
    label: 'Laporan',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    requiresRole: ['admin_uwaba', 'petugas_uwaba', 'admin_psb', 'petugas_psb', 'super_admin'],
    showSeparatorAfter: true // Show separator after this group
  },
  // 2b. UGT Group: Data Madrasah, Koordinator (admin_ugt, koordinator_ugt, super_admin untuk Data Madrasah; admin_ugt, super_admin untuk Koordinator)
  {
    path: '/ugt/data-madrasah',
    label: 'Data Madrasah',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    requiresRole: ['admin_ugt', 'koordinator_ugt', 'super_admin'],
    showSeparatorAfter: false
  },
  {
    path: '/koordinator',
    label: 'Koordinator',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    requiresRole: ['admin_ugt', 'super_admin'],
    showSeparatorAfter: true
  },
  // Grup Cashless: Data Toko, Akun Cashless (admin_cashless, super_admin)
  {
    path: '/cashless/data-toko',
    label: 'Data Toko',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    requiresRole: ['admin_cashless', 'super_admin']
  },
  {
    path: '/cashless/topup',
    label: 'Top Up Dana',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    requiresRole: ['admin_cashless', 'petugas_cashless', 'super_admin']
  },
  {
    path: '/cashless/pembuatan-akun',
    label: 'Akun Cashless',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5M10 6V6a2 2 0 012-2h2a2 2 0 012 2v0M10 6h4m-4 6h4m-4 2h2m4 0h2" />
      </svg>
    ),
    requiresRole: ['admin_cashless', 'super_admin']
  },
  {
    path: '/cashless/pengaturan',
    label: 'Pengaturan Cashless',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    requiresRole: ['admin_cashless', 'super_admin'],
    showSeparatorAfter: true
  },
  // 3. Finance Group: Dashboard Keuangan, Pengeluaran, Pemasukan, Aktivitas
  {
    path: '/dashboard-keuangan',
    label: 'Dashboard Keuangan',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    requiresRole: ['admin_uwaba', 'super_admin'],
    requiresPermission: 'manage_finance'
  },
  {
    path: '/pengeluaran',
    label: 'Pengeluaran',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    requiresRole: ['admin_uwaba', 'super_admin']
  },
  {
    path: '/pemasukan',
    label: 'Pemasukan',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    requiresRole: ['admin_uwaba', 'super_admin']
  },
  {
    path: '/aktivitas',
    label: 'Aktivitas',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    requiresRole: ['admin_uwaba', 'super_admin']
  },
  {
    path: '/aktivitas-tahun-ajaran',
    label: 'Aktivitas TA',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    requiresRole: ['admin_uwaba', 'super_admin'],
    showSeparatorAfter: true // Show separator after this group
  },
  // 4. Umroh Group: hanya super_admin dan petugas_umroh
  {
    path: '/dashboard-umroh',
    label: 'Dashboard Umroh',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    requiresRole: ['petugas_umroh', 'super_admin']
  },
  {
    path: '/umroh/jamaah',
    label: 'Jamaah Umroh',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    requiresRole: ['petugas_umroh', 'super_admin']
  },
  {
    path: '/umroh/tabungan',
    label: 'Tabungan Umroh',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    requiresRole: ['petugas_umroh', 'super_admin']
  },
  {
    path: '/laporan-umroh',
    label: 'Laporan Umroh',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    requiresRole: ['petugas_umroh', 'super_admin'],
    showSeparatorAfter: true // Akhir grup Umroh
  },
  // 5. Ijin Group: Dashboard Ijin, Data Ijin
  {
    path: '/dashboard-ijin',
    label: 'Dashboard',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    requiresRole: ['admin_ijin', 'petugas_ijin', 'super_admin']
  },
  {
    path: '/ijin/data-ijin',
    label: 'Data Ijin',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    requiresRole: ['admin_ijin', 'petugas_ijin', 'super_admin']
  },
  {
    path: '/ijin/data-boyong',
    label: 'Data Boyong',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
    ),
    requiresRole: ['admin_ijin', 'super_admin'],
    showSeparatorAfter: true // Akhir grup Ijin, sebelum grup Kalender
  },
  // ========== Grup Kalender (khusus, terpisah dari Ijin) ==========
  {
    path: '/kalender',
    label: 'Kalender',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    )
  },
  {
    path: '/kalender/hari-penting',
    label: 'Hari Penting',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.975-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.95-.69l1.52-4.674z" />
      </svg>
    )
  },
  {
    path: '/converter',
    label: 'Converter',
    icon: (
      <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 4l4 4-4 4M20 8H4M8 20l-4-4 4-4M4 16h16" />
      </svg>
    ),
    requiresRole: ['super_admin', 'admin_kalender']
  },
  {
    path: '/kalender/pengaturan',
    label: 'Pengaturan Kalender',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    requiresRole: ['admin_kalender', 'super_admin'],
    showSeparatorAfter: true // Akhir grup Kalender, sebelum grup Kalender Pesantren
  },
  // ========== Grup Kalender Pesantren (Google Calendar) — hanya super_admin ==========
  {
    path: '/kalender-pesantren',
    label: 'Jadwal Pesantren',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    requiresSuperAdmin: true
  },
  {
    path: '/kalender-pesantren/kelola-event',
    label: 'Kelola Event',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
    ),
    requiresSuperAdmin: true
  },
  {
    path: '/kalender-pesantren/pengaturan',
    label: 'Pengaturan Google Kalender',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    requiresSuperAdmin: true,
    showSeparatorAfter: true // Akhir grup Kalender Pesantren
  },
  // Grup Domisili (urutan seperti Semua Menu)
  {
    path: '/domisili/daerah',
    label: 'Daerah',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    requiresSuperAdmin: true,
    showSeparatorAfter: true
  },
  // Grup Lembaga (urutan seperti Semua Menu)
  {
    path: '/pengurus',
    label: 'Pengurus',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    requiresSuperAdmin: true
  },
  {
    path: '/lembaga',
    label: 'Lembaga',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    requiresSuperAdmin: true
  },
  {
    path: '/santri',
    label: 'Santri',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    requiresSuperAdmin: true
  },
  {
    path: '/lulusan',
    label: 'Lulusan',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z" />
      </svg>
    ),
    requiresSuperAdmin: true
  },
  {
    path: '/rombel',
    label: 'Rombel',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    requiresSuperAdmin: true
  },
  {
    path: '/rombel-santri',
    label: 'Rombel Santri',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    requiresSuperAdmin: true
  },
  {
    path: '/manage-jabatan',
    label: 'Jabatan',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    requiresSuperAdmin: true,
    showSeparatorAfter: true
  },
  // Grup Setting (urutan seperti Semua Menu: Dashboard Umum, Kelola User, Tahun Ajaran, Role & Akses, Fitur, Kelola File, Data Juara)
  {
    path: '/dashboard-umum',
    label: 'Dashboard Umum',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    requiresRole: ['admin_uwaba', 'petugas_uwaba', 'super_admin']
  },
  {
    path: '/manage-users',
    label: 'Kelola User',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    requiresRole: ['super_admin', 'admin_cashless']
  },
  {
    path: '/settings/tahun-ajaran',
    label: 'Tahun Ajaran',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    requiresSuperAdmin: true
  },
  {
    path: '/settings/role-akses',
    label: 'Role & Akses',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    requiresSuperAdmin: true
  },
  {
    path: '/settings/fitur',
    label: 'Fitur',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
    requiresSuperAdmin: true
  },
  {
    path: '/manage-uploads',
    label: 'Kelola File',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    requiresSuperAdmin: true
  },
  {
    path: '/juara/data-juara',
    label: 'Data Juara',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
    ),
    requiresSuperAdmin: true,
    showSeparatorAfter: true
  },
  // Grup Tentang — public, semua role bisa akses
  {
    path: '/tentang',
    label: 'Tentang',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  },
  {
    path: '/version',
    label: 'Versi',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    )
  },
  {
    path: '/info-aplikasi',
    label: 'Info Aplikasi',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    )
  }
]

function Sidebar() {
  const { isCollapsed, toggleCollapsed } = useSidebarStore()
  const [isScrolling, setIsScrolling] = useState(false)
  const scrollTimeoutRef = useRef(null)
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { user, viewAsRole, getEffectiveRole, isRealSuperAdmin } = useAuthStore()
  const effectiveRole = getEffectiveRole?.() ?? (user?.role_key || user?.level || '').toLowerCase()
  const realSuperAdmin = isRealSuperAdmin?.() ?? (user && (user?.role_key || user?.level || '').toLowerCase() === 'super_admin')
  
  // Ambil NIS/ID dari URL (pembayaran pakai nis, pendaftaran pakai id; bawa keduanya agar data santri tetap)
  const idFromUrl = searchParams.get('nis') || searchParams.get('id')
  
  
  // Helper untuk cek permission
  const hasPermission = (permission) => {
    if (!user || !user.permissions) {
      return false
    }
    return user.permissions.includes(permission)
  }
  
  // Helper untuk cek role - pakai effectiveRole (super_admin + viewAsRole => role yang dicoba)
  const hasRole = (roles) => {
    if (!user || !roles || !Array.isArray(roles)) {
      return false
    }
    const allowed = roles.map(r => r.toLowerCase())
    return allowed.includes(effectiveRole)
  }
  
  // Indeks grup per item (berdasarkan urutan asli navItems); pembatas selalu antara beda grup
  const groupIndices = useMemo(() => {
    const out = []
    let g = 0
    for (let i = 0; i < navItems.length; i++) {
      out[i] = g
      if (navItems[i].showSeparatorAfter) g++
    }
    return out
  }, [])

  // Filter nav items: pakai effectiveRole, kecuali Role & Akses selalu tampil untuk super_admin asli
  const filteredNavItems = useMemo(() => {
    const canSee = (item) => {
      // Halaman Role & Akses selalu tampil untuk super_admin asli (meski sedang "coba sebagai" role lain)
      if (item.path === '/settings/role-akses') {
        return realSuperAdmin
      }
      if (effectiveRole === 'super_admin') return true // Super Admin (tanpa viewAs) lihat semua menu
      const userLevel = user?.level?.toLowerCase()
      if (item.requiresRole) return hasRole(item.requiresRole)
      if (item.requiresSuperAdmin) return effectiveRole === 'super_admin'
      if (item.requiresAdmin) return user && (userLevel === 'admin' || effectiveRole === 'admin_uwaba' || effectiveRole === 'admin_psb' || effectiveRole === 'admin_lembaga' || effectiveRole === 'super_admin')
      if (item.requiresPermission) return user && hasPermission(item.requiresPermission)
      return true
    }
    return navItems
      .map((item, i) => ({ item, groupIndex: groupIndices[i] }))
      .filter(({ item }) => canSee(item))
  }, [user, groupIndices, effectiveRole, realSuperAdmin, viewAsRole])

  // Grup untuk accordion: { groupIndex, label, items }
  const navGroups = useMemo(() => {
    const byGroup = new Map()
    filteredNavItems.forEach((entry) => {
      const g = entry.groupIndex
      if (!byGroup.has(g)) byGroup.set(g, { groupIndex: g, label: GROUP_LABELS[g] ?? 'Menu', items: [] })
      byGroup.get(g).items.push(entry)
    })
    return Array.from(byGroup.values()).sort((a, b) => a.groupIndex - b.groupIndex)
  }, [filteredNavItems])

  const [openGroups, setOpenGroups] = useState(new Set())

  const toggleGroup = (groupIndex) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupIndex)) next.delete(groupIndex)
      else next.add(groupIndex)
      return next
    })
  }
  const isGroupOpen = (groupIndex) => openGroups.has(groupIndex)

  // Handle scroll untuk auto-hide scrollbar
  const handleScroll = () => {
    setIsScrolling(true)
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false)
    }, 1500)
  }

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])

  const isActivePath = (path) => {
    if (path === '/dashboard-pembayaran') {
      return location.pathname === '/' || location.pathname === '/dashboard' || location.pathname === '/dashboard-pembayaran'
    }
    if (path === '/dashboard-umum') {
      return location.pathname === '/dashboard-umum'
    }
    if (path === '/dashboard-pendaftaran') {
      return location.pathname === '/dashboard-pendaftaran'
    }
    if (path === '/dashboard-ijin') {
      return location.pathname === '/dashboard-ijin'
    }
    // Untuk aktivitas tahun ajaran
    if (path === '/aktivitas-tahun-ajaran') {
      return location.pathname === '/aktivitas-tahun-ajaran'
    }
    // Untuk dashboard keuangan
    if (path === '/dashboard-keuangan') {
      return location.pathname === '/dashboard-keuangan'
    }
    // Untuk pendaftaran/item, cek path yang tepat
    if (path === '/pendaftaran/item') {
      return location.pathname === '/pendaftaran/item'
    }
    // Untuk pendaftaran/data-pendaftar, cek path yang tepat
    if (path === '/pendaftaran/data-pendaftar') {
      return location.pathname === '/pendaftaran/data-pendaftar'
    }
    // Untuk pendaftaran/padukan-data, cek path yang tepat
    if (path === '/pendaftaran/padukan-data') {
      return location.pathname === '/pendaftaran/padukan-data'
    }
    // Untuk pendaftaran/pengaturan, cek path yang tepat
    if (path === '/pendaftaran/pengaturan') {
      return location.pathname === '/pendaftaran/pengaturan'
    }
    // Untuk pendaftaran: hanya aktif ketika exact /pendaftaran atau subpath yang bukan menu sendiri (bukan item, data-pendaftar, padukan-data, pengaturan)
    if (path === '/pendaftaran') {
      if (location.pathname !== '/pendaftaran' && !location.pathname.startsWith('/pendaftaran/')) return false
      if (location.pathname === '/pendaftaran/item' || location.pathname.startsWith('/pendaftaran/item/')) return false
      if (location.pathname === '/pendaftaran/data-pendaftar' || location.pathname === '/pendaftaran/padukan-data' || location.pathname === '/pendaftaran/pengaturan') return false
      if (location.pathname === '/pendaftaran/data') return false
      return true
    }
    // Umroh: dashboard exact; jamaah hanya jamaah (dan create, :id/edit); tabungan/laporan exact
    if (path === '/dashboard-umroh') return location.pathname === '/dashboard-umroh'
    if (path === '/umroh/jamaah') return location.pathname === '/umroh/jamaah' || location.pathname.startsWith('/umroh/jamaah/')
    if (path === '/umroh/tabungan') return location.pathname === '/umroh/tabungan'
    if (path === '/laporan-umroh') return location.pathname === '/laporan-umroh'
    // Untuk ijin: Data Ijin dan Data Boyong masing-masing exact path
    if (path === '/ijin/data-ijin') return location.pathname === '/ijin/data-ijin'
    if (path === '/ijin/data-boyong') return location.pathname === '/ijin/data-boyong'
    // Untuk kalender: exact path
    if (path === '/kalender') return location.pathname === '/kalender'
    if (path === '/converter') return location.pathname === '/converter'
    if (path === '/kalender/hari-penting') return location.pathname === '/kalender/hari-penting'
    if (path === '/kalender/pengaturan') return location.pathname === '/kalender/pengaturan'
    // Kalender Pesantren
    if (path === '/kalender-pesantren') return location.pathname === '/kalender-pesantren'
    if (path === '/kalender-pesantren/pengaturan') return location.pathname === '/kalender-pesantren/pengaturan'
    if (path === '/kalender-pesantren/kelola-event') return location.pathname === '/kalender-pesantren/kelola-event'
    // Untuk juara, semua path juara dianggap aktif jika dimulai dengan /juara
    if (path === '/juara/data-juara') {
      return location.pathname.startsWith('/juara')
    }
    // UGT - Data Madrasah, Koordinator
    if (path === '/ugt/data-madrasah') return location.pathname === '/ugt/data-madrasah'
    if (path === '/koordinator') return location.pathname === '/koordinator'
    // Cashless - Data Toko, Top Up, Akun Cashless, Pengaturan
    if (path === '/cashless/data-toko') return location.pathname === '/cashless/data-toko'
    if (path === '/cashless/topup') return location.pathname === '/cashless/topup'
    // Grup My Workspace
    if (path === '/beranda') return location.pathname === '/beranda'
    if (path === '/profil') return location.pathname === '/profil' || location.pathname.startsWith('/profil/')
    // Exact match untuk semua path termasuk /uwaba, /tunggakan, /khusus
    return location.pathname === path
  }

  const sidebarWidth = isCollapsed ? 'w-20' : 'w-64'

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 80 : 256 }}
      className={`hidden sm:flex flex-col bg-white dark:bg-gray-800 shadow-lg transition-all duration-300 ease-in-out ${sidebarWidth} overflow-hidden h-screen`}
    >
      {/* Header */}
      <div className="flex items-center justify-center h-20 shadow-md bg-primary-600 dark:bg-primary-800 overflow-hidden flex-shrink-0">
        <AnimatePresence mode="wait">
          {isCollapsed ? (
            <motion.img
              key="collapsed"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              src={getGambarUrl('/uwaba-1.png')}
              alt="UWABA"
              className="h-12 w-12 transform scale-150"
              style={{ objectFit: 'cover' }}
            />
          ) : (
            <motion.img
              key="expanded"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              src={getGambarUrl('/uwaba-4.png')}
              alt="UWABA"
              className="h-12 w-25 transform scale-150"
              style={{ objectFit: 'cover' }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Navigation Items */}
      <ul
        className={`sidebar-scroll flex flex-col py-4 space-y-1 flex-1 overflow-y-auto overflow-x-hidden ${isScrolling ? 'scrollbar-visible' : ''}`}
        onScroll={handleScroll}
        onMouseEnter={() => setIsScrolling(true)}
        onMouseLeave={() => {
          setTimeout(() => setIsScrolling(false), 500)
        }}
      >
        {isCollapsed ? (
          /* Sidebar collapsed: tampilan flat dengan pembatas grup */
          filteredNavItems.map((entry, index) => {
            const { item, groupIndex } = entry
            const isActive = isActivePath(item.path)
            const nextEntry = filteredNavItems[index + 1]
            const shouldShowDivider = nextEntry != null && nextEntry.groupIndex !== groupIndex
            const pathsWithNis = ['/pendaftaran', '/uwaba', '/tunggakan', '/khusus']
            const shouldIncludeNis = pathsWithNis.includes(item.path) && idFromUrl && /^\d{7}$/.test(idFromUrl)
            const linkTo = shouldIncludeNis ? `${item.path}?nis=${idFromUrl}` : item.path
            return (
              <li key={item.path}>
                <NavLink
                  to={linkTo}
                  className={`flex items-center h-12 justify-center px-3 rounded-lg mx-2 transition-colors duration-200 ${
                    isActive
                      ? 'bg-primary-50 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 font-semibold'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:text-primary-600 dark:hover:text-primary-400'
                  }`}
                  title={item.label}
                >
                  <span
                    className={`inline-flex items-center justify-center h-12 w-12 ${
                      isActive ? 'text-primary-500 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {item.icon}
                  </span>
                </NavLink>
                {shouldShowDivider && (
                  <div className="mx-2 my-2 border-t border-gray-200 dark:border-gray-700" aria-hidden="true" />
                )}
              </li>
            )
          })
        ) : (
          /* Sidebar expanded: accordion per grup dengan judul */
          navGroups.map((group) => {
            const open = isGroupOpen(group.groupIndex)
            return (
              <li key={group.groupIndex} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.groupIndex)}
                  className="flex items-center w-full h-9 px-3 rounded-lg mx-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <motion.span
                    animate={{ rotate: open ? 0 : -90 }}
                    className="shrink-0 mr-2 text-gray-400"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </motion.span>
                  <span className="truncate">{group.label}</span>
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      {group.items.map((entry) => {
                        const { item } = entry
                        const isActive = isActivePath(item.path)
                        const pathsWithNis = ['/pendaftaran', '/uwaba', '/tunggakan', '/khusus']
                        const shouldIncludeNis = pathsWithNis.includes(item.path) && idFromUrl && /^\d{7}$/.test(idFromUrl)
                        const linkTo = shouldIncludeNis ? `${item.path}?nis=${idFromUrl}` : item.path
                        return (
                          <NavLink
                            key={item.path}
                            to={linkTo}
                            className={`flex items-center h-12 space-x-3 px-3 pl-6 rounded-lg mx-2 transition-colors duration-200 ${
                              isActive
                                ? 'bg-primary-50 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 font-semibold'
                                : 'text-gray-500 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:text-primary-600 dark:hover:text-primary-400'
                            }`}
                          >
                            <span
                              className={`inline-flex items-center justify-center h-12 w-12 shrink-0 ${
                                isActive ? 'text-primary-500 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'
                              }`}
                            >
                              {item.icon}
                            </span>
                            <motion.span
                              initial={{ opacity: 0, width: 0 }}
                              animate={{ opacity: 1, width: 'auto' }}
                              exit={{ opacity: 0, width: 0 }}
                              className="text-sm font-medium whitespace-nowrap overflow-hidden"
                            >
                              {item.label}
                            </motion.span>
                          </NavLink>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            )
          })
        )}
      </ul>

      {/* Toggle Button */}
      <div className="p-2 border-t dark:border-gray-700 flex-shrink-0">
        <button
          onClick={toggleCollapsed}
          className="w-full flex items-center justify-center p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none transition-colors"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <motion.svg
            animate={{ rotate: isCollapsed ? 180 : 0 }}
            className="w-6 h-6 transition-transform duration-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </motion.svg>
        </button>
      </div>
    </motion.aside>
  )
}

export default Sidebar

