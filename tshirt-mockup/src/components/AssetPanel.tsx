import type { ChangeEvent } from 'react'
import { useMockupStore } from '../store/useMockupStore'

export default function AssetPanel() {
  const leftTab = useMockupStore((s) => s.leftTab)
  const assets = useMockupStore((s) => s.assets)
  const addAsset = useMockupStore((s) => s.addAsset)
  const enqueueLogo = useMockupStore((s) => s.enqueueLogo)
  const enqueueShape = useMockupStore((s) => s.enqueueShape)

  const onUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    addAsset(file)
  }

  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-[#ececef] bg-white">
      {leftTab === 'upload' && (
        <>
          <div className="p-3">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#d9d9e3] bg-[#fafafa] px-3 py-8 text-center hover:border-[#6E56F8] hover:bg-[#f7f5ff]">
              <span className="text-lg leading-none text-[#6E56F8]">↑</span>
              <span className="mt-2 text-[13px] font-medium text-[#3f3f46]">JPG, PNG, SVG</span>
              <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 overflow-y-auto px-3 pb-3">
            {assets.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.name}
                onClick={() => enqueueLogo(item.url)}
                className="aspect-square overflow-hidden rounded-lg border border-[#eee] bg-[#f7f7f8] p-2 hover:border-[#6E56F8]"
              >
                <img src={item.url} alt="" className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
          <div className="mt-auto border-t border-[#ececef] px-3 py-2 text-[11px] text-[#8b8b93]">
            {assets.length} / 10000 Terunggah
          </div>
        </>
      )}

      {leftTab === 'elements' && (
        <div className="space-y-2 p-3">
          <p className="text-xs text-[#8b8b93]">Tambah bentuk ke pola</p>
          <button
            type="button"
            onClick={() => enqueueShape('rect')}
            className="w-full rounded-lg border border-[#ececef] px-3 py-2 text-left text-sm hover:bg-neutral-50"
          >
            Persegi
          </button>
          <button
            type="button"
            onClick={() => enqueueShape('circle')}
            className="w-full rounded-lg border border-[#ececef] px-3 py-2 text-left text-sm hover:bg-neutral-50"
          >
            Lingkaran
          </button>
        </div>
      )}

      {leftTab === 'text' && (
        <div className="p-3">
          <p className="text-xs text-[#8b8b93]">Tambah teks ke pola kaos</p>
          <button
            type="button"
            onClick={() => enqueueShape('text')}
            className="mt-3 w-full rounded-lg bg-[#f3f0ff] px-3 py-2 text-sm font-medium text-[#6E56F8]"
          >
            + Teks baru
          </button>
        </div>
      )}

      {leftTab === 'ai' && (
        <div className="p-4 text-sm leading-relaxed text-[#8b8b93]">
          Generator logo AI belum diaktifkan di versi ini. Unggah logo dari tab Unggah.
        </div>
      )}
    </aside>
  )
}
