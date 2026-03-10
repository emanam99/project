import { useState } from 'react'
import { extractTanggalLahirFromNIK, extractGenderFromNIK } from '../../../../utils/nikUtils'

const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition'
const labelClass = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5'

export const initialProfilForm = {
  nama: '', gelar_awal: '', gelar_akhir: '', nik: '', no_kk: '', status_pengurus: '', gender: '', tempat_lahir: '', tanggal_lahir: '', status_nikah: '',
  pendidikan_terakhir: '', sekolah: '', tahun_lulus: '', s1: '', s2: '', s3: '', bidang_studi: '', jurusan_title: '',
  pekerjaan: '', tmt: '', niy: '', nidn: '', nuptk: '', npk: '',
  email: '', whatsapp: '', no_wa_verified_at: '',
  dusun: '', rt: '', rw: '', desa: '', kecamatan: '', kabupaten: '', provinsi: '', kode_pos: '',
  rekening_jatim: '', an_jatim: '',
  status: 'active'
}

export function profilFormFromUser(u) {
  if (!u) return { ...initialProfilForm }
  const st = (u.status || 'active').toString().trim().toLowerCase()
  const statusNorm = (st === 'aktif' || st === 'active') ? 'active' : 'inactive'
  return {
    nama: u.nama || '', gelar_awal: u.gelar_awal || '', gelar_akhir: u.gelar_akhir || '', nik: u.nik || '', no_kk: u.no_kk || '', status_pengurus: u.status_pengurus || '', gender: u.gender || '', tempat_lahir: u.tempat_lahir || '', tanggal_lahir: u.tanggal_lahir || '', status_nikah: u.status_nikah || '',
    pendidikan_terakhir: u.pendidikan_terakhir || '', sekolah: u.sekolah || '', tahun_lulus: u.tahun_lulus || '', s1: u.s1 || '', s2: u.s2 || '', s3: u.s3 || '', bidang_studi: u.bidang_studi || '', jurusan_title: u.jurusan_title || '',
    pekerjaan: u.pekerjaan || '', tmt: u.tmt || '', niy: u.niy || '', nidn: u.nidn || '', nuptk: u.nuptk || '', npk: u.npk || '',
    email: u.email || '', whatsapp: u.whatsapp ?? u.no_wa ?? '', no_wa_verified_at: u.no_wa_verified_at || '',
    dusun: u.dusun || '', rt: u.rt || '', rw: u.rw || '', desa: u.desa || '', kecamatan: u.kecamatan || '', kabupaten: u.kabupaten || '', provinsi: u.provinsi || '', kode_pos: u.kode_pos || '',
    rekening_jatim: u.rekening_jatim || '', an_jatim: u.an_jatim || '',
    status: statusNorm
  }
}

function handleChangeGeneric(setFormData, e) {
  const { name, value } = e.target
  if (name === 'nik') {
    const numericValue = value.replace(/\D/g, '').slice(0, 16)
    setFormData((prev) => {
      const updated = { ...prev, nik: numericValue }
      if (numericValue.length === 16) {
        const tanggalLahir = extractTanggalLahirFromNIK(numericValue)
        const gender = extractGenderFromNIK(numericValue)
        if (tanggalLahir && !prev.tanggal_lahir) updated.tanggal_lahir = tanggalLahir
        if (gender) updated.gender = gender
      }
      return updated
    })
  } else {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }
}

export default function EditPengurusForm({ formData, setFormData, onCancel, onSubmit, saving, onSaveWhatsapp }) {
  const [showGantiWa, setShowGantiWa] = useState(false)
  const [noWaBaru, setNoWaBaru] = useState('')
  const [savingWa, setSavingWa] = useState(false)
  const handleChange = (e) => handleChangeGeneric(setFormData, e)

  const handleSimpanNomorWa = async () => {
    const no = (noWaBaru || '').trim().replace(/\D/g, '')
    if (no.length < 10 || !onSaveWhatsapp) return
    setSavingWa(true)
    try {
      await onSaveWhatsapp(noWaBaru.trim())
      setShowGantiWa(false)
      setNoWaBaru('')
    } finally {
      setSavingWa(false)
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit() }} className="space-y-5 pb-4">
      {/* Data Diri */}
      <section className="rounded-xl bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600 p-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Data Diri</h2>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Nama Lengkap *</label>
            <input type="text" name="nama" value={formData.nama} onChange={handleChange} required className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Gelar Awal</label>
            <input type="text" name="gelar_awal" value={formData.gelar_awal} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Gelar Akhir</label>
            <input type="text" name="gelar_akhir" value={formData.gelar_akhir} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>NIK (16 digit)</label>
            <input type="text" name="nik" value={formData.nik} onChange={handleChange} maxLength={16} inputMode="numeric" className={inputClass} placeholder="16 digit" />
          </div>
          <div>
            <label className={labelClass}>No. KK</label>
            <input type="text" name="no_kk" value={formData.no_kk} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Status Pengurus</label>
            <select name="status_pengurus" value={formData.status_pengurus} onChange={handleChange} className={inputClass}>
              <option value="">Pilih</option>
              <option value="Mukim">Mukim</option>
              <option value="Khoriji">Khoriji</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Jenis Kelamin</label>
            <select name="gender" value={formData.gender} onChange={handleChange} className={inputClass}>
              <option value="">Pilih</option>
              <option value="Laki-laki">Laki-laki</option>
              <option value="Perempuan">Perempuan</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Status Nikah</label>
            <select name="status_nikah" value={formData.status_nikah} onChange={handleChange} className={inputClass}>
              <option value="">Pilih</option>
              <option value="Belum Menikah">Belum Menikah</option>
              <option value="Menikah">Menikah</option>
              <option value="Cerai Hidup">Cerai Hidup</option>
              <option value="Cerai Mati">Cerai Mati</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Tempat Lahir</label>
            <input type="text" name="tempat_lahir" value={formData.tempat_lahir} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Tanggal Lahir</label>
            <input type="date" name="tanggal_lahir" value={formData.tanggal_lahir} onChange={handleChange} className={inputClass} />
          </div>
        </div>
      </section>

      {/* Kontak */}
      <section className="rounded-xl bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600 p-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Kontak</h2>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Email</label>
            <input type="email" name="email" value={formData.email} onChange={handleChange} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>WhatsApp</label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-900 dark:text-gray-100 font-mono">
                {formData.whatsapp || '—'}
              </span>
              {formData.no_wa_verified_at ? (
                <>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    Terverifikasi
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Terakhir verifikasi: {new Date(formData.no_wa_verified_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </>
              ) : formData.whatsapp ? (
                <span className="text-xs text-amber-600 dark:text-amber-400">Belum verifikasi</span>
              ) : null}
              <button
                type="button"
                onClick={() => { setShowGantiWa(true); setNoWaBaru(''); }}
                className="text-sm font-medium text-teal-600 dark:text-teal-400 hover:underline"
              >
                Ganti nomor
              </button>
            </div>
            {showGantiWa && (
              <div className="mt-3 p-3 rounded-xl bg-gray-100 dark:bg-gray-600/30 border border-gray-200 dark:border-gray-600 space-y-3">
                <input
                  type="text"
                  value={noWaBaru}
                  onChange={(e) => setNoWaBaru(e.target.value)}
                  placeholder="Nomor baru (08xxx atau 62xxx)"
                  className={inputClass}
                  inputMode="numeric"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSimpanNomorWa}
                    disabled={savingWa || (noWaBaru || '').trim().replace(/\D/g, '').length < 10}
                    className="px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium disabled:opacity-50"
                  >
                    {savingWa ? 'Menyimpan...' : 'Simpan'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowGantiWa(false); setNoWaBaru(''); }}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
          </div>
          <div>
            <label className={labelClass}>Status Akun</label>
            <select name="status" value={formData.status} onChange={handleChange} className={inputClass}>
              <option value="active">Aktif</option>
              <option value="inactive">Tidak Aktif</option>
            </select>
          </div>
        </div>
      </section>

      {/* Alamat */}
      <section className="rounded-xl bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600 p-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Alamat</h2>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Dusun</label>
            <input type="text" name="dusun" value={formData.dusun} onChange={handleChange} className={inputClass} />
          </div>
          <div className="flex gap-2">
            <div className="w-20">
              <label className={labelClass}>RT</label>
              <input type="text" name="rt" value={formData.rt} onChange={handleChange} maxLength={3} className={inputClass} />
            </div>
            <div className="w-20">
              <label className={labelClass}>RW</label>
              <input type="text" name="rw" value={formData.rw} onChange={handleChange} maxLength={3} className={inputClass} />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Desa/Kelurahan</label>
            <input type="text" name="desa" value={formData.desa} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Kecamatan</label>
            <input type="text" name="kecamatan" value={formData.kecamatan} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Kabupaten/Kota</label>
            <input type="text" name="kabupaten" value={formData.kabupaten} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Provinsi</label>
            <input type="text" name="provinsi" value={formData.provinsi} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Kode Pos</label>
            <input type="text" name="kode_pos" value={formData.kode_pos} onChange={handleChange} maxLength={6} className={inputClass} />
          </div>
        </div>
      </section>

      {/* Pendidikan */}
      <section className="rounded-xl bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600 p-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Pendidikan</h2>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Pendidikan Terakhir</label>
            <select name="pendidikan_terakhir" value={formData.pendidikan_terakhir} onChange={handleChange} className={inputClass}>
              <option value="">Pilih</option>
              <option value="SD Sederajat">SD Sederajat</option>
              <option value="SMP Sederajat">SMP Sederajat</option>
              <option value="SMA Sederajat">SMA Sederajat</option>
              <option value="D1">D1</option>
              <option value="D2">D2</option>
              <option value="D3">D3</option>
              <option value="D4">D4</option>
              <option value="S1">S1</option>
              <option value="S2">S2</option>
              <option value="S3">S3</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Sekolah</label>
            <input type="text" name="sekolah" value={formData.sekolah} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Tahun Lulus</label>
            <input type="number" name="tahun_lulus" value={formData.tahun_lulus} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>S1</label>
            <input type="text" name="s1" value={formData.s1} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>S2</label>
            <input type="text" name="s2" value={formData.s2} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>S3</label>
            <input type="text" name="s3" value={formData.s3} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Bidang Studi</label>
            <input type="text" name="bidang_studi" value={formData.bidang_studi} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Jurusan/Title</label>
            <input type="text" name="jurusan_title" value={formData.jurusan_title} onChange={handleChange} className={inputClass} />
          </div>
        </div>
      </section>

      {/* Pekerjaan */}
      <section className="rounded-xl bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600 p-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Pekerjaan</h2>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Pekerjaan</label>
            <input type="text" name="pekerjaan" value={formData.pekerjaan} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>TMT</label>
            <input type="date" name="tmt" value={formData.tmt} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>NIY</label>
            <input type="text" name="niy" value={formData.niy} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>NIDN</label>
            <input type="text" name="nidn" value={formData.nidn} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>NUPTK</label>
            <input type="text" name="nuptk" value={formData.nuptk} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>NPK</label>
            <input type="text" name="npk" value={formData.npk} onChange={handleChange} className={inputClass} />
          </div>
        </div>
      </section>

      {/* Rekening */}
      <section className="rounded-xl bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600 p-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Rekening</h2>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Rekening Jatim</label>
            <input type="text" name="rekening_jatim" value={formData.rekening_jatim} onChange={handleChange} className={inputClass} placeholder="Nomor rekening Bank Jatim" />
          </div>
          <div>
            <label className={labelClass}>An. Jatim</label>
            <input type="text" name="an_jatim" value={formData.an_jatim} onChange={handleChange} className={inputClass} placeholder="Atas nama rekening Bank Jatim" />
          </div>
        </div>
      </section>

      <div className="flex gap-3 pt-2 sticky bottom-0 bg-white dark:bg-gray-800 py-2 border-t border-gray-200 dark:border-gray-700">
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium">
          Batal
        </button>
        <button type="submit" disabled={saving} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </div>
    </form>
  )
}
