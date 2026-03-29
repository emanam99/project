import { useState, useRef } from 'react'
import { checkWhatsAppNumber } from '../../../../utils/whatsappCheck'

/**
 * Hook untuk mengecek nomor WhatsApp
 * @param {function} showNotification - Function untuk menampilkan notifikasi
 * @returns {object} Object berisi state dan fungsi untuk WhatsApp checking
 */
export function useWhatsAppCheck(showNotification) {
  const [isCheckingTelpon, setIsCheckingTelpon] = useState(false)
  const [waStatusTelpon, setWaStatusTelpon] = useState(null) // 'checking', 'registered', 'not_registered'
  const [isCheckingWaSantri, setIsCheckingWaSantri] = useState(false)
  const [waStatusWaSantri, setWaStatusWaSantri] = useState(null) // 'checking', 'registered', 'not_registered'
  
  const checkTelponTimeoutRef = useRef(null) // Timeout untuk auto-check telpon
  const checkWaSantriTimeoutRef = useRef(null) // Timeout untuk auto-check wa santri

  const countDigits = (str) => {
    if (!str) return 0
    return str.replace(/[\s-]/g, '').replace(/\D/g, '').length
  }

  // Cek nomor WhatsApp untuk No. Telpon (Nomor Wali)
  const checkPhoneNumberTelpon = async (phoneNumber, formData) => {
    const noTelpon = (phoneNumber || formData?.no_telpon)?.trim()
    
    if (!noTelpon || noTelpon === '') {
      showNotification('Masukkan nomor terlebih dahulu', 'error')
      setWaStatusTelpon(null)
      return
    }

    setIsCheckingTelpon(true)
    setWaStatusTelpon('checking')

    try {
      const result = await checkWhatsAppNumber(noTelpon)

      if (result.success && result.isRegistered) {
        setWaStatusTelpon('registered')
        showNotification('✓ Nomor terdaftar di WhatsApp', 'success')
        setTimeout(() => {
          setWaStatusTelpon('registered')
        }, 3000)
      } else if (result.success && !result.isRegistered) {
        setWaStatusTelpon('not_registered')
        showNotification('✗ Nomor tidak terdaftar di WhatsApp', 'warning')
        setTimeout(() => {
          setWaStatusTelpon(null)
        }, 3000)
      } else {
        setWaStatusTelpon(null)
        showNotification(result.message || 'Tidak dapat memverifikasi nomor (layanan WhatsApp tidak merespons). Coba lagi nanti.', 'error')
        setTimeout(() => {
          setWaStatusTelpon(null)
        }, 3000)
      }
    } catch (error) {
      console.error('Error checking WhatsApp number:', error)
      setWaStatusTelpon('not_registered')
      showNotification('Gagal mengecek nomor WhatsApp: ' + (error.message || 'Unknown error'), 'error')
      // Auto-hide setelah 3 detik
      setTimeout(() => {
        setWaStatusTelpon(null)
      }, 3000)
    } finally {
      setIsCheckingTelpon(false)
    }
  }

  // Cek nomor WhatsApp untuk No. WA Santri
  const checkPhoneNumberWaSantri = async (phoneNumber, formData) => {
    const noWaSantri = (phoneNumber || formData?.no_wa_santri)?.trim()
    
    if (!noWaSantri || noWaSantri === '') {
      showNotification('Masukkan nomor terlebih dahulu', 'error')
      setWaStatusWaSantri(null)
      return
    }

    setIsCheckingWaSantri(true)
    setWaStatusWaSantri('checking')

    try {
      const result = await checkWhatsAppNumber(noWaSantri)

      if (result.success && result.isRegistered) {
        setWaStatusWaSantri('registered')
        showNotification('✓ Nomor terdaftar di WhatsApp', 'success')
        setTimeout(() => {
          setWaStatusWaSantri('registered')
        }, 3000)
      } else if (result.success && !result.isRegistered) {
        setWaStatusWaSantri('not_registered')
        showNotification('✗ Nomor tidak terdaftar di WhatsApp', 'warning')
        setTimeout(() => {
          setWaStatusWaSantri(null)
        }, 3000)
      } else {
        setWaStatusWaSantri(null)
        showNotification(result.message || 'Tidak dapat memverifikasi nomor (layanan WhatsApp tidak merespons). Coba lagi nanti.', 'error')
        setTimeout(() => {
          setWaStatusWaSantri(null)
        }, 3000)
      }
    } catch (error) {
      console.error('Error checking WhatsApp number:', error)
      setWaStatusWaSantri('not_registered')
      showNotification('Gagal mengecek nomor WhatsApp: ' + (error.message || 'Unknown error'), 'error')
      // Auto-hide setelah 3 detik
      setTimeout(() => {
        setWaStatusWaSantri(null)
      }, 3000)
    } finally {
      setIsCheckingWaSantri(false)
    }
  }

  return {
    isCheckingTelpon,
    waStatusTelpon,
    isCheckingWaSantri,
    waStatusWaSantri,
    checkTelponTimeoutRef,
    checkWaSantriTimeoutRef,
    countDigits,
    checkPhoneNumberTelpon,
    checkPhoneNumberWaSantri,
    setWaStatusTelpon,
    setWaStatusWaSantri
  }
}

