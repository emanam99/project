import { useState, useRef } from 'react'
import { checkWhatsAppNumber, isMaskedPhone } from '../../../../utils/whatsappCheck'

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

  const hasUsablePhoneDisplay = (phone, idSantri) => {
    const raw = (phone || '').trim()
    if (!raw) return false
    if (isMaskedPhone(raw)) return idSantri != null && Number(idSantri) > 0
    return countDigits(raw) >= 10
  }

  // Cek nomor WhatsApp untuk No. Telpon (Nomor Wali)
  // opts: { id_santri } — wajib bila nomor di list sudah di-mask
  const checkPhoneNumberTelpon = async (phoneNumber, formData, opts = null) => {
    const noTelpon = (phoneNumber || formData?.no_telpon)?.trim()
    const idSantri = opts?.id_santri ?? formData?.id ?? formData?.id_santri ?? null
    const viaSantri = idSantri != null && Number(idSantri) > 0 && (!!noTelpon || isMaskedPhone(noTelpon || ''))

    if (!viaSantri && (!noTelpon || noTelpon === '')) {
      showNotification('Masukkan nomor terlebih dahulu', 'error')
      setWaStatusTelpon(null)
      return
    }

    if (!viaSantri && isMaskedPhone(noTelpon)) {
      showNotification('Nomor disamarkan — buka detail dengan id santri untuk cek WA', 'error')
      setWaStatusTelpon(null)
      return
    }

    setIsCheckingTelpon(true)
    setWaStatusTelpon('checking')

    try {
      const result = await checkWhatsAppNumber(
        noTelpon || '',
        null,
        viaSantri || isMaskedPhone(noTelpon || '')
          ? { id_santri: idSantri, field: 'no_telpon' }
          : null
      )

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
      setTimeout(() => {
        setWaStatusTelpon(null)
      }, 3000)
    } finally {
      setIsCheckingTelpon(false)
    }
  }

  // Cek nomor WhatsApp untuk No. WA Santri
  const checkPhoneNumberWaSantri = async (phoneNumber, formData, opts = null) => {
    const noWaSantri = (phoneNumber || formData?.no_wa_santri)?.trim()
    const idSantri = opts?.id_santri ?? formData?.id ?? formData?.id_santri ?? null
    const viaSantri = idSantri != null && Number(idSantri) > 0 && (!!noWaSantri || isMaskedPhone(noWaSantri || ''))

    if (!viaSantri && (!noWaSantri || noWaSantri === '')) {
      showNotification('Masukkan nomor terlebih dahulu', 'error')
      setWaStatusWaSantri(null)
      return
    }

    if (!viaSantri && isMaskedPhone(noWaSantri)) {
      showNotification('Nomor disamarkan — buka detail dengan id santri untuk cek WA', 'error')
      setWaStatusWaSantri(null)
      return
    }

    setIsCheckingWaSantri(true)
    setWaStatusWaSantri('checking')

    try {
      const result = await checkWhatsAppNumber(
        noWaSantri || '',
        null,
        viaSantri || isMaskedPhone(noWaSantri || '')
          ? { id_santri: idSantri, field: 'no_wa_santri' }
          : null
      )

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
    hasUsablePhoneDisplay,
    checkPhoneNumberTelpon,
    checkPhoneNumberWaSantri,
    setWaStatusTelpon,
    setWaStatusWaSantri
  }
}
