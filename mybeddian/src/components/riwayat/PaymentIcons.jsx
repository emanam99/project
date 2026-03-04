import { getGambarUrl } from '../../config/images'

const getLogoPath = (filename) => getGambarUrl(`/logo/${filename}`)

const BANK_LOGO_MAP = {
  bag: 'bca.png',
  bca: 'bca.png',
  bni: 'bni.png',
  bri: 'bri.png',
  bsi: 'bca.png',
  btn: 'bca.png',
  mandiri: 'mandiri.png',
  permata: 'permata.png',
  cimb: 'cimb.png',
  danamon: 'danamon.png',
  muamalat: 'bca.png',
}

const STORE_LOGO_MAP = {
  alfamart: 'alfamart.png',
  indomaret: 'indomart.png', // nama file di server: indomart.png
}

export function BankIcon({ bank, className = 'h-8' }) {
  const bankKey = bank?.toLowerCase()?.replace(/-/g, '_') || ''
  const filename = BANK_LOGO_MAP[bankKey] || 'bca.png'
  const src = getLogoPath(filename)
  return (
    <span className={`inline-flex items-center shrink-0 ${className}`}>
      <img src={src} alt={bank || 'Bank'} className="h-full w-auto max-w-[140px] object-contain object-center" />
    </span>
  )
}

export function CStoreIcon({ store, className = 'h-8' }) {
  const storeKey = store?.toLowerCase() || ''
  const filename = STORE_LOGO_MAP[storeKey] || 'alfamart.png'
  const src = getLogoPath(filename)
  return (
    <span className={`inline-flex items-center shrink-0 ${className}`}>
      <img src={src} alt={store || 'Store'} className="h-full w-auto max-w-[140px] object-contain object-center" />
    </span>
  )
}

export function QRISIcon({ className = 'h-8' }) {
  const src = getLogoPath('qris.png')
  return (
    <span className={`inline-flex items-center shrink-0 ${className}`}>
      <img src={src} alt="QRIS" className="h-full w-auto max-w-[140px] object-contain object-center" />
    </span>
  )
}
