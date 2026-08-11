import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { alumniAPI, clearAlumniSession } from '../../services/alumniApi'
import { useAlumniAuthStore } from '../../store/alumniAuthStore'
import AlamatSuggestField from '../../components/alumni/AlamatSuggestField'
import { alumniPath } from '../../config/alumniApp'

const emptyForm = {
  nama: '',
  nik: '',
  gender: '',
  status: 'hidup',
  nomor_hp: '',
  tempat_lahir: '',
  tanggal_lahir: '',
  dusun: '',
  rt: '',
  rw: '',
  desa: '',
  kecamatan: '',
  kabupaten: '',
  provinsi: '',
  kode_pos: '',
  ayah: '',
  ibu: '',
  tahun_masuk_masehi: '',
  tahun_boyong_masehi: '',
}

function Field({ label, required, children, hint }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-teal-600 dark:text-teal-400">{hint}</p>}
    </div>
  )
}

function inputClass() {
  return 'w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none'
}

function buildFreshForm(nik, identity = {}, user = null) {
  const n = String(nik || user?.nik || '').replace(/\D/g, '').slice(0, 16)
  return {
    ...emptyForm,
    nama: '',
    nik: n,
    gender: identity.gender || user?.gender || '',
    tanggal_lahir: identity.tanggal_lahir || user?.tanggal_lahir || '',
    tempat_lahir: identity.tempat_lahir || user?.tempat_lahir || '',
    provinsi: 'Jawa Timur',
  }
}

function AlumniBiodata() {
  const { user, setAuth, clearAuth } = useAlumniAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const loginNik = location.state?.loginNik || null
  const loginIdentity = location.state?.identity || {}

  const handleResetNik = () => {
    clearAuth()
    clearAlumniSession()
    navigate(alumniPath(), { replace: true })
  }

  const [form, setForm] = useState(() =>
    buildFreshForm(
      loginNik || useAlumniAuthStore.getState().user?.nik,
      loginIdentity,
      useAlumniAuthStore.getState().user
    )
  )
  const [tahunMasukH, setTahunMasukH] = useState('')
  const [tahunBoyongH, setTahunBoyongH] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [converting, setConverting] = useState({ masuk: false, boyong: false })

  // Paksa form mengikuti NIK sesi/login terbaru (jangan pakai NIK lama di state)
  useEffect(() => {
    const latest = useAlumniAuthStore.getState().user
    const nik = loginNik || latest?.nik || ''
    if (!nik) return
    setForm((f) => {
      if (f.nik === nik && !location.state?.formReset) return f
      return buildFreshForm(nik, loginIdentity, latest)
    })
    setTahunMasukH('')
    setTahunBoyongH('')
    // bersihkan flag reset agar tidak mengulang
    if (location.state?.formReset || loginNik) {
      navigate(location.pathname, { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginNik, user?.nik])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await alumniAPI.me()
        if (cancelled) return
        const sessionNik = String(
          useAlumniAuthStore.getState().user?.nik || form.nik || ''
        ).replace(/\D/g, '')
        const meNik = String(res.data?.nik || '').replace(/\D/g, '')

        // Hanya arahkan ke tercatat jika NIK di API sama dengan sesi aktif
        if (
          res.success &&
          res.data?.registered &&
          res.data.alumni &&
          meNik &&
          sessionNik &&
          meNik === sessionNik
        ) {
          const a = res.data.alumni
          const token = localStorage.getItem('alumni_auth_token')
          if (token) {
            setAuth(token, {
              id: a.id,
              alumni_id: a.id,
              id_alumni: a.id_alumni,
              nama: a.nama,
              nik: a.nik,
              gender: a.gender,
              tanggal_lahir: a.tanggal_lahir,
              tempat_lahir: a.tempat_lahir,
              registered: true,
              role_key: 'alumni',
            })
          }
          navigate(alumniPath('tercatat'), { replace: true, state: { alumni: a } })
          return
        }

        // Samakan NIK form dengan sesi (bukan NIK lama dari cache me)
        if (sessionNik) {
          setForm((f) => (f.nik === sessionNik ? f : { ...f, nik: sessionNik }))
        } else if (meNik) {
          setForm((f) => (f.nik === meNik ? f : { ...f, nik: meNik }))
        }
      } catch {
        // ignore — biarkan form dari sesi login
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const applyAlamatPick = (item) => {
    setForm((f) => ({
      ...f,
      desa: item.desa ?? f.desa,
      kecamatan: item.kecamatan ?? f.kecamatan,
      kabupaten: item.kabupaten ?? f.kabupaten,
      provinsi: item.provinsi ?? f.provinsi ?? 'Jawa Timur',
      kode_pos: item.kode_pos ?? f.kode_pos,
    }))
  }

  useEffect(() => {
    const y = form.tahun_masuk_masehi.replace(/\D/g, '').slice(0, 4)
    if (y.length !== 4) {
      setTahunMasukH('')
      return
    }
    let cancelled = false
    setConverting((c) => ({ ...c, masuk: true }))
    const t = setTimeout(async () => {
      try {
        const res = await alumniAPI.convertTahun(y)
        if (!cancelled && res.success) {
          setTahunMasukH(res.data.hijriyah)
        }
      } catch {
        if (!cancelled) setTahunMasukH('')
      } finally {
        if (!cancelled) setConverting((c) => ({ ...c, masuk: false }))
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [form.tahun_masuk_masehi])

  useEffect(() => {
    const y = form.tahun_boyong_masehi.replace(/\D/g, '').slice(0, 4)
    if (y.length !== 4) {
      setTahunBoyongH('')
      return
    }
    let cancelled = false
    setConverting((c) => ({ ...c, boyong: true }))
    const t = setTimeout(async () => {
      try {
        const res = await alumniAPI.convertTahun(y)
        if (!cancelled && res.success) {
          setTahunBoyongH(res.data.hijriyah)
        }
      } catch {
        if (!cancelled) setTahunBoyongH('')
      } finally {
        if (!cancelled) setConverting((c) => ({ ...c, boyong: false }))
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [form.tahun_boyong_masehi])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.nama.trim()) {
      setError('Nama wajib diisi')
      return
    }
    if (!form.gender) {
      setError('Gender wajib diisi')
      return
    }
    if (form.tahun_boyong_masehi.replace(/\D/g, '').length !== 4) {
      setError('Tahun boyong (Masehi) wajib diisi')
      return
    }
    if (!form.desa.trim() || !form.kecamatan.trim() || !form.kabupaten.trim() || !form.provinsi.trim()) {
      setError('Desa, kecamatan, kabupaten, dan provinsi wajib diisi')
      return
    }
    setLoading(true)
    try {
      const payload = {
        ...form,
        nik: user?.nik || form.nik,
        tahun_masuk_masehi: form.tahun_masuk_masehi.replace(/\D/g, '').slice(0, 4) || '',
        tahun_boyong_masehi: form.tahun_boyong_masehi.replace(/\D/g, '').slice(0, 4),
      }
      const res = await alumniAPI.saveBiodata(payload)
      if (!res?.success) {
        setError(res?.message || 'Gagal menyimpan')
        return
      }
      const savedSummary = res.data?.alumni || null
      const token = res.data?.token || localStorage.getItem('alumni_auth_token')
      const nextUser = {
        ...(res.data?.user || {}),
        id: res.data?.user?.id ?? savedSummary?.id,
        alumni_id: res.data?.user?.alumni_id ?? savedSummary?.id,
        id_alumni: res.data?.user?.id_alumni ?? savedSummary?.id_alumni,
        nama: res.data?.user?.nama || savedSummary?.nama || form.nama,
        nik: res.data?.user?.nik || payload.nik,
        registered: true,
        role_key: 'alumni',
      }
      if (token) {
        setAuth(token, nextUser)
      }
      // Preview lengkap dari input client (bukan dari server)
      const clientPreview = {
        ...payload,
        id: savedSummary?.id ?? nextUser.id,
        id_alumni: savedSummary?.id_alumni ?? nextUser.id_alumni,
        nama: form.nama.trim(),
        tahun_masuk_hijriyah: null,
        tahun_boyong_hijriyah: null,
      }
      navigate(alumniPath('tercatat'), {
        replace: true,
        state: { mode: 'preview', alumni: clientPreview },
      })
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Gagal menyimpan biodata'
      setError(msg)
      // Jangan reset form — biarkan user memperbaiki & kirim ulang
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Biodata Alumni</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Lengkapi data. Field bertanda * wajib diisi. Tahun diisi Masehi — Hijriyah dihitung otomatis.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <section className="bg-white dark:bg-gray-800/80 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 sm:p-5 space-y-4">
          <h2 className="text-sm font-semibold text-teal-700 dark:text-teal-300 uppercase tracking-wide">
            Data diri
          </h2>
          <Field label="NIK" required>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <input
                className={inputClass() + ' font-mono flex-1 min-w-0'}
                value={form.nik}
                readOnly
                disabled
              />
              <button
                type="button"
                onClick={handleResetNik}
                className="shrink-0 px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 whitespace-nowrap"
              >
                Reset NIK
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Salah NIK? Reset untuk kembali ke halaman input NIK.
            </p>
          </Field>
          <Field label="Nama lengkap" required>
            <input
              className={inputClass()}
              value={form.nama}
              onChange={(e) => setField('nama', e.target.value)}
              required
            />
          </Field>
          <Field label="Gender" required>
            <select
              className={inputClass()}
              value={form.gender}
              onChange={(e) => setField('gender', e.target.value)}
              required
            >
              <option value="">Pilih</option>
              <option value="Laki-laki">Laki-laki</option>
              <option value="Perempuan">Perempuan</option>
            </select>
          </Field>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-3">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Status</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {form.status === 'wafat' ? 'Wafat' : 'Hidup'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.status === 'hidup'}
              onClick={() => setField('status', form.status === 'hidup' ? 'wafat' : 'hidup')}
              className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors ${
                form.status === 'hidup' ? 'bg-teal-600' : 'bg-gray-400 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                  form.status === 'hidup' ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 -mt-2">
            Toggle ON = Hidup, OFF = Wafat
          </p>
          <Field label="Nomor HP">
            <input
              className={inputClass()}
              inputMode="tel"
              value={form.nomor_hp}
              onChange={(e) => setField('nomor_hp', e.target.value.replace(/[^\d+]/g, ''))}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Tempat lahir">
              <input
                className={inputClass()}
                value={form.tempat_lahir}
                onChange={(e) => setField('tempat_lahir', e.target.value)}
              />
            </Field>
            <Field label="Tanggal lahir">
              <input
                type="date"
                className={inputClass()}
                value={form.tanggal_lahir}
                onChange={(e) => setField('tanggal_lahir', e.target.value)}
              />
            </Field>
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800/80 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 sm:p-5 space-y-4">
          <h2 className="text-sm font-semibold text-teal-700 dark:text-teal-300 uppercase tracking-wide">
            Alamat
          </h2>
          <Field label="Dusun">
            <input className={inputClass()} value={form.dusun} onChange={(e) => setField('dusun', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="RT">
              <input className={inputClass()} value={form.rt} onChange={(e) => setField('rt', e.target.value)} />
            </Field>
            <Field label="RW">
              <input className={inputClass()} value={form.rw} onChange={(e) => setField('rw', e.target.value)} />
            </Field>
          </div>
          <AlamatSuggestField
            label="Desa"
            required
            field="desa"
            value={form.desa}
            onChange={(v) => setField('desa', v)}
            onPick={applyAlamatPick}
            inputClassName={inputClass()}
          />
          <AlamatSuggestField
            label="Kecamatan"
            required
            field="kecamatan"
            value={form.kecamatan}
            onChange={(v) => setField('kecamatan', v)}
            onPick={applyAlamatPick}
            inputClassName={inputClass()}
          />
          <AlamatSuggestField
            label="Kabupaten"
            required
            field="kabupaten"
            value={form.kabupaten}
            onChange={(v) => setField('kabupaten', v)}
            onPick={applyAlamatPick}
            inputClassName={inputClass()}
          />
          <AlamatSuggestField
            label="Provinsi"
            required
            field="provinsi"
            value={form.provinsi}
            onChange={(v) => setField('provinsi', v)}
            onPick={applyAlamatPick}
            inputClassName={inputClass()}
          />
          <Field label="Kode pos">
            <input
              className={inputClass()}
              inputMode="numeric"
              value={form.kode_pos}
              onChange={(e) => setField('kode_pos', e.target.value.replace(/\D/g, '').slice(0, 10))}
            />
          </Field>
        </section>

        <section className="bg-white dark:bg-gray-800/80 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 sm:p-5 space-y-4">
          <h2 className="text-sm font-semibold text-teal-700 dark:text-teal-300 uppercase tracking-wide">
            Keluarga & pesantren
          </h2>
          <Field label="Nama ayah">
            <input className={inputClass()} value={form.ayah} onChange={(e) => setField('ayah', e.target.value)} />
          </Field>
          <Field label="Nama ibu">
            <input className={inputClass()} value={form.ibu} onChange={(e) => setField('ibu', e.target.value)} />
          </Field>
          <Field
            label="Tahun masuk pesantren (Masehi)"
            hint={
              form.tahun_masuk_masehi.replace(/\D/g, '').length === 4
                ? converting.masuk
                  ? 'Mengonversi…'
                  : tahunMasukH
                    ? `≈ Hijriyah ${tahunMasukH}`
                    : 'Konversi gagal'
                : null
            }
          >
            <input
              className={inputClass() + ' font-mono'}
              inputMode="numeric"
              placeholder="contoh: 2015"
              value={form.tahun_masuk_masehi}
              onChange={(e) => setField('tahun_masuk_masehi', e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </Field>
          <Field
            label="Tahun boyong (Masehi)"
            required
            hint={
              form.tahun_boyong_masehi.replace(/\D/g, '').length === 4
                ? converting.boyong
                  ? 'Mengonversi…'
                  : tahunBoyongH
                    ? `≈ Hijriyah ${tahunBoyongH} (dipakai untuk ID Alumni)`
                    : 'Konversi gagal'
                : 'Wajib — dipakai untuk kode tahun ID Alumni'
            }
          >
            <input
              className={inputClass() + ' font-mono'}
              inputMode="numeric"
              placeholder="contoh: 2020"
              value={form.tahun_boyong_masehi}
              onChange={(e) => setField('tahun_boyong_masehi', e.target.value.replace(/\D/g, '').slice(0, 4))}
              required
            />
          </Field>
        </section>

        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold"
        >
          {loading ? 'Menyimpan…' : 'Simpan & daftar'}
        </button>
      </form>
    </div>
  )
}

export default AlumniBiodata
