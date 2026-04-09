import { getGambarUrl } from '../../../config/images'

/**
 * Konten putih untuk preview & cetak (dipakai di offcanvas bawah).
 */
export default function LaporanPrintPreview({ jenisLabel, printInfo, totals, filteredData, fontSize = 9 }) {
  const tableWrapStyle = {
    '--laporan-table-font-size': `${fontSize}px`
  }

  return (
    <div className="print-laporan-pembayaran-page rounded-lg border border-gray-200 p-4 sm:p-5">
      <div className="flex items-center gap-4 mb-4">
        <img
          src={getGambarUrl('/uwaba-4.png')}
          alt=""
          className="h-11 w-auto max-w-[70px] object-contain"
        />
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-teal-700">Laporan Pembayaran</h1>
          <p className="text-sm font-semibold text-teal-800 mt-0.5">{jenisLabel}</p>
        </div>
      </div>

      <div className="text-xs text-gray-600 text-center mb-4">
        <span>
          Tanggal Cetak (Masehi): <b>{printInfo.masehi}</b>
        </span>{' '}
        |{' '}
        <span>
          Tanggal Cetak (Hijriyah): <b>{printInfo.hijriyah}</b>
        </span>{' '}
        |{' '}
        <span>
          Waktu: <b>{printInfo.waktu}</b>
        </span>
      </div>

      {filteredData.length > 0 && (
        <div className="mb-5">
          <div className="grid grid-cols-2 gap-2">
            {[
              ['via Cash', totals.totalCash],
              ['via TF', totals.totalTF],
              ['via iPayMu', totals.totalIPayMu ?? 0],
              ['via Lembaga', totals.totalLembaga],
              ['via Beasiswa', totals.totalBeasiswa],
              ['via BagDIS', totals.totalBagDIS],
              ['via PIP', totals.totalPIP],
              ['via KIP', totals.totalKIP],
              ['via Adiktis', totals.totalAdiktis],
              ['via PemKab', totals.totalPemKab],
              ['via Subsidi', totals.totalSubsidi],
              ['via Prestasi', totals.totalPrestasi]
            ].map(([label, amount]) => (
              <div key={label} className="laporan-print-summary-card rounded-xl p-3">
                <div className="flex justify-between items-center">
                  <div className="text-xs text-gray-600">{label}</div>
                  <div className="text-base font-bold text-teal-700">
                    Rp {amount.toLocaleString('id')}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2">
            <div className="laporan-print-total-box rounded-xl p-4 text-center">
              <div className="text-xs text-gray-600 mb-0.5">Total Keseluruhan</div>
              <div className="text-2xl font-bold text-amber-600">
                Rp {totals.totalAll.toLocaleString('id')}
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className="laporan-print-table-wrap overflow-x-auto rounded-lg border border-gray-200 bg-white"
        style={tableWrapStyle}
      >
        {filteredData.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Tidak ada data</div>
        ) : (
          <table className="w-full border-collapse laporan-print">
            <thead>
              <tr>
                <th className="px-3 py-2 border border-gray-300 font-bold">No</th>
                <th className="px-3 py-2 border border-gray-300 font-bold">Nama Santri</th>
                <th className="px-3 py-2 border border-gray-300 font-bold">Nominal</th>
                <th className="px-3 py-2 border border-gray-300 font-bold">Via</th>
                <th className="px-3 py-2 border border-gray-300 font-bold">Keterangan</th>
                <th className="px-3 py-2 border border-gray-300 font-bold">Admin</th>
                <th className="px-3 py-2 border border-gray-300 font-bold">Tanggal</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, index) => (
                <tr key={index} className="even:bg-gray-50">
                  <td className="text-center px-3 py-2 border border-gray-300">{index + 1}</td>
                  <td className="px-3 py-2 border border-gray-300">
                    {(row.nis ?? row.id_santri)
                      ? `${row.nis ?? row.id_santri} - ${row.nama_santri}`
                      : row.nama_santri}
                  </td>
                  <td className="text-right px-3 py-2 border border-gray-300">{row.nominal}</td>
                  <td className="text-center px-3 py-2 border border-gray-300">{row.via}</td>
                  <td
                    className="text-left px-3 py-2 border border-gray-300 max-w-[200px] truncate"
                    title={row.keterangan_1 || '-'}
                  >
                    {row.keterangan_1 || '-'}
                  </td>
                  <td className="text-left px-3 py-2 border border-gray-300">{row.admin || '-'}</td>
                  <td className="text-center px-3 py-2 border border-gray-300">
                    <div className="laporan-print-sub text-gray-700 mb-1">{row.hijriyah || '-'}</div>
                    <div className="laporan-print-sub text-gray-600">{row.tanggal_dibuat || '-'}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
