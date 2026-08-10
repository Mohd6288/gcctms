import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { ForgotPasswordForm } from "./forgot-password-form";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <ForgotPasswordForm locale={locale} />
    </div>
  );
}
