import { getGambarUrl } from '../../../config/images'

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

function Row({ label, children }) {
  return (
    <tr>
      <td className="formulir-label">{label}</td>
      <td className="formulir-colon">:</td>
      <td className="formulir-value">{children}</td>
    </tr>
  )
}

function SectionTitle({ children }) {
  return (
    <tr>
      <td colSpan={3} className="formulir-section-title">
        {children}
      </td>
    </tr>
  )
}

/**
 * Cetak biodata seperti lembar formulir pendaftaran (read-only).
 */
function PrintBiodataFormulir({ biodata, user, formatTanggal }) {
  const b = biodata || {}
  const petugas = user?.nama || '-'
  const alamat = [b.dusun, b.rt && b.rw ? `RT ${b.rt}/RW ${b.rw}` : '', b.desa, b.kecamatan, b.kabupaten, b.provinsi, b.kode_pos]
    .filter(Boolean)
    .join(', ')
  const saudaraPes = b.saudara_di_pesantren || b.saudara || ''

  return (
    <div className="print-biodata-formulir">
      <div className="header formulir-header" style={{ marginTop: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <img src={getGambarUrl('/kop.png')} alt="" className="header-logo" />
        </div>
        <div className="header-text" style={{ textAlign: 'center', flex: 1 }}>
          <h1 style={{ fontSize: '1.05rem', marginBottom: '4px' }}>Formulir Biodata Pendaftaran</h1>
          <p style={{ margin: 0 }}>Pesantren Salafiyah Al-Utsmani</p>
        </div>
        <div className="header-id" style={{ fontSize: '1rem', fontWeight: 600, color: '#319795' }}>
          {b.nis ?? b.id ?? '-'}
        </div>
      </div>

      <table className="formulir-master-table">
        <tbody>
          <SectionTitle>Identitas</SectionTitle>
          <Row label="NIS">{val(b, 'nis') !== '-' ? val(b, 'nis') : val(b, 'id')}</Row>
          <Row label="Nama Lengkap">{val(b, 'nama')}</Row>
          <Row label="NIK">{val(b, 'nik')}</Row>
          <Row label="No. KK">{val(b, 'no_kk')}</Row>
          <Row label="Kepala Keluarga">{val(b, 'kepala_keluarga')}</Row>

          <SectionTitle>Data Diri</SectionTitle>
          <Row label="Jenis Kelamin">{val(b, 'gender')}</Row>
          <Row label="Tempat Lahir">{val(b, 'tempat_lahir')}</Row>
          <Row label="Tanggal Lahir">{formatTgl(b, 'tanggal_lahir')}</Row>
          <Row label="NISN">{val(b, 'nisn')}</Row>
          <Row label="Anak ke-">{val(b, 'anak_ke')}</Row>
          <Row label="Jumlah Saudara">{val(b, 'jumlah_saudara')}</Row>
          <Row label="Saudara di pesantren">{saudaraPes || '-'}</Row>
          <Row label="Hobi">{val(b, 'hobi')}</Row>
          <Row label="Cita-cita">{val(b, 'cita_cita')}</Row>
          <Row label="Kebutuhan khusus">{val(b, 'kebutuhan_khusus')}</Row>

          <SectionTitle>Alamat</SectionTitle>
          <Row label="Alamat lengkap">{alamat || '-'}</Row>

          <SectionTitle>Biodata Ayah</SectionTitle>
          <Row label="Nama Ayah">{val(b, 'ayah')}</Row>
          <Row label="Status">{val(b, 'status_ayah')}</Row>
          <Row label="NIK Ayah">{val(b, 'nik_ayah')}</Row>
          <Row label="Tempat Lahir Ayah">{val(b, 'tempat_lahir_ayah')}</Row>
          <Row label="Tanggal Lahir Ayah">{formatTgl(b, 'tanggal_lahir_ayah')}</Row>
          <Row label="Pendidikan Ayah">{val(b, 'pendidikan_ayah')}</Row>
          <Row label="Pekerjaan Ayah">{val(b, 'pekerjaan_ayah')}</Row>
          <Row label="Penghasilan Ayah">{val(b, 'penghasilan_ayah')}</Row>

          <SectionTitle>Biodata Ibu</SectionTitle>
          <Row label="Nama Ibu">{val(b, 'ibu')}</Row>
          <Row label="Status">{val(b, 'status_ibu')}</Row>
          <Row label="NIK Ibu">{val(b, 'nik_ibu')}</Row>
          <Row label="Tempat Lahir Ibu">{val(b, 'tempat_lahir_ibu')}</Row>
          <Row label="Tanggal Lahir Ibu">{formatTgl(b, 'tanggal_lahir_ibu')}</Row>
          <Row label="Pendidikan Ibu">{val(b, 'pendidikan_ibu')}</Row>
          <Row label="Pekerjaan Ibu">{val(b, 'pekerjaan_ibu')}</Row>
          <Row label="Penghasilan Ibu">{val(b, 'penghasilan_ibu')}</Row>

          <SectionTitle>Wali (jika ada)</SectionTitle>
          <Row label="Hubungan wali">{val(b, 'hubungan_wali')}</Row>
          <Row label="Nama wali">{val(b, 'wali')}</Row>
          <Row label="NIK Wali">{val(b, 'nik_wali')}</Row>
          <Row label="Tempat Lahir Wali">{val(b, 'tempat_lahir_wali')}</Row>
          <Row label="Tanggal Lahir Wali">{formatTgl(b, 'tanggal_lahir_wali')}</Row>
          <Row label="Pendidikan Wali">{val(b, 'pendidikan_wali')}</Row>
          <Row label="Pekerjaan Wali">{val(b, 'pekerjaan_wali')}</Row>
          <Row label="Penghasilan Wali">{val(b, 'penghasilan_wali')}</Row>

          <SectionTitle>Riwayat Pendidikan</SectionTitle>
          <Row label="Madrasah (sebelumnya)">{val(b, 'madrasah')}</Row>
          <Row label="Nama madrasah">{val(b, 'nama_madrasah')}</Row>
          <Row label="Alamat madrasah">{val(b, 'alamat_madrasah')}</Row>
          <Row label="Tahun lulus (madrasah)">{val(b, 'lulus_madrasah')}</Row>
          <Row label="Sekolah (sebelumnya)">{val(b, 'sekolah')}</Row>
          <Row label="Nama sekolah">{val(b, 'nama_sekolah')}</Row>
          <Row label="Alamat sekolah">{val(b, 'alamat_sekolah')}</Row>
          <Row label="Tahun lulus (sekolah)">{val(b, 'lulus_sekolah')}</Row>
          <Row label="NPSN">{val(b, 'npsn')}</Row>
          <Row label="NSM">{val(b, 'nsm')}</Row>
          <Row label="Jurusan / Program">{val(b, 'jurusan')}</Row>
          <Row label="Program sekolah">{val(b, 'program_sekolah')}</Row>

          <SectionTitle>Kategori &amp; Pendidikan di Pesantren</SectionTitle>
          <Row label="Status santri">{val(b, 'status_santri')}</Row>
          <Row label="Kategori">{val(b, 'kategori')}</Row>
          <Row label="Diniyah">{val(b, 'diniyah')}</Row>
          <Row label="Formal">{val(b, 'formal')}</Row>
          <Row label="LTTQ">{val(b, 'lttq')}</Row>
          <Row label="Kelas LTTQ">{val(b, 'kelas_lttq')}</Row>
          <Row label="Domisili (daerah / kamar)">{[b.daerah, b.kamar].filter(Boolean).join(' — ') || '-'}</Row>

          <SectionTitle>Informasi Tambahan</SectionTitle>
          <Row label="Email">{val(b, 'email')}</Row>
          <Row label="No. Telepon">{val(b, 'no_telpon')}</Row>
          <Row label="No. WhatsApp">{val(b, 'no_wa_santri')}</Row>
          <Row label="Riwayat sakit">{val(b, 'riwayat_sakit')}</Row>
          <Row label="Ukuran baju">{val(b, 'ukuran_baju')}</Row>
          <Row label="KIP">{val(b, 'kip')}</Row>
          <Row label="PKH">{val(b, 'pkh')}</Row>
          <Row label="KKS">{val(b, 'kks')}</Row>
          <Row label="Status nikah">{val(b, 'status_nikah')}</Row>
          <Row label="Pekerjaan (santri)">{val(b, 'pekerjaan')}</Row>
        </tbody>
      </table>

      <div className="formulir-footer-print">
        <div>
          <div className="admin-label">Tanggal Cetak</div>
          <div className="admin-name">{formatTanggal(new Date())}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="admin-label">Petugas / Admin</div>
          <div className="admin-name">{petugas}</div>
        </div>
      </div>
    </div>
  )
}

export default PrintBiodataFormulir
