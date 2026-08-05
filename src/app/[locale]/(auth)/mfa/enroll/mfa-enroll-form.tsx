"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { isRole, roleHomePath } from "@/modules/platform/auth/shared";

export function MfaEnrollForm() {
  const t = useTranslations("auth.mfaEnroll");
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.mfa.enroll({ factorType: "totp" }).then(({ data, error: enrollError }) => {
      if (enrollError || !data) {
        setError(t("genericError"));
        return;
      }
      setFactorId(data.id);
      setQrCodeSvg(data.totp.qr_code);
      setSecret(data.totp.secret);
    });
    // Enrolling multiple times (e.g. on remount) leaves earlier unverified
    // factors behind — acceptable for now, cleanup is not wired up here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!factorId) return;
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (verifyError) {
        setError(t("genericError"));
        return;
      }

      const { data: claimsData } = await supabase.auth.getClaims();
      const role = claimsData?.claims.user_role;
      router.push(isRole(role) ? roleHomePath(role) : "/sign-in");
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
      <CardContent className="flex flex-col gap-4">
        {qrCodeSvg ? (
          // Inline SVG, not a data: URI img src — some mobile/in-app
          // browsers refuse or mis-render data: URI images depending on
          // security policy; the markup comes straight from Supabase's own
          // API response, not user input, so this is safe.
          <div className="mx-auto h-[200px] w-[200px]" dangerouslySetInnerHTML={{ __html: qrCodeSvg }} />
        ) : null}
        {secret ? (
          <p className="text-center text-xs text-muted-foreground">
            {t("secretFallback")} <span className="font-mono">{secret}</span>
          </p>
        ) : null}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">{t("codeLabel")}</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={loading || !factorId}>
            {loading ? t("submitting") : t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
