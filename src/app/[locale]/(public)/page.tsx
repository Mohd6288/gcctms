import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");
  const otherLocale = locale === "ar" ? "en" : "ar";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-background px-6 py-24 text-center">
      <div className="flex max-w-2xl flex-col items-center gap-4">
        <span className="text-sm font-medium text-muted-foreground">{t("eyebrow")}</span>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {t("title")}
        </h1>
        <p className="text-lg text-muted-foreground">{t("subtitle")}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/sign-in">{t("cta")}</Link>
        </Button>
        <Button asChild variant="secondary" size="lg">
          <Link href="/register">{t("registerCta")}</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/" locale={otherLocale}>
            {t("languageSwitch")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
