import { getBulanName } from '../../Kalender/utils/bulanHijri'

const readOnlyCls =
  'w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-900/40 text-gray-800 dark:text-gray-200 text-sm'

/**
 * Field madrasah, santri (guru tugas), tahun ajaran & bulan otomatis — dipakai form laporan UGT.
 */
export default function UgtLaporanFormCoreFields({
  isEdit,
  form,
  setForm,
  madrasahList,
  konteks,
  selectCls,
  taOptions = []
}) {
  const {
    konteksLoading,
    gtSantriCandidates,
    gtSantriLoading,
    santriPickManual,
    setSantriPickManual,
    pickSantri,
    santriOptions,
    santriOpen,
    setSantriOpen,
    santriLoading,
    onSantriSearchChange,
    formatSantriGtLabel
  } = konteks

  const taKey = (form.id_tahun_ajaran && String(form.id_tahun_ajaran).trim()) || ''
  const taOpt = taOptions.find((o) => o.value === taKey)
  const taLabelTampil = taOpt?.label || taKey || '—'

  const handleMadrasahChange = (e) => {
    const v = e.target.value
    setForm((p) => ({
      ...p,
      id_madrasah: v,
      id_santri: '',
      santriLabel: '',
      santriSearch: ''
    }))
    setSantriPickManual(false)
  }

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Madrasah</label>
        {isEdit ? (
          <div className={readOnlyCls}>
            {(madrasahList || []).find((m) => String(m.id) === String(form.id_madrasah))?.nama ||
              `ID ${form.id_madrasah}`}
          </div>
        ) : (
          <select
            value={form.id_madrasah}
            onChange={handleMadrasahChange}
            required
            className={selectCls}
          >
            <option value="">— Pilih madrasah —</option>
            {(madrasahList || []).map((m) => (
              <option key={m.id} value={String(m.id)}>
                {m.nama || `ID ${m.id}`}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="relative">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Santri (Guru Tugas)</label>
        {!isEdit && taKey && form.id_madrasah ? (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5">
            Daftar pilihan: guru tugas dengan penugasan{' '}
            <span className="font-medium text-emerald-700 dark:text-emerald-400">aktif</span> untuk tahun ajaran{' '}
            <span className="font-medium">{taKey}</span>.
          </p>
        ) : null}
        {!isEdit && !form.id_madrasah ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Pilih madrasah terlebih dahulu.</p>
        ) : null}
        {!isEdit && form.id_madrasah && gtSantriLoading ? (
          <div className={`${readOnlyCls} animate-pulse text-gray-400`}>Memuat penugasan guru tugas…</div>
        ) : isEdit && form.id_santri ? (
          <div className={readOnlyCls}>{form.santriLabel || `ID ${form.id_santri}`}</div>
        ) : !isEdit &&
          form.id_madrasah &&
          ((gtSantriCandidates.length >= 2 && (!form.id_santri || santriPickManual)) ||
            (gtSantriCandidates.length === 1 && santriPickManual && !form.id_santri)) ? (
          <>
            <select
              value={form.id_santri || ''}
              onChange={(e) => {
                const s = gtSantriCandidates.find((x) => String(x.id) === e.target.value)
                if (s) pickSantri(s)
              }}
              className={selectCls}
            >
              <option value="">— Pilih guru tugas —</option>
              {gtSantriCandidates.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {formatSantriGtLabel(s)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {gtSantriCandidates.length} guru tugas aktif untuk tahun ajaran {taKey || '—'}.
            </p>
          </>
        ) : !isEdit && gtSantriCandidates.length === 1 && form.id_santri && !santriPickManual ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-900/40">
              {form.santriLabel || formatSantriGtLabel(gtSantriCandidates[0])}
            </span>
            <button
              type="button"
              className="text-sm text-teal-600 dark:text-teal-400 shrink-0"
              onClick={() => {
                setSantriPickManual(true)
                setForm((p) => ({ ...p, id_santri: '', santriLabel: '', santriSearch: '' }))
              }}
            >
              Ubah
            </button>
          </div>
        ) : form.id_santri && !santriPickManual ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-900/40">
              {form.santriLabel || `ID ${form.id_santri}`}
            </span>
            <button
              type="button"
              className="text-sm text-teal-600 dark:text-teal-400 shrink-0"
              onClick={() => {
                setSantriPickManual(true)
                setForm((p) => ({ ...p, id_santri: '', santriLabel: '', santriSearch: '' }))
              }}
            >
              Ubah
            </button>
          </div>
        ) : (
          <>
            {!isEdit && form.id_madrasah && gtSantriCandidates.length === 0 && !gtSantriLoading ? (
              <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                Belum ada penugasan guru tugas <span className="font-medium">aktif</span> untuk tahun ajaran{' '}
                {taKey || 'ini'}. Cari santri manual di bawah bila perlu.
              </p>
            ) : null}
            <input
              type="text"
              value={form.santriSearch}
              onChange={(e) => onSantriSearchChange(e.target.value)}
              onFocus={() => setSantriOpen(true)}
              placeholder="Cari nama atau NIS..."
              disabled={!isEdit && !form.id_madrasah}
              className={selectCls}
              autoComplete="off"
            />
            {santriOpen && (form.santriSearch.trim().length > 0 || santriOptions.length > 0) && (
              <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg z-10">
                {santriLoading && <div className="px-3 py-2 text-xs text-gray-500">Mencari...</div>}
                {!santriLoading && santriOptions.length === 0 && form.santriSearch.trim().length > 0 && (
                  <div className="px-3 py-2 text-xs text-gray-500">Tidak ada hasil</div>
                )}
                {santriOptions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
                    onClick={() => pickSantri(s)}
                  >
                    {s.nama || '—'}{' '}
                    {s.nis != null && s.nis !== '' ? (
                      <span className="text-gray-500">(NIS {s.nis})</span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className={isEdit ? 'space-y-4' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Tahun ajaran (Hijriyah)
          </label>
          {!isEdit && konteksLoading ? (
            <div className={`${readOnlyCls} animate-pulse text-gray-400`}>Memuat dari database…</div>
          ) : isEdit ? (
            <select
              value={form.id_tahun_ajaran}
              onChange={(e) => setForm((p) => ({ ...p, id_tahun_ajaran: e.target.value }))}
              required
              className={selectCls}
            >
              <option value="">— Pilih —</option>
              {taOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <div className={readOnlyCls} title="Diisi otomatis dari rentang tanggal master tahun ajaran">
              {taLabelTampil}
            </div>
          )}
          {!isEdit ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Mengikuti tanggal hari ini dan rentang &quot;dari–sampai&quot; pada master tahun ajaran hijriyah.
            </p>
          ) : null}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bulan (Hijriyah)</label>
          {!isEdit && konteksLoading ? (
            <div className={`${readOnlyCls} animate-pulse text-gray-400`}>Memuat dari database…</div>
          ) : isEdit ? (
            <select
              value={form.bulan}
              onChange={(e) => setForm((p) => ({ ...p, bulan: Number(e.target.value) }))}
              required
              className={selectCls}
            >
              {Array.from({ length: 12 }, (_, i) => {
                const n = i + 1
                return (
                  <option key={n} value={n}>
                    {n} — {getBulanName(n, 'hijriyah')}
                  </option>
                )
              })}
            </select>
          ) : (
            <div className={readOnlyCls} title="Diisi otomatis dari kalender penanggalan">
              {form.bulan >= 1 && form.bulan <= 12
                ? `${form.bulan} — ${getBulanName(form.bulan, 'hijriyah')}`
                : '—'}
            </div>
          )}
          {!isEdit ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Bulan Hijriyah saat ini menurut data kalender di server.
            </p>
          ) : null}
        </div>
      </div>
    </>
  )
}
