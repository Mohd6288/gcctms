"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { isMfaBypassEmail, isRole, mfaRequiredFor, roleHomePath } from "@/modules/platform/auth/shared";

// Reached via an invite or password-recovery email link — the Supabase
// browser client auto-detects the session from the URL on load (SDK
// default `detectSessionInUrl`), so by the time the user submits this form
// a session cookie is already set. No dedicated callback route needed.
export function SetPasswordForm() {
  const t = useTranslations("auth.setPassword");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t("mismatch"));
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(t("invalidLink"));
        return;
      }

      const { data: claimsData } = await supabase.auth.getClaims();
      const role = claimsData?.claims.user_role;
      const email = claimsData?.claims.email;
      const bypassMfa = typeof email === "string" && isMfaBypassEmail(email);

      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!bypassMfa && aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
        router.push("/mfa/challenge");
        return;
      }

      if (!isRole(role)) {
        setError(t("invalidLink"));
        return;
      }

      if (!bypassMfa && mfaRequiredFor(role)) {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const hasVerifiedTotp = factors?.totp.some((f) => f.status === "verified") ?? false;
        if (!hasVerifiedTotp) {
          router.push("/mfa/enroll");
          return;
        }
      }

      router.push(roleHomePath(role));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">{t("passwordLabel")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmPassword">{t("confirmPasswordLabel")}</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={loading}>
            {loading ? t("submitting") : t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
