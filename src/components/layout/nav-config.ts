// One nav definition per role, shared by the desktop sidebar and the mobile
// drawer (mirrors the validated prototype's components/layout/nav-config.ts).
// Labels are i18n keys under "nav.items", not literals — this app is bilingual.
import {
  Award,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  CreditCard,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/modules/platform/auth/shared";

export interface NavItem {
  key: string;
  href: string;
  icon: LucideIcon;
  // Section roots match by prefix so detail pages keep the parent highlighted;
  // `end` forces exact match for a portal home that prefixes everything else.
  end?: boolean;
}

export const NAV_CONFIG: Record<Role, NavItem[]> = {
  contractor_manager: [
    { key: "dashboard", href: "/dashboard", icon: LayoutDashboard, end: true },
    { key: "requests", href: "/dashboard/requests", icon: FileText },
    { key: "training", href: "/dashboard/training", icon: CalendarRange },
    { key: "employees", href: "/dashboard/employees", icon: Users },
    { key: "payments", href: "/dashboard/payments", icon: CreditCard },
    { key: "certificates", href: "/dashboard/certificates", icon: Award },
    { key: "profile", href: "/dashboard/profile", icon: Building2 },
  ],
  platform_admin: [
    { key: "overview", href: "/admin", icon: LayoutDashboard, end: true },
    { key: "requests", href: "/admin/requests", icon: ClipboardList },
    { key: "payments", href: "/admin/payments", icon: CreditCard },
    { key: "scheduling", href: "/admin/scheduling", icon: CalendarRange },
    { key: "calendar", href: "/admin/calendar", icon: CalendarDays },
    { key: "classes", href: "/admin/classes", icon: BookOpen },
    { key: "companies", href: "/admin/companies", icon: Building2 },
    { key: "employees", href: "/admin/employees", icon: Users },
    { key: "reports", href: "/admin/reports", icon: BarChart3 },
  ],
  super_admin: [
    { key: "overview", href: "/superadmin", icon: LayoutDashboard, end: true },
    { key: "catalog", href: "/superadmin/catalog", icon: Settings },
    { key: "centers", href: "/superadmin/centers", icon: Building2 },
    { key: "exams", href: "/superadmin/exams", icon: FileText },
    { key: "trainers", href: "/superadmin/trainers", icon: GraduationCap },
    { key: "users", href: "/superadmin/users", icon: ShieldCheck },
  ],
  trainer: [
    { key: "overview", href: "/trainer", icon: LayoutDashboard, end: true },
    { key: "classes", href: "/trainer/classes", icon: BookOpen },
  ],
};
