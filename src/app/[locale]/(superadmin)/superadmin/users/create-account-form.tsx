"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPrivilegedAccount } from "@/modules/platform/auth/actions";
import { REGIONS, type Region } from "@/lib/regions";

type PrivilegedRole = "super_admin" | "platform_admin" | "trainer";

export function CreateAccountForm() {
  const t = useTranslations("superadmin.users");
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PrivilegedRole>("platform_admin");
  const [region, setRegion] = useState<Region | "">("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ email: string; tempPassword: string } | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const created = await createPrivilegedAccount({
        email,
        fullName,
        role,
        region: role === "platform_admin" && region ? region : undefined,
      });
      setResult(created);
      setFullName("");
      setEmail("");
      setRegion("");
      router.refresh();
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t("createTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {result ? (
          <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
            <p className="font-medium">{t("successTitle")}</p>
            <p className="mt-1 text-muted-foreground">{t("successTempPassword")}</p>
            <p className="mt-1 font-mono">{result.tempPassword}</p>
          </div>
        ) : null}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fullName">{t("fullNameLabel")}</Label>
            <Input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">{t("emailLabel")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role">{t("roleLabel")}</Label>
            <select
              id="role"
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              value={role}
              onChange={(e) => setRole(e.target.value as PrivilegedRole)}
            >
              <option value="super_admin">{t("roleSuperAdmin")}</option>
              <option value="platform_admin">{t("rolePlatformAdmin")}</option>
              <option value="trainer">{t("roleTrainer")}</option>
            </select>
          </div>
          {/* Assigned here rather than afterwards: an unassigned admin is
              UNSCOPED — they see every region until someone assigns them, so
              creating a batch and assigning later hands out full platform
              visibility in the meantime. */}
          {role === "platform_admin" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="region">{t("regionLabel")}</Label>
              <select
                id="region"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                value={region}
                onChange={(e) => setRegion(e.target.value as Region | "")}
              >
                <option value="">{t("regionAll")}</option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{region ? t("regionScopedHint", { region }) : t("regionAllHint")}</p>
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={loading}>
            {loading ? t("submitting") : t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
