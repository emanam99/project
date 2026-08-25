import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import { authAPI, cashlessAPI } from '../../../services/api'
import PinKeypad from '../../toko/components/PinKeypad'

const STEPS_SET = ['pin', 'confirm', 'auth']
const STEPS_CHANGE = ['old', 'pin', 'confirm', 'auth']

/**
 * Atur / ubah PIN kartu CS — verifikasi password myBeddien atau passkey/sidik jari.
 */
export default function CashlessPinOffcanvas({
  isOpen,
  onClose,
  mode = 'set', // 'set' | 'change'
  hasPasskey = false,
  onSuccess,
  onNotify,
  pinThreshold = 10000,
}) {
  const handleClose = useOffcanvasBackClose(isOpen, onClose)
  const isChange = mode === 'change'
  const steps = isChange ? STEPS_CHANGE : STEPS_SET

  const [stepIdx, setStepIdx] = useState(0)
  const [oldPin, setOldPin] = useState('')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const step = steps[stepIdx] || 'pin'
  const canPasskey = hasPasskey && browserSupportsWebAuthn()

  useEffect(() => {
    if (!isOpen) {
      setStepIdx(0)
      setOldPin('')
      setPin('')
      setConfirm('')
      setPassword('')
      setBusy(false)
      setError('')
    }
  }, [isOpen])

  const title =
    step === 'old'
      ? 'PIN lama'
      : step === 'pin'
        ? isChange
          ? 'PIN baru'
          : 'Atur PIN kartu'
        : step === 'confirm'
          ? 'Ulangi PIN'
          : 'Konfirmasi identitas'

  const hint =
    step === 'old'
      ? 'Masukkan PIN 6 digit yang dipakai saat ini'
      : step === 'pin'
        ? Number(pinThreshold) > 0
          ? `PIN dipakai saat belanja ≥ ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(pinThreshold)}. Kartu tanpa PIN tidak bisa transaksi.`
          : 'PIN dipakai di setiap belanja. Kartu tanpa PIN tidak bisa transaksi.'
        : step === 'confirm'
          ? 'Masukkan ulang PIN yang sama'
          : 'Masukkan password myBeddien atau verifikasi sidik jari / passkey'

  const currentValue =
    step === 'old' ? oldPin : step === 'pin' ? pin : step === 'confirm' ? confirm : ''

  const setCurrentValue = (v) => {
    setError('')
    if (step === 'old') setOldPin(v)
    else if (step === 'pin') setPin(v)
    else if (step === 'confirm') setConfirm(v)
  }

  const goNextFromPin = (digits) => {
    if (step === 'old') {
      setOldPin(digits)
      setStepIdx((i) => i + 1)
      return
    }
    if (step === 'pin') {
      setPin(digits)
      setStepIdx((i) => i + 1)
      return
    }
    if (step === 'confirm') {
      if (digits !== pin) {
        setError('Konfirmasi PIN tidak cocok')
        setConfirm('')
        return
      }
      setConfirm(digits)
      setStepIdx((i) => i + 1)
    }
  }

  const submitWithAuth = async (authPayload) => {
    setError('')
    const body = {
      pin,
      pin_confirm: confirm || pin,
      ...authPayload,
    }
    if (isChange) body.old_pin = oldPin
    const res = isChange
      ? await cashlessAPI.changeKartuPin(body)
      : await cashlessAPI.setKartuPin(body)
    if (res?.success) {
      onNotify?.(isChange ? 'PIN berhasil diubah' : 'PIN berhasil diatur', 'success')
      onSuccess?.()
      handleClose()
      return true
    }
    setError(res?.message || 'Gagal menyimpan PIN')
    return false
  }

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    if (busy) return
    if (!password.trim()) {
      setError('Password wajib diisi')
      return
    }
    setBusy(true)
    try {
      await submitWithAuth({ password: password.trim() })
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Gagal menyimpan PIN')
    } finally {
      setBusy(false)
    }
  }

  const handlePasskey = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const optRes = await authAPI.webauthnReauthOptions()
      if (!optRes?.success || !optRes.data?.options || !optRes.data?.challengeId) {
        throw new Error(optRes?.message || 'Gagal memulai verifikasi passkey')
      }
      const credential = await startAuthentication({ optionsJSON: optRes.data.options })
      await submitWithAuth({
        webauthn_challenge_id: optRes.data.challengeId,
        webauthn_credential: credential,
      })
    } catch (e) {
      const msg =
        e?.name === 'NotAllowedError'
          ? 'Verifikasi dibatalkan'
          : e.response?.data?.message || e.message || 'Verifikasi passkey gagal'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.button
            key="cashless-pin-backdrop"
            type="button"
            aria-label="Tutup"
            className="fixed inset-0 z-120 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />
          <motion.div
            key="cashless-pin-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cashless-pin-title"
            className="fixed inset-x-0 bottom-0 z-130 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white shadow-xl dark:bg-gray-900"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            <div className="mx-auto max-w-md px-4 pb-6 pt-3">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
              <div className="mb-1 flex items-start justify-between gap-2">
                <div>
                  <h2
                    id="cashless-pin-title"
                    className="text-base font-semibold text-gray-900 dark:text-white"
                  >
                    {title}
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="shrink-0 rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Tutup
                </button>
              </div>

              {error ? (
                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
                  {error}
                </p>
              ) : null}

              {step !== 'auth' ? (
                <div className="py-2">
                  <PinKeypad
                    value={currentValue}
                    onChange={setCurrentValue}
                    onSubmit={goNextFromPin}
                    disabled={busy}
                  />
                  {stepIdx > 0 ? (
                    <button
                      type="button"
                      className="mt-3 w-full text-center text-xs font-medium text-primary-600 dark:text-primary-400"
                      onClick={() => {
                        setError('')
                        setStepIdx((i) => Math.max(0, i - 1))
                      }}
                    >
                      Kembali
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3 py-2">
                  <form onSubmit={handlePasswordSubmit} className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                        Password myBeddien
                      </label>
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value)
                          setError('')
                        }}
                        disabled={busy}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                        placeholder="Password akun Anda"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy || !password.trim()}
                      className="w-full rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                    >
                      {busy ? 'Menyimpan…' : isChange ? 'Ubah PIN' : 'Simpan PIN'}
                    </button>
                  </form>

                  {canPasskey ? (
                    <>
                      <div className="relative py-1 text-center text-[11px] text-gray-400">
                        <span className="bg-white px-2 dark:bg-gray-900">atau</span>
                        <span className="absolute inset-x-0 top-1/2 -z-10 border-t border-gray-200 dark:border-gray-700" />
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={handlePasskey}
                        className="w-full rounded-xl border border-gray-300 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                      >
                        Verifikasi sidik jari / passkey
                      </button>
                    </>
                  ) : null}

                  <button
                    type="button"
                    className="w-full text-center text-xs font-medium text-primary-600 dark:text-primary-400"
                    onClick={() => {
                      setError('')
                      setStepIdx((i) => Math.max(0, i - 1))
                    }}
                  >
                    Kembali
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}
