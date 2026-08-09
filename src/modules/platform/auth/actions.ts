"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/db";
import { profiles, regionalAdminAssignments, trainers } from "@/db/schema";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { authorize, getContext } from "./service";
import { writeAudit } from "@/modules/platform/audit/service";
import { REGIONS } from "@/lib/regions";

// Clears the Supabase session cookies and drops the user back at sign-in.
// scope: "global" so signing out also invalidates the refresh token
// server-side, not just this browser's cookies.
export async function signOut(locale: Locale) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect({ href: "/sign-in", locale });
}

// super_admin creates super_admin/platform_admin/trainer login accounts
// directly (manage_users). Activating contractor accounts is a distinct,
// platform_admin-owned action (deferred — see roles-and-workflows.md's CR
// verification note) and is deliberately NOT handled here.
const CreatePrivilegedAccountInput = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  role: z.enum(["super_admin", "platform_admin", "trainer"]),
  // Assigned in the same call for platform_admin, because an admin with no
  // region is UNSCOPED, not unprivileged — auth_region() being null means
  // "sees every region" (0026_regional_admin_scoping.sql). Creating a batch
  // of admins and assigning regions afterwards would give each of them full
  // platform visibility in the gap.
  region: z.enum(REGIONS).optional(),
});

export type CreatePrivilegedAccountInput = z.infer<typeof CreatePrivilegedAccountInput>;

export async function createPrivilegedAccount(input: CreatePrivilegedAccountInput) {
  const context = await getContext();
  if (!authorize("manage_users", context)) {
    throw new Error("Not authorized");
  }

  const { email, fullName, role, region } = CreatePrivilegedAccountInput.parse(input);
  if (region && role !== "platform_admin") throw new Error("Only a platform admin is scoped to a region.");

  // One-time temporary password, shown once to the super_admin to hand off
  // to the new user — no invite-email acceptance flow in this phase.
  const tempPassword = randomBytes(12).toString("base64url");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(error?.code === "email_exists" ? "An account with this email already exists." : "Could not create account.");
  }

  // Everything after the auth user exists is rolled back on failure. Without
  // this, a failed profile insert left an auth user that CAN sign in but has
  // no role claim, so getContext() returns null and they land in a redirect
  // loop with no way for anyone to fix it from the UI. createTrainer already
  // does this (catalog/service.ts); this is the same pattern.
  try {
    let trainerId: number | null = null;
    if (role === "trainer") {
      const [trainer] = await db
        .insert(trainers)
        .values({ userId: data.user.id, fullName })
        .returning({ id: trainers.id });
      trainerId = trainer.id;
    }

    await db.insert(profiles).values({ userId: data.user.id, role, fullName, trainerId });

    if (region) {
      await db.insert(regionalAdminAssignments).values({ region, adminUserId: data.user.id });
    }

    await writeAudit({ userId: context!.userId, entityType: "profile", entityId: 0, action: "create", note: `${role} ${email}${region ? ` (${region})` : ""}` });
    return { email, tempPassword };
  } catch (err) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw err;
  }
}
