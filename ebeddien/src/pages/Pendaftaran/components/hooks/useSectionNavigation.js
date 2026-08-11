import { useState, useEffect, useRef } from 'react'

/**
 * Custom hook untuk mengelola navigasi section dengan sidebar
 * Menggunakan IntersectionObserver untuk detect section yang aktif saat scroll
 * 
 * @returns {object} sectionRefs, activeSection, scrollToSection
 */
export const useSectionNavigation = () => {
  const [activeSection, setActiveSection] = useState('dataDiri')
  
  // Create refs for each section - must be created explicitly (hooks rules)
  const sectionRefs = {
    dataDiri: useRef(null),
    biodataAyah: useRef(null),
    biodataIbu: useRef(null),
    biodataWali: useRef(null),
    alamat: useRef(null),
    riwayatMadrasah: useRef(null),
    riwayatSekolah: useRef(null),
    informasiTambahan: useRef(null),
    statusPendaftaran: useRef(null),
    kategoriPendidikan: useRef(null),
    berkas: useRef(null)
  }
  
  // Function to scroll to a specific section
  const scrollToSection = (sectionKey) => {
    const ref = sectionRefs[sectionKey]
    if (ref?.current) {
      // Get the scrollable container (parent with overflow-y-auto)
      const scrollContainer = ref.current.closest('.overflow-y-auto')
      
      if (scrollContainer) {
        // Wait for next frame to ensure layout is stable
        requestAnimationFrame(() => {
          // Get element position relative to scroll container
          const containerRect = scrollContainer.getBoundingClientRect()
          const elementRect = ref.current.getBoundingClientRect()
          
          // Calculate scroll position: element top - container top + current scroll - offset
          // Offset untuk spacing dari atas (memperhitungkan padding container p-6 = 24px)
          const offset = 24
          const scrollTop = scrollContainer.scrollTop + (elementRect.top - containerRect.top) - offset
          
          scrollContainer.scrollTo({
            top: Math.max(0, scrollTop), // Ensure non-negative
            behavior: 'smooth'
          })
        })
      } else {
        // Fallback to default scrollIntoView with offset
        ref.current.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest'
        })
      }
    }
  }
  
  // Intersection Observer untuk detect section yang aktif
  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: '-20% 0px -60% 0px',
      threshold: 0
    }

    const observerCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // Cari section key berdasarkan ref
          const sectionKey = Object.keys(sectionRefs).find(
            key => sectionRefs[key].current === entry.target
          )
          if (sectionKey) {
            setActiveSection(sectionKey)
          }
        }
      })
    }

    const observer = new IntersectionObserver(observerCallback, observerOptions)

    // Observe semua sections
    Object.values(sectionRefs).forEach((ref) => {
      if (ref.current) {
        observer.observe(ref.current)
      }
    })

    return () => {
      observer.disconnect()
    }
  }, []) // Empty deps - sectionRefs are stable
  
  return {
    sectionRefs,
    activeSection,
    scrollToSection
  }
}

