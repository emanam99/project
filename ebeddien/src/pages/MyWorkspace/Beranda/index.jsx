import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuthStore } from '../../../store/authStore'
import { BERANDA_WIDGET_CODES } from '../../../config/berandaFiturCodes'
import { userHasSuperAdminAccess } from '../../../utils/roleAccess'

const KalenderPage = lazy(() => import('../../Kalender/index.jsx'))

const easing = [0.22, 1, 0.36, 1]
const pageVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.35, ease: easing }
  }
}
const blockVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.05 * i, duration: 0.45, ease: easing }
  })
}

/* Animasi kotak selamat datang: lebih terlihat, pelan, tiap elemen sendiri; foto halus saat selesai load */
const heroEasing = [0.25, 0.46, 0.45, 0.94]
const heroCardVariants = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: heroEasing }
  }
}
const heroStaggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.25 }
  }
}
const heroStaggerItem = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: heroEasing }
  }
}
const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.08 }
  }
}
const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 }
}

/* Animasi blok Pembayaran Hari Ini: lebih terlihat, isi stagger */
const paymentSectionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }
  }
}
const paymentStaggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.12 }
  }
}
const paymentStaggerItem = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }
  }
}
const listItemTransition = { duration: 0.35, ease: easing }

/* Animasi perpindahan blok tanggal/jam (bawah ↔ kanan) */
const dateBlockLayoutTransition = { type: 'tween', duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }
import { profilAPI, pendaftaranAPI } from '../../../services/api'
import { buildFlatNavMenusFromFitur, iconKeyForPathFromCatalog } from '../../../utils/menuCatalogNav'
import { getIcon } from '../../../config/menuIcons'
import { getTanggalFromAPI, getBootPenanggalanPair, persistPenanggalanHariIni } from '../../../utils/hijriDate'
import { getMasehiKeyHariIni, idbGetToday, readTodayPenanggalanSync } from '../../../services/hijriPenanggalanStorage'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import { useSidebarStore } from '../../../store/sidebarStore'
import BerandaAbsenSection from './BerandaAbsenSection'
import { useGlobalSyncOutbox } from '../../../contexts/GlobalSyncOutboxContext'
import { useGlobalSyncOutboxCount } from '../../../hooks/useGlobalSyncOutboxCount'
import { useChatOffcanvas } from '../../../contexts/ChatOffcanvasContext'
import { useChatAiOffcanvas } from '../../../contexts/ChatAiOffcanvasContext'

/** Maks item menu di Beranda; sisanya lewat Semua menu */
const BERANDA_MENU_DISPLAY_LIMIT = 20

const BULAN_MASEHI = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const BULAN_HIJRIYAH = ['Muharram', 'Safar', "Rabiul Awal", "Rabiul Akhir", "Jumadil Awal", "Jumadil Akhir", 'Rajab', "Sya'ban", 'Ramadhan', 'Syawal', "Dzulqa'dah", 'Dzulhijjah']
const HARI_INDONESIA = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

function getHariIndonesia(date = new Date()) {
  return HARI_INDONESIA[date.getDay()] || ''
}

function formatJamDetik(date = new Date()) {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

/** Format Y-m-d ke "dd mmmm yyyy" */
function formatDDMMMMYYYY(ymd, monthList) {
  if (!ymd || ymd === '0000-00-00') return null
  const parts = String(ymd).trim().split('-')
  if (parts.length !== 3) return null
  const [y, m, d] = parts
  const monthIndex = parseInt(m, 10) - 1
  const monthName = monthList[monthIndex] || m
  const day = parseInt(d, 10)
  return `${day} ${monthName} ${y}`
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount ?? 0)
}

/** Greeting berdasarkan jam (Pagi / Siang / Sore / Malam) */
function getTimeGreeting() {
  const h = new Date().getHours()
  if (h >= 4 && h < 11) return 'Pagi'
  if (h >= 11 && h < 15) return 'Siang'
  if (h >= 15 && h < 18) return 'Sore'
  return 'Malam'
}

const iconClass = 'w-5 h-5 shrink-0'

const menuIconsByPath = {
  '/beranda': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  '/profil': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
  '/dashboard-pendaftaran': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  '/pendaftaran': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  '/pendaftaran/item': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
  '/pendaftaran/item/rekap': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  '/pendaftaran/item/set': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
  '/pendaftaran/item/kondisi': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>,
  '/pendaftaran/item/registrasi': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  '/pendaftaran/item/assign': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
  '/pendaftaran/item/simulasi': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  '/pendaftaran/data-pendaftar': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  '/pendaftaran/padukan-data': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
  '/pendaftaran/pengaturan': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  '/dashboard-pembayaran': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  '/uwaba': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  '/tunggakan': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>,
  '/khusus': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.975-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.95-.69l1.52-4.674z" /></svg>,
  '/pembayaran/manage-data': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  '/laporan': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  '/ugt/data-madrasah': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
  '/ugt/laporan': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  '/koordinator': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  '/cashless/data-toko': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
  '/cashless/topup': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  '/cashless/pembuatan-akun': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5M10 6V6a2 2 0 012-2h2a2 2 0 012 2v0M10 6h4m-4 6h4m-4 2h2m4 0h2" /></svg>,
  '/cashless/pengaturan': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  '/dashboard-keuangan': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 3h4v4" /></svg>,
  '/pengeluaran': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  '/pemasukan': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  '/aktivitas': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  '/aktivitas-tahun-ajaran': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  '/dashboard-umroh': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  '/umroh/jamaah': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  '/umroh/tabungan': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  '/laporan-umroh': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  '/dashboard-ijin': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  '/ijin/data-ijin': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  '/ijin/data-boyong': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
  '/kalender': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  '/kalender/hari-penting': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.975-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.95-.69l1.52-4.674z" /></svg>,
  '/converter': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M16 4l4 4-4 4M20 8H4M8 20l-4-4 4-4M4 16h16" /></svg>,
  '/kalender/pengaturan': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  '/kalender-pesantren': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  '/kalender-pesantren/kelola-event': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>,
  '/kalender-pesantren/pengaturan': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  '/dashboard-umum': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  '/manage-users': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  '/settings/tahun-ajaran': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  '/pendaftaran/manage-item-set': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
  '/pendaftaran/manage-kondisi': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>,
  '/pendaftaran/kondisi-registrasi': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  '/pendaftaran/assign-item': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
  '/pendaftaran/simulasi': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  '/pengurus': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  '/lembaga': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
  '/manage-jabatan': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  '/settings/role-akses': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
  '/settings/fitur': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
  '/manage-uploads': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
  '/juara/data-juara': <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>,
}

const defaultMenuIcon = (
  <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
  </svg>
)

export function getMenuIcon(path, className = 'w-5 h-5', menuCatalog = null) {
  const key = iconKeyForPathFromCatalog(menuCatalog, path)
  if (key) return getIcon(key, className)
  if (menuIconsByPath[path]) return menuIconsByPath[path]
  return getIcon('home', className)
}

/** Warna per path untuk kotak menu — bg kartu = bg icon (satu warna), text icon, border/hover */
const menuColorSets = [
  { cardBg: 'bg-teal-100 dark:bg-teal-900/40', iconText: 'text-teal-600 dark:text-teal-400', card: 'border-teal-200/60 dark:border-teal-800/50 hover:border-teal-300 dark:hover:border-teal-600/50' },
  { cardBg: 'bg-emerald-100 dark:bg-emerald-900/40', iconText: 'text-emerald-600 dark:text-emerald-400', card: 'border-emerald-200/60 dark:border-emerald-800/50 hover:border-emerald-300 dark:hover:border-emerald-600/50' },
  { cardBg: 'bg-blue-100 dark:bg-blue-900/40', iconText: 'text-blue-600 dark:text-blue-400', card: 'border-blue-200/60 dark:border-blue-800/50 hover:border-blue-300 dark:hover:border-blue-600/50' },
  { cardBg: 'bg-violet-100 dark:bg-violet-900/40', iconText: 'text-violet-600 dark:text-violet-400', card: 'border-violet-200/60 dark:border-violet-800/50 hover:border-violet-300 dark:hover:border-violet-600/50' },
  { cardBg: 'bg-amber-100 dark:bg-amber-900/40', iconText: 'text-amber-600 dark:text-amber-400', card: 'border-amber-200/60 dark:border-amber-800/50 hover:border-amber-300 dark:hover:border-amber-600/50' },
  { cardBg: 'bg-rose-100 dark:bg-rose-900/40', iconText: 'text-rose-600 dark:text-rose-400', card: 'border-rose-200/60 dark:border-rose-800/50 hover:border-rose-300 dark:hover:border-rose-600/50' },
  { cardBg: 'bg-cyan-100 dark:bg-cyan-900/40', iconText: 'text-cyan-600 dark:text-cyan-400', card: 'border-cyan-200/60 dark:border-cyan-800/50 hover:border-cyan-300 dark:hover:border-cyan-600/50' },
  { cardBg: 'bg-indigo-100 dark:bg-indigo-900/40', iconText: 'text-indigo-600 dark:text-indigo-400', card: 'border-indigo-200/60 dark:border-indigo-800/50 hover:border-indigo-300 dark:hover:border-indigo-600/50' },
  { cardBg: 'bg-orange-100 dark:bg-orange-900/40', iconText: 'text-orange-600 dark:text-orange-400', card: 'border-orange-200/60 dark:border-orange-800/50 hover:border-orange-300 dark:hover:border-orange-600/50' },
  { cardBg: 'bg-pink-100 dark:bg-pink-900/40', iconText: 'text-pink-600 dark:text-pink-400', card: 'border-pink-200/60 dark:border-pink-800/50 hover:border-pink-300 dark:hover:border-pink-600/50' },
]
function getMenuColor(path, index) {
  return menuColorSets[index % menuColorSets.length]
}

export default function Beranda() {
  const { user, fiturMenuCodes } = useAuthStore()
  const fiturMenuFromApi = useAuthStore((s) => s.fiturMenuFromApi)
  const fiturMenuCatalog = useAuthStore((s) => s.fiturMenuCatalog)
  const fiturMenuFetchStatus = useAuthStore((s) => s.fiturMenuFetchStatus)
  const navigate = useNavigate()
  const displayName = user?.nama || user?.username || 'Pengguna'
  const initial = (displayName || user?.username || '?').trim().charAt(0).toUpperCase()

  const [photoUrl, setPhotoUrl] = useState(null)
  const [photoLoaded, setPhotoLoaded] = useState(false)
  const photoUrlRef = useRef(null)
  const [aktivitasList, setAktivitasList] = useState([])
  const [aktivitasLoading, setAktivitasLoading] = useState(false)
  const [showMenuScrollbar, setShowMenuScrollbar] = useState(false)
  const menuScrollTimeoutRef = useRef(null)
  const [todayTanggal, setTodayTanggal] = useState(() => {
    const b = getBootPenanggalanPair()
    return { masehi: b.masehi, hijriyah: b.hijriyah || null }
  })
  const [paymentHariIni, setPaymentHariIni] = useState(null)
  const [paymentHariIniLoading, setPaymentHariIniLoading] = useState(false)
  const [ringkasanKeuangan, setRingkasanKeuangan] = useState(null)
  const [ringkasanKeuanganLoading, setRingkasanKeuanganLoading] = useState(false)
  const [dashboardPendaftaran, setDashboardPendaftaran] = useState(null)
  const [dashboardPendaftaranLoading, setDashboardPendaftaranLoading] = useState(false)
  const [waktuSekarang, setWaktuSekarang] = useState(() => new Date())

  /** Widget Beranda: izin dari kode action di /me/fitur-menu (Pengaturan → Fitur), bukan daftar role statis */
  const widgetAllowed = useMemo(() => {
    const isSuper = userHasSuperAdminAccess(user)
    const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
    const useApi = codes.length > 0
    const apiHasBerandaActions =
      useApi && codes.some((c) => String(c).startsWith('action.beranda.widget.'))
    return (code) => {
      if (isSuper) return true
      if (!useApi) return false
      const c = String(code)
      if (apiHasBerandaActions && c.startsWith('action.beranda.widget.')) {
        return codes.includes(code)
      }
      return codes.includes(code)
    }
  }, [user, fiturMenuCodes])

  const showWidgetPembayaranHariIni = widgetAllowed(BERANDA_WIDGET_CODES.pembayaranHariIni)
  const showWidgetRingkasanKeuangan = widgetAllowed(BERANDA_WIDGET_CODES.ringkasanKeuangan)
  const showWidgetTotalPendaftaran = widgetAllowed(BERANDA_WIDGET_CODES.totalPendaftaran)
  const { tahunAjaran, setTahunAjaran, tahunAjaranMasehi, setTahunAjaranMasehi, options: optionsTA, optionsMasehi: optionsMasehiTA } = useTahunAjaranStore()
  const { open: openSyncOutbox } = useGlobalSyncOutbox()
  const { n: syncOutboxN, showBadge: syncOutboxShowBadge } = useGlobalSyncOutboxCount()
  const { open: openChatOffcanvas, close: closeChatOffcanvas, chatTotalUnread } = useChatOffcanvas()
  const { open: openChatAiOffcanvas, close: closeChatAiOffcanvas } = useChatAiOffcanvas()

  // Jam hidup (update tiap detik)
  useEffect(() => {
    const tick = () => setWaktuSekarang(new Date())
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Tanggal hari ini: cache mirror/IndexedDB dulu, lalu segarkan dari API
  useEffect(() => {
    let cancelled = false
    const iso = getMasehiKeyHariIni()
    if (!readTodayPenanggalanSync()?.hijriyah) {
      ;(async () => {
        const row = await idbGetToday(iso)
        const p = row?.payload
        if (cancelled || !p || Array.isArray(p) || !p.hijriyah || p.hijriyah === '0000-00-00') return
        persistPenanggalanHariIni(p)
        setTodayTanggal((prev) => ({
          masehi: p.masehi?.slice(0, 10) || prev.masehi || iso,
          hijriyah: prev.hijriyah || String(p.hijriyah).slice(0, 10)
        }))
      })()
    }
    getTanggalFromAPI()
      .then((res) => {
        if (cancelled || !res) return
        setTodayTanggal((prev) => ({
          masehi: res.masehi?.slice(0, 10) || prev.masehi || iso,
          hijriyah:
            res.hijriyah && res.hijriyah !== '-'
              ? String(res.hijriyah).slice(0, 10)
              : prev.hijriyah
        }))
      })
      .catch(() => {
        if (!cancelled) {
          setTodayTanggal((prev) => ({
            masehi: prev.masehi || iso,
            hijriyah: prev.hijriyah
          }))
        }
      })
    return () => { cancelled = true }
  }, [])

  // Rincian pembayaran hari ini — jika aksi widget diizinkan di matriks fitur
  useEffect(() => {
    if (!user?.id || !showWidgetPembayaranHariIni) return
    setPaymentHariIniLoading(true)
    profilAPI.getTotalPembayaran(user.id).then((response) => {
      if (response.success) {
        setPaymentHariIni({
          total: response.total || 0,
          rincian: {
            uwaba: response.detail?.uwaba || 0,
            tunggakan: response.detail?.tunggakan || 0,
            khusus: response.detail?.khusus || 0
          },
          rincianVia: {
            uwaba: response.detail_via?.uwaba || {},
            tunggakan: response.detail_via?.tunggakan || {},
            khusus: response.detail_via?.khusus || {}
          }
        })
      } else setPaymentHariIni(null)
    }).catch(() => setPaymentHariIni(null)).finally(() => setPaymentHariIniLoading(false))
  }, [user?.id, showWidgetPembayaranHariIni])

  // Ringkasan keuangan
  useEffect(() => {
    if (!showWidgetRingkasanKeuangan) return
    setRingkasanKeuanganLoading(true)
    profilAPI.getTotalPemasukanPengeluaran(tahunAjaran || null).then((response) => {
      if (response?.success) {
        setRingkasanKeuangan({
          saldo_awal_tahun: response.saldo_awal_tahun ?? 0,
          total_pemasukan: response.total_pemasukan ?? 0,
          total_pengeluaran: response.total_pengeluaran ?? 0,
          sisa_saldo: response.sisa_saldo ?? 0
        })
      } else setRingkasanKeuangan(null)
    }).catch(() => setRingkasanKeuangan(null)).finally(() => setRingkasanKeuanganLoading(false))
  }, [showWidgetRingkasanKeuangan, tahunAjaran])

  // Dashboard Pendaftaran (total Pendaftar, Santri Baru, Formal, Diniyah)
  useEffect(() => {
    if (!showWidgetTotalPendaftaran) return
    setDashboardPendaftaranLoading(true)
    pendaftaranAPI.getDashboard(tahunAjaran || null, tahunAjaranMasehi || null).then((response) => {
      if (response?.success && response?.data) {
        setDashboardPendaftaran(response.data)
      } else setDashboardPendaftaran(null)
    }).catch(() => setDashboardPendaftaran(null)).finally(() => setDashboardPendaftaranLoading(false))
  }, [showWidgetTotalPendaftaran, tahunAjaran, tahunAjaranMasehi])

  // Foto profil (hanya fetch blob jika API user menyebut ada foto — hindari request sia-sia)
  useEffect(() => {
    if (!user?.id) return
    setPhotoLoaded(false)
    let cancelled = false
    profilAPI.getUser(user.id).then((res) => {
      if (cancelled || !res?.success || !res.user?.foto_profil) {
        if (!cancelled) setPhotoUrl(null)
        return
      }
      return profilAPI.getProfilFotoBlob()
    }).then((blob) => {
      if (!cancelled && blob instanceof Blob) {
        if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current)
        const url = URL.createObjectURL(blob)
        photoUrlRef.current = url
        setPhotoUrl(url)
      } else if (!cancelled) {
        setPhotoUrl(null)
      }
    }).catch(() => {
      if (!cancelled) setPhotoUrl(null)
    })
    return () => {
      cancelled = true
      if (photoUrlRef.current) {
        URL.revokeObjectURL(photoUrlRef.current)
        photoUrlRef.current = null
      }
    }
  }, [user?.id])

  const handleMenuScroll = () => {
    setShowMenuScrollbar(true)
    if (menuScrollTimeoutRef.current) clearTimeout(menuScrollTimeoutRef.current)
    menuScrollTimeoutRef.current = setTimeout(() => setShowMenuScrollbar(false), 1500)
  }

  useEffect(() => {
    return () => {
      if (menuScrollTimeoutRef.current) clearTimeout(menuScrollTimeoutRef.current)
    }
  }, [])

  // 5 aktivitas terakhir
  useEffect(() => {
    if (!user?.id) return
    setAktivitasLoading(true)
    profilAPI.getAktivitas({ limit: 5 }).then((res) => {
      if (res.success && Array.isArray(res.data)) {
        setAktivitasList(res.data)
      }
    }).catch(() => setAktivitasList([])).finally(() => setAktivitasLoading(false))
  }, [user?.id])

  // Menu yang bisa diakses user (selain grup Tentang) — dari katalog DB + kode fitur
  const isSuperAdmin = userHasSuperAdminAccess(user)

  const BERANDA_GROUP_ORDER = [
    'My Workspace',
    'Super Admin',
    'Pendaftaran',
    'UWABA',
    'UGT',
    'Cashless',
    'Keuangan',
    'Umroh',
    'Ijin',
    'Kalender',
    'Kalender Pesantren',
    'Domisili',
    'Lembaga',
    'Setting',
    'Tentang',
    'Lainnya'
  ]
  /** Sama prioritas dengan sidebar: /v2/me/fitur-menu → katalog + kode → cadangan statis (tanpa paksa dua fetch OK). */
  const { allowedMenus, menuListLoading } = useMemo(() => {
    const { menus, source } = buildFlatNavMenusFromFitur({
      fiturMenuFromApi,
      fiturMenuCatalog,
      fiturMenuCodes,
      isSuperAdmin,
      fiturMenuFetchStatus
    })
    if (source === 'loading') {
      return { allowedMenus: [], menuListLoading: true }
    }
    const filtered = menus.filter((item) => item.group !== 'Tentang')
    const orderMap = Object.fromEntries(BERANDA_GROUP_ORDER.map((g, i) => [g, i]))
    const sorted = [...filtered].sort((a, b) => {
      const ga = a.group || 'Lainnya'
      const gb = b.group || 'Lainnya'
      const ia = orderMap[ga] ?? 999
      const ib = orderMap[gb] ?? 999
      return ia - ib || ga.localeCompare(gb) || (a.label || '').localeCompare(b.label || '')
    })
    return { allowedMenus: sorted, menuListLoading: false }
  }, [
    isSuperAdmin,
    fiturMenuFromApi,
    fiturMenuCatalog,
    fiturMenuCodes,
    fiturMenuFetchStatus
  ])

  const berandaMenus = useMemo(
    () => allowedMenus.slice(0, BERANDA_MENU_DISPLAY_LIMIT),
    [allowedMenus]
  )

  /** Gabung baris menu API + katalog agar icon_key dari /me/fitur-menu ikut dipakai pencarian path. */
  const menuCatalogForIcons = useMemo(() => {
    const c = Array.isArray(fiturMenuCatalog) ? [...fiturMenuCatalog] : []
    const a = Array.isArray(fiturMenuFromApi)
      ? fiturMenuFromApi.filter((it) => (it.type || 'menu') === 'menu')
      : []
    return [...a, ...c]
  }, [fiturMenuFromApi, fiturMenuCatalog])

  const greeting = getTimeGreeting()
  const { isCollapsed: sidebarCollapsed } = useSidebarStore()

  // PC = lg (1024px): tampilkan panel kalender di kanan; xl (1280px) = PC lebar besar
  const [winWidth, setWinWidth] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1024)
  useEffect(() => {
    const onResize = () => setWinWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const isPc = winWidth >= 1024
  const isLargePc = winWidth >= 1280
  // Tanggal/jam di kanan: PC lebar besar selalu kanan; PC kecil (1024–1279) hanya saat sidebar tertutup
  const dateOnRight = isLargePc || (isPc && sidebarCollapsed)
  // Menu Beranda: HP (<768px) ≤6 jadi 1 baris; tablet & PC (≥768px) ≤17 jadi 1 baris
  const menuSingleRowThreshold = winWidth >= 768 ? 17 : 6

  const hijriTampilBeranda =
    formatDDMMMMYYYY(todayTanggal.hijriyah, BULAN_HIJRIYAH) ??
    (todayTanggal.masehi ? <span className="text-gray-400">⋯</span> : '–')

  /* Konten tanggal & jam (dipakai di posisi bawah dan kanan) untuk animasi layoutId */
  const dateTimeContent = (
    <>
      <motion.div
        key={`beranda-tgl-${todayTanggal.hijriyah || 'x'}-${todayTanggal.masehi || 'y'}`}
        initial={{ opacity: 0.55, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Tanggal</p>
        <p className="text-[11px] leading-tight text-gray-700 dark:text-gray-200">
          {hijriTampilBeranda}
          <span className="text-[9px] text-teal-500/90 ml-0.5">H</span>
        </p>
        <p className="text-[11px] leading-tight text-gray-700 dark:text-gray-200">
          {formatDDMMMMYYYY(todayTanggal.masehi, BULAN_MASEHI) ?? '–'}
          <span className="text-[9px] text-teal-500/90 ml-0.5">M</span>
        </p>
      </motion.div>
      <div>
        <p className="text-[10px] font-medium text-teal-600 dark:text-teal-400 uppercase tracking-wider mb-1">Hari & Jam</p>
        <p className="text-[11px] font-semibold text-gray-800 dark:text-gray-100 leading-tight">{getHariIndonesia(waktuSekarang)}</p>
        <p className="text-[11px] font-semibold text-teal-700 dark:text-teal-300 tabular-nums">{formatJamDetik(waktuSekarang)}</p>
      </div>
    </>
  )

  const berandaContent = (
    <motion.div
      className="min-h-0"
      variants={pageVariants}
      initial={isPc ? 'visible' : 'hidden'}
      animate="visible"
    >
      <div className="max-w-2xl mx-auto px-0 sm:px-4 pt-0 sm:pt-6 pb-12 space-y-8">
      {/* HP: kotak 1 gradien + foto besar + banyak ruang; kotak 2 tanggal. PC: satu kotak lengkap */}
      <motion.div
        variants={heroCardVariants}
        initial="hidden"
        animate="visible"
        className="space-y-3 sm:space-y-0"
      >
        {/* Kotak 1: HP = gradien tema, foto besar, margin atas/bawah lega. PC = layout horizontal + tanggal */}
        <motion.div
          variants={heroStaggerContainer}
          initial="hidden"
          animate="visible"
          className="rounded-none sm:rounded-2xl overflow-hidden bg-gradient-to-b from-teal-50/90 via-teal-50/40 to-transparent dark:from-teal-950/60 dark:via-teal-950/25 dark:to-transparent sm:from-teal-50/90 sm:via-white/95 sm:to-teal-50/70 sm:dark:from-teal-950/40 sm:dark:via-gray-800/95 sm:dark:to-teal-950/30 border-0 shadow-none sm:border sm:border-gray-200/60 sm:dark:border-gray-700/50 sm:shadow-md flex flex-col sm:flex-row md:items-center pt-8 sm:pt-7 pb-10 sm:pb-7 px-5 sm:p-7 gap-6 sm:gap-5"
        >
          <motion.div
            variants={heroStaggerItem}
            className="flex flex-col sm:flex-row items-center sm:items-center gap-5 sm:gap-5 w-full sm:w-auto md:flex-1 md:min-w-0"
          >
            <motion.div
              variants={heroStaggerItem}
              className="w-24 h-24 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-white/80 dark:bg-gray-700/50 flex items-center justify-center text-2xl sm:text-xl font-semibold text-teal-600 dark:text-teal-400 ring-2 ring-white/80 dark:ring-gray-600/80 shadow-lg shrink-0 cursor-pointer transition-all duration-200 hover:ring-teal-300/60 focus:outline-none focus:ring-2 focus:ring-teal-500"
              onClick={() => navigate('/profil')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && navigate('/profil')}
              aria-label="Buka profil"
            >
              {photoUrl ? (
                <motion.img
                  src={photoUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: photoLoaded ? 1 : 0 }}
                  transition={{ duration: 0.45, ease: heroEasing }}
                  onLoad={() => setPhotoLoaded(true)}
                />
              ) : (
                <span>{initial}</span>
              )}
            </motion.div>
            <motion.div variants={heroStaggerItem} className="flex-1 min-w-0 text-center sm:text-left">
              <p className="text-[11px] sm:text-xs font-medium text-teal-600 dark:text-teal-400 uppercase tracking-wider">
                Selamat {greeting}
              </p>
              <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white tracking-tight mt-1">
                {displayName}
              </h1>
              {/* Tahun ajaran di bawah nama, HP & PC — horizontal, select tanpa border/bg, bisa diubah */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
                <select
                  value={tahunAjaran}
                  onChange={(e) => setTahunAjaran(e.target.value)}
                  className="text-[11px] font-semibold bg-transparent border-0 text-gray-700 dark:text-gray-200 cursor-pointer py-0.5 focus:outline-none focus:ring-0 text-center sm:text-left [&>option]:bg-gray-800 [&>option]:text-gray-100"
                >
                  {optionsTA.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <span className="text-gray-400 dark:text-gray-500 text-[10px]">/</span>
                <select
                  value={tahunAjaranMasehi}
                  onChange={(e) => setTahunAjaranMasehi(e.target.value)}
                  className="text-[11px] font-semibold bg-transparent border-0 text-gray-700 dark:text-gray-200 cursor-pointer py-0.5 focus:outline-none focus:ring-0 text-center sm:text-left [&>option]:bg-gray-800 [&>option]:text-gray-100"
                >
                  {optionsMasehiTA.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              {/* Tanggal + Hari & Jam: tablet di bawah nama; PC kecil (sidebar terbuka) juga di bawah — dengan layoutId untuk animasi perpindahan */}
              {!dateOnRight && (
                <motion.div
                  layout
                  layoutId="beranda-date-time"
                  transition={dateBlockLayoutTransition}
                  className="hidden sm:grid sm:grid-cols-2 sm:gap-4 sm:mt-3 sm:pt-3 sm:border-t border-gray-200/60 dark:border-gray-700/50"
                >
                  {dateTimeContent}
                </motion.div>
              )}
            </motion.div>
          </motion.div>
          {/* Tanggal + Hari & Jam: PC — di kanan saat lebar besar atau sidebar tertutup; layoutId untuk animasi perpindahan */}
          {dateOnRight && (
            <motion.div
              layout
              layoutId="beranda-date-time"
              transition={dateBlockLayoutTransition}
              className="hidden lg:flex lg:shrink-0 lg:pl-5 lg:border-l border-gray-200/60 dark:border-gray-700/50 lg:items-center"
            >
              <div className="grid grid-cols-2 gap-4">
                {dateTimeContent}
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Kotak 2 (HP saja): Tanggal + Hari & Jam (tahun ajaran sudah pindah ke bawah nama di kotak 1) */}
        <motion.div
          variants={heroStaggerContainer}
          initial="hidden"
          animate="visible"
          className="sm:hidden mx-4"
        >
          <div className="rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-700/50 overflow-hidden shadow-sm">
            <motion.div
              variants={heroStaggerItem}
              className="p-3 space-y-2"
            >
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-50 dark:bg-gray-700/40 p-2.5 text-center">
                  <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Tanggal</p>
                  <p className="text-[10px] leading-tight text-gray-700 dark:text-gray-200">
                    {hijriTampilBeranda}
                    <span className="text-[9px] text-teal-500/90 ml-0.5">H</span>
                  </p>
                  <p className="text-[10px] leading-tight text-gray-700 dark:text-gray-200">
                    {formatDDMMMMYYYY(todayTanggal.masehi, BULAN_MASEHI) ?? '–'}
                    <span className="text-[9px] text-teal-500/90 ml-0.5">M</span>
                  </p>
                </div>
                <div className="rounded-lg bg-teal-50/80 dark:bg-teal-900/20 p-2.5 text-center">
                  <p className="text-[10px] font-medium text-teal-600 dark:text-teal-400 uppercase tracking-wider mb-1">Hari & Jam</p>
                  <p className="text-[11px] font-semibold text-gray-800 dark:text-gray-100 leading-tight">{getHariIndonesia(waktuSekarang)}</p>
                  <p className="text-[11px] font-semibold text-teal-700 dark:text-teal-300 tabular-nums">{formatJamDetik(waktuSekarang)}</p>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>

      {/* Menu: grid kartu minimalis, scroll horizontal di mobile */}
      <motion.section
        variants={blockVariants}
        custom={1}
        initial="hidden"
        animate="visible"
        className="px-4 sm:px-0"
      >
        <div className="flex justify-center sm:justify-start gap-2 mb-3">
          <button
            type="button"
            onClick={() => {
              closeChatAiOffcanvas()
              openChatOffcanvas()
            }}
            title="Chat"
            aria-label="Chat"
            className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200/80 dark:border-gray-600 bg-white/90 dark:bg-gray-800/90 text-teal-600 dark:text-teal-400 shadow-sm hover:shadow-md hover:border-teal-300/60 dark:hover:border-teal-600/50 transition-all"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {chatTotalUnread > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 z-10 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold tabular-nums pointer-events-none"
                aria-label={`${chatTotalUnread} pesan belum dibaca`}
              >
                {chatTotalUnread > 99 ? '99+' : chatTotalUnread}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              closeChatOffcanvas()
              openChatAiOffcanvas()
            }}
            title="eBeddien (Chat AI)"
            aria-label="eBeddien (Chat AI)"
            className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200/80 dark:border-gray-600 bg-white/90 dark:bg-gray-800/90 text-violet-600 dark:text-violet-400 shadow-sm hover:shadow-md hover:border-violet-300/60 dark:hover:border-violet-600/50 transition-all"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={openSyncOutbox}
            title="Antrean sinkron"
            aria-label="Antrean sinkron"
            className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200/80 dark:border-gray-600 bg-white/90 dark:bg-gray-800/90 text-slate-600 dark:text-slate-300 shadow-sm hover:shadow-md hover:border-slate-400/50 dark:hover:border-slate-500/50 transition-all"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h10M4 18h10" />
            </svg>
            {syncOutboxShowBadge && (
              <span className="absolute -top-1 -right-1 min-w-[1.125rem] h-[1.125rem] px-0.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
                {syncOutboxN > 99 ? '99+' : syncOutboxN}
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Menu
          </h2>
          <button
            type="button"
            onClick={() => navigate('/semua-menu')}
            className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
          >
            View All &gt;
          </button>
        </div>
        <div
          className="beranda-menu-scroll overflow-x-auto overflow-y-hidden pb-1 -mx-1 px-0.5"
          style={{
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: showMenuScrollbar ? 'thin' : 'none',
            msOverflowStyle: 'none',
          }}
          onScroll={handleMenuScroll}
          onMouseEnter={() => setShowMenuScrollbar(true)}
          onMouseLeave={() => {
            menuScrollTimeoutRef.current && clearTimeout(menuScrollTimeoutRef.current)
            setTimeout(() => setShowMenuScrollbar(false), 500)
          }}
        >
          <style>{`
            .beranda-menu-scroll::-webkit-scrollbar { height: ${showMenuScrollbar ? '4px' : '0'}; transition: height 0.2s; }
            .beranda-menu-scroll::-webkit-scrollbar-track { background: transparent; }
            .beranda-menu-scroll::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.3); border-radius: 4px; }
            .beranda-menu-scroll::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.5); }
            .dark .beranda-menu-scroll::-webkit-scrollbar-thumb { background: rgba(71, 85, 105, 0.4); }
            .dark .beranda-menu-scroll::-webkit-scrollbar-thumb:hover { background: rgba(71, 85, 105, 0.6); }
          `}</style>
          <motion.div
            className={
              menuListLoading || berandaMenus.length === 0
                ? 'flex gap-2 items-center min-h-[88px]'
                : berandaMenus.length <= menuSingleRowThreshold
                  ? 'flex gap-2'
                  : 'flex flex-col gap-2'
            }
            style={{ width: 'max-content', minWidth: '100%' }}
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {menuListLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 px-2 py-3">
                <span className="inline-block h-5 w-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin shrink-0" />
                Memuat menu…
              </div>
            ) : berandaMenus.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 px-2 py-3">Belum ada menu yang ditampilkan.</p>
            ) : berandaMenus.length <= menuSingleRowThreshold ? (
              berandaMenus.map((item, idx) => {
                const c = getMenuColor(item.path, idx)
                return (
                  <motion.button
                    key={item.path}
                    type="button"
                    variants={staggerItem}
                    transition={listItemTransition}
                    onClick={() => navigate(item.path)}
                    className={`group flex flex-col items-center justify-center gap-1.5 min-w-[56px] sm:min-w-[64px] px-2 py-3 rounded-lg border shadow-sm hover:shadow transition-all duration-200 shrink-0 text-gray-700 dark:text-gray-200 ${c.cardBg} ${c.card}`}
                  >
                    <span className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center shrink-0 ${c.cardBg} ${c.iconText} transition-colors duration-200`}>
                      {getMenuIcon(item.path, 'w-5 h-5', menuCatalogForIcons)}
                    </span>
                    <span className="text-[10px] sm:text-[11px] font-medium text-center leading-tight line-clamp-2 text-gray-700 dark:text-gray-200">
                      {item.label}
                    </span>
                  </motion.button>
                )
              })
            ) : (
              (() => {
                // Lebih dari threshold → 2 baris (row1 + row2)
                const half = Math.ceil(berandaMenus.length / 2)
                const row1 = berandaMenus.slice(0, half)
                const row2 = berandaMenus.slice(half)
                const menuButton = (item, idx) => {
                  const c = getMenuColor(item.path, idx)
                  return (
                    <motion.button
                      key={item.path}
                      type="button"
                      variants={staggerItem}
                      transition={listItemTransition}
                      onClick={() => navigate(item.path)}
                      className={`group flex flex-col items-center justify-center gap-1.5 min-w-[56px] sm:min-w-[64px] px-2 py-3 rounded-lg border shadow-sm hover:shadow transition-all duration-200 shrink-0 text-gray-700 dark:text-gray-200 ${c.cardBg} ${c.card}`}
                    >
                      <span className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center shrink-0 ${c.cardBg} ${c.iconText} transition-colors duration-200`}>
                        {getMenuIcon(item.path, 'w-5 h-5', menuCatalogForIcons)}
                      </span>
                      <span className="text-[10px] sm:text-[11px] font-medium text-center leading-tight line-clamp-2 text-gray-700 dark:text-gray-200">
                        {item.label}
                      </span>
                    </motion.button>
                  )
                }
                return (
                  <>
                    <div className="flex gap-2">
                      {row1.map((item, i) => menuButton(item, i))}
                    </div>
                    <div className="flex gap-2">
                      {row2.map((item, i) => menuButton(item, half + i))}
                    </div>
                  </>
                )
              })()
            )}
          </motion.div>
        </div>
      </motion.section>

      <BerandaAbsenSection />

      {/* Total Pendaftaran — hanya admin_psb / petugas_psb (Pendaftar, Santri Baru, Formal, Diniyah) */}
      {widgetAllowed(BERANDA_WIDGET_CODES.totalPendaftaran) && (
        <motion.section
          variants={paymentSectionVariants}
          initial="hidden"
          animate="visible"
          className="px-4 sm:px-0"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Total Pendaftaran
            </h2>
            <button
              type="button"
              onClick={() => navigate('/pendaftaran/dashboard')}
              className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
            >
              Lihat Dashboard &gt;
            </button>
          </div>
          <div className="rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-700/50 overflow-hidden shadow-sm">
            {dashboardPendaftaranLoading ? (
              <div className="p-5 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Memuat...</p>
              </div>
            ) : (
              <motion.div
                variants={paymentStaggerContainer}
                initial="hidden"
                animate="visible"
                className="p-4 sm:p-5"
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  <motion.div variants={paymentStaggerItem} className="rounded-lg bg-blue-50/80 dark:bg-blue-900/20 p-3 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider truncate">Pendaftar</p>
                      <p className="text-base sm:text-lg font-bold text-blue-600 dark:text-blue-400 tabular-nums mt-0.5">
                        {(dashboardPendaftaran?.total_pendaftar ?? 0).toLocaleString('id-ID')}
                      </p>
                    </div>
                    <div className="bg-blue-500 p-2 rounded-lg text-white flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    </div>
                  </motion.div>
                  <motion.div variants={paymentStaggerItem} className="rounded-lg bg-emerald-50/80 dark:bg-emerald-900/20 p-3 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider truncate">Santri Baru</p>
                      <p className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                        {(dashboardPendaftaran?.total_santri_baru ?? 0).toLocaleString('id-ID')}
                      </p>
                    </div>
                    <div className="bg-emerald-500 p-2 rounded-lg text-white flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                      </svg>
                    </div>
                  </motion.div>
                  <motion.div variants={paymentStaggerItem} className="rounded-lg bg-teal-50/80 dark:bg-teal-900/20 p-3 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider truncate">Formal</p>
                      <p className="text-base sm:text-lg font-bold text-teal-600 dark:text-teal-400 tabular-nums mt-0.5">
                        {(dashboardPendaftaran?.total_formal ?? 0).toLocaleString('id-ID')}
                      </p>
                    </div>
                    <div className="bg-teal-500 p-2 rounded-lg text-white flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                  </motion.div>
                  <motion.div variants={paymentStaggerItem} className="rounded-lg bg-blue-50/80 dark:bg-blue-900/20 p-3 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider truncate">Diniyah</p>
                      <p className="text-base sm:text-lg font-bold text-blue-600 dark:text-blue-400 tabular-nums mt-0.5">
                        {(dashboardPendaftaran?.total_diniyah ?? 0).toLocaleString('id-ID')}
                      </p>
                    </div>
                    <div className="bg-blue-500 p-2 rounded-lg text-white flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </div>
        </motion.section>
      )}

      {/* Rincian pembayaran hari ini — hanya untuk admin_uwaba / petugas_uwaba; animasi section + stagger isi */}
      {widgetAllowed(BERANDA_WIDGET_CODES.pembayaranHariIni) && (
        <motion.section
          variants={paymentSectionVariants}
          initial="hidden"
          animate="visible"
          className="px-4 sm:px-0"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Pembayaran Hari Ini
            </h2>
            <button
              type="button"
              onClick={() => navigate('/dashboard-pembayaran')}
              className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
            >
              Lihat Dashboard &gt;
            </button>
          </div>
          <div className="rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-700/50 overflow-hidden shadow-sm">
            {paymentHariIniLoading ? (
              <div className="p-5 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Memuat...</p>
              </div>
            ) : paymentHariIni ? (
              <motion.div
                variants={paymentStaggerContainer}
                initial="hidden"
                animate="visible"
                className="p-4 sm:p-5 space-y-4"
              >
                <motion.div
                  variants={paymentStaggerContainer}
                  initial="hidden"
                  animate="visible"
                  className="grid grid-cols-3 gap-2 mb-4"
                >
                  <motion.div variants={paymentStaggerItem} className="rounded-lg bg-teal-50/80 dark:bg-teal-900/20 p-3 text-center">
                    <p className="text-[10px] font-medium text-teal-600 dark:text-teal-400 uppercase tracking-wider mb-0.5">UWABA</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 tabular-nums">{formatCurrency(paymentHariIni.rincian.uwaba)}</p>
                  </motion.div>
                  <motion.div variants={paymentStaggerItem} className="rounded-lg bg-amber-50/80 dark:bg-amber-900/20 p-3 text-center">
                    <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-0.5">Tunggakan</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 tabular-nums">{formatCurrency(paymentHariIni.rincian.tunggakan)}</p>
                  </motion.div>
                  <motion.div variants={paymentStaggerItem} className="rounded-lg bg-slate-50/80 dark:bg-slate-800/50 p-3 text-center">
                    <p className="text-[10px] font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-0.5">Khusus</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 tabular-nums">{formatCurrency(paymentHariIni.rincian.khusus)}</p>
                  </motion.div>
                </motion.div>
                {(Object.keys(paymentHariIni.rincianVia.uwaba || {}).length > 0 || Object.keys(paymentHariIni.rincianVia.tunggakan || {}).length > 0 || Object.keys(paymentHariIni.rincianVia.khusus || {}).length > 0) && (
                  <motion.div variants={paymentStaggerItem} className="space-y-2 pt-3 border-t border-gray-100 dark:border-gray-700/60">
                    {paymentHariIni.rincianVia.uwaba && Object.entries(paymentHariIni.rincianVia.uwaba).map(([via, amount]) => (
                      <div key={`uwaba-${via}`} className="flex justify-between text-xs">
                        <span className="text-gray-500 dark:text-gray-400">UWABA · {via || 'Lainnya'}</span>
                        <span className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">{formatCurrency(amount)}</span>
                      </div>
                    ))}
                    {paymentHariIni.rincianVia.tunggakan && Object.entries(paymentHariIni.rincianVia.tunggakan).map(([via, amount]) => (
                      <div key={`tunggakan-${via}`} className="flex justify-between text-xs">
                        <span className="text-gray-500 dark:text-gray-400">Tunggakan · {via || 'Lainnya'}</span>
                        <span className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">{formatCurrency(amount)}</span>
                      </div>
                    ))}
                    {paymentHariIni.rincianVia.khusus && Object.entries(paymentHariIni.rincianVia.khusus).map(([via, amount]) => (
                      <div key={`khusus-${via}`} className="flex justify-between text-xs">
                        <span className="text-gray-500 dark:text-gray-400">Khusus · {via || 'Lainnya'}</span>
                        <span className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">{formatCurrency(amount)}</span>
                      </div>
                    ))}
                  </motion.div>
                )}
                <motion.div variants={paymentStaggerItem} className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-gray-600">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Total</span>
                  <span className="text-base font-bold text-teal-600 dark:text-teal-400 tabular-nums">{formatCurrency(paymentHariIni.total)}</span>
                </motion.div>
              </motion.div>
            ) : (
              <div className="p-5 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada data pembayaran hari ini.</p>
              </div>
            )}
          </div>
        </motion.section>
      )}

      {/* Ringkasan Keuangan — admin_uwaba, super_admin, petugas_keuangan */}
      {widgetAllowed(BERANDA_WIDGET_CODES.ringkasanKeuangan) && (
        <motion.section
          variants={paymentSectionVariants}
          initial="hidden"
          animate="visible"
          className="px-4 sm:px-0"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Ringkasan Keuangan
            </h2>
            <button
              type="button"
              onClick={() => navigate('/dashboard-keuangan')}
              className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
            >
              Lihat Dashboard &gt;
            </button>
          </div>
          <div className="rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-700/50 overflow-hidden shadow-sm">
            {ringkasanKeuanganLoading ? (
              <div className="p-5 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Memuat...</p>
              </div>
            ) : ringkasanKeuangan ? (
              <motion.div
                variants={paymentStaggerContainer}
                initial="hidden"
                animate="visible"
                className="p-4 sm:p-5 space-y-3"
              >
                <motion.div
                  layout
                  variants={paymentStaggerItem}
                  transition={{ layout: { type: 'tween', duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } }}
                  className={`grid grid-cols-2 gap-2 ${sidebarCollapsed ? 'sm:grid-cols-4' : 'sm:grid-cols-2 xl:grid-cols-4'}`}
                >
                  <motion.div layout className="rounded-lg bg-gray-50 dark:bg-gray-700/40 p-3 text-center">
                    <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-0.5">Saldo Awal</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 tabular-nums">{formatCurrency(ringkasanKeuangan.saldo_awal_tahun)}</p>
                  </motion.div>
                  <motion.div layout className="rounded-lg bg-emerald-50/80 dark:bg-emerald-900/20 p-3 text-center">
                    <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-0.5">Pemasukan</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 tabular-nums">{formatCurrency(ringkasanKeuangan.total_pemasukan)}</p>
                  </motion.div>
                  <motion.div layout className="rounded-lg bg-rose-50/80 dark:bg-rose-900/20 p-3 text-center">
                    <p className="text-[10px] font-medium text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-0.5">Pengeluaran</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 tabular-nums">{formatCurrency(ringkasanKeuangan.total_pengeluaran)}</p>
                  </motion.div>
                  <motion.div layout className="rounded-lg bg-teal-50/80 dark:bg-teal-900/20 p-3 text-center">
                    <p className="text-[10px] font-medium text-teal-600 dark:text-teal-400 uppercase tracking-wider mb-0.5">Sisa Saldo</p>
                    <p className="text-sm font-semibold text-teal-700 dark:text-teal-300 tabular-nums">{formatCurrency(ringkasanKeuangan.sisa_saldo)}</p>
                  </motion.div>
                </motion.div>
                {(tahunAjaran || tahunAjaranMasehi) && (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
                    Tahun ajaran {tahunAjaran || '–'}
                    {tahunAjaranMasehi && <span> / {tahunAjaranMasehi}</span>}
                  </p>
                )}
              </motion.div>
            ) : (
              <div className="p-5 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada data keuangan.</p>
              </div>
            )}
          </div>
        </motion.section>
      )}

      {/* Aktivitas terbaru — list rapi per baris */}
      {widgetAllowed(BERANDA_WIDGET_CODES.aktivitasTerbaru) && (
      <motion.section
        variants={blockVariants}
        custom={3}
        initial="hidden"
        animate="visible"
        className="px-4 sm:px-0"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Aktivitas Terbaru
          </h2>
          {allowedMenus.some((m) => m.path === '/aktivitas-saya') && (
            <button
              type="button"
              onClick={() => navigate('/aktivitas-saya')}
              className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
            >
              Lihat Semua &gt;
            </button>
          )}
        </div>
        <div className="rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-700/50 overflow-hidden shadow-sm">
          {aktivitasLoading ? (
            <div className="p-6 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">Memuat...</p>
            </div>
          ) : aktivitasList.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada aktivitas tercatat.</p>
            </div>
          ) : (
            <motion.ul
              className="divide-y divide-gray-100 dark:divide-gray-700/60"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {aktivitasList.map((a) => {
                const actionLabel = (a.action || '').toLowerCase()
                const isCreate = actionLabel === 'create'
                const isUpdate = actionLabel === 'update'
                const isDelete = actionLabel === 'delete'
                const dotClass = isCreate
                  ? 'bg-teal-500 dark:bg-teal-400'
                  : isUpdate
                    ? 'bg-amber-500 dark:bg-amber-400'
                    : isDelete
                      ? 'bg-red-500 dark:bg-red-400'
                      : 'bg-gray-400 dark:bg-gray-500'
                const timeStr = a.created_at ? new Date(a.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '–'
                return (
                  <motion.li
                    key={a.id}
                    variants={staggerItem}
                    transition={listItemTransition}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/80 dark:hover:bg-gray-700/30 transition-colors"
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotClass}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                        <span className="capitalize">{a.action}</span>
                        <span className="text-gray-500 dark:text-gray-400 font-normal"> · {a.entity_type}</span>
                        {a.entity_id != null && a.entity_id !== '' && (
                          <span className="text-gray-400 dark:text-gray-500 font-mono text-xs ml-0.5">#{a.entity_id}</span>
                        )}
                      </p>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 tabular-nums">{timeStr}</p>
                    </div>
                  </motion.li>
                )
              })}
            </motion.ul>
          )}
        </div>
      </motion.section>
      )}
      </div>
    </motion.div>
  )

  return (
    <div className="h-full min-h-0 flex flex-col lg:flex-row lg:overflow-x-hidden">
      <style>{`
        .beranda-main-scroll { scrollbar-width: thin; scrollbar-color: rgba(148, 163, 184, 0.35) transparent; }
        .dark .beranda-main-scroll { scrollbar-color: rgba(71, 85, 105, 0.5) transparent; }
        .beranda-main-scroll::-webkit-scrollbar { width: 8px; }
        .beranda-main-scroll::-webkit-scrollbar-track { background: transparent; }
        .beranda-main-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 4px; transition: background 0.2s ease; }
        .beranda-main-scroll:hover::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.35); }
        .beranda-main-scroll::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.55); }
        .dark .beranda-main-scroll:hover::-webkit-scrollbar-thumb { background: rgba(71, 85, 105, 0.5); }
        .dark .beranda-main-scroll::-webkit-scrollbar-thumb:hover { background: rgba(71, 85, 105, 0.7); }
      `}</style>
      {/* PC: kolom kiri scroll sendiri; kolom kanan (kalender) tinggi ikut layar, tidak ikut scroll */}
      {isPc ? (
        <>
          <div className={`beranda-main-scroll flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-gray-50/80 to-transparent dark:from-gray-900/40 dark:to-transparent`}>
            <div className="min-w-0 -mx-2 sm:mx-0">
              {berandaContent}
            </div>
          </div>
          {widgetAllowed(BERANDA_WIDGET_CODES.kalenderSamping) && (
          <motion.aside
            className="h-full shrink-0 w-[28rem] max-w-[32rem] xl:max-w-[36rem] border-l border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 flex flex-col min-h-0 overflow-hidden"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            transition={{ type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.4 }}
          >
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              <Suspense fallback={
                <div className="flex items-center justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
                  <span>Memuat kalender...</span>
                </div>
              }>
                <KalenderPage />
              </Suspense>
            </div>
          </motion.aside>
          )}
        </>
      ) : (
        <div className={`beranda-main-scroll flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden -mx-2 sm:mx-0 bg-gradient-to-b from-gray-50/80 to-transparent dark:from-gray-900/40 dark:to-transparent`}>
          {berandaContent}
        </div>
      )}
    </div>
  )
}
