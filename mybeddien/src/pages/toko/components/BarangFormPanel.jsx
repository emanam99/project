const inputCls =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white'
const labelCls = 'mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300'

export default function BarangFormPanel({
  editing,
  form,
  onFormChange,
  saving,
  deletingId,
  onSubmit,
  onDelete,
  onCancel,
  showCancel = true,
}) {
  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain">
        <div>
          <label className={labelCls}>Nama barang</label>
          <input
            type="text"
            value={form.nama_barang}
            onChange={(e) => onFormChange({ nama_barang: e.target.value })}
            placeholder="Contoh: Nasi Goreng"
            className={inputCls}
            required
          />
        </div>
        <div>
          <label className={labelCls}>Kode / QR / Barcode {editing ? '' : '(opsional)'}</label>
          <input
            type="text"
            value={form.kode_barang}
            onChange={(e) => onFormChange({ kode_barang: e.target.value })}
            placeholder={editing ? 'Kode barang' : 'Kosongkan untuk kode otomatis (B0001, B0002, …)'}
            className={`${inputCls} font-mono`}
            required={!!editing}
          />
          {!editing && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Isi manual atau scan di atas; kosongkan agar sistem buat kode otomatis.
            </p>
          )}
        </div>
        <div>
          <label className={labelCls}>Harga (Rp)</label>
          <input
            type="number"
            min="0"
            step="1"
            value={form.harga}
            onChange={(e) => onFormChange({ harga: e.target.value })}
            placeholder="0"
            className={inputCls}
            required
          />
        </div>
        {!editing && (
          <div>
            <label className={labelCls}>Stok awal</label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.stok_awal}
              onChange={(e) => onFormChange({ stok_awal: e.target.value })}
              placeholder="0"
              className={inputCls}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Kosongkan atau isi 0 jika belum ada stok.
            </p>
          </div>
        )}
        <div>
          <label className={labelCls}>Keterangan (opsional)</label>
          <input
            type="text"
            value={form.keterangan}
            onChange={(e) => onFormChange({ keterangan: e.target.value })}
            placeholder="Opsional"
            className={inputCls}
          />
        </div>
      </div>

      <div className="mt-4 flex shrink-0 gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
        {showCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Batal
          </button>
        )}
        {editing && (
          <button
            type="button"
            onClick={() => onDelete(editing.id)}
            disabled={saving || deletingId === editing.id}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-300 px-4 py-2.5 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            {deletingId === editing.id ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
            ) : (
              <>
                <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                <span>Hapus</span>
              </>
            )}
          </button>
        )}
        <button
          type="submit"
          disabled={saving || deletingId === editing?.id}
          className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? 'Menyimpan...' : editing ? 'Simpan' : 'Tambah'}
        </button>
      </div>
    </form>
  )
}
