import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useKurikulumFiturAccess } from '../../../hooks/useKurikulumFiturAccess'
import { KURIKULUM_TAB_ORDER } from '../../../config/kurikulumFiturCodes'
import Kitab from '../Kitab'
import Mapel from '../Mapel'
import JadwalTab from './JadwalTab'

const TAB_CLASS = (active) =>
  `flex-1 min-w-0 px-2 sm:px-4 py-2.5 sm:py-3 text-center text-xs sm:text-sm font-medium border-b-2 transition-colors truncate ${
    active
      ? 'border-teal-500 text-teal-600 dark:text-teal-400'
      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
  }`

export default function Kurikulum() {
  const fitur = useKurikulumFiturAccess()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab')

  const allowedOf = useCallback(
    () => ({
      kitab: fitur.tabKitab,
      mapel: fitur.tabMapel,
      jadwal: fitur.tabJadwal,
    }),
    [fitur.tabKitab, fitur.tabMapel, fitur.tabJadwal]
  )

  const firstAllowed = useCallback(() => {
    const allowed = allowedOf()
    return KURIKULUM_TAB_ORDER.find((t) => allowed[t]) || 'kitab'
  }, [allowedOf])

  const [activeTab, setActiveTab] = useState(() => {
    if (tabFromUrl && KURIKULUM_TAB_ORDER.includes(tabFromUrl)) return tabFromUrl
    return 'kitab'
  })

  useEffect(() => {
    const allowed = allowedOf()
    if (!allowed[activeTab]) {
      const next = firstAllowed()
      if (next) setActiveTab(next)
    }
  }, [activeTab, allowedOf, firstAllowed])

  useEffect(() => {
    const allowed = allowedOf()
    if (tabFromUrl && allowed[tabFromUrl]) {
      setActiveTab(tabFromUrl)
    }
  }, [tabFromUrl, allowedOf])

  const goToTab = useCallback(
    (tab) => {
      const allowed = allowedOf()
      if (!allowed[tab]) return
      setActiveTab(tab)
      const next = new URLSearchParams(searchParams)
      next.set('tab', tab)
      setSearchParams(next, { replace: true })
    },
    [allowedOf, searchParams, setSearchParams]
  )

  if (fitur.noTabAccess) {
    return (
      <div className="h-full overflow-hidden flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-900">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 max-w-md text-center">
          <p className="text-gray-700 dark:text-gray-200 font-medium">Akses tab Kurikulum tidak diaktifkan</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Minta admin mengatur fitur aksi tab di Pengaturan → Fitur untuk peran Anda.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden bg-gray-50 dark:bg-gray-900" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
        <div className="p-4 sm:p-6 lg:p-8 pb-24 sm:pb-6 lg:pb-8">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <div className="sticky top-0 z-20 bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 mb-6">
              <div className="border-b border-gray-200 dark:border-gray-700 min-w-0">
                <nav className="flex -mb-px w-full min-w-0 flex-nowrap items-stretch">
                  <div className="flex min-w-0 flex-1">
                    {fitur.tabKitab && (
                      <button type="button" onClick={() => goToTab('kitab')} className={TAB_CLASS(activeTab === 'kitab')}>
                        Kitab
                      </button>
                    )}
                    {fitur.tabMapel && (
                      <button type="button" onClick={() => goToTab('mapel')} className={TAB_CLASS(activeTab === 'mapel')}>
                        Mapel
                      </button>
                    )}
                    {fitur.tabJadwal && (
                      <button
                        type="button"
                        onClick={() => goToTab('jadwal')}
                        className={TAB_CLASS(activeTab === 'jadwal')}
                      >
                        Jadwal
                      </button>
                    )}
                  </div>
                </nav>
              </div>
            </div>

            {activeTab === 'kitab' && fitur.tabKitab && <Kitab embedded />}
            {activeTab === 'mapel' && fitur.tabMapel && <Mapel embedded />}
            {activeTab === 'jadwal' && fitur.tabJadwal && <JadwalTab />}
          </motion.div>
        </div>
      </div>
    </div>
  )
}
