import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { RegisterForm } from "./register-form";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <RegisterForm />
    </div>
  );
}
