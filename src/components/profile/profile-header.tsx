// The identity block at the top of every profile — a person, a company, or a
// staff account. One component so an employee in the contractor portal and
// the same employee in the auditor portal read identically.
export interface ProfileFact {
  label: string;
  value: string | null;
  /** Rendered in a monospace face: serials, CR numbers, masked Iqama. */
  mono?: boolean;
}

export function ProfileHeader({
  name,
  subtitle,
  chips,
  facts,
}: {
  name: string;
  subtitle?: string | null;
  chips?: { label: string; tone: "success" | "warning" | "muted" | "destructive" }[];
  facts: ProfileFact[];
}) {
  const toneClass = {
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/15 text-destructive",
    muted: "bg-muted text-muted-foreground",
  };

  return (
    <section className="flex flex-col gap-4 rounded-xl p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h1 className="text-lg font-semibold">{name}</h1>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {chips && chips.length > 0 ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {chips.map((chip) => (
              <span key={chip.label} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${toneClass[chip.tone]}`}>
                {chip.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.label} className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{fact.label}</dt>
            <dd className={`text-sm ${fact.mono ? "font-mono" : ""}`}>{fact.value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// The figures that answer "where is this person/company up to" — the same
// stat-tile row the admin and contractor overviews use, so the whole app
// counts things in one visual language.
export function ProgressCard({
  title,
  stats,
}: {
  title: string;
  stats: { label: string; value: number | string; tone?: "success" | "warning" | "destructive" }[];
}) {
  const toneClass = {
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1 rounded-xl p-4 ring-1 ring-foreground/10">
            <span className={`text-2xl font-semibold ${stat.tone ? toneClass[stat.tone] : ""}`}>{stat.value}</span>
            <span className="text-xs text-muted-foreground">{stat.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
