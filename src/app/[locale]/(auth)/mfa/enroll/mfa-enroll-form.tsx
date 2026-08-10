"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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
  // Enrollment must happen exactly once per mount. React StrictMode invokes
  // effects twice in development, and the two runs raced each other: both
  // cleared the stale factor, both called enroll(), and the loser came back
  // with mfa_factor_name_conflict. The result was a page showing a perfectly
  // good QR code *and* an error under it, on first load, before the user had
  // typed anything. A ref, not state — it has to be set synchronously,
  // before the second invocation reads it.
  const enrollmentStarted = useRef(false);

  useEffect(() => {
    if (enrollmentStarted.current) return;
    enrollmentStarted.current = true;
    const supabase = createClient();
    async function startEnrollment() {
      // A prior unverified attempt (page refresh, tab switch back to grab
      // the phone, anything) leaves a factor behind with the same default
      // friendly name — enroll() then fails outright with
      // mfa_factor_name_conflict, not just "leaves clutter". Clear any
      // unverified TOTP factor first so remounting this page always works.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      const stale = existing?.all.filter((f) => f.factor_type === "totp" && f.status === "unverified") ?? [];
      await Promise.all(stale.map((f) => supabase.auth.mfa.unenroll({ factorId: f.id })));

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (enrollError || !data) {
        // Its own message: "Could not verify the code" is nonsense on a page
        // where nothing has been entered yet, and it sent people looking for
        // a mistake they had not made.
        setError(t("enrollError"));
        return;
      }
      setError(null);
      setFactorId(data.id);
      setQrCodeSvg(data.totp.qr_code);
      setSecret(data.totp.secret);
    }
    startEnrollment();
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
          // Supabase returns totp.qr_code as a data: URI
          // ("data:image/svg+xml;utf-8,<svg…>"), NOT bare markup. Injecting
          // it as innerHTML printed the "data:image/svg+xml;utf-8," prefix
          // as visible text above the code and pushed the manual-entry
          // fallback underneath the image — which is what every admin and
          // trainer saw on the one screen standing between them and their
          // first sign-in.
          //
          // Rendered as an <img> when it is a URI, still inlined when it is
          // markup, so a change at Supabase's end degrades rather than
          // breaks. next/image is no use here: the source is a data URI with
          // nothing to optimise.
          qrCodeSvg.trim().startsWith("data:") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrCodeSvg} alt={t("qrAlt")} width={200} height={200} className="mx-auto size-[200px]" />
          ) : (
            <div className="mx-auto size-[200px] [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qrCodeSvg }} />
          )
        ) : null}
        {secret ? (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-border p-2">
            <span className="text-xs text-muted-foreground">{t("secretFallback")}</span>
            <span className="break-all text-center font-mono text-xs">{secret}</span>
          </div>
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
