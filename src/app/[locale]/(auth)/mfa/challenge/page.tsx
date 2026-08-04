import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getContext, hasVerifiedTotpFactor } from "@/modules/platform/auth/service";
import { MfaChallengeForm } from "./mfa-challenge-form";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function MfaChallengePage({
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

  // Nothing to challenge without a verified factor yet — send to enroll
  // instead of rendering a form that can never succeed.
  if (!(await hasVerifiedTotpFactor())) {
    redirect({ href: "/mfa/enroll", locale });
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <MfaChallengeForm />
    </div>
  );
}
