"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function CitiesManager({ cities, locale }: { cities: City[]; locale: string }) {
  const t = useTranslations("superadmin.cities");
  const router = useRouter();
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
      } catch (err) {
        setError(err instanceof Error ? err.message : t("genericError"));
      }
    });
  }

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
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("createTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="city-name">{t("nameLabel")}</Label>
              <Input id="city-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="city-name-ar">{t("nameArLabel")}</Label>
              {/* Required, not optional: a blank Arabic name renders as
                  English in the Arabic locale, which is how the course
                  catalog ended up with English title_ar placeholders. */}
              <Input id="city-name-ar" required dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="city-region">{t("regionLabel")}</Label>
              <select
                id="city-region"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                value={region}
                onChange={(e) => setRegion(e.target.value as Region)}
              >
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={pending || !name || !nameAr}>
              {pending ? t("submitting") : t("submit")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="min-w-0 flex-1 overflow-x-auto rounded-xl ring-1 ring-foreground/10">
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
