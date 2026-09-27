/** Shared header for the login/register/setup pages: the RadTempo
 * wordmark plus a one-line description of what this screen does, set on
 * the film/light-box background. Calm, single-column, no card chrome
 * around the header itself. */
export function AuthHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-8 text-center">
      <p className="text-xs font-medium text-muted">RadTempo</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
    </div>
  );
}
