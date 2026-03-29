import { CheckCircleIcon } from '@heroicons/react/24/solid'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import { OPSI_BY_FORMAL, FORMAL_SHOW_STATUS_MURID } from '../../pages/PilihanStatusMurid'
import { parseServerTimestamp } from '../../utils/biodataLocalCache'

function displayVal(v) {
  if (v == null) return '—'
  const s = String(v).trim()
  return s === '' ? '—' : s
}

function formatDateId(v) {
  if (!v) return '—'
  try {
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return displayVal(v)
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return displayVal(v)
  }
}

function formatDateTimeId(v) {
  if (!v) return '—'
  try {
    const d = new Date(String(v).replace(' ', 'T'))
    if (Number.isNaN(d.getTime())) return displayVal(v)
    return d.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return displayVal(v)
  }
}

function DiperbaruiTerakhirFooter({ tanggalUpdateSantri, tanggalUpdateRegistrasi }) {
  const tsS = parseServerTimestamp(tanggalUpdateSantri)
  const tsR = parseServerTimestamp(tanggalUpdateRegistrasi)
  const hasS = tsS > 0
  const hasR = tsR > 0
  const sTerbaru = hasS && (!hasR || tsS >= tsR)
  const rTerbaru = hasR && (!hasS || tsR >= tsS)

  return (
    <div className="mt-16 pt-8 border-t-4 border-teal-600 dark:border-teal-400">
      <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">Diperbarui terakhir</h3>
      <div className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-800/40 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Data santri</div>
            <div className="text-sm text-gray-900 dark:text-gray-100">{formatDateTimeId(tanggalUpdateSantri)}</div>
          </div>
          {sTerbaru && (
            <CheckCircleIcon
              className="h-6 w-6 shrink-0 text-emerald-500 dark:text-emerald-400"
              title="Pembaruan terbaru (data santri)"
              aria-label="Pembaruan terbaru"
            />
          )}
        </div>
        <div className="flex items-start gap-3 border-t border-gray-200 dark:border-gray-600 pt-4">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Pendaftaran (psb___registrasi)
            </div>
            <div className="text-sm text-gray-900 dark:text-gray-100">{formatDateTimeId(tanggalUpdateRegistrasi)}</div>
          </div>
          {rTerbaru && (
            <CheckCircleIcon
              className="h-6 w-6 shrink-0 text-emerald-500 dark:text-emerald-400"
              title="Pembaruan terbaru (psb___registrasi)"
              aria-label="Pembaruan terbaru"
            />
          )}
        </div>
      </div>
    </div>
  )
}

function ReadRow({ label, value }) {
  const shown = value === undefined || value === null || String(value).trim() === '' ? '—' : value
  return (
    <div className="mb-4">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      <div className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words min-h-[1.5rem]">
        {shown}
      </div>
    </div>
  )
}

const PRODI_LABELS = {
  MPI: 'MPI (Manajemen Pendidikan Islam)',
  ES: 'ES (Ekonomi Syariah)',
  PGMI: 'PGMI (Profesi Guru Madrasah Ibtidaiyah)',
}

function resolveKondisiDisplay(field, formData) {
  const raw = formData[field.field_name]
  if (field.field_name === 'status_murid') {
    const formal = formData.daftar_formal
    if (!FORMAL_SHOW_STATUS_MURID.includes(formal)) return null
    const opts = OPSI_BY_FORMAL[formal] || []
    const hit = opts.find((o) => o.value === raw)
    return hit ? hit.label : displayVal(raw)
  }
  const opts = field.values || []
  const hit = opts.find((o) => o.value === raw)
  return hit ? hit.label : displayVal(raw)
}

function ReadOrangTua({ sectionRef, title, prefix, formData }) {
  const isAlive = formData[`status_${prefix}`] === 'Masih Hidup'
  const labelAyahIbu = title.includes('Ayah') ? 'Ayah' : 'Ibu'

  return (
    <div ref={sectionRef} className="mt-16 pt-8 border-t-4 border-teal-600 dark:border-teal-400">
      <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">{title}</h3>
      <ReadRow label={`Nama ${labelAyahIbu}`} value={displayVal(formData[prefix])} />
      <ReadRow label="Status" value={displayVal(formData[`status_${prefix}`])} />
      {isAlive && (
        <>
          <ReadRow label={`NIK ${labelAyahIbu}`} value={displayVal(formData[`nik_${prefix}`])} />
          <ReadRow label={`Tempat lahir ${labelAyahIbu}`} value={displayVal(formData[`tempat_lahir_${prefix}`])} />
          <ReadRow label={`Tanggal lahir ${labelAyahIbu}`} value={formatDateId(formData[`tanggal_lahir_${prefix}`])} />
          <ReadRow label={`Pendidikan ${labelAyahIbu}`} value={displayVal(formData[`pendidikan_${prefix}`])} />
          <ReadRow label={`Pekerjaan ${labelAyahIbu}`} value={displayVal(formData[`pekerjaan_${prefix}`])} />
          <ReadRow label={`Penghasilan ${labelAyahIbu}`} value={displayVal(formData[`penghasilan_${prefix}`])} />
        </>
      )}
    </div>
  )
}

function GelombangRead({ formData }) {
  const { getGelombangAktif, gelombang } = useTahunAjaranStore()
  const gelombangAktif = getGelombangAktif()
  const selectedValue = formData.gelombang || gelombangAktif || ''

  const formatTanggal = (tanggal) => {
    if (!tanggal) return ''
    try {
      const date = new Date(tanggal)
      return date.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })
    } catch {
      return tanggal
    }
  }

  const label = (() => {
    if (!selectedValue) return '—'
    const tanggalGelombang = gelombang[selectedValue]
    if (tanggalGelombang) {
      return `Gelombang ${selectedValue} (${formatTanggal(tanggalGelombang)})`
    }
    return `Gelombang ${selectedValue}`
  })()

  return <ReadRow label="Gelombang" value={label} />
}

/**
 * Tampilan biodata mode baca: label di atas, nilai di bawah (tanpa input).
 */
function BiodataReadOnlyView({
  sectionRefs,
  formData,
  kondisiFields = [],
  tanggalUpdateSantri = null,
  tanggalUpdateRegistrasi = null,
}) {
  const showMadrasahDetail = formData.madrasah === 'Iya'
  const showSekolahDetail = formData.sekolah && formData.sekolah !== 'Tidak Pernah Sekolah'

  return (
    <div className="space-y-4">
      <div ref={sectionRefs.dataDiri}>
        <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">Data Santri</h3>
        <ReadRow label="Nama" value={displayVal(formData.nama)} />
        <ReadRow label="NIK" value={displayVal(formData.nik)} />
        <ReadRow label="Jenis kelamin" value={displayVal(formData.gender)} />
        <ReadRow label="Tempat lahir" value={displayVal(formData.tempat_lahir)} />
        <ReadRow label="Tanggal lahir" value={formatDateId(formData.tanggal_lahir)} />
        <ReadRow label="NISN" value={displayVal(formData.nisn)} />
        <ReadRow label="No. KK" value={displayVal(formData.no_kk)} />
        <ReadRow label="Kepala keluarga" value={displayVal(formData.kepala_keluarga)} />
        <ReadRow label="Anak ke" value={displayVal(formData.anak_ke)} />
        <ReadRow label="Jumlah saudara" value={displayVal(formData.jumlah_saudara)} />
        <ReadRow label="Saudara di pesantren" value={displayVal(formData.saudara_di_pesantren)} />
        <ReadRow label="Hobi" value={displayVal(formData.hobi)} />
        <ReadRow label="Cita-cita" value={displayVal(formData.cita_cita)} />
        <ReadRow label="Kebutuhan khusus" value={displayVal(formData.kebutuhan_khusus)} />
      </div>

      <ReadOrangTua sectionRef={sectionRefs.biodataAyah} title="Biodata Ayah" prefix="ayah" formData={formData} />
      <ReadOrangTua sectionRef={sectionRefs.biodataIbu} title="Biodata Ibu" prefix="ibu" formData={formData} />

      <div ref={sectionRefs.biodataWali} className="mt-16 pt-8 border-t-4 border-teal-600 dark:border-teal-400">
        <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">Biodata Wali</h3>
        <ReadRow label="Hubungan wali" value={displayVal(formData.hubungan_wali)} />
        <ReadRow label="Nama wali" value={displayVal(formData.wali)} />
        <ReadRow label="NIK wali" value={displayVal(formData.nik_wali)} />
        <ReadRow label="Tempat lahir wali" value={displayVal(formData.tempat_lahir_wali)} />
        <ReadRow label="Tanggal lahir wali" value={formatDateId(formData.tanggal_lahir_wali)} />
        <ReadRow label="Pendidikan wali" value={displayVal(formData.pendidikan_wali)} />
        <ReadRow label="Pekerjaan wali" value={displayVal(formData.pekerjaan_wali)} />
        <ReadRow label="Penghasilan wali" value={displayVal(formData.penghasilan_wali)} />
      </div>

      <div ref={sectionRefs.alamat} className="mt-16 pt-8 border-t-4 border-teal-600 dark:border-teal-400">
        <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">Alamat</h3>
        <ReadRow label="Provinsi" value={displayVal(formData.provinsi)} />
        <ReadRow label="Kabupaten / Kota" value={displayVal(formData.kabupaten)} />
        <ReadRow label="Kecamatan" value={displayVal(formData.kecamatan)} />
        <ReadRow label="Desa / Kelurahan" value={displayVal(formData.desa)} />
        <ReadRow label="Dusun" value={displayVal(formData.dusun)} />
        <ReadRow label="RT" value={displayVal(formData.rt)} />
        <ReadRow label="RW" value={displayVal(formData.rw)} />
        <ReadRow label="Kode pos" value={displayVal(formData.kode_pos)} />
      </div>

      <div ref={sectionRefs.riwayatMadrasah} className="mt-16 pt-8 border-t-4 border-teal-600 dark:border-teal-400">
        <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">Riwayat Madrasah</h3>
        <ReadRow label="Pernah madrasah" value={displayVal(formData.madrasah)} />
        {showMadrasahDetail && (
          <>
            <ReadRow label="Nama madrasah" value={displayVal(formData.nama_madrasah)} />
            <ReadRow label="Alamat madrasah" value={displayVal(formData.alamat_madrasah)} />
            <ReadRow label="Tahun lulus" value={displayVal(formData.lulus_madrasah)} />
          </>
        )}
      </div>

      <div ref={sectionRefs.riwayatSekolah} className="mt-16 pt-8 border-t-4 border-teal-600 dark:border-teal-400">
        <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">Riwayat Sekolah</h3>
        <ReadRow label="Riwayat sekolah" value={displayVal(formData.sekolah)} />
        {showSekolahDetail && (
          <>
            <ReadRow label="Nama sekolah" value={displayVal(formData.nama_sekolah)} />
            <ReadRow label="Alamat sekolah" value={displayVal(formData.alamat_sekolah)} />
            <ReadRow label="Tahun lulus" value={displayVal(formData.lulus_sekolah)} />
            <ReadRow label="NPSN" value={displayVal(formData.npsn)} />
            <ReadRow label="NSM" value={displayVal(formData.nsm)} />
            <ReadRow label="Jurusan" value={displayVal(formData.jurusan)} />
            <ReadRow label="Program sekolah" value={displayVal(formData.program_sekolah)} />
          </>
        )}
      </div>

      <div ref={sectionRefs.informasiTambahan} className="mt-16 pt-8 border-t-4 border-teal-600 dark:border-teal-400">
        <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">Informasi Tambahan</h3>
        <ReadRow label="No. telpon (wali)" value={displayVal(formData.no_telpon)} />
        <ReadRow label="Email" value={displayVal(formData.email)} />
        <ReadRow label="Status pernikahan" value={displayVal(formData.status_nikah)} />
        <ReadRow label="Pekerjaan" value={displayVal(formData.pekerjaan)} />
        <ReadRow label="Riwayat sakit" value={displayVal(formData.riwayat_sakit)} />
        <ReadRow label="Ukuran baju" value={displayVal(formData.ukuran_baju)} />
        <ReadRow label="KIP" value={displayVal(formData.kip)} />
        <ReadRow label="PKH" value={displayVal(formData.pkh)} />
        <ReadRow label="KKS" value={displayVal(formData.kks)} />
        <ReadRow label="No. WA santri" value={displayVal(formData.no_wa_santri)} />
      </div>

      <div ref={sectionRefs.statusPendaftaran} className="mt-16 pt-8 border-t-4 border-teal-600 dark:border-teal-400">
        <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">Status Pendaftaran</h3>
        {kondisiFields.map((field) => {
          if (field.field_name === 'status_murid') {
            const formal = formData.daftar_formal
            if (!FORMAL_SHOW_STATUS_MURID.includes(formal)) return null
          }
          const text = resolveKondisiDisplay(field, formData)
          if (text === null) return null
          return <ReadRow key={field.field_name} label={field.field_label} value={text} />
        })}
        {formData.daftar_formal === 'STAI' && (
          <ReadRow
            label="Prodi"
            value={displayVal(PRODI_LABELS[formData.prodi] || formData.prodi)}
          />
        )}
        <GelombangRead formData={formData} />
        {formData.status_santri === 'Mukim' && (
          <>
            <ReadRow label="Daerah" value={displayVal(formData.daerah)} />
            <ReadRow label="Kamar" value={displayVal(formData.kamar)} />
          </>
        )}
      </div>

      <DiperbaruiTerakhirFooter
        tanggalUpdateSantri={tanggalUpdateSantri}
        tanggalUpdateRegistrasi={tanggalUpdateRegistrasi}
      />
    </div>
  )
}

export default BiodataReadOnlyView
