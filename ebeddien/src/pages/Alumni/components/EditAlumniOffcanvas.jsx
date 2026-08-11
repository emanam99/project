import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { alumniAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'

const emptyForm = {
  nama: '',
  nik: '',
  gender: '',
  status: 'hidup',
  nomor_hp: '',
  tempat_lahir: '',
  tanggal_lahir: '',
  dusun: '',
  rt: '',
  rw: '',
  desa: '',
  kecamatan: '',
  kabupaten: '',
  provinsi: '',
  kode_pos: '',
  ayah: '',
  ibu: '',
  tahun_masuk_masehi: '',
  tahun_boyong_masehi: '',
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        {label}
        {required ? <span className="text-red-500 ml-0.5">*</span> : null}
      </label>
      {children}
    </div>
  )
}

const inputClass =
  'w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none'

export default function EditAlumniOffcanvas({ isOpen, onClose, alumni, onSaved, stackBaseZIndex = null }) {
  const { showNotification } = useNotification()
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const id = alumni?.id

  useEffect(() => {
    if (!isOpen || !id) {
      setForm(emptyForm)
      return
    }
    setLoading(true)
    alumniAPI
      .getById(id)
      .then((res) => {
        const d = res?.success ? res.data : alumni
        if (!d) return
        setForm({
          nama: d.nama || '',
          nik: d.nik || '',
          gender: d.gender === 'L' || d.gender === 'l' || String(d.gender).toLowerCase() === 'laki-laki' ? 'L' : d.gender === 'P' || d.gender === 'p' || String(d.gender).toLowerCase() === 'perempuan' ? 'P' : d.gender || '',
          status: d.status === 'wafat' ? 'wafat' : 'hidup',
          nomor_hp: d.nomor_hp || '',
          tempat_lahir: d.tempat_lahir || '',
          tanggal_lahir: d.tanggal_lahir || '',
          dusun: d.dusun || '',
          rt: d.rt || '',
          rw: d.rw || '',
          desa: d.desa || '',
          kecamatan: d.kecamatan || '',
          kabupaten: d.kabupaten || '',
          provinsi: d.provinsi || '',
          kode_pos: d.kode_pos || '',
          ayah: d.ayah || '',
          ibu: d.ibu || '',
          tahun_masuk_masehi: d.tahun_masuk_masehi || '',
          tahun_boyong_masehi: d.tahun_boyong_masehi || '',
        })
      })
      .catch(() => {
        showNotification('Gagal memuat data alumni', 'error')
      })
      .finally(() => setLoading(false))
  }, [isOpen, id])

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!id) return
    if (!form.nama.trim()) {
      showNotification('Nama wajib diisi', 'error')
      return
    }
    if (!form.gender) {
      showNotification('Gender wajib diisi', 'error')
      return
    }
    setSaving(true)
    try {
      const res = await alumniAPI.update(id, {
        ...form,
        nik: String(form.nik || '').replace(/\D/g, ''),
        tahun_masuk_masehi: form.tahun_masuk_masehi || null,
        tahun_boyong_masehi: form.tahun_boyong_masehi || null,
      })
      if (res?.success) {
        showNotification(res.message || 'Data alumni diperbarui', 'success')
        onSaved?.(res.data)
        onClose()
      } else {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || err?.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const zb = typeof stackBaseZIndex === 'number' && Number.isFinite(stackBaseZIndex) ? Math.floor(stackBaseZIndex) : null
  const backdropStyle = zb != null ? { zIndex: zb } : undefined
  const panelStyle = zb != null ? { zIndex: zb + 1 } : undefined

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="edit-alumni-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 bg-black/40 backdrop-blur-sm${zb == null ? ' z-[10260]' : ''}`}
            style={backdropStyle}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="edit-alumni-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className={`fixed right-0 top-0 bottom-0 w-full max-w-md bg-gray-50 dark:bg-gray-900 shadow-2xl flex flex-col rounded-l-2xl overflow-hidden border-l border-gray-200 dark:border-gray-700${zb == null ? ' z-[10261]' : ''}`}
            style={panelStyle}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">Edit Alumni</h3>
                {alumni?.id_alumni ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">ID {alumni.id_alumni}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-500 border-t-transparent" />
                  </div>
                ) : (
                  <>
                    <Field label="Nama" required>
                      <input className={inputClass} value={form.nama} onChange={(e) => setField('nama', e.target.value)} required />
                    </Field>
                    <Field label="NIK">
                      <input
                        className={inputClass}
                        inputMode="numeric"
                        maxLength={16}
                        value={form.nik}
                        onChange={(e) => setField('nik', e.target.value.replace(/\D/g, '').slice(0, 16))}
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Gender" required>
                        <select className={inputClass} value={form.gender} onChange={(e) => setField('gender', e.target.value)} required>
                          <option value="">Pilih</option>
                          <option value="L">Laki-laki</option>
                          <option value="P">Perempuan</option>
                        </select>
                      </Field>
                      <Field label="Status">
                        <select className={inputClass} value={form.status} onChange={(e) => setField('status', e.target.value)}>
                          <option value="hidup">Hidup</option>
                          <option value="wafat">Wafat</option>
                        </select>
                      </Field>
                    </div>
                    <Field label="Nomor HP">
                      <input className={inputClass} value={form.nomor_hp} onChange={(e) => setField('nomor_hp', e.target.value)} />
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Tempat lahir">
                        <input className={inputClass} value={form.tempat_lahir} onChange={(e) => setField('tempat_lahir', e.target.value)} />
                      </Field>
                      <Field label="Tanggal lahir">
                        <input type="date" className={inputClass} value={form.tanggal_lahir || ''} onChange={(e) => setField('tanggal_lahir', e.target.value)} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Ayah">
                        <input className={inputClass} value={form.ayah} onChange={(e) => setField('ayah', e.target.value)} />
                      </Field>
                      <Field label="Ibu">
                        <input className={inputClass} value={form.ibu} onChange={(e) => setField('ibu', e.target.value)} />
                      </Field>
                    </div>
                    <Field label="Dusun">
                      <input className={inputClass} value={form.dusun} onChange={(e) => setField('dusun', e.target.value)} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="RT">
                        <input className={inputClass} value={form.rt} onChange={(e) => setField('rt', e.target.value)} />
                      </Field>
                      <Field label="RW">
                        <input className={inputClass} value={form.rw} onChange={(e) => setField('rw', e.target.value)} />
                      </Field>
                    </div>
                    <Field label="Desa" required>
                      <input className={inputClass} value={form.desa} onChange={(e) => setField('desa', e.target.value)} />
                    </Field>
                    <Field label="Kecamatan" required>
                      <input className={inputClass} value={form.kecamatan} onChange={(e) => setField('kecamatan', e.target.value)} />
                    </Field>
                    <Field label="Kabupaten" required>
                      <input className={inputClass} value={form.kabupaten} onChange={(e) => setField('kabupaten', e.target.value)} />
                    </Field>
                    <Field label="Provinsi" required>
                      <input className={inputClass} value={form.provinsi} onChange={(e) => setField('provinsi', e.target.value)} />
                    </Field>
                    <Field label="Kode pos">
                      <input className={inputClass} value={form.kode_pos} onChange={(e) => setField('kode_pos', e.target.value)} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Tahun masuk (M)">
                        <input
                          className={inputClass}
                          inputMode="numeric"
                          maxLength={4}
                          value={form.tahun_masuk_masehi}
                          onChange={(e) => setField('tahun_masuk_masehi', e.target.value.replace(/\D/g, '').slice(0, 4))}
                        />
                      </Field>
                      <Field label="Tahun boyong (M)">
                        <input
                          className={inputClass}
                          inputMode="numeric"
                          maxLength={4}
                          value={form.tahun_boyong_masehi}
                          onChange={(e) => setField('tahun_boyong_masehi', e.target.value.replace(/\D/g, '').slice(0, 4))}
                        />
                      </Field>
                    </div>
                  </>
                )}
              </div>
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving || loading}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Menyimpan…' : 'Simpan'}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
