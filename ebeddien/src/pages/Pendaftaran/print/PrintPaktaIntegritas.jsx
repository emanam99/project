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
    b?.kode_pos ? `${b.kode_pos}` : ''
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : '-'
}

function noTelponOrtu(b) {
  return val(b, 'no_telpon') || val(b, 'whatsapp') || val(b, 'no_wa') || '-'
}

/** Tanggal cetak: "Bondowoso, Selasa 09 Desember 2025" */
function tanggalPernyataan(b) {
  const kota = val(b, 'kabupaten') || 'Bondowoso'
  const d = new Date()
  const hari = d.toLocaleDateString('id-ID', { weekday: 'long' })
  const tgl = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
  return `${kota}, ${hari} ${tgl}`
}

/** Nama sekretaris (template PSB) — bisa diganti jika nanti dari pengaturan. */
const NAMA_SEKRETARIS_UMUM = 'Baqir Shonhadji'

/**
 * Pakta Integritas — kop sama dengan Surat Perjanjian Kapdar.
 */
function PrintPaktaIntegritas({ biodata, registrasi }) {
  const b = biodata || {}
  const [bulanTahunHijriyah, setBulanTahunHijriyah] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { hijriyah } = await getTanggalFromAPI()
      if (cancelled) return
      const raw =
        hijriyah && hijriyah !== '0000-00-00' && hijriyah !== '-' ? String(hijriyah).trim().substring(0, 10) : ''
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

  return (
    <div className="print-surat-perjanjian-kapdar print-pakta-integritas">
      <div className="surat-kop-wrap">
        <img src={getGambarUrl('/kop/surat.png')} alt="" className="surat-kop-img" />
      </div>

      <div className="pakta-judul-block">
        <div className="pakta-judul-heading-wrap">
          <h1 className="pakta-judul">PAKTA INTEGRITAS</h1>
          <div className="pakta-garis" aria-hidden="true" />
        </div>
        <p className="pakta-no-baris">
          No : {nomorSurat}
        </p>
      </div>

      <p className="surat-intro pakta-intro-spaced">Yang bertanda tangan di bawah ini :</p>

      <div className="surat-isian-indent pakta-isian-ortu">
        <table className="surat-isian-table">
          <tbody>
            <tr>
              <td>Nama Ayah</td>
              <td>:</td>
              <td>{val(b, 'ayah') || '-'}</td>
            </tr>
            <tr>
              <td>NIK</td>
              <td>:</td>
              <td>{val(b, 'nik_ayah') || '-'}</td>
            </tr>
            <tr>
              <td>Nama Ibu</td>
              <td>:</td>
              <td>{val(b, 'ibu') || '-'}</td>
            </tr>
            <tr>
              <td>NIK</td>
              <td>:</td>
              <td>{val(b, 'nik_ibu') || '-'}</td>
            </tr>
            <tr>
              <td>No Telpon</td>
              <td>:</td>
              <td>{noTelponOrtu(b)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="pakta-subjudul">Sebagai Orang Tua / Wali dari :</p>

      <div className="surat-isian-indent pakta-isian-santri">
        <table className="surat-isian-table">
          <tbody>
            <tr>
              <td>Nama</td>
              <td>:</td>
              <td>{val(b, 'nama') || '-'}</td>
            </tr>
            <tr>
              <td>NIK</td>
              <td>:</td>
              <td>{val(b, 'nik') || '-'}</td>
            </tr>
            <tr>
              <td>Tempat Tanggal Lahir</td>
              <td>:</td>
              <td>{formatTTL(b)}</td>
            </tr>
            <tr>
              <td>Jenis Kelamin</td>
              <td>:</td>
              <td>{val(b, 'gender') || '-'}</td>
            </tr>
            <tr>
              <td>Alamat</td>
              <td>:</td>
              <td>{alamatLengkap(b)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="pakta-menyatakan">Menyatakan dengan sebenar-benarnya bahwa :</p>

      <div className="pakta-poin-list">
        <div className="pakta-poin-item">
          <span className="pakta-poin-no">1.</span>
          <span className="pakta-poin-teks">
            Putra/Putri kami Wajib Mondok selama menempuh pendidikan di Pesantren Salafiyah Al-Utsmani, baik pendidikan
            diniyah maupun formal
          </span>
        </div>
        <div className="pakta-poin-item">
          <span className="pakta-poin-no">2.</span>
          <span className="pakta-poin-teks">
            Putra/Putri kami bersedia untuk Tidak Pindah (Mutasi Keluar) dari lembaga Diniyah ataupun Pesantren Salafiyah
            Al-Utsmani sampai dinyatakan Lulus di masing-masing lembaga.
          </span>
        </div>
        <div className="pakta-poin-item">
          <span className="pakta-poin-no">3.</span>
          <span className="pakta-poin-teks">
            Bersedia melanjutkan sekolah Non Formal (Madrasah Diniyah) yang ada di Pesantren Al-Utsmani selama
            putra/putri kami menempuh pendidikan di Pesantren Salafiyah Al-Utsmani.
          </span>
        </div>
        <div className="pakta-poin-item">
          <span className="pakta-poin-no">4.</span>
          <span className="pakta-poin-teks">
            Mengarahkan dan membimbing Putra/Putri kami agar Hormat dan patuh terhadap guru, pengurus dan karyawan
            instansi lembaga yang berada di bawah naungan Pesantren Salafiyah Al-Utsmani.
          </span>
        </div>
        <div className="pakta-poin-item">
          <span className="pakta-poin-no">5.</span>
          <span className="pakta-poin-teks">
            Mengarahkan dan membimbing Putra/Putri kami agar bersekolah dengan rajin mematuhi seluruh Tata Tertib dan
            semua peraturan yang berlaku di Pesantren dan Pesantren Salafiyah Al-Utsmani.
          </span>
        </div>
        <div className="pakta-poin-item">
          <span className="pakta-poin-no">6.</span>
          <span className="pakta-poin-teks">
            Melaksanakan tugas dengan sebaik-baiknya sebagai seorang siswa/Peserta Didik.
          </span>
        </div>
      </div>

      <p className="pakta-sanksi-intro">Siap dan Sanggup menerima sanksi atas pelanggaran yang anak kami perbuat berupa :</p>

      <div className="pakta-sanksi-list">
        <p className="pakta-sanksi-baris">a. Peringatan lisan</p>
        <p className="pakta-sanksi-baris">b. Surat peringatan pertama dan sanksi yang edukatif</p>
        <p className="pakta-sanksi-baris">c. Surat pemanggilan orang tua</p>
        <p className="pakta-sanksi-baris">d. Dikeluarkan dari sekolah</p>
        <p className="pakta-sanksi-baris">
          e. Siswa/Siswi yang dikeluarkan oleh Pesantren maka juga akan dikeluarkan dari Pesantren Salafiyah Al-Utsmani
        </p>
        <p className="pakta-sanksi-baris">
          f. Jika selama 2 semester / 1 Tahun Pelajaran jumlah Alpa mencapai 20 Hari, maka Siswa/Siswi
        </p>
        <p className="pakta-sanksi-lanjut">Tidak Dinaikkan Kelas / Tidak Diluluskan.</p>
        <p className="pakta-sanksi-baris">g. Jika melanggar poin 2 maka ijazah akan ditahan sampai dinyatakan lulus di Madrasah</p>
        <p className="pakta-sanksi-lanjut">Diniyahnya yang sedang ditempuh.</p>
      </div>

      <p className="pakta-penutup">
        Demikian surat pernyataan ini saya buat tanpa ada unsur paksaan dari pihak manapun dan untuk dipergunakan
        sebagaimana mestinya.
      </p>

      <p className="pakta-tanggal-kota">{tanggalPernyataan(b)}</p>

      <div className="pakta-ttd-dua">
        <div className="pakta-ttd-kolom">
          <p className="pakta-ttd-jab">Sekretaris Umum</p>
          <div className="pakta-ttd-ruang" />
          <p className="pakta-ttd-nama">{NAMA_SEKRETARIS_UMUM}</p>
        </div>
        <div className="pakta-ttd-kolom">
          <p className="pakta-ttd-jab">Wali Santri</p>
          <div className="pakta-ttd-ruang" />
          <p className="pakta-ttd-nama">{namaWali}</p>
        </div>
      </div>
    </div>
  )
}

export default PrintPaktaIntegritas
