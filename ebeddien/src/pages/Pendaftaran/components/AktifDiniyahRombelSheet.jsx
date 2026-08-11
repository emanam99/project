import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { pendaftaranAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'

/** API kel-options mengembalikan { id, kel }, bukan string. */
function normalizeKelOption(item) {
  if (item != null && typeof item === 'object') {
    return {
      id: item.id != null ? String(item.id) : '',
      kel: item.kel != null ? String(item.kel) : '',
    }
  }
  return { id: '', kel: String(item ?? '') }
}

export default function AktifDiniyahRombelSheet({
  isOpen,
  onClose,
  pendaftar,
  tahunHijriyah,
  tahunMasehi,
  onSuccess,
}) {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lembagaOptions, setLembagaOptions] = useState([])
  const [rombelMaster, setRombelMaster] = useState([])
  const [kelasOptions, setKelasOptions] = useState([])
  const [kelOptions, setKelOptions] = useState([])
  const [lembagaId, setLembagaId] = useState('')
  const [kelas, setKelas] = useState('')
  const [kel, setKel] = useState('')
  const [rombelId, setRombelId] = useState('')

  const resetSelection = () => {
    setLembagaId('')
    setKelas('')
    setKel('')
    setRombelId('')
  }

  useEffect(() => {
    if (!isOpen) {
      resetSelection()
      setLembagaOptions([])
      setRombelMaster([])
      setKelasOptions([])
      setKelOptions([])
      return
    }
    let cancelled = false
    setLoading(true)
    Promise.all([
      pendaftaranAPI.getLembagaOptions('diniyah'),
      pendaftaranAPI.getRombelOptions('diniyah'),
    ])
      .then(([resLembaga, resRombel]) => {
        if (cancelled) return
        setLembagaOptions(resLembaga?.success && Array.isArray(resLembaga?.data) ? resLembaga.data : [])
        setRombelMaster(resRombel?.success && Array.isArray(resRombel?.data) ? resRombel.data : [])
      })
      .catch(() => {
        if (!cancelled) {
          setLembagaOptions([])
          setRombelMaster([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !lembagaId) {
      setKelasOptions([])
      setKelas('')
      return
    }
    let cancelled = false
    pendaftaranAPI
      .getKelasOptions(lembagaId)
      .then((res) => {
        if (cancelled) return
        setKelasOptions(res?.success && Array.isArray(res?.data) ? res.data : [])
      })
      .catch(() => {
        if (!cancelled) setKelasOptions([])
      })
    return () => { cancelled = true }
  }, [isOpen, lembagaId])

  useEffect(() => {
    if (!isOpen || !lembagaId || !kelas) {
      setKelOptions([])
      setKel('')
      return
    }
    let cancelled = false
    pendaftaranAPI
      .getKelOptions(lembagaId, kelas)
      .then((res) => {
        if (cancelled) return
        setKelOptions(res?.success && Array.isArray(res?.data) ? res.data : [])
      })
      .catch(() => {
        if (!cancelled) setKelOptions([])
      })
    return () => { cancelled = true }
  }, [isOpen, lembagaId, kelas])

  useEffect(() => {
    if (!isOpen || !lembagaId || !kelas || !kel) {
      setRombelId('')
      return
    }
    const found = rombelMaster.find((r) => (
      String(r?.lembaga_id ?? '') === String(lembagaId)
      && String(r?.kelas ?? '') === String(kelas)
      && String(r?.kel ?? '') === String(kel)
    ))
    if (found?.id != null) {
      setRombelId(String(found.id))
      return
    }
    const opt = kelOptions.find((item) => normalizeKelOption(item).kel === String(kel))
    const optId = opt ? normalizeKelOption(opt).id : ''
    setRombelId(optId)
  }, [isOpen, lembagaId, kelas, kel, rombelMaster, kelOptions])

  const handleSave = async () => {
    if (!pendaftar?.id) return
    const parsedId = Number.parseInt(String(rombelId), 10)
    if (!Number.isFinite(parsedId) || parsedId <= 0) {
      showNotification('Silakan pilih rombel diniyah terlebih dahulu', 'warning')
      return
    }
    setSaving(true)
    try {
      const result = await pendaftaranAPI.updateKeteranganStatus({
        id_santri: pendaftar.id,
        keterangan_status: pendaftar.keterangan_status || 'Aktif',
        tahun_hijriyah: pendaftar.tahun_hijriyah || tahunHijriyah,
        tahun_masehi: pendaftar.tahun_masehi || tahunMasehi,
        id_diniyah: parsedId,
      })
      if (result?.success) {
        showNotification('Aktif Diniyah berhasil disimpan', 'success')
        onSuccess?.()
        onClose()
      } else {
        showNotification(result?.message || 'Gagal menyimpan aktif diniyah', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal menyimpan aktif diniyah', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen && pendaftar && (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10010] bg-black/40"
            onClick={onClose}
            aria-label="Tutup pilih rombel diniyah"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', duration: 0.2 }}
            className="fixed right-0 bottom-0 left-0 mx-auto w-full max-w-xl z-[10011] rounded-t-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Aktif Diniyah — Pilih Rombel
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Tutup"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3 p-4 max-h-[70vh] overflow-y-auto">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {pendaftar?.nis ?? pendaftar?.id ?? '-'} · {pendaftar?.nama ?? '-'}
              </p>
              <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-200">
                Daftar Diniyah (registrasi): {pendaftar?.daftar_diniyah ?? pendaftar?.diniyah ?? '-'}
              </div>
              {loading && (
                <p className="text-sm text-gray-500 dark:text-gray-400">Memuat data lembaga…</p>
              )}
              {!lembagaId && !loading && (
                <>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Pilih lembaga diniyah</p>
                  {lembagaOptions.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Lembaga tidak tersedia.</p>
                  ) : (
                    <ul className="max-h-56 space-y-1 overflow-y-auto">
                      {lembagaOptions.map((l) => {
                        const idLembaga = l?.id != null ? String(l.id) : ''
                        return (
                          <li key={`${idLembaga}-${String(l?.nama || '')}`}>
                            <button
                              type="button"
                              onClick={() => {
                                if (!idLembaga) return
                                setLembagaId(idLembaga)
                                setKelas('')
                                setKel('')
                              }}
                              disabled={!idLembaga}
                              className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left text-sm hover:border-teal-300 dark:border-gray-600 dark:bg-gray-700/50 dark:hover:border-teal-600"
                            >
                              <span className="truncate">{l?.nama || `Lembaga #${idLembaga}`}</span>
                              <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </>
              )}
              {lembagaId && !kelas && (
                <>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setLembagaId('')}
                      className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                      aria-label="Kembali pilih lembaga"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Pilih kelas</p>
                  </div>
                  {kelasOptions.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Kelas tidak tersedia.</p>
                  ) : (
                    <ul className="max-h-56 space-y-1 overflow-y-auto">
                      {kelasOptions.map((kls) => (
                        <li key={String(kls)}>
                          <button
                            type="button"
                            onClick={() => {
                              setKelas(String(kls))
                              setKel('')
                            }}
                            className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left text-sm hover:border-teal-300 dark:border-gray-600 dark:bg-gray-700/50 dark:hover:border-teal-600"
                          >
                            <span className="truncate">Kelas {String(kls)}</span>
                            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              {lembagaId && kelas && (
                <>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setKelas('')
                        setKel('')
                      }}
                      className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                      aria-label="Kembali pilih kelas"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Pilih kel</p>
                  </div>
                  {kelOptions.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Kel tidak tersedia.</p>
                  ) : (
                    <ul className="max-h-56 space-y-1 overflow-y-auto">
                      {kelOptions.map((kelItem, idx) => {
                        const { id: rombelOptId, kel: kelVal } = normalizeKelOption(kelItem)
                        const selected = kel === kelVal
                        return (
                          <li key={rombelOptId || `${kelVal}-${idx}`}>
                            <button
                              type="button"
                              onClick={() => {
                                setKel(kelVal)
                                if (rombelOptId) setRombelId(rombelOptId)
                              }}
                              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                                selected
                                  ? 'border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-200'
                                  : 'border-gray-200 bg-white hover:border-teal-300 dark:border-gray-600 dark:bg-gray-700/50 dark:hover:border-teal-600'
                              }`}
                            >
                              <span className="truncate">Kel {kelVal}</span>
                              {selected ? (
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                </svg>
                              )}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </>
              )}
            </div>
            <div className="flex gap-2 border-t border-gray-200 p-4 dark:border-gray-700">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !Number.isFinite(Number.parseInt(String(rombelId), 10))}
                className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Menyimpan…' : 'Simpan Aktif Diniyah'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
