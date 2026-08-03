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

const initialState = {
  name: "",
  crNumber: "",
  vatNumber: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  city: "",
  address: "",
  password: "",
};

export function RegisterForm() {
  const t = useTranslations("auth.register");
  const router = useRouter();
  const [form, setForm] = useState(initialState);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof typeof initialState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await registerCompanyAction(form);

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
