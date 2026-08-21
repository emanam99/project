import { useEffect, useState } from 'react'
import { useMockupStore } from '../store/useMockupStore'

export default function Header() {
  const gl = useMockupStore((s) => s.gl)
  const persistDesign = useMockupStore((s) => s.persistDesign)
  const saveHint = useMockupStore((s) => s.saveHint)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!saveHint) return
    setToast('Desain tersimpan')
    const id = window.setTimeout(() => setToast(null), 1800)
    return () => window.clearTimeout(id)
  }, [saveHint])

  const onSave = () => {
    const ok = persistDesign()
    const el = gl?.domElement
    if (el) {
      const link = document.createElement('a')
      link.download = 'mockup-kaos.png'
      link.href = el.toDataURL('image/png')
      link.click()
    }
    if (!ok) setToast('Gagal menyimpan (penyimpanan penuh?)')
  }

  return (
    <header className="relative flex h-12 shrink-0 items-center justify-between border-b border-[#ececef] bg-white px-3">
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
      <div className="flex items-center gap-3">
        {toast ? <span className="text-xs font-medium text-[#6E56F8]">{toast}</span> : null}
        <button
          type="button"
          onClick={onSave}
          className="rounded-lg bg-[#6E56F8] px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-[#5d46ea]"
        >
          Simpan
        </button>
      </div>
    </header>
  )
}
