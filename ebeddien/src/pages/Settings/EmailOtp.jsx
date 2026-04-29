import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useNotification } from '../../contexts/NotificationContext'
import { settingsAPI } from '../../services/api'

const DEFAULT_FORM = {
  enabled: false,
  smtp_username: '',
  smtp_password: '',
  from_name: 'eBeddien',
  otp_subject: 'Kode OTP Konfirmasi'
}

export default function EmailOtp() {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [smtpPasswordSet, setSmtpPasswordSet] = useState(false)
  const [testRecipient, setTestRecipient] = useState('')
  const [testSubject, setTestSubject] = useState('Tes koneksi SMTP eBeddien')
  const [testMessage, setTestMessage] = useState('Ini email tes dari menu Settings -> Email OTP.')

  useEffect(() => {
    let cancelled = false
    settingsAPI.getEmailConfig()
      .then((res) => {
        if (cancelled) return
        if (res?.success && res?.data) {
          setForm({
            enabled: !!res.data.enabled,
            smtp_username: res.data.smtp_username || '',
            smtp_password: '',
            from_name: res.data.from_name || 'eBeddien',
            otp_subject: res.data.otp_subject || 'Kode OTP Konfirmasi'
          })
          setSmtpPasswordSet(!!res.data.smtp_password_set)
        } else {
          showNotification(res?.message || 'Gagal memuat pengaturan email', 'error')
        }
      })
      .catch((err) => {
        if (cancelled) return
        showNotification(err?.response?.data?.message || 'Gagal memuat pengaturan email', 'error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [showNotification])

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = { ...form }
      const res = await settingsAPI.saveEmailConfig(payload)
      if (res?.success) {
        if ((form.smtp_password || '').trim() !== '') setSmtpPasswordSet(true)
        setForm((prev) => ({ ...prev, smtp_password: '' }))
        showNotification(res?.message || 'Pengaturan email disimpan', 'success')
      } else {
        showNotification(res?.message || 'Gagal menyimpan pengaturan email', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal menyimpan pengaturan email', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleTestSend = async () => {
    const recipient = (testRecipient || '').trim()
    if (!recipient) {
      showNotification('Isi email tujuan tes terlebih dulu.', 'warning')
      return
    }
    setTesting(true)
    try {
      const res = await settingsAPI.testEmailConfig({
        recipient_email: recipient,
        subject: (testSubject || '').trim(),
        message: (testMessage || '').trim()
      })
      if (res?.success) showNotification(res?.message || 'Email tes berhasil dikirim', 'success')
      else showNotification(res?.message || 'Email tes gagal dikirim', 'error')
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Email tes gagal dikirim', 'error')
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="h-full min-h-0 flex flex-col overflow-hidden">
        <div className="flex items-center justify-center flex-1 min-h-[200px]">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="max-w-3xl mx-auto p-4 pb-8 space-y-4">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Konfigurasi OTP Email (PHPMailer)</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                OTP verifikasi perubahan nomor WA dikirim via Hostinger SMTP.
              </p>
            </div>
            <div className="p-4 space-y-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => handleChange('enabled', e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Aktifkan OTP email</span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input value={form.smtp_username} onChange={(e) => handleChange('smtp_username', e.target.value)} placeholder="SMTP username (email Hostinger)" className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100" />
                <input value={form.smtp_password} onChange={(e) => handleChange('smtp_password', e.target.value)} placeholder={smtpPasswordSet ? 'Kosongkan jika tidak ganti password' : 'SMTP password'} type="password" className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100" />
                <input value={form.from_name} onChange={(e) => handleChange('from_name', e.target.value)} placeholder="From name" className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100" />
                <input value={form.otp_subject} onChange={(e) => handleChange('otp_subject', e.target.value)} placeholder="Subject OTP" className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100" />
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3 py-2">
                Host: <span className="font-mono">smtp.hostinger.com</span> · Port: <span className="font-mono">465</span> · Enkripsi: <span className="font-mono">SSL</span> · From email otomatis mengikuti SMTP username.
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <button type="button" onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50">
                {saving ? 'Menyimpan...' : 'Simpan konfigurasi'}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Tes kirim email</h3>
            </div>
            <div className="p-4 space-y-3">
              <input value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)} placeholder="Email tujuan tes" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100" />
              <input value={testSubject} onChange={(e) => setTestSubject(e.target.value)} placeholder="Subject tes" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100" />
              <textarea value={testMessage} onChange={(e) => setTestMessage(e.target.value)} rows={3} placeholder="Isi pesan tes" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100" />
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={handleTestSend} disabled={testing} className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium disabled:opacity-50">
                  {testing ? 'Mengirim...' : 'Kirim email tes'}
                </button>
                <Link to="/settings/notifikasi" className="text-sm text-teal-600 dark:text-teal-400 hover:underline">
                  Kembali ke Notifikasi →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
