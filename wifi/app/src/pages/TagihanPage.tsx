import { useState } from 'react'
import { type Pelanggan } from '../api/apiClient'
import OffcanvasCariPelanggan from '../components/OffcanvasCariPelanggan'
import OffcanvasTambahTagihan from '../components/OffcanvasTambahTagihan'
import TagihanListWithBayar from '../components/TagihanListWithBayar'
import { usePageTitle } from '../contexts/PageTitleContext'

export default function TagihanPage() {
  usePageTitle('Tagihan')
  const [selected, setSelected] = useState<Pelanggan | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [ok, setOk] = useState('')
  const [listReload, setListReload] = useState(0)

  const pickPelanggan = (p: Pelanggan) => {
    setSelected(p)
    setPickerOpen(false)
    setOk('')
  }

  return (
    <div className="flex flex-col gap-2 min-h-[calc(100dvh-7.5rem)] md:min-h-[calc(100dvh-5rem)] lg:overflow-hidden">
      {ok && <div className="ui-alert-ok shrink-0">{ok}</div>}

      <div className="lg:hidden ui-card p-3 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {selected ? (
              <>
                <div className="text-[15px] font-semibold text-ink truncate">{selected.nama}</div>
                <div className="text-[11px] text-muted mt-0.5">
                  {[selected.no_hp, selected.paket].filter(Boolean).join(' · ') || '—'}
                </div>
                {selected.alamat && (
                  <div className="text-[11px] text-muted mt-0.5 line-clamp-2">{selected.alamat}</div>
                )}
              </>
            ) : (
              <p className="text-[13px] text-muted">Pilih pelanggan untuk melihat tagihan.</p>
            )}
          </div>
          <button
            type="button"
            className="ui-btn-primary text-[12px] px-2.5 py-1.5 shrink-0"
            onClick={() => setPickerOpen(true)}
          >
            Pilih
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 flex-1 min-h-0 lg:overflow-hidden">
        <div className="hidden lg:flex flex-col min-h-0">
          <div className="ui-card flex flex-col min-h-0 overflow-hidden h-full">
            <div className="p-3 border-b border-line flex items-center justify-between gap-2">
              <h2 className="text-[14px] font-semibold text-ink">Pelanggan</h2>
              <button
                type="button"
                className="ui-btn-primary text-[12px] px-2.5 py-1.5"
                onClick={() => setPickerOpen(true)}
              >
                Pilih
              </button>
            </div>
            <div className="p-3 flex-1 overflow-auto">
              {selected ? (
                <div className="space-y-2 text-sm">
                  <div className="text-[16px] font-semibold text-ink">{selected.nama}</div>
                  <div className="grid grid-cols-2 gap-2 text-[13px]">
                    <div>
                      <div className="text-[11px] text-muted">No. HP</div>
                      <div className="text-ink">{selected.no_hp || '—'}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted">Paket</div>
                      <div className="text-ink">{selected.paket || '—'}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[11px] text-muted">Alamat</div>
                      <div className="text-ink whitespace-pre-wrap">{selected.alamat || '—'}</div>
                    </div>
                    {selected.keterangan && (
                      <div className="col-span-2">
                        <div className="text-[11px] text-muted">Keterangan</div>
                        <div className="text-ink">{selected.keterangan}</div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-[13px] text-muted">Pilih pelanggan untuk melihat dan membuat tagihan.</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col min-h-0 lg:h-full">
          <div className="ui-card flex flex-col min-h-0 overflow-hidden flex-1">
            <div className="p-3 border-b border-line flex items-center justify-between gap-2 shrink-0">
              <h2 className="text-[14px] font-semibold text-ink">Tagihan</h2>
              <button
                type="button"
                className="ui-btn-primary text-[12px] px-2.5 py-1.5"
                disabled={!selected}
                onClick={() => setCreateOpen(true)}
              >
                + Tagihan
              </button>
            </div>
            <div className="p-3 flex-1 min-h-0 flex flex-col">
              <TagihanListWithBayar
                pelangganId={selected?.id ?? null}
                reloadToken={listReload}
                className="flex-1"
                onChanged={() => setOk('Diperbarui')}
              />
            </div>
          </div>
        </div>
      </div>

      <OffcanvasCariPelanggan
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={pickPelanggan}
      />
      <OffcanvasTambahTagihan
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        targets={selected ? [{ id: selected.id, nama: selected.nama }] : []}
        onCreated={() => {
          setOk('Tagihan dibuat')
          setListReload((n) => n + 1)
        }}
      />
    </div>
  )
}
