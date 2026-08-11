import { useState, useEffect, useMemo } from 'react'
import { pendaftaranAPI, paymentAPI, uwabaAPI } from '../../../services/api'
import { PADUKAN_GROUP_LABELS } from '../padukanDataGroups'

const formatRp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0)

function CountBadge({ count, label }) {
  if (count == null || count <= 0) {
    return (
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {label}: tidak ada data
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-800 dark:text-gray-200">
      {label}: {count} baris
    </span>
  )
}

function ListRegistrasi({ santriId }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!santriId || !/^\d{7}$/.test(String(santriId))) {
      setList([])
      return
    }
    setLoading(true)
    pendaftaranAPI
      .getAllRegistrasiBySantri(santriId)
      .then((r) => {
        if (r.success && Array.isArray(r.data)) setList(r.data)
        else setList([])
      })
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [santriId])
  if (loading) return <div className="text-xs text-gray-500 py-2">Memuat registrasi...</div>
  if (!list.length) return <div className="text-xs text-gray-500 py-2">Tidak ada registrasi</div>
  return (
    <ul className="space-y-1.5 text-xs max-h-40 overflow-y-auto">
      {list.map((reg) => (
        <li key={reg.id_registrasi || reg.id} className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 rounded px-2 py-1.5">
          <span>
            ID {reg.id_registrasi || reg.id} · {reg.tahun_hijriyah || reg.tahun_masehi || '-'}
          </span>
          <span className="font-medium text-green-600 dark:text-green-400">{formatRp(reg.bayar)}</span>
        </li>
      ))}
    </ul>
  )
}

function ListBerkas({ santriId }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!santriId || !/^\d{7}$/.test(String(santriId))) {
      setList([])
      return
    }
    setLoading(true)
    pendaftaranAPI
      .getBerkasList(santriId)
      .then((r) => {
        if (r.success && Array.isArray(r.data)) setList(r.data)
        else setList([])
      })
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [santriId])
  if (loading) return <div className="text-xs text-gray-500 py-2">Memuat berkas...</div>
  if (!list.length) return <div className="text-xs text-gray-500 py-2">Tidak ada berkas</div>
  return (
    <ul className="space-y-1.5 text-xs max-h-40 overflow-y-auto">
      {list.map((b) => (
        <li key={b.id} className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 rounded px-2 py-1.5">
          <span className="truncate flex-1 mr-2" title={b.jenis_berkas || b.keterangan || ''}>
            {b.jenis_berkas || b.keterangan || 'Berkas'}
          </span>
          <span
            className={`flex-shrink-0 text-[10px] ${b.status_tidak_ada ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}
          >
            {b.status_tidak_ada ? 'Tidak ada' : 'Ada'}
          </span>
        </li>
      ))}
    </ul>
  )
}

function ListUwabaAllYears({ santriId }) {
  const [summary, setSummary] = useState([])
  const [rows, setRows] = useState([])
  const [expandedTa, setExpandedTa] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!santriId || !/^\d{7}$/.test(String(santriId))) {
      setSummary([])
      setRows([])
      return
    }
    setLoading(true)
    uwabaAPI
      .getAllRowsForSantri(santriId)
      .then((res) => {
        if (res?.success) {
          setSummary(Array.isArray(res.summary_by_tahun) ? res.summary_by_tahun : [])
          setRows(Array.isArray(res.data) ? res.data : [])
        } else {
          setSummary([])
          setRows([])
        }
      })
      .catch(() => {
        setSummary([])
        setRows([])
      })
      .finally(() => setLoading(false))
  }, [santriId])

  const rowsByTahun = useMemo(() => {
    const map = {}
    for (const row of rows) {
      const ta = String(row.tahun_ajaran ?? '').trim() || '-'
      if (!map[ta]) map[ta] = []
      map[ta].push(row)
    }
    return map
  }, [rows])

  const grand = useMemo(() => {
    return summary.reduce(
      (acc, s) => ({
        wajib: acc.wajib + (parseInt(s.total_wajib, 10) || 0),
        bayar: acc.bayar + (parseInt(s.total_bayar, 10) || 0),
      }),
      { wajib: 0, bayar: 0 }
    )
  }, [summary])

  if (loading) return <div className="text-xs text-gray-500 py-2">Memuat UWABA semua tahun…</div>
  if (!summary.length) return <div className="text-xs text-gray-500 py-2">Tidak ada data UWABA</div>

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-2 text-gray-600 dark:text-gray-400">
        <span>Total wajib: {formatRp(grand.wajib)}</span>
        <span>Total bayar: {formatRp(grand.bayar)}</span>
        <span>Kurang: {formatRp(Math.max(0, grand.wajib - grand.bayar))}</span>
        <span>{summary.length} tahun ajaran</span>
      </div>
      <ul className="space-y-1.5 text-xs max-h-52 overflow-y-auto">
        {summary.map((s) => {
          const ta = s.tahun_ajaran || '-'
          const isOpen = expandedTa === ta
          const bulanRows = rowsByTahun[ta] || []
          return (
            <li key={ta} className="rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedTa(isOpen ? null : ta)}
                className="w-full flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
              >
                <span className="font-medium text-gray-800 dark:text-gray-200">TA {ta}</span>
                <span className="text-gray-600 dark:text-gray-400">
                  {s.jumlah_bulan || 0} bln · wajib {formatRp(s.total_wajib)} · bayar {formatRp(s.total_bayar)}
                  {(s.kurang ?? 0) > 0 && (
                    <span className="text-amber-700 dark:text-amber-400"> · kurang {formatRp(s.kurang)}</span>
                  )}
                </span>
              </button>
              {isOpen && bulanRows.length > 0 && (
                <ul className="px-2 py-1 space-y-0.5 border-t border-gray-200 dark:border-gray-600">
                  {bulanRows.map((r) => (
                    <li key={r.id} className="flex justify-between text-[11px] text-gray-600 dark:text-gray-400">
                      <span>{r.bulan || `Bulan ${r.id_bulan}`}</span>
                      <span>{formatRp(r.wajib)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function RincianListReadOnly({ santriId, mode, title }) {
  const [rincian, setRincian] = useState([])
  const [total, setTotal] = useState({ total: 0, bayar: 0, kurang: 0 })
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!santriId || !/^\d{7}$/.test(String(santriId))) {
      setRincian([])
      setTotal({ total: 0, bayar: 0, kurang: 0 })
      return
    }
    setLoading(true)
    paymentAPI
      .getRincian(santriId, mode, null)
      .then((res) => {
        if (res.success && res.data) {
          setRincian(res.data.rincian || [])
          setTotal(res.data.total || { total: 0, bayar: 0, kurang: 0 })
        } else {
          setRincian([])
          setTotal({ total: 0, bayar: 0, kurang: 0 })
        }
      })
      .catch(() => {
        setRincian([])
        setTotal({ total: 0, bayar: 0, kurang: 0 })
      })
      .finally(() => setLoading(false))
  }, [santriId, mode])
  if (loading) return <div className="text-xs text-gray-500 py-2">Memuat {title}...</div>
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5 text-gray-600 dark:text-gray-400">
        <span>Total: {formatRp(total.total)}</span>
        <span>Bayar: {formatRp(total.bayar)}</span>
        <span>Kurang: {formatRp(total.kurang)}</span>
      </div>
      {rincian.length === 0 ? (
        <div className="text-xs text-gray-500 py-2">Tidak ada data</div>
      ) : (
        <ul className="space-y-1 text-xs max-h-36 overflow-y-auto">
          {rincian.map((item, idx) => (
            <li
              key={item.id || item.id_tunggakan || item.id_khusus || idx}
              className="flex justify-between bg-gray-50 dark:bg-gray-700/50 rounded px-2 py-1"
            >
              <span className="truncate">{item.nama || item.keterangan_1 || item.keterangan || item.bulan || '-'}</span>
              <span>{formatRp(item.wajib || item.nominal)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DualColumnPeek({ labelA, labelB, contentLeft, contentRight }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
      <div className="rounded-md border border-teal-100 dark:border-teal-900/40 bg-teal-50/30 dark:bg-teal-950/20 p-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-800 dark:text-teal-300 mb-1.5">{labelA}</p>
        {contentLeft}
      </div>
      <div className="rounded-md border border-blue-100 dark:border-blue-900/40 bg-blue-50/30 dark:bg-blue-950/20 p-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-300 mb-1.5">{labelB}</p>
        {contentRight}
      </div>
    </div>
  )
}

function MergeActionRow({
  disabled,
  merging,
  labelA,
  labelB,
  idA,
  idB,
  supportsMove,
  supportsCopy,
  onAction,
  biodataOnly,
  onBiodata,
}) {
  if (biodataOnly) {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || merging}
          onClick={() => onBiodata(String(idA))}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
        >
          Padukan biodata → {labelA}
        </button>
        <button
          type="button"
          disabled={disabled || merging}
          onClick={() => onBiodata(String(idB))}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          Padukan biodata → {labelB}
        </button>
      </div>
    )
  }

  const btn = (action, targetId, color) => {
    const isMove = action === 'move'
    const verb = isMove ? 'Pindah' : 'Salin'
    const bg = color === 'teal' ? 'bg-teal-600 hover:bg-teal-700' : 'bg-blue-600 hover:bg-blue-700'
    return (
      <button
        key={`${action}-${targetId}`}
        type="button"
        disabled={disabled || merging}
        onClick={() => onAction(action, String(targetId))}
        className={`inline-flex items-center gap-1.5 rounded-lg ${bg} px-3 py-1.5 text-xs font-medium text-white shadow-sm disabled:opacity-50`}
      >
        {verb} → {color === 'teal' ? labelA : labelB} ({targetId})
      </button>
    )
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {supportsMove && (
        <>
          {btn('move', idA, 'teal')}
          {btn('move', idB, 'blue')}
        </>
      )}
      {supportsCopy && (
        <>
          {btn('copy', idA, 'teal')}
          {btn('copy', idB, 'blue')}
        </>
      )}
    </div>
  )
}

function DomainExtraPreview({ mode, santriIdA, santriIdB, labelA, labelB }) {
  if (mode === 'registrasi') {
    return (
      <DualColumnPeek
        labelA={labelA}
        labelB={labelB}
        contentLeft={<ListRegistrasi santriId={santriIdA} />}
        contentRight={<ListRegistrasi santriId={santriIdB} />}
      />
    )
  }
  if (mode === 'berkas') {
    return (
      <DualColumnPeek
        labelA={labelA}
        labelB={labelB}
        contentLeft={<ListBerkas santriId={santriIdA} />}
        contentRight={<ListBerkas santriId={santriIdB} />}
      />
    )
  }
  if (mode === 'uwaba') {
    return (
      <>
        <DualColumnPeek
          labelA={`${labelA} · UWABA (semua tahun)`}
          labelB={`${labelB} · UWABA (semua tahun)`}
          contentLeft={<ListUwabaAllYears santriId={santriIdA} />}
          contentRight={<ListUwabaAllYears santriId={santriIdB} />}
        />
        <DualColumnPeek
          labelA={`${labelA} · tunggakan`}
          labelB={`${labelB} · tunggakan`}
          contentLeft={<RincianListReadOnly santriId={santriIdA} mode="tunggakan" title="Tunggakan" />}
          contentRight={<RincianListReadOnly santriId={santriIdB} mode="tunggakan" title="Tunggakan" />}
        />
        <DualColumnPeek
          labelA={`${labelA} · khusus`}
          labelB={`${labelB} · khusus`}
          contentLeft={<RincianListReadOnly santriId={santriIdA} mode="khusus" title="Khusus" />}
          contentRight={<RincianListReadOnly santriId={santriIdB} mode="khusus" title="Khusus" />}
        />
      </>
    )
  }
  return null
}

/**
 * Panel per-domain padukan data — semua tabel terkait santri.id dari API.
 */
export default function PadukanDataLists({
  santriIdA,
  santriIdB,
  labelA = 'Santri 1',
  labelB = 'Santri 2',
  merging,
  onMergeSection,
  onMergeBiodata,
}) {
  const validA = santriIdA && /^\d{7}$/.test(String(santriIdA))
  const validB = santriIdB && /^\d{7}$/.test(String(santriIdB))
  const can = validA && validB && String(santriIdA) !== String(santriIdB)

  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    if (!can) {
      setPreview(null)
      return
    }
    setPreviewLoading(true)
    pendaftaranAPI
      .getMergeSantriPreview(santriIdA, santriIdB)
      .then((r) => {
        if (r.success) setPreview(r)
        else setPreview(null)
      })
      .catch(() => setPreview(null))
      .finally(() => setPreviewLoading(false))
  }, [santriIdA, santriIdB, can])

  const groupedDomains = useMemo(() => {
    if (!preview?.domains) return []
    const groups = {}
    for (const d of preview.domains) {
      const g = d.group || 'lainnya'
      if (!groups[g]) groups[g] = []
      groups[g].push(d)
    }
    return Object.entries(groups).map(([key, domains]) => ({
      key,
      label: PADUKAN_GROUP_LABELS[key] || key,
      domains,
    }))
  }, [preview])

  if (!validA || !validB) {
    return (
      <div className="mt-4 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-center text-sm text-gray-500 dark:text-gray-400">
        Pilih dua NIS (7 digit) di kedua kolom untuk membandingkan dan memadukan per bagian.
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-6">
      {previewLoading && (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center">Memuat ringkasan data terkait santri…</p>
      )}

      {groupedDomains.map(({ key, label, domains }) => (
        <div key={key}>
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">{label}</h2>
          <div className="space-y-4">
            {domains.map((domain) => {
              const countsA = preview?.counts_a?.[domain.mode]?.total ?? 0
              const countsB = preview?.counts_b?.[domain.mode]?.total ?? 0
              const isBiodata = domain.mode === 'biodata'

              return (
                <div
                  key={domain.mode}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{domain.label}</h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 max-w-3xl">{domain.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <CountBadge count={countsA} label={labelA} />
                      <CountBadge count={countsB} label={labelB} />
                    </div>
                  </div>

                  <DomainExtraPreview
                    mode={domain.mode}
                    santriIdA={santriIdA}
                    santriIdB={santriIdB}
                    labelA={labelA}
                    labelB={labelB}
                  />

                  <MergeActionRow
                    disabled={!can}
                    merging={merging}
                    labelA={labelA}
                    labelB={labelB}
                    idA={santriIdA}
                    idB={santriIdB}
                    supportsMove={domain.supports_move && !isBiodata}
                    supportsCopy={domain.supports_copy && !isBiodata}
                    biodataOnly={isBiodata}
                    onBiodata={onMergeBiodata}
                    onAction={(action, idUtama) => onMergeSection(domain.mode, idUtama, action)}
                  />

                  {!domain.supports_copy && !isBiodata && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2">
                      Bagian ini hanya mendukung pindah (bukan salin duplikat).
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
