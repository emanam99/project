import { getGambarUrl } from '../../../config/images'
import './PrintBoyong.css'

const DEFAULT_TTD_NAMA = 'Baqir Shonhadji'

function PrintBoyong({ data = {}, inOffcanvas = false }) {
  const nama = data.nama || '-'
  const ayah = data.ayah || '-'
  const asalLembagaFormal = data.formal || data.asal_lembaga_formal || '-'
  const tanggalHijriyah = data.tanggal_hijriyah || ''
  const nomor = data.nomor || '–/SKU/RKM/–'
  const ttdNama = data.ttd_nama || DEFAULT_TTD_NAMA

  const tanggalSurat = tanggalHijriyah ? `Bondowoso, ${tanggalHijriyah}` : 'Bondowoso, (sesuai tanggal hijriyah Boyong)'

  return (
    <div className={`print-boyong-page ${inOffcanvas ? 'print-boyong-in-offcanvas' : ''}`}>
      <div className="print-boyong-container">
        <div className="surat-boyong">
          {/* Kop surat */}
          <div className="surat-boyong-kop">
            <img src={getGambarUrl('/kop/surat.png')} alt="Kop Pesantren Salafiyah Al-Utsmani" className="surat-boyong-kop-img" />
          </div>

          <div className="surat-boyong-nomor">
            <p>Nomor&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: {nomor}</p>
            <p>Lampiran&nbsp;&nbsp;: -</p>
            <p>Perihal&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: Surat Rekomendasi</p>
          </div>

          <div className="surat-boyong-isi">
            <p className="surat-boyong-paragraf">
              Yang bertandatangan di bawah ini pengurus Pesantren Salafiyah Al-Utsmani bahwa santri dengan identitas sebagai berikut :
            </p>
            <table className="surat-boyong-table">
              <tbody>
                <tr><td className="label">Nama</td><td className="sep">:</td><td className="value">{nama}</td></tr>
                <tr><td className="label">Ayah</td><td className="sep">:</td><td className="value">{ayah}</td></tr>
                <tr><td className="label">Asal lembaga Formal</td><td className="sep">:</td><td className="value">{asalLembagaFormal}</td></tr>
              </tbody>
            </table>
            <p className="surat-boyong-paragraf">
              Telah mendapat rekomendasi untuk tidak melanjutkan pendidikan Diniyah di Pesantren Salafiyah Al-Utsmani, dan sudah menjalankan persyaratan pindah pesantren.
            </p>
            <p className="surat-boyong-paragraf">
              Demikian surat rekomendasi ini dibuat dan untuk digunakan sebagaimana mestinya.
            </p>
          </div>

          <div className="surat-boyong-ttd">
            <p className="surat-boyong-tanggal">{tanggalSurat}</p>
            <p className="surat-boyong-jabatan">a/n Ketua Yayasan PPS. Al-Utsmani</p>
            <p className="surat-boyong-jabatan">Sekretaris Umum</p>
            <div className="surat-boyong-ttd-images">
              <img src={getGambarUrl('/ttd/ust-baqir.png')} alt="Tanda Tangan" className="surat-boyong-ttd-img" />
              <img src={getGambarUrl('/stampel/pesantren.png')} alt="Stempel" className="surat-boyong-stempel" />
            </div>
            <p className="surat-boyong-ttd-nama">{ttdNama}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PrintBoyong
