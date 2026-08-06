"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { setAdminRegionAction } from "@/modules/scheduling/actions";

const REGIONS = ["North", "South", "East", "West", "Central"] as const;
type Region = (typeof REGIONS)[number];

export function RegionSelect({ adminUserId, currentRegion }: { adminUserId: string; currentRegion: string | null }) {
  const t = useTranslations("superadmin.users");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(value: string) {
    setError(null);
    setLoading(true);
    try {
      await setAdminRegionAction({ adminUserId, region: value ? (value as Region) : null });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("regionError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        value={currentRegion ?? ""}
        disabled={loading}
        onChange={(e) => handleChange(e.target.value)}
      >
        <option value="">{t("regionUnassigned")}</option>
        {REGIONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
