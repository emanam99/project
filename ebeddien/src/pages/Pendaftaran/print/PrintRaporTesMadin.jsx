import { useState, useEffect, useCallback, useMemo } from 'react'
import { getGambarUrl } from '../../../config/images'
import { pendaftaranAPI } from '../../../services/api'
import PickDateHijri, { formatHijriDateDisplay } from '../../../components/PickDateHijri/PickDateHijri'
import { readTodayPenanggalanSync, idbGetToday, getMasehiKeyHariIni } from '../../../services/hijriPenanggalanStorage'
import { getTanggalFromAPI } from '../../../utils/hijriDate'
import {
  splitHijriYmd,
  buildTesMadinPayload,
  mapTesMadinRowToState,
  resolveKeputusanMasukTerakhir,
  sanitizeGelombangTesInput,
  formatRombelDiniyahLabel,
} from './raporTesMadinUtils'

function formatAlamat(b) {
  if (!b) return '-'
  return [
    b.dusun,
    b.rt && b.rw ? `RT ${b.rt}/RW ${b.rw}` : '',
    b.desa,
    b.kecamatan,
    b.kabupaten,
    b.provinsi,
    b.kode_pos
  ]
    .filter(Boolean)
    .join(', ') || '-'
}

function formatTTL(b) {
  if (!b) return '-'
  const tl = (b.tempat_lahir || '').trim()
  const tg = b.tanggal_lahir
  let tgl = ''
  if (tg) {
    const s = String(tg)
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const d = new Date(s.slice(0, 10) + 'T12:00:00')
      if (!Number.isNaN(d.getTime())) {
        tgl = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
      }
    } else {
      tgl = s
    }
  }
  if (tl && tgl) return `${tl}, ${tgl}`
  if (tl) return tl
  if (tgl) return tgl
  return '-'
}

function domisiliLine(b) {
  if (!b) return '-'
  const parts = [b.daerah, b.kamar].filter(Boolean)
  return parts.length ? parts.join(' — ') : '-'
}

function slotPrintText(v) {
  return v != null && String(v).trim() !== '' ? String(v) : '\u00A0'
}

async function resolveHijriHariIni() {
  const sync = readTodayPenanggalanSync()
  if (sync?.hijriyah) return sync.hijriyah
  const key = getMasehiKeyHariIni()
  const idb = await idbGetToday(key)
  if (idb?.hijriyah && idb.hijriyah !== '0000-00-00') {
    return String(idb.hijriyah).slice(0, 10)
  }
  const api = await getTanggalFromAPI()
  if (api?.hijriyah && api.hijriyah !== '-') return api.hijriyah
  return null
}

function NilaiBaris({ label, subLabel, value, onChange, placeholder = '' }) {
  const printText = slotPrintText(value)
  return (
    <div className="rapor-nilai-baris">
      <span className="rapor-bullet">&gt;</span>
      <div className="rapor-nilai-label">
        {label}
        {subLabel ? (
          <>
            <br />
            <span className="rapor-sub">{subLabel}</span>
          </>
        ) : null}
      </div>
      <span className="rapor-nilai-colon">:</span>
      <span className="rapor-nilai-slot">
        <input
          type="text"
          className="rapor-nilai-input no-print"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <span className="rapor-nilai-print">{printText}</span>
      </span>
    </div>
  )
}

/** Opsi keputusan cetak: dicoret hanya jika sudah ada pilihan dan opsi ini bukan yang dipilih. */
function PilihanKeputusan({ options, value, separator = null, forceCrossOut = false }) {
  const hasSelection = value != null && String(value).trim() !== ''
  return (
    <>
      {options.map((opt, i) => {
        const isSelected = hasSelection && value === opt.id
        const isCrossed = forceCrossOut || (hasSelection && !isSelected)
        return (
          <span key={opt.id} className="rapor-keputusan-opsi-item">
            {i > 0 && separator}
            <span className={`rapor-pilihan-manual ${isCrossed ? 'rapor-pilihan-coret' : ''}`}>
              [ {opt.label} ]
            </span>
          </span>
        )
      })}
    </>
  )
}

const T1_OPSI = [
  { id: 'istidadiyah', label: "Program Isti'dadiyah" },
  { id: 'lanjut_t2', label: 'Lanjut Tahap 2' }
]

const T2_KELAS_OPSI = [
  { id: '4', label: '4' },
  { id: '5', label: '5' },
  { id: '6', label: '6' }
]

const T3_KELAS_OPSI = [
  { id: '1', label: '1' },
  { id: '2', label: '2' }
]

const T4_OPSI = [
  { id: '3_wustha', label: '3 Wustha' },
  { id: '1_ulya', label: '1 Ulya' }
]

function createEmptyState(namaKetuaDefault = 'Agil Farobi') {
  return {
    tanggalTesHijriyah: '',
    t1_membaca: '',
    t1_menulis: '',
    t1_jumlah: '',
    t1_keputusan: '',
    t2_kitab: '',
    t2_ns5: '',
    t2_ns6: '',
    t2_jumlah: '',
    t2_keputusan_kelas: '',
    t2_lanjut_t3: false,
    t3_baca: '',
    t3_nahwu: '',
    t3_sharaf: '',
    t3_jumlah: '',
    t3_keputusan_kelas: '',
    t3_lanjut_t4: false,
    t4_baca: '',
    t4_fiqih: '',
    t4_nahwu: '',
    t4_balaghah: '',
    t4_jumlah: '',
    t4_keputusan: '',
    tanggalSuratHijriyah: '',
    namaKetua: namaKetuaDefault
  }
}

function PrintRaporTesMadin({
  idSantri,
  biodata,
  tahunAjaranLabel,
  tahunAjaranRaw,
  tahunHijriyah,
  tahunMasehi,
  printOnly = false,
}) {
  const b = biodata || {}

  const [form, setForm] = useState(() => createEmptyState())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [saveErr, setSaveErr] = useState('')

  const patch = useCallback((partial) => {
    setForm((prev) => ({ ...prev, ...partial }))
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const hariIni = await resolveHijriHariIni()
      if (cancelled) return
      if (hariIni) {
        setForm((prev) => ({
          ...prev,
          tanggalSuratHijriyah: prev.tanggalSuratHijriyah || hariIni
        }))
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const sid = idSantri ?? b.id ?? b.nis
    const th = String(tahunHijriyah ?? '').trim()
    const tm = String(tahunMasehi ?? '').trim()
    if (!sid || !th || !tm) return

    let cancelled = false
    setLoading(true)
    setSaveErr('')
    pendaftaranAPI
      .getTesMadin(sid, th, tm)
      .then(async (res) => {
        if (cancelled) return
        if (res?.success && res.data) {
          const mapped = mapTesMadinRowToState(res.data)
          if (mapped) {
            setForm((prev) => ({ ...prev, ...mapped }))
            return
          }
        }
        const hariIni = await resolveHijriHariIni()
        if (!cancelled && hariIni) {
          setForm((prev) => ({
            ...prev,
            tanggalSuratHijriyah: prev.tanggalSuratHijriyah || hariIni
          }))
        }
      })
      .catch(() => {
        if (!cancelled) setSaveErr('Gagal memuat data tes')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [idSantri, b.id, b.nis, tahunHijriyah, tahunMasehi])

  const handleSave = async () => {
    const sid = idSantri ?? b.id ?? b.nis
    const th = String(tahunHijriyah ?? '').trim()
    const tm = String(tahunMasehi ?? '').trim()
    if (!sid || !th || !tm) {
      setSaveErr('ID santri atau tahun ajaran belum lengkap')
      return
    }
    setSaving(true)
    setSaveMsg('')
    setSaveErr('')
    try {
      const payload = buildTesMadinPayload(sid, th, tm, form)
      const res = await pendaftaranAPI.saveTesMadin(payload)
      if (res?.success) {
        setSaveMsg('Tersimpan')
        if (res.data) {
          const mapped = mapTesMadinRowToState(res.data)
          if (mapped) setForm((prev) => ({ ...prev, ...mapped }))
        }
      } else {
        setSaveErr(res?.message || 'Gagal menyimpan')
      }
    } catch {
      setSaveErr('Gagal menyimpan data tes')
    } finally {
      setSaving(false)
    }
  }

  const tesParts = useMemo(() => splitHijriYmd(form.tanggalTesHijriyah), [form.tanggalTesHijriyah])
  const tanggalSuratTeks = useMemo(
    () => (form.tanggalSuratHijriyah ? formatHijriDateDisplay(form.tanggalSuratHijriyah) : ''),
    [form.tanggalSuratHijriyah]
  )
  const keputusanAkhir = useMemo(() => resolveKeputusanMasukTerakhir(form), [form])
  const rombelLabel = useMemo(() => formatRombelDiniyahLabel(b), [b])

  const idSantriTampil = b.nis ?? b.id ?? idSantri ?? '-'
  const nama = b.nama || '-'
  const formal = b.formal || '-'

  const selectClass =
    'px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs w-full'

  return (
    <div className="print-rapor-tes-madin">
      {!printOnly && (
      <div className="no-print rapor-tes-edit-panel mb-3 p-3 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/80 dark:bg-gray-900/40 text-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold text-teal-800 dark:text-teal-300">Isi nilai tes madin</div>
          <div className="flex items-center gap-2">
            {loading && <span className="text-gray-500">Memuat…</span>}
            {saveMsg && <span className="text-green-700 dark:text-green-400">{saveMsg}</span>}
            {saveErr && <span className="text-red-600 dark:text-red-400">{saveErr}</span>}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="px-3 py-1.5 rounded-md bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-0.5">
            <span className="text-gray-600 dark:text-gray-400">Gelombang tes</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className={selectClass}
              value={form.gelombang || ''}
              onChange={(e) => patch({ gelombang: sanitizeGelombangTesInput(e.target.value) })}
              placeholder="Angka gelombang"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-gray-600 dark:text-gray-400">Tanggal tes (Hijriyah)</span>
            <PickDateHijri
              value={form.tanggalTesHijriyah || null}
              onChange={(ymd) => patch({ tanggalTesHijriyah: ymd || '' })}
              placeholder="Pilih tanggal tes"
              className="w-full"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-gray-600 dark:text-gray-400">Tanggal surat (Hijriyah)</span>
            <PickDateHijri
              value={form.tanggalSuratHijriyah || null}
              onChange={(ymd) => patch({ tanggalSuratHijriyah: ymd || '' })}
              placeholder="Hari ini (Hijriyah)"
              className="w-full"
            />
          </label>
        </div>

        <div className="border-t border-teal-200/60 dark:border-teal-700 pt-2 space-y-2">
          <div className="font-medium text-teal-700 dark:text-teal-400">Tahap 1</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="flex flex-col gap-0.5">
              <span>Membaca Arab Pegon</span>
              <input className={selectClass} value={form.t1_membaca} onChange={(e) => patch({ t1_membaca: e.target.value })} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Menulis Arab Pegon</span>
              <input className={selectClass} value={form.t1_menulis} onChange={(e) => patch({ t1_menulis: e.target.value })} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Jumlah</span>
              <input className={selectClass} value={form.t1_jumlah} onChange={(e) => patch({ t1_jumlah: e.target.value })} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Keputusan masuk</span>
              <select className={selectClass} value={form.t1_keputusan} onChange={(e) => patch({ t1_keputusan: e.target.value })}>
                <option value="">— Pilih —</option>
                {T1_OPSI.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="border-t border-teal-200/60 dark:border-teal-700 pt-2 space-y-2">
          <div className="font-medium text-teal-700 dark:text-teal-400">Tahap 2</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="flex flex-col gap-0.5 sm:col-span-2">
              <span>Kitab / Lafadz &amp; Makna</span>
              <input className={selectClass} value={form.t2_kitab} onChange={(e) => patch({ t2_kitab: e.target.value })} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Nahwu &amp; Sharaf (5)</span>
              <input className={selectClass} value={form.t2_ns5} onChange={(e) => patch({ t2_ns5: e.target.value })} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Nahwu &amp; Sharaf (6)</span>
              <input className={selectClass} value={form.t2_ns6} onChange={(e) => patch({ t2_ns6: e.target.value })} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Jumlah nilai</span>
              <input className={selectClass} value={form.t2_jumlah} onChange={(e) => patch({ t2_jumlah: e.target.value })} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Masuk Ula, Kelas</span>
              <select className={selectClass} value={form.t2_keputusan_kelas} onChange={(e) => patch({ t2_keputusan_kelas: e.target.value })}>
                <option value="">— Pilih kelas —</option>
                {T2_KELAS_OPSI.map((o) => (
                  <option key={o.id} value={o.id}>Kelas {o.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 justify-end">
              <span className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.t2_lanjut_t3}
                  onChange={(e) => patch({ t2_lanjut_t3: e.target.checked })}
                />
                Lanjut Tahap 3
              </span>
            </label>
          </div>
        </div>

        <div className="border-t border-teal-200/60 dark:border-teal-700 pt-2 space-y-2">
          <div className="font-medium text-teal-700 dark:text-teal-400">Tahap 3</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="flex flex-col gap-0.5">
              <span>Baca Kitab &amp; Pemahaman</span>
              <input className={selectClass} value={form.t3_baca} onChange={(e) => patch({ t3_baca: e.target.value })} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Nahwu</span>
              <input className={selectClass} value={form.t3_nahwu} onChange={(e) => patch({ t3_nahwu: e.target.value })} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Sharaf</span>
              <input className={selectClass} value={form.t3_sharaf} onChange={(e) => patch({ t3_sharaf: e.target.value })} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Jumlah nilai</span>
              <input className={selectClass} value={form.t3_jumlah} onChange={(e) => patch({ t3_jumlah: e.target.value })} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Masuk Wustha, Kelas</span>
              <select className={selectClass} value={form.t3_keputusan_kelas} onChange={(e) => patch({ t3_keputusan_kelas: e.target.value })}>
                <option value="">— Pilih kelas —</option>
                {T3_KELAS_OPSI.map((o) => (
                  <option key={o.id} value={o.id}>Kelas {o.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 justify-end">
              <span className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.t3_lanjut_t4}
                  onChange={(e) => patch({ t3_lanjut_t4: e.target.checked })}
                />
                Lanjut Tahap 4
              </span>
            </label>
          </div>
        </div>

        <div className="border-t border-teal-200/60 dark:border-teal-700 pt-2 space-y-2">
          <div className="font-medium text-teal-700 dark:text-teal-400">Tahap 4</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="flex flex-col gap-0.5 sm:col-span-2">
              <span>Baca Kitab &amp; Pemahaman</span>
              <input className={selectClass} value={form.t4_baca} onChange={(e) => patch({ t4_baca: e.target.value })} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Fiqih</span>
              <input className={selectClass} value={form.t4_fiqih} onChange={(e) => patch({ t4_fiqih: e.target.value })} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Nahwu</span>
              <input className={selectClass} value={form.t4_nahwu} onChange={(e) => patch({ t4_nahwu: e.target.value })} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Balaghah</span>
              <input className={selectClass} value={form.t4_balaghah} onChange={(e) => patch({ t4_balaghah: e.target.value })} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Jumlah nilai</span>
              <input className={selectClass} value={form.t4_jumlah} onChange={(e) => patch({ t4_jumlah: e.target.value })} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Keputusan masuk kelas</span>
              <select className={selectClass} value={form.t4_keputusan} onChange={(e) => patch({ t4_keputusan: e.target.value })}>
                <option value="">— Pilih —</option>
                {T4_OPSI.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="border-t border-teal-200/60 dark:border-teal-700 pt-2">
          <label className="flex flex-col gap-0.5 max-w-xs">
            <span>Nama Ketua Panitia</span>
            <input className={selectClass} value={form.namaKetua} onChange={(e) => patch({ namaKetua: e.target.value })} />
          </label>
        </div>
      </div>
      )}

      <div className="rapor-tes-body">
        <div className="rapor-tes-header">
          <div className="rapor-tes-logo-row">
            <img
              src={getGambarUrl('/kop.png')}
              alt="Logo"
              className="header-logo rapor-kop-img"
              width={72}
              height={72}
            />
          </div>
          <h1 className="rapor-tes-title">Rapor Tes Madrasah Diniyah</h1>
        </div>

        <p className="rapor-tes-intro">
          Yang bertandatangan di bawah ini panitia tes Madrasah Diniyah Pesantren Salafiyah Al-Utsmani Tahun Ajaran{' '}
          <strong>{tahunAjaranLabel}</strong>. Menyatakan bahwa :
        </p>

        <table className="rapor-tes-identitas">
          <tbody>
            <tr>
              <td className="lbl">Nama</td>
              <td className="sep">:</td>
              <td>{nama}</td>
            </tr>
            <tr>
              <td className="lbl">ID</td>
              <td className="sep">:</td>
              <td>{idSantriTampil}</td>
            </tr>
            <tr>
              <td className="lbl">TTL</td>
              <td className="sep">:</td>
              <td>{formatTTL(b)}</td>
            </tr>
            <tr>
              <td className="lbl">Alamat</td>
              <td className="sep">:</td>
              <td>{formatAlamat(b)}</td>
            </tr>
            <tr>
              <td className="lbl">Formal</td>
              <td className="sep">:</td>
              <td>{formal}</td>
            </tr>
            <tr>
              <td className="lbl">Gelombang tes</td>
              <td className="sep">:</td>
              <td>{form.gelombang ? String(form.gelombang) : '-'}</td>
            </tr>
            <tr>
              <td className="lbl">Domisili</td>
              <td className="sep">:</td>
              <td>{domisiliLine(b)}</td>
            </tr>
          </tbody>
        </table>

        <p className="rapor-tes-par">
          Nama tersebut benar-benar telah mengikuti tes masuk Madrasah Diniyah pada tanggal :{' '}
          <span className="rapor-fill">{slotPrintText(tesParts.hari)}</span> /{' '}
          <span className="rapor-fill">{slotPrintText(tesParts.bulan)}</span> /{' '}
          <span className="rapor-fill">{slotPrintText(tesParts.tahun)}</span> H. Dengan hasil sebagai berikut :
        </p>

        <div className="rapor-tahap-baris rapor-tahap-baris-12">
          <section className="rapor-tahap">
            <h2 className="rapor-tahap-judul">Tes Tahap 1</h2>
            <NilaiBaris label="Membaca Arab Pegon" value={form.t1_membaca} onChange={(v) => patch({ t1_membaca: v })} />
            <NilaiBaris label="Menulis Arab Pegon" value={form.t1_menulis} onChange={(v) => patch({ t1_menulis: v })} />
            <div className="rapor-jumlah-baris">
              <span className="rapor-jumlah-label">Jumlah</span>
              <span className="rapor-jumlah-colon">:</span>
              <span className="rapor-nilai-slot">
                <input type="text" className="rapor-nilai-input no-print" value={form.t1_jumlah} onChange={(e) => patch({ t1_jumlah: e.target.value })} />
                <span className="rapor-nilai-print">{slotPrintText(form.t1_jumlah)}</span>
              </span>
            </div>
            <div className="rapor-keputusan-block">
              <div className="rapor-keputusan-baris rapor-t1-masuk">
                <span>Keputusan : Masuk</span>
                <PilihanKeputusan options={[T1_OPSI[0]]} value={form.t1_keputusan} />
              </div>
              <div className="rapor-keputusan-opsi rapor-t1-lanjut">
                <PilihanKeputusan options={[T1_OPSI[1]]} value={form.t1_keputusan} />
              </div>
            </div>
          </section>

          <section className="rapor-tahap">
            <h2 className="rapor-tahap-judul">Tes Tahap 2</h2>
            <NilaiBaris
              label="Memaknai dan membaca kitab,"
              subLabel="Lafadz dan Makna"
              value={form.t2_kitab}
              onChange={(v) => patch({ t2_kitab: v })}
            />
            <NilaiBaris label="Nahwu & Sharaf (5)" value={form.t2_ns5} onChange={(v) => patch({ t2_ns5: v })} />
            <NilaiBaris label="Nahwu & Sharaf (6)" value={form.t2_ns6} onChange={(v) => patch({ t2_ns6: v })} />
            <div className="rapor-jumlah-baris rapor-jumlah-panjang">
              <span className="rapor-jumlah-label">Jumlah Nilai</span>
              <span className="rapor-jumlah-colon">:</span>
              <span className="rapor-nilai-slot rapor-slot-panjang">
                <input type="text" className="rapor-nilai-input no-print" value={form.t2_jumlah} onChange={(e) => patch({ t2_jumlah: e.target.value })} />
                <span className="rapor-nilai-print">{slotPrintText(form.t2_jumlah)}</span>
              </span>
            </div>
            <div className="rapor-keputusan-block">
              <div className="rapor-keputusan-baris rapor-keputusan-wrap">
                <span>Keputusan : Masuk Ula, Kelas</span>
                <span className="rapor-keputusan-kelas">
                  <PilihanKeputusan
                    options={T2_KELAS_OPSI}
                    value={form.t2_keputusan_kelas}
                    forceCrossOut={form.t2_lanjut_t3}
                    separator={<span className="rapor-dash"> - </span>}
                  />
                </span>
              </div>
              <div className="rapor-keputusan-opsi">
                <span
                  className={`rapor-pilihan-manual ${
                    (form.t2_keputusan_kelas || form.t2_lanjut_t3) && !form.t2_lanjut_t3
                      ? 'rapor-pilihan-coret'
                      : ''
                  }`}
                >
                  [ Lanjut Tahap 3 ]
                </span>
              </div>
            </div>
          </section>
        </div>

        <div className="rapor-tahap-baris rapor-tahap-baris-34">
          <section className="rapor-tahap">
            <h2 className="rapor-tahap-judul">Tes Tahap 3</h2>
            <NilaiBaris label="Baca Kitab dan Pemahaman" value={form.t3_baca} onChange={(v) => patch({ t3_baca: v })} />
            <NilaiBaris label="Nahwu" value={form.t3_nahwu} onChange={(v) => patch({ t3_nahwu: v })} />
            <NilaiBaris label="Sharaf" value={form.t3_sharaf} onChange={(v) => patch({ t3_sharaf: v })} />
            <div className="rapor-jumlah-baris rapor-jumlah-panjang">
              <span className="rapor-jumlah-label">Jumlah Nilai</span>
              <span className="rapor-jumlah-colon">:</span>
              <span className="rapor-nilai-slot rapor-slot-panjang">
                <input type="text" className="rapor-nilai-input no-print" value={form.t3_jumlah} onChange={(e) => patch({ t3_jumlah: e.target.value })} />
                <span className="rapor-nilai-print">{slotPrintText(form.t3_jumlah)}</span>
              </span>
            </div>
            <div className="rapor-keputusan-block">
              <div className="rapor-keputusan-baris rapor-keputusan-wrap">
                <span>Keputusan : Masuk Wustha, Kelas</span>
                <span className="rapor-keputusan-kelas">
                  <PilihanKeputusan
                    options={T3_KELAS_OPSI}
                    value={form.t3_keputusan_kelas}
                    forceCrossOut={form.t3_lanjut_t4}
                    separator={<span className="rapor-dash"> - </span>}
                  />
                </span>
              </div>
              <div className="rapor-keputusan-opsi">
                <span
                  className={`rapor-pilihan-manual ${
                    (form.t3_keputusan_kelas || form.t3_lanjut_t4) && !form.t3_lanjut_t4
                      ? 'rapor-pilihan-coret'
                      : ''
                  }`}
                >
                  [ Lanjut Tahap 4 ]
                </span>
              </div>
            </div>
          </section>

          <section className="rapor-tahap">
            <h2 className="rapor-tahap-judul">Tes Tahap 4</h2>
            <NilaiBaris label="Baca Kitab dan Pemahaman" value={form.t4_baca} onChange={(v) => patch({ t4_baca: v })} />
            <NilaiBaris label="Fiqih" value={form.t4_fiqih} onChange={(v) => patch({ t4_fiqih: v })} />
            <NilaiBaris label="Nahwu" value={form.t4_nahwu} onChange={(v) => patch({ t4_nahwu: v })} />
            <NilaiBaris label="Balaghah" value={form.t4_balaghah} onChange={(v) => patch({ t4_balaghah: v })} />
            <div className="rapor-jumlah-baris rapor-jumlah-panjang">
              <span className="rapor-jumlah-label">Jumlah Nilai</span>
              <span className="rapor-jumlah-colon">:</span>
              <span className="rapor-nilai-slot rapor-slot-panjang">
                <input type="text" className="rapor-nilai-input no-print" value={form.t4_jumlah} onChange={(e) => patch({ t4_jumlah: e.target.value })} />
                <span className="rapor-nilai-print">{slotPrintText(form.t4_jumlah)}</span>
              </span>
            </div>
            <div className="rapor-keputusan-block">
              <div className="rapor-keputusan-baris rapor-keputusan-wrap">
                <span>Keputusan : Masuk kelas</span>
                <span className="rapor-keputusan-kelas">
                  <PilihanKeputusan options={[T4_OPSI[0]]} value={form.t4_keputusan} />
                </span>
              </div>
              <div className="rapor-keputusan-opsi">
                <PilihanKeputusan options={[T4_OPSI[1]]} value={form.t4_keputusan} />
              </div>
            </div>
          </section>
        </div>

        {keputusanAkhir ? (
          <p className="rapor-tes-par rapor-tes-pernyataan-masuk">
            Berdasarkan hasil tes di atas, santri tersebut dinyatakan <strong>masuk {keputusanAkhir}</strong>.
          </p>
        ) : null}

        <p className="rapor-tes-par rapor-tes-ketentuan-rombel">
          Anak tersebut masuk di kelas{' '}
          <span className="rapor-fill rapor-kelas">
            {rombelLabel || '........................................'}
          </span>
          .
        </p>

        <p className="rapor-tes-par">Demikian rapor ini dibuat, untuk digunakan sebagaimana mestinya.</p>

        <div className="rapor-tes-ttd">
          <p className="rapor-tes-kota">
            Bondowoso, {tanggalSuratTeks ? `${tanggalSuratTeks} H` : slotPrintText('')}
          </p>
          <p className="rapor-tes-jabatan">Ketua Panitia Tes Madrasah Diniyah</p>
          <div className="rapor-tes-spacer" />
          <p className="rapor-tes-nama">{form.namaKetua || 'Agil Farobi'}</p>
        </div>
      </div>
    </div>
  )
}

export default PrintRaporTesMadin
