import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/modules/platform/auth/service";
import { routing, type Locale } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Read-only oversight portal. requireRole gates on the auditor role and the
// aal2 MFA bar it shares with every other privileged role.
export default async function AuditorLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const context = await requireRole(locale as Locale, "auditor");

  return <AppShell role={context.role}>{children}</AppShell>;
}
