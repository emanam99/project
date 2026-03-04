import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { madrasahAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'

const KATEGORI_OPTIONS = ['Madrasah', 'Pesantren', 'Yayasan', 'Sekolah', 'Lainnya']
const STATUS_OPTIONS = ['Pendaftar Baru', 'Belum Survei', 'Sudah Survei', 'Penerima', 'Tidak Aktif']
const KURIKULUM_OPTIONS = ['Depag', 'Diniyah (Mandiri)']
const BANIN_BANAT_OPTIONS = ['kumpul', 'tidak kumpul']
const ADA_TIDAK_OPTIONS = ['ada', 'tidak ada', 'ada tapi tidak aktif']
const PENGELOLA_OPTIONS = ['yayasan', 'pesantren', 'perorangan']
const ADA_PROCES_OPTIONS = ['ada', 'tidak ada', 'dalam proses']
const KM_BERSIFAT_OPTIONS = ['khusus', 'umum']
const KONSUMSI_OPTIONS = ['perorangan', 'bergantian']
const KAMAR_GT_JARAK_OPTIONS = ['dekat madrasah', 'jauh dari madrasah']
const MASYARAKAT_OPTIONS = ['kota', 'desa', 'pegunungan']
const ALUMNI_OPTIONS = ['ada', 'tidak ada', 'sedikit']
const JARAK_MD_OPTIONS = ['dekat', 'jauh']

/** Kolom yang bisa diubah massal. Tidak termasuk: identitas, nama, id_alamat, pengasuh, PJGT, jumlah_murid */
const BULK_FIELDS = [
  { key: 'kategori', label: 'Kategori', type: 'select', options: KATEGORI_OPTIONS },
  { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
  { key: 'dusun', label: 'Dusun', type: 'text' },
  { key: 'rt', label: 'RT', type: 'text' },
  { key: 'rw', label: 'RW', type: 'text' },
  { key: 'desa', label: 'Desa', type: 'text' },
  { key: 'kecamatan', label: 'Kecamatan', type: 'text' },
  { key: 'kabupaten', label: 'Kabupaten', type: 'text' },
  { key: 'provinsi', label: 'Provinsi', type: 'text' },
  { key: 'kode_pos', label: 'Kode Pos', type: 'text' },
  { key: 'id_koordinator', label: 'NIP Koordinator (7 digit)', type: 'text' },
  { key: 'sektor', label: 'Sektor', type: 'text' },
  { key: 'kepala', label: 'Kepala', type: 'text' },
  { key: 'sekretaris', label: 'Sekretaris', type: 'text' },
  { key: 'bendahara', label: 'Bendahara', type: 'text' },
  { key: 'kegiatan_pagi', label: 'Kegiatan Pagi', type: 'checkbox' },
  { key: 'kegiatan_sore', label: 'Kegiatan Sore', type: 'checkbox' },
  { key: 'kegiatan_malam', label: 'Kegiatan Malam', type: 'checkbox' },
  { key: 'kegiatan_mulai', label: 'Jam Mulai', type: 'text' },
  { key: 'kegiatan_sampai', label: 'Jam Sampai', type: 'text' },
  { key: 'tempat', label: 'Tempat', type: 'text' },
  { key: 'berdiri_tahun', label: 'Berdiri Tahun', type: 'text' },
  { key: 'tpq', label: 'TPQ', type: 'checkbox' },
  { key: 'ula', label: 'Ula', type: 'checkbox' },
  { key: 'wustha', label: 'Wustha', type: 'checkbox' },
  { key: 'ulya', label: 'Ulya', type: 'checkbox' },
  { key: 'ma_had_ali', label: "Ma'had Ali", type: 'checkbox' },
  { key: 'kelas_tertinggi', label: 'Kelas Tertinggi', type: 'text' },
  { key: 'kurikulum', label: 'Kurikulum', type: 'select', options: KURIKULUM_OPTIONS },
  { key: 'keterangan', label: 'Keterangan', type: 'text' },
  { key: 'banin_banat', label: 'Banin Banat', type: 'select', options: BANIN_BANAT_OPTIONS },
  { key: 'seragam', label: 'Seragam', type: 'select', options: ADA_TIDAK_OPTIONS },
  { key: 'syahriah', label: 'Syahriah', type: 'select', options: ADA_TIDAK_OPTIONS },
  { key: 'pengelola', label: 'Pengelola', type: 'select', options: PENGELOLA_OPTIONS },
  { key: 'gedung_madrasah', label: 'Gedung Madrasah', type: 'select', options: ADA_PROCES_OPTIONS },
  { key: 'kantor', label: 'Kantor', type: 'select', options: ADA_PROCES_OPTIONS },
  { key: 'bangku', label: 'Bangku', type: 'select', options: ADA_PROCES_OPTIONS },
  { key: 'kamar_mandi_murid', label: 'Kamar Mandi Murid', type: 'select', options: ADA_PROCES_OPTIONS },
  { key: 'kamar_gt', label: 'Kamar GT', type: 'select', options: ADA_PROCES_OPTIONS },
  { key: 'kamar_mandi_gt', label: 'Kamar Mandi GT', type: 'select', options: ADA_PROCES_OPTIONS },
  { key: 'km_bersifat', label: 'KM Bersifat', type: 'select', options: KM_BERSIFAT_OPTIONS },
  { key: 'konsumsi', label: 'Konsumsi', type: 'select', options: KONSUMSI_OPTIONS },
  { key: 'kamar_gt_jarak', label: 'Kamar GT Jarak', type: 'select', options: KAMAR_GT_JARAK_OPTIONS },
  { key: 'masyarakat', label: 'Masyarakat', type: 'select', options: MASYARAKAT_OPTIONS },
  { key: 'alumni', label: 'Alumni', type: 'select', options: ALUMNI_OPTIONS },
  { key: 'jarak_md_lain', label: 'Jarak MD Lain', type: 'select', options: JARAK_MD_OPTIONS }
]

export default function BulkEditMadrasahOffcanvas({ isOpen, onClose, selectedIds, list, onSuccess }) {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(false)
  const [selectedField, setSelectedField] = useState('')
  const [textValue, setTextValue] = useState('')
  const [selectValue, setSelectValue] = useState('')
  const [checkboxValue, setCheckboxValue] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setSelectedField('')
      setTextValue('')
      setSelectValue('')
      setCheckboxValue(false)
    }
  }, [isOpen])

  const fieldConfig = BULK_FIELDS.find((f) => f.key === selectedField)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedField) {
      showNotification('Pilih kolom yang ingin diubah', 'error')
      return
    }
    let value
    if (fieldConfig?.type === 'checkbox') value = checkboxValue ? 1 : 0
    else if (fieldConfig?.type === 'select') value = selectValue || null
    else value = (textValue || '').trim() || null

    const ids = Array.from(selectedIds || [])
    if (ids.length === 0) {
      showNotification('Tidak ada madrasah yang dipilih', 'error')
      return
    }

    setLoading(true)
    let ok = 0
    let fail = 0
    for (const id of ids) {
      try {
        const item = list?.find((m) => m.id === id)
        const nama = item?.nama ?? 'Madrasah'
        const payload = {
          identitas: item?.identitas ?? null,
          nama,
          kategori: item?.kategori ?? null,
          status: item?.status ?? null,
          id_alamat: item?.id_alamat ?? null,
          dusun: item?.dusun ?? null,
          rt: item?.rt ?? null,
          rw: item?.rw ?? null,
          desa: item?.desa ?? null,
          kecamatan: item?.kecamatan ?? null,
          kabupaten: item?.kabupaten ?? null,
          provinsi: item?.provinsi ?? null,
          kode_pos: item?.kode_pos ?? null,
          id_koordinator: item?.koordinator_nip != null && item?.koordinator_nip !== '' ? item.koordinator_nip : (item?.id_koordinator ?? null),
          sektor: item?.sektor ?? null,
          nama_pengasuh: item?.nama_pengasuh ?? item?.pengasuh_nama ?? null,
          id_pengasuh: item?.id_pengasuh ?? null,
          no_pengasuh: item?.no_pengasuh ?? item?.pengasuh_wa ?? null,
          kepala: item?.kepala ?? null,
          sekretaris: item?.sekretaris ?? null,
          bendahara: item?.bendahara ?? null,
          nama_pjgt: item?.nama_pjgt ?? item?.pjgt_nama ?? null,
          id_pjgt: item?.id_pjgt ?? null,
          no_pjgt: item?.no_pjgt ?? item?.pjgt_wa ?? null,
          tpq: selectedField === 'tpq' ? (checkboxValue ? 1 : 0) : (item?.tpq ? 1 : 0),
          ula: selectedField === 'ula' ? (checkboxValue ? 1 : 0) : (item?.ula ? 1 : 0),
          wustha: selectedField === 'wustha' ? (checkboxValue ? 1 : 0) : (item?.wustha ? 1 : 0),
          ulya: selectedField === 'ulya' ? (checkboxValue ? 1 : 0) : (item?.ulya ? 1 : 0),
          ma_had_ali: selectedField === 'ma_had_ali' ? (checkboxValue ? 1 : 0) : (item?.ma_had_ali ? 1 : 0),
          kurikulum: selectedField === 'kurikulum' ? (selectValue || null) : (item?.kurikulum ?? null),
          jumlah_murid: item?.jumlah_murid != null ? item.jumlah_murid : null,
          kegiatan_pagi: selectedField === 'kegiatan_pagi' ? (checkboxValue ? 1 : 0) : (item?.kegiatan_pagi ? 1 : 0),
          kegiatan_sore: selectedField === 'kegiatan_sore' ? (checkboxValue ? 1 : 0) : (item?.kegiatan_sore ? 1 : 0),
          kegiatan_malam: selectedField === 'kegiatan_malam' ? (checkboxValue ? 1 : 0) : (item?.kegiatan_malam ? 1 : 0),
          kegiatan_mulai: selectedField === 'kegiatan_mulai' ? value : (item?.kegiatan_mulai ?? null),
          kegiatan_sampai: selectedField === 'kegiatan_sampai' ? value : (item?.kegiatan_sampai ?? null),
          tempat: selectedField === 'tempat' ? value : (item?.tempat ?? null),
          berdiri_tahun: selectedField === 'berdiri_tahun' ? (value != null && value !== '' ? parseInt(Number(value), 10) : null) : (item?.berdiri_tahun != null ? item.berdiri_tahun : null),
          kelas_tertinggi: selectedField === 'kelas_tertinggi' ? value : (item?.kelas_tertinggi ?? null),
          keterangan: selectedField === 'keterangan' ? value : (item?.keterangan ?? null),
          banin_banat: selectedField === 'banin_banat' ? value : (item?.banin_banat ?? null),
          seragam: selectedField === 'seragam' ? value : (item?.seragam ?? null),
          syahriah: selectedField === 'syahriah' ? value : (item?.syahriah ?? null),
          pengelola: selectedField === 'pengelola' ? value : (item?.pengelola ?? null),
          gedung_madrasah: selectedField === 'gedung_madrasah' ? value : (item?.gedung_madrasah ?? null),
          kantor: selectedField === 'kantor' ? value : (item?.kantor ?? null),
          bangku: selectedField === 'bangku' ? value : (item?.bangku ?? null),
          kamar_mandi_murid: selectedField === 'kamar_mandi_murid' ? value : (item?.kamar_mandi_murid ?? null),
          kamar_gt: selectedField === 'kamar_gt' ? value : (item?.kamar_gt ?? null),
          kamar_mandi_gt: selectedField === 'kamar_mandi_gt' ? value : (item?.kamar_mandi_gt ?? null),
          km_bersifat: selectedField === 'km_bersifat' ? value : (item?.km_bersifat ?? null),
          konsumsi: selectedField === 'konsumsi' ? value : (item?.konsumsi ?? null),
          kamar_gt_jarak: selectedField === 'kamar_gt_jarak' ? value : (item?.kamar_gt_jarak ?? null),
          masyarakat: selectedField === 'masyarakat' ? value : (item?.masyarakat ?? null),
          alumni: selectedField === 'alumni' ? value : (item?.alumni ?? null),
          jarak_md_lain: selectedField === 'jarak_md_lain' ? value : (item?.jarak_md_lain ?? null)
        }
        let finalValue = value
        if (selectedField === 'berdiri_tahun' && value != null && value !== '') finalValue = parseInt(Number(value), 10)
        payload[selectedField] = finalValue

        const res = await madrasahAPI.update(id, payload)
        if (res?.success) ok++
        else fail++
      } catch {
        fail++
      }
    }
    setLoading(false)
    showNotification(`Ubah massal selesai: ${ok} berhasil, ${fail} gagal`, ok > 0 ? 'success' : 'warning')
    onSuccess?.()
    onClose()
  }

  if (!isOpen) return null

  const content = (
    <AnimatePresence>
      <motion.div
        key="bulk-madrasah-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[9998]"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        key="bulk-madrasah-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.25 }}
        className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[9999] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Ubah Massal Madrasah</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Tutup">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <strong>{selectedIds?.size ?? 0}</strong> madrasah terpilih. Pilih kolom dan nilai baru:
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kolom</label>
              <select
                value={selectedField}
                onChange={(e) => { setSelectedField(e.target.value); setTextValue(''); setSelectValue(''); setCheckboxValue(false) }}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="">-- Pilih kolom --</option>
                {BULK_FIELDS.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </div>
            {fieldConfig?.type === 'text' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nilai baru</label>
                <input
                  type="text"
                  value={textValue}
                  onChange={(e) => setTextValue(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder={fieldConfig.label}
                />
              </div>
            )}
            {fieldConfig?.type === 'select' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nilai baru</label>
                <select
                  value={selectValue}
                  onChange={(e) => setSelectValue(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">-- Kosongkan --</option>
                  {fieldConfig.options?.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
            )}
            {fieldConfig?.type === 'checkbox' && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="bulk-checkbox-value"
                  checked={checkboxValue}
                  onChange={(e) => setCheckboxValue(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                />
                <label htmlFor="bulk-checkbox-value" className="text-sm text-gray-700 dark:text-gray-300">Centang = Ya</label>
              </div>
            )}
          </div>
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="submit"
              disabled={!selectedField || loading}
              className="w-full px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium rounded-lg"
            >
              {loading ? 'Menerapkan...' : 'Terapkan ke semua terpilih'}
            </button>
          </div>
        </form>
      </motion.div>
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}
