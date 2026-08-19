import { useMockupStore } from '../store/useMockupStore'

export default function BottomToolbar() {
  const tool = useMockupStore((s) => s.tool)
  const setTool = useMockupStore((s) => s.setTool)
  const zoom = useMockupStore((s) => s.zoom)
  const setZoom = useMockupStore((s) => s.setZoom)
  const undo = useMockupStore((s) => s.undo)
  const redo = useMockupStore((s) => s.redo)
  const historyIndex = useMockupStore((s) => s.historyIndex)
  const history = useMockupStore((s) => s.history)

  const btn = (active: boolean) =>
    `grid h-8 w-8 place-items-center rounded-md ${
      active ? 'bg-[#f3f0ff] text-[#6E56F8]' : 'text-[#6b6b75] hover:bg-neutral-100'
    }`

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-[#ececef] bg-white px-2 py-1.5 shadow-[0_8px_28px_rgba(15,15,20,0.08)]">
        <button type="button" className={btn(tool === 'select')} title="Pilih" onClick={() => setTool('select')}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.2 2.4l9.2 5.2-4.1.7 2.4 4.4-1.7.9-2.5-4.5-3.3 3V2.4Z" />
          </svg>
        </button>
        <button type="button" className={btn(tool === 'pan')} title="Geser kanvas" onClick={() => setTool('pan')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M8 11V7a2 2 0 114 0v4m0 0V6a2 2 0 114 0v6m0 0V8a2 2 0 114 0v8a5 5 0 01-5 5h-1.5a5 5 0 01-5-5v-5a2 2 0 114 0v2" strokeLinecap="round" />
          </svg>
        </button>
        <span className="mx-1 h-5 w-px bg-[#ececef]" />
        <button
          type="button"
          className={btn(false)}
          title="Urungkan"
          disabled={historyIndex <= 0}
          onClick={() => undo()}
        >
          ↺
        </button>
        <button
          type="button"
          className={btn(false)}
          title="Ulangi"
          disabled={historyIndex >= history.length - 1}
          onClick={() => redo()}
        >
          ↻
        </button>
        <span className="mx-1 h-5 w-px bg-[#ececef]" />
        <button type="button" className={btn(false)} title="Perkecil" onClick={() => setZoom(zoom - 0.1)}>
          −
        </button>
        <span className="min-w-12 text-center text-xs font-medium text-[#3f3f46]">
          {Math.round(zoom * 100)}%
        </span>
        <button type="button" className={btn(false)} title="Perbesar" onClick={() => setZoom(zoom + 0.1)}>
          +
        </button>
      </div>
    </div>
  )
}
