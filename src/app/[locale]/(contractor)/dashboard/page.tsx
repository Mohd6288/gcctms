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
      <p className="text-sm text-muted-foreground">Certificates land in a later phase.</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild variant="outline">
          <Link href="/dashboard/employees">Manage employees</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/requests">Training requests</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/payments">Payments</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/profile">Company profile</Link>
        </Button>
      </div>
    </div>
  );
}
