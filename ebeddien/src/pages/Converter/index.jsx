import { useState, useMemo } from 'react'
import { getSlimApiUrl } from '../../services/api'
import { kalenderAPI } from '../../services/api'
import '../Kalender/Kalender.css'

const BASE = () => getSlimApiUrl()

export default function ConverterPage() {
  const [direction, setDirection] = useState('masehi-to-hijri')
  const [inputDate, setInputDate] = useState('')
  const [waktu, setWaktu] = useState('00:00:00')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(null)
  const [accordionOpen, setAccordionOpen] = useState(false)

  const baseUrl = useMemo(() => BASE(), [])

  const exampleMasehi = '2025-01-15'
  const exampleHijri = '1446-07-15'
  const urlToHijri = `${baseUrl}/kalender?action=convert&tanggal=${exampleMasehi}&waktu=00:00:00`
  const urlToMasehi = `${baseUrl}/kalender?action=to_masehi&tanggal=${exampleHijri}`

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const handleConvert = async () => {
    setError(null)
    setResult(null)
    const trimmed = (inputDate || '').trim()
    if (!trimmed) {
      setError('Masukkan tanggal terlebih dahulu.')
      return
    }
    setLoading(true)
    try {
      if (direction === 'masehi-to-hijri') {
        const res = await kalenderAPI.get({ action: 'convert', tanggal: trimmed, waktu })
        setResult(res)
      } else {
        const res = await kalenderAPI.get({ action: 'to_masehi', tanggal: trimmed })
        setResult(res)
      }
    } catch (e) {
      setError(e.message || 'Gagal konversi.')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden p-4 max-w-2xl mx-auto pb-24 md:pb-4">
      {/* Area konten – hanya bagian ini yang scroll */}
      <div className="flex-1 min-h-0 overflow-y-auto">
      {/* Converter langsung */}
      <section className="mb-6">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm">
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setDirection('masehi-to-hijri')}
              className={`kalender-page__tab flex-1 ${direction === 'masehi-to-hijri' ? 'kalender-page__tab--active' : ''}`}
            >
              Masehi → Hijriyah
            </button>
            <button
              type="button"
              onClick={() => setDirection('hijri-to-masehi')}
              className={`kalender-page__tab flex-1 ${direction === 'hijri-to-masehi' ? 'kalender-page__tab--active' : ''}`}
            >
              Hijriyah → Masehi
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {direction === 'masehi-to-hijri' ? 'Tanggal Masehi (YYYY-MM-DD)' : 'Tanggal Hijriyah (YYYY-MM-DD)'}
              </label>
              {direction === 'masehi-to-hijri' ? (
                <input
                  type="date"
                  value={inputDate}
                  onChange={(e) => setInputDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 dark:focus:ring-teal-400 dark:focus:border-teal-400"
                />
              ) : (
                <input
                  type="text"
                  value={inputDate}
                  onChange={(e) => setInputDate(e.target.value)}
                  placeholder="1446-07-15"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 dark:focus:ring-teal-400 dark:focus:border-teal-400"
                />
              )}
            </div>
            {direction === 'masehi-to-hijri' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Waktu (opsional, untuk setelah Maghrib)</label>
                <input
                  type="time"
                  value={waktu.slice(0, 5)}
                  onChange={(e) => setWaktu(e.target.value + ':00')}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 dark:focus:ring-teal-400 dark:focus:border-teal-400"
                />
              </div>
            )}
            <button
              type="button"
              onClick={handleConvert}
              disabled={loading}
              className="kalender-pengaturan__btn kalender-pengaturan__btn--primary w-full py-2.5"
            >
              {loading ? 'Mengonversi...' : 'Konversi'}
            </button>
          </div>
          {error && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          {result && !error && (
            <div className="mt-4 p-4 rounded-lg bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 text-sm space-y-1">
              {direction === 'masehi-to-hijri' ? (
                <>
                  <p><span className="text-gray-600 dark:text-gray-400">Masehi:</span> {result.masehi}</p>
                  <p><span className="text-gray-600 dark:text-gray-400">Hijriyah:</span> <strong className="text-teal-700 dark:text-teal-300">{result.hijriyah === '0000-00-00' ? 'Tidak ditemukan' : result.hijriyah}</strong></p>
                </>
              ) : (
                <>
                  <p><span className="text-gray-600 dark:text-gray-400">Hijriyah:</span> {result.hijriyah}</p>
                  <p><span className="text-gray-600 dark:text-gray-400">Masehi:</span> <strong className="text-teal-700 dark:text-teal-300">{result.masehi ?? 'Tidak ditemukan'}</strong></p>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Accordion: Untuk koneksi ke aplikasi lain (Link API + Cara pemakaian), default tertutup */}
      <section className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setAccordionOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          aria-expanded={accordionOpen}
        >
          <span>Untuk koneksi ke aplikasi lain</span>
          <svg
            className={`w-5 h-5 text-gray-500 dark:text-gray-400 shrink-0 transition-transform duration-200 ${accordionOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {accordionOpen && (
          <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-4 space-y-5 bg-gray-50/50 dark:bg-gray-800/50">
            {/* Link API (public) */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Link API (public)</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Base URL mengikuti lokasi saat ini: {typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'Lokal' : 'Server'}
              </p>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 space-y-2 text-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="flex-1 min-w-0 break-all text-teal-700 dark:text-teal-300 text-xs">{baseUrl}/kalender</code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`${baseUrl}/kalender`, 'base')}
                    className="kalender-pengaturan__btn kalender-pengaturan__btn--secondary text-xs py-1.5 px-2"
                  >
                    {copied === 'base' ? 'Tersalin' : 'Salin'}
                  </button>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-600 pt-2 mt-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Masehi → Hijriyah (contoh):</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="flex-1 min-w-0 break-all text-xs">{urlToHijri}</code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(urlToHijri, 'toHijri')}
                      className="kalender-pengaturan__btn kalender-pengaturan__btn--secondary text-xs py-1.5 px-2"
                    >
                      {copied === 'toHijri' ? 'Tersalin' : 'Salin'}
                    </button>
                  </div>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-600 pt-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Hijriyah → Masehi (contoh):</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="flex-1 min-w-0 break-all text-xs">{urlToMasehi}</code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(urlToMasehi, 'toMasehi')}
                      className="kalender-pengaturan__btn kalender-pengaturan__btn--secondary text-xs py-1.5 px-2"
                    >
                      {copied === 'toMasehi' ? 'Tersalin' : 'Salin'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Cara pemakaian */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Cara pemakaian</h3>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-sm text-gray-600 dark:text-gray-400 space-y-3">
                <p><strong>1. Masehi → Hijriyah</strong></p>
                <p>GET <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">/kalender?action=convert&amp;tanggal=YYYY-MM-DD&amp;waktu=HH:ii:ss</code></p>
                <ul className="list-disc list-inside pl-2 space-y-1">
                  <li><code>tanggal</code>: tanggal Masehi (format YYYY-MM-DD)</li>
                  <li><code>waktu</code>: opsional; jika setelah 17:30 dianggap masuk hari berikutnya untuk konversi</li>
                  <li>Response: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{"{ \"masehi\", \"hijriyah\", \"waktu\" }"}</code></li>
                </ul>
                <p><strong>2. Hijriyah → Masehi</strong></p>
                <p>GET <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">/kalender?action=to_masehi&amp;tanggal=YYYY-MM-DD</code></p>
                <ul className="list-disc list-inside pl-2 space-y-1">
                  <li><code>tanggal</code>: tanggal Hijriyah (format YYYY-MM-DD)</li>
                  <li>Response: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{"{ \"hijriyah\", \"masehi\" }"}</code></li>
                </ul>
                <p>Semua endpoint di atas <strong>public</strong> (tidak perlu login).</p>
              </div>
            </div>
          </div>
        )}
      </section>
      </div>
    </div>
  )
}
