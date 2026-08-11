import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { laporanGtMybeddianAPI } from '../../../services/api'
import { useSantriIds, useSantriBiodata } from '../../../hooks/useSantriCachedResources'
import { isSantriGuruTugas } from '../../../utils/santriGuruTugas'
import { getBulanName } from '../../../utils/bulanHijriLatin'
import { isUgtLaporanBulanAktif } from '../../../utils/ugtLaporanBulanAktif'
import LaporanGtOffcanvas from './LaporanGtOffcanvas'
import { useMybeddienToast } from '../../../hooks/useMybeddienToast'

/** Selaras usePjgtKonteks: TA dari id_tahun_ajaran atau baris tahun_ajaran di respons. */
function tahunAjaranAktifFromKonteks(k) {
  if (!k || typeof k !== 'object') return ''
  if (k.id_tahun_ajaran != null && String(k.id_tahun_ajaran).trim() !== '') {
    return String(k.id_tahun_ajaran).trim()
  }
  const row = k.tahun_ajaran
  if (row && row.tahun_ajaran != null && String(row.tahun_ajaran).trim() !== '') {
    return String(row.tahun_ajaran).trim()
  }
  return ''
}

export default function SantriGtLaporanPage() {
  const { santriId } = useSantriIds()
  const { biodata, loading: biodataLoading } = useSantriBiodata()
  const isGuruTugas = isSantriGuruTugas(biodata)

  const [searchParams, setSearchParams] = useSearchParams()
  const editParam = searchParams.get('edit')
  const baruParam = searchParams.get('baru')

  const [konteks, setKonteks] = useState(null)
  const [konteksLoading, setKonteksLoading] = useState(true)
  const [konteksSettled, setKonteksSettled] = useState(false)
  const [konteksWarnings, setKonteksWarnings] = useState([])
  const [list, setList] = useState([])
  const [listLoading, setListLoading] = useState(false)

  const [editingRow, setEditingRow] = useState(null)
  const [editFetchLoading, setEditFetchLoading] = useState(false)
  const editLoadedIdRef = useRef(null)
  const { showToast } = useMybeddienToast()

  const tahunAjaranAktif = tahunAjaranAktifFromKonteks(konteks)
  const madrasahNama =
    (konteks?.madrasah_nama && String(konteks.madrasah_nama).trim()) ||
    (konteks?.penugasan_aktif?.length === 1
      ? String(konteks.penugasan_aktif[0].madrasah_nama || '').trim()
      : '')

  const konteksWarnedRef = useRef(false)
  useEffect(() => {
    if (konteksWarnedRef.current || konteksLoading || !konteksSettled) return
    if (tahunAjaranAktif) return
    konteksWarnedRef.current = true
    const warns = Array.isArray(konteksWarnings) ? konteksWarnings.filter(Boolean) : []
    if (warns.length) {
      showToast(warns.join(' '), 'warning')
    } else {
      showToast(
        'Tahun ajaran hijriyah belum bisa ditentukan. Pastikan di master (Pengaturan → Tahun Ajaran) ada baris kategori hijriyah dengan kolom dari–sampai terisi dan mencakup tanggal hari ini.',
        'warning'
      )
    }
  }, [konteksLoading, konteksSettled, tahunAjaranAktif, konteksWarnings, showToast])

  const loadKonteks = useCallback(() => {
    setKonteksLoading(true)
    return laporanGtMybeddianAPI
      .getKonteksSekarang()
      .then((res) => {
        if (res?.success && res.data) {
          setKonteks(res.data)
          setKonteksWarnings(Array.isArray(res.warnings) ? res.warnings.filter(Boolean) : [])
        } else {
          setKonteks(null)
          showToast(res?.message || 'Gagal memuat konteks laporan.', 'error')
        }
      })
      .catch(() => {
        setKonteks(null)
        showToast('Gagal memuat konteks laporan.', 'error')
      })
      .finally(() => {
        setKonteksLoading(false)
        setKonteksSettled(true)
      })
  }, [showToast])

  const loadList = useCallback(
    (ta) => {
      if (!ta) {
        setList([])
        return Promise.resolve()
      }
      setListLoading(true)
      return laporanGtMybeddianAPI
        .getAll({ id_tahun_ajaran: ta })
        .then((res) => {
          setList(res?.success && Array.isArray(res.data) ? res.data : [])
        })
        .catch(() => setList([]))
        .finally(() => setListLoading(false))
    },
    []
  )

  useEffect(() => {
    if (!isGuruTugas || biodataLoading) return
    void loadKonteks()
  }, [isGuruTugas, biodataLoading, loadKonteks])

  useEffect(() => {
    if (!tahunAjaranAktif) return
    void loadList(tahunAjaranAktif)
  }, [tahunAjaranAktif, loadList])

  const handleLaporanSuccess = useCallback(() => {
    if (tahunAjaranAktif) void loadList(tahunAjaranAktif)
    void loadKonteks()
  }, [tahunAjaranAktif, loadList, loadKonteks])

  const closeOffcanvas = useCallback(() => {
    setEditingRow(null)
    editLoadedIdRef.current = null
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.delete('edit')
        n.delete('baru')
        return n
      },
      { replace: true }
    )
  }, [setSearchParams])

  const openBaru = useCallback(() => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.delete('edit')
        n.set('baru', '1')
        return n
      },
      { replace: false }
    )
  }, [setSearchParams])

  const openEdit = useCallback(
    (row) => {
      if (row?.id) {
        editLoadedIdRef.current = Number(row.id)
        setEditingRow(row)
        setEditFetchLoading(false)
      }
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          n.delete('baru')
          n.set('edit', String(row.id))
          return n
        },
        { replace: false }
      )
    },
    [setSearchParams]
  )

  useEffect(() => {
    if (baruParam === '1') {
      setEditingRow(null)
      return
    }
    if (!editParam) {
      setEditingRow(null)
      return
    }
    const id = Number(editParam)
    if (!Number.isFinite(id) || id <= 0) {
      closeOffcanvas()
      return
    }
    const found = list.find((x) => x.id === id)
    if (found) {
      setEditingRow(found)
      if (!Array.isArray(found.masalah)) {
        laporanGtMybeddianAPI.getById(id).then((res) => {
          if (res?.success && res.data) setEditingRow(res.data)
        })
      }
      return
    }
    if (listLoading) return
    setEditFetchLoading(true)
    laporanGtMybeddianAPI
      .getById(id)
      .then((res) => {
        if (res?.success && res.data) setEditingRow(res.data)
        else closeOffcanvas()
      })
      .catch(() => closeOffcanvas())
      .finally(() => setEditFetchLoading(false))
  }, [editParam, baruParam, list, listLoading, closeOffcanvas])

  const isOffcanvasOpen = baruParam === '1' || Boolean(editParam)
  const offcanvasReadOnly =
    Boolean(editParam) && Boolean(editingRow?.id) && !isUgtLaporanBulanAktif(editingRow, konteks)
  const loading = listLoading || (konteksLoading && !tahunAjaranAktif)

  if (biodataLoading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  if (!isGuruTugas) {
    return (
      <div className="p-4 sm:p-6 max-w-lg mx-auto">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Menu laporan GT hanya untuk santri berstatus{' '}
          <span className="font-medium">Guru Tugas</span>. Status Anda saat ini:{' '}
          <span className="font-medium">{biodata?.status_santri || biodata?.status || '—'}</span>.
        </p>
        <Link to="/santri/biodata" className="mt-3 inline-block text-sm text-primary-600 dark:text-primary-400 hover:underline">
          Lihat biodata
        </Link>
      </div>
    )
  }

  return (
    <>
      <motion.div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto pb-24 sm:pb-8">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Tahun ajaran:{' '}
            {konteksLoading ? (
              <span className="text-gray-500">memuat…</span>
            ) : tahunAjaranAktif ? (
              <span className="font-semibold text-teal-700 dark:text-teal-400">{tahunAjaranAktif}</span>
            ) : (
              <span className="text-amber-700 dark:text-amber-400">belum ditentukan</span>
            )}
            {konteks?.bulan_hijriyah ? (
              <>
                {' '}
                · Bulan aktif:{' '}
                <span className="font-semibold text-teal-700 dark:text-teal-400">
                  {getBulanName(konteks.bulan_hijriyah)}
                </span>
              </>
            ) : null}
            {madrasahNama ? (
              <>
                {' '}
                · Madrasah: <span className="font-medium text-gray-800 dark:text-gray-200">{madrasahNama}</span>
              </>
            ) : null}
          </p>
          <button
            type="button"
            onClick={openBaru}
            disabled={!tahunAjaranAktif || konteksLoading}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium shadow-sm shrink-0"
          >
            Tambah laporan GT
          </button>
        </motion.div>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
        >
          {loading ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">Memuat...</div>
          ) : list.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
              Belum ada laporan GT. Klik &quot;Tambah laporan GT&quot; untuk mengisi.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-600 dark:text-gray-400">
                    <th className="px-4 py-3 font-medium">Bulan</th>
                    <th className="px-4 py-3 font-medium">Madrasah</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Wali kelas</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell max-w-[140px]">Usulan</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => {
                    const canEdit = isUgtLaporanBulanAktif(row, konteks)
                    return (
                    <tr
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openEdit(row)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openEdit(row)
                        }
                      }}
                      aria-label={
                        canEdit
                          ? `Ubah laporan GT bulan ${getBulanName(row.bulan)}`
                          : `Lihat laporan GT bulan ${getBulanName(row.bulan)}`
                      }
                      className="border-b border-gray-100 dark:border-gray-700/80 hover:bg-gray-50/80 dark:hover:bg-gray-900/30 cursor-pointer"
                    >
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {getBulanName(row.bulan)}
                          {!canEdit ? (
                            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/80 px-1.5 py-0.5 rounded">
                              Lihat
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{row.madrasah_nama || '—'}</td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400 hidden md:table-cell">
                        {row.wali_kelas || '—'}
                      </td>
                      <td
                        className="px-4 py-2 text-gray-600 dark:text-gray-400 max-w-[140px] truncate hidden lg:table-cell"
                        title={row.usulan || ''}
                      >
                        {row.usulan || '—'}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.section>

        <p className="mt-6 text-sm text-gray-600 dark:text-gray-400">
          Laporan bulanan sebagai <span className="font-medium">Guru Tugas</span>
          {madrasahNama ? (
            <>
              {' '}
              di <span className="font-medium text-gray-900 dark:text-gray-100">{madrasahNama}</span>
            </>
          ) : null}
          . Hanya laporan <span className="font-medium">bulan aktif</span> yang bisa diubah; bulan sebelumnya hanya
          bisa dilihat.
        </p>
      </motion.div>

      <LaporanGtOffcanvas
        isOpen={isOffcanvasOpen}
        onClose={closeOffcanvas}
        detailLoading={Boolean(editParam && editFetchLoading)}
        initialData={baruParam === '1' ? null : editingRow}
        santriId={santriId}
        tahunAjaranAktif={tahunAjaranAktif}
        konteksData={konteks}
        readOnly={offcanvasReadOnly}
        onSuccess={handleLaporanSuccess}
        onNotify={showToast}
      />
    </>
  )
}
