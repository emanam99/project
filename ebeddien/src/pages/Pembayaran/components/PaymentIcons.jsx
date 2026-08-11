import { getGambarUrl } from '../../../config/images'

const getLogoPath = (filename) => getGambarUrl(`/logo/${filename}`)

const BANK_LOGO_MAP = {
  bag: 'ag.png',
  bca: 'bca.png',
  bni: 'bni.png',
  bri: 'bri.png',
  bsi: 'bsi.png',
  btn: 'btn.png',
  mandiri: 'mandiri.png',
  permata: 'permata.png',
  cimb: 'cimb.png',
  danamon: 'danamon.png',
  muamalat: 'muamalat.png'
}

const STORE_LOGO_MAP = {
  alfamart: 'alfamart.png',
  indomaret: 'indomart.png'
}

const EWALLET_LOGO_MAP = {
  dana: 'dana.png',
  ovo: 'ovo.png',
  gopay: 'gopay.png',
  shopeepay: 'shopee-pay.png',
  linkaja: 'linkaja.png'
}

export function BankIcon({ bank, className = 'h-8' }) {
  const bankKey = bank?.toLowerCase()?.replace(/-/g, '_') || ''
  const filename = BANK_LOGO_MAP[bankKey] || 'bca.png'
  return (
    <span className={`inline-flex items-center shrink-0 ${className}`}>
      <img src={getLogoPath(filename)} alt={bank || 'Bank'} className="h-full w-auto max-w-[120px] object-contain" />
    </span>
  )
}

export function CStoreIcon({ store, className = 'h-8' }) {
  const storeKey = store?.toLowerCase() || ''
  const filename = STORE_LOGO_MAP[storeKey] || 'alfamart.png'
  return (
    <span className={`inline-flex items-center shrink-0 ${className}`}>
      <img src={getLogoPath(filename)} alt={store || 'Store'} className="h-full w-auto max-w-[120px] object-contain" />
    </span>
  )
}

export function QRISIcon({ className = 'h-8' }) {
  return (
    <span className={`inline-flex items-center shrink-0 ${className}`}>
      <img src={getLogoPath('qris.png')} alt="QRIS" className="h-full w-auto max-w-[120px] object-contain" />
    </span>
  )
}

export function EwalletIcon({ wallet, className = 'h-8' }) {
  const key = wallet?.toLowerCase()?.replace(/-/g, '_') || 'dana'
  const filename = EWALLET_LOGO_MAP[key] || 'dana.png'
  return (
    <span className={`inline-flex items-center shrink-0 ${className}`}>
      <img src={getLogoPath(filename)} alt={wallet || 'E-Wallet'} className="h-full w-auto max-w-[120px] object-contain" />
    </span>
  )
}

export const VA_BANKS = [
  { id: 'bca', label: 'BCA' },
  { id: 'bni', label: 'BNI' },
  { id: 'bri', label: 'BRI' },
  { id: 'mandiri', label: 'Mandiri' },
  { id: 'bsi', label: 'BSI' },
  { id: 'permata', label: 'Permata' },
  { id: 'cimb', label: 'CIMB' },
  { id: 'danamon', label: 'Danamon' }
]

export const CSTORES = [
  { id: 'alfamart', label: 'Alfamart' },
  { id: 'indomaret', label: 'Indomaret' }
]

export const EWALLETS = [
  { id: 'dana', label: 'DANA' },
  { id: 'shopeepay', label: 'ShopeePay' }
]
