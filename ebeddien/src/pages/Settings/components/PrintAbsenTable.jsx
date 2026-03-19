import '../../Ijin/components/PrintDataTable.css'
import { buildHarianColumns, HARI_ID_OPTIONS, parseYmdLocal } from './printAbsenHelpers'

/**
 * @typedef {'simple' | 'harian' | 'jam'} AbsenMode
 */

function PrintAbsenTable({
  rombel,
  santriList = [],
  fontSize = 9,
  waliNama = '',
  mode = 'simple',
  harianTanggalMulai = '',
  harianTanggalSelesai = '',
  harianHariMulai = 1,
  harianHariSelesai = 6,
  jamTanggal = '',
  jumlahJam = 8,
}) {
  const lembaga = rombel?.lembaga_nama || rombel?.lembaga_id || '–'
  const kelas = rombel?.kelas || '–'
  const kel = rombel?.kel ? ` (${rombel.kel})` : ''
  const titleLine = `${lembaga} — Kelas ${kelas}${kel}`.trim()
  const waliLine = (waliNama && String(waliNama).trim()) || '—'

  const harianCols =
    mode === 'harian'
      ? buildHarianColumns(harianTanggalMulai, harianTanggalSelesai, harianHariMulai, harianHariSelesai)
      : []

  const jamCols =
    mode === 'jam'
      ? Array.from({ length: Math.max(1, Math.min(20, Number(jumlahJam) || 1)) }, (_, i) => ({
          key: `jam-${i + 1}`,
          label: `Jam ${i + 1}`,
        }))
      : []

  const jamDateLabel = (() => {
    if (mode !== 'jam') return ''
    const d = parseYmdLocal(jamTanggal)
    if (!d) return '—'
    return d.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  })()

  const harianMeta = (() => {
    if (mode !== 'harian') return ''
    const a = HARI_ID_OPTIONS.find((o) => o.value === harianHariMulai)?.label || '—'
    const b = HARI_ID_OPTIONS.find((o) => o.value === harianHariSelesai)?.label || '—'
    const d0 = parseYmdLocal(harianTanggalMulai)
    const d1 = parseYmdLocal(harianTanggalSelesai)
    const t0 = d0 ? d0.toLocaleDateString('id-ID') : '—'
    const t1 = d1 ? d1.toLocaleDateString('id-ID') : '—'
    return `Periode: ${t0} s/d ${t1} · Hari: ${a} – ${b} · ${harianCols.length} kolom tanggal`
  })()

  const jamMeta =
    mode === 'jam'
      ? `Tanggal: ${jamDateLabel} · ${jamCols.length} jam pelajaran per hari`
      : ''

  const tableWrapperStyle = {
    '--table-font-size': `${fontSize}px`,
  }

  const renderEmptyCells = (count, className = 'print-absen-td-empty') =>
    Array.from({ length: count }, (_, i) => (
      <td key={i} className={`print-data-td ${className}`} aria-hidden="true" />
    ))

  return (
    <div className="print-data-container">
      <div className="print-data-header" id="print-absen-header">
        <div className="print-data-header-content">
          <div className="print-data-title-section">
            <h1 className="print-data-title">Daftar Absensi Santri</h1>
            <p className="print-data-subtitle">{titleLine}</p>
            <p className="print-data-tahun" style={{ marginTop: '4px' }}>
              Wali kelas: <strong>{waliLine}</strong>
            </p>
            <p className="print-data-info">
              {mode === 'simple' && 'Format: Absen TTD (paraf & keterangan)'}
              {mode === 'harian' && harianMeta}
              {mode === 'jam' && jamMeta}
              {' · '}
              Jumlah: {santriList.length} santri | Dicetak: {new Date().toLocaleString('id-ID')}
            </p>
          </div>
        </div>
      </div>

      <div className="print-data-table-wrapper print-absen-table-outer" style={tableWrapperStyle}>
        <table className="print-data-table print-absen-table">
          <thead>
            {mode === 'simple' && (
              <tr>
                <th className="print-data-th-no">No</th>
                <th className="print-data-th">NIS</th>
                <th className="print-data-th">Nama</th>
                <th className="print-data-th print-absen-col-paraf">Paraf</th>
                <th className="print-data-th print-absen-col-ket">Keterangan</th>
              </tr>
            )}
            {mode === 'harian' && (
              <tr>
                <th className="print-data-th-no">No</th>
                <th className="print-data-th">NIS</th>
                <th className="print-data-th print-absen-th-nama">Nama</th>
                {harianCols.map((c) => (
                  <th key={c.key} className="print-data-th print-absen-th-date" title={c.key}>
                    {c.label}
                  </th>
                ))}
              </tr>
            )}
            {mode === 'jam' && (
              <tr>
                <th className="print-data-th-no">No</th>
                <th className="print-data-th">NIS</th>
                <th className="print-data-th print-absen-th-nama">Nama</th>
                {jamCols.map((c) => (
                  <th key={c.key} className="print-data-th print-absen-th-jam">
                    {c.label}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {mode === 'simple' &&
              santriList.map((s, index) => (
                <tr key={s.id ?? index}>
                  <td className="print-data-td-no">{index + 1}</td>
                  <td className="print-data-td print-absen-td-mono">{s.nis ?? '–'}</td>
                  <td className="print-data-td">{s.nama || '–'}</td>
                  <td className="print-data-td print-absen-td-empty print-absen-col-paraf" aria-hidden="true" />
                  <td className="print-data-td print-absen-td-empty print-absen-col-ket" aria-hidden="true" />
                </tr>
              ))}
            {mode === 'harian' &&
              santriList.map((s, index) => (
                <tr key={s.id ?? index}>
                  <td className="print-data-td-no">{index + 1}</td>
                  <td className="print-data-td print-absen-td-mono">{s.nis ?? '–'}</td>
                  <td className="print-data-td print-absen-td-nama">{s.nama || '–'}</td>
                  {renderEmptyCells(harianCols.length, 'print-absen-td-empty print-absen-td-mini')}
                </tr>
              ))}
            {mode === 'jam' &&
              santriList.map((s, index) => (
                <tr key={s.id ?? index}>
                  <td className="print-data-td-no">{index + 1}</td>
                  <td className="print-data-td print-absen-td-mono">{s.nis ?? '–'}</td>
                  <td className="print-data-td print-absen-td-nama">{s.nama || '–'}</td>
                  {renderEmptyCells(jamCols.length, 'print-absen-td-empty print-absen-td-mini')}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {mode === 'harian' && harianCols.length === 0 && (
        <p className="print-data-info text-center text-amber-700 dark:text-amber-400 no-print">
          Periksa tanggal dan rentang hari — belum ada kolom tanggal yang dihasilkan.
        </p>
      )}

      <style>{`
        .print-absen-td-empty {
          min-height: 1.75em;
          height: 1.9em;
        }
        .print-absen-td-mini {
          min-width: 1.8rem;
          max-width: 3.2rem;
        }
        .print-absen-col-paraf {
          min-width: 4.5rem;
          width: 12%;
        }
        .print-absen-col-ket {
          min-width: 6rem;
          width: 22%;
        }
        .print-absen-td-mono {
          font-family: ui-monospace, monospace;
          white-space: nowrap;
        }
        .print-absen-th-nama,
        .print-absen-td-nama {
          min-width: 7rem;
          max-width: 14rem;
        }
        .print-absen-th-date {
          min-width: 2.5rem;
          max-width: 4rem;
          white-space: normal;
          line-height: 1.2;
          font-weight: 600;
        }
        .print-absen-th-jam {
          min-width: 2rem;
          max-width: 3rem;
        }
        .print-absen-table-outer {
          overflow-x: auto;
        }
      `}</style>
    </div>
  )
}

export default PrintAbsenTable
