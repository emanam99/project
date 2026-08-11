import PickDateHijri from '../../../components/PickDateHijri/PickDateHijri'
import { sanitizeGelombangTesInput } from '../print/raporTesMadinUtils'

const T1_OPSI = [
  { id: 'istidadiyah', label: "Program Isti'dadiyah" },
  { id: 'lanjut_t2', label: 'Lanjut Tahap 2' }
]

const T2_KELAS_OPSI = [
  { id: '4', label: '4' },
  { id: '5', label: '5' },
  { id: '6', label: '6' }
]

const T3_KELAS_OPSI = [
  { id: '1', label: '1' },
  { id: '2', label: '2' }
]

const T4_OPSI = [
  { id: '3_wustha', label: '3 Wustha' },
  { id: '1_ulya', label: '1 Ulya' }
]

const selectClass =
  'px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs w-full'

export default function TesMadinFormFields({ form, patch, loading, saving, saveMsg, saveErr, onSave, showSaveButton = true }) {
  return (
    <div className="space-y-3 text-xs">
      {(showSaveButton || loading || saveMsg || saveErr) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold text-teal-800 dark:text-teal-300">Isi nilai tes madin</div>
          <div className="flex items-center gap-2">
            {loading && <span className="text-gray-500">Memuat…</span>}
            {saveMsg && <span className="text-green-700 dark:text-green-400">{saveMsg}</span>}
            {saveErr && <span className="text-red-600 dark:text-red-400">{saveErr}</span>}
            {showSaveButton && onSave ? (
              <button
                type="button"
                onClick={onSave}
                disabled={saving || loading}
                className="px-3 py-1.5 rounded-md bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 disabled:opacity-50"
              >
                {saving ? 'Menyimpan…' : 'Simpan'}
              </button>
            ) : null}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-0.5">
          <span className="text-gray-600 dark:text-gray-400">Gelombang tes</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className={selectClass}
            value={form.gelombang || ''}
            onChange={(e) => patch({ gelombang: sanitizeGelombangTesInput(e.target.value) })}
            placeholder="Angka gelombang"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-gray-600 dark:text-gray-400">Tanggal tes (Hijriyah)</span>
          <PickDateHijri
            value={form.tanggalTesHijriyah || null}
            onChange={(ymd) => patch({ tanggalTesHijriyah: ymd || '' })}
            placeholder="Pilih tanggal tes"
            className="w-full"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-gray-600 dark:text-gray-400">Tanggal surat (Hijriyah)</span>
          <PickDateHijri
            value={form.tanggalSuratHijriyah || null}
            onChange={(ymd) => patch({ tanggalSuratHijriyah: ymd || '' })}
            placeholder="Hari ini (Hijriyah)"
            className="w-full"
          />
        </label>
      </div>

      <div className="border-t border-teal-200/60 dark:border-teal-700 pt-2 space-y-2">
        <div className="font-medium text-teal-700 dark:text-teal-400">Tahap 1</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <label className="flex flex-col gap-0.5">
            <span>Membaca Arab Pegon</span>
            <input className={selectClass} value={form.t1_membaca} onChange={(e) => patch({ t1_membaca: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Menulis Arab Pegon</span>
            <input className={selectClass} value={form.t1_menulis} onChange={(e) => patch({ t1_menulis: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Jumlah</span>
            <input className={selectClass} value={form.t1_jumlah} onChange={(e) => patch({ t1_jumlah: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Keputusan masuk</span>
            <select className={selectClass} value={form.t1_keputusan} onChange={(e) => patch({ t1_keputusan: e.target.value })}>
              <option value="">— Pilih —</option>
              {T1_OPSI.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="border-t border-teal-200/60 dark:border-teal-700 pt-2 space-y-2">
        <div className="font-medium text-teal-700 dark:text-teal-400">Tahap 2</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <label className="flex flex-col gap-0.5 sm:col-span-2">
            <span>Kitab / Lafadz &amp; Makna</span>
            <input className={selectClass} value={form.t2_kitab} onChange={(e) => patch({ t2_kitab: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Nahwu &amp; Sharaf (5)</span>
            <input className={selectClass} value={form.t2_ns5} onChange={(e) => patch({ t2_ns5: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Nahwu &amp; Sharaf (6)</span>
            <input className={selectClass} value={form.t2_ns6} onChange={(e) => patch({ t2_ns6: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Jumlah nilai</span>
            <input className={selectClass} value={form.t2_jumlah} onChange={(e) => patch({ t2_jumlah: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Masuk Ula, Kelas</span>
            <select className={selectClass} value={form.t2_keputusan_kelas} onChange={(e) => patch({ t2_keputusan_kelas: e.target.value })}>
              <option value="">— Pilih kelas —</option>
              {T2_KELAS_OPSI.map((o) => (
                <option key={o.id} value={o.id}>Kelas {o.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 justify-end">
            <span className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.t2_lanjut_t3} onChange={(e) => patch({ t2_lanjut_t3: e.target.checked })} />
              Lanjut Tahap 3
            </span>
          </label>
        </div>
      </div>

      <div className="border-t border-teal-200/60 dark:border-teal-700 pt-2 space-y-2">
        <div className="font-medium text-teal-700 dark:text-teal-400">Tahap 3</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <label className="flex flex-col gap-0.5">
            <span>Baca Kitab &amp; Pemahaman</span>
            <input className={selectClass} value={form.t3_baca} onChange={(e) => patch({ t3_baca: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Nahwu</span>
            <input className={selectClass} value={form.t3_nahwu} onChange={(e) => patch({ t3_nahwu: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Sharaf</span>
            <input className={selectClass} value={form.t3_sharaf} onChange={(e) => patch({ t3_sharaf: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Jumlah nilai</span>
            <input className={selectClass} value={form.t3_jumlah} onChange={(e) => patch({ t3_jumlah: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Masuk Wustha, Kelas</span>
            <select className={selectClass} value={form.t3_keputusan_kelas} onChange={(e) => patch({ t3_keputusan_kelas: e.target.value })}>
              <option value="">— Pilih kelas —</option>
              {T3_KELAS_OPSI.map((o) => (
                <option key={o.id} value={o.id}>Kelas {o.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 justify-end">
            <span className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.t3_lanjut_t4} onChange={(e) => patch({ t3_lanjut_t4: e.target.checked })} />
              Lanjut Tahap 4
            </span>
          </label>
        </div>
      </div>

      <div className="border-t border-teal-200/60 dark:border-teal-700 pt-2 space-y-2">
        <div className="font-medium text-teal-700 dark:text-teal-400">Tahap 4</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <label className="flex flex-col gap-0.5 sm:col-span-2">
            <span>Baca Kitab &amp; Pemahaman</span>
            <input className={selectClass} value={form.t4_baca} onChange={(e) => patch({ t4_baca: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Fiqih</span>
            <input className={selectClass} value={form.t4_fiqih} onChange={(e) => patch({ t4_fiqih: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Nahwu</span>
            <input className={selectClass} value={form.t4_nahwu} onChange={(e) => patch({ t4_nahwu: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Balaghah</span>
            <input className={selectClass} value={form.t4_balaghah} onChange={(e) => patch({ t4_balaghah: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Jumlah nilai</span>
            <input className={selectClass} value={form.t4_jumlah} onChange={(e) => patch({ t4_jumlah: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Keputusan masuk kelas</span>
            <select className={selectClass} value={form.t4_keputusan} onChange={(e) => patch({ t4_keputusan: e.target.value })}>
              <option value="">— Pilih —</option>
              {T4_OPSI.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="border-t border-teal-200/60 dark:border-teal-700 pt-2">
        <label className="flex flex-col gap-0.5 max-w-xs">
          <span>Nama Ketua Panitia</span>
          <input className={selectClass} value={form.namaKetua} onChange={(e) => patch({ namaKetua: e.target.value })} />
        </label>
      </div>
    </div>
  )
}

export { T1_OPSI, T2_KELAS_OPSI, T3_KELAS_OPSI, T4_OPSI }
