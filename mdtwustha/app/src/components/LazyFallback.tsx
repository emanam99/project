/** Skeleton lembut untuk Suspense / lazy load — tanpa spinner berputar. */
export default function LazyFallback({ label = 'Menyiapkan…' }: { label?: string }) {
  return (
    <div className="w-full max-w-3xl mx-auto py-6 space-y-4 animate-pulse" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="h-8 w-48 rounded-lg bg-slate-200/80 dark:bg-white/10" />
      <div className="h-4 w-72 max-w-full rounded-md bg-slate-200/60 dark:bg-white/[0.07]" />
      <div className="rounded-2xl border border-slate-200/80 dark:border-white/5 overflow-hidden bg-white/60 dark:bg-slate-800/40">
        <div className="h-11 bg-slate-100/90 dark:bg-white/[0.06]" />
        <div className="p-4 space-y-3">
          <div className="h-3.5 w-full rounded bg-slate-200/70 dark:bg-white/10" />
          <div className="h-3.5 w-[92%] rounded bg-slate-200/60 dark:bg-white/[0.08]" />
          <div className="h-3.5 w-[78%] rounded bg-slate-200/50 dark:bg-white/[0.06]" />
          <div className="h-3.5 w-[85%] rounded bg-slate-200/60 dark:bg-white/[0.08]" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="h-24 rounded-xl bg-slate-200/50 dark:bg-white/[0.06]" />
        <div className="h-24 rounded-xl bg-slate-200/50 dark:bg-white/[0.06]" />
        <div className="h-24 rounded-xl bg-slate-200/50 dark:bg-white/[0.06] hidden sm:block" />
      </div>
    </div>
  )
}

/** Skeleton ringkas untuk loading data di dalam halaman. */
export function ContentSkeleton({ rows = 4, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`animate-pulse space-y-2.5 p-3 ${className}`} role="status" aria-live="polite">
      <span className="sr-only">Memuat…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-10 rounded-xl bg-slate-200/70 dark:bg-white/[0.07]"
          style={{ width: `${92 - (i % 3) * 8}%` }}
        />
      ))}
    </div>
  )
}
