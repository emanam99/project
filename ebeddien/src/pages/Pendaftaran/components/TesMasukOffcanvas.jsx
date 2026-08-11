import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useTesMadinForm } from '../hooks/useTesMadinForm'
import TesMadinFormFields from './TesMadinFormFields'
import AktifDiniyahRombelSheet from './AktifDiniyahRombelSheet'
import PendaftaranPrintOffcanvas from '../../../components/Pendaftaran/PendaftaranPrintOffcanvas'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import { patchPendaftarRowFields } from '../../../services/pendaftarListCache'
import { resolveKeputusanMasukTerakhir } from '../print/raporTesMadinUtils'
import { pendaftaranAPI } from '../../../services/api'

const TES_MASUK_OFFCANVAS_STATE = Object.freeze({ ebOffcanvas: 'tes_masuk_detail' })

function getKeteranganStatusBadgeColor(keteranganStatus) {
  if (!keteranganStatus || keteranganStatus === '-') {
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
  }
  switch (keteranganStatus) {
    case 'Belum Bayar':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
    case 'Sudah Diverifikasi':
      return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400'
    case 'Aktif':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
  }
}

function showAktifJalurButton(keterangan) {
  if (!keterangan) return false
  const t = String(keterangan).trim()
  return ['Sudah Diverivikasi', 'Sudah Diverifikasi', 'Aktif'].includes(t)
}

function showVerifikasiButton(keterangan) {
  if (!keterangan) return true
  const sudahVerifikasiAtauAktif = ['Sudah Diverivikasi', 'Sudah Diverifikasi', 'Aktif'].includes(String(keterangan).trim())
  return !sudahVerifikasiAtauAktif
}

export default function TesMasukOffcanvas({
  isOpen,
  onClose,
  pendaftar,
  pendaftarScopeKey,
  tahunHijriyah,
  tahunMasehi,
  onRefreshList,
  canPrint,
  canAktifDiniyah,
  canSimpan,
  canVerifikasi,
  onPendaftarUpdate,
  showNotification,
}) {
  const [showPrintOffcanvas, setShowPrintOffcanvas] = useState(false)
  const [showAktifSheet, setShowAktifSheet] = useState(false)
  const [verifikasiLoading, setVerifikasiLoading] = useState(false)

  const idSantri = pendaftar?.id ?? null
  const {
    form,
    patch,
    loading,
    saving,
    saveMsg,
    saveErr,
    save,
  } = useTesMadinForm(idSantri, tahunHijriyah, tahunMasehi, {
    id_registrasi: pendaftar?.id_registrasi ?? null,
    gelombang_tes: pendaftar?.gelombang_tes,
  })

  const closeWithBack = useOffcanvasBackClose(isOpen && Boolean(pendaftar), onClose, {
    state: TES_MASUK_OFFCANVAS_STATE,
  })

  const handleSave = async () => {
    const ok = await save()
    if (!ok) return
    const gelombangTes = form.gelombang ? String(form.gelombang) : null
    const keputusanMasuk = resolveKeputusanMasukTerakhir(form)
    const patchFields = {
      gelombang_tes: gelombangTes,
      keputusan_masuk: keputusanMasuk,
    }
    if (pendaftarScopeKey && pendaftar?.id_registrasi) {
      await patchPendaftarRowFields(pendaftarScopeKey, pendaftar.id_registrasi, patchFields)
    }
    onPendaftarUpdate?.(patchFields)
    onRefreshList?.()
  }

  const handleVerifikasiClick = async () => {
    if (!pendaftar?.id) return
    setVerifikasiLoading(true)
    try {
      const result = await pendaftaranAPI.updateKeteranganStatus({
        id_santri: pendaftar.id,
        keterangan_status: 'Sudah Diverifikasi',
        tahun_hijriyah: pendaftar.tahun_hijriyah || tahunHijriyah,
        tahun_masehi: pendaftar.tahun_masehi || tahunMasehi,
      })
      if (result?.success) {
        showNotification?.('Status berhasil diverifikasi', 'success')
        onPendaftarUpdate?.({ keterangan_status: 'Sudah Diverifikasi' })
        if (pendaftarScopeKey && pendaftar.id_registrasi) {
          await patchPendaftarRowFields(pendaftarScopeKey, pendaftar.id_registrasi, {
            keterangan_status: 'Sudah Diverifikasi',
          })
        }
        onRefreshList?.()
      } else {
        showNotification?.(result?.message || 'Gagal verifikasi', 'error')
      }
    } catch (err) {
      showNotification?.(err?.response?.data?.message || 'Gagal verifikasi', 'error')
    } finally {
      setVerifikasiLoading(false)
    }
  }

  const santriIdForPrint = pendaftar?.id != null
    ? String(pendaftar.id).padStart(7, '0')
    : ''

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      <AnimatePresence>
        {isOpen && pendaftar && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-[9998]"
              onClick={closeWithBack}
              aria-hidden="true"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-xl bg-white dark:bg-gray-800 shadow-xl z-[9999] flex flex-col"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Tes Masuk Madin
                </h3>
                <button
                  type="button"
                  onClick={closeWithBack}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400"
                  aria-label="Tutup"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-b border-gray-200 dark:border-gray-700 pb-4">
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">NIS</dt>
                    <dd className="mt-0.5 font-mono text-gray-900 dark:text-gray-100">
                      {pendaftar.nis ?? pendaftar.id ?? '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Nama</dt>
                    <dd className="mt-0.5 font-medium text-gray-900 dark:text-gray-100">{pendaftar.nama || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">NIK</dt>
                    <dd className="mt-0.5 text-gray-700 dark:text-gray-300">{pendaftar.nik || '-'}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Alamat</dt>
                    <dd className="mt-0.5 text-gray-700 dark:text-gray-300">{pendaftar.alamat || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Formal</dt>
                    <dd className="mt-0.5 text-gray-700 dark:text-gray-300">
                      {pendaftar.daftar_formal ?? pendaftar.formal ?? '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Diniyah</dt>
                    <dd className="mt-0.5 text-gray-700 dark:text-gray-300">
                      {pendaftar.daftar_diniyah ?? pendaftar.diniyah ?? '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status Pendaftar</dt>
                    <dd className="mt-0.5 text-gray-700 dark:text-gray-300">{pendaftar.status_pendaftar || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Gelombang Pendaftaran</dt>
                    <dd className="mt-0.5 text-gray-700 dark:text-gray-300">{pendaftar.gelombang ?? '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Gelombang Tes</dt>
                    <dd className="mt-0.5 text-gray-700 dark:text-gray-300">
                      {form.gelombang || pendaftar.gelombang_tes || '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Keterangan Status</dt>
                    <dd className="mt-1">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getKeteranganStatusBadgeColor(pendaftar.keterangan_status)}`}>
                        {pendaftar.keterangan_status || '-'}
                      </span>
                    </dd>
                  </div>
                </dl>

                <TesMadinFormFields
                  form={form}
                  patch={patch}
                  loading={loading}
                  saving={saving}
                  saveMsg={saveMsg}
                  saveErr={saveErr}
                  showSaveButton={false}
                />
              </div>

              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-2 shrink-0">
                {canSimpan && (
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || loading}
                    className="flex-1 min-w-[120px] inline-flex justify-center items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                  >
                    {saving ? 'Menyimpan…' : 'Simpan'}
                  </button>
                )}
                {canPrint && (
                  <button
                    type="button"
                    onClick={() => setShowPrintOffcanvas(true)}
                    className="flex-1 min-w-[120px] inline-flex justify-center items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg"
                  >
                    Print Rapor
                  </button>
                )}
                {canVerifikasi && showVerifikasiButton(pendaftar.keterangan_status) && (
                  <button
                    type="button"
                    onClick={handleVerifikasiClick}
                    disabled={verifikasiLoading}
                    className="flex-1 min-w-[120px] inline-flex justify-center items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                  >
                    {verifikasiLoading ? 'Memverifikasi…' : 'Verifikasi'}
                  </button>
                )}
                {canAktifDiniyah && showAktifJalurButton(pendaftar.keterangan_status) && (
                  <button
                    type="button"
                    onClick={() => setShowAktifSheet(true)}
                    className="flex-1 min-w-[120px] inline-flex justify-center items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg"
                  >
                    Aktif Diniyah
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <PendaftaranPrintOffcanvas
        isOpen={showPrintOffcanvas}
        onClose={() => setShowPrintOffcanvas(false)}
        santriId={santriIdForPrint}
        tahunHijriyah={tahunHijriyah}
        tahunMasehi={tahunMasehi}
        stackOnTop
        forcePrintSections={{
          printKwitansi: false,
          printBiodataForm: false,
          printRaporTes: true,
          printSuratKapdar: false,
          printPaktaIntegritas: false,
        }}
      />

      <AktifDiniyahRombelSheet
        isOpen={showAktifSheet}
        onClose={() => setShowAktifSheet(false)}
        pendaftar={pendaftar}
        tahunHijriyah={tahunHijriyah}
        tahunMasehi={tahunMasehi}
        onSuccess={() => {
          onRefreshList?.()
          setShowAktifSheet(false)
        }}
      />
    </>,
    document.body
  )
}
