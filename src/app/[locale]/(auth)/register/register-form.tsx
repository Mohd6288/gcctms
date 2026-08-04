"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { registerCompanyAction } from "@/modules/companies/actions";

const REGIONS = ["North", "South", "East", "West", "Central"] as const;
const CONTRACTOR_CATEGORIES = ["Distribution", "Transmission"] as const;

const initialState = {
  name: "",
  crNumber: "",
  vatNumber: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  city: "",
  address: "",
  sector: "",
  region: "Central" as (typeof REGIONS)[number],
  contractorCategory: "" as (typeof CONTRACTOR_CATEGORIES)[number] | "",
  password: "",
};

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

export function RegisterForm() {
  const t = useTranslations("auth.register");
  const router = useRouter();
  const [form, setForm] = useState(initialState);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof typeof initialState>(key: K, value: (typeof initialState)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await registerCompanyAction({ ...form, contractorCategory: form.contractorCategory || undefined });

      // contractor_manager never needs MFA — straight to the dashboard.
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: form.contactEmail,
        password: form.password,
      });
      if (signInError) {
        setError(t("genericError"));
        return;
      }
      router.push("/dashboard");
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="name">{t("companyNameLabel")}</Label>
            <Input id="name" required value={form.name} onChange={(e) => update("name", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="crNumber">{t("crNumberLabel")}</Label>
            <Input id="crNumber" required value={form.crNumber} onChange={(e) => update("crNumber", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vatNumber">{t("vatNumberLabel")}</Label>
            <Input id="vatNumber" value={form.vatNumber} onChange={(e) => update("vatNumber", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contactName">{t("contactNameLabel")}</Label>
            <Input id="contactName" required value={form.contactName} onChange={(e) => update("contactName", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contactEmail">{t("contactEmailLabel")}</Label>
            <Input
              id="contactEmail"
              type="email"
              autoComplete="email"
              required
              value={form.contactEmail}
              onChange={(e) => update("contactEmail", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contactPhone">{t("contactPhoneLabel")}</Label>
            <Input id="contactPhone" required value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="city">{t("cityLabel")}</Label>
            <Input id="city" value={form.city} onChange={(e) => update("city", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="address">{t("addressLabel")}</Label>
            <Input id="address" value={form.address} onChange={(e) => update("address", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sector">{t("sectorLabel")}</Label>
            <Input id="sector" required value={form.sector} onChange={(e) => update("sector", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="region">{t("regionLabel")}</Label>
            <select id="region" required className={selectClassName} value={form.region} onChange={(e) => update("region", e.target.value as (typeof REGIONS)[number])}>
              {REGIONS.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="contractorCategory">{t("contractorCategoryLabel")}</Label>
            <select
              id="contractorCategory"
              className={selectClassName}
              value={form.contractorCategory}
              onChange={(e) => update("contractorCategory", e.target.value as (typeof CONTRACTOR_CATEGORIES)[number] | "")}
            >
              <option value="">{t("contractorCategoryNone")}</option>
              {CONTRACTOR_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="password">{t("passwordLabel")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
          <div className="flex flex-col gap-3 sm:col-span-2">
            <Button type="submit" disabled={loading}>
              {loading ? t("submitting") : t("submit")}
            </Button>
            <Link href="/sign-in" className="text-center text-sm text-muted-foreground hover:underline">
              {t("signInLink")}
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
