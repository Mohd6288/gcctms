"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CREATE_ACTIONS, CREATE_GRID, CreatePanel, useCreatePanelClose } from "@/components/ui/create-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { REGIONS, type Region } from "@/lib/regions";
import { createCityAction, setCityActiveAction } from "@/modules/catalog/actions";

interface City {
  name: string;
  region: string;
  nameAr: string;
  active: boolean;
}

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

// Its own component so it sits *inside* the panel and can therefore close it —
// useCreatePanelClose reads context the panel provides, which the component
// rendering the panel is not itself within.
function AddCityForm() {
  const t = useTranslations("superadmin.cities");
  const router = useRouter();
  const closePanel = useCreatePanelClose();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [region, setRegion] = useState<Region>(REGIONS[0]);
  const [error, setError] = useState<string | null>(null);

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createCityAction({ name, nameAr, region });
        setName("");
        setNameAr("");
        router.refresh();
        closePanel();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("genericError"));
      }
    });
  }

  return (
    <form onSubmit={handleCreate} className={CREATE_GRID}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="city-name">{t("nameLabel")}</Label>
        <Input id="city-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="city-name-ar">{t("nameArLabel")}</Label>
        {/* Required, not optional: a blank Arabic name renders as English in
            the Arabic locale, which is how the course catalog ended up with
            English title_ar placeholders. */}
        <Input id="city-name-ar" required dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="city-region">{t("regionLabel")}</Label>
        <select id="city-region" className={selectClassName} value={region} onChange={(e) => setRegion(e.target.value as Region)}>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className={CREATE_ACTIONS}>
        <Button type="submit" disabled={pending || !name || !nameAr}>
          {pending ? t("submitting") : t("submit")}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </form>
  );
}

export function CitiesManager({ cities, locale }: { cities: City[]; locale: string }) {
  const t = useTranslations("superadmin.cities");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle(city: City) {
    setError(null);
    startTransition(async () => {
      try {
        await setCityActiveAction({ name: city.name, active: !city.active });
        router.refresh();
      } catch {
        setError(t("genericError"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <CreatePanel
        title={t("createTitle")}
        addLabel={t("addAction")}
        cancelLabel={t("cancel")}
        defaultOpen={cities.length === 0}
      >
        <AddCityForm />
      </CreatePanel>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="p-3 text-start font-medium">{t("tableName")}</th>
              <th className="p-3 text-start font-medium">{t("tableRegion")}</th>
              <th className="p-3 text-start font-medium">{t("tableStatus")}</th>
              <th className="p-3 text-start font-medium" />
            </tr>
          </thead>
          <tbody>
            {cities.length === 0 ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={4}>
                  {t("empty")}
                </td>
              </tr>
            ) : (
              cities.map((city) => (
                <tr key={city.name} className="border-b border-border last:border-0">
                  <td className="p-3">{locale === "ar" ? city.nameAr : city.name}</td>
                  <td className="p-3">{city.region}</td>
                  <td className="p-3">{city.active ? t("statusActive") : t("statusInactive")}</td>
                  <td className="p-3">
                    {/* Deactivate, never delete: preferred_city is a foreign
                        key with ON DELETE RESTRICT, so a city with request
                        history cannot be removed — nor should it be. */}
                    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => handleToggle(city)}>
                      {city.active ? t("deactivate") : t("activate")}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
