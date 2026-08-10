"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

// The one recovery path that works when nobody can help you — a super_admin
// locked out of their own account can't be reset by anyone else, since
// resetting another user's password is itself a super_admin action.
//
// The email lands on /set-password, which already handles the recovery
// session (the browser client picks it up from the URL).
export function ForgotPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations("auth.forgotPassword");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/${locale}/set-password`,
      });
    } finally {
      // Always the same confirmation, regardless of outcome: telling the
      // visitor whether an address is registered would turn this form into
      // an account-existence oracle for a platform whose users are named
      // individuals.
      setSent(true);
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {sent ? (
          <>
            <p className="text-sm">{t("sent")}</p>
            <p className="text-xs text-muted-foreground">{t("sentHint")}</p>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{t("intro")}</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">{t("emailLabel")}</Label>
              <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? t("submitting") : t("submit")}
            </Button>
          </form>
        )}
        <Link href="/sign-in" className="text-xs text-primary hover:underline">
          {t("backToSignIn")}
        </Link>
      </CardContent>
    </Card>
  );
}
