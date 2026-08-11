/** Spinner ringan untuk lazy route — dipakai di shell layout (bukan full-screen). */
export default function PageLoader() {
  return (
    <div className="flex min-h-[40dvh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>
  )
}
