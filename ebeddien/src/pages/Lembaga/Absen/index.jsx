import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AbsenLokasiProvider } from '../../../contexts/AbsenLokasiContext'
import { useAbsenFiturAccess } from '../../../hooks/useAbsenFiturAccess'
import AbsenRiwayatTab from './AbsenRiwayatTab'
import AbsenAbsenLokasiTab from './AbsenAbsenLokasiTab'
import AbsenNgabsenTab from './AbsenNgabsenTab'

const TAB_ORDER = ['riwayat', 'absen', 'ngabsen']

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
    absenFitur.tabNgabsen
  ])

  useEffect(() => {
    const allowed = {
      riwayat: absenFitur.tabRiwayat,
      absen: absenFitur.tabAbsen,
      ngabsen: absenFitur.tabNgabsen
    }
    if (tabFromUrl && allowed[tabFromUrl]) {
      setActiveTab(tabFromUrl)
    }
  }, [tabFromUrl, absenFitur.tabRiwayat, absenFitur.tabAbsen, absenFitur.tabNgabsen])

  const goToTab = useCallback(
    (tab) => {
      const allowed = {
        riwayat: absenFitur.tabRiwayat,
        absen: absenFitur.tabAbsen,
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
          <div className="p-4 sm:p-6 lg:p-8">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
            >
              <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 mb-6">
              <div className="border-b border-gray-200 dark:border-gray-700 min-w-0">
                <nav className="flex -mb-px w-full min-w-0 flex-nowrap items-stretch">
                  {absenFitur.tabRiwayat && (
                    <button
                      type="button"
                      onClick={() => goToTab('riwayat')}
                      className={`flex-1 min-w-0 max-w-full px-2 sm:px-4 py-2.5 sm:py-3 text-center text-xs sm:text-sm font-medium border-b-2 transition-colors truncate ${
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
                      className={`flex-1 min-w-0 max-w-full px-2 sm:px-4 py-2.5 sm:py-3 text-center text-xs sm:text-sm font-medium border-b-2 transition-colors truncate ${
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
                      className={`flex-1 min-w-0 max-w-full px-2 sm:px-4 py-2.5 sm:py-3 text-center text-xs sm:text-sm font-medium border-b-2 transition-colors truncate ${
                        activeTab === 'ngabsen'
                          ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                      }`}
                    >
                      Ngabsen
                    </button>
                  )}
                </nav>
              </div>
            </div>

              {activeTab === 'riwayat' && <AbsenRiwayatTab />}
              {activeTab === 'absen' && <AbsenAbsenLokasiTab />}
              {activeTab === 'ngabsen' && <AbsenNgabsenTab />}
            </motion.div>
          </div>
        </div>
      </div>
    </AbsenLokasiProvider>
  )
}
