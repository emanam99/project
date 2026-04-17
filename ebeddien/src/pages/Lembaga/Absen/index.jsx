import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AbsenLokasiProvider } from '../../../contexts/AbsenLokasiContext'
import { useAbsenFiturAccess } from '../../../hooks/useAbsenFiturAccess'
import AbsenRiwayatTab from './AbsenRiwayatTab'
import AbsenAbsenLokasiTab from './AbsenAbsenLokasiTab'
import AbsenPengaturanTab from './AbsenPengaturanTab'
import AbsenNgabsenTab from './AbsenNgabsenTab'

const TAB_ORDER = ['riwayat', 'absen', 'ngabsen', 'pengaturan']

export default function AbsenPage() {
  const absenFitur = useAbsenFiturAccess()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(() =>
    tabFromUrl && TAB_ORDER.includes(tabFromUrl) ? tabFromUrl : 'riwayat'
  )

  useEffect(() => {
    const allowed = {
      riwayat: absenFitur.tabRiwayat,
      absen: absenFitur.tabAbsen,
      pengaturan: absenFitur.tabPengaturan,
      ngabsen: absenFitur.tabNgabsen
    }
    if (!allowed[activeTab]) {
      const next = TAB_ORDER.find((t) => allowed[t])
      if (next) setActiveTab(next)
    }
  }, [
    activeTab,
    absenFitur.tabRiwayat,
    absenFitur.tabAbsen,
    absenFitur.tabPengaturan,
    absenFitur.tabNgabsen
  ])

  useEffect(() => {
    const allowed = {
      riwayat: absenFitur.tabRiwayat,
      absen: absenFitur.tabAbsen,
      pengaturan: absenFitur.tabPengaturan,
      ngabsen: absenFitur.tabNgabsen
    }
    if (tabFromUrl && allowed[tabFromUrl]) {
      setActiveTab(tabFromUrl)
    }
  }, [
    tabFromUrl,
    absenFitur.tabRiwayat,
    absenFitur.tabAbsen,
    absenFitur.tabPengaturan,
    absenFitur.tabNgabsen
  ])

  const goToTab = useCallback(
    (tab) => {
      const allowed = {
        riwayat: absenFitur.tabRiwayat,
        absen: absenFitur.tabAbsen,
        pengaturan: absenFitur.tabPengaturan,
        ngabsen: absenFitur.tabNgabsen
      }
      if (!allowed[tab]) return
      setActiveTab(tab)
      const next = new URLSearchParams(searchParams)
      next.set('tab', tab)
      setSearchParams(next, { replace: true })
    },
    [
      searchParams,
      setSearchParams,
      absenFitur.tabRiwayat,
      absenFitur.tabAbsen,
      absenFitur.tabPengaturan,
      absenFitur.tabNgabsen
    ]
  )

  if (absenFitur.noTabAccess) {
    return (
      <div className="h-full overflow-hidden flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-900">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 max-w-md text-center">
          <p className="text-gray-700 dark:text-gray-200 font-medium">Akses tab Absen tidak diaktifkan</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Minta admin mengatur fitur aksi tab di Pengaturan → Fitur untuk peran Anda.
          </p>
        </div>
      </div>
    )
  }

  return (
    <AbsenLokasiProvider>
      <div className="h-full overflow-hidden bg-gray-50 dark:bg-gray-900" style={{ minHeight: 0 }}>
        <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
          <div className="p-4 sm:p-6 lg:p-8 pb-24 sm:pb-6 lg:pb-8">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
            >
              <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 mb-6">
                <div className="border-b border-gray-200 dark:border-gray-700 min-w-0">
                  <nav className="flex -mb-px w-full min-w-0 flex-nowrap items-stretch">
                    <div className="flex min-w-0 flex-1">
                      {absenFitur.tabRiwayat && (
                        <button
                          type="button"
                          onClick={() => goToTab('riwayat')}
                          className={`flex-1 min-w-0 px-2 sm:px-4 py-2.5 sm:py-3 text-center text-xs sm:text-sm font-medium border-b-2 transition-colors truncate ${
                            activeTab === 'riwayat'
                              ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                          }`}
                        >
                          Riwayat
                        </button>
                      )}
                      {absenFitur.tabAbsen && (
                        <button
                          type="button"
                          onClick={() => goToTab('absen')}
                          className={`flex-1 min-w-0 px-2 sm:px-4 py-2.5 sm:py-3 text-center text-xs sm:text-sm font-medium border-b-2 transition-colors truncate ${
                            activeTab === 'absen'
                              ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                          }`}
                        >
                          Absen
                        </button>
                      )}
                      {absenFitur.tabNgabsen && (
                        <button
                          type="button"
                          onClick={() => goToTab('ngabsen')}
                          className={`flex-1 min-w-0 px-2 sm:px-4 py-2.5 sm:py-3 text-center text-xs sm:text-sm font-medium border-b-2 transition-colors truncate ${
                            activeTab === 'ngabsen'
                              ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                          }`}
                        >
                          Ngabsen
                        </button>
                      )}
                    </div>
                    {absenFitur.tabPengaturan && (
                      <button
                        type="button"
                        onClick={() => goToTab('pengaturan')}
                        title="Pengaturan"
                        aria-label="Pengaturan"
                        className={`shrink-0 flex items-center justify-center gap-1.5 border-l border-gray-200 dark:border-gray-600 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
                          activeTab === 'pengaturan'
                            ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                        }`}
                      >
                        <svg
                          className="h-5 w-5 shrink-0"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          aria-hidden
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
                          />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="hidden sm:inline truncate max-w-[7rem]">Pengaturan</span>
                      </button>
                    )}
                  </nav>
                </div>
              </div>

              {activeTab === 'riwayat' && (
                <AbsenRiwayatTab
                  allowedLembagaIdsRiwayat={absenFitur.allowedLembagaIdsRiwayat}
                  riwayatLembagaFilterLocked={absenFitur.riwayatLembagaFilterLocked}
                />
              )}
              {activeTab === 'absen' && <AbsenAbsenLokasiTab />}
              {activeTab === 'pengaturan' && <AbsenPengaturanTab />}
              {activeTab === 'ngabsen' && <AbsenNgabsenTab />}
            </motion.div>
          </div>
        </div>
      </div>
    </AbsenLokasiProvider>
  )
}
