import { useEffect, useMemo, useState } from 'react'
import type { ReaderState } from '../../../types/wirid'
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

type Props = {
  state: ReaderState
}

export function HomePage({ state }: Props) {
  const [now, setNow] = useState(() => new Date())
  const [todayTanggal, setTodayTanggal] = useState(() => getBootPenanggalanPair())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
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

  const gambarBase = (import.meta.env.VITE_GAMBAR_BASE || '/gambar').replace(/\/$/, '')
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
    <div className="beranda-date-card">
      <div className="beranda-date-grid">
        <div>
          <small>Tanggal</small>
          <p>
            {hijriTampilBeranda}
            <span className="date-suffix">H</span>
          </p>
          <p>
            {masehiTampil}
            <span className="date-suffix">M</span>
          </p>
        </div>
        <div>
          <small>Hari &amp; Jam</small>
          <p>{hari}</p>
          <p className="beranda-jam">{jam} WIB</p>
        </div>
      </div>
    </div>
  )

  return (
    <section className="home-page home-page-beranda">
      <div className="hero-shell">
        <div className="hero-card hero-beranda">
          <div className="hero-main">
            <div className="hero-main-inner">
              <img src={heroIconSrc} alt="Nailul Murod" className="hero-icon hero-icon-center" />
              <div className="hero-title-wrap">
                <div className="hero-meta">
                  <span>Versi {APP_VERSION}</span>
                  <span>{state.source === 'api' ? 'Online' : state.source === 'cache' ? 'Offline' : '-'}</span>
                  <span>Sinkron {syncInfo}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="date-desktop">{dateBlock}</div>
        </div>
        <div className="date-mobile">{dateBlock}</div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <small>Total Bab</small>
          <strong>{totalBab}</strong>
        </div>
        <div className="stat-card">
          <small>Total Wirid</small>
          <strong>{totalWirid}</strong>
        </div>
      </div>
    </section>
  )
}
