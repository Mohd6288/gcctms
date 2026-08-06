import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/modules/platform/auth/service";
import { routing, type Locale } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const context = await requireRole(locale as Locale, "platform_admin");

  return (
    <AppShell role={context.role} region={context.region}>
      {children}
    </AppShell>
  );
}
