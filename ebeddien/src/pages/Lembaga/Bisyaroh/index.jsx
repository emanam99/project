import { Fragment, Suspense, lazy, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotification } from '../../../contexts/NotificationContext'
import { lembagaAPI, bisyarohAPI, kalenderAPI } from '../../../services/api'
import { PickMonthHijri } from '../../../components/PickDateHijri'
import { useBisyarohFiturAccess } from '../../../hooks/useBisyarohFiturAccess'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import RumusAutocompleteTextarea from './RumusAutocompleteTextarea'
import { buildRumusColumnSuggestions } from './bisyarohRumusSuggest'
// Lazy: BisyarohExcelEditorModal mem-pull @fortune-sheet (~MB) — dimuat saat modal dibuka saja.
const BisyarohExcelEditorModal = lazy(() => import('./BisyarohExcelEditorModal'))
import BisyarohHistoriTab from './BisyarohHistoriTab'
import BisyarohKolomAturanTable from './BisyarohKolomReorderList'
import BisyarohPengurusUrutanList from './BisyarohPengurusUrutanList'
import BisyarohReviewTab from './BisyarohReviewTab'
import BisyarohReviewFilters from './BisyarohReviewFilters'
import BisyarohReviewRilisPanel from './BisyarohReviewRilisPanel'
import BisyarohExportAccordion from './BisyarohExportAccordion'
import BisyarohUploadMutasiPanel from './BisyarohUploadMutasiPanel'
import BisyarohRilisTab from './BisyarohRilisTab'
import { exportBisyarohReviewToExcel } from './bisyarohReviewExportExcel'
import {
  applyReviewDisabledToSections,
  loadReviewDisabledRowKeys,
  persistReviewDisabledRowKeys,
  reviewDisabledStorageKey,
  reviewGrandTotalFromSections,
  reviewRowKey
} from './bisyarohReviewDisabledRows'
import {
  subtitleBisyarohKolomKind,
  isBisyarohCheckboxTruthy,
  bisyarohCheckboxEffectiveValue
} from './bisyarohKolomTipe'
import {
  defaultPeriodeBulanMasehi,
  fetchDefaultPeriodeBulanHijriyah
} from './bisyarohDefaultPeriode'

const TAB_ORDER = ['rekap', 'review', 'rilis', 'histori', 'aturan']

function formatRp(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(
    Number(n)
  )
}

/** Penjelasan singkat jika kolom Total Rp 0 padahal ada nilai di tabel. */
function getRekapTotalZeroHint(row) {
  const cells = row?.cells || []
  const errCells = cells.filter((c) => c.error)
  if (errCells.length > 0) {
    return `${errCells.length} kolom rumus gagal (#N/A, #VALUE!, …)`
  }
  let adaNilaiTanpaSigma = false
  for (const c of cells) {
    if (c.error) continue
    const n = Number(c.nilai_nominal)
    if (!Number.isFinite(n) || n === 0) continue
    if (!c.masuk_total) adaNilaiTanpaSigma = true
  }
  if (adaNilaiTanpaSigma) {
    return 'Nilai ada, tapi kolom tidak centang «Σ Ikut total» (tab Aturan)'
  }
  const inputs = row?.inputs || {}
  const adaInputKosong = cells.some((c) => c.kind === 'input' && !(String(inputs[c.col_key] ?? '').trim()))
  if (adaInputKosong) {
    return 'Isi kolom input lalu keluar dari sel (blur) atau simpan rekap'
  }
  return null
}

function RekapTotalCell({ row }) {
  const total = Number(row.total_nominal) || 0
  const hint = total === 0 ? getRekapTotalZeroHint(row) : null
  if (!hint) {
    return <span>{formatRp(row.total_nominal)}</span>
  }
  return (
    <div className="space-y-0.5 text-right">
      <span>{formatRp(0)}</span>
      <p className="text-[10px] font-normal text-amber-700 dark:text-amber-400 leading-snug max-w-[200px] ml-auto">
        {hint}
      </p>
    </div>
  )
}

function labelBisyarohRekapStatus(st) {
  if (st === 'ditinjau') return 'Ditinjau'
  if (st === 'rilis') return 'Rilis'
  return 'Pengajuan'
}

/** Blok bantuan rumus di bawah daftar kolom (tab Aturan). */
function BisyarohRumusHelpPanel({ pengurusFields = [], jabatanFields = [], pjFields = [] }) {
  const fnRows = [
    { name: 'IF(kondisi; jika_benar; jika_salah)', desc: 'Kondisi ≠ 0 dianggap benar (hasil perbandingan = 1 atau 0). Argumen fungsi dipisah ;' },
    { name: 'Operator: > < >= <= == !=', desc: 'Perbandingan angka; hasil 1 (benar) atau 0 (salah). Contoh: IF(@[hari] >= 20; …; …).' },
    { name: 'AND(a; b; …) / OR(…) / NOT(x)', desc: 'Logika boolean numerik (1/0).' },
    { name: 'SUM(a; b; …)', desc: 'Jumlah argumen.' },
    { name: 'AVERAGE(…) / AVG(…)', desc: 'Rata-rata.' },
    { name: 'MIN(…) / MAX(…)', desc: 'Nilai minimum / maksimum.' },
    { name: 'ABS(x)', desc: 'Nilai mutlak.' },
    { name: 'ROUND(x) / ROUND(x; digit)', desc: 'Pembulatan.' },
    { name: 'FLOOR(x) / CEIL(x)', desc: 'Pembulatan ke bawah / ke atas.' },
    { name: 'MOD(a; b)', desc: 'Sisa bagi.' },
    { name: 'POWER(a; b) / POW(a; b)', desc: 'Pangkat.' },
    { name: 'PERCENT(bagian; total)', desc: 'Persen: bagian ÷ total × 100. Contoh: PERCENT(@[terbayar]; @[wajib]).' },
    {
      name: 'HASJABATAN("nama")',
      desc: '1 jika pengurus punya jabatan aktif di lembaga filter rekap yang namanya mengandung teks (abaikan huruf besar/kecil).'
    },
    {
      name: 'CONTAINS(@pengurus[kolom]; "teks")',
      desc: 'Sama untuk @jabatan[…], @pj[…], dan @[kolom di atas]. Bentuk @[k] = "teks" atau @jabatan[tipe] = "guru" juga boleh (otomatis jadi CONTAINS).'
    },
    {
      name: 'ISEMPTY(…) / BLANK(…)',
      desc: '1 jika kosong — @pengurus/@jabatan/@pj atau @[kolom input/rumus di atas].'
    },
    {
      name: 'LEN(…)',
      desc: 'Panjang teks UTF-8: @pengurus[…], @jabatan[…], @pj[…], atau @[kolom di atas]. Perbandingan di luar LEN, mis. IF(LEN(@[nidn]) > 8; …; …).'
    },
    {
      name: 'YEAR / MONTH / DAY (alias TAHUN / BULAN / TANGGAL)',
      desc: 'Ambil tahun, bulan, atau hari dari tanggal — @[kolom], @pengurus[…], @pj[…], atau "2024-06-15".'
    },
    {
      name: 'DATEVAL / DAYS / DATEDIF / DATEADD',
      desc: 'DATEVAL(@[k]) → angka serial hari; kurangi untuk selisih hari. DAYS/DATEDIF selisih dua tanggal. DATEADD tambah hari/bulan/tahun. DATE(2024; 6; 15) bangun tanggal.'
    }
  ]

  const examples = [
    { label: 'Gaji harian', rumus: '@[hari] * 15000' },
    { label: 'Tunjangan menurut jabatan', rumus: 'IF(HASJABATAN("Ketua"); 750000; IF(HASJABATAN("Wakil"); 500000; 300000))' },
    { label: 'Beda nominal jika hari banyak', rumus: 'IF(@[hari] > 25; @[gaji_pokok] * 1,25; @[gaji_pokok])' },
    { label: 'Bedakan NIK terisi vs panjang singkat', rumus: 'IF(ISEMPTY(@pengurus[nik]); 0; IF(LEN(@pengurus[nik]) <= 10; 50000; 100000))' },
    { label: 'Persentase terbayar', rumus: 'PERCENT(@[terbayar]; @[wajib])' },
    { label: 'Nama lengkap dengan gelar', rumus: '@pengurus[gelar_awal] & " " & @pengurus[nama] & " " & @pengurus[gelar_akhir]' },
    { label: 'Bonus jika kolom input mengandung teks', rumus: 'IF(CONTAINS(@[kategori_input]; "TM"); 5000; 0)' },
    { label: 'Masa penugasan ≥ 1 tahun', rumus: 'IF(DATEDIF(@pj[tanggal_mulai]; @pj[tanggal_selesai]; "Y") >= 1; 10000; 0)' },
    { label: 'Selisih hari dua kolom tanggal', rumus: 'DAYS(@[tgl_akhir]; @[tgl_awal])' }
  ]

  return (
    <div className="mt-6 space-y-4 border-t border-gray-200 dark:border-gray-600 pt-5">
      <div className="rounded-lg border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3">
        <h3 className="text-sm font-semibold text-amber-950 dark:text-amber-100">Urutan kolom</h3>
        <p className="text-xs text-amber-900/90 dark:text-amber-200/90 mt-1.5 leading-relaxed">
          Urutan ke bawah = urutan perhitungan. Rumus hanya boleh memakai kolom <strong>di atasnya</strong> (ketik{' '}
          <kbd className="px-1 rounded bg-white/70 dark:bg-gray-800 font-mono text-[10px]">@</kbd> untuk daftar kolom di atas).
          Centang «Ikut total (Σ)» agar nilai kolom masuk penjumlahan nominal; matikan untuk kolom informasi saja (mis. persentase).
          Kolom <strong>input</strong> bisa tipe <strong>Checkbox</strong> (centang = 1, kosong = 0 di rumus <code className="font-mono text-[10px]">@[k]</code>).
          Kolom <strong>rumus</strong> punya <strong>tipe tampilan</strong>: angka biasa, Rupiah, Persen, atau Teks (mis.{' '}
          <code className="font-mono text-[10px]">@pengurus[gelar_awal] &amp; &quot; &quot; &amp; @pengurus[nama]</code>).
          Angka desimal boleh pakai <strong>koma</strong> (0,5) atau titik (0.5). <strong>Argumen fungsi wajib titik koma</strong> (<code className="font-mono text-[10px]">PERCENT(@[a]; @[wajib])</code>, <code className="font-mono text-[10px]">IF(@[x] &gt; 0; 100; 0)</code>). Rumus lama dengan koma argumen otomatis dinormalisasi saat disimpan.
          Saat rekap <strong>dirilis</strong>, hasil rumus &amp; total nominal <strong>dibekukan</strong> (snapshot) — perubahan rumus bulan berikutnya tidak mengubah histori bulan yang sudah rilis.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Rujukan dalam rumus</h3>
        <ul className="mt-2 space-y-2 text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
          <li>
            <span className="font-mono text-[11px] text-teal-700 dark:text-teal-300">@[nama_kunci]</span> — nilai kolom{' '}
            <strong>input</strong> atau <strong>rumus</strong> yang sudah di atas baris ini (angka di rumus numerik; teks di kolom tipe Teks).
          </li>
          <li>
            <span className="font-mono text-[11px] text-teal-700 dark:text-teal-300">@pengurus[nama_kolom]</span> — data pengurus baris
            rekap.
          </li>
          <li>
            <span className="font-mono text-[11px] text-teal-700 dark:text-teal-300">@jabatan[nama_kolom]</span> — master jabatan aktif (mis.{' '}
            <span className="font-mono">bonus</span>, <span className="font-mono">per_jp</span>, <span className="font-mono">tipe</span>)
            sesuai filter lembaga di tab Rekap (banyak jabatan → gabung koma).
          </li>
          <li>
            <span className="font-mono text-[11px] text-teal-700 dark:text-teal-300">@pj[nama_kolom]</span> — penugasan pengurus___jabatan.
          </li>
          <li>
            Autocomplete: <kbd className="px-1 rounded bg-gray-200 dark:bg-gray-700 font-mono text-[10px]">@pengurus[</kbd>,{' '}
            <kbd className="px-1 rounded bg-gray-200 dark:bg-gray-700 font-mono text-[10px]">@jabatan[</kbd>,{' '}
            <kbd className="px-1 rounded bg-gray-200 dark:bg-gray-700 font-mono text-[10px]">@pj[</kbd>.
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/50 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Fungsi &amp; operator tersedia</h3>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
          Operator: + − × ÷ ( ) ^ &amp; (gabung teks, kolom tipe Teks) dan perbandingan &gt; &lt; &gt;= &lt;= == !=
        </p>
        <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-700">
          {fnRows.map((row) => (
            <li key={row.name} className="py-2 first:pt-0 last:pb-0">
              <code className="text-[11px] sm:text-xs font-mono text-purple-700 dark:text-purple-300 break-all">{row.name}</code>
              <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">{row.desc}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Contoh rumus</h3>
        <ul className="mt-2 space-y-3">
          {examples.map((ex) => (
            <li key={ex.label}>
              <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{ex.label}</p>
              <pre className="mt-1 text-[10px] sm:text-xs font-mono text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 p-2 rounded border border-gray-200 dark:border-gray-600 whitespace-pre-wrap break-all">
                {ex.rumus}
              </pre>
            </li>
          ))}
        </ul>
      </div>

      {[{ title: 'Tabel pengurus', prefix: '@pengurus', fields: pengurusFields }, { title: 'Tabel jabatan', prefix: '@jabatan', fields: jabatanFields }, { title: 'Penugasan jabatan', prefix: '@pj', fields: pjFields }].map(
        (block) =>
          block.fields.length > 0 ? (
            <div
              key={block.title}
              className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 px-4 py-3"
            >
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{block.title}</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Rujuk dengan <span className="font-mono">{block.prefix}[kolom]</span>
              </p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2 text-[11px]">
                {block.fields.map((f) => (
                  <li key={f.key} className="font-mono text-gray-700 dark:text-gray-300">
                    {block.prefix}[{f.key}] <span className="font-sans text-gray-500">— {f.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null
      )}
    </div>
  )
}

export default function BisyarohPage() {
  const { showNotification } = useNotification()
  const fitur = useBisyarohFiturAccess()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab')
  const periodeBulanFromUrl = searchParams.get('periode_bulan')
  const kalenderFromUrl = searchParams.get('kalender')
  const [activeTab, setActiveTab] = useState(() =>
    tabFromUrl && TAB_ORDER.includes(tabFromUrl) ? tabFromUrl : 'rekap'
  )

  const [lembagaList, setLembagaList] = useState([])
  /** Tab Rekap: daftar lembaga dari API (ter-scope per peran tab Rekap / aksi lembaga_semua) */
  const [lembagaListRekap, setLembagaListRekap] = useState([])
  /** Tab Review: lembaga yang sudah mengisi rekap pada bulan terpilih (termasuk sudah rilis) */
  const [lembagaListReview, setLembagaListReview] = useState([])
  const [reviewPeriodeOptions, setReviewPeriodeOptions] = useState([])
  const [loadingReviewPeriode, setLoadingReviewPeriode] = useState(false)
  const [loadingReviewLembaga, setLoadingReviewLembaga] = useState(false)
  const [loadingLembagaRekap, setLoadingLembagaRekap] = useState(false)
  const [rekapSemuaLembagaApi, setRekapSemuaLembagaApi] = useState(false)
  /** Tab Rekap: satu lembaga terpilih — set rekap = gabungan set yang dihubungkan ke lembaga ini (di tab Aturan) */
  const [rekapLembagaId, setRekapLembagaId] = useState('')
  const [rekapUrutanPanelOpen, setRekapUrutanPanelOpen] = useState(false)
  const [rekapPengurusUrutan, setRekapPengurusUrutan] = useState([])
  const [loadingRekapPengurusUrutan, setLoadingRekapPengurusUrutan] = useState(false)
  const [savingRekapPengurusUrutan, setSavingRekapPengurusUrutan] = useState(false)
  const [savingRekeningJatimKey, setSavingRekeningJatimKey] = useState('')
  const [setsForRekap, setSetsForRekap] = useState([])
  const [setsForAturan, setSetsForAturan] = useState([])
  /** Set yang sedang diedit di tab Aturan */
  const [bisyarohId, setBisyarohId] = useState(null)
  const [, setLoadingMeta] = useState(true)

  const [kolomRows, setKolomRows] = useState([])
  const [pengurusFormulaFields, setPengurusFormulaFields] = useState([])
  const [jabatanFormulaFields, setJabatanFormulaFields] = useState([])
  const [pjFormulaFields, setPjFormulaFields] = useState([])
  const [loadingKolom, setLoadingKolom] = useState(false)
  const [bisyarohDetail, setBisyarohDetail] = useState(null)

  const canEditKolomAturan = useMemo(
    () =>
      fitur.aturanKolom && (bisyarohDetail == null || bisyarohDetail.akses?.aturan_kolom !== false),
    [fitur.aturanKolom, bisyarohDetail]
  )
  const [periodeKalender, setPeriodeKalender] = useState(() =>
    searchParams.get('kalender') === 'hijriyah' ? 'hijriyah' : 'masehi'
  )
  const [periodeBulan, setPeriodeBulan] = useState(() => {
    const p = searchParams.get('periode_bulan')
    if (p && /^\d{4}-\d{2}$/.test(p)) return p
    return defaultPeriodeBulanMasehi()
  })
  /** Set Bisyaroh yang ditampilkan di tab Rekap (bisa >1 untuk subtotal & total gabungan) */
  const [rekapSetIds, setRekapSetIds] = useState([])
  const [rekapSections, setRekapSections] = useState([])
  const [rekapGrandTotal, setRekapGrandTotal] = useState(0)
  const [loadingRekap, setLoadingRekap] = useState(false)
  const [savingRekapBulk, setSavingRekapBulk] = useState(false)
  const [modalExcelRekap, setModalExcelRekap] = useState(false)
  const [exportingReviewExcel, setExportingReviewExcel] = useState(false)
  const [exportAccordionOpen, setExportAccordionOpen] = useState(false)
  const [rilisManualBusyKey, setRilisManualBusyKey] = useState('')
  const [reviewDisabledRowKeys, setReviewDisabledRowKeys] = useState(() => new Set())
  /** @type {Record<string, string>} key `bisyarohId:lembagaId` → pengajuan | ditinjau | rilis */
  const [rekapStatusMap, setRekapStatusMap] = useState({})
  const [rekapStatusReady, setRekapStatusReady] = useState(false)
  const [loadingRekapStatus, setLoadingRekapStatus] = useState(false)
  const [savingRekapStatusKey, setSavingRekapStatusKey] = useState('')

  const [offcanvasSetForm, setOffcanvasSetForm] = useState(false)
  const [showSetFormPortal, setShowSetFormPortal] = useState(false)
  const [setFormMode, setSetFormMode] = useState('create')
  const closeSetFormOffcanvas = useOffcanvasBackClose(offcanvasSetForm, () => setOffcanvasSetForm(false), {
    useDomisiliPopstateStack: true,
    domisiliStackId: 'bisyaroh-set-form',
    domisiliStackPriority: 12,
  })
  const [formSetNama, setFormSetNama] = useState('')
  const [formSetLembagaIds, setFormSetLembagaIds] = useState([])
  const [savingSetForm, setSavingSetForm] = useState(false)
  const [savingSetAktif, setSavingSetAktif] = useState(false)

  const [modalKolom, setModalKolom] = useState(false)
  const [showKolomPortal, setShowKolomPortal] = useState(false)
  const closeKolomOffcanvas = useOffcanvasBackClose(modalKolom, () => setModalKolom(false))

  useEffect(() => {
    if (modalKolom) setShowKolomPortal(true)
  }, [modalKolom])
  useEffect(() => {
    if (offcanvasSetForm) setShowSetFormPortal(true)
  }, [offcanvasSetForm])
  const [formKolom, setFormKolom] = useState({
    col_key: '',
    kind: 'input',
    label: '',
    keterangan: '',
    input_tipe: 'angka',
    default_nilai: '',
    rumus: '',
    masuk_total: true,
    sort_order: 0,
    aktif: true,
    _editId: null
  })

  useEffect(() => {
    const allowed = {
      rekap: fitur.tabRekap,
      review: fitur.tabRekap,
      rilis: fitur.tabRilis,
      histori: fitur.tabHistori,
      aturan: fitur.tabAturan
    }
    if (!allowed[activeTab]) {
      const next = TAB_ORDER.find((t) => allowed[t])
      if (next) setActiveTab(next)
    }
  }, [activeTab, fitur.tabRekap, fitur.tabRilis, fitur.tabHistori, fitur.tabAturan])

  useEffect(() => {
    const allowed = {
      rekap: fitur.tabRekap,
      review: fitur.tabRekap,
      rilis: fitur.tabRilis,
      histori: fitur.tabHistori,
      aturan: fitur.tabAturan
    }
    if (tabFromUrl && allowed[tabFromUrl]) setActiveTab(tabFromUrl)
  }, [tabFromUrl, fitur.tabRekap, fitur.tabRilis, fitur.tabHistori, fitur.tabAturan])

  const goToTab = useCallback(
    (tab) => {
      const allowed = {
        rekap: fitur.tabRekap,
        review: fitur.tabRekap,
        rilis: fitur.tabRilis,
        histori: fitur.tabHistori,
        aturan: fitur.tabAturan
      }
      if (!allowed[tab]) return
      setActiveTab(tab)
      const next = new URLSearchParams(searchParams)
      next.set('tab', tab)
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams, fitur.tabRekap, fitur.tabRilis, fitur.tabHistori, fitur.tabAturan]
  )

  const patchRekapQuery = useCallback(
    (periode, kal) => {
      const next = new URLSearchParams(searchParams)
      next.set('periode_bulan', periode)
      next.set('kalender', kal)
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams]
  )

  useEffect(() => {
    if (activeTab !== 'rekap' && activeTab !== 'review') return
    if (periodeBulanFromUrl && /^\d{4}-\d{2}$/.test(periodeBulanFromUrl)) {
      setPeriodeBulan((prev) => (prev === periodeBulanFromUrl ? prev : periodeBulanFromUrl))
    }
    if (kalenderFromUrl === 'hijriyah' || kalenderFromUrl === 'masehi') {
      const k = kalenderFromUrl === 'hijriyah' ? 'hijriyah' : 'masehi'
      setPeriodeKalender((prev) => (prev === k ? prev : k))
    }
  }, [activeTab, periodeBulanFromUrl, kalenderFromUrl])

  useEffect(() => {
    if (periodeBulanFromUrl && /^\d{4}-\d{2}$/.test(periodeBulanFromUrl)) return
    if (periodeKalender !== 'hijriyah') return
    let cancelled = false
    ;(async () => {
      const ym = await fetchDefaultPeriodeBulanHijriyah(kalenderAPI)
      if (cancelled || !ym) return
      setPeriodeBulan(ym)
      patchRekapQuery(ym, 'hijriyah')
    })()
    return () => {
      cancelled = true
    }
  }, [periodeKalender, periodeBulanFromUrl, patchRekapQuery])

  const setKalenderMode = useCallback(
    async (mode) => {
      if (mode === periodeKalender) return
      if (mode === 'hijriyah') {
        setPeriodeKalender('hijriyah')
        const ym = await fetchDefaultPeriodeBulanHijriyah(kalenderAPI)
        setPeriodeBulan(ym)
        patchRekapQuery(ym, 'hijriyah')
        return
      }
      setPeriodeKalender('masehi')
      const v = defaultPeriodeBulanMasehi()
      setPeriodeBulan(v)
      patchRekapQuery(v, 'masehi')
    },
    [periodeKalender, patchRekapQuery]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoadingMeta(true)
        const res = await lembagaAPI.getAll()
        if (!cancelled && res?.success) setLembagaList(res.data || [])
      } catch {
        if (!cancelled) showNotification('Gagal memuat lembaga', 'error')
      } finally {
        if (!cancelled) setLoadingMeta(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showNotification])

  useEffect(() => {
    if (!fitur.tabRekap && !fitur.tabHistori) return
    let cancelled = false
    ;(async () => {
      try {
        setLoadingLembagaRekap(true)
        const res = await bisyarohAPI.listRekapLembaga()
        if (cancelled) return
        if (res?.success) {
          setLembagaListRekap(Array.isArray(res.data) ? res.data : [])
          setRekapSemuaLembagaApi(!!res.semua_lembaga)
        } else {
          setLembagaListRekap([])
          setRekapSemuaLembagaApi(false)
        }
      } catch {
        if (!cancelled) {
          showNotification('Gagal memuat lembaga untuk rekap', 'error')
          setLembagaListRekap([])
          setRekapSemuaLembagaApi(false)
        }
      } finally {
        if (!cancelled) setLoadingLembagaRekap(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fitur.tabRekap, fitur.tabHistori, showNotification])

  const lembagaListForTab = activeTab === 'review' ? lembagaListReview : lembagaListRekap
  const loadingLembagaForTab =
    activeTab === 'review' ? loadingReviewLembaga : loadingLembagaRekap

  useEffect(() => {
    if (!fitur.tabRekap) return
    const list = activeTab === 'review' ? lembagaListReview : lembagaListRekap
    if (list.length === 0) {
      setRekapLembagaId('')
      return
    }
    const validIds = new Set(list.map((l) => l.id))
    setRekapLembagaId((prev) => {
      if (prev && validIds.has(prev)) return prev
      return list[0]?.id || ''
    })
  }, [lembagaListRekap, lembagaListReview, fitur.tabRekap, activeTab])

  const lembagaRekapFilterLocked = lembagaListForTab.length <= 1

  const loadReviewMetaPeriode = useCallback(
    async (kal) => {
      if (!fitur.tabRekap || !kal) {
        setReviewPeriodeOptions([])
        return
      }
      setLoadingReviewPeriode(true)
      try {
        const res = await bisyarohAPI.listRekapReviewMeta({ kalender: kal })
        if (res?.success) {
          setReviewPeriodeOptions(Array.isArray(res.data?.periode) ? res.data.periode : [])
        } else {
          setReviewPeriodeOptions([])
        }
      } catch {
        setReviewPeriodeOptions([])
        showNotification('Gagal memuat periode Review', 'error')
      } finally {
        setLoadingReviewPeriode(false)
      }
    },
    [fitur.tabRekap, showNotification]
  )

  const loadReviewMetaLembaga = useCallback(
    async (kal, periode) => {
      if (!fitur.tabRekap || !kal || !periode || !/^\d{4}-\d{2}$/.test(periode)) {
        setLembagaListReview([])
        return
      }
      setLoadingReviewLembaga(true)
      try {
        const res = await bisyarohAPI.listRekapReviewMeta({
          kalender: kal,
          periode_bulan: periode
        })
        if (res?.success) {
          setLembagaListReview(Array.isArray(res.data?.lembaga) ? res.data.lembaga : [])
        } else {
          setLembagaListReview([])
        }
      } catch {
        setLembagaListReview([])
        showNotification('Gagal memuat lembaga untuk Review', 'error')
      } finally {
        setLoadingReviewLembaga(false)
      }
    },
    [fitur.tabRekap, showNotification]
  )

  useEffect(() => {
    if (activeTab !== 'review' || !fitur.tabRekap) return
    loadReviewMetaPeriode(periodeKalender)
  }, [activeTab, fitur.tabRekap, periodeKalender, loadReviewMetaPeriode])

  useEffect(() => {
    if (activeTab !== 'review' || !fitur.tabRekap) return
    if (!periodeBulan || !/^\d{4}-\d{2}$/.test(periodeBulan)) {
      setLembagaListReview([])
      return
    }
    loadReviewMetaLembaga(periodeKalender, periodeBulan)
  }, [activeTab, fitur.tabRekap, periodeKalender, periodeBulan, loadReviewMetaLembaga])

  useEffect(() => {
    if (activeTab !== 'review' || reviewPeriodeOptions.length === 0) return
    const ok = reviewPeriodeOptions.some(
      (p) => p.periode_bulan === periodeBulan && (p.kalender || periodeKalender) === periodeKalender
    )
    if (!ok) {
      const first = reviewPeriodeOptions[0]
      if (first?.periode_bulan) {
        setPeriodeBulan(first.periode_bulan)
        patchRekapQuery(first.periode_bulan, periodeKalender)
      }
    }
  }, [activeTab, reviewPeriodeOptions, periodeBulan, periodeKalender, patchRekapQuery])

  const rekapLembagaIdsForApi = useMemo(
    () => (rekapLembagaId ? [rekapLembagaId] : []),
    [rekapLembagaId]
  )

  const loadSetsRekap = useCallback(async () => {
    if (!rekapLembagaId) {
      setSetsForRekap([])
      setRekapSetIds([])
      return
    }
    try {
      const res = await bisyarohAPI.list(rekapLembagaIdsForApi)
      if (res?.success) {
        const rows = (res.data || []).filter((s) => s.aktif === true || s.aktif === 1 || s.aktif === '1')
        setSetsForRekap(rows)
      }
    } catch {
      showNotification('Gagal memuat set Bisyaroh untuk rekap', 'error')
    }
  }, [rekapLembagaId, rekapLembagaIdsForApi, showNotification])

  const loadSetsAturan = useCallback(async () => {
    if (!fitur.tabAturan) {
      setSetsForAturan([])
      return
    }
    try {
      const res = await bisyarohAPI.listAll()
      if (res?.success) {
        const rows = res.data || []
        setSetsForAturan(rows)
        setBisyarohId((prev) => {
          if (rows.length === 0) return null
          if (prev != null && rows.some((r) => r.id === prev)) return prev
          return rows[0].id
        })
      }
    } catch {
      showNotification('Gagal memuat daftar set Bisyaroh', 'error')
    }
  }, [fitur.tabAturan, showNotification])

  useEffect(() => {
    loadSetsRekap()
  }, [loadSetsRekap])

  useEffect(() => {
    if (activeTab === 'aturan') loadSetsAturan()
  }, [activeTab, loadSetsAturan])

  /** Samakan pilihan set untuk rekap dengan set yang masih ada; satu set → otomatis dipakai */
  useEffect(() => {
    if (setsForRekap.length === 0) {
      setRekapSetIds([])
      return
    }
    setRekapSetIds((prev) => {
      const valid = prev.filter((id) => setsForRekap.some((s) => s.id === id))
      if (valid.length > 0) return valid
      return [setsForRekap[0].id]
    })
  }, [setsForRekap])

  const loadKolom = useCallback(async ({ silent = false } = {}) => {
    if (!bisyarohId || !fitur.tabAturan) {
      setKolomRows([])
      setPengurusFormulaFields([])
      setJabatanFormulaFields([])
      setPjFormulaFields([])
      return
    }
    if (!silent) setLoadingKolom(true)
    try {
      const res = await bisyarohAPI.listKolom(bisyarohId)
      if (res?.success) {
        setKolomRows(res.data || [])
        setPengurusFormulaFields(Array.isArray(res.pengurus_formula_fields) ? res.pengurus_formula_fields : [])
        setJabatanFormulaFields(Array.isArray(res.jabatan_formula_fields) ? res.jabatan_formula_fields : [])
        setPjFormulaFields(
          Array.isArray(res.pengurus_jabatan_formula_fields) ? res.pengurus_jabatan_formula_fields : []
        )
      }
    } catch {
      showNotification('Gagal memuat kolom aturan', 'error')
    } finally {
      if (!silent) setLoadingKolom(false)
    }
  }, [bisyarohId, fitur.tabAturan, showNotification])

  useEffect(() => {
    if (activeTab === 'aturan') loadKolom()
  }, [activeTab, loadKolom])

  useEffect(() => {
    if (activeTab !== 'aturan' || !bisyarohId) {
      setBisyarohDetail(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await bisyarohAPI.get(bisyarohId)
        if (!cancelled && res?.success) setBisyarohDetail(res.data)
        else if (!cancelled) setBisyarohDetail(null)
      } catch {
        if (!cancelled) setBisyarohDetail(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeTab, bisyarohId])

  const loadRekap = useCallback(async () => {
    if (!fitur.tabRekap || rekapSetIds.length === 0) {
      setRekapSections([])
      setRekapGrandTotal(0)
      return
    }
    if (activeTab === 'review') {
      if (
        !rekapLembagaId ||
        reviewPeriodeOptions.length === 0 ||
        !reviewPeriodeOptions.some((p) => p.periode_bulan === periodeBulan)
      ) {
        setRekapSections([])
        setRekapGrandTotal(0)
        return
      }
    }
    setLoadingRekap(true)
    try {
      if (rekapSetIds.length === 1) {
        const bid = rekapSetIds[0]
        const res = await bisyarohAPI.listRekap(bid, periodeBulan, periodeKalender, rekapLembagaIdsForApi)
        if (res?.success && res.data) {
          const rows = (res.data.rows || []).map((r) => ({
            ...r,
            inputs: { ...(r.inputs || {}) },
            catatan: r.catatan ?? ''
          }))
          const sub = rows.reduce((a, r) => a + (Number(r.total_nominal) || 0), 0)
          const meta = setsForRekap.find((s) => s.id === bid)
          setRekapSections([
            {
              bisyaroh_id: bid,
              bisyaroh_nama: meta?.nama || null,
              kolom: res.data.kolom || [],
              rows,
              subtotal_nominal: sub
            }
          ])
          setRekapGrandTotal(sub)
        } else {
          setRekapSections([])
          setRekapGrandTotal(0)
        }
      } else {
        const res = await bisyarohAPI.listRekapMulti(rekapSetIds, periodeBulan, periodeKalender, rekapLembagaIdsForApi)
        if (res?.success && res.data) {
          const sections = (res.data.sections || []).map((sec) => ({
            ...sec,
            rows: (sec.rows || []).map((r) => ({
              ...r,
              inputs: { ...(r.inputs || {}) },
              catatan: r.catatan ?? ''
            }))
          }))
          setRekapSections(sections)
          setRekapGrandTotal(Number(res.data.grand_total_nominal) || 0)
        } else {
          setRekapSections([])
          setRekapGrandTotal(0)
        }
      }
    } catch (e) {
      showNotification(e?.response?.data?.message || 'Gagal memuat rekap', 'error')
      setRekapSections([])
      setRekapGrandTotal(0)
    } finally {
      setLoadingRekap(false)
    }
  }, [
    rekapSetIds,
    periodeBulan,
    periodeKalender,
    fitur.tabRekap,
    showNotification,
    setsForRekap,
    rekapLembagaIdsForApi,
    activeTab,
    rekapLembagaId,
    reviewPeriodeOptions
  ])

  useEffect(() => {
    if (activeTab === 'rekap' || activeTab === 'review') loadRekap()
  }, [activeTab, loadRekap, rekapSetIds, reviewPeriodeOptions, rekapLembagaId])

  const loadRekapStatuses = useCallback(async () => {
    if (!fitur.tabRekap || rekapSetIds.length === 0 || !rekapLembagaId) {
      setRekapStatusMap({})
      setRekapStatusReady(false)
      return
    }
    setLoadingRekapStatus(true)
    try {
      const res = await bisyarohAPI.listRekapStatuses({
        bisyarohIds: rekapSetIds,
        lembagaIds: rekapLembagaIdsForApi,
        periodeBulan: periodeBulan,
        kalender: periodeKalender
      })
      if (res?.success) {
        setRekapStatusReady(!!res.rekap_status_ready)
        const m = {}
        ;(res.data?.items || []).forEach((it) => {
          m[`${it.bisyaroh_id}:${it.lembaga_id}`] = it.status
        })
        setRekapStatusMap(m)
      } else {
        setRekapStatusMap({})
        setRekapStatusReady(false)
      }
    } catch {
      setRekapStatusMap({})
      setRekapStatusReady(false)
    } finally {
      setLoadingRekapStatus(false)
    }
  }, [fitur.tabRekap, rekapSetIds, rekapLembagaId, rekapLembagaIdsForApi, periodeBulan, periodeKalender])

  useEffect(() => {
    if (activeTab !== 'rekap' && activeTab !== 'review') return
    loadRekapStatuses()
  }, [activeTab, loadRekapStatuses])

  const loadRekapPengurusUrutan = useCallback(async () => {
    if (!rekapLembagaId || !fitur.tabRekap) {
      setRekapPengurusUrutan([])
      return
    }
    setLoadingRekapPengurusUrutan(true)
    try {
      const res = await bisyarohAPI.getRekapPengurusUrutan(rekapLembagaId)
      if (res?.success) {
        setRekapPengurusUrutan(Array.isArray(res.data?.pengurus) ? res.data.pengurus : [])
      } else {
        setRekapPengurusUrutan([])
      }
    } catch {
      setRekapPengurusUrutan([])
      showNotification('Gagal memuat urutan pengurus', 'error')
    } finally {
      setLoadingRekapPengurusUrutan(false)
    }
  }, [rekapLembagaId, fitur.tabRekap, showNotification])

  useEffect(() => {
    setRekapUrutanPanelOpen(false)
    setRekapPengurusUrutan([])
  }, [rekapLembagaId])

  useEffect(() => {
    if (activeTab !== 'rekap' || !rekapUrutanPanelOpen || !rekapLembagaId) return
    loadRekapPengurusUrutan()
  }, [activeTab, rekapUrutanPanelOpen, rekapLembagaId, loadRekapPengurusUrutan])

  const toggleRekapUrutanPanel = useCallback(() => {
    setRekapUrutanPanelOpen((open) => !open)
  }, [])

  const persistRekapPengurusOrder = useCallback(
    async (ordered) => {
      if (!rekapLembagaId || savingRekapPengurusUrutan) return
      setSavingRekapPengurusUrutan(true)
      try {
        const orderIds = ordered.map((r) => r.id)
        const res = await bisyarohAPI.putRekapPengurusUrutan(rekapLembagaId, orderIds)
        if (res?.success) {
          setRekapPengurusUrutan(ordered)
          await loadRekap()
        } else {
          showNotification(res?.message || 'Gagal menyimpan urutan', 'error')
          loadRekapPengurusUrutan()
        }
      } catch (e) {
        showNotification(e?.response?.data?.message || 'Gagal menyimpan urutan pengurus', 'error')
        loadRekapPengurusUrutan()
      } finally {
        setSavingRekapPengurusUrutan(false)
      }
    },
    [rekapLembagaId, savingRekapPengurusUrutan, loadRekap, loadRekapPengurusUrutan, showNotification]
  )

  const applyRekapStatusLocal = useCallback((bisyarohId, lembagaId, status) => {
    const k = `${bisyarohId}:${lembagaId}`
    setRekapStatusMap((prev) => ({ ...prev, [k]: status }))
  }, [])

  const submitRekapStatus = useCallback(
    async (bisyarohId, lembagaId, status) => {
      const key = `${bisyarohId}:${lembagaId}:${status}`
      setSavingRekapStatusKey(key)
      try {
        const res = await bisyarohAPI.updateRekapStatus(bisyarohId, {
          lembaga_id: lembagaId,
          periode_bulan: periodeBulan,
          kalender: periodeKalender,
          status
        })
        if (res?.success) {
          applyRekapStatusLocal(bisyarohId, lembagaId, status)
          showNotification(res.message || 'Status diperbarui', 'success')
          const pk = res.data?.potong_kewajiban
          if (status === 'rilis' && pk && (pk.applied > 0 || (Array.isArray(pk.messages) && pk.messages.length > 0))) {
            const bits = []
            if (pk.applied > 0) bits.push(`Potong UWABA: ${pk.applied} alokasi tercatat.`)
            if (Array.isArray(pk.messages)) pk.messages.forEach((m) => bits.push(m))
            if (bits.length) showNotification(bits.join(' '), 'info')
          }
          if (status === 'rilis') {
            loadReviewMetaPeriode(periodeKalender)
            loadReviewMetaLembaga(periodeKalender, periodeBulan)
          }
        } else {
          showNotification(res?.message || 'Gagal memperbarui status', 'error')
        }
      } catch (e) {
        showNotification(e?.response?.data?.message || 'Gagal memperbarui status', 'error')
      } finally {
        setSavingRekapStatusKey('')
      }
    },
    [
      periodeBulan,
      periodeKalender,
      applyRekapStatusLocal,
      showNotification,
      loadReviewMetaPeriode,
      loadReviewMetaLembaga
    ]
  )

  const rekapSetsCanDitinjau = useMemo(() => {
    if (!rekapLembagaId) return []
    return rekapSetIds.filter((bid) => {
      const st = rekapStatusMap[`${bid}:${rekapLembagaId}`] || 'pengajuan'
      return st === 'pengajuan'
    })
  }, [rekapSetIds, rekapLembagaId, rekapStatusMap])

  const tandaiSemuaDitinjau = useCallback(async () => {
    if (rekapSetsCanDitinjau.length === 0) return
    if (
      !window.confirm(
        `Tandai ditinjau ${rekapSetsCanDitinjau.length} set rekap untuk lembaga ini?`
      )
    ) {
      return
    }
    for (const bid of rekapSetsCanDitinjau) {
      await submitRekapStatus(bid, rekapLembagaId, 'ditinjau')
    }
    await loadRekapStatuses()
  }, [rekapSetsCanDitinjau, rekapLembagaId, submitRekapStatus, loadRekapStatuses])

  const handleRilisManualRow = useCallback(
    async (row) => {
      if (!row?.id) {
        showNotification('Baris rekap belum tersimpan', 'error')
        return
      }
      if (
        !window.confirm(
          `Konfirmasi transfer berhasil untuk ${row.pengurus_nama || 'pengurus ini'}?`
        )
      ) {
        return
      }
      setRilisManualBusyKey(String(row.id))
      try {
        const res = await bisyarohAPI.transferRilisManual({
          rekap_baris_id: row.id,
          lembaga_id: rekapLembagaId,
          periode_bulan: periodeBulan,
          kalender: periodeKalender
        })
        if (res?.success) {
          const rid = Number(res.data?.rekap_baris_id || row.id)
          setRekapSections((prev) =>
            prev.map((sec) => ({
              ...sec,
              rows: (sec.rows || []).map((r) =>
                Number(r.id) === rid ? { ...r, transfer_status: 'berhasil', frozen: true } : r
              )
            }))
          )
          showNotification(res.message || 'Transfer ditandai berhasil', 'success')
        } else {
          showNotification(res?.message || 'Gagal', 'error')
        }
      } catch (e) {
        showNotification(e?.response?.data?.message || 'Gagal rilis manual', 'error')
      } finally {
        setRilisManualBusyKey('')
      }
    },
    [rekapLembagaId, periodeBulan, periodeKalender, showNotification]
  )

  const openOffcanvasSetBaru = () => {
    setSetFormMode('create')
    setFormSetNama('')
    setFormSetLembagaIds([])
    setOffcanvasSetForm(true)
  }

  const openOffcanvasSetEdit = async () => {
    if (!bisyarohId) return
    if (!canEditKolomAturan) {
      showNotification('Anda tidak punya akses mengubah set aturan', 'error')
      return
    }
    try {
      const res = await bisyarohAPI.show(bisyarohId)
      if (res?.success && res.data) {
        setSetFormMode('edit')
        setFormSetNama(res.data.nama ?? '')
        setFormSetLembagaIds(Array.isArray(res.data.lembaga_ids) ? res.data.lembaga_ids : [])
        setOffcanvasSetForm(true)
      } else {
        showNotification(res?.message || 'Gagal memuat set', 'error')
      }
    } catch (e) {
      showNotification(e?.response?.data?.message || 'Gagal memuat set', 'error')
    }
  }

  const submitSetForm = async () => {
    const nama = (formSetNama || '').trim()
    if (!nama) {
      showNotification('Nama set wajib diisi', 'error')
      return
    }
    setSavingSetForm(true)
    try {
      if (setFormMode === 'create') {
        const body = { nama, aktif: 1 }
        if (formSetLembagaIds.length > 0) body.lembaga_ids = formSetLembagaIds
        const res = await bisyarohAPI.create(body)
        if (res?.success) {
          showNotification(res.message || 'Set dibuat', 'success')
          closeSetFormOffcanvas()
          await loadSetsAturan()
          if (res.data?.id) setBisyarohId(res.data.id)
          loadSetsRekap()
        } else {
          showNotification(res?.message || 'Gagal', 'error')
        }
      } else if (bisyarohId) {
        const res = await bisyarohAPI.update(bisyarohId, { nama, lembaga_ids: formSetLembagaIds })
        if (res?.success) {
          showNotification(res.message || 'Set diperbarui', 'success')
          closeSetFormOffcanvas()
          loadSetsAturan()
          loadSetsRekap()
        } else {
          showNotification(res?.message || 'Gagal', 'error')
        }
      }
    } catch (e) {
      showNotification(e?.response?.data?.message || 'Gagal menyimpan set', 'error')
    } finally {
      setSavingSetForm(false)
    }
  }

  const toggleFormSetLembaga = (id) => {
    setFormSetLembagaIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const openModalKolom = (row) => {
    if (!canEditKolomAturan) {
      showNotification('Anda tidak punya akses mengubah kolom aturan', 'error')
      return
    }
    if (row) {
      setFormKolom({
        col_key: row.col_key || '',
        kind: row.kind === 'formula' ? 'formula' : 'input',
        label: row.label || '',
        keterangan: row.keterangan || '',
        input_tipe:
          row.kind === 'formula'
            ? ['angka', 'rupiah', 'persen', 'teks'].includes(row.input_tipe)
              ? row.input_tipe
              : 'angka'
            : ['angka', 'rupiah', 'teks', 'checkbox'].includes(row.input_tipe)
              ? row.input_tipe
              : 'angka',
        default_nilai: row.default_nilai != null ? String(row.default_nilai) : '',
        rumus: row.rumus || '',
        masuk_total: !!row.masuk_total,
        sort_order: row.sort_order ?? 0,
        aktif: !!row.aktif,
        _editId: row.id
      })
    } else {
      const nextOrder =
        kolomRows.length === 0 ? 0 : Math.max(...kolomRows.map((k) => Number(k.sort_order) || 0)) + 10
      setFormKolom({
        col_key: '',
        kind: 'input',
        label: '',
        keterangan: '',
        input_tipe: 'angka',
        default_nilai: '',
        rumus: '',
        masuk_total: true,
        sort_order: nextOrder,
        aktif: true,
        _editId: null
      })
    }
    setModalKolom(true)
  }

  const mergeSavedKolomRow = useCallback((saved) => {
    if (!saved?.id) return
    setKolomRows((prev) => {
      const idx = prev.findIndex((k) => k.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], ...saved }
        return next
      }
      return [...prev, saved]
    })
  }, [])

  const submitKolom = async () => {
    if (!bisyarohId) return
    if (!canEditKolomAturan) {
      showNotification('Anda tidak punya akses mengubah kolom aturan', 'error')
      return
    }
    const ck = (formKolom.col_key || '').trim().toLowerCase()
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(ck)) {
      showNotification('Kunci kolom: huruf kecil, angka, underscore, mulai huruf (mis. hari, jam_kerja)', 'error')
      return
    }
    if (!(formKolom.label || '').trim()) {
      showNotification('Judul kolom wajib', 'error')
      return
    }
    const body = {
      col_key: ck,
      kind: formKolom.kind,
      label: formKolom.label.trim(),
      keterangan: (formKolom.keterangan || '').trim() || null,
      input_tipe: formKolom.input_tipe || 'angka',
      default_nilai: formKolom.kind === 'input' && formKolom.default_nilai !== '' ? formKolom.default_nilai : null,
      rumus: formKolom.kind === 'formula' ? (formKolom.rumus || '').trim() : null,
      masuk_total:
        (formKolom.kind === 'input' || formKolom.kind === 'formula') && formKolom.input_tipe === 'teks'
          ? 0
          : formKolom.masuk_total
            ? 1
            : 0,
      sort_order: parseInt(formKolom.sort_order, 10) || 0,
      aktif: formKolom.aktif ? 1 : 0
    }
    if (formKolom.kind === 'formula' && !body.rumus) {
      showNotification('Isi rumus (mis. @[hari]*15000)', 'error')
      return
    }
    try {
      if (formKolom._editId) {
        const res = await bisyarohAPI.updateKolom(bisyarohId, formKolom._editId, body)
        if (res?.success) {
          if (formKolom.kind === 'formula' && formKolom.input_tipe === 'teks' && res.data?.input_tipe !== 'teks') {
            showNotification('Tipe Teks tidak tersimpan. Pastikan API sudah diperbarui (≥ 2.12.37).', 'error')
          } else {
            showNotification(res.message || 'Diperbarui', 'success')
          }
          if (res.data) mergeSavedKolomRow(res.data)
          closeKolomOffcanvas()
          loadKolom({ silent: true })
        } else showNotification(res?.message || 'Gagal', 'error')
      } else {
        const res = await bisyarohAPI.createKolom(bisyarohId, body)
        if (res?.success) {
          if (formKolom.kind === 'formula' && formKolom.input_tipe === 'teks' && res.data?.input_tipe !== 'teks') {
            showNotification('Tipe Teks tidak tersimpan. Pastikan API sudah diperbarui (≥ 2.12.37).', 'error')
          } else {
            showNotification(res.message || 'Ditambah', 'success')
          }
          if (res.data) mergeSavedKolomRow(res.data)
          closeKolomOffcanvas()
          loadKolom({ silent: true })
        } else showNotification(res?.message || 'Gagal', 'error')
      }
    } catch (e) {
      showNotification(e?.response?.data?.message || 'Gagal menyimpan kolom', 'error')
    }
  }

  const persistKolomOrder = useCallback(
    async (ordered) => {
      if (!bisyarohId || !canEditKolomAturan) return
      const withSort = ordered.map((r, i) => ({
        ...r,
        sort_order: (i + 1) * 10
      }))
      setKolomRows(withSort)
      try {
        const res = await bisyarohAPI.reorderKolom(
          bisyarohId,
          ordered.map((r) => r.id)
        )
        if (res?.success) {
          showNotification(res.message || 'Urutan kolom diperbarui', 'success')
          if (rekapSetIds.includes(bisyarohId)) {
            await loadRekap()
          }
        } else {
          showNotification(res?.message || 'Gagal mengubah urutan kolom', 'error')
          await loadKolom({ silent: true })
        }
      } catch (e) {
        showNotification(e?.response?.data?.message || 'Gagal mengubah urutan kolom', 'error')
        await loadKolom({ silent: true })
      }
    },
    [bisyarohId, canEditKolomAturan, loadKolom, rekapSetIds, loadRekap, showNotification]
  )

  const deleteKolom = async (id) => {
    if (!canEditKolomAturan) {
      showNotification('Anda tidak punya akses mengubah kolom aturan', 'error')
      return
    }
    if (!bisyarohId || !window.confirm('Hapus kolom ini? Data rekap yang memakai kunci ini tetap ada; nilai diabaikan.'))
      return
    try {
      const res = await bisyarohAPI.deleteKolom(bisyarohId, id)
      if (res?.success) {
        showNotification(res.message || 'Dihapus', 'success')
        loadKolom()
      }
    } catch (e) {
      showNotification(e?.response?.data?.message || 'Gagal hapus', 'error')
    }
  }

  const rumusColSuggestions = useMemo(
    () => buildRumusColumnSuggestions(kolomRows, formKolom),
    [kolomRows, formKolom.sort_order, formKolom._editId, formKolom.col_key]
  )

  const updateRekapInput = (sectionBisyarohId, idPengurus, colKey, value) => {
    setRekapSections((prev) =>
      prev.map((sec) =>
        sec.bisyaroh_id !== sectionBisyarohId
          ? sec
          : {
              ...sec,
              rows: sec.rows.map((r) =>
                r.id_pengurus === idPengurus ? { ...r, inputs: { ...r.inputs, [colKey]: value } } : r
              )
            }
      )
    )
  }

  /** Hitung ulang rumus & total di server (tanpa simpan). */
  const runPreview = (sectionBisyarohId, idPengurus) => {
    setRekapSections((prev) => {
      const sec = prev.find((s) => s.bisyaroh_id === sectionBisyarohId)
      const cur = sec?.rows?.find((r) => r.id_pengurus === idPengurus)
      if (!cur || !sectionBisyarohId) return prev
      bisyarohAPI
        .previewRekap(sectionBisyarohId, {
          inputs: { ...(cur.inputs || {}) },
          id_pengurus: idPengurus,
          lembaga_ids: rekapLembagaId ? [rekapLembagaId] : undefined
        })
        .then((res) => {
          if (res?.success && res.data) {
            setRekapSections((p2) => {
              const next = p2.map((s) => {
                if (s.bisyaroh_id !== sectionBisyarohId) return s
                const rows = s.rows.map((r) =>
                  r.id_pengurus === idPengurus
                    ? {
                        ...r,
                        cells: res.data.cells,
                        total_nominal: res.data.total_nominal,
                        computed: res.data.computed
                      }
                    : r
                )
                const sub = rows.reduce((a, r) => a + (Number(r.total_nominal) || 0), 0)
                return { ...s, rows, subtotal_nominal: sub }
              })
              const grand = next.reduce((a, s) => a + (Number(s.subtotal_nominal) || 0), 0)
              setRekapGrandTotal(grand)
              return next
            })
          }
        })
      return prev
    })
  }

  const updateRekapCatatan = (sectionBisyarohId, idPengurus, catatan) => {
    setRekapSections((prev) =>
      prev.map((sec) =>
        sec.bisyaroh_id !== sectionBisyarohId
          ? sec
          : {
              ...sec,
              rows: sec.rows.map((r) => (r.id_pengurus === idPengurus ? { ...r, catatan } : r))
            }
      )
    )
  }

  const updateRekapRekeningJatimLocal = (sectionBisyarohId, idPengurus, value) => {
    setRekapSections((prev) =>
      prev.map((sec) =>
        sec.bisyaroh_id !== sectionBisyarohId
          ? sec
          : {
              ...sec,
              rows: sec.rows.map((r) =>
                r.id_pengurus === idPengurus ? { ...r, rekening_jatim: value } : r
              )
            }
      )
    )
  }

  const persistRekeningJatim = useCallback(
    async (idPengurus, value) => {
      if (!rekapLembagaId || !fitur.tabRekap) return
      const trimmed = String(value ?? '').trim()
      const key = String(idPengurus)
      setSavingRekeningJatimKey(key)
      try {
        const res = await bisyarohAPI.putRekapPengurusRekeningJatim(rekapLembagaId, idPengurus, trimmed)
        if (res?.success) {
          setRekapSections((prev) =>
            prev.map((sec) => ({
              ...sec,
              rows: (sec.rows || []).map((r) =>
                r.id_pengurus === idPengurus ? { ...r, rekening_jatim: trimmed } : r
              )
            }))
          )
        } else {
          showNotification(res?.message || 'Gagal menyimpan rekening Jatim', 'error')
          loadRekap()
        }
      } catch (e) {
        showNotification(e?.response?.data?.message || 'Gagal menyimpan rekening Jatim', 'error')
        loadRekap()
      } finally {
        setSavingRekeningJatimKey('')
      }
    },
    [rekapLembagaId, fitur.tabRekap, showNotification, loadRekap]
  )

  const saveAllRekap = async () => {
    if (rekapSetIds.length === 0) return
    const sections = rekapSections.filter((s) => rekapSetIds.includes(s.bisyaroh_id))
    if (sections.length === 0) return
    setSavingRekapBulk(true)
    try {
      let lastMsg = ''
      for (const sec of sections) {
        if (!sec.rows?.length) continue
        const res = await bisyarohAPI.upsertRekapBulk(sec.bisyaroh_id, {
          periode_bulan: periodeBulan,
          kalender: periodeKalender,
          lembaga_ids: rekapLembagaId ? [rekapLembagaId] : undefined,
          rows: sec.rows.map((row) => ({
            id_pengurus: row.id_pengurus,
            inputs: row.inputs || {},
            catatan: (row.catatan || '').trim() || null
          }))
        })
        if (!res?.success) {
          showNotification(res?.message || 'Gagal simpan salah satu set', 'error')
          return
        }
        lastMsg = res.message || ''
      }
      showNotification(lastMsg || 'Rekap disimpan', 'success')
      loadRekap()
    } catch (e) {
      showNotification(e?.response?.data?.message || 'Gagal simpan', 'error')
    } finally {
      setSavingRekapBulk(false)
    }
  }

  const applyExcelRekapSections = (nextSections) => {
    setRekapSections(nextSections)
    const grand = (nextSections || []).reduce(
      (acc, sec) =>
        acc +
        (sec.rows || []).reduce((sub, row) => sub + (Number(row.total_nominal) || 0), 0),
      0
    )
    setRekapGrandTotal(grand)
  }

  const reviewDisabledKey = useMemo(
    () =>
      reviewDisabledStorageKey({
        lembagaId: rekapLembagaId,
        periodeBulan,
        periodeKalender
      }),
    [rekapLembagaId, periodeBulan, periodeKalender]
  )

  useEffect(() => {
    setReviewDisabledRowKeys(loadReviewDisabledRowKeys(reviewDisabledKey))
  }, [reviewDisabledKey])

  const toggleReviewDisabledRow = useCallback(
    ({ bisyarohId, idPengurus }) => {
      const key = reviewRowKey(bisyarohId, idPengurus)
      setReviewDisabledRowKeys((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        persistReviewDisabledRowKeys(reviewDisabledKey, next)
        return next
      })
    },
    [reviewDisabledKey]
  )

  const reviewSectionsForView = useMemo(
    () => rekapSections.filter((s) => rekapSetIds.includes(s.bisyaroh_id)),
    [rekapSections, rekapSetIds]
  )

  const reviewSectionsWithDisabled = useMemo(
    () => applyReviewDisabledToSections(reviewSectionsForView, reviewDisabledRowKeys),
    [reviewSectionsForView, reviewDisabledRowKeys]
  )

  const reviewGrandTotal = useMemo(
    () => reviewGrandTotalFromSections(reviewSectionsForView, reviewDisabledRowKeys),
    [reviewSectionsForView, reviewDisabledRowKeys]
  )

  const reviewLembagaNama = useMemo(() => {
    const row = lembagaListReview.find((l) => l.id === rekapLembagaId)
    return row?.nama || rekapLembagaId || ''
  }, [lembagaListReview, rekapLembagaId])

  const handleExportReviewExcel = useCallback(() => {
    if (reviewSectionsForView.length === 0) {
      showNotification('Tidak ada data rekap untuk diekspor', 'error')
      return
    }
    setExportingReviewExcel(true)
    try {
      exportBisyarohReviewToExcel({
        sections: reviewSectionsForView,
        lembagaNama: reviewLembagaNama,
        lembagaId: rekapLembagaId,
        periodeBulan,
        periodeKalender,
        grandTotal: rekapGrandTotal,
        showGrandTotal: rekapSetIds.length > 1
      })
      showNotification('File Excel berhasil diunduh', 'success')
    } catch (e) {
      showNotification(e?.message || 'Gagal export ke Excel', 'error')
    } finally {
      setExportingReviewExcel(false)
    }
  }, [
    reviewSectionsForView,
    reviewLembagaNama,
    rekapLembagaId,
    periodeBulan,
    periodeKalender,
    rekapGrandTotal,
    rekapSetIds.length,
    showNotification
  ])

  const reviewDisabledKeysArray = useMemo(
    () => Array.from(reviewDisabledRowKeys || []),
    [reviewDisabledRowKeys]
  )

  const reviewPrintMeta = useMemo(
    () => ({
      lembagaNama: reviewLembagaNama,
      lembagaId: rekapLembagaId,
      periodeBulan,
      periodeKalender,
      periodeLabel: periodeBulan,
      grandTotal: reviewGrandTotal,
      showGrandTotal: rekapSetIds.length > 1
    }),
    [
      reviewLembagaNama,
      rekapLembagaId,
      periodeBulan,
      periodeKalender,
      reviewGrandTotal,
      rekapSetIds.length
    ]
  )

  const getRekapCell = (row, colKey) => {
    const c = (row.cells || []).find((x) => x.col_key === colKey)
    if (!c) {
      return { text: '—', error: false, title: '' }
    }
    if (c.error) {
      return {
        text: c.nilai_tampil || c.error_code || '#N/A',
        error: true,
        title: c.error_message || c.nilai_tampil || 'Perhitungan gagal'
      }
    }
    return {
      text: c.nilai_tampil ?? '—',
      error: false,
      title: ''
    }
  }

  const selectedSetAktif = useMemo(() => {
    const s = setsForAturan.find((x) => x.id === bisyarohId)
    if (!s) return true
    return !!(s.aktif === true || s.aktif === 1 || s.aktif === '1')
  }, [setsForAturan, bisyarohId])

  const ubahAktifSet = async (aktifBaru) => {
    if (!bisyarohId) return
    if (!aktifBaru) {
      if (
        !window.confirm(
          'Nonaktifkan set ini? Set tidak akan muncul di tab Rekap sampai diaktifkan lagi. Aturan & data rekap lama tetap tersimpan.'
        )
      ) {
        return
      }
    }
    setSavingSetAktif(true)
    try {
      const res = await bisyarohAPI.update(bisyarohId, { aktif: aktifBaru ? 1 : 0 })
      if (res?.success) {
        showNotification(res.message || (aktifBaru ? 'Set diaktifkan' : 'Set dinonaktifkan'), 'success')
        await loadSetsAturan()
        loadSetsRekap()
      } else showNotification(res?.message || 'Gagal', 'error')
    } catch (e) {
      showNotification(e?.response?.data?.message || 'Gagal memperbarui status set', 'error')
    } finally {
      setSavingSetAktif(false)
    }
  }

  const toggleRekapSet = (sid) => {
    setRekapSetIds((prev) => {
      if (prev.includes(sid)) {
        const next = prev.filter((x) => x !== sid)
        return next.length > 0 ? next : prev
      }
      return [...prev, sid]
    })
  }

  if (fitur.noTabAccess) {
    return (
      <div className="h-full overflow-hidden flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-900">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 max-w-md text-center">
          <p className="text-gray-700 dark:text-gray-200 font-medium">Akses tab Bisyaroh tidak diaktifkan</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Minta admin mengatur fitur aksi tab di Pengaturan → Fitur untuk peran Anda.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden bg-gray-50 dark:bg-gray-900" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
        <div className="p-4 sm:p-6 lg:p-8 pb-24 sm:pb-6 lg:pb-8">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 mb-6">
              <div className="border-b border-gray-200 dark:border-gray-700 min-w-0">
                <nav className="flex -mb-px w-full min-w-0 flex-nowrap items-stretch">
                  <div className="flex min-w-0 flex-1">
                    {fitur.tabRekap && (
                      <button
                        type="button"
                        onClick={() => goToTab('rekap')}
                        className={`flex-1 min-w-0 px-2 sm:px-4 py-2.5 sm:py-3 text-center text-xs sm:text-sm font-medium border-b-2 transition-colors truncate ${
                          activeTab === 'rekap'
                            ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                        }`}
                      >
                        Rekap
                      </button>
                    )}
                    {fitur.tabRekap && (
                      <button
                        type="button"
                        onClick={() => goToTab('review')}
                        className={`flex-1 min-w-0 px-2 sm:px-4 py-2.5 sm:py-3 text-center text-xs sm:text-sm font-medium border-b-2 transition-colors truncate ${
                          activeTab === 'review'
                            ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                        }`}
                      >
                        Review
                      </button>
                    )}
                    {fitur.tabRilis && (
                      <button
                        type="button"
                        onClick={() => goToTab('rilis')}
                        className={`flex-1 min-w-0 px-2 sm:px-4 py-2.5 sm:py-3 text-center text-xs sm:text-sm font-medium border-b-2 transition-colors truncate ${
                          activeTab === 'rilis'
                            ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                        }`}
                      >
                        Rilis
                      </button>
                    )}
                    {fitur.tabHistori && (
                      <button
                        type="button"
                        onClick={() => goToTab('histori')}
                        className={`flex-1 min-w-0 px-2 sm:px-4 py-2.5 sm:py-3 text-center text-xs sm:text-sm font-medium border-b-2 transition-colors truncate ${
                          activeTab === 'histori'
                            ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                        }`}
                      >
                        Histori
                      </button>
                    )}
                    {fitur.tabAturan && (
                      <button
                        type="button"
                        onClick={() => goToTab('aturan')}
                        className={`flex-1 min-w-0 px-2 sm:px-4 py-2.5 sm:py-3 text-center text-xs sm:text-sm font-medium border-b-2 transition-colors truncate ${
                          activeTab === 'aturan'
                            ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                        }`}
                      >
                        Aturan
                      </button>
                    )}
                  </div>
                </nav>
              </div>
              {(fitur.tabRekap && activeTab === 'rekap') || (fitur.tabAturan && activeTab === 'aturan') ? (
                <div className="p-4 flex flex-wrap gap-3 items-end border-t border-gray-100 dark:border-gray-700/80">
                  {fitur.tabRekap && activeTab === 'rekap' && (
                    <div className="min-w-[220px] flex-1 max-w-md">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Lembaga (rekap mengikuti set yang dihubungkan di tab Aturan)
                      </label>
                      {!rekapSemuaLembagaApi && lembagaListRekap.length > 1 ? (
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1 leading-snug">
                          Hanya lembaga sesuai peran yang memiliki tab Rekap. Untuk akses semua lembaga, minta aksi «Rekap semua lembaga»
                          di pengaturan fitur.
                        </p>
                      ) : null}
                      <select
                        value={rekapLembagaId}
                        onChange={(e) => setRekapLembagaId(e.target.value)}
                        disabled={loadingLembagaForTab || lembagaListRekap.length === 0 || lembagaRekapFilterLocked}
                        title={lembagaRekapFilterLocked ? 'Satu lembaga dalam cakupan rekap Anda' : undefined}
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 min-h-[42px] disabled:opacity-60"
                      >
                        {loadingLembagaForTab ? (
                          <option value="">Memuat lembaga…</option>
                        ) : lembagaListRekap.length === 0 ? (
                          <option value="">Tidak ada lembaga dalam cakupan rekap</option>
                        ) : (
                          lembagaListRekap.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.nama || l.id}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  )}
                  {fitur.tabAturan && activeTab === 'aturan' && (
                    <>
                      <div className="min-w-[220px] flex-1 max-w-lg">
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Set aturan
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={bisyarohId ?? ''}
                            onChange={(e) => setBisyarohId(e.target.value ? parseInt(e.target.value, 10) : null)}
                            disabled={setsForAturan.length === 0}
                            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm min-h-[42px]"
                          >
                            {setsForAturan.length === 0 ? <option value="">— Tambah set baru —</option> : null}
                            {setsForAturan.map((s) => {
                              const nama = (s.nama || '').trim() || `Set #${s.id}`
                              const lembaga =
                                Array.isArray(s.lembaga_ids) && s.lembaga_ids.length > 0
                                  ? ` · ${s.lembaga_ids.length} lembaga`
                                  : ' · belum dihubungkan'
                              return (
                                <option key={s.id} value={s.id}>
                                  {nama}
                                  {lembaga}
                                  {s.aktif ? '' : ' (off)'}
                                </option>
                              )
                            })}
                          </select>
                          <button
                            type="button"
                            onClick={() => openOffcanvasSetEdit()}
                            disabled={!bisyarohId || !canEditKolomAturan}
                            className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 disabled:opacity-50"
                            title="Ubah set"
                            aria-label="Ubah set"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
                      <button
                        type="button"
                        onClick={openOffcanvasSetBaru}
                        className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium min-h-[42px]"
                      >
                        + Set baru
                      </button>
                      {bisyarohId ? (
                        selectedSetAktif ? (
                          <button
                            type="button"
                            onClick={() => ubahAktifSet(false)}
                            disabled={savingSetAktif}
                            className="px-4 py-2 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 bg-amber-50 dark:bg-amber-950/40 text-sm hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50 min-h-[42px]"
                          >
                            {savingSetAktif ? 'Memproses…' : 'Nonaktifkan set'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => ubahAktifSet(true)}
                            disabled={savingSetAktif}
                            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50 min-h-[42px]"
                          >
                            {savingSetAktif ? 'Memproses…' : 'Aktifkan kembali'}
                          </button>
                        )
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </div>

            {fitur.tabRekap &&
              activeTab === 'rekap' &&
              !loadingLembagaRekap &&
              lembagaListRekap.length === 0 && (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Tidak ada lembaga dalam cakupan rekap Anda (peran dengan tab Rekap). Hubungi admin jika perlu akses atau aksi «Rekap semua
                lembaga».
              </p>
            )}

            {fitur.tabRekap && activeTab === 'review' && (
              <BisyarohReviewFilters
                periodeKalender={periodeKalender}
                onKalenderMode={setKalenderMode}
                periodeBulan={periodeBulan}
                onPeriodeChange={(ym, kal) => {
                  setPeriodeBulan(ym)
                  if (kal && kal !== periodeKalender) {
                    setPeriodeKalender(kal)
                  }
                  patchRekapQuery(ym, kal || periodeKalender)
                }}
                periodeOptions={reviewPeriodeOptions}
                lembagaList={lembagaListReview}
                lembagaId={rekapLembagaId}
                onLembagaChange={setRekapLembagaId}
                loadingPeriode={loadingReviewPeriode}
                loadingLembaga={loadingReviewLembaga}
                lembagaLocked={lembagaListReview.length <= 1 && lembagaListReview.length > 0}
              />
            )}

            {fitur.tabRekap &&
              activeTab === 'rekap' &&
              lembagaListRekap.length > 0 &&
              !rekapLembagaId && (
              <p className="text-sm text-gray-500 dark:text-gray-400">Pilih lembaga untuk memuat rekap.</p>
            )}

            {fitur.tabAturan && activeTab === 'aturan' && setsForAturan.length === 0 && (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Belum ada set Bisyaroh. Klik «Set baru», isi nama, lalu «Hubungkan ke lembaga» agar rekap bisa memakai set ini.
              </p>
            )}

            {fitur.tabRekap &&
              (activeTab === 'rekap' || activeTab === 'review') &&
              rekapLembagaId &&
              setsForRekap.length === 0 && (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Belum ada set yang dihubungkan ke lembaga terpilih. Buka tab <strong>Aturan</strong> → pilih set → «Hubungkan ke lembaga».
              </p>
            )}

            {fitur.tabHistori && activeTab === 'histori' && <BisyarohHistoriTab />}

            {activeTab === 'review' && fitur.tabRekap && rekapSetIds.length > 0 && rekapLembagaId && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4">
                <BisyarohReviewRilisPanel
                  setsForRekap={setsForRekap}
                  rekapSetIds={rekapSetIds}
                  rekapLembagaId={rekapLembagaId}
                  rekapStatusMap={rekapStatusMap}
                  rekapStatusReady={rekapStatusReady}
                  loadingRekapStatus={loadingRekapStatus}
                  savingRekapStatusKey={savingRekapStatusKey}
                  onSubmitStatus={submitRekapStatus}
                />
                {fitur.transferUpload ? (
                  <div className="mb-4">
                    <BisyarohUploadMutasiPanel
                      canUpload={fitur.transferUpload}
                      periodeBulan={periodeBulan}
                      periodeKalender={periodeKalender}
                      onNotify={showNotification}
                      onDone={() => loadRekap()}
                    />
                  </div>
                ) : null}
                {setsForRekap.length > 1 && (
                  <div className="mb-4">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                      Set rekap (sama dengan tab Rekap)
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {setsForRekap.map((s) => (
                        <label
                          key={s.id}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 text-xs cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={rekapSetIds.includes(s.id)}
                            onChange={() => toggleRekapSet(s.id)}
                            className="rounded border-gray-400 text-teal-600"
                          />
                          <span>{s.nama || `Set #${s.id}`}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <BisyarohReviewTab
                  sections={reviewSectionsWithDisabled}
                  loading={loadingRekap}
                  showGrandTotal={rekapSetIds.length > 1}
                  grandTotal={reviewGrandTotal}
                  formatRp={formatRp}
                  getRekapCell={getRekapCell}
                  onExportExcel={fitur.rekapExportExcel ? handleExportReviewExcel : undefined}
                  exportingExcel={exportingReviewExcel}
                  exportPanel={
                    fitur.rekapExportExcel ? (
                      <BisyarohExportAccordion
                        open={exportAccordionOpen}
                        onToggle={() => setExportAccordionOpen((v) => !v)}
                        periodeBulan={periodeBulan}
                        periodeKalender={periodeKalender}
                        lembagaList={lembagaListReview}
                        disabledKeys={reviewDisabledKeysArray}
                        canExport={fitur.rekapExportExcel}
                        onNotify={showNotification}
                        onExported={() => loadRekap()}
                      />
                    ) : null
                  }
                  disabledRowKeys={reviewDisabledRowKeys}
                  onToggleDisabledRow={toggleReviewDisabledRow}
                  printMeta={reviewPrintMeta}
                  onNotify={showNotification}
                  canRilisPerPengurus={fitur.rekapRilis || fitur.transferReconcile}
                  onRilisManual={handleRilisManualRow}
                  rilisBusyKey={rilisManualBusyKey}
                />
              </div>
            )}

            {fitur.tabRilis && activeTab === 'rilis' && (
              <BisyarohRilisTab
                canUpload={fitur.transferUpload}
                canReconcile={fitur.rekapRilis || fitur.transferReconcile}
                onNotify={showNotification}
              />
            )}

            {activeTab === 'rekap' && fitur.tabRekap && rekapSetIds.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex flex-col gap-3 mb-4">
                  {setsForRekap.length > 1 && (
                    <div>
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                        Set untuk rekap (lembaga ini punya lebih dari satu set — pilih satu atau beberapa; subtotal + total gabungan)
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {setsForRekap.map((s) => (
                          <label
                            key={s.id}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 text-xs cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={rekapSetIds.includes(s.id)}
                              onChange={() => toggleRekapSet(s.id)}
                              className="rounded border-gray-400 text-teal-600"
                            />
                            <span>{s.nama || `Set #${s.id}`}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Kalender periode</span>
                    <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-600 p-0.5 bg-gray-100 dark:bg-gray-900/50">
                      <button
                        type="button"
                        onClick={() => setKalenderMode('masehi')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          periodeKalender === 'masehi'
                            ? 'bg-white dark:bg-gray-800 text-teal-700 dark:text-teal-300 shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                      >
                        Masehi
                      </button>
                      <button
                        type="button"
                        onClick={() => setKalenderMode('hijriyah')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          periodeKalender === 'hijriyah'
                            ? 'bg-white dark:bg-gray-800 text-teal-700 dark:text-teal-300 shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                      >
                        Hijriyah
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 items-end">
                    {periodeKalender === 'masehi' ? (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Periode (bulan Masehi)
                        </label>
                        <input
                          type="month"
                          value={periodeBulan}
                          onChange={(e) => {
                            const v = e.target.value
                            setPeriodeBulan(v)
                            patchRekapQuery(v, 'masehi')
                          }}
                          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                        />
                      </div>
                    ) : (
                      <div className="min-w-[220px] flex-1 max-w-sm">
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Periode (bulan Hijriyah)
                        </label>
                        <PickMonthHijri
                          value={periodeBulan}
                          onChange={(ym) => {
                            if (!ym) return
                            setPeriodeBulan(ym)
                            patchRekapQuery(ym, 'hijriyah')
                          }}
                          placeholder="Pilih bulan Hijriyah"
                          className="w-full"
                          inputClassName="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-left text-sm"
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => loadRekap()}
                      disabled={savingRekapBulk}
                      className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                    >
                      Muat ulang
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalExcelRekap(true)}
                      disabled={loadingRekap || rekapSections.length === 0}
                      className="px-3 py-2 rounded-lg border border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 text-sm hover:bg-teal-50 dark:hover:bg-teal-900/30 disabled:opacity-50"
                    >
                      Excel Editor
                    </button>
                    <button
                      type="button"
                      onClick={() => saveAllRekap()}
                      disabled={
                        loadingRekap || savingRekapBulk || rekapSections.length === 0 || !rekapSections.some((s) => s.rows?.length > 0)
                      }
                      className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50"
                    >
                      {savingRekapBulk ? 'Menyimpan…' : 'Simpan semua'}
                    </button>
                    {fitur.rekapRilis && rekapSetsCanDitinjau.length > 0 ? (
                      <button
                        type="button"
                        onClick={tandaiSemuaDitinjau}
                        disabled={!!savingRekapStatusKey || loadingRekapStatus}
                        className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium disabled:opacity-50"
                        title="Tandai ditinjau semua set yang masih pengajuan untuk lembaga & periode ini"
                      >
                        {savingRekapStatusKey?.endsWith(':ditinjau')
                          ? 'Memproses…'
                          : `Tandai ditinjau (${rekapSetsCanDitinjau.length})`}
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Pilih <strong>Masehi</strong> atau <strong>Hijriyah</strong>; periode disimpan terpisah. Beberapa set rekap menampilkan{' '}
                  <strong>subtotal</strong> per set dan <strong>total keseluruhan</strong> di bawah. Σ = ikut penjumlahan nominal baris.
                </p>
                {rekapLembagaId && rekapSetIds.length > 0 ? (
                  <div className="mb-4">
                    <button
                      type="button"
                      onClick={toggleRekapUrutanPanel}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                        rekapUrutanPanelOpen
                          ? 'border-teal-400 dark:border-teal-600 bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200'
                          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      {rekapUrutanPanelOpen ? 'Tutup atur urutan' : 'Atur Urutan'}
                    </button>
                    {rekapUrutanPanelOpen ? (
                      <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/60 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">
                            Urutan pengurus di rekap
                          </span>
                          {loadingRekapPengurusUrutan || savingRekapPengurusUrutan ? (
                            <span className="text-[10px] text-gray-500">
                              {savingRekapPengurusUrutan ? 'Menyimpan urutan…' : 'Memuat…'}
                            </span>
                          ) : null}
                        </div>
                        <BisyarohPengurusUrutanList
                          rows={rekapPengurusUrutan}
                          disabled={loadingRekapPengurusUrutan || savingRekapPengurusUrutan}
                          onPersistOrder={persistRekapPengurusOrder}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {rekapStatusReady && rekapLembagaId && rekapSetIds.length > 0 ? (
                  <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">Status rekap per set</span>
                      {loadingRekapStatus ? (
                        <span className="text-[10px] text-gray-500">Memuat status…</span>
                      ) : null}
                    </div>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-2 leading-snug">
                      Alur: <strong>Pengajuan</strong> → <strong>Ditinjau</strong> → transfer per pengurus (Rilis manual / mutasi Jatim).
                      Tab Histori menampilkan baris yang sudah rilis di <strong>lembaga yang sama</strong> dengan penugasan jabatan pengurus.
                      Merilis membutuhkan fitur aksi «Bisyaroh · Merilis rekap».
                    </p>
                    <div className="space-y-2">
                      {rekapSetIds.map((bid) => {
                        const setMeta = setsForRekap.find((s) => s.id === bid)
                        const setLabel = setMeta?.nama || `Set #${bid}`
                        const lid = rekapLembagaId
                        const st = rekapStatusMap[`${bid}:${lid}`] || 'pengajuan'
                        const badge =
                          st === 'rilis'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                            : st === 'ditinjau'
                              ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
                              : 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100'
                        const busy = (op) => savingRekapStatusKey === `${bid}:${lid}:${op}`
                        return (
                          <div
                            key={bid}
                            className="flex flex-wrap items-center gap-2 text-[11px] rounded-md border border-gray-100 dark:border-gray-700/80 p-2 bg-gray-50/80 dark:bg-gray-900/30"
                          >
                            <span className="text-gray-700 dark:text-gray-300 min-w-[80px] font-medium">{setLabel}</span>
                            <span className={`px-2 py-0.5 rounded font-medium ${badge}`}>{labelBisyarohRekapStatus(st)}</span>
                            <div className="flex flex-wrap gap-1.5 items-center">
                              {st === 'pengajuan' ? (
                                <button
                                  type="button"
                                  disabled={!!savingRekapStatusKey || loadingRekapStatus}
                                  onClick={() => submitRekapStatus(bid, lid, 'ditinjau')}
                                  className="px-2 py-0.5 rounded border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 disabled:opacity-50"
                                >
                                  {busy('ditinjau') ? '…' : 'Tandai ditinjau'}
                                </button>
                              ) : null}
                              {st === 'ditinjau' ? (
                                <button
                                  type="button"
                                  disabled={!!savingRekapStatusKey || loadingRekapStatus}
                                  onClick={() => submitRekapStatus(bid, lid, 'pengajuan')}
                                  className="px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                                >
                                  {busy('pengajuan') ? '…' : 'Kembalikan ke pengajuan'}
                                </button>
                              ) : null}
                              {st === 'rilis' ? (
                                <span className="text-[10px] text-gray-500 dark:text-gray-400">Rekap terkunci (legacy rilis)</span>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
                {rekapSetIds.length > 1 && (
                  <p className="text-sm font-semibold text-teal-800 dark:text-teal-200 mb-2">
                    Total keseluruhan: {formatRp(rekapGrandTotal)}
                  </p>
                )}
                {loadingRekap ? (
                  <p className="text-sm text-gray-500">Memuat…</p>
                ) : (
                  <div className="space-y-8">
                    {rekapSections.map((sec) => (
                      <div key={sec.bisyaroh_id} className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 bg-gray-50/50 dark:bg-gray-900/20">
                        <div className="flex flex-wrap justify-between items-baseline gap-2 mb-2">
                          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                            Set #{sec.bisyaroh_id}
                            {sec.bisyaroh_nama ? ` — ${sec.bisyaroh_nama}` : ''}
                          </h3>
                          <span className="text-xs font-medium text-teal-700 dark:text-teal-300">
                            Subtotal: {formatRp(sec.subtotal_nominal)}
                          </span>
                        </div>
                        <div className="overflow-x-auto max-w-[100vw]">
                          <table className="min-w-max text-xs sm:text-sm border-collapse">
                            <thead>
                              <tr className="border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50">
                                <th className="py-2 px-2 text-left sticky left-0 bg-gray-50 dark:bg-gray-900/80 z-[1] min-w-[140px]">
                                  Pengurus
                                </th>
                                <th className="py-2 px-2 text-left min-w-[72px]">NIP</th>
                                <th className="py-2 px-2 text-left min-w-[120px]">Rekening Jatim</th>
                                {(sec.kolom || []).map((k) => (
                                  <th
                                    key={k.col_key}
                                    className="py-2 px-2 text-left min-w-[110px] align-bottom"
                                    title={k.keterangan || k.label}
                                  >
                                    <div className="font-medium text-gray-800 dark:text-gray-100">{k.label}</div>
                                    <div className="text-[10px] font-normal text-gray-500 dark:text-gray-400 mt-0.5">
                                      {subtitleBisyarohKolomKind(k.kind, k.input_tipe)}
                                      {k.masuk_total ? (
                                        <span className="ml-1 text-teal-600 dark:text-teal-400 font-semibold" title="Ikut total Rp">
                                          Σ
                                        </span>
                                      ) : (
                                        <span className="ml-1 text-gray-400" title="Tidak ikut total">
                                          ○
                                        </span>
                                      )}
                                    </div>
                                  </th>
                                ))}
                                <th className="py-2 px-2 text-right min-w-[120px] font-semibold text-teal-700 dark:text-teal-300">
                                  Total
                                </th>
                                <th className="py-2 px-2 text-left min-w-[160px] font-semibold text-gray-700 dark:text-gray-200">
                                  Potong UWABA
                                </th>
                                <th className="py-2 px-2 text-left min-w-[120px]">Catatan</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(sec.rows || []).map((row) => (
                                <tr key={`${sec.bisyaroh_id}-${row.id_pengurus}`} className="border-b border-gray-100 dark:border-gray-700 align-top">
                                  <td className="py-2 px-2 sticky left-0 bg-white dark:bg-gray-800 z-[1] font-medium whitespace-nowrap">
                                    {row.pengurus_nama}
                                  </td>
                                  <td className="py-2 px-2 whitespace-nowrap tabular-nums">{row.nip ?? '—'}</td>
                                  <td className="py-1 px-1 min-w-[120px]">
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      autoComplete="off"
                                      placeholder="Nomor rekening"
                                      value={row.rekening_jatim ?? ''}
                                      disabled={savingRekeningJatimKey === String(row.id_pengurus)}
                                      onChange={(e) =>
                                        updateRekapRekeningJatimLocal(
                                          sec.bisyaroh_id,
                                          row.id_pengurus,
                                          e.target.value
                                        )
                                      }
                                      onBlur={(e) => persistRekeningJatim(row.id_pengurus, e.target.value)}
                                      className="w-full min-w-[108px] px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs tabular-nums disabled:opacity-50"
                                      title="Disimpan ke biodata pengurus (blur untuk simpan)"
                                    />
                                  </td>
                                  {(sec.kolom || []).map((k) => {
                                    if (k.kind === 'input') {
                                      const v = row.inputs?.[k.col_key] ?? ''
                                      const isRupiah = k.input_tipe === 'rupiah'
                                      const isTeks = k.input_tipe === 'teks'
                                      const isCheckbox = k.input_tipe === 'checkbox'
                                      return (
                                        <td key={k.col_key} className="py-1 px-1">
                                          {isCheckbox ? (
                                            <div className="flex justify-center">
                                              <input
                                                type="checkbox"
                                                checked={isBisyarohCheckboxTruthy(
                                                  bisyarohCheckboxEffectiveValue(v, k.default_nilai)
                                                )}
                                                onChange={(e) => {
                                                  updateRekapInput(
                                                    sec.bisyaroh_id,
                                                    row.id_pengurus,
                                                    k.col_key,
                                                    e.target.checked ? '1' : '0'
                                                  )
                                                  runPreview(sec.bisyaroh_id, row.id_pengurus)
                                                }}
                                                className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                                                title={k.label || k.col_key}
                                              />
                                            </div>
                                          ) : isTeks ? (
                                            <input
                                              type="text"
                                              value={v}
                                              onChange={(e) =>
                                                updateRekapInput(sec.bisyaroh_id, row.id_pengurus, k.col_key, e.target.value)
                                              }
                                              onBlur={() => runPreview(sec.bisyaroh_id, row.id_pengurus)}
                                              className="w-full min-w-[100px] px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
                                            />
                                          ) : (
                                            <input
                                              type="text"
                                              inputMode="decimal"
                                              placeholder={isRupiah ? 'Rp / angka' : 'Angka'}
                                              value={v}
                                              onChange={(e) =>
                                                updateRekapInput(sec.bisyaroh_id, row.id_pengurus, k.col_key, e.target.value)
                                              }
                                              onBlur={() => runPreview(sec.bisyaroh_id, row.id_pengurus)}
                                              className="w-full min-w-[88px] px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-right"
                                            />
                                          )}
                                        </td>
                                      )
                                    }
                                    const cell = getRekapCell(row, k.col_key)
                                    return (
                                      <td
                                        key={k.col_key}
                                        className={`py-2 px-2 text-right font-mono whitespace-nowrap ${
                                          cell.error
                                            ? 'text-red-600 dark:text-red-400 bg-red-50/80 dark:bg-red-950/30'
                                            : 'text-gray-700 dark:text-gray-200'
                                        }`}
                                        title={cell.error ? cell.title : k.rumus || ''}
                                      >
                                        {cell.text}
                                      </td>
                                    )
                                  })}
                                  <td className="py-2 px-2 text-right font-semibold text-teal-700 dark:text-teal-300 whitespace-nowrap align-top">
                                    <RekapTotalCell row={row} />
                                  </td>
                                  <td className="py-2 px-2 align-top max-w-[220px]">
                                    {row.potong_uwaba ? (
                                      <div className="space-y-1 text-left">
                                        <div className="font-semibold text-teal-700 dark:text-teal-300 tabular-nums text-xs">
                                          {formatRp(row.potong_uwaba.terpotong_total)}
                                        </div>
                                        <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">
                                          {row.potong_uwaba.keterangan}
                                        </p>
                                        {(row.potong_uwaba.alokasi || []).length > 0 && (
                                          <ul className="text-[10px] text-gray-600 dark:text-gray-300 space-y-0.5">
                                            {(row.potong_uwaba.alokasi || []).map((a) => (
                                              <li key={a.id_santri}>
                                                {a.nama || `Santri #${a.id_santri}`}: {formatRp(a.nominal)}
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-gray-400">—</span>
                                    )}
                                  </td>
                                  <td className="py-1 px-1">
                                    <input
                                      type="text"
                                      value={row.catatan}
                                      onChange={(e) =>
                                        updateRekapCatatan(sec.bisyaroh_id, row.id_pengurus, e.target.value)
                                      }
                                      className="w-full min-w-[100px] px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {(sec.rows || []).length === 0 && (
                            <p className="text-sm text-gray-500 mt-2">
                              Tidak ada pengurus dengan jabatan aktif untuk lembaga yang terhubung ke set ini.
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {!loadingRekap && rekapSections.length === 0 && (
                      <p className="text-sm text-gray-500">Pilih set rekap atau muat ulang.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'aturan' && fitur.tabAturan && bisyarohId && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
                  <p className="text-sm text-gray-700 dark:text-gray-200 font-medium">Kolom (gaya lembar kerja)</p>
                  <button
                    type="button"
                    onClick={() => openModalKolom(null)}
                    disabled={!canEditKolomAturan}
                    className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm shrink-0 disabled:opacity-50"
                  >
                    + Tambah kolom
                  </button>
                </div>
                {loadingKolom ? (
                  <p className="text-sm text-gray-500">Memuat…</p>
                ) : (
                  <BisyarohKolomAturanTable
                    rows={kolomRows}
                    disabled={!canEditKolomAturan}
                    canEdit={canEditKolomAturan}
                    onPersistOrder={persistKolomOrder}
                    onEdit={openModalKolom}
                    onDelete={deleteKolom}
                  />
                )}
                {!loadingKolom && (
                  <BisyarohRumusHelpPanel
                    pengurusFields={pengurusFormulaFields}
                    jabatanFields={jabatanFormulaFields}
                    pjFields={pjFormulaFields}
                  />
                )}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {(offcanvasSetForm || showSetFormPortal) &&
        createPortal(
          <AnimatePresence onExitComplete={() => setShowSetFormPortal(false)}>
            {offcanvasSetForm && (
              <Fragment key="bisyaroh-set-form-offcanvas">
                <motion.div
                  key="bisyaroh-set-form-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={closeSetFormOffcanvas}
                  className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200]"
                />
                <motion.div
                  key="bisyaroh-set-form-panel"
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-gray-50 dark:bg-gray-900 shadow-2xl z-[201] flex flex-col rounded-l-2xl overflow-hidden border-l border-gray-200 dark:border-gray-700"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="bisyaroh-set-form-title"
                >
                  <div className="flex-shrink-0 px-5 pt-5 pb-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h2
                          id="bisyaroh-set-form-title"
                          className="text-base font-semibold text-gray-900 dark:text-white tracking-tight"
                        >
                          {setFormMode === 'create' ? 'Set Bisyaroh baru' : 'Ubah set aturan'}
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {setFormMode === 'edit' && bisyarohId ? `Set #${bisyarohId} · ` : ''}
                          tombol kembali browser menutup panel ini
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={closeSetFormOffcanvas}
                        className="p-2.5 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors shrink-0"
                        aria-label="Tutup"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto min-h-0 p-5">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">
                      Beri nama yang jelas (mis. «Gaji STAI 2026»). Centang lembaga yang memakai set ini — rekap memuat pengurus dari
                      jabatan aktif di lembaga terpilih. Mengosongkan semua hanya untuk admin dengan cakupan penuh.
                    </p>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nama set</label>
                    <input
                      type="text"
                      value={formSetNama}
                      onChange={(e) => setFormSetNama(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 mb-5"
                      placeholder="Contoh: Rekap honor MTS"
                      autoFocus
                    />
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Hubungkan ke lembaga</p>
                    <div className="space-y-2 border border-gray-200 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-800/50">
                      {lembagaList.map((l) => (
                        <label
                          key={l.id}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/60 cursor-pointer text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={formSetLembagaIds.includes(l.id)}
                            onChange={() => toggleFormSetLembaga(l.id)}
                            className="rounded border-gray-300 dark:border-gray-600 text-teal-600"
                          />
                          <span className="text-gray-900 dark:text-gray-100">{l.nama || l.id}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex-shrink-0 px-5 py-2.5 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={closeSetFormOffcanvas}
                        className="px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-xs"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={() => submitSetForm()}
                        disabled={savingSetForm}
                        className="px-3 py-1.5 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium disabled:opacity-50"
                      >
                        {savingSetForm ? 'Menyimpan…' : 'Simpan'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </Fragment>
            )}
          </AnimatePresence>,
          document.body
        )}

      {(modalKolom || showKolomPortal) &&
        createPortal(
          <AnimatePresence onExitComplete={() => setShowKolomPortal(false)}>
            {modalKolom && (
              <Fragment key="bisyaroh-kolom-offcanvas">
                <motion.div
                  key="bisyaroh-kolom-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={closeKolomOffcanvas}
                  className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200]"
                />
                <motion.div
                  key="bisyaroh-kolom-panel"
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-gray-50 dark:bg-gray-900 shadow-2xl z-[201] flex flex-col rounded-l-2xl overflow-hidden border-l border-gray-200 dark:border-gray-700"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="bisyaroh-kolom-offcanvas-title"
                >
                  <div className="flex-shrink-0 px-5 pt-5 pb-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h2
                          id="bisyaroh-kolom-offcanvas-title"
                          className="text-base font-semibold text-gray-900 dark:text-white tracking-tight"
                        >
                          {formKolom._editId ? 'Ubah kolom' : 'Kolom baru'}
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Tombol kembali browser menutup panel ini
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={closeKolomOffcanvas}
                        className="p-2.5 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors shrink-0"
                        aria-label="Tutup"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto min-h-0 p-5">
                    <div className="space-y-3 max-w-2xl">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium mb-1">Kunci kolom (tanpa spasi)</label>
                          <input
                            type="text"
                            value={formKolom.col_key}
                            onChange={(e) => setFormKolom((f) => ({ ...f, col_key: e.target.value.toLowerCase() }))}
                            disabled={!!formKolom._editId}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-mono disabled:opacity-60"
                            placeholder="hari"
                          />
                          <p className="text-[10px] text-gray-500 mt-1">Dipakai di rumus sebagai @[kunci]</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Urutan (sort)</label>
                          <input
                            type="number"
                            value={formKolom.sort_order}
                            onChange={(e) => setFormKolom((f) => ({ ...f, sort_order: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Judul tampilan</label>
                        <input
                          type="text"
                          value={formKolom.label}
                          onChange={(e) => setFormKolom((f) => ({ ...f, label: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                          placeholder="Jumlah hari kerja"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Keterangan (untuk penerima gaji / admin)</label>
                        <textarea
                          value={formKolom.keterangan}
                          onChange={(e) => setFormKolom((f) => ({ ...f, keterangan: e.target.value }))}
                          rows={2}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                          placeholder="Diisi dari absen efektif bulan ini"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Jenis kolom</label>
                        <select
                          value={formKolom.kind}
                          onChange={(e) => {
                            const kind = e.target.value
                            setFormKolom((f) => {
                              let input_tipe = f.input_tipe
                              if (kind === 'input' && input_tipe === 'persen') input_tipe = 'angka'
                              if (kind === 'formula' && input_tipe === 'checkbox') input_tipe = 'angka'
                              const masuk_total =
                                (kind === 'input' || kind === 'formula') &&
                                (input_tipe === 'teks' || input_tipe === 'checkbox')
                                  ? false
                                  : f.masuk_total
                              return { ...f, kind, input_tipe, masuk_total }
                            })
                          }}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                        >
                          <option value="input">Input — diisi di Rekap</option>
                          <option value="formula">Rumus — dihitung otomatis</option>
                        </select>
                      </div>
                      {formKolom.kind === 'input' && (
                        <>
                          <div>
                            <label className="block text-xs font-medium mb-1">Tipe input</label>
                            <select
                              value={formKolom.input_tipe}
                              onChange={(e) => {
                                const input_tipe = e.target.value
                                setFormKolom((f) => ({
                                  ...f,
                                  input_tipe,
                                  masuk_total:
                                    input_tipe === 'teks' || input_tipe === 'checkbox' ? false : f.masuk_total,
                                  default_nilai:
                                    input_tipe === 'checkbox' && f.default_nilai !== '1' ? '0' : f.default_nilai
                                }))
                              }}
                              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                            >
                              <option value="angka">Angka</option>
                              <option value="rupiah">Rupiah / nominal</option>
                              <option value="checkbox">Checkbox (Ya/Tidak → 1/0 di rumus)</option>
                              <option value="teks">Teks (tidak ikut rumus / total)</option>
                            </select>
                          </div>
                          {formKolom.input_tipe === 'checkbox' ? (
                            <div className="flex items-center gap-2">
                              <input
                                id="kolom-default-checkbox"
                                type="checkbox"
                                checked={formKolom.default_nilai === '1'}
                                onChange={(e) =>
                                  setFormKolom((f) => ({ ...f, default_nilai: e.target.checked ? '1' : '0' }))
                                }
                                className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-teal-600"
                              />
                              <label htmlFor="kolom-default-checkbox" className="text-sm">
                                Centang secara default (baris rekap baru)
                              </label>
                            </div>
                          ) : (
                            <div>
                              <label className="block text-xs font-medium mb-1">Nilai default (opsional)</label>
                              <input
                                type="text"
                                value={formKolom.default_nilai}
                                onChange={(e) => setFormKolom((f) => ({ ...f, default_nilai: e.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                              />
                            </div>
                          )}
                        </>
                      )}
                      {formKolom.kind === 'formula' && (
                        <>
                          <div>
                            <label className="block text-xs font-medium mb-1">Tipe tampilan hasil</label>
                            <select
                              value={formKolom.input_tipe}
                              onChange={(e) => {
                                const input_tipe = e.target.value
                                setFormKolom((f) => ({
                                  ...f,
                                  input_tipe,
                                  masuk_total: input_tipe === 'teks' ? false : f.masuk_total
                                }))
                              }}
                              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                            >
                              <option value="angka">Angka biasa</option>
                              <option value="rupiah">Rupiah (Rp)</option>
                              <option value="persen">Persen (%)</option>
                              <option value="teks">Teks</option>
                            </select>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                              Persen: nilai rumus = angka persen (mis. 12,5 → 12,50 %). Teks: tampil tanpa format Rp/ribuan;
                              rumus satu referensi seperti <code className="font-mono">@pengurus[nama]</code> menampilkan isi
                              field pengurus/jabatan.
                            </p>
                          </div>
                          <div>
                          <label htmlFor="bisyaroh-rumus-textarea" className="block text-xs font-medium mb-1">
                            Rumus
                          </label>
                          <RumusAutocompleteTextarea
                            id="bisyaroh-rumus-textarea"
                            value={formKolom.rumus}
                            onChange={(v) => setFormKolom((f) => ({ ...f, rumus: v }))}
                            suggestions={rumusColSuggestions}
                            pengurusFields={pengurusFormulaFields}
                            jabatanFields={jabatanFormulaFields}
                            pjFields={pjFormulaFields}
                            rows={3}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 font-mono text-xs"
                            placeholder="@[hari]*15000 atau IF(HASJABATAN(&quot;Ketua&quot;); 750000; 300000)"
                          />
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                            Ketik <kbd className="px-1 rounded bg-gray-100 dark:bg-gray-700 font-mono">@</kbd> kolom /{' '}
                            <kbd className="px-1 rounded bg-gray-100 dark:bg-gray-700 font-mono">@pengurus[</kbd> field, atau huruf awal fungsi (
                            <kbd className="px-1 rounded bg-gray-100 dark:bg-gray-700 font-mono">IF</kbd>,{' '}
                            <kbd className="px-1 rounded bg-gray-100 dark:bg-gray-700 font-mono">SUM</kbd>,{' '}
                            <kbd className="px-1 rounded bg-gray-100 dark:bg-gray-700 font-mono">PERCENT</kbd>, …). Di dalam fungsi, argumen yang sedang diedit
                            <strong> dicetak tebal</strong>; tooltip di bawah kursor menjelaskan argumen berikutnya. Pemisah argumen:{' '}
                            <kbd className="px-1 rounded bg-gray-100 dark:bg-gray-700 font-mono">;</kbd>
                          </p>
                        </div>
                        </>
                      )}
                      <div className="flex items-center gap-2">
                        <input
                          id="kolom-masuk-total"
                          type="checkbox"
                          checked={formKolom.masuk_total}
                          disabled={
                            (formKolom.kind === 'input' || formKolom.kind === 'formula') &&
                            (formKolom.input_tipe === 'teks' || formKolom.input_tipe === 'checkbox')
                          }
                          onChange={(e) => setFormKolom((f) => ({ ...f, masuk_total: e.target.checked }))}
                        />
                        <label htmlFor="kolom-masuk-total" className="text-sm">
                          Ikut jumlah total nominal (Σ)
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          id="kolom-aktif"
                          type="checkbox"
                          checked={formKolom.aktif}
                          onChange={(e) => setFormKolom((f) => ({ ...f, aktif: e.target.checked }))}
                        />
                        <label htmlFor="kolom-aktif" className="text-sm">
                          Kolom aktif
                        </label>
                      </div>
                      <div className="flex justify-end gap-2 pt-2 pb-1">
                        <button
                          type="button"
                          onClick={closeKolomOffcanvas}
                          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={submitKolom}
                          className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm"
                        >
                          Simpan
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </Fragment>
            )}
          </AnimatePresence>,
          document.body
        )}

      {modalExcelRekap && (
        <Suspense fallback={null}>
          <BisyarohExcelEditorModal
            open={modalExcelRekap}
            sections={rekapSections}
            onClose={() => setModalExcelRekap(false)}
            onApply={applyExcelRekapSections}
            onNotify={showNotification}
          />
        </Suspense>
      )}
    </div>
  )
}
