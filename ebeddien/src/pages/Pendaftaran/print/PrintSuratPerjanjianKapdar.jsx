import { useState, useEffect } from 'react'
import { getGambarUrl } from '../../../config/images'
import { getTanggalFromAPI } from '../../../utils/hijriDate'

function val(b, key) {
  if (!b) return ''
  const x = b[key]
  if (x === null || x === undefined || String(x).trim() === '') return ''
  return String(x).trim()
}

function formatTTL(b) {
  const tl = val(b, 'tempat_lahir')
  const tg = b?.tanggal_lahir
  let tglStr = ''
  if (tg && /^\d{4}-\d{2}-\d{2}/.test(String(tg))) {
    const [y, m, d] = String(tg).slice(0, 10).split('-')
    tglStr = `${d}/${m}/${y}`
  } else if (tg) tglStr = String(tg)
  if (!tl && !tglStr) return '-'
  return [tl, tglStr].filter(Boolean).join(', ')
}

function alamatLengkap(b) {
  const parts = [
    b?.dusun,
    b?.rt && b?.rw ? `RT ${b.rt}/RW ${b.rw}` : '',
    b?.desa,
    b?.kecamatan,
    b?.kabupaten,
    b?.provinsi,
    b?.kode_pos ? `Kode Pos ${b.kode_pos}` : ''
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : '-'
}

function domisiliStr(b) {
  const d = [b?.daerah, b?.kamar].filter(Boolean).join('. ')
  return d || '-'
}

/**
 * Surat Perjanjian Kapdar — kop surat, nomor dari id registrasi PSB + bulan.tahun hijriyah (hari ini, dari API kalender).
 */
function PrintSuratPerjanjianKapdar({ biodata, registrasi }) {
  const b = biodata || {}
  const [bulanTahunHijriyah, setBulanTahunHijriyah] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { hijriyah } = await getTanggalFromAPI()
      if (cancelled) return
      const raw = (hijriyah && hijriyah !== '0000-00-00' && hijriyah !== '-') ? String(hijriyah).trim().substring(0, 10) : ''
      if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [hy, hm] = raw.split('-')
        setBulanTahunHijriyah(`${hm.padStart(2, '0')}.${hy}`)
      } else {
        setBulanTahunHijriyah('—')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const idReg = registrasi?.id != null && registrasi.id !== '' ? String(registrasi.id) : '—'
  const nomorSurat = `${idReg}/PSB/Y.AU/${bulanTahunHijriyah || '—'}`

  const namaWali = val(b, 'wali') || '-'
  const nikWali = val(b, 'nik_wali') || '-'
  const namaSantri = val(b, 'nama') || '-'
  const nikSantri = val(b, 'nik') || '-'

  return (
    <div className="print-surat-perjanjian-kapdar">
      <div className="surat-kop-wrap">
        <img src={getGambarUrl('/kop/surat.png')} alt="" className="surat-kop-img" />
      </div>

      <table className="surat-meta-table">
        <tbody>
          <tr>
            <td className="surat-meta-label">Nomor</td>
            <td className="surat-meta-colon">:</td>
            <td>{nomorSurat}</td>
          </tr>
          <tr>
            <td className="surat-meta-label">Lampiran</td>
            <td className="surat-meta-colon">:</td>
            <td>-</td>
          </tr>
          <tr>
            <td className="surat-meta-label">Perihal</td>
            <td className="surat-meta-colon">:</td>
            <td>Surat Perjanjian</td>
          </tr>
        </tbody>
      </table>

      <p className="surat-intro">Yang bertandatangan di bawah ini :</p>

      <div className="surat-section">
        <p className="surat-section-title">1. Sebagai Pihak Ke 1 (Wali Santri)</p>
        <div className="surat-isian-indent">
          <table className="surat-isian-table">
            <tbody>
              <tr>
                <td>Nama</td>
                <td>:</td>
                <td>{namaWali}</td>
              </tr>
              <tr>
                <td>NIK</td>
                <td>:</td>
                <td>{nikWali}</td>
              </tr>
            </tbody>
          </table>
          <p className="surat-sub">Wali santri dari</p>
          <table className="surat-isian-table">
            <tbody>
              <tr>
                <td>Nama</td>
                <td>:</td>
                <td>{namaSantri}</td>
              </tr>
              <tr>
                <td>NIK</td>
                <td>:</td>
                <td>{nikSantri}</td>
              </tr>
              <tr>
                <td>TTL</td>
                <td>:</td>
                <td>{formatTTL(b)}</td>
              </tr>
              <tr>
                <td>Alamat</td>
                <td>:</td>
                <td>{alamatLengkap(b)}</td>
              </tr>
              <tr>
                <td>Domisili</td>
                <td>:</td>
                <td>{domisiliStr(b)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="surat-section">
        <p className="surat-section-title">2. Sebagai Pihak Ke 2 (Pengurus)</p>
        <div className="surat-isian-indent">
          <table className="surat-isian-table">
            <tbody>
              <tr>
                <td>Kepala Daerah</td>
                <td>:</td>
                <td className="surat-blank"> </td>
              </tr>
              <tr>
                <td>Wakil Kepala Daerah</td>
                <td>:</td>
                <td className="surat-blank"> </td>
              </tr>
              <tr>
                <td>Ketua Kamar</td>
                <td>:</td>
                <td className="surat-blank"> </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="surat-janji-intro">Dengan ini kami Pihak ke 1 berjanji kepada Pihak ke 2</p>
      <div className="surat-janji-items">
        <div className="surat-janji-item">
          <span className="surat-janji-no">1.</span>
          <span className="surat-janji-text">
            Bersedia mematuhi semua tata tertib yang berlaku di Pesantren Salafiyah Al-Utsmani
          </span>
        </div>
        <div className="surat-janji-item">
          <span className="surat-janji-no">2.</span>
          <span className="surat-janji-text">
            Sanggup menerima segala sanksi dan kebijakan Pengasuh dan Pengurus Pesantren apabila kami melanggar kembali
            Peraturan Pesantren setelah menyepakati perjanjian ini.
          </span>
        </div>
        <div className="surat-janji-item">
          <span className="surat-janji-no">3.</span>
          <span className="surat-janji-text">
            Kami tidak akan menuntut kepada pihak yang berwajib atau pihak manapun mengenai sanksi kebijakan yang diambil
            oleh Pengasuh dan Pengurus Pesantren Salafiyah Al-Utsmani.
          </span>
        </div>
        <div className="surat-janji-item">
          <span className="surat-janji-no">4.</span>
          <span className="surat-janji-text">
            Apabila ada permasalahan antara PIHAK KE-1 dan PIHAK KE-2 maka akan diselesaikan dengan musyawarah dan secara
            kekeluargaan.
          </span>
        </div>
      </div>

      <p className="surat-penutup">
        Demikian perjanjian ini kami buat dengan sebenar-benarnya tanpa ada paksaan dari pihak manapun.
      </p>

      <p className="surat-mengadakan">Yang Mengadakan Perjanjian</p>

      <div className="surat-ttd-row">
        <div className="surat-ttd-col">
          <p className="surat-ttd-title">Pihak Ke 1</p>
          <div className="surat-ttd-space" />
          <p className="surat-ttd-nama">{namaWali}</p>
          <p className="surat-ttd-jab">Wali Santri</p>
        </div>
        <div className="surat-ttd-col">
          <p className="surat-ttd-title">Pihak Ke 2</p>
          <div className="surat-ttd-space" />
          <p className="surat-ttd-nama surat-blank"> </p>
          <p className="surat-ttd-jab">Kepala Daerah</p>
        </div>
      </div>
    </div>
  )
}

export default PrintSuratPerjanjianKapdar
