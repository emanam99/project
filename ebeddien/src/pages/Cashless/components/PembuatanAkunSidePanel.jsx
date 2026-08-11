import { useState, useEffect } from 'react'
import CashlessWalletTopUpPanel from './CashlessWalletTopUpPanel'
import CashlessWithdrawPanel from './CashlessWithdrawPanel'
import CashlessWalletDailyLimitForm from './CashlessWalletDailyLimitForm'

const ENTITY_LABELS = { SYSTEM: 'Sistem', SANTRI: 'Santri', PEDAGANG: 'Toko' }
const TYPE_LABELS = { ASSET: 'Asset', LIABILITY: 'Liability', INCOME: 'Income', EXPENSE: 'Expense', EQUITY: 'Equity' }

function formatSaldo(n) {
  if (n == null || n === undefined) return '0'
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n))
}

/**
 * Panel kanan Pembuatan Akun: detail + top-up + tarik (santri/toko).
 */
export default function PembuatanAkunSidePanel({
  account,
  onBuatAkunSantri,
  onBuatAkunToko,
  createSaving,
  tokoWithoutAccount = [],
  selectedTokoId,
  onSelectedTokoIdChange,
  loadingToko,
  onAccountRefresh,
}) {
  const [activeTab, setActiveTab] = useState('detail')
  const isWallet = account && (account.entity_type === 'SANTRI' || account.entity_type === 'PEDAGANG')
  const isSantri = account?.entity_type === 'SANTRI'
  const isToko = account?.entity_type === 'PEDAGANG'
  const isSystem = account?.entity_type === 'SYSTEM'

  useEffect(() => {
    setActiveTab('detail')
  }, [account?.id])

  if (!account) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto text-sm">
        <div className="mb-4 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-300">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Buat akun wallet</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Pilih baris di kiri untuk top-up / tarik, atau buat akun baru di bawah.
          </p>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Dari toko</p>
            <select
              value={selectedTokoId || ''}
              onChange={(e) => onSelectedTokoIdChange?.(e.target.value)}
              className="mb-2 w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              disabled={loadingToko}
            >
              <option value="">-- Pilih toko --</option>
              {tokoWithoutAccount.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nama_toko} ({t.kode_toko})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={createSaving || !selectedTokoId || tokoWithoutAccount.length === 0}
              onClick={onBuatAkunToko}
              className="w-full rounded-lg bg-teal-600 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {createSaving ? 'Membuat…' : 'Buat akun toko'}
            </button>
            {!loadingToko && tokoWithoutAccount.length === 0 ? (
              <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">Semua toko sudah punya akun.</p>
            ) : null}
          </div>

          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Dari santri</p>
            <button
              type="button"
              onClick={onBuatAkunSantri}
              className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-xs font-medium text-gray-600 hover:border-teal-500 hover:text-teal-600 dark:border-gray-600 dark:text-gray-300"
            >
              + Cari santri…
            </button>
          </div>
        </div>
      </div>
    )
  }

  const tabs = isWallet
    ? [
        { id: 'detail', label: 'Detail' },
        { id: 'topup', label: 'Top Up' },
        { id: 'tarik', label: 'Tarik' },
      ]
    : [{ id: 'detail', label: 'Detail' }]

  const title = account.entity_label || account.name || '—'

  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div className="shrink-0 space-y-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
            {ENTITY_LABELS[account.entity_type] || account.entity_type}
          </p>
          <h2 className="truncate text-base font-bold leading-snug text-gray-900 dark:text-gray-100">{title}</h2>
          <p className="mt-0.5 font-mono text-xs text-gray-500 dark:text-gray-400">{account.code}</p>
        </div>

        {isWallet ? (
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
        ) : null}
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeTab === 'topup' && isWallet ? (
          <CashlessWalletTopUpPanel
            entity={isToko ? 'toko' : 'santri'}
            account={account}
            santriId={isSantri ? account.entity_id : null}
            tokoId={isToko ? account.entity_id : null}
            onSuccess={onAccountRefresh}
          />
        ) : activeTab === 'tarik' && isWallet ? (
          <CashlessWithdrawPanel
            entity={isToko ? 'toko' : 'santri'}
            account={account}
            santriId={isSantri ? account.entity_id : null}
            tokoId={isToko ? account.entity_id : null}
            onSuccess={onAccountRefresh}
          />
        ) : (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain">
            <dl className="grid grid-cols-1 gap-2 text-xs">
              <div>
                <dt className="text-[10px] text-gray-500">Nama akun</dt>
                <dd className="text-gray-900 dark:text-gray-100">{account.name || '—'}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-gray-500">Tipe ledger</dt>
                <dd className="text-gray-900 dark:text-gray-100">{TYPE_LABELS[account.type] || account.type}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-gray-500">Saldo</dt>
                <dd className="font-mono text-base font-semibold tabular-nums text-teal-700 dark:text-teal-300">
                  Rp {formatSaldo(account.balance_cached)}
                </dd>
              </div>
            </dl>
            {isSantri ? (
              <CashlessWalletDailyLimitForm
                account={account}
                santriId={account.entity_id}
              />
            ) : null}
            {isSystem ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                Akun sistem tidak bisa di-top-up atau ditarik dari sini. Mutasi kas mengikuti top-up / tarik wallet.
              </p>
            ) : null}
            {isWallet ? (
              <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                Gunakan tab Top Up untuk menambah saldo, atau Tarik untuk mengeluarkan tunai (kas sistem ikut berkurang).
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
