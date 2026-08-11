import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { laporanPjgtMybeddianAPI } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import {
  usePjgtKonteks,
  usePjgtLaporanList,
  usePjgtMadrasahId,
  usePjgtProfil,
} from '../../hooks/usePjgtCachedResources'
import { refreshPjgtLaporanAfterMutation } from '../../services/pjgtDataService'
import { getBulanName } from '../../utils/bulanHijriLatin'
import { isUgtLaporanBulanAktif } from '../../utils/ugtLaporanBulanAktif'
import { madrasahNamaFromUser } from '../../utils/pjgtMadrasahNama'
import LaporanPjgtOffcanvas from './LaporanPjgtOffcanvas'
import { useMybeddienToast } from '../../hooks/useMybeddienToast'

export default function PjgtLaporanPage() {
  const user = useAuthStore((s) => s.user)
  const madrasahId = usePjgtMadrasahId()
  const { data: profilMadrasah } = usePjgtProfil()
  const {
    tahunAjaranAktif,
    loading: konteksLoading,
    konteksSettled,
    warnings: konteksWarnings,
    konteks,
  } = usePjgtKonteks()
  const { list, loading: listLoading } = usePjgtLaporanList(tahunAjaranAktif)

  const namaProfil =
    profilMadrasah?.nama != null ? String(profilMadrasah.nama).trim() : ''
  const madrasahNama = (namaProfil || madrasahNamaFromUser(user) || '').trim() || 'Madrasah Anda'

  const [searchParams, setSearchParams] = useSearchParams()
  const editParam = searchParams.get('edit')
  const baruParam = searchParams.get('baru')

  const loading = listLoading || (konteksLoading && !tahunAjaranAktif)

  const [editingRow, setEditingRow] = useState(null)
  const [editFetchLoading, setEditFetchLoading] = useState(false)
  const editLoadedIdRef = useRef(null)
  const masalahFetchedRef = useRef(null)
  const { showToast } = useMybeddienToast()

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

  const handleLaporanSuccess = useCallback(() => {
    if (madrasahId && tahunAjaranAktif) {
      refreshPjgtLaporanAfterMutation(madrasahId, tahunAjaranAktif)
    }
  }, [madrasahId, tahunAjaranAktif])

  const closeOffcanvas = useCallback(() => {
    setEditingRow(null)
    editLoadedIdRef.current = null
    masalahFetchedRef.current = null
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

  const openEdit = useCallback((row) => {
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
  }, [setSearchParams])

  useEffect(() => {
    if (baruParam === '1') {
      setEditingRow(null)
      setEditFetchLoading(false)
      editLoadedIdRef.current = null
      masalahFetchedRef.current = null
      return
    }
    if (!editParam) {
      setEditingRow(null)
      setEditFetchLoading(false)
      editLoadedIdRef.current = null
      masalahFetchedRef.current = null
      return
    }
    const id = Number(editParam)
    if (!Number.isFinite(id) || id <= 0) {
      editLoadedIdRef.current = null
      masalahFetchedRef.current = null
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          n.delete('edit')
          return n
        },
        { replace: true }
      )
      setEditingRow(null)
      return
    }

    if (editLoadedIdRef.current === id && editingRow?.id === id) {
      if (!Array.isArray(editingRow.masalah) && masalahFetchedRef.current !== id) {
        masalahFetchedRef.current = id
        let cancelled = false
        laporanPjgtMybeddianAPI
          .getById(id)
          .then((res) => {
            if (cancelled) return
            if (res?.success && res.data) setEditingRow(res.data)
          })
        return () => {
          cancelled = true
        }
      }
      return
    }

    let cancelled = false
    const applyRow = (row) => {
      if (cancelled || !row) return
      editLoadedIdRef.current = id
      setEditingRow(row)
      setEditFetchLoading(false)
    }

    const fetchDetail = (background = false) => {
      if (!background) setEditFetchLoading(true)
      laporanPjgtMybeddianAPI
        .getById(id)
        .then((res) => {
          if (cancelled) return
          if (res?.success && res.data) {
            applyRow(res.data)
          } else if (!background) {
            editLoadedIdRef.current = null
            setSearchParams(
              (prev) => {
                const n = new URLSearchParams(prev)
                n.delete('edit')
                return n
              },
              { replace: true }
            )
            setEditingRow(null)
          }
        })
        .catch(() => {
          if (cancelled || background) return
          editLoadedIdRef.current = null
          setSearchParams(
            (prev) => {
              const n = new URLSearchParams(prev)
              n.delete('edit')
              return n
            },
            { replace: true }
          )
          setEditingRow(null)
        })
        .finally(() => {
          if (!cancelled && !background) setEditFetchLoading(false)
        })
    }

    const found = list.find((x) => x.id === id)
    if (found) {
      applyRow(found)
      if (!Array.isArray(found.masalah)) {
        masalahFetchedRef.current = id
        fetchDetail(true)
      }
      return () => {
        cancelled = true
      }
    }

    if (loading) return

    fetchDetail(false)
    return () => {
      cancelled = true
    }
  }, [editParam, baruParam, list, loading, editingRow, setSearchParams])

  /** Buka dari URL saja — hindari offcanvas tutup-buka saat editingRow masih loading */
  const isOffcanvasOpen = baruParam === '1' || Boolean(editParam)
  const offcanvasReadOnly =
    Boolean(editParam) && Boolean(editingRow?.id) && !isUgtLaporanBulanAktif(editingRow, konteks)

  if (!madrasahId) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Akun PJGT belum terhubung ke data madrasah. Hubungkan akun di pengaturan atau login ulang.
        </p>
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
          </p>
          <button
            type="button"
            onClick={openBaru}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium shadow-sm shrink-0"
          >
            Tambah laporan
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
              Belum ada laporan PJGT. Klik &quot;Tambah laporan&quot; untuk mengisi.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-600 dark:text-gray-400">
                    <th className="px-4 py-3 font-medium w-[28%] sm:w-[22%]">Bulan</th>
                    <th className="px-4 py-3 font-medium">Guru Tugas</th>
                    <th className="px-4 py-3 font-medium hidden xl:table-cell">Dibuat oleh</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Ubudiyah</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell max-w-[120px]">Usulan</th>
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
                          ? `Ubah laporan PJGT: ${row.santri_nama || ''}`
                          : `Lihat laporan PJGT: ${row.santri_nama || ''}`
                      }
                      className="border-b border-gray-100 dark:border-gray-700/80 hover:bg-gray-50/80 dark:hover:bg-gray-900/30 cursor-pointer"
                    >
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap align-top">
                        <span className="inline-flex items-center gap-1.5">
                          {getBulanName(row.bulan)}
                          {!canEdit ? (
                            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/80 px-1.5 py-0.5 rounded">
                              Lihat
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-800 dark:text-gray-200 align-top">
                        {row.santri_nama || '—'}
                      </td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300 hidden xl:table-cell align-top">
                        {(row.pembuat_nama || '').trim() || '—'}
                      </td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400 hidden md:table-cell">{row.ubudiyah || '—'}</td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400 max-w-[120px] truncate hidden lg:table-cell" title={row.usulan || ''}>
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
          Laporan bulanan PJGT untuk{' '}
          <span className="font-medium text-gray-900 dark:text-gray-100">{madrasahNama}</span>. Hanya laporan{' '}
          <span className="font-medium">bulan aktif</span> yang bisa diubah; bulan sebelumnya hanya bisa dilihat.
        </p>

      </motion.div>

      <LaporanPjgtOffcanvas
        isOpen={isOffcanvasOpen}
        onClose={closeOffcanvas}
        detailLoading={Boolean(editParam && editFetchLoading)}
        initialData={baruParam === '1' ? null : editingRow}
        madrasahId={madrasahId}
        madrasahNama={madrasahNama}
        tahunAjaranAktif={tahunAjaranAktif}
        readOnly={offcanvasReadOnly}
        onSuccess={handleLaporanSuccess}
        onNotify={showToast}
      />
    </>
  )
}
