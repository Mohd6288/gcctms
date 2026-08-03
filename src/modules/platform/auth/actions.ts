"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/db";
import { profiles, trainers } from "@/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, getContext } from "./service";

// super_admin creates super_admin/platform_admin/trainer login accounts
// directly (manage_users). Activating contractor accounts is a distinct,
// platform_admin-owned action (deferred — see roles-and-workflows.md's CR
// verification note) and is deliberately NOT handled here.
const CreatePrivilegedAccountInput = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  role: z.enum(["super_admin", "platform_admin", "trainer"]),
});

export type CreatePrivilegedAccountInput = z.infer<typeof CreatePrivilegedAccountInput>;

export async function createPrivilegedAccount(input: CreatePrivilegedAccountInput) {
  const context = await getContext();
  if (!authorize("manage_users", context)) {
    throw new Error("Not authorized");
  }

  const { email, fullName, role } = CreatePrivilegedAccountInput.parse(input);

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
    throw new Error(error?.message ?? "Failed to create user");
  }

  let trainerId: number | null = null;
  if (role === "trainer") {
    const [trainer] = await db
      .insert(trainers)
      .values({ userId: data.user.id, fullName })
      .returning({ id: trainers.id });
    trainerId = trainer.id;
  }

  await db.insert(profiles).values({ userId: data.user.id, role, fullName, trainerId });

  return { email, tempPassword };
}
