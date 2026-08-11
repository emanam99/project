import { useEffect, useState } from 'react'
import { usePageTahunAjaranFilter } from '../../../hooks/usePageTahunAjaranFilter'
import { useUgtKompasFiturAccess } from '../../../hooks/useUgtKompasFiturAccess'
import TahunAjaranPageFilterBar from '../../../components/TahunAjaran/TahunAjaranPageFilterBar'
import KompasDashboardTab from './KompasDashboardTab'
import KompasLombaTab from './KompasLombaTab'
import KompasDaftarTab from './KompasDaftarTab'
import KompasAturanUmumTab from './KompasAturanUmumTab'
import KompasNilaiTab from './KompasNilaiTab'

const ALL_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'lomba', label: 'Lomba' },
  { id: 'daftar', label: 'Daftar' },
  { id: 'nilai', label: 'Nilai' },
  { id: 'aturan', label: 'Aturan Umum' },
]

export default function Kompas() {
  const { selectedHijriyah, setSelectedHijriyah, hijriyahOptions } = usePageTahunAjaranFilter()
  const access = useUgtKompasFiturAccess()
  const visibleTabs = ALL_TABS.filter((t) => access.visibleTabIds.includes(t.id))
  const [tab, setTab] = useState('dashboard')

  useEffect(() => {
    if (visibleTabs.length === 0) return
    if (!visibleTabs.some((t) => t.id === tab)) {
      setTab(visibleTabs[0].id)
    }
  }, [visibleTabs, tab])

  return (
    <div className="h-full flex flex-col min-h-0 bg-gray-50/50 dark:bg-gray-900/30">
      <header className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/95">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-0">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">KOMMPAS</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Kompetisi Antar Murid Madrasah Penerima Guru Tugas
              </p>
            </div>
            <div className="flex justify-end ml-auto">
              <TahunAjaranPageFilterBar
                variant="hijriyah"
                selectedHijriyah={selectedHijriyah}
                onHijriyahChange={setSelectedHijriyah}
                hijriyahOptions={hijriyahOptions}
                className="!bg-transparent !border-0 !p-0"
              />
            </div>
          </div>
          {visibleTabs.length > 0 ? (
            <nav aria-label="Tab KOMMPAS">
              <ul className="flex gap-1 -mb-px overflow-x-auto">
                {visibleTabs.map(({ id, label }) => (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => setTab(id)}
                      className={`block px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                        tab === id
                          ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                      }`}
                    >
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {access.noTabAccess || visibleTabs.length === 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Tidak ada tab KOMMPAS yang diizinkan untuk peran Anda. Hubungi admin untuk menugaskan aksi fitur
              (Pengaturan → Role → Fitur).
            </p>
          ) : !selectedHijriyah ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Pilih tahun ajaran hijriyah di pojok kanan atas untuk menampilkan data.
            </p>
          ) : tab === 'dashboard' ? (
            <KompasDashboardTab
              tahunAjaran={selectedHijriyah}
              fitur={access}
              onNavigateTab={setTab}
            />
          ) : tab === 'aturan' ? (
            <KompasAturanUmumTab tahunAjaran={selectedHijriyah} fitur={access} />
          ) : tab === 'lomba' ? (
            <KompasLombaTab tahunAjaran={selectedHijriyah} fitur={access} />
          ) : tab === 'daftar' ? (
            <KompasDaftarTab tahunAjaran={selectedHijriyah} fitur={access} />
          ) : (
            <KompasNilaiTab />
          )}
        </div>
      </div>
    </div>
  )
}
