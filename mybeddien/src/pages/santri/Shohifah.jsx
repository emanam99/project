import { useEffect, useState } from 'react'
import { profilAPI } from '../../services/api'
import { PageEnter, PageEnterLoading } from '../../components/motion/PageEnter'

const emptyForm = {
  sholat_jamaah_5_waktu: '',
  sholat_tarawih: '',
  sholat_witir: '',
  sholat_tahajjud: '',
  sholat_dhuha: '',
  puasa_ramadhan_status: '',
  puasa_ramadhan_alasan: '',
  khatam_alquran_status: '',
  khatam_alquran_jumlah: '',
  khatam_alquran_tanggal: '',
  kitab_a_nama: '',
  kitab_a_status: '',
  kitab_b_nama: '',
  kitab_b_status: '',
  kitab_c_nama: '',
  kitab_c_status: '',
  berbakti_orang_tua: '',
  akhlaq_pergaulan: '',
  syawal_kembali_hari: '',
  syawal_kembali_tanggal: '',
}

function FieldSelect({ label, value, onChange, options, disabled }) {
  return (
    <div className="py-2.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <select
        className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 px-3 py-2 disabled:opacity-60"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">Pilih...</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}

function FieldText({ label, value, onChange, disabled, type = 'text', placeholder = '' }) {
  return (
    <div className="py-2.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <input
        type={type}
        className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 px-3 py-2 disabled:opacity-60"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
      />
    </div>
  )
}

function Card({ title, children }) {
  return (
    <article className="rounded-2xl bg-white dark:bg-gray-800/90 shadow-sm border border-gray-100 dark:border-gray-700/50 overflow-hidden mb-4">
      <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700/50">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      </div>
      <div className="px-5 py-2">{children}</div>
    </article>
  )
}

export default function Shohifah() {
  const [formData, setFormData] = useState(emptyForm)
  const [tahunAjaran, setTahunAjaran] = useState('')
  const [windowStatus, setWindowStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [santriNama, setSantriNama] = useState('')

  const windowActive = windowStatus?.active === true
  const formDisabled = !windowActive || saving

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await profilAPI.getShohifah()
        if (cancelled) return
        if (!res?.success) {
          setError(res?.message || 'Gagal memuat shohifah')
          return
        }
        setWindowStatus(res.window || null)
        setTahunAjaran(res.tahun_ajaran || '')
        setSantriNama(res.santri?.nama || '')
        if (res.data) {
          const next = { ...emptyForm }
          Object.keys(emptyForm).forEach((k) => {
            next[k] = res.data[k] != null ? String(res.data[k]) : ''
          })
          setFormData(next)
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Gagal memuat data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const setField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setSuccess(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!windowActive) return
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await profilAPI.saveShohifah({
        tahun_ajaran: tahunAjaran,
        ...formData,
      })
      if (!res?.success) {
        throw new Error(res?.message || 'Gagal menyimpan')
      }
      setSuccess(true)
      if (res.window) setWindowStatus(res.window)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err?.message || 'Gagal menyimpan data')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <PageEnterLoading>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-12">Memuat shohifah…</p>
      </PageEnterLoading>
    )
  }

  return (
    <PageEnter>
      <div className="max-w-lg mx-auto px-4 pb-24">
        <div className="mb-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {santriNama ? `${santriNama}` : 'Santri'}
            {tahunAjaran ? ` · ${tahunAjaran}` : ''}
          </p>
          {windowStatus && (
            <p
              className={`mt-2 text-xs rounded-lg px-3 py-2 ${
                windowActive
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
                  : 'bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200'
              }`}
            >
              {windowActive
                ? `Masa pengisian aktif${windowStatus.label ? ` (${windowStatus.label})` : ''}.`
                : windowStatus.message ||
                  "Shohifah hanya dapat diisi pada Sya'ban, Ramadhan, dan Syawal."}
            </p>
          )}
        </div>

        {success && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 text-sm">
            Data berhasil disimpan.
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <Card title="1. Sholat Jamaah 5 Waktu">
            <FieldSelect
              label="Status"
              value={formData.sholat_jamaah_5_waktu}
              onChange={(v) => setField('sholat_jamaah_5_waktu', v)}
              options={['Aktif', 'Tidak Aktif', 'Tidak Sama Sekali']}
              disabled={formDisabled}
            />
          </Card>

          <Card title="2. Sholat Sunnah">
            <FieldSelect
              label="A. Tarawih"
              value={formData.sholat_tarawih}
              onChange={(v) => setField('sholat_tarawih', v)}
              options={['Aktif', 'Tidak Aktif', 'Tidak Sama Sekali']}
              disabled={formDisabled}
            />
            <FieldSelect
              label="B. Witir"
              value={formData.sholat_witir}
              onChange={(v) => setField('sholat_witir', v)}
              options={['Aktif', 'Tidak Aktif', 'Tidak Sama Sekali']}
              disabled={formDisabled}
            />
            <FieldSelect
              label="C. Tahajjud"
              value={formData.sholat_tahajjud}
              onChange={(v) => setField('sholat_tahajjud', v)}
              options={['Aktif', 'Tidak Aktif', 'Tidak Sama Sekali']}
              disabled={formDisabled}
            />
            <FieldSelect
              label="D. Dhuha"
              value={formData.sholat_dhuha}
              onChange={(v) => setField('sholat_dhuha', v)}
              options={['Aktif', 'Tidak Aktif', 'Tidak Sama Sekali']}
              disabled={formDisabled}
            />
          </Card>

          <Card title="3. Puasa Ramadhan">
            <FieldSelect
              label="Status"
              value={formData.puasa_ramadhan_status}
              onChange={(v) => setField('puasa_ramadhan_status', v)}
              options={['Tamam', 'Tidak']}
              disabled={formDisabled}
            />
            {formData.puasa_ramadhan_status === 'Tidak' && (
              <FieldText
                label="Alasan Tidak Puasa"
                value={formData.puasa_ramadhan_alasan}
                onChange={(v) => setField('puasa_ramadhan_alasan', v)}
                disabled={formDisabled}
                placeholder="Masukkan alasan..."
              />
            )}
          </Card>

          <Card title="4. Khatam Al-Quran">
            <FieldSelect
              label="Status"
              value={formData.khatam_alquran_status}
              onChange={(v) => setField('khatam_alquran_status', v)}
              options={['Khatam', 'Tidak Khatam']}
              disabled={formDisabled}
            />
            {formData.khatam_alquran_status === 'Khatam' && (
              <>
                <FieldText
                  label="Jumlah Khatam (X)"
                  type="number"
                  value={formData.khatam_alquran_jumlah}
                  onChange={(v) => setField('khatam_alquran_jumlah', v)}
                  disabled={formDisabled}
                />
                <FieldText
                  label="Tanggal Khatam"
                  type="date"
                  value={formData.khatam_alquran_tanggal}
                  onChange={(v) => setField('khatam_alquran_tanggal', v)}
                  disabled={formDisabled}
                />
              </>
            )}
          </Card>

          <Card title="5. Kitab / Pelajaran yang dimutolaah">
            <FieldText
              label="A. Nama Kitab"
              value={formData.kitab_a_nama}
              onChange={(v) => setField('kitab_a_nama', v)}
              disabled={formDisabled}
            />
            {formData.kitab_a_nama && (
              <FieldSelect
                label="Status"
                value={formData.kitab_a_status}
                onChange={(v) => setField('kitab_a_status', v)}
                options={['Khatam', 'Tidak']}
                disabled={formDisabled}
              />
            )}
            <FieldText
              label="B. Nama Kitab"
              value={formData.kitab_b_nama}
              onChange={(v) => setField('kitab_b_nama', v)}
              disabled={formDisabled}
            />
            {formData.kitab_b_nama && (
              <FieldSelect
                label="Status"
                value={formData.kitab_b_status}
                onChange={(v) => setField('kitab_b_status', v)}
                options={['Khatam', 'Tidak']}
                disabled={formDisabled}
              />
            )}
            <FieldText
              label="C. Nama Kitab"
              value={formData.kitab_c_nama}
              onChange={(v) => setField('kitab_c_nama', v)}
              disabled={formDisabled}
            />
            {formData.kitab_c_nama && (
              <FieldSelect
                label="Status"
                value={formData.kitab_c_status}
                onChange={(v) => setField('kitab_c_status', v)}
                options={['Khatam', 'Tidak']}
                disabled={formDisabled}
              />
            )}
          </Card>

          <Card title="6. Berbakti pada orang tua">
            <FieldSelect
              label="Status"
              value={formData.berbakti_orang_tua}
              onChange={(v) => setField('berbakti_orang_tua', v)}
              options={['Baik', 'Kurang Baik', 'Tidak Baik']}
              disabled={formDisabled}
            />
          </Card>

          <Card title="7. Akhlaq & Pergaulan sehari2">
            <FieldSelect
              label="Status"
              value={formData.akhlaq_pergaulan}
              onChange={(v) => setField('akhlaq_pergaulan', v)}
              options={['Baik', 'Kurang Baik', 'Tidak Baik']}
              disabled={formDisabled}
            />
          </Card>

          <Card title="8. Bulan Syawal kembali ke pondok pada">
            <FieldText
              label="Hari"
              value={formData.syawal_kembali_hari}
              onChange={(v) => setField('syawal_kembali_hari', v)}
              disabled={formDisabled}
              placeholder="Masukkan hari..."
            />
            <FieldText
              label="Tanggal"
              type="date"
              value={formData.syawal_kembali_tanggal}
              onChange={(v) => setField('syawal_kembali_tanggal', v)}
              disabled={formDisabled}
            />
          </Card>

          <button
            type="submit"
            disabled={formDisabled}
            className="w-full py-3 px-4 mt-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 text-white font-semibold text-sm transition-colors"
          >
            {saving ? 'Menyimpan…' : windowActive ? 'Simpan Data' : 'Di luar masa pengisian'}
          </button>
        </form>
      </div>
    </PageEnter>
  )
}
