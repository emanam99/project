import { useState, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { pendaftaranAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useAuthStore } from '../../store/authStore'
import SubNavPendaftaran from './components/SubNavPendaftaran'

function Simulasi() {
  const { showNotification } = useNotification()
  const { user } = useAuthStore()

  const roleKey = (user?.role_key || user?.level || '').toLowerCase()
  const isSuperAdmin = roleKey === 'super_admin'
  if (!isSuperAdmin) {
    return <Navigate to="/" replace />
  }

  const [fields, setFields] = useState([])
  const [values, setValues] = useState([])
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [loadingItems, setLoadingItems] = useState(false)
  const [kondisi, setKondisi] = useState({}) // { field_name: value } for API
  const [result, setResult] = useState(null) // { items, total_wajib, matching_set_ids }
  const [mobileTab, setMobileTab] = useState('opsi') // 'opsi' | 'hasil'

  const valuesByField = values.reduce((acc, v) => {
    const key = v.field_name || v.id_field
    if (!acc[key]) acc[key] = []
    acc[key].push(v)
    return acc
  }, {})

  const fetchMeta = useCallback(async () => {
    setLoadingMeta(true)
    try {
      const [fieldsRes, valuesRes] = await Promise.all([
        pendaftaranAPI.getKondisiFields(),
        pendaftaranAPI.getKondisiValues()
      ])
      if (fieldsRes?.success && fieldsRes?.data) setFields(fieldsRes.data)
      if (valuesRes?.success && valuesRes?.data) setValues(valuesRes.data)
    } catch (e) {
      console.error(e)
      showNotification('Gagal memuat data kondisi', 'error')
    } finally {
      setLoadingMeta(false)
    }
  }, [showNotification])

  useEffect(() => {
    fetchMeta()
  }, [fetchMeta])

  const fetchItems = useCallback(async () => {
    const payload = Object.fromEntries(
      Object.entries(kondisi).filter(([, v]) => v != null && String(v).trim() !== '')
    )
    if (Object.keys(payload).length === 0) {
      setResult(null)
      return
    }
    setLoadingItems(true)
    try {
      const res = await pendaftaranAPI.getItemsByKondisi(payload)
      if (res?.success && res?.data) {
        setResult(res.data)
      } else {
        setResult({ items: [], total_wajib: 0, matching_set_ids: [] })
      }
    } catch (e) {
      console.error(e)
      showNotification('Gagal memuat item simulasi', 'error')
      setResult(null)
    } finally {
      setLoadingItems(false)
    }
  }, [kondisi, showNotification])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const handleKondisiChange = (fieldName, value) => {
    setKondisi(prev => {
      const next = { ...prev }
      if (value === '' || value == null) {
        delete next[fieldName]
      } else {
        next[fieldName] = value
      }
      return next
    })
  }

  const activeFields = fields.filter(f => f.is_active !== 0)
  const totalWajib = result?.total_wajib ?? 0
  const items = result?.items ?? []

  const opsiContent = (
    <div className="space-y-4">
      {activeFields.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-center py-6">Belum ada field kondisi.</p>
      ) : (
        activeFields.map(field => {
          const opts = valuesByField[field.field_name] || valuesByField[field.id] || []
          const activeOpts = opts.filter(o => o.is_active !== 0)
          if (activeOpts.length === 0) return null
          return (
            <div key={field.id || field.field_name} className="border-b border-gray-200 dark:border-gray-700 pb-3 last:border-0">
              <label className="block font-medium text-gray-900 dark:text-gray-100 mb-2 text-sm">
                {field.field_label || field.field_name}
              </label>
              <select
                value={kondisi[field.field_name] ?? ''}
                onChange={e => handleKondisiChange(field.field_name, e.target.value || null)}
                className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
              >
                <option value="">-- Pilih --</option>
                {activeOpts.map(opt => (
                  <option key={opt.id} value={opt.value}>
                    {opt.value_label || opt.value}
                  </option>
                ))}
              </select>
            </div>
          )
        })
      )}
    </div>
  )

  const hasilContent = (
    <>
      <div className="flex-shrink-0 mb-4 p-3 bg-teal-50 dark:bg-teal-900/20 rounded-xl border border-teal-200 dark:border-teal-800">
        <div className="text-sm text-gray-600 dark:text-gray-400">Total Wajib</div>
        <div className="text-xl font-bold text-teal-700 dark:text-teal-300">
          Rp {totalWajib.toLocaleString('id-ID')}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
          {items.length} item
        </div>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2">
        {loadingItems ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-600 border-t-transparent" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-6">
            {Object.keys(kondisi).length === 0
              ? 'Pilih kondisi di tab Opsi untuk melihat item.'
              : 'Tidak ada item yang cocok dengan kondisi ini.'}
          </p>
        ) : (
          items.map((item, idx) => (
            <motion.div
              key={item.id ?? idx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.02 }}
              className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 flex justify-between items-center"
            >
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {item.nama_item || item.item}
              </span>
              <span className="text-sm font-semibold text-teal-600 dark:text-teal-400">
                Rp {(item.harga ?? 0).toLocaleString('id-ID')}
              </span>
            </motion.div>
          ))
        )}
      </div>
    </>
  )

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <SubNavPendaftaran />
      <div className="flex-1 flex flex-col min-h-0">
        {/* Desktop: kiri select kondisi, kanan item + total di atas */}
        <div className="hidden lg:grid lg:grid-cols-2 lg:gap-4 flex-1 min-h-0 p-2 sm:p-3">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 overflow-y-auto flex flex-col">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex-shrink-0">Pilih Kondisi</h3>
            {loadingMeta ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-600 border-t-transparent" />
              </div>
            ) : (
              opsiContent
            )}
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 overflow-hidden flex flex-col">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex-shrink-0">Hasil Simulasi</h3>
            {hasilContent}
          </div>
        </div>

        {/* Mobile: tab Opsi | Hasil seperti pembayaran uwaba */}
        <div className="lg:hidden flex flex-col flex-1 min-h-0">
          <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
            <button
              type="button"
              onClick={() => setMobileTab('opsi')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                mobileTab === 'opsi'
                  ? 'text-teal-600 dark:text-teal-400 border-b-2 border-teal-600 dark:border-teal-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Opsi
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('hasil')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                mobileTab === 'hasil'
                  ? 'text-teal-600 dark:text-teal-400 border-b-2 border-teal-600 dark:border-teal-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Hasil
            </button>
          </div>
          <div className="flex-1 overflow-hidden bg-white dark:bg-gray-800">
            {mobileTab === 'opsi' && (
              <div className="h-full overflow-y-auto p-4 pb-8">
                {loadingMeta ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-600 border-t-transparent" />
                  </div>
                ) : (
                  opsiContent
                )}
              </div>
            )}
            {mobileTab === 'hasil' && (
              <div className="h-full flex flex-col overflow-hidden p-4 pb-8">
                {hasilContent}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Simulasi
