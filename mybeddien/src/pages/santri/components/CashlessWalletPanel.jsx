import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { formatSaldo } from './CashlessFormat'
import { useMybeddienToast } from '../../../contexts/MybeddienToastContext'
import {
  buildWaAdminUrl,
  WA_MSG_INFO_KARTU_SANTRI,
} from '../../../utils/waAdminPembayaran'

function LiveBadge({ className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 shrink-0 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 ${className}`}
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      Live
    </span>
  )
}

function TopUpIcon({ className = 'h-5 w-5' }) {
  // Gaya mirip Top-Up DANA: panah naik + garis dasar
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.25"
        d="M12 16V7m0 0l-3.5 3.5M12 7l3.5 3.5M6.5 18.5h11"
      />
    </svg>
  )
}

function TransferIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"
      />
    </svg>
  )
}

function PinIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  )
}

function CopyIcon({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  )
}

function CheckIcon({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
    </svg>
  )
}

/** Tombol aksi ikon + label di bawah (gaya pintasan wallet). */
function WalletActionButton({ onClick, label, icon, tone = 'primary', compact = false }) {
  const toneClass =
    tone === 'amber'
      ? 'bg-amber-500 text-white hover:bg-amber-600'
      : tone === 'muted'
        ? 'border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700/50 dark:text-gray-100 dark:hover:bg-gray-700'
        : 'bg-primary-600 text-white hover:bg-primary-700'

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors ${toneClass}`}
        title={label}
        aria-label={label}
      >
        {icon}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex flex-col items-center gap-1.5 rounded-xl px-2 py-1 text-center transition-opacity hover:opacity-90"
    >
      <span
        className={`inline-flex h-11 w-11 items-center justify-center rounded-full shadow-sm transition-transform group-active:scale-95 ${toneClass}`}
      >
        {icon}
      </span>
      <span className="text-[11px] font-semibold leading-tight text-gray-700 dark:text-gray-200">{label}</span>
    </button>
  )
}

function clamp01(n) {
  if (n <= 0) return 0
  if (n >= 1) return 1
  return n
}

/**
 * Panel wallet cashless.
 * collapseProgress 0–1 (mobile): 0 = penuh, 1 = ringkas — tinggi & opacity mengikuti scroll.
 */
export default function CashlessWalletPanel({
  wallet,
  hasWallet,
  onTopUp,
  onTransfer,
  onAturPin,
  onUbahPin,
  live = false,
  collapseProgress = 0,
  variant = 'santri',
}) {
  const isToko = variant === 'toko'
  const { showToast } = useMybeddienToast()
  const account = wallet?.account
  const nama = wallet?.nama || '—'
  const nis = wallet?.nis || '—'
  const kodeToko = wallet?.kode_toko || '—'
  const code = account?.code || '—'
  const saldoLabel = hasWallet ? `Rp ${formatSaldo(account?.balance_cached)}` : '—'
  const kartu = wallet?.kartu
  const hasKartu = Boolean(kartu?.has_kartu)
  const hasPin = Boolean(kartu?.has_pin)
  const [copied, setCopied] = useState(false)

  const copyWalletCode = useCallback(async () => {
    if (!hasWallet || !code || code === '—') return
    try {
      await navigator.clipboard.writeText(String(code))
      setCopied(true)
      showToast('No Wallet disalin', 'success')
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      showToast('Gagal menyalin No Wallet', 'error')
    }
  }, [hasWallet, code, showToast])

  const p = clamp01(collapseProgress)
  const expandedOpen = 1 - p

  const expandedInnerRef = useRef(null)
  const compactInnerRef = useRef(null)
  const [expandedH, setExpandedH] = useState(0)
  const [compactH, setCompactH] = useState(0)

  useLayoutEffect(() => {
    const e = expandedInnerRef.current
    const c = compactInnerRef.current
    if (e) setExpandedH(e.scrollHeight)
    if (c) setCompactH(c.scrollHeight)
  }, [wallet, hasWallet, hasKartu, hasPin, live, nama, nis, code, saldoLabel])

  const pinAction = hasKartu ? (
    hasPin ? (
      <WalletActionButton
        onClick={onUbahPin}
        label="Ubah Pin"
        tone="muted"
        icon={<PinIcon className="h-5 w-5" />}
      />
    ) : (
      <WalletActionButton
        onClick={onAturPin}
        label="Atur Pin"
        tone="amber"
        icon={<PinIcon className="h-5 w-5" />}
      />
    )
  ) : null

  const pinActionCompact = hasKartu ? (
    hasPin ? (
      <WalletActionButton
        compact
        onClick={onUbahPin}
        label="Ubah Pin"
        tone="muted"
        icon={<PinIcon className="h-4 w-4" />}
      />
    ) : (
      <WalletActionButton
        compact
        onClick={onAturPin}
        label="Atur Pin"
        tone="amber"
        icon={<PinIcon className="h-4 w-4" />}
      />
    )
  ) : null

  const shellShadow = p > 0.55 ? 'shadow-md lg:shadow-sm' : 'shadow-sm'
  const mobileHeight =
    expandedH > 0 && compactH > 0 ? expandedH + p * (compactH - expandedH) : undefined

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 max-lg:will-change-[height] lg:h-auto! ${shellShadow}`}
      style={mobileHeight != null ? { height: mobileHeight } : undefined}
    >
      {/* Compact (mobile) — overlay, fade-in saat scroll */}
      <div
        className="absolute inset-x-0 top-0 z-10 lg:hidden"
        style={{
          opacity: p,
          transform: `translateY(${(1 - p) * -6}px)`,
          pointerEvents: p > 0.5 ? 'auto' : 'none',
        }}
        aria-hidden={p < 0.2}
      >
        <div ref={compactInnerRef} className="flex items-center justify-between gap-2 px-3 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate font-mono text-xs font-semibold text-gray-900 dark:text-white">{code}</span>
            <span className="shrink-0 text-gray-300 dark:text-gray-600" aria-hidden>
              ·
            </span>
            <span className="truncate font-mono text-xs font-bold tabular-nums text-primary-600 dark:text-primary-400">
              {saldoLabel}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {live ? <LiveBadge className="text-[9px]" /> : null}
            {pinActionCompact}
            {hasWallet && typeof onTransfer === 'function' ? (
              <WalletActionButton
                compact
                onClick={onTransfer}
                label="Transfer"
                tone="muted"
                icon={<TransferIcon className="h-4 w-4" />}
              />
            ) : null}
            {hasWallet ? (
              <WalletActionButton
                compact
                onClick={onTopUp}
                label="Top-Up"
                icon={<TopUpIcon className="h-4 w-4" />}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Expanded — fade-out + sedikit naik saat collapse (desktop selalu penuh via progress=0) */}
      <div
        ref={expandedInnerRef}
        className="max-lg:origin-top"
        style={{
          opacity: expandedOpen,
          transform: p > 0 ? `translateY(${p * -10}px)` : undefined,
          pointerEvents: expandedOpen > 0.5 ? 'auto' : 'none',
        }}
        aria-hidden={expandedOpen < 0.2}
      >
        <div className="border-b border-gray-100 p-4 dark:border-gray-700 sm:p-5 lg:border-b-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="truncate text-sm font-semibold leading-snug text-gray-900 dark:text-white">{nama}</h2>
            {live ? <LiveBadge /> : null}
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs text-gray-500 dark:text-gray-400">
              {isToko ? `Kode ${kodeToko}` : `NIS ${nis}`}
            </p>
            <div className="flex shrink-0 items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
              <span className="font-medium">No Wallet :</span>
              <span
                className="font-mono font-medium tracking-wide text-gray-700 dark:text-gray-200"
                title={hasWallet ? code : undefined}
              >
                {hasWallet ? code : '—'}
              </span>
              {hasWallet ? (
                <button
                  type="button"
                  onClick={copyWalletCode}
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                    copied
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-gray-400 hover:bg-gray-100 hover:text-primary-600 dark:hover:bg-gray-700 dark:hover:text-primary-400'
                  }`}
                  title={copied ? 'Disalin' : 'Salin No Wallet'}
                  aria-label={copied ? 'No Wallet disalin' : 'Salin No Wallet'}
                >
                  {copied ? <CheckIcon /> : <CopyIcon />}
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="space-y-4 p-4 sm:p-5 lg:pt-0">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Saldo</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-primary-600 dark:text-primary-400">
              {saldoLabel}
            </p>
          </div>

          {hasWallet ? (
            <div className="pt-1">
              <div
                className="h-px w-full bg-linear-to-r from-transparent via-gray-200 to-transparent dark:via-gray-600"
                aria-hidden
              />
              <div className="flex items-start justify-center gap-6 pt-4 sm:gap-8">
                <WalletActionButton
                  onClick={onTopUp}
                  label="Top-Up"
                  icon={<TopUpIcon className="h-5 w-5" />}
                />
                {typeof onTransfer === 'function' ? (
                  <WalletActionButton
                    onClick={onTransfer}
                    label="Transfer"
                    tone="muted"
                    icon={<TransferIcon className="h-5 w-5" />}
                  />
                ) : null}
                {pinAction}
              </div>
            </div>
          ) : null}

          {hasKartu && !hasPin ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/25 dark:text-amber-200">
              PIN kartu belum diatur. Kartu belum bisa dipakai untuk transaksi di toko.
            </p>
          ) : null}

          {!hasWallet ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/25 dark:text-amber-200">
              {isToko ? (
                <p className="leading-relaxed">
                  Toko belum punya akun wallet. Hubungi admin cashless agar wallet toko dibuat.
                </p>
              ) : (
                <>
                  <p className="leading-relaxed">
                    Belum cetak kartu. Silakan mendatangi kantor UWABA untuk cetak kartu santri. Info lebih lanjut
                  </p>
                  <a
                    href={buildWaAdminUrl(WA_MSG_INFO_KARTU_SANTRI)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-2.5 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                    aria-label="Info lebih lanjut tentang kartu santri lewat WhatsApp"
                  >
                    <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    WhatsApp
                  </a>
                </>
              )}
            </div>
          ) : !isToko && !hasKartu ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Kartu santri (CS) aktif belum tersedia. Hubungi petugas untuk cetak/aktivasi kartu.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
