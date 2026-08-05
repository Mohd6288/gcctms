"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { isMfaBypassEmail, isRole, mfaRequiredFor, roleHomePath } from "@/modules/platform/auth/shared";

export function SignInForm() {
  const t = useTranslations("auth.signIn");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      console.error("[signin DEBUG] signIn done, error=", signInError);
      if (signInError) {
        setError(signInError.code === "invalid_credentials" ? t("invalidCredentials") : t("genericError"));
        return;
      }

      const bypassMfa = isMfaBypassEmail(email);
      console.error("[signin DEBUG] bypassMfa=", bypassMfa, "email=", email);

      // A verified MFA factor already exists — this session needs a
      // challenge before it reaches aal2, regardless of role.
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      console.error("[signin DEBUG] aal=", aal);
      if (!bypassMfa && aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
        console.error("[signin DEBUG] -> pushing /mfa/challenge");
        router.push("/mfa/challenge");
        return;
      }

      const { data: claimsData } = await supabase.auth.getClaims();
      const role = claimsData?.claims.user_role;
      console.error("[signin DEBUG] role=", role);
      if (!isRole(role)) {
        console.error("[signin DEBUG] -> invalid role, setting genericError");
        setError(t("genericError"));
        return;
      }

      if (!bypassMfa && mfaRequiredFor(role)) {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const hasVerifiedTotp = factors?.totp.some((f) => f.status === "verified") ?? false;
        console.error("[signin DEBUG] hasVerifiedTotp=", hasVerifiedTotp);
        if (!hasVerifiedTotp) {
          console.error("[signin DEBUG] -> pushing /mfa/enroll");
          router.push("/mfa/enroll");
          return;
        }
      }

      console.error("[signin DEBUG] -> pushing role home", roleHomePath(role));
      router.push(roleHomePath(role));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">{t("emailLabel")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">{t("passwordLabel")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
