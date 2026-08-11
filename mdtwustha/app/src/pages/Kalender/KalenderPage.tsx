import { useState, useEffect, useCallback } from 'react'
import CalendarHijri from './components/CalendarHijri'
import CalendarMasehi from './components/CalendarMasehi'
import { kalenderGet, type KalenderToday } from '../../api/kalenderApi'
import {
  loadFontSettings,
  saveFontSettings,
  loadGridViewSettings,
  saveGridViewSettings,
  loadActiveTab,
  saveActiveTab,
} from './utils/kalenderStorage'
import { getTodayCache, setTodayCache } from './utils/kalenderCache'
import { getBulanName } from './utils/bulanHijri'
import { INDONESIAN_MONTHS } from './utils/dateRange'
import './Kalender.css'
import MaterialIcon from '../../components/MaterialIcon'
import { motion, AnimatePresence } from 'framer-motion'
import { tabPanelMotion } from '../../components/AnimatedPanel'
import { ContentSkeleton } from '../../components/LazyFallback'

function getInitialTodayState() {
  const tanggal = new Date().toISOString().slice(0, 10)
  const mem = getTodayCache(tanggal)
  if (mem) return { todayInfo: mem, loadingToday: false }
  return { todayInfo: null as KalenderToday | null, loadingToday: true }
}

function formatTodayMasehi(iso: string) {
  try {
    const d = new Date(iso + 'T12:00:00')
    return `${d.getDate()} ${INDONESIAN_MONTHS[d.getMonth()]} ${d.getFullYear()}`
  } catch {
    return iso
  }
}

function formatTodayHijri(ymd: string) {
  if (!ymd || ymd === '0000-00-00') return '-'
  const [y, m, d] = ymd.split('-').map(Number)
  return `${d} ${getBulanName(m, 'hijriyah')} ${y} H`
}

export default function KalenderPage() {
  const [state, setState] = useState(getInitialTodayState)
  const { todayInfo, loadingToday } = state

  const [activeTab, setActiveTab] = useState<'hijri' | 'masehi'>(loadActiveTab)
  const [fontSettings, setFontSettings] = useState(loadFontSettings)
  const [gridViewSettings, setGridViewSettings] = useState(loadGridViewSettings)

  const loadToday = useCallback(async () => {
    const tanggal = new Date().toISOString().slice(0, 10)
    const hasCache = !!getTodayCache(tanggal)
    if (!hasCache) setState((s) => ({ ...s, loadingToday: true }))
    try {
      const waktu = new Date().toTimeString().slice(0, 8)
      const todayRes = (await kalenderGet({ action: 'today', tanggal, waktu })) as KalenderToday
      if (todayRes?.masehi) {
        setTodayCache(tanggal, todayRes)
        setState({ todayInfo: todayRes, loadingToday: false })
      } else {
        setState((s) => ({ ...s, loadingToday: false }))
      }
    } catch {
      setState((s) => ({ ...s, loadingToday: false }))
    }
  }, [])

  useEffect(() => {
    loadToday()
  }, [loadToday])

  useEffect(() => {
    saveFontSettings(fontSettings)
  }, [fontSettings])

  useEffect(() => {
    saveGridViewSettings(gridViewSettings)
  }, [gridViewSettings])

  useEffect(() => {
    saveActiveTab(activeTab)
  }, [activeTab])

  const todayHijriYear =
    todayInfo?.hijriyah && todayInfo.hijriyah !== '0000-00-00'
      ? parseInt(todayInfo.hijriyah.slice(0, 4), 10)
      : null
  const todayHijriMonth =
    todayInfo?.hijriyah && todayInfo.hijriyah !== '0000-00-00'
      ? parseInt(todayInfo.hijriyah.slice(5, 7), 10)
      : null

  return (
    <div className="kalender-page h-[calc(100dvh-7rem)] min-h-[520px] flex flex-col overflow-hidden -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
      <div className="kalender-page__header flex-shrink-0">
        <h1 className="kalender-page__title">Kalender</h1>
        {todayInfo && (
          <div className="kalender-page__today">
            <span className="kalender-page__today-label">Hari ini:</span>
            <span className="kalender-page__today-masehi">{formatTodayMasehi(todayInfo.masehi)}</span>
            <span className="kalender-page__today-hijri">{formatTodayHijri(todayInfo.hijriyah)}</span>
          </div>
        )}
      </div>

      <div className="kalender-page__tabs flex-shrink-0">
        <button
          type="button"
          className={`kalender-page__tab ${activeTab === 'hijri' ? 'kalender-page__tab--active' : ''}`}
          onClick={() => setActiveTab('hijri')}
        >
          <MaterialIcon name="dark_mode" size={20} />
          Hijriyah
        </button>
        <button
          type="button"
          className={`kalender-page__tab ${activeTab === 'masehi' ? 'kalender-page__tab--active' : ''}`}
          onClick={() => setActiveTab('masehi')}
        >
          <MaterialIcon name="calendar_month" size={20} />
          Masehi
        </button>
      </div>

      <div className="kalender-page__content flex-1 min-h-0 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            className="h-full min-h-0"
            initial={tabPanelMotion.initial}
            animate={tabPanelMotion.animate}
            exit={tabPanelMotion.exit}
            transition={tabPanelMotion.transition}
          >
            {activeTab === 'hijri' &&
              (loadingToday ? (
                <div className="kalender-page__loading py-8">
                  <ContentSkeleton rows={5} className="max-w-md mx-auto" />
                </div>
              ) : (
                <CalendarHijri
                  initialYear={todayHijriYear ?? undefined}
                  initialMonth={todayHijriMonth ?? undefined}
                  todayHijriYear={todayHijriYear}
                  todayHijriMonth={todayHijriMonth}
                  fontSettings={fontSettings}
                  onFontSettingsChange={setFontSettings}
                  gridViewSettings={gridViewSettings}
                  onGridViewSettingsChange={setGridViewSettings}
                />
              ))}
            {activeTab === 'masehi' && (
              <CalendarMasehi
                fontSettings={fontSettings}
                onFontSettingsChange={setFontSettings}
                gridViewSettings={gridViewSettings}
                onGridViewSettingsChange={setGridViewSettings}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
