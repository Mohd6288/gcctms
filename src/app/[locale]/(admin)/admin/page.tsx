import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Button } from "@/components/ui/button";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function AdminHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm text-muted-foreground">Trainer portal, certificates, and reports land in later phases.</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild variant="outline">
          <Link href="/admin/requests">Review queue</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/payments">Payment verification</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/scheduling">Scheduling board</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/calendar">Calendar</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/classes">Classes</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/companies">Company directory</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/employees">Employee browser</Link>
        </Button>
      </div>
    </div>
  );
}
