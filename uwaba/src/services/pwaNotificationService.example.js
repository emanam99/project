/**
 * Contoh penggunaan PWA Notification Service
 * 
 * File ini berisi contoh-contoh cara menggunakan PWA Notification
 * Hapus file ini jika tidak diperlukan
 */

import { usePWANotification } from '../hooks/usePWANotification'

// Contoh 1: Request Permission
export const ExampleRequestPermission = () => {
  const { requestPermission, isGranted, isDenied } = usePWANotification()

  const handleRequestPermission = async () => {
    try {
      const permission = await requestPermission()
      if (permission === 'granted') {
        console.log('Permission granted!')
      }
    } catch (error) {
      console.error('Error:', error.message)
    }
  }

  return (
    <button onClick={handleRequestPermission} disabled={isGranted || isDenied}>
      {isGranted ? 'Permission Granted' : 'Request Notification Permission'}
    </button>
  )
}

// Contoh 2: Kirim Notifikasi Sederhana
export const ExampleSendSimpleNotification = () => {
  const { sendNotification, isGranted } = usePWANotification()

  const handleSendNotification = async () => {
    if (!isGranted) {
      alert('Permission belum diberikan')
      return
    }

    try {
      await sendNotification({
        title: 'Notifikasi Test',
        body: 'Ini adalah contoh notifikasi PWA',
        icon: '/gambar/icon/icon192.png',
        badge: '/gambar/icon/icon128.png'
      })
    } catch (error) {
      console.error('Error:', error.message)
    }
  }

  return (
    <button onClick={handleSendNotification} disabled={!isGranted}>
      Kirim Notifikasi
    </button>
  )
}

// Contoh 3: Notifikasi dengan Action Buttons
export const ExampleNotificationWithActions = () => {
  const { sendNotification, isGranted } = usePWANotification()

  const handleSendNotification = async () => {
    if (!isGranted) return

    try {
      await sendNotification({
        title: 'Rencana Pengeluaran Baru',
        body: 'Ada rencana pengeluaran baru yang perlu disetujui',
        icon: '/gambar/icon/icon192.png',
        badge: '/gambar/icon/icon128.png',
        tag: 'rencana-pengeluaran',
        data: {
          url: '/pengeluaran',
          id: 123
        },
        actions: [
          {
            action: 'view',
            title: 'Lihat Detail',
            icon: '/gambar/icon/icon128.png'
          },
          {
            action: 'dismiss',
            title: 'Tutup'
          }
        ],
        requireInteraction: true
      })
    } catch (error) {
      console.error('Error:', error.message)
    }
  }

  return (
    <button onClick={handleSendNotification} disabled={!isGranted}>
      Kirim Notifikasi dengan Actions
    </button>
  )
}

// Contoh 4: Notifikasi dengan Image
export const ExampleNotificationWithImage = () => {
  const { sendNotification, isGranted } = usePWANotification()

  const handleSendNotification = async () => {
    if (!isGranted) return

    try {
      await sendNotification({
        title: 'Pembayaran Berhasil',
        body: 'Pembayaran Anda telah berhasil diproses',
        icon: '/gambar/icon/icon192.png',
        badge: '/gambar/icon/icon128.png',
        image: '/gambar/ss/ss1.jpg',
        data: {
          url: '/pembayaran'
        }
      })
    } catch (error) {
      console.error('Error:', error.message)
    }
  }

  return (
    <button onClick={handleSendNotification} disabled={!isGranted}>
      Kirim Notifikasi dengan Image
    </button>
  )
}

// Contoh 5: Notifikasi dengan Vibration
export const ExampleNotificationWithVibration = () => {
  const { sendNotification, isGranted } = usePWANotification()

  const handleSendNotification = async () => {
    if (!isGranted) return

    try {
      await sendNotification({
        title: 'Peringatan Penting',
        body: 'Ada sesuatu yang memerlukan perhatian Anda',
        icon: '/gambar/icon/icon192.png',
        badge: '/gambar/icon/icon128.png',
        vibrate: [200, 100, 200, 100, 200, 100, 200],
        requireInteraction: true,
        data: {
          url: '/dashboard'
        }
      })
    } catch (error) {
      console.error('Error:', error.message)
    }
  }

  return (
    <button onClick={handleSendNotification} disabled={!isGranted}>
      Kirim Notifikasi dengan Vibration
    </button>
  )
}

