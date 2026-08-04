const STATUS_COLORS: Record<string, string> = {
  draft: "#9ca3af",
  submitted: "#60a5fa",
  info_requested: "#fbbf24",
  rejected: "#ef4444",
  payment_pending: "#f97316",
  ready_for_scheduling: "#a78bfa",
  scheduled: "#38bdf8",
  completed: "#22c55e",
};

export interface StackedStatusItem {
  status: string;
  label: string;
  value: number;
}

// Single stacked bar + legend, all statuses always represented (even at 0
// width they still appear in the legend, since callers pass the full set).
export function StackedStatusBar({ items }: { items: StackedStatusItem[] }) {
  const total = items.reduce((sum, i) => sum + i.value, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-6 w-full overflow-hidden rounded-full bg-muted">
        {items.map((item) => {
          const pct = total > 0 ? (item.value / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <div
              key={item.status}
              style={{ width: `${pct}%`, backgroundColor: STATUS_COLORS[item.status] ?? "#741a2a" }}
              title={`${item.label}: ${item.value}`}
            />
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {items.map((item) => (
          <li key={item.status} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[item.status] ?? "#741a2a" }} />
            {item.label} · {item.value}
          </li>
        ))}
      </ul>
    </div>
  );
}
