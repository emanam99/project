import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ugtKompasAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import SimpleRichTextEditor from '../../../components/SimpleRichTextEditor'

const emptyForm = () => ({
  nama: '',
  deskripsi: '',
  aturan: '',
  tempat_maps_url: '',
  tempat_catatan: '',
  kategori: 'perorangan',
  anggota_per_kelompok: 2,
  usia_min: 10,
  usia_max: 18
})

function LombaFormOffcanvas({ isOpen, onClose, tahunAjaran, initial, onSaved }) {
  const { showNotification } = useNotification()
  const handleClose = useOffcanvasBackClose(isOpen, onClose)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const isEdit = Boolean(initial?.id)
  const blocked = isEdit && Number(initial?.jumlah_daftar || 0) > 0

  useEffect(() => {
    if (!isOpen) return
    if (initial) {
      setForm({
        nama: initial.nama || '',
        deskripsi: initial.deskripsi || '',
        aturan: initial.aturan || '',
        tempat_maps_url: initial.tempat_maps_url || '',
        tempat_catatan: initial.tempat_catatan || '',
        kategori: initial.kategori || 'perorangan',
        anggota_per_kelompok: Number(initial.anggota_per_kelompok) || 2,
        usia_min: Number(initial.usia_min) ?? 10,
        usia_max: Number(initial.usia_max) ?? 18
      })
    } else {
      setForm(emptyForm())
    }
  }, [isOpen, initial])

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!blocked && !form.nama.trim()) {
      showNotification('Nama lomba wajib diisi', 'error')
      return
    }
    if (!blocked && Number(form.usia_min) > Number(form.usia_max)) {
      showNotification('Usia minimum tidak boleh lebih besar dari usia maksimum', 'error')
      return
    }
    if (!blocked && form.kategori === 'grup' && Number(form.anggota_per_kelompok) < 2) {
      showNotification('Jumlah orang per kelompok minimal 2', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = blocked
        ? {
            deskripsi: form.deskripsi || '',
            aturan: form.aturan || '',
            tempat_maps_url: form.tempat_maps_url.trim(),
            tempat_catatan: form.tempat_catatan.trim()
          }
        : {
            tahun_ajaran: tahunAjaran,
            nama: form.nama.trim(),
            deskripsi: form.deskripsi || '',
            aturan: form.aturan || '',
            tempat_maps_url: form.tempat_maps_url.trim(),
            tempat_catatan: form.tempat_catatan.trim(),
            kategori: form.kategori,
            anggota_per_kelompok: form.kategori === 'grup' ? Number(form.anggota_per_kelompok) : null,
            usia_min: Number(form.usia_min),
            usia_max: Number(form.usia_max)
          }
      const res = isEdit
        ? await ugtKompasAPI.updateLomba(initial.id, payload)
        : await ugtKompasAPI.createLomba(payload)
      if (res?.success) {
        showNotification(res.message || 'Tersimpan', 'success')
        onSaved?.()
        handleClose()
      } else {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || err?.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 focus:outline-none'
  const labelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1'

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="kompas-lomba-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[9998]"
            onClick={handleClose}
          />
          <motion.aside
            key="kompas-lomba-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.22 }}
            className="fixed inset-y-0 right-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[9999] flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {isEdit ? 'Edit Lomba' : 'Tambah Lomba'}
              </h2>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 text-sm"
              >
                Tutup
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              <section className="space-y-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Data inti lomba
                </p>
                <div>
                  <label className={labelClass}>Nama lomba *</label>
                  <input
                    className={inputClass}
                    value={form.nama}
                    onChange={(e) => setField('nama', e.target.value)}
                    disabled={blocked}
                    required={!blocked}
                  />
                </div>
                <div>
                  <label className={labelClass}>Kategori *</label>
                  <select
                    className={inputClass}
                    value={form.kategori}
                    onChange={(e) => setField('kategori', e.target.value)}
                    disabled={blocked}
                  >
                    <option value="perorangan">Perorangan</option>
                    <option value="grup">Grup</option>
                  </select>
                </div>
                {form.kategori === 'grup' ? (
                  <div>
                    <label className={labelClass}>Orang per kelompok *</label>
                    <input
                      type="number"
                      min={2}
                      className={inputClass}
                      value={form.anggota_per_kelompok}
                      onChange={(e) => setField('anggota_per_kelompok', e.target.value)}
                      disabled={blocked}
                    />
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Usia min (tahun) *</label>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      className={inputClass}
                      value={form.usia_min}
                      onChange={(e) => setField('usia_min', e.target.value)}
                      disabled={blocked}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Usia max (tahun) *</label>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      className={inputClass}
                      value={form.usia_max}
                      onChange={(e) => setField('usia_max', e.target.value)}
                      disabled={blocked}
                    />
                  </div>
                </div>
              </section>

              <div className="py-1">
                <hr className="border-gray-200 dark:border-gray-600" />
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  {blocked
                    ? 'Sudah ada pendaftar — data di atas terkunci dan tidak bisa diedit. Di bawah masih bisa diubah.'
                    : 'Setelah ada peserta yang mendaftar, data di atas terkunci (sekali dibuat tidak bisa diedit). Deskripsi, aturan, dan lokasi tetap bisa diubah.'}
                </p>
              </div>

              <section className="space-y-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Info & lokasi
                </p>
                <div>
                  <label className={labelClass}>Deskripsi</label>
                  <p className="mb-1.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                    Teks sederhana: tebal/miring/garis bawah, judul & subjudul, daftar bullet/nomor.
                  </p>
                  <SimpleRichTextEditor
                    key={`deskripsi-${isOpen ? (initial?.id || 'new') : 'closed'}`}
                    value={form.deskripsi}
                    onChange={(html) => setField('deskripsi', html)}
                    placeholder="Deskripsi lomba…"
                  />
                </div>
                <div>
                  <label className={labelClass}>Aturan</label>
                  <p className="mb-1.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                    Teks sederhana: tebal/miring/garis bawah, judul & subjudul, daftar bullet/nomor.
                  </p>
                  <SimpleRichTextEditor
                    key={`aturan-${isOpen ? (initial?.id || 'new') : 'closed'}`}
                    value={form.aturan}
                    onChange={(html) => setField('aturan', html)}
                    placeholder="Aturan lomba…"
                  />
                </div>
                <div>
                  <label className={labelClass}>Link Google Maps</label>
                  <input
                    className={inputClass}
                    value={form.tempat_maps_url}
                    onChange={(e) => setField('tempat_maps_url', e.target.value)}
                    placeholder="https://maps.google.com/..."
                  />
                </div>
                <div>
                  <label className={labelClass}>Catatan lokasi</label>
                  <input
                    className={inputClass}
                    value={form.tempat_catatan}
                    onChange={(e) => setField('tempat_catatan', e.target.value)}
                  />
                </div>
              </section>

              <div className="pt-2 pb-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-2.5 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Menyimpan…' : isEdit ? 'Simpan perubahan' : 'Buat lomba'}
                </button>
              </div>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

export default function KompasLombaTab({ tahunAjaran, fitur = {} }) {
  const { showNotification } = useNotification()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const canTambah = fitur.lombaTambah !== false
  const canUbah = fitur.lombaUbah !== false
  const canHapus = fitur.lombaHapus !== false

  const load = useCallback(async () => {
    if (!tahunAjaran) return
    setLoading(true)
    try {
      const res = await ugtKompasAPI.listLomba(tahunAjaran)
      if (res?.success) setList(res.data || [])
      else {
        setList([])
        showNotification(res?.message || 'Gagal memuat lomba', 'error')
      }
    } catch (err) {
      setList([])
      showNotification(err?.response?.data?.message || 'Gagal memuat lomba', 'error')
    } finally {
      setLoading(false)
    }
  }, [tahunAjaran, showNotification])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (row) => {
    if (!row?.id) return
    if (Number(row.jumlah_daftar || 0) > 0) {
      showNotification('Hapus pendaftaran terlebih dahulu', 'error')
      return
    }
    if (!window.confirm(`Hapus lomba «${row.nama}»?`)) return
    try {
      const res = await ugtKompasAPI.deleteLomba(row.id)
      if (res?.success) {
        showNotification(res.message || 'Terhapus', 'success')
        load()
      } else {
        showNotification(res?.message || 'Gagal menghapus', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal menghapus', 'error')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Tahun ajaran <span className="font-medium text-gray-800 dark:text-gray-200">{tahunAjaran}</span>
        </p>
        {canTambah ? (
          <button
            type="button"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
            className="px-3 py-1.5 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium"
          >
            + Tambah lomba
          </button>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Memuat…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada lomba untuk tahun ini.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{row.nama}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {row.kategori === 'grup'
                      ? `Grup · ${row.anggota_per_kelompok} orang/kelompok`
                      : 'Perorangan'}
                    {' · '}
                    Usia {row.usia_min}–{row.usia_max} th
                    {' · '}
                    {Number(row.jumlah_daftar || 0)} pendaftar
                  </p>
                  {row.tempat_catatan || row.tempat_maps_url ? (
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                      {row.tempat_catatan || 'Lokasi'}
                      {row.tempat_maps_url ? (
                        <>
                          {' · '}
                          <a
                            href={row.tempat_maps_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-teal-600 dark:text-teal-400 underline"
                          >
                            Maps
                          </a>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {canUbah ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(row)
                        setFormOpen(true)
                      }}
                      className="px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Edit
                    </button>
                  ) : null}
                  {canHapus ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(row)}
                      className="px-2.5 py-1 text-xs rounded border border-red-300 text-red-700 dark:border-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30"
                    >
                      Hapus
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <LombaFormOffcanvas
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        tahunAjaran={tahunAjaran}
        initial={editing}
        onSaved={load}
      />
    </div>
  )
}
