import { motion, AnimatePresence } from 'framer-motion'

const field = (label, value) => (
  <div key={label} className="min-w-0">
    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</dt>
    <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100 break-words">{value ?? '-'}</dd>
  </div>
)

function formatAlamat(row) {
  if (!row) return '-'
  const parts = [
    row.dusun,
    [row.rt, row.rw].filter(Boolean).length ? `RT ${row.rt || '-'} / RW ${row.rw || '-'}` : null,
    row.desa,
    row.kecamatan,
    row.kabupaten,
    row.provinsi,
    row.kode_pos,
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : '-'
}

export default function DetailAlumniOffcanvas({
  isOpen,
  onClose,
  alumni,
  canEdit,
  canDelete,
  canToggleStatus,
  statusBusy,
  deleteBusy,
  onEdit,
  onDelete,
  onToggleStatus,
}) {
  if (!isOpen || !alumni) return null

  const isWafat = alumni.status === 'wafat'
  const genderLabel =
    alumni.gender === 'L' || alumni.gender === 'l' || String(alumni.gender).toLowerCase() === 'laki-laki'
      ? 'Laki-laki'
      : alumni.gender === 'P' || alumni.gender === 'p' || String(alumni.gender).toLowerCase() === 'perempuan'
        ? 'Perempuan'
        : alumni.gender || '-'

  return (
    <AnimatePresence>
      <motion.div
        key="detail-alumni-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[9998]"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        key="detail-alumni-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.25 }}
        className="fixed top-0 right-0 bottom-0 w-full max-w-lg bg-white dark:bg-gray-800 shadow-xl z-[9999] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="min-w-0 pr-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
              {alumni.nama || 'Detail Alumni'}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">
              ID {alumni.id_alumni || '-'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400"
            aria-label="Tutup"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                isWafat
                  ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
              }`}
            >
              {isWafat ? 'Wafat' : 'Hidup'}
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-teal-50 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300">
              {genderLabel}
            </span>
          </div>

          <section>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-1 border-b border-gray-200 dark:border-gray-600">
              Identitas
            </h4>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {field('NIK', alumni.nik)}
              {field('Nomor HP', alumni.nomor_hp)}
              {field('Tempat Lahir', alumni.tempat_lahir)}
              {field('Tanggal Lahir', alumni.tanggal_lahir)}
              {field('Ayah', alumni.ayah)}
              {field('Ibu', alumni.ibu)}
            </dl>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-1 border-b border-gray-200 dark:border-gray-600">
              Alamat
            </h4>
            <dl className="grid grid-cols-1 gap-3">
              {field('Alamat lengkap', formatAlamat(alumni))}
            </dl>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-1 border-b border-gray-200 dark:border-gray-600">
              Riwayat pondok
            </h4>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {field(
                'Tahun masuk',
                alumni.tahun_masuk_masehi
                  ? `${alumni.tahun_masuk_masehi}${alumni.tahun_masuk_hijriyah ? ` M / ${alumni.tahun_masuk_hijriyah} H` : ' M'}`
                  : null
              )}
              {field(
                'Tahun boyong',
                alumni.tahun_boyong_masehi
                  ? `${alumni.tahun_boyong_masehi}${alumni.tahun_boyong_hijriyah ? ` M / ${alumni.tahun_boyong_hijriyah} H` : ' M'}`
                  : null
              )}
              {field('ID Santri', alumni.id_santri)}
              {field('Dibuat', alumni.tanggal_dibuat)}
              {field('Diupdate', alumni.tanggal_update)}
            </dl>
          </section>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col gap-2 flex-shrink-0">
          {canToggleStatus ? (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Status hidup</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {isWafat ? 'Saat ini: Wafat' : 'Saat ini: Hidup'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!isWafat}
                disabled={statusBusy}
                onClick={() => onToggleStatus?.(isWafat ? 'hidup' : 'wafat')}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500/50 disabled:opacity-50 ${
                  isWafat ? 'bg-slate-400 dark:bg-slate-600' : 'bg-emerald-500'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                    isWafat ? 'translate-x-1' : 'translate-x-6'
                  }`}
                />
              </button>
            </div>
          ) : null}

          {canEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </button>
          ) : null}

          {canDelete ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleteBusy}
              className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-300 font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {deleteBusy ? 'Menghapus…' : 'Hapus'}
            </button>
          ) : null}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
