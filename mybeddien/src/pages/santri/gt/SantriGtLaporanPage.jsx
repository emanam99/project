import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { laporanGtMybeddianAPI } from '../../../services/api'
import { useSantriIds, useSantriBiodata } from '../../../hooks/useSantriCachedResources'
import { isSantriGuruTugas } from '../../../utils/santriGuruTugas'
import { getBulanName } from '../../../utils/bulanHijriLatin'
import { isUgtLaporanBulanAktif } from '../../../utils/ugtLaporanBulanAktif'
import {
  getUgtLaporanBulanPhase,
  UGT_LAPORAN_BULAN_PJGT_GT,
} from '../../../utils/ugtLaporanBulanAllowed'
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
  const laporanByBulan = useMemo(() => {
    const grouped = new Map(UGT_LAPORAN_BULAN_PJGT_GT.map((bulan) => [bulan, []]))
    for (const row of Array.isArray(list) ? list : []) {
      const bulan = Number(row?.bulan)
      if (grouped.has(bulan)) grouped.get(bulan).push(row)
    }
    return grouped
  }, [list])
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
              const row = rows[0] || null
              const active = phase === 'active'
              const future = phase === 'future'
              return (
                <motion.section
                  key={bulan}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.03 * index }}
                  className={`rounded-xl border bg-white px-4 py-3 shadow-sm dark:bg-gray-800 ${
                    active
                      ? 'border-primary-300 ring-1 ring-primary-200 dark:border-primary-700 dark:ring-primary-900'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
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
                      <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                        {row
                          ? [row.madrasah_nama, row.wali_kelas].filter(Boolean).join(' · ') || 'Laporan tersimpan'
                          : future
                            ? 'Laporan belum dapat dibuat'
                            : active
                              ? 'Belum ada laporan'
                              : 'Tidak ada laporan'}
                      </p>
                    </div>

                    {active && !row ? (
                      <button
                        type="button"
                        onClick={openBaru}
                        disabled={!tahunAjaranAktif}
                        className="shrink-0 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                      >
                        Buat laporan
                      </button>
                    ) : row ? (
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="shrink-0 rounded-lg border border-primary-200 px-3 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-50 dark:border-primary-800 dark:text-primary-300 dark:hover:bg-primary-900/20"
                      >
                        {active ? 'Ubah' : 'Lihat'}
                      </button>
                    ) : future ? (
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500" title="Belum dibuka">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </span>
                    ) : null}
                  </div>
                </motion.section>
              )
            })}
          </div>
        )}

        <p className="mt-6 text-sm text-gray-600 dark:text-gray-400">
          Laporan Guru Tugas
          {madrasahNama ? (
            <>
              {' '}
              di <span className="font-medium text-gray-900 dark:text-gray-100">{madrasahNama}</span>
            </>
          ) : null}{' '}
          hanya di bulan{' '}
          <span className="font-medium">Dzulhijjah, Safar, Rabi&apos;ul Akhir, Jumadil Akhir, dan Sya&apos;ban</span>.
          Hanya laporan <span className="font-medium">bulan aktif</span> yang bisa diubah; bulan sebelumnya hanya bisa
          dilihat.
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
