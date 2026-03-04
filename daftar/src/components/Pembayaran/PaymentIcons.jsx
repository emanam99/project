// Komponen untuk icon payment method dan bank
// Menggunakan gambar dari folder shared /gambar/logo/
import { getGambarUrl } from '../../config/images'

const getLogoPath = (filename) => getGambarUrl(`/logo/${filename}`)

// Mapping bank code ke nama file logo (VA iPayMu)
const BANK_LOGO_MAP = {
  bag: 'ag.png',       // Bank Artha Graha
  bca: 'bca.png',
  bni: 'bni.png',
  bri: 'bri.png',
  bsi: 'bsi.png',     // Bank Syariah Indonesia
  btn: 'btn.png',     // Bank Tabungan Negara
  mandiri: 'mandiri.png',
  permata: 'permata.png',
  cimb: 'cimb.png',
  danamon: 'danamon.png',
  muamalat: 'muamalat.png'  // Bank Muamalat
}

// Mapping store code ke nama file logo
const STORE_LOGO_MAP = {
  alfamart: 'alfamart.png',
  indomaret: 'indomart.png' // file: indomart.png
}

export const BankIcon = ({ bank, className = 'h-8' }) => {
  const bankKey = bank?.toLowerCase()?.replace(/-/g, '_') || ''
  const filename = BANK_LOGO_MAP[bankKey] || 'bca.png'
  const src = getLogoPath(filename)

  return (
    <span className={`inline-flex items-center flex-shrink-0 ${className}`}>
      <img
        src={src}
        alt={bank || 'Bank'}
        className="h-full w-auto max-w-[140px] object-contain object-center"
      />
    </span>
  )
}

export const CStoreIcon = ({ store, className = 'h-8' }) => {
  const storeKey = store?.toLowerCase() || ''
  const filename = STORE_LOGO_MAP[storeKey] || 'alfamart.png'
  const src = getLogoPath(filename)

  return (
    <span className={`inline-flex items-center flex-shrink-0 ${className}`}>
      <img
        src={src}
        alt={store || 'Store'}
        className="h-full w-auto max-w-[140px] object-contain object-center"
      />
    </span>
  )
}

export const QRISIcon = ({ className = 'h-8' }) => {
  const src = getLogoPath('qris.png')

  return (
    <span className={`inline-flex items-center flex-shrink-0 ${className}`}>
      <img
        src={src}
        alt="QRIS"
        className="h-full w-auto max-w-[140px] object-contain object-center"
      />
    </span>
  )
}
