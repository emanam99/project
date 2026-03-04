import { motion } from 'framer-motion'

/**
 * Sidebar Navigation Component
 * Menampilkan navigasi vertikal di sisi kiri dengan indikator aktif
 */
function SidebarNavigation({ isOpen, activeSection, scrollToSection }) {
  const sections = ['dataDiri', 'biodataAyah', 'biodataIbu', 'biodataWali', 'alamat', 'riwayatMadrasah', 'riwayatSekolah', 'informasiTambahan', 'statusPendaftaran']
  
  // Calculate indicator position
  const getIndicatorY = () => {
    const index = sections.indexOf(activeSection)
    if (index === -1) return 16
    
    let baseY = 16 + (index * 48) + 18 - 12 - 14
    return baseY
  }

  const sectionConfig = [
    { key: 'dataDiri', title: 'Data Diri', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
      </svg>
    )},
    { key: 'biodataAyah', title: 'Biodata Ayah', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="5" strokeWidth="2"/>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 13v8M8 21h8"/>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 13l-3-2M12 13l3-2"/>
      </svg>
    )},
    { key: 'biodataIbu', title: 'Biodata Ibu', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="5" strokeWidth="2"/>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 13v8M8 21h8"/>
        <circle cx="12" cy="13" r="2" strokeWidth="2"/>
      </svg>
    )},
    { key: 'biodataWali', title: 'Biodata Wali', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
      </svg>
    )},
    { key: 'alamat', title: 'Alamat', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
      </svg>
    )},
    { key: 'riwayatMadrasah', title: 'Riwayat Madrasah', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
      </svg>
    )},
    { key: 'riwayatSekolah', title: 'Riwayat Sekolah', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z"></path>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"></path>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14v9"></path>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v9"></path>
      </svg>
    )},
    { key: 'informasiTambahan', title: 'Informasi Tambahan', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
    )},
    { key: 'statusPendaftaran', title: 'Status Pendaftaran', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
      </svg>
    )}
  ]

  return (
    <div className={`absolute left-0 top-0 bottom-0 w-12 bg-gray-200 dark:bg-gray-700/50 border-r-2 border-gray-300 dark:border-gray-600 z-10 transition-transform duration-300 ${
      isOpen ? 'translate-x-0' : '-translate-x-full'
    }`}>
      <div className="flex flex-col items-center py-4 gap-3 h-full overflow-y-auto relative">
        {/* Single moving indicator bar */}
        <motion.div
          layout
          className="absolute left-0 w-1 h-6 bg-teal-600 dark:bg-teal-400 rounded-r-full z-10"
          initial={false}
          animate={{
            y: getIndicatorY()
          }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
        
        {sectionConfig.map((section) => (
          <button
            key={section.key}
            onClick={() => scrollToSection(section.key)}
            className={`p-2 rounded-lg transition-all duration-300 ease-in-out relative ${
              activeSection === section.key
                ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400'
                : 'hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
            }`}
            title={section.title}
          >
            {section.icon}
          </button>
        ))}
      </div>
    </div>
  )
}

export default SidebarNavigation
