import Viewer3D from './Viewer3D'
import { useMockupStore } from '../store/useMockupStore'

const PRESETS = [
  { name: 'Kustom', color: 'custom' },
  { name: 'Putih', color: '#ffffff' },
  { name: 'Abu muda', color: '#d4d4d8' },
  { name: 'Abu', color: '#71717a' },
  { name: 'Hitam', color: '#18181b' },
  { name: 'Merah', color: '#dc2626' },
  { name: 'Biru', color: '#2563eb' },
  { name: 'Krem', color: '#e7d5c5' },
]

export default function RightPanel() {
  const shirtColor = useMockupStore((s) => s.shirtColor)
  const setShirtColor = useMockupStore((s) => s.setShirtColor)
  const sleeveLength = useMockupStore((s) => s.sleeveLength)
  const setSleeveLength = useMockupStore((s) => s.setSleeveLength)

  return (
    <aside className="flex w-[340px] shrink-0 flex-col gap-4 overflow-y-auto bg-[#f4f4f6] p-4">
      <div className="relative shrink-0 overflow-hidden rounded-2xl bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)]">
        <div className="h-[min(56vh,520px)] w-full">
          <Viewer3D />
        </div>
        <span className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-md bg-white/90 text-[10px] font-semibold text-[#6b6b75] shadow-sm">
          3D
        </span>
      </div>

      <section className="rounded-2xl bg-white px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
        <h2 className="text-sm font-medium text-[#2b2b32]">Warna</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          {PRESETS.map((item) => {
            if (item.color === 'custom') {
              return (
                <label
                  key="custom"
                  className="relative h-8 w-8 cursor-pointer overflow-hidden rounded-full ring-1 ring-[#e5e5ea]"
                  title="Warna kustom"
                >
                  <span
                    className="absolute inset-0"
                    style={{
                      background:
                        'conic-gradient(#ef4444, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444)',
                    }}
                  />
                  <input
                    type="color"
                    value={shirtColor}
                    onChange={(e) => setShirtColor(e.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </label>
              )
            }
            const selected = shirtColor.toLowerCase() === item.color
            return (
              <button
                key={item.color}
                type="button"
                title={item.name}
                onClick={() => setShirtColor(item.color)}
                className={`h-8 w-8 rounded-full border border-black/10 ${
                  selected ? 'ring-2 ring-[#6E56F8] ring-offset-2' : ''
                }`}
                style={{ backgroundColor: item.color }}
              />
            )
          })}
        </div>
      </section>

      <section className="rounded-2xl bg-white px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
        <h2 className="text-sm font-medium text-[#2b2b32]">Lengan</h2>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-[#f3f3f5] p-1">
          {(
            [
              { id: 'short', label: 'Pendek' },
              { id: 'long', label: 'Panjang' },
            ] as const
          ).map((item) => {
            const selected = sleeveLength === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSleeveLength(item.id)}
                className={`rounded-lg py-2 text-sm font-medium transition ${
                  selected
                    ? 'bg-white text-[#2b2b32] shadow-sm'
                    : 'text-[#8b8b93] hover:text-[#2b2b32]'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </section>
      <section className="mt-auto rounded-2xl bg-white px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
        <h2 className="text-sm font-medium text-[#2b2b32]">Info</h2>
        <p className="mt-2 text-xs leading-5 text-[#8b8b93]">
          Model 3D (misalnya kaos versi lain) bisa dibuat ulang lewat Hunyuan3D. Simpan tautan ini untuk generate berikutnya.
        </p>
        <a
          href="https://huggingface.co/spaces/tencent/Hunyuan3D-2.1"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex text-xs font-medium text-[#6E56F8] hover:underline"
        >
          Hunyuan3D-2.1 di Hugging Face
        </a>
      </section>
    </aside>
  )
}
