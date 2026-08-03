import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Button } from "@/components/ui/button";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function ContractorDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm text-muted-foreground">
        Training requests/payments/certificates screens land in later phases.
      </p>
      <Button asChild variant="outline">
        <Link href="/dashboard/employees">Manage employees</Link>
      </Button>
    </div>
  );
}
