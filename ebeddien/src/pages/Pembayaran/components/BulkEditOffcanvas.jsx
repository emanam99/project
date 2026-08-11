import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { santriAPI, pendaftaranAPI, uwabaAPI, santriBiodataAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { parseKelompok } from '../../Lttq/lttqKelompokUtils'

const FIELD_GROUPS = [
  { key: 'status_kategori', label: 'Status & Kategori' },
  { key: 'diniyah', label: 'Diniyah (Lembaga · Kelas · Kel)' },
  { key: 'formal', label: 'Formal (Lembaga · Kelas · Kel)' },
  { key: 'lttq', label: 'LTTQ (Tingkatan · Kelas · Kel)' },
  { key: 'saudara_di_pesantren', label: 'Saudara di Pesantren' },
]

const SAUDARA_OPTIONS = ['Tidak Ada', '1', '2', '3', '4']

const emptyForm = {
  status_santri: '',
  kategori: '',
  lembaga_diniyah: '',
  kelas_diniyah: '',
  id_diniyah: '',
  lembaga_formal: '',
  kelas_formal: '',
  id_formal: '',
  lttq_tingkatan: '',
  lttq_kelas: '',
  id_lttq_tingkatan: '',
  saudara_di_pesantren: '',
  clear_value: false,
}

function BulkEditOffcanvas({ isOpen, onClose, selectedSantriList, allDataSantri, onSuccess }) {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, currentSantri: null })
  const [selectedGroup, setSelectedGroup] = useState('')
  const [form, setForm] = useState(emptyForm)

  const [statusSantriOptions, setStatusSantriOptions] = useState([])
  const [kategoriOptions, setKategoriOptions] = useState([])
  const [lembagaDiniyahOptions, setLembagaDiniyahOptions] = useState([])
  const [lembagaFormalOptions, setLembagaFormalOptions] = useState([])
  const [kelasDiniyahOptions, setKelasDiniyahOptions] = useState([])
  const [kelasFormalOptions, setKelasFormalOptions] = useState([])
  const [kelDiniyahOptions, setKelDiniyahOptions] = useState([])
  const [kelFormalOptions, setKelFormalOptions] = useState([])
  const [lttqTingkatanOptions, setLttqTingkatanOptions] = useState([])
  const [optionsLoading, setOptionsLoading] = useState(false)

  const patchForm = (patch) => setForm((prev) => ({ ...prev, ...patch }))

  useEffect(() => {
    if (!isOpen) return
    setSelectedGroup('')
    setForm(emptyForm)
    setProgress({ current: 0, total: 0, currentSantri: null })
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setOptionsLoading(true)
    Promise.all([
      uwabaAPI.getStatusSantriOptions(),
      pendaftaranAPI.getLembagaOptions('Diniyah'),
      pendaftaranAPI.getLembagaOptions('Formal'),
      santriBiodataAPI.getLttqTingkatanOptions({ lembaga_id: 'LTTQ', status: 'aktif', limit: 500 }),
    ])
      .then(([sRes, dRes, fRes, lRes]) => {
        if (cancelled) return
        if (sRes?.success && Array.isArray(sRes.data)) setStatusSantriOptions(sRes.data)
        if (dRes?.success && Array.isArray(dRes.data)) setLembagaDiniyahOptions(dRes.data)
        if (fRes?.success && Array.isArray(fRes.data)) setLembagaFormalOptions(fRes.data)
        if (lRes?.success && Array.isArray(lRes.data)) setLttqTingkatanOptions(lRes.data)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setOptionsLoading(false)
      })
    return () => { cancelled = true }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || selectedGroup !== 'status_kategori') return
    let cancelled = false
    pendaftaranAPI.getKategoriOptions(form.status_santri).then((kRes) => {
      if (cancelled) return
      setKategoriOptions(kRes?.success && Array.isArray(kRes.data) ? kRes.data : [])
    }).catch(() => {
      if (!cancelled) setKategoriOptions([])
    })
    return () => { cancelled = true }
  }, [isOpen, selectedGroup, form.status_santri])

  useEffect(() => {
    if (!form.lembaga_diniyah) {
      setKelasDiniyahOptions([])
      setKelDiniyahOptions([])
      return
    }
    let cancelled = false
    pendaftaranAPI.getKelasOptions(form.lembaga_diniyah).then((res) => {
      if (!cancelled) setKelasDiniyahOptions(res?.success && Array.isArray(res.data) ? res.data : [])
    }).catch(() => { if (!cancelled) setKelasDiniyahOptions([]) })
    return () => { cancelled = true }
  }, [form.lembaga_diniyah])

  useEffect(() => {
    if (!form.lembaga_diniyah || form.kelas_diniyah === '') {
      setKelDiniyahOptions([])
      return
    }
    let cancelled = false
    pendaftaranAPI.getKelOptions(form.lembaga_diniyah, form.kelas_diniyah).then((res) => {
      if (!cancelled) setKelDiniyahOptions(res?.success && Array.isArray(res.data) ? res.data : [])
    }).catch(() => { if (!cancelled) setKelDiniyahOptions([]) })
    return () => { cancelled = true }
  }, [form.lembaga_diniyah, form.kelas_diniyah])

  useEffect(() => {
    if (!form.lembaga_formal) {
      setKelasFormalOptions([])
      setKelFormalOptions([])
      return
    }
    let cancelled = false
    pendaftaranAPI.getKelasOptions(form.lembaga_formal).then((res) => {
      if (!cancelled) setKelasFormalOptions(res?.success && Array.isArray(res.data) ? res.data : [])
    }).catch(() => { if (!cancelled) setKelasFormalOptions([]) })
    return () => { cancelled = true }
  }, [form.lembaga_formal])

  useEffect(() => {
    if (!form.lembaga_formal || form.kelas_formal === '') {
      setKelFormalOptions([])
      return
    }
    let cancelled = false
    pendaftaranAPI.getKelOptions(form.lembaga_formal, form.kelas_formal).then((res) => {
      if (!cancelled) setKelFormalOptions(res?.success && Array.isArray(res.data) ? res.data : [])
    }).catch(() => { if (!cancelled) setKelFormalOptions([]) })
    return () => { cancelled = true }
  }, [form.lembaga_formal, form.kelas_formal])

  const statusSantriRendered = useMemo(() => {
    const base = statusSantriOptions.length > 0 ? statusSantriOptions : ['Mukim', 'Khoriji', 'Boyong', 'Guru Tugas', 'Pengurus']
    const current = String(form.status_santri || '').trim()
    return [...new Set(current && !base.includes(current) ? [current, ...base] : base)]
  }, [statusSantriOptions, form.status_santri])

  const saudaraOptions = useMemo(() => {
    const fromData = (allDataSantri || [])
      .map((s) => s?.saudara_di_pesantren)
      .filter((v) => v != null && String(v).trim() !== '')
    return [...new Set([...SAUDARA_OPTIONS, ...fromData])].sort()
  }, [allDataSantri])

  const lttqProgramOptions = useMemo(() => {
    const map = new Map()
    lttqTingkatanOptions.forEach((t) => {
      const tk = String(t.tingkatan || '').trim()
      if (tk) map.set(tk, true)
    })
    return [...map.keys()].sort((a, b) => a.localeCompare(b))
  }, [lttqTingkatanOptions])

  const lttqKelasOptions = useMemo(() => {
    if (!form.lttq_tingkatan) return []
    const set = new Set()
    lttqTingkatanOptions
      .filter((t) => String(t.tingkatan || '').trim() === form.lttq_tingkatan)
      .forEach((t) => {
        const { kelas } = parseKelompok(t.kelompok)
        const k = String(kelas ?? '').trim()
        if (k) set.add(k)
      })
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [lttqTingkatanOptions, form.lttq_tingkatan])

  const lttqKelOptions = useMemo(() => {
    if (!form.lttq_tingkatan || !form.lttq_kelas) return []
    return lttqTingkatanOptions
      .filter((t) => {
        if (String(t.tingkatan || '').trim() !== form.lttq_tingkatan) return false
        const { kelas } = parseKelompok(t.kelompok)
        return String(kelas).trim() === form.lttq_kelas
      })
      .map((t) => {
        const { kel } = parseKelompok(t.kelompok)
        const kelLabel = String(kel ?? '').trim() || '(kosong)'
        const kelompok = String(t.kelompok ?? '').trim()
        return { id: t.id, label: kelompok ? `${kelLabel} (${kelompok})` : kelLabel }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [lttqTingkatanOptions, form.lttq_tingkatan, form.lttq_kelas])

  const canSubmit = useMemo(() => {
    if (!selectedGroup) return false
    if (form.clear_value && (selectedGroup === 'diniyah' || selectedGroup === 'formal' || selectedGroup === 'lttq')) {
      return true
    }
    if (selectedGroup === 'status_kategori') {
      return Boolean(String(form.status_santri).trim() && String(form.kategori).trim())
    }
    if (selectedGroup === 'diniyah') return Boolean(form.id_diniyah)
    if (selectedGroup === 'formal') return Boolean(form.id_formal)
    if (selectedGroup === 'lttq') return Boolean(form.id_lttq_tingkatan)
    if (selectedGroup === 'saudara_di_pesantren') return form.saudara_di_pesantren !== ''
    return false
  }, [selectedGroup, form])

  const buildUpdateData = () => {
    if (selectedGroup === 'status_kategori') {
      return {
        status_santri: String(form.status_santri).trim(),
        kategori: String(form.kategori).trim(),
      }
    }
    if (selectedGroup === 'diniyah') {
      if (form.clear_value) return { id_diniyah: null }
      const id = parseInt(form.id_diniyah, 10)
      return { id_diniyah: Number.isNaN(id) ? null : id }
    }
    if (selectedGroup === 'formal') {
      if (form.clear_value) return { id_formal: null }
      const id = parseInt(form.id_formal, 10)
      return { id_formal: Number.isNaN(id) ? null : id }
    }
    if (selectedGroup === 'lttq') {
      if (form.clear_value) return { id_lttq_tingkatan: null }
      const id = parseInt(form.id_lttq_tingkatan, 10)
      return { id_lttq_tingkatan: Number.isNaN(id) ? null : id }
    }
    if (selectedGroup === 'saudara_di_pesantren') {
      return { saudara_di_pesantren: form.saudara_di_pesantren }
    }
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedGroup) {
      showNotification('Pilih data yang ingin diubah', 'error')
      return
    }
    if (!canSubmit) {
      showNotification('Lengkapi isian terlebih dahulu', 'error')
      return
    }
    if (!selectedSantriList?.length) {
      showNotification('Tidak ada santri yang dipilih', 'error')
      return
    }

    const updateData = buildUpdateData()
    if (!updateData) {
      showNotification('Data tidak valid', 'error')
      return
    }

    setLoading(true)
    setProgress({ current: 0, total: selectedSantriList.length, currentSantri: null })

    let successCount = 0
    let failCount = 0
    const errors = []

    try {
      for (let i = 0; i < selectedSantriList.length; i++) {
        const santri = selectedSantriList[i]
        setProgress({ current: i + 1, total: selectedSantriList.length, currentSantri: santri.nama })
        try {
          const result = await santriAPI.update(santri.id, updateData)
          if (result.success) {
            successCount++
          } else {
            failCount++
            errors.push(`${santri.nama} (${santri.id}): ${result.message || 'Gagal update'}`)
          }
        } catch (error) {
          failCount++
          errors.push(`${santri.nama} (${santri.id}): ${error.message || 'Error'}`)
        }
      }

      if (successCount > 0) {
        showNotification(
          `Berhasil mengupdate ${successCount} santri${failCount > 0 ? `, ${failCount} gagal` : ''}`,
          failCount > 0 ? 'warning' : 'success'
        )
        onSuccess?.()
        onClose()
      } else {
        showNotification(`Gagal mengupdate semua santri. ${errors.slice(0, 3).join('; ')}`, 'error')
      }
    } catch (error) {
      console.error('Bulk update error:', error)
      showNotification('Terjadi kesalahan saat mengupdate data', 'error')
    } finally {
      setLoading(false)
      setProgress({ current: 0, total: 0, currentSantri: null })
    }
  }

  const selectClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm'
  const selectCompactClass =
    'flex-1 min-w-[5.5rem] px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 text-xs'

  if (!isOpen) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col"
          >
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Ubah Data Massal
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                disabled={loading}
                aria-label="Tutup"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Mengubah{' '}
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {selectedSantriList?.length || 0}
                  </span>{' '}
                  santri yang dipilih
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Isian mengikuti pola edit satu santri: status bersama kategori; rombel lembaga → kelas → kel.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Data yang diubah
                  </label>
                  <select
                    value={selectedGroup}
                    onChange={(e) => {
                      setSelectedGroup(e.target.value)
                      setForm(emptyForm)
                    }}
                    className={selectClass}
                    disabled={loading}
                    required
                  >
                    <option value="">-- Pilih --</option>
                    {FIELD_GROUPS.map((g) => (
                      <option key={g.key} value={g.key}>{g.label}</option>
                    ))}
                  </select>
                </div>

                {selectedGroup === 'status_kategori' && (
                  <div className="space-y-3 rounded-xl border border-gray-200 dark:border-gray-600 p-3 bg-gray-50/70 dark:bg-gray-900/30">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Status Santri
                      </label>
                      <select
                        value={form.status_santri}
                        onChange={(e) => patchForm({ status_santri: e.target.value, kategori: '' })}
                        className={selectClass}
                        disabled={loading || optionsLoading}
                      >
                        <option value="">Pilih status</option>
                        {statusSantriRendered.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Kategori
                      </label>
                      <select
                        value={form.kategori}
                        onChange={(e) => patchForm({ kategori: e.target.value })}
                        className={selectClass}
                        disabled={loading || !form.status_santri}
                      >
                        <option value="">Pilih kategori</option>
                        {kategoriOptions.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {selectedGroup === 'diniyah' && (
                  <div className="space-y-3 rounded-xl border border-gray-200 dark:border-gray-600 p-3 bg-gray-50/70 dark:bg-gray-900/30">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.clear_value}
                        onChange={(e) => patchForm({
                          clear_value: e.target.checked,
                          ...(e.target.checked ? { lembaga_diniyah: '', kelas_diniyah: '', id_diniyah: '' } : {}),
                        })}
                        disabled={loading}
                        className="w-4 h-4 text-teal-600 rounded"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Kosongkan rombel diniyah</span>
                    </label>
                    {!form.clear_value && (
                      <div className="flex gap-1 flex-wrap">
                        <select
                          value={form.lembaga_diniyah}
                          onChange={(e) => patchForm({ lembaga_diniyah: e.target.value, kelas_diniyah: '', id_diniyah: '' })}
                          className={selectCompactClass}
                          disabled={loading || optionsLoading}
                        >
                          <option value="">Diniyah</option>
                          {lembagaDiniyahOptions.map((l) => (
                            <option key={l.id} value={l.id}>{l.nama || l.id}</option>
                          ))}
                        </select>
                        <select
                          value={form.kelas_diniyah}
                          onChange={(e) => patchForm({ kelas_diniyah: e.target.value, id_diniyah: '' })}
                          disabled={loading || !form.lembaga_diniyah}
                          className={selectCompactClass}
                        >
                          <option value="">Kelas</option>
                          {kelasDiniyahOptions.map((k) => (
                            <option key={k} value={k}>{k || '-'}</option>
                          ))}
                        </select>
                        <select
                          value={form.id_diniyah}
                          onChange={(e) => patchForm({ id_diniyah: e.target.value })}
                          disabled={loading || !form.lembaga_diniyah || !form.kelas_diniyah}
                          className={selectCompactClass}
                        >
                          <option value="">Kel</option>
                          {kelDiniyahOptions.map((r) => (
                            <option key={r.id} value={r.id}>{r.kel ?? '-'}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {selectedGroup === 'formal' && (
                  <div className="space-y-3 rounded-xl border border-gray-200 dark:border-gray-600 p-3 bg-gray-50/70 dark:bg-gray-900/30">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.clear_value}
                        onChange={(e) => patchForm({
                          clear_value: e.target.checked,
                          ...(e.target.checked ? { lembaga_formal: '', kelas_formal: '', id_formal: '' } : {}),
                        })}
                        disabled={loading}
                        className="w-4 h-4 text-teal-600 rounded"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Kosongkan rombel formal</span>
                    </label>
                    {!form.clear_value && (
                      <div className="flex gap-1 flex-wrap">
                        <select
                          value={form.lembaga_formal}
                          onChange={(e) => patchForm({ lembaga_formal: e.target.value, kelas_formal: '', id_formal: '' })}
                          className={selectCompactClass}
                          disabled={loading || optionsLoading}
                        >
                          <option value="">Formal</option>
                          {lembagaFormalOptions.map((l) => (
                            <option key={l.id} value={l.id}>{l.nama || l.id}</option>
                          ))}
                        </select>
                        <select
                          value={form.kelas_formal}
                          onChange={(e) => patchForm({ kelas_formal: e.target.value, id_formal: '' })}
                          disabled={loading || !form.lembaga_formal}
                          className={selectCompactClass}
                        >
                          <option value="">Kelas</option>
                          {kelasFormalOptions.map((k) => (
                            <option key={k} value={k}>{k || '-'}</option>
                          ))}
                        </select>
                        <select
                          value={form.id_formal}
                          onChange={(e) => patchForm({ id_formal: e.target.value })}
                          disabled={loading || !form.lembaga_formal || !form.kelas_formal}
                          className={selectCompactClass}
                        >
                          <option value="">Kel</option>
                          {kelFormalOptions.map((r) => (
                            <option key={r.id} value={r.id}>{r.kel ?? '-'}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {selectedGroup === 'lttq' && (
                  <div className="space-y-3 rounded-xl border border-gray-200 dark:border-gray-600 p-3 bg-gray-50/70 dark:bg-gray-900/30">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.clear_value}
                        onChange={(e) => patchForm({
                          clear_value: e.target.checked,
                          ...(e.target.checked ? { lttq_tingkatan: '', lttq_kelas: '', id_lttq_tingkatan: '' } : {}),
                        })}
                        disabled={loading}
                        className="w-4 h-4 text-teal-600 rounded"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Kosongkan LTTQ</span>
                    </label>
                    {!form.clear_value && (
                      <div className="flex gap-1 flex-wrap">
                        <select
                          value={form.lttq_tingkatan}
                          onChange={(e) => patchForm({ lttq_tingkatan: e.target.value, lttq_kelas: '', id_lttq_tingkatan: '' })}
                          className={selectCompactClass}
                          disabled={loading || optionsLoading}
                        >
                          <option value="">Tingkatan</option>
                          {lttqProgramOptions.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <select
                          value={form.lttq_kelas}
                          onChange={(e) => patchForm({ lttq_kelas: e.target.value, id_lttq_tingkatan: '' })}
                          disabled={loading || !form.lttq_tingkatan}
                          className={selectCompactClass}
                        >
                          <option value="">Kelas</option>
                          {lttqKelasOptions.map((k) => (
                            <option key={k} value={k}>{k}</option>
                          ))}
                        </select>
                        <select
                          value={form.id_lttq_tingkatan}
                          onChange={(e) => patchForm({ id_lttq_tingkatan: e.target.value })}
                          disabled={loading || !form.lttq_tingkatan || !form.lttq_kelas}
                          className={selectCompactClass}
                        >
                          <option value="">Kel</option>
                          {lttqKelOptions.map((r) => (
                            <option key={r.id} value={r.id}>{r.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {selectedGroup === 'saudara_di_pesantren' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Saudara di Pesantren
                    </label>
                    <select
                      value={form.saudara_di_pesantren}
                      onChange={(e) => patchForm({ saudara_di_pesantren: e.target.value })}
                      className={selectClass}
                      disabled={loading}
                    >
                      <option value="">Pilih</option>
                      {saudaraOptions.map((v) => (
                        <option key={v} value={v}>
                          {v === 'Tidak Ada' || Number.isNaN(Number(v)) ? v : `${v} Saudara`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {loading && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Memproses...</span>
                      <span className="text-sm text-blue-600 dark:text-blue-400">
                        {progress.current} / {progress.total}
                      </span>
                    </div>
                    <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                      <div
                        className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
                      />
                    </div>
                    {progress.currentSantri && (
                      <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                        Memproses: {progress.currentSantri}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !canSubmit}
                    className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Memproses...' : 'Update'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default BulkEditOffcanvas
