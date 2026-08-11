import { getGambarUrl } from '../config/images'

const FORMAL_KOP_CONFIG = {
  PAUD: { logo: '/kop/paud.png', lembaga: 'PAUD AL-UTSMANI' },
  SMP: { logo: '/kop/smp.png', lembaga: 'SMP AL-UTSMANI' },
  MTs: { logo: '/kop/mts.png', lembaga: 'MTs AL-UTSMANI' },
  SMAI: { logo: '/kop/smai.png', lembaga: 'SMAI AL-UTSMANI' },
  STAI: { logo: '/kop/stai.png', lembaga: 'STAI AL-UTSMANI' }
}

const KOP_ALAMAT = 'Beddian RT 029 / RW 006, Jambesari, Jambesari Darus Sholah Bondowoso 68263'

function resolveFormalKop(formal) {
  const raw = String(formal || '').trim()
  if (!raw || raw === '-') {
    return { logo: '/kop/ppsb.png', lembaga: 'AL-UTSMANI' }
  }
  if (FORMAL_KOP_CONFIG[raw]) return FORMAL_KOP_CONFIG[raw]
  const matched = Object.entries(FORMAL_KOP_CONFIG).find(([key]) => key.toLowerCase() === raw.toLowerCase())
  if (matched) return matched[1]
  const logoKey = raw.toLowerCase().replace(/\s+/g, '')
  const knownLogo = `/kop/${logoKey}.png`
  return { logo: knownLogo, lembaga: `${raw} AL-UTSMANI` }
}

function val(b, key) {
  if (!b) return '-'
  const x = b[key]
  if (x === null || x === undefined || String(x).trim() === '') return '-'
  return String(x).trim()
}

function formatTgl(b, key) {
  const raw = b?.[key]
  if (!raw) return '-'
  const s = String(raw)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.slice(0, 10) + 'T12:00:00')
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    }
  }
  return s
}

function formatTempatTanggal(b, tempatKey, tglKey) {
  const tempat = val(b, tempatKey)
  const tgl = formatTgl(b, tglKey)
  if (tempat === '-' && tgl === '-') return '-'
  if (tempat === '-') return tgl
  if (tgl === '-') return tempat
  return `${tempat}, ${tgl}`
}

function formatAnakKe(b) {
  const anakKe = val(b, 'anak_ke')
  const jumlah = val(b, 'jumlah_saudara')
  if (anakKe === '-' && jumlah === '-') return '-'
  if (anakKe === '-') return `dari ${jumlah} bersaudara`
  if (jumlah === '-') return `Anak ke-${anakKe}`
  return `Anak ke-${anakKe} dari ${jumlah} bersaudara`
}

function formatDomisiliKategori(b) {
  const daerah = val(b, 'daerah')
  const kamar = val(b, 'kamar')
  const kategori = val(b, 'kategori')
  const domisili = [daerah, kamar].filter((x) => x !== '-').join('.')
  if (!domisili && kategori === '-') return '-'
  if (!domisili) return `(${kategori})`
  if (kategori === '-') return domisili
  return `${domisili} (${kategori})`
}

function Row({ label, children }) {
  return (
    <tr>
      <td className="formulir-label">{label}</td>
      <td className="formulir-colon">:</td>
      <td className="formulir-value">{children}</td>
    </tr>
  )
}

function SectionTitle({ children, right }) {
  return (
    <tr>
      <td colSpan={3} className="formulir-section-title">
        {right ? (
          <div className="formulir-section-title-row">
            <span>{children}</span>
            <span className="formulir-section-title-right">{right}</span>
          </div>
        ) : (
          children
        )}
      </td>
    </tr>
  )
}

function PrintBiodataFormulir({ biodata, formatTanggal, showPetugas = false, petugasNama = '-' }) {
  const b = biodata || {}
  const alamat = [b.dusun, b.rt && b.rw ? `RT ${b.rt}/RW ${b.rw}` : '', b.desa, b.kecamatan, b.kabupaten, b.provinsi, b.kode_pos]
    .filter(Boolean)
    .join(', ')
  const saudaraPes = b.saudara_di_pesantren || b.saudara || ''
  const formalPilihan = b.formal !== '-' ? b.formal : b.daftar_formal
  const kop = resolveFormalKop(formalPilihan)
  const nis = val(b, 'nis') !== '-' ? val(b, 'nis') : val(b, 'id')

  return (
    <div className="print-biodata-formulir">
      <div className="formulir-kop-header">
        <div className="formulir-kop-logo">
          <img src={getGambarUrl(kop.logo)} alt="" className="formulir-kop-logo-img" />
        </div>
        <div className="formulir-kop-text">
          <p className="formulir-kop-line1">Panitia Penerimaan Murid Baru</p>
          <p className="formulir-kop-line2">{kop.lembaga}</p>
          <p className="formulir-kop-line3">PONDOK PESANTREN SALAFIYAH AL-UTSMANI</p>
          <p className="formulir-kop-line4">{KOP_ALAMAT}</p>
        </div>
      </div>
      <div className="formulir-kop-rules" aria-hidden="true">
        <div className="formulir-kop-rule formulir-kop-rule-thin" />
        <div className="formulir-kop-rule formulir-kop-rule-thick" />
      </div>
      <p className="formulir-doc-title">Formulir Pendaftaran</p>

      <table className="formulir-master-table">
        <tbody>
          <SectionTitle right={nis}>Identitas</SectionTitle>
          <Row label="Nama Lengkap">{val(b, 'nama')}</Row>
          <Row label="NIK">{val(b, 'nik')}</Row>
          <Row label="No. KK">{val(b, 'no_kk')}</Row>
          <Row label="Kepala Keluarga">{val(b, 'kepala_keluarga')}</Row>

          <SectionTitle>Data Pendaftar</SectionTitle>
          <Row label="Jenis Kelamin">{val(b, 'gender')}</Row>
          <Row label="Tempat, Tanggal Lahir">{formatTempatTanggal(b, 'tempat_lahir', 'tanggal_lahir')}</Row>
          <Row label="NISN">{val(b, 'nisn')}</Row>
          <Row label="Anak ke">{formatAnakKe(b)}</Row>
          <Row label="Saudara di pesantren">{saudaraPes || '-'}</Row>
          <Row label="Alamat lengkap">{alamat || '-'}</Row>

          <SectionTitle>Biodata Ayah</SectionTitle>
          <Row label="Nama Ayah">{val(b, 'ayah')}</Row>
          <Row label="Status">{val(b, 'status_ayah')}</Row>
          <Row label="NIK Ayah">{val(b, 'nik_ayah')}</Row>
          <Row label="Tempat, Tanggal Lahir">{formatTempatTanggal(b, 'tempat_lahir_ayah', 'tanggal_lahir_ayah')}</Row>
          <Row label="Pendidikan Ayah">{val(b, 'pendidikan_ayah')}</Row>
          <Row label="Pekerjaan Ayah">{val(b, 'pekerjaan_ayah')}</Row>
          <Row label="Penghasilan Ayah">{val(b, 'penghasilan_ayah')}</Row>

          <SectionTitle>Biodata Ibu</SectionTitle>
          <Row label="Nama Ibu">{val(b, 'ibu')}</Row>
          <Row label="Status">{val(b, 'status_ibu')}</Row>
          <Row label="NIK Ibu">{val(b, 'nik_ibu')}</Row>
          <Row label="Tempat, Tanggal Lahir">{formatTempatTanggal(b, 'tempat_lahir_ibu', 'tanggal_lahir_ibu')}</Row>
          <Row label="Pendidikan Ibu">{val(b, 'pendidikan_ibu')}</Row>
          <Row label="Pekerjaan Ibu">{val(b, 'pekerjaan_ibu')}</Row>
          <Row label="Penghasilan Ibu">{val(b, 'penghasilan_ibu')}</Row>

          <SectionTitle>Wali (jika ada)</SectionTitle>
          <Row label="Hubungan wali">{val(b, 'hubungan_wali')}</Row>
          <Row label="Nama wali">{val(b, 'wali')}</Row>
          <Row label="NIK Wali">{val(b, 'nik_wali')}</Row>
          <Row label="Tempat, Tanggal Lahir">{formatTempatTanggal(b, 'tempat_lahir_wali', 'tanggal_lahir_wali')}</Row>
          <Row label="Pendidikan Wali">{val(b, 'pendidikan_wali')}</Row>
          <Row label="Pekerjaan Wali">{val(b, 'pekerjaan_wali')}</Row>
          <Row label="Penghasilan Wali">{val(b, 'penghasilan_wali')}</Row>
        </tbody>
      </table>

      <div className="formulir-page-break">
        <table className="formulir-master-table">
          <tbody>
            <SectionTitle>Riwayat Pendidikan</SectionTitle>
            <Row label="Sekolah (sebelumnya)">{val(b, 'sekolah')}</Row>
            <Row label="Nama sekolah">{val(b, 'nama_sekolah')}</Row>
            <Row label="Alamat sekolah">{val(b, 'alamat_sekolah')}</Row>
            <Row label="Tahun lulus (sekolah)">{val(b, 'lulus_sekolah')}</Row>
            <Row label="NPSN">{val(b, 'npsn')}</Row>
            <Row label="NSM">{val(b, 'nsm')}</Row>

            <SectionTitle>Kategori &amp; Pendidikan di Pesantren</SectionTitle>
            <Row label="Status santri">{val(b, 'status_santri')}</Row>
            <Row label="Diniyah">{val(b, 'diniyah')}</Row>
            <Row label="Formal">{val(b, 'formal')}</Row>
            <Row label="Kategori &amp; Domisili">{formatDomisiliKategori(b)}</Row>

            <SectionTitle>Informasi Tambahan</SectionTitle>
            <Row label="Email">{val(b, 'email')}</Row>
            <Row label="No. Telepon">{val(b, 'no_telpon')}</Row>
            <Row label="No. WhatsApp">{val(b, 'no_wa_santri')}</Row>
            <Row label="Riwayat sakit">{val(b, 'riwayat_sakit')}</Row>
            <Row label="Ukuran baju">{val(b, 'ukuran_baju')}</Row>
            <Row label="KIP">{val(b, 'kip')}</Row>
            <Row label="PKH">{val(b, 'pkh')}</Row>
            <Row label="KKS">{val(b, 'kks')}</Row>
          </tbody>
        </table>
      </div>

      <div className="formulir-footer-print">
        <div>
          <div className="admin-label">Tanggal Cetak</div>
          <div className="admin-name">{formatTanggal(new Date())}</div>
        </div>
        {showPetugas ? (
          <div style={{ textAlign: 'right' }}>
            <div className="admin-label">Petugas / Admin</div>
            <div className="admin-name">{petugasNama}</div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default PrintBiodataFormulir
