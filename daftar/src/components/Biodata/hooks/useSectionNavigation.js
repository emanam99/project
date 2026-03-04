import { useState, useEffect, useRef } from 'react'

/**
 * Custom hook untuk mengelola navigasi section dengan sidebar
 */
export const useSectionNavigation = () => {
  const [activeSection, setActiveSection] = useState('dataDiri')
  
  // Create refs for each section
  const sectionRefs = {
    dataDiri: useRef(null),
    biodataAyah: useRef(null),
    biodataIbu: useRef(null),
    biodataWali: useRef(null),
    alamat: useRef(null),
    riwayatMadrasah: useRef(null),
    riwayatSekolah: useRef(null),
    informasiTambahan: useRef(null),
    statusPendaftaran: useRef(null)
  }
  
  // Function to scroll to a specific section
  const scrollToSection = (sectionKey) => {
    const ref = sectionRefs[sectionKey]
    if (ref?.current) {
      const scrollContainer = ref.current.closest('.overflow-y-auto')
      
      if (scrollContainer) {
        requestAnimationFrame(() => {
          const containerRect = scrollContainer.getBoundingClientRect()
          const elementRect = ref.current.getBoundingClientRect()
          const offset = 24
          const scrollTop = scrollContainer.scrollTop + (elementRect.top - containerRect.top) - offset
          
          scrollContainer.scrollTo({
            top: Math.max(0, scrollTop),
            behavior: 'smooth'
          })
        })
      } else {
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
  }, [])
  
  return {
    sectionRefs,
    activeSection,
    scrollToSection
  }
}
