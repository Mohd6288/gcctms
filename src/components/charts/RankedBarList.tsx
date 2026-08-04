"use client";

import { useState } from "react";

const BRAND = "#741a2a";
const VISIBLE_CAP = 8;

export interface RankedBarListItem {
  label: string;
  sublabel?: string;
  value: number;
  displayValue: string;
}

// Sorted by value descending, capped to the top 8 with an expand toggle —
// unlike BarList, which the caller keeps in a stable (e.g. catalog) order
// on purpose.
export function RankedBarList({ items }: { items: RankedBarListItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const visible = expanded ? sorted : sorted.slice(0, VISIBLE_CAP);
  const max = Math.max(...sorted.map((i) => i.value), 1);

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {visible.map((item) => {
          const widthPct = Math.max((item.value / max) * 100, item.value > 0 ? 3 : 0);
          return (
            <li key={item.label} className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 truncate text-muted-foreground" title={item.label}>
                {item.label}
                {item.sublabel ? <span className="block truncate text-xs">{item.sublabel}</span> : null}
              </span>
              <span className="relative h-5 flex-1 overflow-hidden rounded-sm bg-muted">
                <span className="absolute inset-y-0 start-0 rounded-r-sm" style={{ width: `${widthPct}%`, backgroundColor: BRAND }} />
              </span>
              <span className="w-20 shrink-0 text-end font-medium">{item.displayValue}</span>
            </li>
          );
        })}
      </ul>
      {sorted.length > VISIBLE_CAP ? (
        <button type="button" className="self-start text-xs text-primary hover:underline" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Show top 8" : `View all ${sorted.length}`}
        </button>
      ) : null}
    </div>
  );
}
