import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { wiridNailulMurodAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import NailulMurodBabOffcanvas from './components/NailulMurodBabOffcanvas'
import { resolveBabName, readEbeddienTitleLang } from './utils/wiridTitle'
import './NailulMurod.css'

const NailulMurodQuillEditor = lazy(() => import('./NailulMurodQuillEditor'))

const inputClass =
  'w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200'
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5'

const quillFallback = (
  <div className="flex items-center justify-center min-h-[10rem] text-xs text-gray-500 dark:text-gray-400">
    Memuat editor...
  </div>
)

/**
 * Halaman tambah / edit Nailul Murod (terpisah, bukan offcanvas).
 *
 * Catatan stabilitas (audit Mei 2026):
 * - Tidak ada nested scroll container — page memakai scroll halaman utama (`page-content-scroll`)
 *   sehingga sticky toolbar Quill tidak bersaing antar editor seperti di offcanvas dulu.
 * - State editor di-init **sekali** lewat ref `initialIsiRef` / `initialArtiRef`. `value` yang
 *   dikirim ke `NailulMurodQuillEditor` adalah nilai awal saja; perubahan berikutnya datang
 *   lewat `onChange` (one-way) — mencegah cursor lompat / re-render Quill saat user mengetik
 *   panjang. Saat edit, data API ditunggu dulu sebelum render editor (key di-remount).
 */
export default function NailulMurodForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showNotification } = useNotification()
  const isEdit = Boolean(id)
  const numericId = isEdit ? Number(id) : 0

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [formErr, setFormErr] = useState('')

  const [bab, setBab] = useState('')
  const [judulId, setJudulId] = useState('')
  const [judulAr, setJudulAr] = useState('')
  const [urutan, setUrutan] = useState(0)
  const [isi, setIsi] = useState('')
  const [arti, setArti] = useState('')
  const [babList, setBabList] = useState([])
  const [babOffcanvasOpen, setBabOffcanvasOpen] = useState(false)

  const loadBabList = useCallback(async () => {
    try {
      const res = await wiridNailulMurodAPI.getBabList()
      if (res?.success && Array.isArray(res.data)) {
        setBabList(res.data)
      }
    } catch {
      // diam-diam: select hanya bantuan, bukan blocker
    }
  }, [])

  const titleLang = useMemo(() => readEbeddienTitleLang(), [])

  const babSelectOptions = useMemo(() => {
    const names = new Set(babList.map((b) => b.nama))
    const options = [...babList]
    const current = String(bab).trim()
    if (current && !names.has(current)) {
      options.push({ id: `legacy-${current}`, nama: current, urutan: 9999, jumlah_entri: 0 })
    }
    return options.sort((a, b) => (a.urutan - b.urutan) || String(a.nama).localeCompare(String(b.nama), 'id'))
  }, [bab, babList])

  // `initialReady` jadi gerbang render editor — pastikan kita tidak mengganti value Quill
  // saat user sedang mengetik (yang bikin cursor lompat di versi offcanvas dulu).
  const [initialReady, setInitialReady] = useState(!isEdit)

  // Muat daftar bab (untuk select), independen dari load entri.
  useEffect(() => {
    loadBabList()
  }, [loadBabList])

  // Muat data jika edit.
  useEffect(() => {
    if (!isEdit) {
      setInitialReady(true)
      return
    }
    let cancelled = false
    setLoading(true)
    setLoadErr('')
    ;(async () => {
      try {
        const res = await wiridNailulMurodAPI.getById(numericId)
        if (cancelled) return
        if (res?.success && res.data) {
          setBab(res.data.bab != null ? String(res.data.bab) : '')
          setJudulId(
            res.data.judul_id != null && String(res.data.judul_id).trim()
              ? String(res.data.judul_id)
              : res.data.judul != null
                ? String(res.data.judul)
                : ''
          )
          setJudulAr(
            res.data.judul_ar != null && String(res.data.judul_ar).trim()
              ? String(res.data.judul_ar)
              : res.data.judul != null
                ? String(res.data.judul)
                : ''
          )
          setUrutan(res.data.urutan != null ? Number(res.data.urutan) : 0)
          setIsi(res.data.isi != null ? String(res.data.isi) : '')
          setArti(res.data.arti != null ? String(res.data.arti) : '')
          setInitialReady(true)
        } else {
          setLoadErr(res?.message || 'Data tidak ditemukan')
        }
      } catch (e) {
        if (!cancelled) {
          setLoadErr(e?.response?.data?.message || e?.message || 'Gagal memuat data')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isEdit, numericId])

  const handleBack = useCallback(() => {
    navigate('/wirid/nailul-murod')
  }, [navigate])

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault()
      if (!String(judulId).trim() && !String(judulAr).trim()) {
        setFormErr('Isi minimal satu judul (Indonesia atau Arab)')
        return
      }
      const babTrimmed = String(bab).trim()
      if (babTrimmed && !babSelectOptions.some((b) => b.nama === babTrimmed)) {
        setFormErr('Pilih bab dari daftar atau kelola bab terlebih dahulu')
        return
      }
      setSaving(true)
      setFormErr('')
      try {
        const body = {
          bab: String(bab).trim(),
          judul_id: String(judulId).trim(),
          judul_ar: String(judulAr).trim(),
          urutan: Number(urutan) || 0,
          isi,
          arti,
        }
        const res = isEdit
          ? await wiridNailulMurodAPI.update(numericId, body)
          : await wiridNailulMurodAPI.create(body)
        if (res?.success) {
          showNotification(isEdit ? 'Entri diperbarui' : 'Entri ditambahkan', 'success')
          navigate('/wirid/nailul-murod')
        } else {
          setFormErr(res?.message || 'Gagal menyimpan')
        }
      } catch (er) {
        setFormErr(er?.response?.data?.message || er?.message || 'Gagal menyimpan')
      } finally {
        setSaving(false)
      }
    },
    [arti, bab, babSelectOptions, isEdit, isi, judulAr, judulId, navigate, numericId, showNotification, urutan]
  )

  if (loading) {
    return (
      <div className="h-full overflow-y-auto page-content-scroll">
        <div className="container mx-auto px-4 py-6 max-w-4xl">
          <div className="flex justify-center py-16">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-teal-500 border-t-transparent" />
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Memuat data...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (loadErr) {
    return (
      <div className="h-full overflow-y-auto page-content-scroll">
        <div className="container mx-auto px-4 py-6 max-w-4xl">
          <button
            type="button"
            onClick={handleBack}
            className="mb-4 text-teal-600 hover:text-teal-700 dark:text-teal-400 flex items-center gap-2 text-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Kembali
          </button>
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-800 dark:text-red-200">
            {loadErr}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto page-content-scroll">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="mb-6">
          <button
            type="button"
            onClick={handleBack}
            className="mb-4 text-teal-600 hover:text-teal-700 dark:text-teal-400 flex items-center gap-2 text-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Kembali ke daftar
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {isEdit ? 'Ubah entri Nailul Murod' : 'Tambah entri Nailul Murod'}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Pilih gaya di toolbar: <strong>Judul</strong>, <strong>Sub judul</strong>,{' '}
            <strong>Wirid</strong>, <strong>Ayat</strong>, atau <strong>Normal</strong>. Font
            tampilan diatur di aplikasi Nailul Murod.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {formErr && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-800 dark:text-red-200">
              {formErr}
            </div>
          )}

          <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Identitas entri
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1">
                <label className={labelClass}>Bab (pengelompokan)</label>
                <div className="flex gap-2 items-stretch">
                  <select
                    name="bab"
                    value={bab}
                    onChange={(e) => setBab(e.target.value)}
                    className={`${inputClass} flex-1 min-w-0`}
                  >
                    <option value="">— Tanpa bab —</option>
                    {babSelectOptions.map((b) => (
                      <option key={b.id} value={b.nama}>
                        {resolveBabName(b, titleLang)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setBabOffcanvasOpen(true)}
                    className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    title="Kelola bab"
                    aria-label="Kelola bab"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="sm:col-span-1">
                <label className={labelClass}>Judul Indonesia</label>
                <input
                  type="text"
                  name="judul_id"
                  value={judulId}
                  onChange={(e) => setJudulId(e.target.value)}
                  className={inputClass}
                  autoComplete="off"
                  dir="ltr"
                />
              </div>
              <div className="sm:col-span-1">
                <label className={labelClass}>Judul Arab</label>
                <input
                  type="text"
                  name="judul_ar"
                  value={judulAr}
                  onChange={(e) => setJudulAr(e.target.value)}
                  className={`${inputClass} text-right`}
                  autoComplete="off"
                  dir="rtl"
                  lang="ar"
                />
              </div>
              <p className="sm:col-span-3 text-xs text-gray-500 dark:text-gray-400 -mt-1">
                Isi minimal satu judul. Keduanya boleh diisi untuk tampilan bilingual.
              </p>
              <div className="sm:col-span-1">
                <label className={labelClass}>Urutan dalam bab</label>
                <input
                  type="number"
                  name="urutan"
                  value={urutan}
                  onChange={(e) => setUrutan(e.target.value === '' ? 0 : Number(e.target.value))}
                  className={inputClass}
                  min={0}
                />
              </div>
            </div>
          </section>

          <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
              Isi (wirid, nadhom, ayat, teks Arab)
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Tandai bagian Arab dengan gaya <strong>Wirid</strong> atau <strong>Ayat</strong> dari
              toolbar. Font final diatur di app Nailul Murod.
            </p>
            <div className="nm-quill rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-800/50">
              {initialReady ? (
                <Suspense fallback={quillFallback}>
                  <NailulMurodQuillEditor
                    key="nm-form-isi"
                    value={isi}
                    onChange={setIsi}
                    placeholder="Tulis wirid, nadhom, ayat, atau teks Arab…"
                  />
                </Suspense>
              ) : (
                quillFallback
              )}
            </div>
          </section>

          <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
              Arti / terjemahan (Latin)
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Untuk teks Latin, biarkan <strong>Normal</strong> atau pakai Judul / Sub judul bila
              perlu.
            </p>
            <div className="nm-quill nm-quill-arti rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-800/50">
              {initialReady ? (
                <Suspense fallback={quillFallback}>
                  <NailulMurodQuillEditor
                    key="nm-form-arti"
                    value={arti}
                    onChange={setArti}
                    placeholder="Arti / terjemahan (Latin)…"
                  />
                </Suspense>
              ) : (
                quillFallback
              )}
            </div>
          </section>

          <div className="sticky bottom-0 left-0 right-0 -mx-4 px-4 py-3 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 z-20">
            <button
              type="button"
              onClick={handleBack}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg shadow-sm hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? 'Menyimpan…' : isEdit ? 'Simpan perubahan' : 'Tambah entri'}
            </button>
          </div>
        </form>

        <NailulMurodBabOffcanvas
          isOpen={babOffcanvasOpen}
          onClose={() => setBabOffcanvasOpen(false)}
          onChanged={loadBabList}
          titleLang={titleLang}
        />
      </div>
    </div>
  )
}
