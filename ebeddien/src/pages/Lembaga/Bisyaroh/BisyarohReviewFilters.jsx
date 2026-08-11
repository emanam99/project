import BisyarohReviewPeriodeBar from './BisyarohReviewPeriodeBar'
import BisyarohReviewLembagaBar from './BisyarohReviewLembagaBar'

/**
 * Filter tab Review: bulan (atas) → lembaga (bawah), keduanya horizontal.
 */
export default function BisyarohReviewFilters({
  periodeKalender,
  onKalenderMode,
  periodeBulan,
  onPeriodeChange,
  periodeOptions,
  lembagaList,
  lembagaId,
  onLembagaChange,
  loadingPeriode = false,
  loadingLembaga = false,
  lembagaLocked
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4 mb-4 space-y-4">
      <BisyarohReviewPeriodeBar
        periodeKalender={periodeKalender}
        onKalenderMode={onKalenderMode}
        periodeBulan={periodeBulan}
        onPeriodeChange={onPeriodeChange}
        periodeOptions={periodeOptions}
        disabled={loadingPeriode}
      />
      <div className="border-t border-gray-100 dark:border-gray-700/80 pt-4">
        <BisyarohReviewLembagaBar
          lembagaList={lembagaList}
          lembagaId={lembagaId}
          onLembagaChange={onLembagaChange}
          loading={loadingLembaga || loadingPeriode}
          locked={lembagaLocked}
        />
      </div>
    </div>
  )
}
