"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { resetUserMfa, resetUserPassword } from "@/modules/platform/auth/actions";

// Recovery for accounts the super_admin manages — used by both the users
// screen and the trainer roster, since a trainer is exactly the account most
// likely to need it (they sign in rarely and enrol MFA on a phone).
//
// Keeps the "superadmin.users" namespace after the move: the strings are
// account-generic and re-keying them would churn both locales for nothing.
//
// Without these, an admin or
// trainer who loses their temporary password — or reinstalls their
// authenticator, which Supabase treats as permanent since it refuses a
// second enrolment while a verified factor exists — is locked out for good
// with no way back from any screen.
export function AccountActions({ userId, fullName }: { userId: string; fullName: string }) {
  const t = useTranslations("superadmin.users");
  const [pending, startTransition] = useTransition();
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"password" | "mfa" | null>(null);

  function run(work: () => Promise<void>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        await work();
        setConfirming(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("genericError"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      {confirming === null ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setConfirming("password")}>
            {t("resetPassword")}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setConfirming("mfa")}>
            {t("resetMfa")}
          </Button>
        </div>
      ) : (
        // Both actions invalidate something the user is currently relying on,
        // so neither fires on a single stray click.
        <div className="flex flex-col gap-1.5 rounded-md border border-border p-2">
          <p className="text-xs">
            {confirming === "password" ? t("confirmResetPassword", { name: fullName }) : t("confirmResetMfa", { name: fullName })}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  if (confirming === "password") {
                    const { tempPassword: next } = await resetUserPassword({ userId });
                    setTempPassword(next);
                  } else {
                    const { cleared } = await resetUserMfa({ userId });
                    setNotice(t("mfaCleared", { count: cleared }));
                  }
                })
              }
            >
              {pending ? t("submitting") : t("confirm")}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}

      {tempPassword ? (
        <div className="rounded-md bg-muted/60 p-2 text-xs">
          <p className="text-muted-foreground">{t("successTempPassword")}</p>
          <p className="mt-0.5 font-mono">{tempPassword}</p>
        </div>
      ) : null}
      {notice ? <p className="text-xs text-success">{notice}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
