export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
      <p className="text-sm text-muted">
        No history yet. Your first timed read will start your personal baseline.
      </p>
    </div>
  );
}
