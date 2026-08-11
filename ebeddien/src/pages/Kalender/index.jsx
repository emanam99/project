import { useState, useEffect, useCallback } from 'react'
import CalendarHijri from './components/CalendarHijri'
import CalendarMasehi from './components/CalendarMasehi'
import TambahHariPentingPribadiOffcanvas from './components/TambahHariPentingPribadiOffcanvas'
import { kalenderAPI } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { loadFontSettings, saveFontSettings, loadGridViewSettings, saveGridViewSettings, loadShowHariPentingMarkers, saveShowHariPentingMarkers, loadActiveTab, saveActiveTab } from './utils/kalenderStorage'
import { idbGetToday, readTodayPenanggalanSync } from '../../services/hijriPenanggalanStorage'
import { getTodayCache, setTodayCache } from './utils/kalenderCache'
import { persistPenanggalanHariIni } from '../../utils/hijriDate'
import './Kalender.css'

function getInitialTodayState() {
  const tanggal = new Date().toISOString().slice(0, 10)
  const mem = getTodayCache(tanggal)
  if (mem) return { todayInfo: mem, loadingToday: false }
  const mirror = readTodayPenanggalanSync()
  if (mirror && String(mirror.masehi).slice(0, 10) === tanggal && mirror.hijriyah) {
    const info = { masehi: mirror.masehi, hijriyah: mirror.hijriyah }
    return { todayInfo: info, loadingToday: false }
  }
  return { todayInfo: null, loadingToday: true }
}

export default function KalenderPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const token = useAuthStore((s) => s.token)
  const canTambahPribadi = Boolean(isAuthenticated && token)

  const [hariPentingRefreshKey, setHariPentingRefreshKey] = useState(0)
  const [personalPayload, setPersonalPayload] = useState(null)

  const [state, setState] = useState(getInitialTodayState)
  const { todayInfo, loadingToday } = state
  const setTodayInfo = (v) => setState((s) => ({ ...s, todayInfo: v }))
  const setLoadingToday = (v) => setState((s) => ({ ...s, loadingToday: v }))

  const [activeTab, setActiveTab] = useState(loadActiveTab)
  const [fontSettings, setFontSettings] = useState(loadFontSettings)
  const [gridViewSettings, setGridViewSettings] = useState(loadGridViewSettings)
  const [showHariPentingMarkers, setShowHariPentingMarkers] = useState(loadShowHariPentingMarkers)

  const loadToday = useCallback(async () => {
    const tanggal = new Date().toISOString().slice(0, 10)
    const hasCache = !!getTodayCache(tanggal) || !!readTodayPenanggalanSync()
    if (!hasCache) setLoadingToday(true)
    try {
      const waktu = new Date().toTimeString().slice(0, 8)
      const todayRes = await kalenderAPI.get({ action: 'today', tanggal, waktu })
      const data = Array.isArray(todayRes) ? null : todayRes
      if (data) persistPenanggalanHariIni(data)
      setTodayInfo(data)
    } catch (e) {
      setTodayInfo((prev) => prev)
    } finally {
      setLoadingToday(false)
    }
  }, [])

  useEffect(() => {
    loadToday()
  }, [loadToday])

  useEffect(() => {
    let cancelled = false
    if (todayInfo != null) return
    const tanggal = new Date().toISOString().slice(0, 10)
    if (readTodayPenanggalanSync()) return
    ;(async () => {
      const row = await idbGetToday(tanggal)
      const p = row?.payload
      if (cancelled || !p || Array.isArray(p) || !p.hijriyah || p.hijriyah === '0000-00-00') return
      setTodayInfo(p)
      setLoadingToday(false)
      persistPenanggalanHariIni(p)
    })()
    return () => { cancelled = true }
  }, [todayInfo])

  useEffect(() => {
    saveFontSettings(fontSettings)
  }, [fontSettings])

  useEffect(() => {
    saveGridViewSettings(gridViewSettings)
  }, [gridViewSettings])

  useEffect(() => {
    saveShowHariPentingMarkers(showHariPentingMarkers)
  }, [showHariPentingMarkers])

  useEffect(() => {
    saveActiveTab(activeTab)
  }, [activeTab])

  const handleRequestTambahPribadi = useCallback((payload) => {
    setPersonalPayload(payload)
  }, [])

  const bumpHariPenting = useCallback(() => {
    setHariPentingRefreshKey((k) => k + 1)
  }, [])

  const personalOffcanvasOpen = personalPayload != null

  return (
    <div className="kalender-page h-full min-h-0 flex flex-col overflow-hidden">
      <TambahHariPentingPribadiOffcanvas
        open={personalOffcanvasOpen}
        payload={personalPayload}
        onClose={() => setPersonalPayload(null)}
        onSaved={bumpHariPenting}
      />
      {/* Tab Hijriyah / Masehi – tetap di atas, tidak ikut scroll */}
      <div className="kalender-page__tabs flex-shrink-0">
        <button
          type="button"
          className={`kalender-page__tab ${activeTab === 'hijri' ? 'kalender-page__tab--active' : ''}`}
          onClick={() => setActiveTab('hijri')}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
          Hijriyah
        </button>
        <button
          type="button"
          className={`kalender-page__tab ${activeTab === 'masehi' ? 'kalender-page__tab--active' : ''}`}
          onClick={() => setActiveTab('masehi')}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Masehi
        </button>
      </div>

      {/* Area kalender – hanya bagian ini yang scroll */}
      <div className="kalender-page__content flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'hijri' && (
          loadingToday
            ? (
              <div className="kalender-page__loading">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-600 border-t-transparent" />
                <p>Memuat kalender...</p>
              </div>
            )
            : (
              <CalendarHijri
                initialYear={todayInfo?.hijriyah && todayInfo.hijriyah !== '0000-00-00'
                  ? parseInt(todayInfo.hijriyah.slice(0, 4), 10)
                  : undefined}
                initialMonth={todayInfo?.hijriyah && todayInfo.hijriyah !== '0000-00-00'
                  ? parseInt(todayInfo.hijriyah.slice(5, 7), 10)
                  : undefined}
                todayHijriYear={todayInfo?.hijriyah && todayInfo.hijriyah !== '0000-00-00' ? parseInt(todayInfo.hijriyah.slice(0, 4), 10) : null}
                todayHijriMonth={todayInfo?.hijriyah && todayInfo.hijriyah !== '0000-00-00' ? parseInt(todayInfo.hijriyah.slice(5, 7), 10) : null}
                fontSettings={fontSettings}
                onFontSettingsChange={setFontSettings}
                gridViewSettings={gridViewSettings}
                onGridViewSettingsChange={setGridViewSettings}
                showHariPentingMarkers={showHariPentingMarkers}
                onShowHariPentingMarkersChange={setShowHariPentingMarkers}
                hariPentingRefreshKey={hariPentingRefreshKey}
                onRequestTambahPribadi={handleRequestTambahPribadi}
                canTambahPribadi={canTambahPribadi}
              />
            )
        )}
        {activeTab === 'masehi' && (
          <CalendarMasehi
            fontSettings={fontSettings}
            onFontSettingsChange={setFontSettings}
            gridViewSettings={gridViewSettings}
            onGridViewSettingsChange={setGridViewSettings}
            showHariPentingMarkers={showHariPentingMarkers}
            onShowHariPentingMarkersChange={setShowHariPentingMarkers}
            hariPentingRefreshKey={hariPentingRefreshKey}
            onRequestTambahPribadi={handleRequestTambahPribadi}
            canTambahPribadi={canTambahPribadi}
          />
        )}
      </div>
    </div>
  )
}
