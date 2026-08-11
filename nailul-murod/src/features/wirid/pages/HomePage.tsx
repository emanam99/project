import type { MotionValue } from 'framer-motion'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import type { CSSProperties } from 'react'
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import type { ReaderState } from '../../../types/wirid'
import { useMainScrollEl } from '../../../contexts/MainScrollContext'
import {
  BULAN_HIJRIYAH,
  BULAN_MASEHI,
  formatDDMMMMYYYY,
  formatJamDetik,
  getBootPenanggalanPair,
  getHariIndonesia,
  getTanggalFromAPI,
} from '../../../utils/hijriDate'
import { groupByBab } from '../../../utils/groupByBab'
import { APP_VERSION } from '../../../config/version'
import { getGambarBase } from '../../../config/gambarBase'
import { slugify } from '../../../utils/slug'
import { getTopWiridOpens, type WiridOpenStatRow } from '../../../utils/wiridOpenStats'

type Props = {
  state: ReaderState
}

const BERANDA_LEAD_FULL =
  'Dzikir dan Wirid harian.\nBaca offline, ringkas di genggaman.'
const LEAD_CHARS_PER_SCROLL_PX = 0.038
/** Mengetik Arab: karakter per frame setelah kotak kitab terlihat */
const BOOK_AR_CHARS_PER_FRAME = 3

const DATE_OFFSCREEN_OPACITY = 0.1

function smoothstep01(t: number) {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

/** Kontainer scroll vertikal terdekat dari konten beranda (bukan asumsi ref `<main>` saja). */
function resolveVerticalScrollHost(start: HTMLElement | null, fallback: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = start
  while (node) {
    const oy = getComputedStyle(node).overflowY
    if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') return node
    node = node.parentElement
  }
  return fallback
}

function dateSlidePx() {
  if (typeof window === 'undefined') return 300
  return Math.min(420, Math.max(180, window.innerWidth * 0.34))
}

/** Sama sumber dengan logo: smoothProgress (spring dari introProgress). Rentang belakang agar animasi terjadi saat scroll ke zona tanggal. */
const DATE_T_LEFT: [number, number] = [0.28, 0.82]
const DATE_T_RIGHT: [number, number] = [0.3, 0.85]

/** Kemunculan berurutan; `p` = progress scroll mentah 0…1 (bukan spring — supaya di scrollTop 0 teks benar-benar hilang) */
const INTRO_EYEBROW_T: [number, number] = [0.06, 0.26]
const INTRO_TITLE_T: [number, number] = [0.12, 0.32]
const INTRO_LEAD_T: [number, number] = [0.18, 0.4]
const INTRO_BADGE_1_T: [number, number] = [0.26, 0.44]
const INTRO_BADGE_2_T: [number, number] = [0.32, 0.5]
const INTRO_BADGE_3_T: [number, number] = [0.38, 0.54]

const REST_REVEAL_T: [number, number] = [0.5, 0.72]
/** Setelah blok beranda (kartu kitab, stat, dll.) cukup terlihat — baru jalan animasi daftar "Paling sering dibuka" */
const FREQUENT_LIST_REVEAL_P = REST_REVEAL_T[0] + (REST_REVEAL_T[1] - REST_REVEAL_T[0]) * 0.38

const BERANDA_BOOK_AR_BLOCKS: readonly { text: string; className: string }[] = [
  {
    text: 'الكتاب : نيل المراد فى الأذكار والأوراد',
    className: 'beranda-book-ar-line beranda-book-ar-title',
  },
  {
    text: 'الجامع : محمد غزالى ابن عثمان بديانى',
    className: 'beranda-book-ar-line',
  },
  { text: 'الناشر : بديان ميديا', className: 'beranda-book-ar-line beranda-book-ar-publisher' },
  {
    text: 'جميع الحقوق الملكية والأدبية محفوظة للناشر',
    className: 'beranda-book-ar-line beranda-book-ar-rights',
  },
  {
    text:
      'النسخة المعروضة في هذا التطبيق رقمية وتستند إلى مصدر الناشر. يُمنع نسخ المحتوى أو إعادة نشره أو استخدامه تجارياً دون إذن خطي من الناشر.',
    className: 'beranda-book-ar-line beranda-book-ar-rights beranda-book-ar-legal',
  },
]

const BOOK_AR_TOTAL_CP = BERANDA_BOOK_AR_BLOCKS.reduce((n, b) => n + [...b.text].length, 0)

function bookCardIntersectsContainer(
  card: HTMLElement | null,
  container: HTMLElement | null,
  pad = 10,
): boolean {
  if (!card || !container) return false
  const c = container.getBoundingClientRect()
  const t = card.getBoundingClientRect()
  return t.bottom > c.top + pad && t.top < c.bottom - pad
}

function sliceBookArLine(blocks: readonly { text: string }[], lineIndex: number, budget: number): string {
  let used = 0
  for (let i = 0; i < lineIndex; i++) {
    used += [...blocks[i].text].length
  }
  const cp = [...blocks[lineIndex].text]
  const avail = budget - used
  if (avail <= 0) return ''
  return cp.slice(0, Math.min(cp.length, avail)).join('')
}

function bookArCumulativeCpThroughLine(blocks: readonly { text: string }[], endInclusive: number): number {
  let s = 0
  for (let i = 0; i <= endInclusive; i++) {
    s += [...blocks[i].text].length
  }
  return s
}

/** Jumlah code point sebelum baris `lineIndex` (untuk menyembunyikan baris yang belum mulai mengetik). */
function bookArCpBeforeLine(blocks: readonly { text: string }[], lineIndex: number): number {
  let s = 0
  for (let j = 0; j < lineIndex; j++) {
    s += [...blocks[j].text].length
  }
  return s
}

/**
 * Teks intro: selalu mengikuti `p` (scroll). Jangan paksa opacity 1 saat `prefers-reduced-motion`:
 * itu membuat seluruh blok terbaca sejak awal padahal logo/tanggal tetap mengikuti scroll.
 * Untuk reduce motion: tanpa translateY, interpolasi opacity linear.
 */
function introRevealStyle(
  reduce: boolean,
  p: number,
  range: [number, number],
  yMax: number,
): CSSProperties {
  const [a, b] = range
  if (p <= a) {
    return { opacity: 0, transform: reduce ? 'none' : `translateY(${yMax}px)` }
  }
  if (p >= b) {
    return { opacity: 1, transform: 'none' }
  }
  const t = (p - a) / (b - a)
  const e = reduce ? t : smoothstep01(t)
  return {
    opacity: e,
    transform: reduce ? 'none' : `translateY(${(1 - e) * yMax}px)`,
  }
}

function restRevealBlockStyle(reduce: boolean, p: number): CSSProperties {
  const [a, b] = REST_REVEAL_T
  if (p <= a) {
    return { opacity: 0, transform: reduce ? 'none' : 'translateY(8px)' }
  }
  if (p >= b) {
    return { opacity: 1, transform: 'none' }
  }
  const u = (p - a) / (b - a)
  const t = reduce ? u : smoothstep01(u)
  return { opacity: t, transform: reduce ? 'none' : `translateY(${8 * (1 - t)}px)` }
}

type BerandaDateScrollProps = {
  smoothProgress: MotionValue<number>
  reduceMotion: boolean
  hijri: string
  masehi: string
  hari: string
  jam: string
}

function BerandaDateScrollBlock({
  smoothProgress,
  reduceMotion,
  hijri,
  masehi,
  hari,
  jam,
}: BerandaDateScrollProps) {
  const reduceRef = useRef(reduceMotion)
  reduceRef.current = reduceMotion

  const [dist, setDist] = useState(() => dateSlidePx())
  useLayoutEffect(() => {
    const u = () => setDist(dateSlidePx())
    u()
    window.addEventListener('resize', u)
    return () => window.removeEventListener('resize', u)
  }, [])

  const xLeft = useTransform(smoothProgress, DATE_T_LEFT, [-dist, 0])
  const xRight = useTransform(smoothProgress, DATE_T_RIGHT, [dist, 0])

  const opLeft = useTransform(smoothProgress, (p) => {
    if (reduceRef.current) return 1
    const [a, b] = DATE_T_LEFT
    const t = Math.min(1, Math.max(0, (p - a) / (b - a)))
    return DATE_OFFSCREEN_OPACITY + (1 - DATE_OFFSCREEN_OPACITY) * smoothstep01(t)
  })
  const opRight = useTransform(smoothProgress, (p) => {
    if (reduceRef.current) return 1
    const [a, b] = DATE_T_RIGHT
    const t = Math.min(1, Math.max(0, (p - a) / (b - a)))
    return DATE_OFFSCREEN_OPACITY + (1 - DATE_OFFSCREEN_OPACITY) * smoothstep01(t)
  })

  return (
    <div className="beranda-date-card beranda-date-card--plain">
      <div className="beranda-date-grid">
        <motion.div
          className="beranda-date-col beranda-date-col-left beranda-date-reveal"
          style={{ x: xLeft, opacity: opLeft }}
        >
          <small>Tanggal</small>
          <p>
            {hijri}
            <span className="date-suffix">H</span>
          </p>
          <p>
            {masehi}
            <span className="date-suffix">M</span>
          </p>
        </motion.div>
        <motion.div
          className="beranda-date-col beranda-date-col-right beranda-date-reveal"
          style={{ x: xRight, opacity: opRight }}
        >
          <small>Hari & Jam</small>
          <p>{hari}</p>
          <p className="beranda-jam">
            {jam} WIB
          </p>
        </motion.div>
      </div>
    </div>
  )
}

export function HomePage({ state }: Props) {
  const mainScrollRef = useMainScrollEl()
  const introRef = useRef<HTMLDivElement>(null)
  const bookCardRef = useRef<HTMLDivElement>(null)
  const introProgress = useMotionValue(0)
  const lastScrollTopRef = useRef<number | null>(null)
  const [typedLeadLen, setTypedLeadLen] = useState(0)
  const [reduceMotion, setReduceMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  /** Progress scroll 0…1 — state React (bukan MotionValue) supaya opacity/translate teks pasti terpasang di DOM */
  const [introP, setIntroP] = useState(0)
  const [typedBookArLen, setTypedBookArLen] = useState(0)
  /** RAF mengetik Arab sampai selesai (dipicu saat kotak kitab terlihat) */
  const bookArAutotypeRafRef = useRef<number | null>(null)
  /** Supaya animasi Arab hanya dimulai sekali per siklus sampai reset scroll atas */
  const bookArTypingStartedRef = useRef(false)
  /** Jangan taruh introProgress/reduceMotion di deps efek scroll — bisa repasang listener tiap render (dev) & reset delta */
  const introProgressRef = useRef(introProgress)
  introProgressRef.current = introProgress
  const reduceRef = useRef(reduceMotion)
  reduceRef.current = reduceMotion

  const springConfig = useMemo(
    () =>
      reduceMotion
        ? { stiffness: 400, damping: 48, mass: 0.35 }
        : { stiffness: 48, damping: 30, mass: 0.58 },
    [reduceMotion],
  )
  const smoothProgress = useSpring(introProgress, springConfig)

  const [introNarrowViewport, setIntroNarrowViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 960px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 960px)')
    const fn = () => setIntroNarrowViewport(mq.matches)
    fn()
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  const logoScaleMax = introNarrowViewport ? 1.34 : 1.72
  const logoScale = useTransform(smoothProgress, [0, 0.42], [logoScaleMax, 1])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const fn = () => setReduceMotion(mq.matches)
    fn()
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  useEffect(() => {
    if (reduceMotion) {
      setTypedLeadLen(BERANDA_LEAD_FULL.length)
      setTypedBookArLen(BOOK_AR_TOTAL_CP)
      if (bookArAutotypeRafRef.current !== null) {
        cancelAnimationFrame(bookArAutotypeRafRef.current)
        bookArAutotypeRafRef.current = null
      }
    }
  }, [reduceMotion])

  const [frequentListEntrance, setFrequentListEntrance] = useState(false)
  useEffect(() => {
    if (reduceMotion) {
      setFrequentListEntrance(true)
      return
    }
    if (introP > FREQUENT_LIST_REVEAL_P) setFrequentListEntrance(true)
  }, [introP, reduceMotion])

  useLayoutEffect(() => {
    let mainFallback: HTMLElement | null = null
    let scrollHost: HTMLElement | null = null
    let raf = 0
    let attempts = 0

    const cancelBookArAutotype = () => {
      if (bookArAutotypeRafRef.current !== null) {
        cancelAnimationFrame(bookArAutotypeRafRef.current)
        bookArAutotypeRafRef.current = null
      }
    }

    const scheduleBookArTyping = () => {
      if (bookArAutotypeRafRef.current !== null) return
      if (reduceRef.current) return
      const step = () => {
        bookArAutotypeRafRef.current = null
        if (reduceRef.current) return
        setTypedBookArLen((len) => {
          if (len >= BOOK_AR_TOTAL_CP) return len
          const next = Math.min(BOOK_AR_TOTAL_CP, len + BOOK_AR_CHARS_PER_FRAME)
          if (next < BOOK_AR_TOTAL_CP) {
            bookArAutotypeRafRef.current = requestAnimationFrame(step)
          }
          return next
        })
      }
      bookArAutotypeRafRef.current = requestAnimationFrame(step)
    }

    const read = () => {
      if (!scrollHost) return
      const intro = introRef.current
      const h = intro?.offsetHeight ?? 0
      const range = Math.max(260, Math.min(560, Math.max(1, h) * 0.48))
      const st = scrollHost.scrollTop

      const p = Math.min(1, Math.max(0, st / range))
      introProgressRef.current.set(p)
      setIntroP(p)

      const bookInView = bookCardIntersectsContainer(bookCardRef.current, scrollHost)
      const reduce = reduceRef.current
      if (reduce) {
        cancelBookArAutotype()
        if (bookInView) setTypedBookArLen(BOOK_AR_TOTAL_CP)
      } else if (st < 72 && p < 0.14) {
        setTypedBookArLen(0)
        cancelBookArAutotype()
        bookArTypingStartedRef.current = false
      } else if (!reduce && bookInView && !bookArTypingStartedRef.current) {
        bookArTypingStartedRef.current = true
        scheduleBookArTyping()
      }

      if (lastScrollTopRef.current === null) {
        lastScrollTopRef.current = st
        return
      }
      const delta = st - lastScrollTopRef.current
      lastScrollTopRef.current = st
      if (reduceRef.current) return

      if (Math.abs(delta) >= 0.35) {
        setTypedLeadLen((len) => {
          const next = len + delta * LEAD_CHARS_PER_SCROLL_PX
          return Math.max(0, Math.min(BERANDA_LEAD_FULL.length, next))
        })
      }
    }

    const bindScrollHost = () => {
      if (!mainFallback) return
      const next = resolveVerticalScrollHost(introRef.current, mainFallback) ?? mainFallback
      if (next === scrollHost) return
      if (scrollHost) scrollHost.removeEventListener('scroll', read)
      scrollHost = next
      scrollHost.addEventListener('scroll', read, { passive: true })
    }

    const onResize = () => {
      bindScrollHost()
      read()
    }

    const attach = () => {
      mainFallback = mainScrollRef?.current ?? null
      if (!mainFallback) {
        attempts += 1
        if (attempts < 90) raf = requestAnimationFrame(attach)
        return
      }
      lastScrollTopRef.current = null
      bindScrollHost()
      read()
      requestAnimationFrame(() => {
        bindScrollHost()
        read()
      })
      window.addEventListener('resize', onResize, { passive: true })
    }

    attach()

    return () => {
      cancelBookArAutotype()
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      if (scrollHost) scrollHost.removeEventListener('scroll', read)
      mainFallback = null
      scrollHost = null
      lastScrollTopRef.current = null
    }
  }, [mainScrollRef])

  const [now, setNow] = useState(() => new Date())
  const [todayTanggal, setTodayTanggal] = useState(() => getBootPenanggalanPair())
  const [frequentOpens, setFrequentOpens] = useState<WiridOpenStatRow[]>(() =>
    typeof window !== 'undefined' ? getTopWiridOpens(10) : [],
  )

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const syncFrequent = () => setFrequentOpens(getTopWiridOpens(10))
    syncFrequent()
    window.addEventListener('nm-wirid-opens-changed', syncFrequent)
    window.addEventListener('storage', syncFrequent)
    return () => {
      window.removeEventListener('nm-wirid-opens-changed', syncFrequent)
      window.removeEventListener('storage', syncFrequent)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getTanggalFromAPI()
      .then((res) => {
        if (cancelled || !res) return
        setTodayTanggal((prev) => ({
          masehi: res.masehi?.slice(0, 10) || prev.masehi,
          hijriyah:
            res.hijriyah && res.hijriyah !== '-' ? String(res.hijriyah).slice(0, 10) : prev.hijriyah,
        }))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const gambarBase = getGambarBase()
  const heroIconSrc = `${gambarBase}/icon/nailul-murod-icon.png`
  const grouped = groupByBab(state.rows)
  const totalBab = grouped.length
  const totalWirid = state.rows.length
  const syncInfo = state.lastSyncAt
    ? state.lastSyncAt.toLocaleString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Belum sinkron'
  const hari = useMemo(() => getHariIndonesia(now), [now])
  const jam = useMemo(() => formatJamDetik(now), [now])
  const hijriTampilBeranda =
    formatDDMMMMYYYY(todayTanggal.hijriyah, BULAN_HIJRIYAH) ??
    (todayTanggal.masehi ? '...' : '-')
  const masehiTampil = formatDDMMMMYYYY(todayTanggal.masehi, BULAN_MASEHI) ?? '-'

  const dateBlock = (
    <BerandaDateScrollBlock
      smoothProgress={smoothProgress}
      reduceMotion={reduceMotion}
      hijri={hijriTampilBeranda}
      masehi={masehiTampil}
      hari={hari}
      jam={jam}
    />
  )

  const leadShown = Math.min(BERANDA_LEAD_FULL.length, Math.floor(typedLeadLen))
  const leadSlice = BERANDA_LEAD_FULL.slice(0, leadShown)
  const leadTypingIncomplete = !reduceMotion && typedLeadLen < BERANDA_LEAD_FULL.length - 0.01

  const restBlockStyle = restRevealBlockStyle(reduceMotion, introP)

  /* Jangan pakai cap dari bookTypeP (sering 0 karena ambang 0.76) — itu yang bikin teks Arab tak pernah tampil */
  const bookArBudget = reduceMotion
    ? BOOK_AR_TOTAL_CP
    : Math.min(Math.floor(typedBookArLen), BOOK_AR_TOTAL_CP)
  const showBookArDivider =
    bookArBudget >= bookArCumulativeCpThroughLine(BERANDA_BOOK_AR_BLOCKS, 2)

  return (
    <section className="home-page home-page-beranda">
      <div ref={introRef} className="beranda-intro">
        <div className="beranda-intro-inner">
          <motion.img
            src={heroIconSrc}
            alt="Logo Nailul Murod"
            className="hero-icon hero-icon-center beranda-hero-logo beranda-intro-logo"
            style={{ scale: logoScale }}
            draggable={false}
          />
          <div className="beranda-intro-copy">
            <p className="beranda-eyebrow" style={introRevealStyle(reduceMotion, introP, INTRO_EYEBROW_T, 11)}>
              AL-UTSMANI
            </p>
            <h1 className="beranda-display-title" style={introRevealStyle(reduceMotion, introP, INTRO_TITLE_T, 14)}>
              Nailul Murod
            </h1>
            <p
              className="beranda-lead"
              aria-label={BERANDA_LEAD_FULL}
              style={introRevealStyle(reduceMotion, introP, INTRO_LEAD_T, 16)}
            >
              <span className="beranda-lead-type">{leadSlice}</span>
              {leadTypingIncomplete ? <span className="beranda-lead-caret" aria-hidden="true" /> : null}
            </p>
            <div className="hero-meta beranda-meta">
              <span style={introRevealStyle(reduceMotion, introP, INTRO_BADGE_1_T, 9)}>Versi {APP_VERSION}</span>
              <span style={introRevealStyle(reduceMotion, introP, INTRO_BADGE_2_T, 9)}>
                {state.source === 'api' ? 'Online' : state.source === 'cache' ? 'Offline' : '-'}
              </span>
              <span style={introRevealStyle(reduceMotion, introP, INTRO_BADGE_3_T, 9)}>Sinkron {syncInfo}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="hero-shell beranda-hero-after beranda-hero-date-row">
        <div className="beranda-date-hero beranda-date-shell beranda-date-hero--desktop-only">
          <div className="date-desktop">{dateBlock}</div>
        </div>
        <div className="date-mobile">{dateBlock}</div>
      </div>

      <div
        ref={bookCardRef}
        className="beranda-book-card"
        role="article"
        aria-label="Sumber materi dan hak cipta"
        style={restBlockStyle}
      >
        <div className="beranda-book-card-glow" aria-hidden="true" />
        <div className="beranda-book-card-inner">
          <div className="beranda-book-ar-stack">
            {/* Lapisan ukuran: teks Arab penuh (tersembunyi) supaya kotak tidak memanjang saat mengetik */}
            <div
              lang="ar"
              dir="rtl"
              className="beranda-book-ar beranda-book-ar--measure"
              aria-hidden="true"
            >
              {BERANDA_BOOK_AR_BLOCKS.map((block, i) => (
                <Fragment key={`m-${i}`}>
                  <p className={block.className}>{block.text}</p>
                  {i === 2 ? <div className="beranda-book-ar-divider" aria-hidden /> : null}
                </Fragment>
              ))}
            </div>
            <div
              lang="ar"
              dir="rtl"
              className="beranda-book-ar beranda-book-ar--live"
              aria-label={BERANDA_BOOK_AR_BLOCKS.map((b) => b.text).join(' ')}
            >
              {BERANDA_BOOK_AR_BLOCKS.map((block, i) => {
                const cpBefore = bookArCpBeforeLine(BERANDA_BOOK_AR_BLOCKS, i)
                if (bookArBudget <= cpBefore) return null
                const slice = sliceBookArLine(BERANDA_BOOK_AR_BLOCKS, i, bookArBudget)
                const cp = [...block.text]
                const sliceCp = [...slice]
                const showCaret =
                  !reduceMotion &&
                  bookArBudget < BOOK_AR_TOTAL_CP &&
                  sliceCp.length > 0 &&
                  sliceCp.length < cp.length
                return (
                  <Fragment key={i}>
                    <p className={block.className}>
                      {slice}
                      {showCaret ? <span className="beranda-book-ar-caret" aria-hidden="true" /> : null}
                    </p>
                    {i === 2 && showBookArDivider ? (
                      <div className="beranda-book-ar-divider" aria-hidden="true" />
                    ) : null}
                  </Fragment>
                )
              })}
            </div>
          </div>
          <p className="beranda-book-id" lang="id">
            Aplikasi ini menampilkan materi secara digital berdasarkan sumber penerbit. Penggunaan di luar aplikasi
            mengikuti izin dan ketentuan penerbit.
          </p>
        </div>
      </div>

      <div className="stats-grid" style={restBlockStyle}>
        <div className="stat-card">
          <small>Total Bab</small>
          <strong>{totalBab}</strong>
        </div>
        <div className="stat-card">
          <small>Total Wirid</small>
          <strong>{totalWirid}</strong>
        </div>
      </div>

      {frequentOpens.length > 0 ? (
        <div className="beranda-frequent" style={restBlockStyle}>
          <h2 className="beranda-frequent-heading">Paling sering dibuka</h2>
          <ul className="beranda-frequent-timeline">
            {frequentOpens.map((row, index) => {
              const to = `/list/${slugify(row.bab)}/${slugify(row.judul)}-${row.id}`
              const isLast = index === frequentOpens.length - 1
              return (
                <motion.li
                  key={row.id}
                  className="beranda-frequent-tl-item"
                  initial={reduceMotion ? false : { opacity: 0, x: 72 }}
                  animate={
                    reduceMotion || frequentListEntrance
                      ? { opacity: 1, x: 0 }
                      : { opacity: 0, x: 72 }
                  }
                  transition={{
                    duration: 0.95,
                    ease: [0.16, 1, 0.3, 1],
                    delay: reduceMotion ? 0 : index * 0.16,
                  }}
                >
                  <div className="beranda-frequent-tl-track">
                    {!isLast ? <span className="beranda-frequent-tl-line" aria-hidden /> : null}
                    <span className="beranda-frequent-tl-dot" aria-hidden />
                  </div>
                  <div className="beranda-frequent-tl-body">
                    <NavLink to={to} className="beranda-frequent-tl-link">
                      <div className="beranda-frequent-tl-text">
                        <p className="beranda-frequent-tl-title">{row.judul}</p>
                        <p className="beranda-frequent-tl-sub">
                          <span className="beranda-frequent-tl-bab">{row.bab}</span>
                          <span className="beranda-frequent-tl-sep" aria-hidden>
                            ·
                          </span>
                          <span className="beranda-frequent-tl-opens" title={`Dibuka ${row.count} kali`}>
                            {row.count}× dibuka
                          </span>
                        </p>
                      </div>
                      <span className="beranda-frequent-tl-chevron" aria-hidden>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
                        </svg>
                      </span>
                    </NavLink>
                  </div>
                </motion.li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
