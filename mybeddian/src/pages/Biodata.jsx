import { useState, useEffect } from 'react'
import { profilAPI } from '../services/api'

function Field({ label, value }) {
  if (value == null || value === '') return null
  return (
    <div className="py-2.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0 last:pb-0">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-900 dark:text-gray-100">{value}</p>
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

export default function Biodata() {
  const [santri, setSantri] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    profilAPI
      .getBiodata()
      .then((res) => {
        if (!cancelled && res.success && res.data) setSantri(res.data)
        else if (!cancelled) setError('Gagal memuat biodata')
      })
      .catch(() => {
        if (!cancelled) setError('Terjadi kesalahan saat memuat biodata')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[280px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-teal-500 border-t-transparent mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Memuat biodata...</p>
        </div>
      </div>
    )
  }

  if (error || !santri) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-6 text-center">
          <p className="text-red-700 dark:text-red-300">{error || 'Data tidak ditemukan.'}</p>
        </div>
      </div>
    )
  }

  const alamat = [
    santri.dusun,
    santri.rt ? `RT ${santri.rt}` : '',
    santri.rw ? `RW ${santri.rw}` : '',
    santri.desa,
    santri.kecamatan,
    santri.kabupaten,
    santri.provinsi,
    santri.kode_pos ? `Kode Pos: ${santri.kode_pos}` : '',
  ].filter(Boolean).join(', ') || '-'

  const tempatTglLahir = [santri.tempat_lahir, santri.tanggal_lahir].filter(Boolean).join(', ') || '-'
  const asrama = [santri.daerah, santri.kamar].filter(Boolean).join(' - ') || '-'

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-8">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 tracking-tight">Biodata Santri</h1>

      <div className="space-y-6">
        {/* Data Santri */}
        <Card title="Data Santri">
          <Field label="Nama" value={santri.nama} />
          <Field label="NIS" value={santri.nis ?? santri.id} />
          <Field label="NIK" value={santri.nik} />
          <Field label="Tempat, Tanggal Lahir" value={tempatTglLahir === '-' ? null : tempatTglLahir} />
          <Field label="Jenis Kelamin" value={santri.gender} />
          <Field label="Alamat" value={alamat === '-' ? null : alamat} />
          <Field label="Kategori" value={santri.kategori} />
          <Field label="Status Santri" value={santri.status_santri} />
          <Field label="Asrama" value={asrama === '-' ? null : asrama} />
          {santri.diniyah && (
            <Field
              label="Diniyah"
              value={[santri.diniyah, santri.kelas_diniyah, santri.kel_diniyah].filter(Boolean).join(' / ') || '-'}
            />
          )}
          {santri.formal && (
            <Field
              label="Formal"
              value={[santri.formal, santri.kelas_formal, santri.kel_formal].filter(Boolean).join(' / ') || '-'}
            />
          )}
          {santri.lttq && (
            <Field
              label="LTTQ"
              value={[santri.lttq, santri.kelas_lttq, santri.kel_lttq].filter(Boolean).join(' / ') || '-'}
            />
          )}
        </Card>

        {/* Ayah */}
        <Card title="Ayah">
          <Field label="Nama" value={santri.ayah} />
          <Field label="NIK" value={santri.nik_ayah} />
          <Field label="Status" value={santri.status_ayah} />
          {(santri.tempat_lahir_ayah || santri.tanggal_lahir_ayah) && (
            <Field
              label="Tempat, Tanggal Lahir"
              value={[santri.tempat_lahir_ayah, santri.tanggal_lahir_ayah].filter(Boolean).join(', ')}
            />
          )}
          <Field label="Pekerjaan" value={santri.pekerjaan_ayah} />
          <Field label="Pendidikan" value={santri.pendidikan_ayah} />
          <Field label="Penghasilan" value={santri.penghasilan_ayah} />
        </Card>

        {/* Ibu */}
        <Card title="Ibu">
          <Field label="Nama" value={santri.ibu} />
          <Field label="NIK" value={santri.nik_ibu} />
          <Field label="Status" value={santri.status_ibu} />
          {(santri.tempat_lahir_ibu || santri.tanggal_lahir_ibu) && (
            <Field
              label="Tempat, Tanggal Lahir"
              value={[santri.tempat_lahir_ibu, santri.tanggal_lahir_ibu].filter(Boolean).join(', ')}
            />
          )}
          <Field label="Pekerjaan" value={santri.pekerjaan_ibu} />
          <Field label="Pendidikan" value={santri.pendidikan_ibu} />
          <Field label="Penghasilan" value={santri.penghasilan_ibu} />
        </Card>

        {/* Wali */}
        {santri.wali && (
          <Card title="Wali">
            <Field label="Nama" value={santri.wali} />
            <Field label="Hubungan" value={santri.hubungan_wali} />
            <Field label="NIK" value={santri.nik_wali} />
            {(santri.tempat_lahir_wali || santri.tanggal_lahir_wali) && (
              <Field
                label="Tempat, Tanggal Lahir"
                value={[santri.tempat_lahir_wali, santri.tanggal_lahir_wali].filter(Boolean).join(', ')}
              />
            )}
            <Field label="Pekerjaan" value={santri.pekerjaan_wali} />
            <Field label="Pendidikan" value={santri.pendidikan_wali} />
            <Field label="Penghasilan" value={santri.penghasilan_wali} />
          </Card>
        )}

        {/* Kontak */}
        <Card title="Kontak">
          <Field label="No. Telepon Santri" value={santri.no_telpon} />
          <Field label="No. WA Santri" value={santri.no_wa_santri} />
          <Field label="Email" value={santri.email} />
          <Field label="No. Telepon Wali" value={santri.no_telpon_wali} />
        </Card>
      </div>
    </div>
  )
}
