// directory — who may READ a company's people and history.
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";
import type { AuthContext } from "@/modules/platform/auth/shared";

// The read-side sibling of storage/service.ts's assertCanTouchCompany, which
// it deliberately mirrors rather than extends: that one guards writes and
// must never learn to say yes to an auditor.
//
// Drizzle connects as the owner and bypasses RLS (see db/index.ts), and an
// auditor has no RLS policies at all (0033), so this function is the whole
// enforcement for every profile page below it.
export async function assertCanViewCompany(context: AuthContext | null, companyId: number): Promise<void> {
  if (!context) throw new Error("Not authorized");

  switch (context.role) {
    // Platform-wide oversight is the auditor's entire purpose.
    case "auditor":
    case "super_admin":
      return;
    case "platform_admin": {
      // Unassigned means unrestricted, not "no access" — the same rule the
      // rest of the app has followed since 0026.
      if (!context.region) return;
      const [company] = await db.select({ region: companies.region }).from(companies).where(eq(companies.id, companyId));
      if (company?.region === context.region) return;
      throw new Error("Not authorized");
    }
    case "contractor_manager":
      if (context.companyId === companyId) return;
      throw new Error("Not authorized");
    // A trainer meets employees through their own class screens, which carry
    // their own scoping. They have no business browsing a company directory.
    default:
      throw new Error("Not authorized");
  }
}
