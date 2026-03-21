import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { santriAPI, ijinAPI, kalenderAPI } from '../../../services/api'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import { getGambarUrl } from '../../../config/images'
import { getBulanName } from '../../Kalender/utils/bulanHijri'
import './PrintIjin.css'
import { mergePageMarginMm } from './printIjinMargin'

/** URL absolut agar logo ikut di jendela cetak (Chrome sering gagal dengan path relatif). */
function getLogoUrlAbsolut() {
  const url = getGambarUrl('/logo.png')
  if (typeof window === 'undefined') return url
  if (/^https?:\/\//i.test(url)) return url
  try {
    return new URL(url.startsWith('/') ? url : `/${url}`, window.location.origin).href
  } catch {
    return url
  }
}

/** Hari Masehi untuk surat (Ahad, bukan Minggu) */
const HARI_NAMA_MASEHI = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const BULAN_MASEHI = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

/** Y-m-d Hijriyah atau null */
function parseHijriYmd(s) {
  if (!s || typeof s !== 'string') return null
  const t = s.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
}

/**
 * Satu baris: Hari — dd bulan yyyy H · dd bulan yyyy M
 * (hari mengikuti tanggal Masehi; bulan Hijriyah & Masehi pakai nama Latin Indonesia)
 */
async function formatTanggalSurat(raw) {
  if (!raw || typeof raw !== 'string') return ''
  const t = raw.trim()
  const ymd = parseHijriYmd(t)
  if (!ymd) return t

  const [yStr, moStr, dStr] = ymd.split('-')
  const y = Number(yStr)
  const mo = Number(moStr)
  const d = Number(dStr)
  const hijriTeks = `${String(d).padStart(2, '0')} ${getBulanName(mo, 'hijriyah')} ${y}`

  try {
    const r = await kalenderAPI.get({ action: 'to_masehi', tanggal: ymd })
    const masehi = r?.masehi
    if (!masehi || masehi === '0000-00-00') {
      return `${hijriTeks} H`
    }
    const dt = new Date(`${masehi}T12:00:00`)
    const hari = HARI_NAMA_MASEHI[dt.getDay()]
    const [my, mm, md] = masehi.split('-').map(Number)
    const masehiTeks = `${String(md).padStart(2, '0')} ${BULAN_MASEHI[mm - 1]} ${my}`
    return `${hari} — ${hijriTeks} H · ${masehiTeks} M`
  } catch {
    return `${hijriTeks} H`
  }
}

/** Dari Y-m-d Hijriyah → "bulan.tahun" (angka, contoh 09.1446) */
function hijriYmdToBulanTahunAngka(hijriYmd) {
  if (!hijriYmd || hijriYmd === '0000-00-00') return '00.0000'
  const p = hijriYmd.trim().slice(0, 10).split('-')
  if (p.length !== 3) return '00.0000'
  const [y, m] = [p[0], p[1]]
  return `${m}.${y}`
}

/** Masehi Y-m-d untuk acuan nomor & TTD (tanggal_dibuat ijin, fallback hari ini) */
function masehiAcuanSurat(tanggalDibuatMasehi) {
  const raw = tanggalDibuatMasehi != null ? String(tanggalDibuatMasehi) : ''
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : new Date().toISOString().slice(0, 10)
}

/**
 * Nomor surat: IJN-id_ijin/PSA/bulan.tahun_hijriyah (hijriYmd dari API convert)
 */
function buildNomorSuratFromHijri(idIjin, hijriYmd) {
  const bt = hijriYmdToBulanTahunAngka(hijriYmd)
  const idPart = idIjin != null && idIjin !== '' ? String(idIjin) : '0'
  return `IJN-${idPart}/PSA/${bt}`
}

/** Teks tanggal Hijriyah untuk atas TTD: "dd NamaBulan yyyy H" */
function formatTanggalTtdHijriyah(hijriYmd) {
  if (!hijriYmd || hijriYmd === '0000-00-00') return '—'
  const p = hijriYmd.trim().slice(0, 10).split('-')
  if (p.length !== 3) return '—'
  const y = Number(p[0])
  const mo = Number(p[1])
  const d = Number(p[2])
  if (!y || !mo || !d) return '—'
  return `${String(d).padStart(2, '0')} ${getBulanName(mo, 'hijriyah')} ${y} H`
}

function SuratIjinContent({ ijin, santriData, tanggalFormatted, nomorSurat, tanggalTtdHijriyah, logoSrc }) {
  const nisTampil =
    santriData.nis != null && String(santriData.nis).trim() !== ''
      ? String(santriData.nis).trim()
      : '—'

  return (
    <article className="surat-ijin surat-ijin--half">
      {/* Bukan tag <header> & class tanpa substring "header": index.css print menyembunyikan header,[class*="header"] */}
      <div className="surat-ijin__kop" role="banner">
        <div className="surat-ijin__accent" aria-hidden />
        <div className="surat-ijin__logo-wrap">
          <img
            src={logoSrc}
            alt=""
            className="surat-ijin__logo"
            loading="eager"
            decoding="sync"
          />
        </div>
        <div className="surat-ijin__headline">
          <p className="surat-ijin__kicker">Surat ijin</p>
          <h1 className="surat-ijin__title">Perijinan Pesantren Salafiyah Al-Utsmani</h1>
          <p className="surat-ijin__subtitle">Beddian Jambesari Darus Sholah</p>
        </div>
      </div>

      <div className="surat-ijin__nomor-block">
        <div className="surat-ijin__nomor-ribbon" aria-hidden />
        <div className="surat-ijin__nomor-row">
          <span className="surat-ijin__nomor-badge">Nomor: {nomorSurat || '—'}</span>
        </div>
      </div>

      <div className="surat-ijin__body">
        <p className="surat-ijin__lead">
          Yang bertanda tangan di bawah ini, Kepala Pesantren Salafiyah Al-Utsmani, memberikan izin kepada:
        </p>

        <div className="surat-ijin__data">
          <table className="surat-ijin__table">
            <tbody>
              <tr>
                <th scope="row">Nama</th>
                <td>{santriData.nama || '—'}</td>
              </tr>
              <tr>
                <th scope="row">NIS</th>
                <td>{nisTampil}</td>
              </tr>
              <tr>
                <th scope="row">Diniyah</th>
                <td>
                  {[santriData.kelas_diniyah, santriData.kel_diniyah].filter(Boolean).join(' ') || '—'}
                  {santriData.id_diniyah != null && santriData.id_diniyah !== '' ? (
                    <span className="surat-ijin__meta"> (id_diniyah: {santriData.id_diniyah})</span>
                  ) : null}
                </td>
              </tr>
              <tr>
                <th scope="row">Formal</th>
                <td>
                  {[santriData.kelas_formal, santriData.kel_formal].filter(Boolean).join(' ') || '—'}
                  {santriData.id_formal != null && santriData.id_formal !== '' ? (
                    <span className="surat-ijin__meta"> (id_formal: {santriData.id_formal})</span>
                  ) : null}
                </td>
              </tr>
              <tr>
                <th scope="row">Kamar</th>
                <td>
                  {[santriData.daerah, santriData.kamar].filter(Boolean).join(' — ') || '—'}
                  {santriData.id_kamar != null && santriData.id_kamar !== '' ? (
                    <span className="surat-ijin__meta"> (id_kamar: {santriData.id_kamar})</span>
                  ) : null}
                </td>
              </tr>
              <tr>
                <th scope="row">Alasan</th>
                <td>
                  {ijin.alasan != null && String(ijin.alasan).trim() !== ''
                    ? String(ijin.alasan).trim()
                    : '—'}
                </td>
              </tr>
              {ijin.dari && (
                <tr>
                  <th scope="row">Dari</th>
                  <td className="surat-ijin__tanggal">
                    {tanggalFormatted[ijin.id]?.dari || ijin.dari}
                  </td>
                </tr>
              )}
              {ijin.sampai && (
                <tr>
                  <th scope="row">Sampai</th>
                  <td className="surat-ijin__tanggal">
                    {tanggalFormatted[ijin.id]?.sampai || ijin.sampai}
                  </td>
                </tr>
              )}
              {ijin.lama && (
                <tr>
                  <th scope="row">Lama</th>
                  <td>{ijin.lama}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="surat-ijin__closing">
          Demikian surat ijin ini dibuat untuk dapat dipergunakan sebagaimana mestinya.
        </p>
      </div>

      <footer className="surat-ijin__footer">
        <div className="surat-ijin__ttd surat-ijin__ttd--wali">
          <p className="surat-ijin__ttd-label">Mengetahui,</p>
          <p className="surat-ijin__ttd-role">Orang Tua / Wali</p>
          <div className="surat-ijin__ttd-line" />
          <p className="surat-ijin__ttd-name">
            ({santriData.ayah || santriData.wali || 'Orang Tua / Wali'})
          </p>
        </div>
        <div className="surat-ijin__ttd surat-ijin__ttd--kepala">
          <p className="surat-ijin__ttd-place">Beddian, {tanggalTtdHijriyah || '—'}</p>
          <p className="surat-ijin__ttd-role">KaBag Keamanan dan Ketertiban</p>
          <div className="surat-ijin__ttd-line" />
          <p className="surat-ijin__ttd-name">Lr. Ali Murtadho hamid</p>
        </div>
      </footer>

      {ijin.perpanjang && (
        <div className="surat-ijin__perpanjang">
          <span className="surat-ijin__perpanjang-label">Perpanjang</span>
          <span className="surat-ijin__perpanjang-val">
            {tanggalFormatted[ijin.id]?.perpanjang || ijin.perpanjang}
          </span>
        </div>
      )}
    </article>
  )
}

function PrintIjin({ santriId, ijinId, inOffcanvas = false, pageMarginMm }) {
  const [searchParams] = useSearchParams()
  const { tahunAjaran: tahunAjaranFromStore } = useTahunAjaranStore()
  const tahunAjaran = searchParams.get('tahun_ajaran') || tahunAjaranFromStore
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [ijinData, setIjinData] = useState(null)
  const [santriData, setSantriData] = useState(null)
  /** { [ijinId]: { dari, sampai, perpanjang } } teks sudah diformat untuk print */
  const [tanggalFormatted, setTanggalFormatted] = useState({})
  /** { [ijinId]: string } nomor surat lengkap */
  const [nomorSuratByIjin, setNomorSuratByIjin] = useState({})
  /** { [ijinId]: string } tanggal Hijriyah untuk baris atas TTD kanan */
  const [tanggalTtdHijriyahByIjin, setTanggalTtdHijriyahByIjin] = useState({})
  /** Data URL logo — dipakai agar kop/logo ikut di print (embedded, tidak hilang) */
  const [logoSrc, setLogoSrc] = useState(() => getLogoUrlAbsolut())

  useEffect(() => {
    const url = getLogoUrlAbsolut()
    let cancelled = false
    let sameOrigin = true
    try {
      sameOrigin = new URL(url, window.location.href).origin === window.location.origin
    } catch {
      sameOrigin = false
    }
    fetch(url, sameOrigin ? { credentials: 'same-origin' } : { mode: 'cors', credentials: 'omit' })
      .then(r => {
        if (!r.ok) throw new Error('logo fetch')
        return r.blob()
      })
      .then(
        blob =>
          new Promise((resolve, reject) => {
            const fr = new FileReader()
            fr.onload = () => resolve(fr.result)
            fr.onerror = reject
            fr.readAsDataURL(blob)
          })
      )
      .then(dataUrl => {
        if (!cancelled && typeof dataUrl === 'string') setLogoSrc(dataUrl)
      })
      .catch(() => {
        /* tetap pakai URL absolut */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Load data ijin dan santri
  useEffect(() => {
    const idToLoad = santriId || searchParams.get('id_santri')
    const ijinIdToLoad = ijinId || searchParams.get('ijin_id')

    if (!idToLoad) return

    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        const santriResult = await santriAPI.getById(idToLoad)

        if (!santriResult.success) {
          throw new Error(santriResult.message || 'Gagal mengambil data santri')
        }

        setSantriData(santriResult.data)

        const ijinResult = await ijinAPI.get(idToLoad, tahunAjaran)
        if (!ijinResult.success) {
          throw new Error(ijinResult.message || 'Gagal mengambil data ijin')
        }

        if (ijinIdToLoad && ijinResult.data) {
          const selectedIjin = ijinResult.data.find(
            i => String(i.id) === String(ijinIdToLoad)
          )
          setIjinData(selectedIjin ? [selectedIjin] : ijinResult.data)
        } else {
          setIjinData(ijinResult.data || [])
        }
      } catch (e) {
        console.error('Error loading ijin data:', e)
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [santriId, ijinId, searchParams, tahunAjaran])

  useEffect(() => {
    if (!ijinData?.length || !santriData) return
    let cancelled = false
    ;(async () => {
      const nextT = {}
      const nextN = {}
      const nextTtd = {}
      for (const ijin of ijinData) {
        const id = ijin.id
        nextT[id] = {
          dari: await formatTanggalSurat(ijin.dari),
          sampai: await formatTanggalSurat(ijin.sampai),
          perpanjang: await formatTanggalSurat(ijin.perpanjang)
        }
        const masehi = masehiAcuanSurat(ijin.tanggal_dibuat)
        let hijri = '0000-00-00'
        try {
          const r = await kalenderAPI.get({ action: 'convert', tanggal: masehi })
          if (r?.hijriyah && r.hijriyah !== '0000-00-00') hijri = r.hijriyah
        } catch {
          /* biarkan 0000-00-00 */
        }
        nextN[id] = buildNomorSuratFromHijri(ijin.id, hijri)
        nextTtd[id] = formatTanggalTtdHijriyah(hijri)
      }
      if (!cancelled) {
        setTanggalFormatted(nextT)
        setNomorSuratByIjin(nextN)
        setTanggalTtdHijriyahByIjin(nextTtd)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ijinData, santriData])

  if (loading) {
    return (
      <div className="print-ijin-container">
        <div className="loading">Memuat data surat ijin...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="print-ijin-container">
        <div className="error">{error}</div>
      </div>
    )
  }

  if (!santriData || !ijinData || ijinData.length === 0) {
    return (
      <div className="print-ijin-container">
        <div className="error">Data tidak ditemukan</div>
      </div>
    )
  }

  const margin = mergePageMarginMm(pageMarginMm)

  return (
    <div
      className={`print-ijin-page ${inOffcanvas ? 'print-ijin-in-offcanvas' : ''}`}
      style={{
        '--ijin-pad-top': `${margin.top}mm`,
        '--ijin-pad-right': `${margin.right}mm`,
        '--ijin-pad-bottom': `${margin.bottom}mm`,
        '--ijin-pad-left': `${margin.left}mm`,
      }}
    >
      <div className="print-ijin-container">
        {ijinData.map((ijin, index) => (
          <div key={ijin.id || index} className="print-ijin-sheet">
            <div className="print-ijin-duplex">
              <div className="print-ijin-half print-ijin-half--left">
                <SuratIjinContent
                  ijin={ijin}
                  santriData={santriData}
                  tanggalFormatted={tanggalFormatted}
                  nomorSurat={nomorSuratByIjin[ijin.id]}
                  tanggalTtdHijriyah={tanggalTtdHijriyahByIjin[ijin.id]}
                  logoSrc={logoSrc}
                />
              </div>
              <div className="print-ijin-half print-ijin-half--right">
                <SuratIjinContent
                  ijin={ijin}
                  santriData={santriData}
                  tanggalFormatted={tanggalFormatted}
                  nomorSurat={nomorSuratByIjin[ijin.id]}
                  tanggalTtdHijriyah={tanggalTtdHijriyahByIjin[ijin.id]}
                  logoSrc={logoSrc}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default PrintIjin
