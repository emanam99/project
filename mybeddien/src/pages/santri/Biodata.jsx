import { useSantriBiodata, useSantriBiodataPageSync } from '../../hooks/useSantriCachedResources'
import { PageEnter, PageEnterBlock, PageEnterLoading, PageEnterTitle } from '../../components/motion/PageEnter'

function Field({ label, value, multiline }) {
  const normalized =
    value != null && typeof value === 'object' && !Array.isArray(value)
      ? value.nama ?? value.name ?? ''
      : value
  const asStr = normalized == null ? '' : String(normalized).trim()
  const empty = asStr === '' || /^array$/i.test(asStr)
  const display = empty ? '—' : asStr
  return (
    <div className="py-2.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0 last:pb-0">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</p>
      <p
        className={`text-sm text-gray-900 dark:text-gray-100 ${empty ? 'text-gray-400 dark:text-gray-500' : ''} ${multiline ? 'whitespace-pre-wrap wrap-break-word' : ''}`}
      >
        {display}
      </p>
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800/90 shadow-sm border border-gray-100 dark:border-gray-700/50 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-tight">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function AnimatedCard({ index, title, children }) {
  return (
    <PageEnterBlock index={index}>
      <Card title={title}>{children}</Card>
    </PageEnterBlock>
  )
}

/** Rombel/kelas + NIM pada satu baris (diniyah & formal). */
function formatRombelWithNim(rombel, nim) {
  const r = (rombel || '').trim()
  const n = nim != null && String(nim).trim() !== '' ? String(nim).trim() : ''
  if (r && n) return `${r} · NIM ${n}`
  if (n) return `NIM ${n}`
  return r
}

export default function Biodata() {
  useSantriBiodataPageSync()
  const { biodata: santri, loading, error } = useSantriBiodata()

  if (loading) {
    return (
      <PageEnterLoading className="flex items-center justify-center min-h-[280px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-primary-500 border-t-transparent mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Memuat biodata...</p>
        </div>
      </PageEnterLoading>
    )
  }

  if (error || !santri) {
    return (
      <PageEnter className="max-w-2xl mx-auto px-4 py-6">
        <PageEnterBlock index={0}>
          <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-6 text-center">
            <p className="text-red-700 dark:text-red-300">{error || 'Data tidak ditemukan.'}</p>
          </div>
        </PageEnterBlock>
      </PageEnter>
    )
  }

  const alamatBaris = [
    santri.dusun,
    santri.rt ? `RT ${santri.rt}` : '',
    santri.rw ? `RW ${santri.rw}` : '',
    santri.desa,
    santri.kecamatan,
    santri.kabupaten,
    santri.provinsi,
    santri.kode_pos ? `Kode Pos: ${santri.kode_pos}` : '',
  ]
    .filter(Boolean)
    .join(', ')

  const asrama = [santri.daerah, santri.kamar].filter(Boolean).join(' — ')

  const rombelDiniyah = [santri.diniyah, santri.kelas_diniyah, santri.kel_diniyah].filter(Boolean).join(' / ')
  const rombelFormal = [santri.formal, santri.kelas_formal, santri.kel_formal].filter(Boolean).join(' / ')
  const lttqTingkatan = String(santri.lttq_tingkatan ?? santri.lttq ?? '').trim()
  const lttqKelompok = String(santri.lttq_kelompok ?? '').trim()
  const rombelLttq =
    lttqTingkatan && lttqKelompok
      ? `${lttqTingkatan} · ${lttqKelompok}`
      : lttqTingkatan || lttqKelompok || ''

  return (
    <PageEnter className="max-w-2xl mx-auto px-4 py-6 pb-8">
      <PageEnterTitle className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white tracking-tight">Biodata Santri</h1>
      </PageEnterTitle>

      <div className="space-y-6">
        <AnimatedCard index={0} title="Data pribadi">
          <Field label="Nama" value={santri.nama} />
          <Field label="NIS" value={santri.nis != null && String(santri.nis).trim() !== '' ? String(santri.nis) : santri.id != null ? String(santri.id) : ''} />
          <Field label="NIK" value={santri.nik} />
          <Field label="NISN" value={santri.nisn} />
          <Field label="Tempat Lahir" value={santri.tempat_lahir} />
          <Field label="Tanggal Lahir" value={santri.tanggal_lahir} />
          <Field label="Jenis Kelamin" value={santri.gender} />
        </AnimatedCard>

        <AnimatedCard index={1} title="Status di pesantren">
          <Field label="Status Santri" value={santri.status_santri || santri.status} />
          <Field label="Kategori" value={santri.kategori || santri.kategori_santri} />
          <Field label="Asrama" value={asrama} />
          <Field label="Madrasah Diniyah" value={formatRombelWithNim(rombelDiniyah, santri.nim_diniyah)} />
          <Field label="Sekolah Formal" value={formatRombelWithNim(rombelFormal, santri.nim_formal)} />
          <Field label="LTTQ" value={rombelLttq} />
        </AnimatedCard>

        <AnimatedCard index={2} title="Keluarga & KK">
          <Field label="No. KK" value={santri.no_kk} />
          <Field label="Kepala Keluarga" value={santri.kepala_keluarga} />
          <Field label="Anak ke-" value={santri.anak_ke} />
          <Field label="Jumlah Saudara" value={santri.jumlah_saudara} />
          <Field label="Saudara di Pesantren" value={santri.saudara_di_pesantren} />
        </AnimatedCard>

        <AnimatedCard index={3} title="Minat, kesehatan & lainnya">
          <Field label="Hobi" value={santri.hobi} />
          <Field label="Cita-cita" value={santri.cita_cita} />
          <Field label="Kebutuhan Khusus" value={santri.kebutuhan_khusus} multiline />
          <Field label="Riwayat Sakit" value={santri.riwayat_sakit} multiline />
          <Field label="Ukuran Baju" value={santri.ukuran_baju} />
          <Field label="Status Perkawinan" value={santri.status_nikah} />
          <Field label="Pekerjaan (santri)" value={santri.pekerjaan} />
        </AnimatedCard>

        <AnimatedCard index={4} title="Program bantuan">
          <Field label="KIP" value={santri.kip} />
          <Field label="PKH" value={santri.pkh} />
          <Field label="KKS" value={santri.kks} />
        </AnimatedCard>

        <AnimatedCard index={5} title="Alamat domisili">
          <Field label="Dusun / Jalan" value={santri.dusun} />
          <Field label="RT" value={santri.rt} />
          <Field label="RW" value={santri.rw} />
          <Field label="Desa / Kelurahan" value={santri.desa} />
          <Field label="Kecamatan" value={santri.kecamatan} />
          <Field label="Kabupaten / Kota" value={santri.kabupaten} />
          <Field label="Provinsi" value={santri.provinsi} />
          <Field label="Kode Pos" value={santri.kode_pos} />
          <Field label="Alamat lengkap (ringkas)" value={alamatBaris} />
        </AnimatedCard>

        <AnimatedCard index={6} title="Ayah">
          <Field label="Nama" value={santri.ayah} />
          <Field label="Status" value={santri.status_ayah} />
          <Field label="NIK" value={santri.nik_ayah} />
          <Field label="Tempat Lahir" value={santri.tempat_lahir_ayah} />
          <Field label="Tanggal Lahir" value={santri.tanggal_lahir_ayah} />
          <Field label="Pekerjaan" value={santri.pekerjaan_ayah} />
          <Field label="Pendidikan" value={santri.pendidikan_ayah} />
          <Field label="Penghasilan" value={santri.penghasilan_ayah} />
        </AnimatedCard>

        <AnimatedCard index={7} title="Ibu">
          <Field label="Nama" value={santri.ibu} />
          <Field label="Status" value={santri.status_ibu} />
          <Field label="NIK" value={santri.nik_ibu} />
          <Field label="Tempat Lahir" value={santri.tempat_lahir_ibu} />
          <Field label="Tanggal Lahir" value={santri.tanggal_lahir_ibu} />
          <Field label="Pekerjaan" value={santri.pekerjaan_ibu} />
          <Field label="Pendidikan" value={santri.pendidikan_ibu} />
          <Field label="Penghasilan" value={santri.penghasilan_ibu} />
        </AnimatedCard>

        <AnimatedCard index={8} title="Wali">
          <Field label="Nama" value={santri.wali} />
          <Field label="Hubungan" value={santri.hubungan_wali} />
          <Field label="NIK" value={santri.nik_wali} />
          <Field label="Tempat Lahir" value={santri.tempat_lahir_wali} />
          <Field label="Tanggal Lahir" value={santri.tanggal_lahir_wali} />
          <Field label="Pekerjaan" value={santri.pekerjaan_wali} />
          <Field label="Pendidikan" value={santri.pendidikan_wali} />
          <Field label="Penghasilan" value={santri.penghasilan_wali} />
        </AnimatedCard>

        <AnimatedCard index={9} title="Kontak">
          <Field label="No. Telepon" value={santri.no_telpon} />
          <Field label="No. WA Santri" value={santri.no_wa_santri} />
          <Field label="Email" value={santri.email} />
          <Field label="No. Telepon Wali" value={santri.no_telpon_wali} />
        </AnimatedCard>
      </div>
    </PageEnter>
  )
}
