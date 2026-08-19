import { useMockupStore } from '../store/useMockupStore'

export default function Header() {
  const gl = useMockupStore((s) => s.gl)

  const onSave = () => {
    const el = gl?.domElement
    if (!el) return
    const link = document.createElement('a')
    link.download = 'mockup-kaos.png'
    link.href = el.toDataURL('image/png')
    link.click()
  }

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#ececef] bg-white px-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-md text-[#8b8b93] hover:bg-neutral-100"
          title="Tutup"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <h1 className="text-[15px] font-medium text-[#2b2b32]">Unggah &amp; Desain</h1>
      </div>
      <button
        type="button"
        onClick={onSave}
        className="rounded-lg bg-[#6E56F8] px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-[#5d46ea]"
      >
        Simpan
      </button>
    </header>
  )
}
