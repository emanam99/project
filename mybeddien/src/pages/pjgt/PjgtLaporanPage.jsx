import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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
import {
  getUgtLaporanBulanPhase,
  UGT_LAPORAN_BULAN_PJGT_GT,
} from '../../utils/ugtLaporanBulanAllowed'
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
  const laporanByBulan = useMemo(() => {
    const grouped = new Map(UGT_LAPORAN_BULAN_PJGT_GT.map((bulan) => [bulan, []]))
    for (const row of Array.isArray(list) ? list : []) {
      const bulan = Number(row?.bulan)
      if (grouped.has(bulan)) grouped.get(bulan).push(row)
    }
    return grouped
  }, [list])

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
        </motion.div>

        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            Memuat...
          </div>
        ) : (
          <div className="space-y-3">
            {UGT_LAPORAN_BULAN_PJGT_GT.map((bulan, index) => {
              const phase = getUgtLaporanBulanPhase(bulan, konteks?.bulan_hijriyah)
              const rows = laporanByBulan.get(bulan) || []
              const active = phase === 'active'
              const future = phase === 'future'
              return (
                <motion.section
                  key={bulan}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.03 * index }}
                  className={`overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-gray-800 ${
                    active
                      ? 'border-primary-300 ring-1 ring-primary-200 dark:border-primary-700 dark:ring-primary-900'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-gray-900 dark:text-gray-100">{getBulanName(bulan)}</h2>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          active
                            ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                            : future
                              ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        }`}>
                          {active ? 'Bulan aktif' : future ? 'Belum dibuka' : 'Sudah lewat'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {rows.length > 0
                          ? `${rows.length} laporan tersimpan`
                          : future
                            ? 'Laporan belum dapat dibuat'
                            : active
                              ? 'Belum ada laporan'
                              : 'Tidak ada laporan'}
                      </p>
                    </div>
                    {active ? (
                      <button
                        type="button"
                        onClick={openBaru}
                        disabled={!tahunAjaranAktif}
                        className="shrink-0 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                      >
                        Buat laporan
                      </button>
                    ) : future ? (
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500" title="Belum dibuka">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </span>
                    ) : null}
                  </div>

                  {rows.length > 0 ? (
                    <div className="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-700 dark:border-gray-700">
                      {rows.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => openEdit(row)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-900/30"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                              {row.santri_nama || 'Guru Tugas'}
                            </p>
                            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                              {row.ubudiyah || 'Nilai belum diisi'}
                              {row.usulan ? ` · ${row.usulan}` : ''}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-semibold text-primary-600 dark:text-primary-400">
                            {active ? 'Ubah' : 'Lihat'}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </motion.section>
              )
            })}
          </div>
        )}

        <p className="mt-6 text-sm text-gray-600 dark:text-gray-400">
          Laporan PJGT untuk{' '}
          <span className="font-medium text-gray-900 dark:text-gray-100">{madrasahNama}</span> hanya di bulan{' '}
          <span className="font-medium">Dzulhijjah, Safar, Rabi&apos;ul Akhir, Jumadil Akhir, dan Sya&apos;ban</span>.
          Hanya laporan <span className="font-medium">bulan aktif</span> yang bisa diubah; bulan sebelumnya hanya bisa
          dilihat.
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
