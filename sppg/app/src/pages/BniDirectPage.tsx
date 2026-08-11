import { useEffect } from 'react'
import { usePageTitle } from '../contexts/PageTitleContext'

const BNI_DIRECT_URL = 'https://bnidirect.bni.co.id/'

export default function BniDirectPage() {
  usePageTitle('BNI Direct')

  useEffect(() => {
    // Paksa viewport “desktop” di halaman ini agar site bank cenderung mode desktop
    const meta = document.querySelector('meta[name="viewport"]')
    const prev = meta?.getAttribute('content') || ''
    meta?.setAttribute('content', 'width=1280, initial-scale=0.35, maximum-scale=3')
    return () => {
      if (meta && prev) meta.setAttribute('content', prev)
    }
  }, [])

  const openDesktop = () => {
    window.open(BNI_DIRECT_URL, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-3 -mx-3 md:mx-0">
      <div className="ui-card p-3 flex flex-wrap items-center justify-between gap-2 mx-3 md:mx-0">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink">BNI Direct</div>
          <div className="text-[11px] text-muted truncate">{BNI_DIRECT_URL}</div>
        </div>
        <button type="button" className="ui-btn-primary text-[12px] py-1.5 px-3" onClick={openDesktop}>
          Buka di tab baru (desktop)
        </button>
      </div>

      <div className="ui-card overflow-hidden border-line mx-3 md:mx-0">
        <iframe
          title="BNI Direct"
          src={BNI_DIRECT_URL}
          className="w-full bg-white"
          style={{ height: 'min(78dvh, 720px)', minHeight: 480 }}
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>

      <p className="text-[11px] text-faint px-3 md:px-0">
        Jika halaman kosong (diblokir bank), gunakan tombol buka di tab baru. Di HP, aktifkan
        &quot;Situs desktop&quot; di browser jika perlu.
      </p>
    </div>
  )
}
