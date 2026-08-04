import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getContext, hasVerifiedTotpFactor } from "@/modules/platform/auth/service";
import { MfaEnrollForm } from "./mfa-enroll-form";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function MfaEnrollPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const context = await getContext();
  if (!context) {
    redirect({ href: "/sign-in", locale });
  }

  // Landing here directly (bookmark, back button) with a verified factor
  // already on the account isn't recoverable — Supabase rejects a second
  // enroll with a factor-name conflict, and the QR/secret never render.
  if (await hasVerifiedTotpFactor()) {
    redirect({ href: "/mfa/challenge", locale });
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <MfaEnrollForm />
    </div>
  );
}
