"use client";

// Persistent navigation shell for every signed-in area (contractor, admin,
// super admin, trainer). Client component because the active-link highlight
// and the mobile drawer both need the current pathname / local state; the
// role it renders for is resolved server-side by each layout's requireRole().
import { useState } from "react";
import { Languages, LogOut, Menu, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link, usePathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { signOut } from "@/modules/platform/auth/actions";
import type { Role } from "@/modules/platform/auth/shared";
import { isNavItemActive } from "./nav-active";
import { NAV_CONFIG } from "./nav-config";

export function AppShell({
  role,
  region,
  children,
}: {
  role: Role;
  // Set only for a region-scoped platform_admin (0026_regional_admin_scoping).
  // Surfaced in the topbar so a scoped admin can tell why they're seeing a
  // partial view of the platform rather than assuming data is missing.
  region?: string | null;
  children: React.ReactNode;
}) {
  const t = useTranslations("nav");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const otherLocale = routing.locales.find((l) => l !== locale) ?? locale;

  const navLinks = (onNavigate?: () => void) =>
    NAV_CONFIG[role].map((item) => {
      const active = isNavItemActive(pathname, item);
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            active
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <item.icon className="h-4 w-4 shrink-0" aria-hidden />
          {t(`items.${item.key}`)}
        </Link>
      );
    });

  const brand = (
    <div className="leading-tight">
      <div className="text-sm font-semibold text-primary">GCC Lab</div>
      <div className="text-xs text-muted-foreground">{t(`portal.${role}`)}</div>
    </div>
  );

  return (
    <div className="flex min-h-full flex-1">
      <aside className="hidden w-64 shrink-0 flex-col border-e bg-card lg:flex">
        <div className="flex h-16 items-center border-b px-6">{brand}</div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">{navLinks()}</nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-card/80 px-4 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={t("openMenu")}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="flex-1" />

          {region ? (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              {t("regionScope", { region })}
            </span>
          ) : null}

          <Button asChild variant="ghost" size="sm">
            <Link href={pathname} locale={otherLocale}>
              <Languages className="h-4 w-4" aria-hidden />
              {otherLocale.toUpperCase()}
            </Link>
          </Button>

          <form action={signOut.bind(null, locale)}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{t("signOut")}</span>
            </Button>
          </form>
        </header>

        {mobileOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              aria-label={t("closeMenu")}
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileOpen(false)}
            />
            <div className="absolute inset-y-0 start-0 flex w-72 max-w-[85%] flex-col bg-card shadow-xl">
              <div className="flex h-16 items-center justify-between border-b px-6">
                {brand}
                <Button variant="ghost" size="icon" aria-label={t("closeMenu")} onClick={() => setMobileOpen(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">{navLinks(() => setMobileOpen(false))}</nav>
            </div>
          </div>
        ) : null}

        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
