export default function StartPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold text-foreground">Start</h1>
      <p className="text-sm text-muted">
        Select a study type to begin a timed read. Favorites, frequent, and
        recent study types will appear here.
      </p>
      <div className="mt-6 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
        The timer loop lands in Phase 2.
      </div>
    </div>
  );
}
