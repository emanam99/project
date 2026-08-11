import { QRCodeSVG } from 'qrcode.react'
import { getGambarUrl } from '../../../config/images'
import {
  SANTRI_CARD_HEADER_TITLE_1,
  SANTRI_CARD_HEADER_TITLE_2,
  SANTRI_CARD_HEADER_SUB_1,
  SANTRI_CARD_HEADER_SUB_2,
  SANTRI_CARD_DESIGNS,
  formatSantriAlamat,
  formatTempatTanggalLahir,
} from '../constants/santriCardDesign'
import './SantriCardDesigns.css'

const CARD_BRAND_LOGO = getGambarUrl('/logo.png')
export const CARD_WIDTH_MM = 85.6
export const CARD_HEIGHT_MM = 53.98

/** Ukuran modul QR (px) — CSS memaksa ke ~20mm agar tetap tajam & mudah discan. */
const PHOTO_CARD_QR_SIZE = 88

function digitsOnly(raw) {
  return String(raw || '').replace(/\D/g, '')
}

/** NIS: spasi tiap 3 digit (sisa terakhir terpisah), mis. 1234567890 → 123 456 789 0 */
function formatNisDisplay(raw) {
  const digits = digitsOnly(raw)
  if (!digits) return ''
  return digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim()
}

export function santriCardDisplay(card, santri, santriDetail) {
  const nama =
    (card?.santri_nama || santri?.nama || santriDetail?.nama || '').trim()
  const nisRaw =
    card?.santri_nis != null && String(card.santri_nis).trim() !== ''
      ? String(card.santri_nis).trim()
      : santri?.nis != null && String(santri.nis).trim() !== ''
        ? String(santri.nis).trim()
        : santriDetail?.nis != null
          ? String(santriDetail.nis).trim()
          : ''
  const nis = formatNisDisplay(nisRaw)
  const nik = digitsOnly(santriDetail?.nik)
  return { nama, nis, nik }
}

function SantriPhotoFrame({ fotoUrl, nama }) {
  return (
    <div className="santri-card__photo">
      {fotoUrl ? (
        <img src={fotoUrl} alt={nama || 'Foto santri'} draggable={false} />
      ) : (
        <div className="santri-card__photo-empty" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>
      )}
    </div>
  )
}

/** Desain 2: kartu ID santri dengan pas foto (mirip contoh). */
function SantriCardPhoto({ card, display, fotoUrl, hasToken }) {
  const alamat = formatSantriAlamat(card.__santriDetail)
  const ttl = formatTempatTanggalLahir(card.__santriDetail)

  return (
    <>
      <div className="santri-card__pattern" aria-hidden>
        <span className="santri-card__dots santri-card__dots--left" />
        <span className="santri-card__dots santri-card__dots--right" />
        <span className="santri-card__deco santri-card__deco--wajik santri-card__deco--w1" />
        <span className="santri-card__deco santri-card__deco--wajik santri-card__deco--w2" />
        <span className="santri-card__deco santri-card__deco--wajik santri-card__deco--w3" />
        <span className="santri-card__deco santri-card__deco--wajik santri-card__deco--w4" />
        <span className="santri-card__deco santri-card__deco--wajik santri-card__deco--w5" />
        <span className="santri-card__deco santri-card__deco--wajik santri-card__deco--w6" />
        <span className="santri-card__deco santri-card__deco--wajik santri-card__deco--w7" />
        <span className="santri-card__deco santri-card__deco--wajik santri-card__deco--w8" />
        <span className="santri-card__deco santri-card__deco--bubble santri-card__deco--b1" />
        <span className="santri-card__deco santri-card__deco--bubble santri-card__deco--b2" />
        <span className="santri-card__deco santri-card__deco--bubble santri-card__deco--b3" />
        <span className="santri-card__deco santri-card__deco--bubble santri-card__deco--b4" />
        <span className="santri-card__deco santri-card__deco--bubble santri-card__deco--b5" />
        <span className="santri-card__deco santri-card__deco--ring santri-card__deco--r1" />
        <span className="santri-card__deco santri-card__deco--ring santri-card__deco--r2" />
      </div>
      <div className="santri-card__inner">
        <div className="santri-card__header">
          <div className="santri-card__header-stripes" aria-hidden />
          <div className="santri-card__header-titles">
            <p className="santri-card__title">
              <span className="santri-card__title-a">{SANTRI_CARD_HEADER_TITLE_1} </span>
              <span className="santri-card__title-b">{SANTRI_CARD_HEADER_TITLE_2}</span>
            </p>
            <p className="santri-card__subtitle">{SANTRI_CARD_HEADER_SUB_1}</p>
            <p className="santri-card__subtitle santri-card__subtitle--strong">
              {SANTRI_CARD_HEADER_SUB_2}
            </p>
          </div>
          <img
            src={CARD_BRAND_LOGO}
            alt=""
            className="santri-card__logo"
            draggable={false}
          />
        </div>

        <div className="santri-card__body">
          <div className="santri-card__mid">
            <p className="santri-card__name" title={display.nama || undefined}>
              {display.nama || 'Nama Santri'}
            </p>

            <div className="santri-card__mid-gap" aria-hidden>
              <div className="santri-card__rule" />
            </div>

            <div className="santri-card__facts">
              <div className="santri-card__fact">
                <span className="santri-card__fact-label">NIK</span>
                <span className="santri-card__fact-value">{display.nik || '—'}</span>
              </div>
            </div>
          </div>

          <div className="santri-card__body-bottom">
            <div className="santri-card__details">
              <div className="santri-card__fact">
                <span className="santri-card__fact-label">Tempat Tanggal Lahir</span>
                <span className="santri-card__fact-value">{ttl || '—'}</span>
              </div>

              <div className="santri-card__alamat-box">
                <span className="santri-card__alamat-label">Alamat</span>
                {alamat.line1 || alamat.line2 ? (
                  <span className="santri-card__alamat-value">
                    {alamat.line1}
                    {alamat.line1 && alamat.line2 ? <br /> : null}
                    {alamat.line2}
                  </span>
                ) : (
                  <span className="santri-card__alamat-value santri-card__alamat-value--muted">
                    Alamat belum diisi
                  </span>
                )}
              </div>
            </div>

            <div className="santri-card__qr">
              <div className="santri-card__qr-box">
                {display.nis ? (
                  <span className="santri-card__qr-num" aria-label={display.nis}>
                    {display.nis.split(/\s+/).map((part, i) => (
                      <span key={`${part}-${i}`} className="santri-card__qr-num-group">
                        {part.split('').map((ch, j) => (
                          <span key={`${ch}-${j}`}>{ch}</span>
                        ))}
                      </span>
                    ))}
                  </span>
                ) : null}
                {hasToken ? (
                  <QRCodeSVG
                    value={card.token}
                    size={PHOTO_CARD_QR_SIZE}
                    level="M"
                    includeMargin={false}
                    bgColor="#ffffff"
                    fgColor="#000000"
                  />
                ) : (
                  <div className="santri-card__qr-empty">QR</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="santri-card__col-left">
          <SantriPhotoFrame fotoUrl={fotoUrl} nama={display.nama} />
        </div>
      </div>
    </>
  )
}

export function SantriCardPhotoPreview({
  card,
  santri,
  santriDetail = null,
  fotoUrl = null,
  className = '',
}) {
  const display = santriCardDisplay(card, santri, santriDetail)
  const hasToken = !!card?.token
  const mergedCard = { ...card, __santriDetail: santriDetail }

  return (
    <div
      data-card-type="SANTRI"
      className={`cashless-santri-card cashless-santri-card--photo print-card-cashless print-card-item ${className}`}
      style={{
        width: `${CARD_WIDTH_MM}mm`,
        height: `${CARD_HEIGHT_MM}mm`,
        minHeight: `${CARD_HEIGHT_MM}mm`,
      }}
    >
      <SantriCardPhoto card={mergedCard} display={display} fotoUrl={fotoUrl} hasToken={hasToken} />
    </div>
  )
}

export function SantriCardDesignPicker({ value, onChange, className = '' }) {
  return (
    <div className={`no-print space-y-1.5 ${className}`}>
      <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Desain kartu Santri (CS)</p>
      <div className="flex flex-wrap gap-2">
        {SANTRI_CARD_DESIGNS.map((d) => {
          const active = value === d.id
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onChange(d.id)}
              className={`flex-1 min-w-[8.5rem] px-3 py-2 rounded-lg border text-left transition-colors ${
                active
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/25 ring-1 ring-emerald-400/60'
                  : 'border-gray-200 dark:border-gray-600 hover:border-emerald-300 dark:hover:border-emerald-700'
              }`}
            >
              <span
                className={`block text-xs font-semibold ${
                  active ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-800 dark:text-gray-200'
                }`}
              >
                {d.label}
              </span>
              <span className="block text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{d.hint}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
