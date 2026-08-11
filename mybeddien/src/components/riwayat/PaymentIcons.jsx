import { getGambarUrl } from '../../config/images'

const getLogoPath = (filename) => getGambarUrl(`/logo/${filename}`)

const BANK_LOGO_MAP = {
  bag: 'ag.png', // Bank Artha Graha
  bca: 'bca.png',
  bni: 'bni.png',
  bri: 'bri.png',
  bsi: 'bsi.png',
  btn: 'btn.png',
  mandiri: 'mandiri.png',
  permata: 'permata.png',
  cimb: 'cimb.png',
  danamon: 'danamon.png',
  muamalat: 'muamalat.png',
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
  const src = getLogoPath('qris-hitam.png')
  return (
    <span className={`inline-flex items-center shrink-0 ${className}`}>
      <img src={src} alt="QRIS" className="h-full w-auto max-w-[140px] object-contain object-center" />
    </span>
  )
}

const EWALLET_LOGO_MAP = {
  dana: 'dana.png',
  ovo: 'ovo.png',
  gopay: 'gopay.png',
  shopeepay: 'shopee-pay.png',
  linkaja: 'linkaja.png',
}

export function EwalletIcon({ wallet, className = 'h-8' }) {
  const key = wallet?.toLowerCase()?.replace(/-/g, '_') || 'dana'
  const filename = EWALLET_LOGO_MAP[key] || 'dana.png'
  const src = getLogoPath(filename)
  return (
    <span className={`inline-flex items-center shrink-0 ${className}`}>
      <img src={src} alt={wallet || 'E-Wallet'} className="h-full w-auto max-w-[140px] object-contain object-center" />
    </span>
  )
}
