import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuthStore } from '../../../store/authStore'
import { useNotification } from '../../../contexts/NotificationContext'
import { absenLokasiAPI, lembagaAPI } from '../../../services/api'
import { useAbsenFiturAccess } from '../../../hooks/useAbsenFiturAccess'
import { userHasSuperAdminAccess } from '../../../utils/roleAccess'
import AbsenGpsToggleBar from './AbsenGpsToggleBar'
import AbsenMandiriGpsPanel from './AbsenMandiriGpsPanel'
import AbsenLokasiOffcanvas from './AbsenLokasiOffcanvas'

const emptyForm = {
  nama: '',
  latitude: '',
  longitude: '',
  radius_meter: 100,
  id_lembaga: '',
  aktif: true,
  sort_order: 0
}

export default function AbsenAbsenLokasiTab() {
  const user = useAuthStore((s) => s.user)
  const { showNotification } = useNotification()
  const absenFitur = useAbsenFiturAccess()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [lembagaOpts, setLembagaOpts] = useState([])
  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isSuper = userHasSuperAdminAccess(user)
  const scopeAll = isSuper || user?.lembaga_scope_all === true
  const lembagaPilihan = useMemo(() => {
    if (scopeAll) return lembagaOpts
    const ids = new Set((user?.lembaga_ids || []).map((x) => String(x)))
    return lembagaOpts.filter((l) => ids.has(String(l.id)))
  }, [lembagaOpts, scopeAll, user?.lembaga_ids])

  const rowClickable =
    absenFitur.lokasiList && (absenFitur.lokasiUbah || absenFitur.lokasiHapus)

  const needFetchLokasi = useMemo(() => {
    if (isSuper) return true
    if (!absenFitur.apiHasLokasiGranular) return true
    return (
      absenFitur.lokasiList ||
      absenFitur.lokasiAbsenMandiri ||
      absenFitur.lokasiTambah ||
      absenFitur.lokasiUbah ||
      absenFitur.lokasiHapus
    )
  }, [
    isSuper,
    absenFitur.apiHasLokasiGranular,
    absenFitur.lokasiList,
    absenFitur.lokasiAbsenMandiri,
    absenFitur.lokasiTambah,
    absenFitur.lokasiUbah,
    absenFitur.lokasiHapus
  ])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await absenLokasiAPI.getList()
      if (res?.success) setRows(Array.isArray(res.data) ? res.data : [])
      else {
        setRows([])
        if (res?.message) showNotification(res.message, 'error')
      }
    } catch (e) {
      setRows([])
      showNotification(e.response?.data?.message || e.message || 'Gagal memuat lokasi', 'error')
    } finally {
      setLoading(false)
    }
  }, [showNotification])

  useEffect(() => {
    if (!needFetchLokasi) {
      setRows([])
      setLoading(false)
      return
    }
    load()
  }, [needFetchLokasi, load])

  useEffect(() => {
    let c = false
    lembagaAPI
      .getAll()
      .then((res) => {
        if (c) return
        const raw = res?.data ?? res
        setLembagaOpts(Array.isArray(raw) ? raw : [])
      })
      .catch(() => {
        if (!c) setLembagaOpts([])
      })
    return () => {
      c = true
    }
  }, [])

  const closeOffcanvas = useCallback(() => {
    if (saving || deleting) return
    setOffcanvasOpen(false)
  }, [saving, deleting])

  const openCreate = () => {
    setEditingId(null)
    setForm({
      ...emptyForm,
      id_lembaga: lembagaPilihan.length === 1 ? String(lembagaPilihan[0].id) : ''
    })
    setOffcanvasOpen(true)
  }

  const openEdit = (r) => {
    setEditingId(r.id)
    setForm({
      nama: r.nama || '',
      latitude: String(r.latitude ?? ''),
      longitude: String(r.longitude ?? ''),
      radius_meter: Number(r.radius_meter) || 100,
      id_lembaga: r.id_lembaga != null ? String(r.id_lembaga) : '',
      aktif: Number(r.aktif) === 1,
      sort_order: Number(r.sort_order) || 0
    })
    setOffcanvasOpen(true)
  }

  const save = async () => {
    const nama = form.nama.trim()
    const lat = parseFloat(form.latitude)
    const lng = parseFloat(form.longitude)
    if (!nama || Number.isNaN(lat) || Number.isNaN(lng)) {
      showNotification('Nama dan koordinat wajib diisi', 'error')
      return
    }
    if (!scopeAll && lembagaPilihan.length > 0 && !form.id_lembaga) {
      showNotification('Pilih lembaga', 'error')
      return
    }
    const body = {
      nama,
      latitude: lat,
      longitude: lng,
      radius_meter: Math.max(10, Math.min(5000, Number(form.radius_meter) || 100)),
      id_lembaga: form.id_lembaga === '' ? null : String(form.id_lembaga).trim(),
      aktif: form.aktif ? 1 : 0,
      sort_order: Number(form.sort_order) || 0
    }
    setSaving(true)
    try {
      let res
      if (editingId) {
        res = await absenLokasiAPI.update(editingId, body)
      } else {
        res = await absenLokasiAPI.create(body)
      }
      if (res?.success) {
        showNotification(res.message || 'Tersimpan', 'success')
        setOffcanvasOpen(false)
        load()
      } else {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch (e) {
      showNotification(e.response?.data?.message || e.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const hapus = async () => {
    if (!editingId || !absenFitur.lokasiHapus) return
    if (!window.confirm(`Hapus lokasi "${form.nama.trim() || 'ini'}"?`)) return
    setDeleting(true)
    try {
      const res = await absenLokasiAPI.delete(editingId)
      if (res?.success) {
        showNotification(res.message || 'Dihapus', 'success')
        setOffcanvasOpen(false)
        load()
      } else {
        showNotification(res?.message || 'Gagal hapus', 'error')
      }
    } catch (e) {
      showNotification(e.response?.data?.message || e.message || 'Gagal hapus', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const offcanvasTitle = editingId
    ? absenFitur.lokasiUbah
      ? 'Ubah lokasi'
      : 'Lokasi absen'
    : 'Tambah lokasi'

  const offcanvasCanEdit = editingId ? absenFitur.lokasiUbah : absenFitur.lokasiTambah

  if (!absenFitur.tabAbsen) {
    return null
  }

  if (!absenFitur.lokasiKelolaTerlihat) {
    return (
      <div className="space-y-4">
        <AbsenGpsToggleBar />
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Anda tidak memiliki akses ke fitur lokasi absen (daftar titik, absen mandiri GPS, atau kelola). Minta admin
          mengatur aksi di bawah menu Absen pada Pengaturan → Fitur.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <AbsenGpsToggleBar />
      {absenFitur.lokasiAbsenMandiri && (
        <AbsenMandiriGpsPanel lokasiList={rows} loadingLokasi={loading} />
      )}
      {absenFitur.lokasiList && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Titik lokasi untuk validasi absen GPS. Radius dalam meter dari titik pusat. Ketuk baris untuk membuka
              detail (perlu akses ubah/hapus).
            </p>
            {absenFitur.lokasiTambah && (
              <button
                type="button"
                onClick={openCreate}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700"
              >
                Tambah lokasi
              </button>
            )}
          </div>

          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden">
            {loading ? (
              <p className="p-6 text-sm text-gray-500 text-center">Memuat…</p>
            ) : rows.length === 0 ? (
              <p className="p-6 text-sm text-gray-500 text-center">Belum ada lokasi.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="px-3 py-2">Nama</th>
                      <th className="px-3 py-2">Koordinat</th>
                      <th className="px-3 py-2">Radius</th>
                      <th className="px-3 py-2">Lembaga</th>
                      <th className="px-3 py-2">Aktif</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => rowClickable && openEdit(r)}
                        className={`text-gray-800 dark:text-gray-200 ${
                          rowClickable
                            ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40'
                            : ''
                        }`}
                      >
                        <td className="px-3 py-2 font-medium">{r.nama}</td>
                        <td className="px-3 py-2 font-mono text-xs tabular-nums">
                          {r.latitude}, {r.longitude}
                        </td>
                        <td className="px-3 py-2">{r.radius_meter} m</td>
                        <td className="px-3 py-2">{r.lembaga_nama || (r.id_lembaga ? `#${r.id_lembaga}` : 'Semua')}</td>
                        <td className="px-3 py-2">{Number(r.aktif) === 1 ? 'Ya' : 'Tidak'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <AbsenLokasiOffcanvas
        isOpen={offcanvasOpen}
        onClose={closeOffcanvas}
        title={offcanvasTitle}
        form={form}
        setForm={setForm}
        saving={saving}
        deleting={deleting}
        onSave={save}
        onDelete={hapus}
        canEdit={offcanvasCanEdit}
        canDelete={absenFitur.lokasiHapus}
        isEdit={!!editingId}
        scopeAll={scopeAll}
        lembagaPilihan={lembagaPilihan}
      />
    </div>
  )
}
