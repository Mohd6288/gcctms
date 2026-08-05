// platform/auth — Session context (getContext()), authorize(capability, context), permission matrix.
import "server-only";
import { desc, ne } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { isMfaBypassEmail, isRole, mfaRequiredFor, roleHomePath, type AuthContext, type Role } from "./shared";

export {
  ROLES,
  roleHomePath,
  mfaRequiredFor,
  authorize,
  type Role,
  type Capability,
  type AuthContext,
} from "./shared";

// next-intl's redirect() throws internally (Next.js's redirect mechanism),
// so this line never actually returns — the `throw` after it exists only so
// TypeScript narrows types correctly at every call site below.
function redirectTo(href: string, locale: Locale): never {
  redirect({ href, locale });
  throw new Error("unreachable");
}

// Resolves the current session's role/company_id/trainer_id from the JWT's
// custom claims (set by the custom_access_token_hook migration — see
// database-schema.md's Auth bridge). Returns null if unauthenticated or if
// no profile has been provisioned yet (no user_role claim).
export async function getContext(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;

  const claims = data.claims as Record<string, unknown>;
  const role = claims.user_role;
  if (!isRole(role)) return null;

  return {
    userId: claims.sub as string,
    role,
    companyId: claims.company_id != null ? Number(claims.company_id) : null,
    trainerId: claims.trainer_id != null ? Number(claims.trainer_id) : null,
    aal: claims.aal === "aal2" ? "aal2" : "aal1",
  };
}

async function getSessionEmail(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = (data?.claims as Record<string, unknown> | undefined)?.email;
  return typeof email === "string" ? email : null;
}

// Server-side route guard for a role-restricted layout: redirects
// unauthenticated users to sign-in, wrong-role users to their own area, and
// (for roles that require it) unchallenged sessions to the MFA gate. This is
// the enforcement layer that makes MFA un-skippable — closing the tab after
// password login and navigating straight to a privileged URL still lands
// here.
export async function requireRole(locale: Locale, allowed: Role | readonly Role[]): Promise<AuthContext> {
  const context = await getContext();
  if (!context) {
    redirectTo("/sign-in", locale);
  }

  const allowedRoles = Array.isArray(allowed) ? allowed : [allowed];
  if (!allowedRoles.includes(context.role)) {
    redirectTo(roleHomePath(context.role), locale);
  }

  if (mfaRequiredFor(context.role) && context.aal !== "aal2") {
    const email = await getSessionEmail();
    if (email && isMfaBypassEmail(email)) {
      return context;
    }
    // A verified factor exists but this session hasn't been challenged yet
    // -> /mfa/challenge. No verified factor at all (never enrolled) ->
    // /mfa/enroll, which /mfa/challenge itself cannot recover from.
    const hasVerifiedTotp = await hasVerifiedTotpFactor();
    redirectTo(hasVerifiedTotp ? "/mfa/challenge" : "/mfa/enroll", locale);
  }

  return context;
}

// Whether the current session's user already has a verified TOTP factor.
// /mfa/enroll and /mfa/challenge each need this to redirect to the OTHER
// page if landed on directly (bookmark, back button, stale link) — Supabase
// rejects a second enroll attempt once a factor is verified (factor-name
// conflict), and a challenge against zero verified factors has nothing to
// challenge.
export async function hasVerifiedTotpFactor(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  return data?.totp.some((f) => f.status === "verified") ?? false;
}

// Non-contractor accounts (super_admin/platform_admin/trainer) — the roster
// the superadmin user-management screen (manage_users) lists. Caller must
// have already checked authorize("manage_users", context).
export async function listPrivilegedAccounts() {
  return db
    .select({
      userId: profiles.userId,
      role: profiles.role,
      fullName: profiles.fullName,
      active: profiles.active,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(ne(profiles.role, "contractor_manager"))
    .orderBy(desc(profiles.createdAt));
}
