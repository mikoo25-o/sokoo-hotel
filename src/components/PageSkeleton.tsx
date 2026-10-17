/** Instant placeholder shown while a page's data loads, so a tap always gives feedback. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse motion-reduce:animate-none">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-52 rounded-lg bg-line" />
      <div className="mt-3 h-4 w-72 max-w-full rounded bg-line/70" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl border border-line bg-white" />
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-2xl border border-line bg-white" />
        ))}
      </div>
    </div>
  );
}
