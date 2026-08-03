import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function SuperAdminHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm text-muted-foreground">
        Platform overview (cross-company/cross-region stats) and catalog/pricing CRUD land in
        Phase 3.
      </p>
      <Button asChild variant="outline">
        <Link href="/superadmin/users">Manage admin &amp; trainer accounts</Link>
      </Button>
    </div>
  );
}
