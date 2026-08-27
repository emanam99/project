import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { importPelangganBatch } from '../api/apiClient'
import { usePageTitle } from '../contexts/PageTitleContext'
import {
  downloadPelangganTemplate,
  parsePelangganImportFile,
  pelangganImportPayloads,
  type PelangganImportRow,
} from '../utils/pelangganImportXlsx'

export default function PelangganImportPage() {
  usePageTitle('Import pelanggan')
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<PelangganImportRow[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)

  const stats = useMemo(() => {
    const valid = rows.filter((r) => r.ok).length
    return { total: rows.length, valid, invalid: rows.length - valid }
  }, [rows])

  const onPickFile = async (file: File | null) => {
    setError('')
    setOk('')
    setRows([])
    setFileName('')
    if (!file) return
    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      setError('File harus berformat .xlsx atau .xls')
      return
    }
    setParsing(true)
    setFileName(file.name)
    try {
      const parsed = await parsePelangganImportFile(file)
      if (parsed.length === 0) {
        setError('Tidak ada baris data di file (selain header)')
      } else {
        setRows(parsed)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membaca Excel')
    } finally {
      setParsing(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const onSave = async () => {
    const items = pelangganImportPayloads(rows)
    if (items.length === 0) {
      setError('Tidak ada baris valid untuk disimpan')
      return
    }
    setSaving(true)
    setError('')
    setOk('')
    const res = await importPelangganBatch(items)
    setSaving(false)
    const created = res.created ?? (Array.isArray(res.data) ? res.data.length : 0)
    const failed = res.failed ?? []
    if (created > 0) {
      setOk(
        failed.length > 0
          ? `${created} pelanggan disimpan, ${failed.length} gagal di server`
          : `${created} pelanggan berhasil diimpor`,
      )
      window.setTimeout(() => navigate('/pelanggan', { replace: true }), 900)
    } else {
      setError(res.message || 'Gagal menyimpan impor')
      if (failed.length > 0) {
        setRows((prev) => {
          const validIdx = prev.map((r, i) => (r.ok ? i : -1)).filter((i) => i >= 0)
          const next = prev.map((r) => ({ ...r, errors: [...r.errors] }))
          for (const f of failed) {
            const localPos = f.index
            const rowIdx = validIdx[localPos]
            if (rowIdx === undefined) continue
            next[rowIdx] = {
              ...next[rowIdx],
              ok: false,
              errors: [...next[rowIdx].errors, f.message],
            }
          }
          return next
        })
      }
    }
  }

  return (
    <div className="space-y-3.5">
      <div className="ui-card p-3 sm:p-3.5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-ink leading-tight">Import Excel</h2>
            <p className="text-[11px] text-muted mt-0.5">
              Unduh template, isi data, lalu unggah untuk divalidasi sebelum disimpan
            </p>
          </div>
          <button
            type="button"
            className="ui-btn-ghost text-[12px] shrink-0"
            onClick={() => navigate('/pelanggan')}
          >
            ← Kembali
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="ui-btn-ghost text-[12px]"
            onClick={() => void downloadPelangganTemplate()}
          >
            Unduh template
          </button>
          <button
            type="button"
            className="ui-btn-primary text-[12px]"
            disabled={parsing}
            onClick={() => inputRef.current?.click()}
          >
            {parsing ? 'Membaca…' : 'Pilih file Excel'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {fileName && (
          <p className="text-[12px] text-muted truncate">
            File: <span className="font-medium text-ink">{fileName}</span>
          </p>
        )}
      </div>

      {error && <div className="ui-alert-error">{error}</div>}
      {ok && <div className="ui-alert-ok">{ok}</div>}

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="ui-card px-2.5 py-2 text-center">
              <div className="text-[15px] font-semibold tabular-nums text-ink">{stats.total}</div>
              <div className="text-[10px] text-muted">Baris</div>
            </div>
            <div className="ui-card px-2.5 py-2 text-center">
              <div className="text-[15px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                {stats.valid}
              </div>
              <div className="text-[10px] text-muted">Valid</div>
            </div>
            <div className="ui-card px-2.5 py-2 text-center">
              <div className="text-[15px] font-semibold tabular-nums text-[var(--danger)]">
                {stats.invalid}
              </div>
              <div className="text-[10px] text-muted">Error</div>
            </div>
          </div>

          <div className="ui-card overflow-x-auto">
            <table className="w-full text-left text-[12px] min-w-[40rem]">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="px-2 py-2 font-semibold w-10">#</th>
                  <th className="px-2 py-2 font-semibold">Nama</th>
                  <th className="px-2 py-2 font-semibold">Email</th>
                  <th className="px-2 py-2 font-semibold">No HP</th>
                  <th className="px-2 py-2 font-semibold">Paket</th>
                  <th className="px-2 py-2 font-semibold">Aktif</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.rowNumber}
                    className={[
                      'border-b border-line/70 last:border-0 align-top',
                      row.ok
                        ? ''
                        : 'bg-[color-mix(in_srgb,var(--danger)_6%,transparent)]',
                    ].join(' ')}
                  >
                    <td className="px-2 py-2 text-muted tabular-nums">{row.rowNumber}</td>
                    <td className="px-2 py-2 text-ink font-medium">{row.nama || '—'}</td>
                    <td className="px-2 py-2 text-muted truncate max-w-[10rem]">
                      {row.email || '—'}
                    </td>
                    <td className="px-2 py-2 text-muted">{row.no_hp || '—'}</td>
                    <td className="px-2 py-2 text-muted">{row.paket || '—'}</td>
                    <td className="px-2 py-2">{row.aktif === false ? 'Nonaktif' : 'Aktif'}</td>
                    <td className="px-2 py-2">
                      {row.ok ? (
                        <span className="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                          OK
                        </span>
                      ) : (
                        <div className="space-y-0.5">
                          <span className="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)]">
                            Error
                          </span>
                          <ul className="text-[11px] text-[var(--danger)] list-disc pl-3">
                            {row.errors.map((msg) => (
                              <li key={msg}>{msg}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
            <p className="text-[12px] text-muted">
              Hanya baris berstatus OK yang akan disimpan.
            </p>
            <button
              type="button"
              className="ui-btn-primary text-[13px]"
              disabled={saving || stats.valid === 0}
              onClick={() => void onSave()}
            >
              {saving ? 'Menyimpan…' : `Simpan ${stats.valid} pelanggan`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
