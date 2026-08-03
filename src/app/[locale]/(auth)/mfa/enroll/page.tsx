import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getContext } from "@/modules/platform/auth/service";
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

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <MfaEnrollForm />
    </div>
  );
}
