import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { formatCurrency, getStatusBadge } from '../utils/pengeluaranUtils'

function DraftTab({
  draftList,
  draftLoading,
  draftTotal,
  draftPage,
  setDraftPage,
  itemsPerPage,
  setItemsPerPage,
  canEditDraft = true,
  canDeleteDraft = false,
  onDeleteDraft = null
}) {
  const navigate = useNavigate()

  return (
    <div className="space-y-4">
      {draftLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
        </div>
      ) : draftList.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">Tidak ada draft rencana pengeluaran</p>
        </div>
      ) : (
        <div className="space-y-2">
          {draftList.map((draft, index) => {
            const getBackgroundColor = () => {
              return 'bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600'
            }

            return (
              <motion.div
                key={draft.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className={`${getBackgroundColor()} rounded-lg shadow-md p-3 sm:p-4 border`}
              >
                <div className="flex items-stretch justify-between gap-3">
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-sm sm:text-base font-semibold text-gray-700 dark:text-gray-300 truncate">
                        {draft.keterangan || 'Tanpa Keterangan'}
                      </h3>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-1">
                      {draft.kategori && (
                        <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300 rounded">
                          {draft.kategori}
                        </span>
                      )}
                      {draft.lembaga && (
                        <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300 rounded">
                          {draft.lembaga}
                        </span>
                      )}
                      {draft.sumber_uang && (
                        <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300 rounded">
                          {draft.sumber_uang}
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">
                      Oleh: {draft.admin_nama || 'Unknown'} | {new Date(draft.tanggal_dibuat).toLocaleDateString('id-ID')}
                    </p>
                    {draft.hijriyah && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Hijriyah: {draft.hijriyah}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end justify-between gap-2 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-base sm:text-lg font-bold text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {formatCurrency(parseFloat(draft.nominal || 0))}
                      </p>
                    </div>
                    <div className="text-right">{getStatusBadge(draft.ket)}</div>
                    {(canEditDraft || canDeleteDraft) && (
                      <div className="flex flex-col gap-1 pt-1">
                        {canEditDraft && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/pengeluaran/edit/${draft.id}`)
                            }}
                            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            Edit
                          </button>
                        )}
                        {canDeleteDraft && onDeleteDraft && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onDeleteDraft(draft)
                            }}
                            className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}

          {draftTotal > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">Tampilkan:</label>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value))
                    setDraftPage(1)
                  }}
                  className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm focus:ring-2 focus:ring-teal-500"
                >
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
                <span className="text-sm text-gray-600 dark:text-gray-400">dari {draftTotal} data</span>
              </div>

              {draftTotal > itemsPerPage && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDraftPage((prev) => Math.max(1, prev - 1))}
                    disabled={draftPage === 1}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Previous
                  </button>
                  <span className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                    Halaman {draftPage} dari {Math.ceil(draftTotal / itemsPerPage)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDraftPage((prev) => prev + 1)}
                    disabled={draftPage >= Math.ceil(draftTotal / itemsPerPage)}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DraftTab
