import { useState, useEffect, useCallback } from 'react'
import { mahromAPI } from '../../services/api'
import MahromFormOffcanvas from './components/MahromFormOffcanvas'
import CetakKartuMahromOffcanvas from './components/CetakKartuMahromOffcanvas'

export default function DataMahrom() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [perPage] = useState(20)
  const [pagination, setPagination] = useState({ total: 0, total_pages: 0 })
  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [cetakMahromId, setCetakMahromId] = useState(null)

  const loadList = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await mahromAPI.getList({
        page,
        limit: perPage,
        search: searchInput.trim() || undefined,
      })
      if (res?.success) {
        setList(res.data || [])
        setPagination(res.pagination || { total: 0, total_pages: 0 })
      } else {
        setError(res?.message || 'Gagal memuat data mahrom')
      }
    } catch {
      setError('Terjadi kesalahan saat memuat data mahrom')
    } finally {
      setLoading(false)
    }
  }, [page, perPage, searchInput])

  useEffect(() => {
    loadList()
  }, [loadList])

  const openTambah = () => {
    setEditingId(null)
    setOffcanvasOpen(true)
  }

  const openEdit = (row) => {
    setEditingId(row.id)
    setOffcanvasOpen(true)
  }

  const openCetak = (row, e) => {
    e?.stopPropagation?.()
    setCetakMahromId(row.id)
  }

  const handleSearch = () => {
    setPage(1)
    loadList()
  }

  const totalPages = Math.max(1, pagination.total_pages || 1)
  const safePage = Math.min(Math.max(1, page), totalPages)

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="flex-shrink-0 p-4 sm:p-6 lg:p-8">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
          <div className="flex flex-wrap items-center gap-2 p-3">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 min-w-[200px] px-3 py-2 text-sm bg-transparent dark:text-gray-100 outline-none"
              placeholder="Cari nama, NIM, NIK, atau WA..."
            />
            <button
              type="button"
              onClick={handleSearch}
              className="px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Cari
            </button>
            <button
              type="button"
              onClick={openTambah}
              className="px-3 py-2 text-sm rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium"
            >
              + Tambah mahrom
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-8">
        {loading && list.length === 0 ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
          </div>
        ) : list.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500">
            Belum ada data mahrom. Klik &quot;Tambah mahrom&quot; untuk mendaftarkan wali/orang tua.
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-12">No</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">NIM</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">NIK</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">WA</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Santri</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Kartu CM</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-24">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {list.map((row, index) => (
                    <tr
                      key={row.id}
                      onClick={() => openEdit(row)}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                    >
                      <td className="px-3 py-2 text-sm text-gray-500">{(safePage - 1) * perPage + index + 1}</td>
                      <td className="px-3 py-2 font-mono text-sm">{row.nim}</td>
                      <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{row.nama}</td>
                      <td className="px-3 py-2 text-sm font-mono text-gray-600 dark:text-gray-400">{row.nik || '—'}</td>
                      <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{row.no_wa || row.no_telpon || '—'}</td>
                      <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{row.jumlah_santri ?? 0}</td>
                      <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
                        {(() => {
                          const km = row.kartu_cm || {}
                          const aktif = km.aktif ?? 0
                          const dicetak = km.dicetak ?? 0
                          if (aktif === 0) {
                            return <span className="text-gray-400">Belum terbit</span>
                          }
                          const detail = (km.per_santri || [])
                            .map((p) => `${p.santri_nama || 'Santri'}${p.printed ? ' ✓' : ' ○'}`)
                            .join(', ')
                          return (
                            <span className="text-xs" title={detail || undefined}>
                              {dicetak}/{aktif} dicetak
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          title="Cetak kartu CM"
                          onClick={(e) => openCetak(row, e)}
                          className="inline-flex items-center justify-center p-2 rounded-lg text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {pagination.total > 0 && (
          <div className="flex items-center gap-3 mt-4">
            <span className="text-xs text-gray-500">
              Hal. {safePage} / {totalPages} — total {pagination.total}
            </span>
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2 py-1 text-xs rounded border disabled:opacity-50"
            >
              Sebelumnya
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-2 py-1 text-xs rounded border disabled:opacity-50"
            >
              Berikutnya
            </button>
          </div>
        )}
      </div>

      <MahromFormOffcanvas
        isOpen={offcanvasOpen}
        mahromId={editingId}
        onClose={() => {
          setOffcanvasOpen(false)
          setEditingId(null)
        }}
        onSuccess={(data) => {
          loadList()
          if (data?.id) setEditingId(data.id)
        }}
      />

      <CetakKartuMahromOffcanvas
        isOpen={Boolean(cetakMahromId)}
        mahromId={cetakMahromId}
        onClose={() => setCetakMahromId(null)}
      />
    </div>
  )
}
