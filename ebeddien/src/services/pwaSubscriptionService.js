import { subscriptionAPI } from './api'
import { getVapidPublicKey } from '../config/pwa'

/**
 * Service untuk mengelola PWA Push Notification Subscription
 */
class PWASubscriptionService {
  /**
   * Request permission untuk notifications
   */
  async requestPermission() {
    if (!('Notification' in window)) {
      throw new Error('Browser tidak mendukung notifications')
    }

    if (Notification.permission === 'granted') {
      return true
    }

    if (Notification.permission === 'denied') {
      throw new Error('Permission untuk notifications sudah ditolak')
    }

    const permission = await Notification.requestPermission()
    return permission === 'granted'
  }

  /**
   * Check apakah service worker dan push manager tersedia
   */
  isSupported() {
    return (
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    )
  }

  /**
   * Get service worker registration
   */
  async getServiceWorkerRegistration() {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker tidak didukung')
    }

    const registration = await navigator.serviceWorker.ready
    return registration
  }

  /**
   * Subscribe untuk push notifications
   */
  async subscribe() {
    console.log('🔔 Starting subscribe process...')
    
    if (!this.isSupported()) {
      throw new Error('Push notifications tidak didukung di browser ini')
    }

    // Request permission
    console.log('🔐 Requesting permission...')
    await this.requestPermission()
    console.log('✅ Permission granted')

    // Get service worker registration
    console.log('👷 Getting service worker registration...')
    const registration = await this.getServiceWorkerRegistration()
    console.log('✅ Service worker ready')

    // Get VAPID public key
    const vapidPublicKey = this.getVapidPublicKey()
    if (!vapidPublicKey) {
      throw new Error('VAPID public key tidak dikonfigurasi. Set VITE_VAPID_PUBLIC_KEY di .env')
    }
    console.log('✅ VAPID public key available')

    // Convert VAPID key
    console.log('🔄 Converting VAPID key...')
    const applicationServerKey = this.urlBase64ToUint8Array(vapidPublicKey)
    console.log('✅ VAPID key converted')

    // Subscribe ke push manager
    console.log('📝 Subscribing to push manager...')
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey
    })
    console.log('✅ Subscribed successfully, endpoint:', subscription.endpoint.substring(0, 50) + '...')

    // Convert subscription ke format yang bisa dikirim ke server
    const subscriptionData = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: this.arrayBufferToBase64(subscription.getKey('p256dh')),
        auth: this.arrayBufferToBase64(subscription.getKey('auth'))
      }
    }

    console.log('✅ Subscription data prepared')
    return subscriptionData
  }

  /**
   * Unsubscribe dari push notifications
   */
  async unsubscribe() {
    if (!this.isSupported()) {
      return
    }

    try {
      const registration = await this.getServiceWorkerRegistration()
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        await subscription.unsubscribe()
      }
    } catch (error) {
      console.error('Error unsubscribing:', error)
    }
  }

  /**
   * Save subscription ke backend
   */
  async saveSubscriptionToBackend(subscriptionData) {
    try {
      console.log('📤 Calling subscriptionAPI.saveSubscription...')
      const response = await subscriptionAPI.saveSubscription(subscriptionData)
      console.log('✅ Subscription saved successfully:', response)
      return response
    } catch (error) {
      console.error('❌ Error saving subscription to backend:', error)
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      })
      throw error
    }
  }

  /**
   * Delete subscription dari backend
   */
  async deleteSubscriptionFromBackend(endpoint) {
    try {
      const response = await subscriptionAPI.deleteSubscriptionByEndpoint({ endpoint })
      return response
    } catch (error) {
      console.error('Error deleting subscription from backend:', error)
      throw error
    }
  }

  /**
   * Get current subscription
   */
  async getCurrentSubscription() {
    if (!this.isSupported()) {
      return null
    }

    try {
      const registration = await this.getServiceWorkerRegistration()
      const subscription = await registration.pushManager.getSubscription()
      return subscription
    } catch (error) {
      console.error('Error getting current subscription:', error)
      return null
    }
  }

  /**
   * Initialize subscription (subscribe dan save ke backend)
   */
  async initialize() {
    try {
      console.log('🔔 Initializing PWA subscription...')
      
      // Check support
      if (!this.isSupported()) {
        console.warn('❌ Push notifications tidak didukung')
        return { success: false, message: 'Push notifications tidak didukung' }
      }
      console.log('✅ Push notifications didukung')

      // Check permission
      if (Notification.permission !== 'granted') {
        console.log('⚠️ Permission belum granted, meminta permission...')
        const granted = await this.requestPermission()
        if (!granted) {
          console.warn('❌ Permission ditolak')
          return { success: false, message: 'Permission ditolak' }
        }
        console.log('✅ Permission granted')
      } else {
        console.log('✅ Permission sudah granted')
      }

      // Check VAPID public key
      const vapidPublicKey = this.getVapidPublicKey()
      if (!vapidPublicKey) {
        console.error('❌ VAPID public key tidak dikonfigurasi. Set VITE_VAPID_PUBLIC_KEY di .env')
        return { success: false, message: 'VAPID public key tidak dikonfigurasi' }
      }
      console.log('✅ VAPID public key tersedia')

      // Get current subscription
      console.log('🔍 Checking current subscription...')
      const currentSubscription = await this.getCurrentSubscription()

      if (currentSubscription) {
        console.log('✅ Subscription sudah ada, menyimpan ke backend...')
        // Sudah ada subscription, save ke backend
        const subscriptionData = {
          endpoint: currentSubscription.endpoint,
          keys: {
            p256dh: this.arrayBufferToBase64(currentSubscription.getKey('p256dh')),
            auth: this.arrayBufferToBase64(currentSubscription.getKey('auth'))
          }
        }

        console.log('📤 Saving subscription to backend...', { endpoint: subscriptionData.endpoint.substring(0, 50) + '...' })
        const result = await this.saveSubscriptionToBackend(subscriptionData)
        console.log('✅ Subscription saved:', result)
        return { success: true, message: 'Subscription sudah ada dan disimpan' }
      } else {
        console.log('📝 Subscription belum ada, membuat subscription baru...')
        // Belum ada, buat subscription baru
        const subscriptionData = await this.subscribe()
        console.log('✅ Subscription created, saving to backend...', { endpoint: subscriptionData.endpoint.substring(0, 50) + '...' })
        const result = await this.saveSubscriptionToBackend(subscriptionData)
        console.log('✅ Subscription saved:', result)
        return { success: true, message: 'Subscription berhasil dibuat' }
      }
    } catch (error) {
      console.error('❌ Error initializing subscription:', error)
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      })
      return { success: false, message: error.message || 'Gagal menginisialisasi subscription' }
    }
  }

  /**
   * Helper: Convert VAPID public key dari base64 URL ke Uint8Array
   * VAPID key menggunakan base64url encoding (bukan base64 biasa)
   */
  urlBase64ToUint8Array(base64String) {
    if (!base64String) {
      throw new Error('VAPID public key tidak tersedia')
    }

    // Padding untuk base64url jika diperlukan
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/')

    // Convert base64 ke binary string
    const rawData = atob(base64)
    
    // Convert binary string ke Uint8Array
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    
    return outputArray
  }

  /**
   * Helper: Convert ArrayBuffer ke Base64
   */
  arrayBufferToBase64(buffer) {
    if (!buffer) return ''
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  /**
   * Get VAPID public key dari config
   */
  getVapidPublicKey() {
    return getVapidPublicKey()
  }
}

// Export singleton instance
export const pwaSubscriptionService = new PWASubscriptionService()
export default pwaSubscriptionService

