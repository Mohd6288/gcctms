const BRAND = "#741a2a";

export interface BarListItem {
  label: string;
  value: number;
  displayValue: string;
  color?: string;
}

// Plain horizontal bar list — every item always shown (caller decides
// whether to include zero-value rows), self-scales to the largest value
// unless the caller passes a shared maxValue so multiple lists line up.
export function BarList({ items, maxValue }: { items: BarListItem[]; maxValue?: number }) {
  const max = maxValue ?? Math.max(...items.map((i) => i.value), 1);
  const total = items.reduce((sum, i) => sum + i.value, 0);

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        const widthPct = Math.max((item.value / max) * 100, item.value > 0 ? 3 : 0);
        const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
        return (
          <li key={item.label} className="flex items-center gap-3 text-sm">
            <span className="w-24 shrink-0 text-muted-foreground">{item.label}</span>
            <span className="relative h-5 flex-1 overflow-hidden rounded-full bg-muted" title={`${item.displayValue} · ${pct}%`}>
              <span className="absolute inset-y-0 start-0 rounded-full" style={{ width: `${widthPct}%`, backgroundColor: item.color ?? BRAND }} />
            </span>
            <span className="w-20 shrink-0 text-end font-medium">{item.displayValue}</span>
          </li>
        );
      })}
    </ul>
  );
}
