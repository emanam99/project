import BarangFormPanel from './BarangFormPanel'
import BarangStokPanel from './BarangStokPanel'

const tabBtn = (active) =>
  `flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    active
      ? 'bg-white text-primary-700 shadow-sm dark:bg-gray-700 dark:text-primary-300'
      : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
  }`

export default function BarangDetailTabs({
  editing,
  detailTab,
  onDetailTabChange,
  formPanelProps,
  showCancel = false,
}) {
  const isEditMode = Boolean(editing)
  const onStokTab = isEditMode && detailTab === 'stok'

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {isEditMode ? (
        <div
          className="mb-3 flex shrink-0 rounded-lg bg-gray-100 p-1 dark:bg-gray-900/60"
          role="tablist"
          aria-label="Detail barang"
        >
          <button
            type="button"
            role="tab"
            aria-selected={detailTab === 'edit'}
            className={tabBtn(detailTab === 'edit')}
            onClick={() => onDetailTabChange('edit')}
          >
            Edit
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={detailTab === 'stok'}
            className={tabBtn(detailTab === 'stok')}
            onClick={() => onDetailTabChange('stok')}
          >
            Stok
            <span className="ml-1.5 tabular-nums text-xs opacity-80">({editing.stok ?? 0})</span>
          </button>
        </div>
      ) : null}

      {onStokTab ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          <BarangStokPanel
            barangId={editing.id}
            stok={editing.stok ?? 0}
            onStokChange={formPanelProps.onStokChange}
            embedded
          />
        </div>
      ) : (
        <BarangFormPanel {...formPanelProps} showCancel={showCancel} />
      )}
    </div>
  )
}
