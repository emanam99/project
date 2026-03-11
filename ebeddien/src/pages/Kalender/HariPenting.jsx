import { useState, useEffect, useCallback, useMemo } from 'react'
import HariPentingList from './components/HariPentingList'
import { hariPentingAPI, kalenderAPI } from '../../services/api'
import './Kalender.css'

const BULAN_MASEHI = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const BULAN_HIJRIYAH = ['Muharram', 'Safar', 'Rabiul Awal', 'Rabiul Akhir', 'Jumadil Awal', 'Jumadil Akhir', 'Rajab', "Sya'ban", 'Ramadhan', 'Syawal', 'Dzulkaidah', 'Dzulhijjah']

/** Urutkan list hari penting: tanggal paling rendah dulu (tanggal null/ kosong di akhir) */
function sortByTanggal(list) {
  return [...list].sort((a, b) => {
    const tglA = a.tanggal != null && a.tanggal !== '' ? Number(a.tanggal) : 99
    const tglB = b.tanggal != null && b.tanggal !== '' ? Number(b.tanggal) : 99
    return tglA - tglB
  })
}

export default function HariPentingPage() {
  const [tab, setTab] = useState('hijriyah')
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [hijriyahToday, setHijriyahToday] = useState(null)

  const now = useMemo(() => new Date(), [])
  const masehiYear = now.getFullYear()
  const masehiMonth = now.getMonth() + 1

  useEffect(() => {
    let cancelled = false
    const today = now.toISOString().slice(0, 10)
    const waktu = now.toTimeString().slice(0, 8)
    kalenderAPI.get({ action: 'today', tanggal: today, waktu })
      .then((res) => {
        if (cancelled || !res || !res.hijriyah || res.hijriyah === '0000-00-00') return
        const [y, m] = res.hijriyah.slice(0, 10).split('-').map(Number)
        setHijriyahToday({ year: y, month: m })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [now])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (tab === 'masehi') {
        const res = await hariPentingAPI.getList({ tahun: masehiYear, bulan: masehiMonth })
        const arr = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : [])
        setList(sortByTanggal(arr))
      } else {
        if (!hijriyahToday) {
          setList([])
          setLoading(false)
          return
        }
        const res = await hariPentingAPI.getList({ tahun: hijriyahToday.year, bulan: hijriyahToday.month })
        const arr = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : [])
        setList(sortByTanggal(arr))
      }
    } catch (e) {
      setList([])
    } finally {
      setLoading(false)
    }
  }, [tab, masehiYear, masehiMonth, hijriyahToday])

  useEffect(() => {
    load()
  }, [load])

  const monthLabel = useMemo(() => {
    if (tab === 'masehi') {
      return `Bulan ${BULAN_MASEHI[masehiMonth - 1]} ${masehiYear}`
    }
    if (tab === 'hijriyah' && hijriyahToday) {
      return `Bulan ${BULAN_HIJRIYAH[hijriyahToday.month - 1]} ${hijriyahToday.year} H`
    }
    return ''
  }, [tab, masehiYear, masehiMonth, hijriyahToday])

  return (
    <div className="kalender-page h-full min-h-0 flex flex-col overflow-hidden">
      <div className="kalender-page__content flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Tab Masehi / Hijriyah + label bulan – tetap di atas, tidak ikut scroll */}
        <div className="flex-shrink-0 flex flex-col gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab('masehi')}
              className={`kalender-page__tab flex-1 ${tab === 'masehi' ? 'kalender-page__tab--active' : ''}`}
            >
              Masehi
            </button>
            <button
              type="button"
              onClick={() => setTab('hijriyah')}
              className={`kalender-page__tab flex-1 ${tab === 'hijriyah' ? 'kalender-page__tab--active' : ''}`}
            >
              Hijriyah
            </button>
          </div>
          {monthLabel && (
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {monthLabel}
            </p>
          )}
        </div>
        {/* Daftar hari penting – hanya bagian ini yang scroll */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <HariPentingList list={list} loading={loading} onRefresh={load} tab={tab} />
        </div>
      </div>
    </div>
  )
}
