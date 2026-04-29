import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotification } from '../../contexts/NotificationContext'
import { notificationConfigAPI, kontakAPI } from '../../services/api'

const PROVIDERS = [
  { value: 'wa_sendiri', label: 'WA server sendiri', description: 'Pakai koneksi WhatsApp yang dikelola di halaman WhatsApp (scan QR, multi-session).' },
  { value: 'evolution', label: 'Evolution API', description: 'Pakai Evolution (mis. evo.alutsmani.id). Webhook pesan masuk + kirim balasan lewat instance yang sama — atur di Setting → Evolution WA.' },
  { value: 'watzap', label: 'WatZap', description: 'Pakai layanan WatZap (api.watzap.id). Kelola device & kirim pesan dari halaman WatZap.' }
]

const KATEGORI_LABELS = {
  biodata_terdaftar: 'Biodata tersimpan',
  berkas_lengkap: 'Berkas lengkap',
  sudah_diverifikasi: 'Sudah diverifikasi',
  verifikasi: 'Verifikasi',
  pembayaran_link: 'Pembayaran – link',
  pembayaran_berhasil: 'Pembayaran berhasil',
  pembayaran_gagal: 'Pembayaran gagal',
  pembayaran_kadaluarsa: 'Pembayaran kadaluarsa',
  pembayaran_ipaymu_order: 'Pembayaran iPayMu – order',
  pembayaran_ipaymu_qris: 'Pembayaran iPayMu – QRIS',
  pembayaran_dibatalkan: 'Pembayaran dibatalkan',
  incoming: 'Pesan masuk',
  custom: 'Pesan custom (riwayat data pendaftar)',
  daftar: 'Daftar user',
  auth: 'Ubah password / auth'
}

function getKategoriLabel(kategori) {
  return KATEGORI_LABELS[kategori] || kategori.replace(/_/g, ' ')
}

export default function Notifikasi() {
  const { showNotification } = useNotification()
  const [activeTab, setActiveTab] = useState('pengaturan')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [provider, setProvider] = useState('wa_sendiri')
  const [testPhone, setTestPhone] = useState('082232999921')
  const [testMessage, setTestMessage] = useState('')
  const [testingAlert, setTestingAlert] = useState(false)
  const [error, setError] = useState(null)
  const [groups, setGroups] = useState([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  const [offcanvasKategori, setOffcanvasKategori] = useState(null)
  const [offcanvasLabel, setOffcanvasLabel] = useState('')
  const [messages, setMessages] = useState([])
  const [messagesTotal, setMessagesTotal] = useState(0)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesPage, setMessagesPage] = useState(1)
  const limit = 30
  const [kontakItems, setKontakItems] = useState([])
  const [kontakTotal, setKontakTotal] = useState(0)
  const [kontakPage, setKontakPage] = useState(1)
  const [kontakLoading, setKontakLoading] = useState(false)
  const [kontakSearch, setKontakSearch] = useState('')
  const [deletingKontakId, setDeletingKontakId] = useState(null)
  const [kontakSelectedIds, setKontakSelectedIds] = useState([])
  const [kontakBulkDeleting, setKontakBulkDeleting] = useState(false)
  const kontakLimit = 20
  const [kontakPanelOpen, setKontakPanelOpen] = useState(false)
  const [kontakDraft, setKontakDraft] = useState(null)
  const [kontakWaSessionId, setKontakWaSessionId] = useState('default')
  const [kontakSaving, setKontakSaving] = useState(false)
  const [kontakLidLoading, setKontakLidLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    notificationConfigAPI
      .getConfig()
      .then((res) => {
        if (cancelled) return
        if (res?.success && res?.data?.provider) {
          const p = res.data.provider
          setProvider(['watzap', 'evolution', 'wa_sendiri'].includes(p) ? p : 'wa_sendiri')
        }
      })
      .catch((err) => {
        if (cancelled) return
        const msg = err?.response?.data?.message || err?.message || 'Gagal memuat pengaturan notifikasi'
        if (err?.response?.status === 404) {
          setError(null)
          return
        }
        setError(msg)
        showNotification(msg, 'error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [showNotification])

  useEffect(() => {
    if (activeTab !== 'kontak') return
    let cancelled = false
    setKontakLoading(true)
    kontakAPI.getList({ page: kontakPage, limit: kontakLimit, search: kontakSearch || undefined })
      .then((res) => {
        if (cancelled) return
        if (res?.success && res?.data) {
          setKontakItems(res.data.items || [])
          setKontakTotal(res.data.total ?? 0)
        } else {
          setKontakItems([])
          setKontakTotal(0)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setKontakItems([])
          setKontakTotal(0)
        }
      })
      .finally(() => {
        if (!cancelled) setKontakLoading(false)
      })
    return () => { cancelled = true }
  }, [activeTab, kontakPage, kontakSearch])

  useEffect(() => {
    setKontakSelectedIds([])
  }, [activeTab, kontakPage, kontakSearch])

  useEffect(() => {
    if (activeTab !== 'riwayat') return
    let cancelled = false
    setGroupsLoading(true)
    notificationConfigAPI.getNotificationGroups()
      .then((res) => {
        if (cancelled) return
        if (res?.success && Array.isArray(res?.data)) {
          setGroups(res.data)
        } else {
          setGroups([])
        }
      })
      .catch(() => {
        if (!cancelled) setGroups([])
      })
      .finally(() => {
        if (!cancelled) setGroupsLoading(false)
      })
    return () => { cancelled = true }
  }, [activeTab])

  useEffect(() => {
    if (!offcanvasOpen || !offcanvasKategori) {
      setMessages([])
      setMessagesTotal(0)
      setMessagesPage(1)
      return
    }
    let cancelled = false
    setMessagesLoading(true)
    notificationConfigAPI.getNotificationMessages(offcanvasKategori, 1, limit)
      .then((res) => {
        if (cancelled) return
        if (res?.success && res?.data) {
          setMessages(res.data.items || [])
          setMessagesTotal(res.data.total ?? 0)
          setMessagesPage(1)
        }
      })
      .catch(() => {
        if (!cancelled) setMessages([])
      })
      .finally(() => {
        if (!cancelled) setMessagesLoading(false)
      })
    return () => { cancelled = true }
  }, [offcanvasOpen, offcanvasKategori])

  const loadMoreMessages = () => {
    if (!offcanvasKategori || messagesLoading) return
    const nextPage = messagesPage + 1
    setMessagesLoading(true)
    notificationConfigAPI.getNotificationMessages(offcanvasKategori, nextPage, limit)
      .then((res) => {
        if (res?.success && res?.data?.items?.length) {
          setMessages((prev) => [...prev, ...(res.data.items || [])])
          setMessagesPage(nextPage)
        }
      })
      .finally(() => setMessagesLoading(false))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await notificationConfigAPI.saveConfig({ provider })
      if (res?.success) {
        showNotification('Pengaturan notifikasi disimpan.', 'success')
      } else {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleTestErrorAlert = async () => {
    if (testingAlert) return
    setTestingAlert(true)
    try {
      const payload = {}
      if ((testPhone || '').trim() !== '') payload.phone = testPhone.trim()
      if ((testMessage || '').trim() !== '') payload.message = testMessage.trim()
      const res = await notificationConfigAPI.testErrorAlert(payload)
      if (res?.success) {
        const providerName = res?.data?.provider || '-'
        const phone = res?.data?.phone || testPhone || '-'
        showNotification(`Tes alert terkirim via ${providerName} ke ${phone}`, 'success')
      } else {
        showNotification(res?.message || 'Tes alert gagal', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Tes alert gagal', 'error')
    } finally {
      setTestingAlert(false)
    }
  }

  const openOffcanvas = (kategori) => {
    setOffcanvasKategori(kategori)
    setOffcanvasLabel(getKategoriLabel(kategori))
    setOffcanvasOpen(true)
  }

  const closeOffcanvas = () => {
    setOffcanvasOpen(false)
    setOffcanvasKategori(null)
    setOffcanvasLabel('')
  }

  const formatDate = (str) => {
    if (!str) return '–'
    try {
      const d = new Date(str)
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch {
      return str
    }
  }

  const hasMoreMessages = messages.length < messagesTotal

  const openKontakPanel = (k) => {
    if (!k?.id) return
    setKontakDraft({
      id: k.id,
      nama: k.nama ?? '',
      nomor: k.nomor ?? '',
      nomor_kanonik: k.nomor_kanonik ?? '',
      siap_terima_notif: !!k.siap_terima_notif
    })
    setKontakWaSessionId('default')
    setKontakPanelOpen(true)
  }

  const closeKontakPanel = () => {
    setKontakPanelOpen(false)
    setKontakDraft(null)
  }

  const toggleKontakSelect = (id) => {
    setKontakSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleBulkDeleteKontak = async () => {
    const ids = [...kontakSelectedIds]
    if (ids.length === 0) return
    const ok = window.confirm(
      `Hapus ${ids.length} kontak terpilih?\nTindakan ini tidak dapat dibatalkan.`
    )
    if (!ok) return
    setKontakBulkDeleting(true)
    const successfulIds = []
    try {
      for (const id of ids) {
        try {
          const res = await kontakAPI.delete(id)
          if (res?.success) successfulIds.push(id)
        } catch (_) {
          /* lanjut ke id berikutnya */
        }
      }
      if (successfulIds.length > 0) {
        setKontakItems((prev) => prev.filter((x) => !successfulIds.includes(x.id)))
        setKontakTotal((t) => Math.max(0, t - successfulIds.length))
        setKontakSelectedIds((prev) => prev.filter((x) => !successfulIds.includes(x)))
        if (kontakDraft && successfulIds.includes(kontakDraft.id)) closeKontakPanel()
      }
      if (successfulIds.length === ids.length) {
        showNotification(`${successfulIds.length} kontak dihapus`, 'success')
      } else if (successfulIds.length > 0) {
        showNotification(
          `${successfulIds.length} kontak dihapus, ${ids.length - successfulIds.length} gagal`,
          'error'
        )
      } else {
        showNotification('Gagal menghapus kontak terpilih', 'error')
      }
    } finally {
      setKontakBulkDeleting(false)
    }
  }

  const mergeKontakInList = (updated) => {
    if (!updated?.id) return
    setKontakItems((prev) =>
      prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x))
    )
    setKontakDraft((prev) =>
      prev && prev.id === updated.id ? { ...prev, ...updated } : prev
    )
  }

  const handleSaveKontakDraft = async () => {
    if (!kontakDraft?.id) return
    setKontakSaving(true)
    try {
      const res = await kontakAPI.update(kontakDraft.id, {
        nama: (kontakDraft.nama || '').trim(),
        nomor_kanonik: (kontakDraft.nomor_kanonik || '').trim() || null,
        siap_terima_notif: kontakDraft.siap_terima_notif
      })
      if (res?.success && res?.data) {
        mergeKontakInList(res.data)
        showNotification(res.message || 'Kontak disimpan', 'success')
        closeKontakPanel()
      } else {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal menyimpan', 'error')
    } finally {
      setKontakSaving(false)
    }
  }

  const handleGetLidKontak = async () => {
    if (!kontakDraft?.id) return
    if (provider !== 'wa_sendiri') {
      showNotification('Ambil LID hanya untuk provider WA server sendiri. Ganti di tab Pengaturan atau isi LID manual.', 'error')
      return
    }
    setKontakLidLoading(true)
    try {
      const res = await kontakAPI.resolveLid(kontakDraft.id, kontakWaSessionId.trim() || 'default')
      if (res?.success && res?.data?.kontak) {
        mergeKontakInList(res.data.kontak)
        showNotification(res.message || 'LID berhasil diambil', 'success')
      } else {
        showNotification(res?.message || 'Gagal mengambil LID', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal mengambil LID', 'error')
    } finally {
      setKontakLidLoading(false)
    }
  }

  const handleDeleteKontak = async (kontak) => {
    if (!kontak?.id) return
    const nama = kontak.nama || '(tanpa nama)'
    const nomor = kontak.nomor || '-'
    const lid = kontak.nomor_kanonik || '-'
    const ok = window.confirm(`Hapus kontak ini?\nNama: ${nama}\nNomor: ${nomor}\nLID: ${lid}`)
    if (!ok) return
    setDeletingKontakId(kontak.id)
    try {
      const res = await kontakAPI.delete(kontak.id)
      if (res?.success) {
        setKontakItems((prev) => prev.filter((x) => x.id !== kontak.id))
        setKontakTotal((prev) => Math.max(0, prev - 1))
        setKontakSelectedIds((prev) => prev.filter((x) => x !== kontak.id))
        if (kontakDraft?.id === kontak.id) closeKontakPanel()
        showNotification('Kontak berhasil dihapus', 'success')
      } else {
        showNotification(res?.message || 'Gagal menghapus kontak', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal menghapus kontak', 'error')
    } finally {
      setDeletingKontakId(null)
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
      <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="flex border-b border-gray-200 dark:border-gray-700 -mb-px">
            <button
              type="button"
              onClick={() => setActiveTab('pengaturan')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'pengaturan'
                  ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Pengaturan
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('riwayat')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'riwayat'
                  ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Riwayat terkirim
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('kontak')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'kontak'
                  ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Kontak
            </button>
          </div>
        </div>
      </div>
      {error && (
        <div className="shrink-0 max-w-2xl mx-auto w-full px-4 pt-4">
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="max-w-2xl mx-auto p-4 pb-8">

          {activeTab === 'pengaturan' && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Provider notifikasi WA</h2>
              </div>
              <div className="p-4 space-y-4">
                {PROVIDERS.map((p) => (
                  <label
                    key={p.value}
                    className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                      provider === p.value
                        ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-900/20 dark:border-teal-600'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    <input
                      type="radio"
                      name="provider"
                      value={p.value}
                      checked={provider === p.value}
                      onChange={() => setProvider(p.value)}
                      className="mt-1 rounded-full border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <span className="font-medium text-gray-800 dark:text-gray-200">{p.label}</span>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{p.description}</p>
                    </div>
                  </label>
                ))}
              </div>
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
                <Link to="/settings/evolution-wa" className="text-sm text-teal-600 dark:text-teal-400 hover:underline">
                  Evolution WA →
                </Link>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <Link to="/settings/email-otp" className="text-sm text-teal-600 dark:text-teal-400 hover:underline">
                  OTP Email →
                </Link>
                {provider === 'wa_sendiri' && (
                  <>
                    <span className="text-gray-300 dark:text-gray-600">·</span>
                    <Link to="/whatsapp-koneksi" className="text-sm text-teal-600 dark:text-teal-400 hover:underline">
                      Buka halaman WhatsApp →
                    </Link>
                  </>
                )}
                {provider === 'watzap' && (
                  <>
                    <span className="text-gray-300 dark:text-gray-600">·</span>
                    <Link to="/settings/watzap" className="text-sm text-teal-600 dark:text-teal-400 hover:underline">
                      Buka halaman WatZap →
                    </Link>
                  </>
                )}
                {provider === 'evolution' && (
                  <>
                    <span className="text-gray-300 dark:text-gray-600">·</span>
                    <Link to="/settings/evolution-wa" className="text-sm text-teal-600 dark:text-teal-400 hover:underline">
                      Evolution WA (webhook & instance) →
                    </Link>
                  </>
                )}
              </div>
              {provider === 'evolution' && (
                <div className="px-4 pb-4 text-xs text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-3 -mt-px">
                  Untuk Chat AI lewat WA: di panel Evolution set webhook instance (event <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">MESSAGES_UPSERT</code>) ke URL yang ditampilkan di halaman Evolution WA. Di sini pilih provider <strong>Evolution API</strong> agar balasan dikirim lewat Evolution, bukan server Node WA lama.
                </div>
              )}
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Tes Alert Error WA</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Mengirim pesan tes ke endpoint alert backend untuk memastikan notifikasi error aktif.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                      Nomor tujuan
                    </label>
                    <input
                      type="text"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      placeholder="0822..."
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                      Pesan (opsional)
                    </label>
                    <input
                      type="text"
                      value={testMessage}
                      onChange={(e) => setTestMessage(e.target.value)}
                      placeholder="Kosongkan untuk pesan default"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={handleTestErrorAlert}
                    disabled={testingAlert}
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testingAlert ? 'Mengirim tes...' : 'Kirim tes alert error'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'kontak' && (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Daftar kontak WA</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Daftar kontak notifikasi. Tampilkan nama, nomor, dan LID agar pelacakan lebih mudah.</p>
              </div>
              <div className="p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={kontakSearch}
                    onChange={(e) => { setKontakSearch(e.target.value); setKontakPage(1) }}
                    placeholder="Cari nama, nomor, atau LID..."
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm w-full sm:w-72"
                  />
                </div>
                {kontakSelectedIds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/80 dark:bg-teal-900/25">
                    <span className="text-xs font-medium text-teal-900 dark:text-teal-100 pr-1">
                      {kontakSelectedIds.length} terpilih
                    </span>
                    <button
                      type="button"
                      onClick={() => setKontakSelectedIds([])}
                      disabled={kontakBulkDeleting}
                      className="text-xs px-2 py-0.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                    >
                      Batal pilihan
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkDeleteKontak}
                      disabled={kontakBulkDeleting}
                      className="text-xs px-2 py-0.5 rounded-md bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                    >
                      {kontakBulkDeleting ? 'Menghapus…' : 'Hapus terpilih'}
                    </button>
                  </div>
                )}
                {kontakLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-9 w-9 border-2 border-teal-500 border-t-transparent" />
                  </div>
                ) : kontakItems.length === 0 ? (
                  <div className="text-center py-12 px-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada kontak. Kontak akan muncul otomatis saat notifikasi pertama kali dikirim ke nomor baru.</p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                        {kontakItems.map((k) => {
                          const displayName = (k.nama || '').trim() || 'Tanpa nama'
                          const initial = displayName.charAt(0).toUpperCase() || '#'
                          return (
                            <li key={k.id} className="px-4 py-3 sm:px-5 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                              <div className="flex items-start gap-3">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    toggleKontakSelect(k.id)
                                  }}
                                  title={kontakSelectedIds.includes(k.id) ? 'Batal pilih' : 'Pilih untuk hapus massal'}
                                  aria-pressed={kontakSelectedIds.includes(k.id)}
                                  className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center font-semibold text-sm border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500/50 ${
                                    kontakSelectedIds.includes(k.id)
                                      ? 'bg-teal-600 border-teal-600 text-white'
                                      : 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 border-transparent'
                                  }`}
                                >
                                  {kontakSelectedIds.includes(k.id) ? (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                  ) : (
                                    initial
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className="flex items-start gap-0 min-w-0 flex-1 text-left rounded-lg -m-1 p-1 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                                  onClick={() => openKontakPanel(k)}
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{displayName}</p>
                                    <p className="mt-0.5 text-sm font-mono text-gray-700 dark:text-gray-200 truncate">{k.nomor}</p>
                                    <div className="mt-1 flex flex-wrap gap-1.5">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                                        LID: {k.nomor_kanonik || '–'}
                                      </span>
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${k.siap_terima_notif ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                                        {k.siap_terima_notif ? 'Siap notif' : 'Notif off'}
                                      </span>
                                    </div>
                                  </div>
                                </button>
                                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={k.siap_terima_notif}
                                    title={k.siap_terima_notif ? 'Matikan notifikasi kontak' : 'Aktifkan notifikasi kontak'}
                                    onClick={() => {
                                      kontakAPI.updateSiapTerimaNotif(k.id, !k.siap_terima_notif)
                                        .then((res) => {
                                          if (res?.success) {
                                            if (res.data && typeof res.data === 'object') {
                                              setKontakItems((prev) => prev.map((x) => (x.id === k.id ? { ...x, ...res.data } : x)))
                                            } else {
                                              setKontakItems((prev) => prev.map((x) => x.id === k.id ? { ...x, siap_terima_notif: !k.siap_terima_notif } : x))
                                            }
                                            showNotification('Pengaturan kontak diperbarui', 'success')
                                          } else showNotification(res?.message || 'Gagal', 'error')
                                        })
                                        .catch(() => showNotification('Gagal memperbarui kontak', 'error'))
                                    }}
                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${k.siap_terima_notif ? 'bg-teal-600' : 'bg-gray-200 dark:bg-gray-600'}`}
                                  >
                                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${k.siap_terima_notif ? 'translate-x-5' : 'translate-x-1'}`} />
                                  </button>
                                  <button
                                    type="button"
                                    title="Hapus kontak"
                                    aria-label={`Hapus kontak ${displayName}`}
                                    onClick={() => handleDeleteKontak(k)}
                                    disabled={deletingKontakId === k.id}
                                    className="p-2 rounded-full text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-300 dark:hover:bg-red-900/20 disabled:opacity-50"
                                  >
                                    {deletingKontakId === k.id ? (
                                      <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 7h12M10 11v6m4-6v6M9 7l1-2h4l1 2m-7 0l.7 11.2A2 2 0 0010.7 20h2.6a2 2 0 001.99-1.8L16 7" />
                                      </svg>
                                    )}
                                  </button>
                                </div>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                    {kontakTotal > kontakLimit && (
                      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                        <span>Total {kontakTotal} kontak</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={kontakPage <= 1}
                            onClick={() => setKontakPage((p) => Math.max(1, p - 1))}
                            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50"
                          >
                            Sebelumnya
                          </button>
                          <span>Halaman {kontakPage}</span>
                          <button
                            type="button"
                            disabled={kontakPage * kontakLimit >= kontakTotal}
                            onClick={() => setKontakPage((p) => p + 1)}
                            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50"
                          >
                            Selanjutnya
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === 'riwayat' && (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Notifikasi terkirim per tipe</h2>
              </div>
              <div className="p-4">
                {groupsLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-9 w-9 border-2 border-teal-500 border-t-transparent" />
                  </div>
                ) : groups.length === 0 ? (
                  <div className="text-center py-12 px-4">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500 mb-3">
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada data notifikasi terkirim.</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {groups.map((g) => (
                      <li key={g.kategori}>
                        <button
                          type="button"
                          onClick={() => openOffcanvas(g.kategori)}
                          className="w-full flex items-center gap-4 p-4 text-left rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 hover:bg-teal-50/50 dark:hover:bg-teal-900/20 hover:border-teal-200 dark:hover:border-teal-800 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                        >
                          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center text-teal-600 dark:text-teal-400">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="block font-medium text-gray-800 dark:text-gray-200 truncate">
                              {getKategoriLabel(g.kategori)}
                            </span>
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {g.total} pesan terkirim
                            </span>
                          </div>
                          <div className="flex-shrink-0 text-gray-400 dark:text-gray-500">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {createPortal(
        <AnimatePresence>
          {kontakPanelOpen && kontakDraft ? [
            <motion.div
              key="kontak-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-sm"
              onClick={closeKontakPanel}
              aria-hidden
            />,
            <motion.div
              key="kontak-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              className="fixed right-0 top-0 bottom-0 z-[65] w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl flex flex-col"
            >
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 truncate pr-2">
                  Edit kontak
                </h3>
                <button
                  type="button"
                  onClick={closeKontakPanel}
                  className="flex-shrink-0 p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nama</label>
                  <input
                    type="text"
                    value={kontakDraft.nama}
                    onChange={(e) => setKontakDraft((d) => (d ? { ...d, nama: e.target.value } : d))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                    placeholder="Nama kontak"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nomor WhatsApp</label>
                  <input
                    type="text"
                    readOnly
                    value={kontakDraft.nomor}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-gray-700 dark:text-gray-300 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">LID (nomor kanonik / ID chat)</label>
                  <input
                    type="text"
                    value={kontakDraft.nomor_kanonik || ''}
                    onChange={(e) => setKontakDraft((d) => (d ? { ...d, nomor_kanonik: e.target.value } : d))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm font-mono"
                    placeholder="Isi manual atau klik Ambil LID"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Kirim tes bisa hanya dengan Langkah 1 (WhatsApp Web). Digit LID (@lid) biasanya baru muncul setelah Langkah 2 (Baileys) juga terhubung — sama seperti mapping onWhatsApp di server Node.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Session WA (slot)</label>
                  <input
                    type="text"
                    value={kontakWaSessionId}
                    onChange={(e) => setKontakWaSessionId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm font-mono"
                    placeholder="default"
                  />
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={kontakDraft.siap_terima_notif}
                    onChange={(e) => setKontakDraft((d) => (d ? { ...d, siap_terima_notif: e.target.checked } : d))}
                    className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm text-gray-800 dark:text-gray-200">Siap terima notifikasi</span>
                </label>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleGetLidKontak}
                    disabled={kontakLidLoading || provider !== 'wa_sendiri'}
                    className="px-4 py-2 rounded-lg border border-teal-600 text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/50 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {kontakLidLoading ? 'Mengambil…' : 'Ambil LID'}
                  </button>
                </div>
              </div>
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleSaveKontakDraft}
                  disabled={kontakSaving}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50"
                >
                  {kontakSaving ? 'Menyimpan…' : 'Simpan'}
                </button>
                <button
                  type="button"
                  onClick={closeKontakPanel}
                  className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm"
                >
                  Batal
                </button>
              </div>
            </motion.div>
          ] : null}
        </AnimatePresence>,
        document.body
      )}

      {createPortal(
        <AnimatePresence>
          {offcanvasOpen ? [
            <motion.div
              key="notif-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              onClick={closeOffcanvas}
              aria-hidden
            />,
            <motion.div
              key="notif-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              className="fixed right-0 top-0 bottom-0 z-[60] w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl flex flex-col"
            >
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 truncate pr-2">
                    {offcanvasLabel}
                  </h3>
                  <button
                    type="button"
                    onClick={closeOffcanvas}
                    className="flex-shrink-0 p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-4">
                  {messagesLoading && messages.length === 0 ? (
                    <div className="flex justify-center py-12">
                      <div className="animate-spin rounded-full h-9 w-9 border-2 border-teal-500 border-t-transparent" />
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 py-6">Tidak ada pesan.</p>
                  ) : (
                    <ul className="space-y-3">
                      {messages.map((msg) => (
                        <li
                          key={msg.id}
                          className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                        >
                          <div className="flex justify-between items-start gap-3 mb-2">
                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                              {msg.nomor_tujuan}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                              {formatDate(msg.created_at)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 break-words">
                            {(msg.isi_pesan || '').trim() || '(tanpa teks)'}
                          </p>
                          {msg.status && msg.status !== 'terkirim' && (
                            <span className="text-xs text-amber-600 dark:text-amber-400 mt-2 block">{msg.status}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {hasMoreMessages && (
                    <div className="mt-5 flex justify-center">
                      <button
                        type="button"
                        onClick={loadMoreMessages}
                        disabled={messagesLoading}
                        className="px-4 py-2.5 rounded-xl text-sm font-medium text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/50 disabled:opacity-50 transition-colors"
                      >
                        {messagesLoading ? 'Memuat...' : `Muat lebih (${messages.length} / ${messagesTotal})`}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
          ] : null}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}
