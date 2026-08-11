import { useId } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { getGambarUrl } from '../../../config/images'
import { CARD_TYPE_SHORT } from '../constants/cashlessKartu'
import {
  PESANTREN_NAMA,
  PESANTREN_ALAMAT,
  PESANTREN_KOP_LINES,
  MAHROM_CARD_DESIGNS,
  formatWaliAlamat,
  formatWaliAlamatLines,
} from '../constants/mahromCardDesign'
import './CashlessBankCard.css'
import './MahromCardDesigns.css'

const CARD_BRAND_LOGO = getGambarUrl('/logo.png')
const MAHROM_BG_DEPAN = getGambarUrl('/bg/mahrom-depan.png')
const MAHROM_BG_BELAKANG = getGambarUrl('/bg/mahrom-belakang.png')
export const CARD_WIDTH_MM = 85.6
export const CARD_HEIGHT_MM = 53.98

function formatEmbossedNumber(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim()
}

function EmvChip({ className = '' }) {
  const gradId = useId().replace(/:/g, '')
  return (
    <svg className={className} viewBox="0 0 44 34" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="1" y="1" width="42" height="32" rx="4" fill={`url(#${gradId})`} stroke="#b8860b" strokeWidth="0.6" />
      <path d="M14 1v32M30 1v32M1 12h42M1 22h42" stroke="#c9a227" strokeWidth="0.5" opacity="0.65" />
      <defs>
        <linearGradient id={gradId} x1="4" y1="2" x2="40" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f5e6a8" />
          <stop offset="0.45" stopColor="#d4af37" />
          <stop offset="1" stopColor="#a67c00" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function MahromCardOrnaments() {
  return (
    <>
      <div className="cashless-bank-card__mahrom-foil" aria-hidden />
      <div className="cashless-bank-card__mahrom-mesh" aria-hidden />
      <div className="cashless-bank-card__mahrom-orb cashless-bank-card__mahrom-orb--a" aria-hidden />
      <div className="cashless-bank-card__mahrom-orb cashless-bank-card__mahrom-orb--b" aria-hidden />
      <span className="cashless-bank-card__mahrom-watermark" aria-hidden>{CARD_TYPE_SHORT.MAHROM}</span>
    </>
  )
}

function MahromQrBlock({ token, hasToken }) {
  return (
    <div className="mahrom-card__qr-wrap">
      <div className="cashless-bank-card__qr cashless-bank-card__qr--mahrom">
        {hasToken ? (
          <QRCodeSVG
            value={token}
            size={52}
            level="M"
            includeMargin={false}
            bgColor="#ffffff"
            fgColor="#172554"
          />
        ) : (
          <div className="cashless-bank-card__qr-placeholder">QR</div>
        )}
        {hasToken && <span className="cashless-bank-card__qr-scan-hint">Scan</span>}
      </div>
    </div>
  )
}

function MahromCardClassic({ card, display, waliAlamat, hasToken }) {
  const nim = formatEmbossedNumber(display.mahromNim)
  const hubungan = display.primaryLabel || 'Mahrom'
  const typeShort = CARD_TYPE_SHORT.MAHROM || card.card_label

  return (
    <>
      <div className="cashless-bank-card__top">
        <div className="cashless-bank-card__brand">
          <img src={CARD_BRAND_LOGO} alt="" className="cashless-bank-card__brand-logo" draggable={false} />
          <div className="mahrom-card__header-block">
            <p className="mahrom-card__pesantren-name">{PESANTREN_NAMA}</p>
            <p className="mahrom-card__pesantren-addr">{PESANTREN_ALAMAT}</p>
          </div>
        </div>
        <div className="cashless-bank-card__badges">
          <span className="cashless-bank-card__type-badge">{card.card_label || typeShort}</span>
        </div>
      </div>

      <div className="mahrom-card__chip-row">
        <EmvChip className="cashless-bank-card__chip" />
        <span className="cashless-bank-card__mahrom-hubungan">{hubungan}</span>
      </div>

      <div className="mahrom-card__body-row">
        <div className="mahrom-card__main">
          <p className="mahrom-card__nim" title={display.mahromNim || undefined}>
            {nim ? `NIM ${nim}` : 'NIM •••• ••••'}
          </p>
          <p className="mahrom-card__wali-name" title={display.primaryNama || undefined}>
            {(display.primaryNama || 'NAMA WALI').toUpperCase()}
          </p>
          {waliAlamat ? (
            <p className="mahrom-card__wali-addr" title={waliAlamat}>
              {waliAlamat}
            </p>
          ) : (
            <p className="mahrom-card__wali-addr mahrom-card__wali-addr--muted">Alamat wali belum diisi</p>
          )}
          {display.namaSantri && (
            <p className="mahrom-card__santri-line" title={display.namaSantri}>
              Santri: {display.namaSantri}
              {display.nis ? ` · ${display.nis}` : ''}
            </p>
          )}
          {hasToken ? (
            <p className="mahrom-card__token">{card.token_prefix} ••••</p>
          ) : null}
        </div>
        <MahromQrBlock token={card.token} hasToken={hasToken} />
      </div>
    </>
  )
}

function MahromCardPremium({ card, display, waliAlamat, hasToken }) {
  const nim = formatEmbossedNumber(display.mahromNim)
  const typeShort = CARD_TYPE_SHORT.MAHROM || card.card_label

  return (
    <>
      <div className="mahrom-card__deco-line" aria-hidden />
      <div className="mahrom-card__ribbon">
        <img src={CARD_BRAND_LOGO} alt="" className="cashless-bank-card__brand-logo" draggable={false} />
        <div className="mahrom-card__ribbon-text">
          <p className="mahrom-card__pesantren-name">{PESANTREN_NAMA}</p>
          <p className="mahrom-card__pesantren-addr">{PESANTREN_ALAMAT}</p>
        </div>
      </div>

      <div className="mahrom-card__badge-row">
        <span className="mahrom-card__premium-badge">{card.card_label || typeShort}</span>
      </div>

      <div className="mahrom-card__premium-body">
        <div className="mahrom-card__center-block">
          <p className="mahrom-card__nim" title={display.mahromNim || undefined}>
            {nim || '•••• ••••'}
          </p>
          <p className="mahrom-card__wali-name" title={display.primaryNama || undefined}>
            {(display.primaryNama || 'NAMA WALI').toUpperCase()}
          </p>
          {waliAlamat ? (
            <p className="mahrom-card__wali-addr" title={waliAlamat}>
              {waliAlamat}
            </p>
          ) : (
            <p className="mahrom-card__wali-addr mahrom-card__wali-addr--muted">Alamat wali belum diisi</p>
          )}
        </div>

        <div className="mahrom-card__footer-row">
          {display.namaSantri ? (
            <p className="mahrom-card__santri-line">
              Santri: {display.namaSantri}
              {display.nis ? ` · ${display.nis}` : ''}
            </p>
          ) : (
            <span className="mahrom-card__santri-line mahrom-card__santri-line--empty" aria-hidden />
          )}
          <MahromQrBlock token={card.token} hasToken={hasToken} />
        </div>
      </div>
    </>
  )
}

/** Desain 3 — depan: BG mahrom-depan + tata letak mockup (logo/QR kiri, data di panel biru) */
function MahromCardBgFront({ card, display, alamatLines, hasToken }) {
  const nim = formatEmbossedNumber(display.mahromNim)

  return (
    <div className="mahrom-card-bg">
      <img src={MAHROM_BG_DEPAN} alt="" className="mahrom-card-bg__img" draggable={false} />
      <div className="mahrom-card-bg__left">
        <img src={CARD_BRAND_LOGO} alt="" className="mahrom-card-bg__logo" draggable={false} />
        <div className="mahrom-card-bg__kop">
          {PESANTREN_KOP_LINES.map((line) => (
            <p key={line} className="mahrom-card-bg__kop-line">
              {line}
            </p>
          ))}
        </div>
        <div className="mahrom-card-bg__qr">
          {hasToken ? (
            <QRCodeSVG
              value={card.token}
              size={112}
              level="M"
              includeMargin={false}
              bgColor="#ffffff"
              fgColor="#0f172a"
            />
          ) : (
            <div className="mahrom-card-bg__qr-ph">QR</div>
          )}
        </div>
      </div>
      <div className="mahrom-card-bg__panel">
        <p className="mahrom-card-bg__nim" title={display.mahromNim || undefined}>
          {nim || '000 000 0'}
        </p>
        <p className="mahrom-card-bg__name" title={display.primaryNama || undefined}>
          {(display.primaryNama || 'NAMA WALI').toUpperCase()}
        </p>
        <ul className="mahrom-card-bg__addr">
          {alamatLines.length > 0 ? (
            alamatLines.map((line) => (
              <li key={line}>{line}</li>
            ))
          ) : (
            <li className="mahrom-card-bg__addr--muted">Alamat belum diisi</li>
          )}
        </ul>
      </div>
      <div className="mahrom-card-bg__footer" aria-hidden={false}>
        <span className="mahrom-card-bg__footer-line" aria-hidden />
        <span className="mahrom-card-bg__footer-label">Mahrom Card</span>
      </div>
    </div>
  )
}

/** Desain 3 — belakang: BG mahrom-belakang */
function MahromCardBgBack() {
  return (
    <div className="mahrom-card-bg mahrom-card-bg--back">
      <img src={MAHROM_BG_BELAKANG} alt="" className="mahrom-card-bg__img" draggable={false} />
    </div>
  )
}

export function mahromDisplayFromCard(card, santri) {
  const namaSantri = (card?.santri_nama || santri?.nama || '').trim()
  const nis = card?.santri_nis ? String(card.santri_nis).trim() : santri?.nis ? String(santri.nis).trim() : ''
  const mahromNama = (card.mahrom_nama || card.display_nama || '').trim()
  const hubungan = card.mahrom_hubungan || card.holder_label || 'Mahrom'
  const nim = card.mahrom_nim ? String(card.mahrom_nim).trim() : ''
  return {
    primaryLabel: hubungan,
    primaryNama: mahromNama,
    mahromNim: nim,
    namaSantri,
    nis,
  }
}

export function MahromCardPreview({ card, santri, design = 'classic', className = '', side = 'front' }) {
  const display = mahromDisplayFromCard(card, santri)
  const waliAlamat = formatWaliAlamat(card)
  const alamatLines = formatWaliAlamatLines(card)
  const hasToken = !!card?.token
  const variant = design === 'premium' ? 'premium' : design === 'bg' ? 'bg' : 'classic'

  if (variant === 'bg' && side === 'back') {
    return (
      <div
        data-card-type="MAHROM"
        data-mahrom-id={card?.mahrom_id || undefined}
        data-mahrom-design="bg"
        data-mahrom-side="back"
        className={`cashless-bank-card cashless-bank-card--mahrom mahrom-card--bg mahrom-card--bg-back print-card-cashless print-card-item ${className}`}
        style={{ width: `${CARD_WIDTH_MM}mm`, height: `${CARD_HEIGHT_MM}mm`, minHeight: `${CARD_HEIGHT_MM}mm` }}
      >
        <MahromCardBgBack />
      </div>
    )
  }

  return (
    <div
      data-card-type="MAHROM"
      data-mahrom-id={card.mahrom_id || undefined}
      data-mahrom-design={variant}
      data-mahrom-side={variant === 'bg' ? 'front' : undefined}
      className={`cashless-bank-card cashless-bank-card--mahrom mahrom-card--${variant} print-card-cashless print-card-item ${className}`}
      style={{ width: `${CARD_WIDTH_MM}mm`, height: `${CARD_HEIGHT_MM}mm`, minHeight: `${CARD_HEIGHT_MM}mm` }}
    >
      {variant !== 'bg' && (
        <>
          <div className="cashless-bank-card__pattern" aria-hidden />
          <div className="cashless-bank-card__shine" aria-hidden />
          {variant === 'classic' && <MahromCardOrnaments />}
        </>
      )}
      <div className="cashless-bank-card__inner">
        {variant === 'bg' ? (
          <MahromCardBgFront
            card={card}
            display={display}
            alamatLines={alamatLines}
            hasToken={hasToken}
          />
        ) : variant === 'premium' ? (
          <MahromCardPremium card={card} display={display} waliAlamat={waliAlamat} hasToken={hasToken} />
        ) : (
          <MahromCardClassic card={card} display={display} waliAlamat={waliAlamat} hasToken={hasToken} />
        )}
      </div>
    </div>
  )
}

export function MahromCardDesignPicker({ value, onChange, className = '' }) {
  return (
    <div className={`no-print space-y-1.5 ${className}`}>
      <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Desain kartu Mahrom Card</p>
      <div className="flex flex-wrap gap-2">
        {MAHROM_CARD_DESIGNS.map((d) => {
          const active = value === d.id
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onChange(d.id)}
              className={`flex-1 min-w-[8.5rem] px-3 py-2 rounded-lg border text-left transition-colors ${
                active
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/25 ring-1 ring-blue-400/60'
                  : 'border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-700'
              }`}
            >
              <span className={`block text-xs font-semibold ${active ? 'text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-gray-200'}`}>
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
