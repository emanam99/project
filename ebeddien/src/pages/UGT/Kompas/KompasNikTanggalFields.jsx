import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { extractTanggalLahirFromNIK, normalizeNikInput } from '../../../utils/nikUtils'
import { ugtKompasAPI } from '../../../services/api'

export function calcAgeYears(tanggalLahir) {
  if (!tanggalLahir || !/^\d{4}-\d{2}-\d{2}$/.test(tanggalLahir)) return null
  const birth = new Date(`${tanggalLahir}T00:00:00`)
  const now = new Date()
  if (Number.isNaN(birth.getTime()) || birth > now) return null
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1
  return age
}

/**
 * Field NIK: counter 0/16, cek duplikat di latar, auto-isi TTL dari NIK.
 */
export default function KompasNikField({
  nik = '',
  tahunAjaran = '',
  excludeDaftarId = null,
  disabled = false,
  onNikChange,
  onTanggalLahirFromNik,
  labelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1',
  inputClass = '',
  accent = 'teal',
}) {
  const [nikCheck, setNikCheck] = useState(null)
  const [nikCheckMsg, setNikCheckMsg] = useState('')
  const [nikTtlWarn, setNikTtlWarn] = useState('')
  const checkSeq = useRef(0)
  const nikDigits = String(nik || '').replace(/\D/g, '')

  const okCls =
    accent === 'primary'
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-emerald-600 dark:text-emerald-400'
  const countOk =
    accent === 'primary'
      ? 'text-primary-600 dark:text-primary-400'
      : 'text-teal-600 dark:text-teal-400'

  useEffect(() => {
    if (nikDigits.length !== 16 || !tahunAjaran || disabled) {
      setNikCheck(null)
      setNikCheckMsg('')
      return undefined
    }
    const seq = ++checkSeq.current
    setNikCheck('checking')
    setNikCheckMsg('')
    const t = window.setTimeout(async () => {
      try {
        const res = await ugtKompasAPI.checkNik({
          nik: nikDigits,
          tahunAjaran,
          excludeDaftarId: excludeDaftarId || undefined,
        })
        if (seq !== checkSeq.current) return
        if (res?.success && res.data?.sudah_terdaftar) {
          setNikCheck('dup')
          setNikCheckMsg(
            res.data.nama_lomba
              ? `Pendaftar dengan NIK ini sudah terdaftar di «${res.data.nama_lomba}»`
              : 'Pendaftar dengan NIK ini sudah terdaftar di lomba lain tahun ini'
          )
        } else if (res?.success) {
          setNikCheck('ok')
          setNikCheckMsg('NIK belum terdaftar')
        } else {
          setNikCheck(null)
          setNikCheckMsg('')
        }
      } catch {
        if (seq !== checkSeq.current) return
        setNikCheck(null)
        setNikCheckMsg('')
      }
    }, 420)
    return () => window.clearTimeout(t)
  }, [nikDigits, tahunAjaran, excludeDaftarId, disabled])

  const handleNik = (raw) => {
    const next = normalizeNikInput(raw)
    onNikChange?.(next)
    setNikTtlWarn('')
    if (next.length === 16) {
      const ttl = extractTanggalLahirFromNIK(next)
      if (ttl) {
        onTanggalLahirFromNik?.(ttl)
        setNikTtlWarn('')
      } else {
        setNikTtlWarn('TTL dari NIK tidak valid — isi tanggal lahir manual')
      }
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className={`${labelClass} mb-0`}>NIK *</label>
        <span
          className={`font-mono text-[10px] tabular-nums ${
            nikDigits.length === 16 ? countOk : 'text-gray-400 dark:text-gray-500'
          }`}
        >
          {nikDigits.length}/16
        </span>
      </div>
      <input
        className={`${inputClass} font-mono tracking-wide`}
        inputMode="numeric"
        autoComplete="off"
        maxLength={16}
        value={nikDigits}
        onChange={(e) => handleNik(e.target.value)}
        disabled={disabled}
        required
        placeholder="16 digit NIK"
      />
      <AnimatePresence mode="wait">
        {nikCheck === 'checking' ? (
          <motion.p
            key="chk"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-500"
          >
            <span className="inline-block h-3 w-3 animate-spin rounded-full border border-gray-400 border-t-transparent" />
            Memeriksa NIK…
          </motion.p>
        ) : null}
        {nikCheck === 'ok' ? (
          <motion.p
            key="ok"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className={`mt-1 flex items-start gap-1.5 text-[11px] font-medium ${okCls}`}
          >
            <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path
                fillRule="evenodd"
                d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                clipRule="evenodd"
              />
            </svg>
            {nikCheckMsg}
          </motion.p>
        ) : null}
        {nikCheck === 'dup' ? (
          <motion.p
            key="dup"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="mt-1 flex items-start gap-1.5 text-[11px] font-medium text-red-600 dark:text-red-400"
          >
            <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
            {nikCheckMsg}
          </motion.p>
        ) : null}
        {nikTtlWarn ? (
          <motion.p
            key="ttl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-1 text-[11px] text-amber-700 dark:text-amber-300"
          >
            {nikTtlWarn}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/** Tanggal lahir + batas usia + peringatan merah jika di luar rentang. */
export function KompasTanggalLahirField({
  tanggalLahir = '',
  usiaMin = 0,
  usiaMax = 99,
  disabled = false,
  onChange,
  labelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1',
  inputClass = '',
}) {
  const age = calcAgeYears(tanggalLahir)
  const usiaOut = age !== null && (age < Number(usiaMin) || age > Number(usiaMax))

  return (
    <div>
      <label className={labelClass}>Tanggal lahir *</label>
      <input
        type="date"
        className={inputClass}
        value={tanggalLahir || ''}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        required
      />
      <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
        Batas usia lomba: {usiaMin}–{usiaMax} tahun
      </p>
      <AnimatePresence mode="wait">
        {age !== null ? (
          <motion.p
            key={usiaOut ? 'bad' : 'good'}
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`mt-0.5 text-[11px] font-medium ${
              usiaOut ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {usiaOut
              ? `Usia ${age} tahun — di luar rentang ${usiaMin}–${usiaMax}`
              : `Usia ${age} tahun — sesuai batas`}
          </motion.p>
        ) : tanggalLahir ? (
          <motion.p
            key="inv"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-0.5 text-[11px] font-medium text-red-600 dark:text-red-400"
          >
            Tanggal lahir tidak valid
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
