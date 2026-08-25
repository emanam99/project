import { useMemo, useState, useEffect } from 'react'
import { normalizeNikInput, isNikValid } from '../../../utils/nikUtils'
import CetakKartuSantriFotoPanel from './CetakKartuSantriFotoPanel'
import CetakKartuSantriBerkasPanel from './CetakKartuSantriBerkasPanel'
import CetakKartuSantriTopUpPanel from './CetakKartuSantriTopUpPanel'
import CashlessWithdrawPanel from './CashlessWithdrawPanel'

function CameraToggleIcon({ active, className = 'h-4 w-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
      {!active ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4l16 16" />
      ) : null}
    </svg>
  )
}

function HeaderActions({ cameraOpen, onToggleCamera, onCariSantri }) {
  const showCameraToggle = typeof onToggleCamera === 'function'
  return (
    <div className="flex shrink-0 items-center gap-1">
      {showCameraToggle ? (
        <button
          type="button"
          onClick={onToggleCamera}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
            cameraOpen
              ? 'bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-900/40 dark:text-teal-300 dark:hover:bg-teal-900/60'
              : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
          }`}
          title={cameraOpen ? 'Sembunyikan kamera' : 'Tampilkan kamera'}
          aria-label={cameraOpen ? 'Sembunyikan kamera' : 'Tampilkan kamera'}
          aria-pressed={cameraOpen}
        >
          <CameraToggleIcon active={cameraOpen} />
        </button>
      ) : null}
      {typeof onCariSantri === 'function' ? (
        <button
          type="button"
          onClick={onCariSantri}
          className="shrink-0 rounded-md border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Cari
        </button>
      ) : null}
    </div>
  )
}

function formatSaldo(n) {
  if (n == null || n === undefined) return '0'
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n))
}

function formatTanggalLahir(raw) {
  const s = String(raw || '').trim()
  if (!s || s === '0000-00-00') return '—'
  try {
    const d = new Date(`${s}T12:00:00`)
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return s
  }
}

export function evaluateCashlessAccountEligibility(detail) {
  if (!detail) {
    return { ok: false, reasons: ['Pilih santri terlebih dahulu.'] }
  }
  const reasons = []
  const nik = normalizeNikInput(detail.nik || '')
  if (nik.length !== 16 || !isNikValid(nik)) {
    reasons.push('NIK santri wajib 16 digit dan valid.')
  }
  if (!String(detail.tempat_lahir || '').trim()) {
    reasons.push('Tempat lahir santri wajib diisi.')
  }
  const ttl = String(detail.tanggal_lahir || '').trim()
  if (!ttl || ttl === '0000-00-00') {
    reasons.push('Tanggal lahir santri wajib diisi.')
  }
  return { ok: reasons.length === 0, reasons }
}

export default function CetakKartuSantriSidePanel({
  account,
  santriDetail,
  loading,
  onCariSantri,
  onBuatAkun,
  createSaving,
  onAccountRefresh,
  cameraOpen = true,
  onToggleCamera,
}) {
  const [activeTab, setActiveTab] = useState('detail')
  const santriId = santriDetail?.id ?? account?.entity_id ?? null
  const eligibility = useMemo(() => evaluateCashlessAccountEligibility(santriDetail), [santriDetail])
  const hasWallet = Boolean(account?.id)

  useEffect(() => {
    setActiveTab('detail')
  }, [santriId, account?.id])

  if (!santriDetail && !loading) {
    return (
      <div className="relative flex h-full flex-col">
        <div className="absolute right-0 top-0 z-10">
          <HeaderActions cameraOpen={cameraOpen} onToggleCamera={onToggleCamera} onCariSantri={onCariSantri} />
        </div>
        <div className="flex h-full flex-col items-center justify-center gap-4 px-4 py-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400">
          <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Detail santri</p>
          <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            Pilih baris di daftar kiri atau cari santri untuk melihat biodata, mengunggah foto, dan membuat akun cashless.
          </p>
        </div>
        <button
          type="button"
          onClick={onCariSantri}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          Cari santri
        </button>
        <div className="w-full rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-left dark:border-amber-800 dark:bg-amber-900/20">
          <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-100">Syarat buat akun cashless</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-[10px] text-amber-800 dark:text-amber-200">
            <li>NIK santri valid (16 digit)</li>
            <li>Tempat lahir terisi</li>
            <li>Tanggal lahir terisi</li>
          </ul>
        </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-500/30 border-t-teal-500" />
      </div>
    )
  }

  const nama = santriDetail?.nama || account?.entity_label || account?.name || '—'
  const nis = santriDetail?.nis ?? account?.nis ?? '—'
  const nik = normalizeNikInput(santriDetail?.nik || '') || '—'

  const tabs = [
    { id: 'detail', label: 'Detail' },
    { id: 'topup', label: 'Top Up' },
    { id: 'tarik', label: 'Tarik' },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div className="shrink-0 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Santri</p>
            <h2 className="truncate text-base font-bold leading-snug text-gray-900 dark:text-gray-100">{nama}</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">NIS {nis}</p>
          </div>
          <HeaderActions cameraOpen={cameraOpen} onToggleCamera={onToggleCamera} onCariSantri={onCariSantri} />
        </div>

        <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800/80">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-teal-700 shadow-sm dark:bg-gray-700 dark:text-teal-300'
                  : 'text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeTab === 'topup' ? (
          <CetakKartuSantriTopUpPanel
            account={account}
            santriId={santriId}
            onSuccess={onAccountRefresh}
          />
        ) : activeTab === 'tarik' ? (
          <CashlessWithdrawPanel
            entity="santri"
            account={account}
            santriId={santriId}
            onSuccess={onAccountRefresh}
          />
        ) : (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain">
            <dl className="grid grid-cols-1 gap-1.5 text-xs">
              <div>
                <dt className="text-[10px] text-gray-500">NIK</dt>
                <dd className="break-all font-mono text-gray-900 dark:text-gray-100">{nik}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-gray-500">Tempat, tanggal lahir</dt>
                <dd className="text-gray-900 dark:text-gray-100">
                  {[santriDetail?.tempat_lahir, formatTanggalLahir(santriDetail?.tanggal_lahir)]
                    .filter((v) => v && v !== '—')
                    .join(', ') || '—'}
                </dd>
              </div>
              {santriDetail?.gender ? (
                <div>
                  <dt className="text-[10px] text-gray-500">Jenis kelamin</dt>
                  <dd className="text-gray-900 dark:text-gray-100">{santriDetail.gender}</dd>
                </div>
              ) : null}
              {hasWallet ? (
                <>
                  <div>
                    <dt className="text-[10px] text-gray-500">Kode wallet</dt>
                    <dd className="font-mono text-gray-900 dark:text-gray-100">{account.code}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-gray-500">Saldo</dt>
                    <dd className="font-mono tabular-nums text-gray-900 dark:text-gray-100">
                      Rp {formatSaldo(account.balance_cached)}
                    </dd>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-2 dark:border-amber-800 dark:bg-amber-900/20">
                  <p className="text-[11px] font-medium text-amber-900 dark:text-amber-100">
                    Belum punya akun cashless
                  </p>
                  {!eligibility.ok ? (
                    <ul className="mt-1 list-inside list-disc space-y-0.5 text-[10px] text-amber-800 dark:text-amber-200">
                      {eligibility.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[10px] text-amber-800 dark:text-amber-200">
                      Biodata memenuhi syarat. Anda bisa membuat akun wallet dari sini.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={onBuatAkun}
                    disabled={createSaving || !eligibility.ok}
                    className="mt-2 w-full rounded-lg bg-teal-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    {createSaving ? 'Membuat…' : 'Buat akun cashless'}
                  </button>
                </div>
              )}
            </dl>

            <div className="border-t border-gray-100 pt-1 dark:border-gray-700">
              <CetakKartuSantriFotoPanel santriId={santriId} overlayZIndex={260} />
            </div>

            <div className="border-t border-gray-100 pt-3 dark:border-gray-700">
              <CetakKartuSantriBerkasPanel santriId={santriId} overlayZIndex={260} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
