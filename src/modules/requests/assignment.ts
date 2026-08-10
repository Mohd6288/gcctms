// requests/assignment — who is actually doing a request.
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

// Region scoping decides who may SEE a request. It never decided who was
// DOING one, so with several admins in a region two could pick up the same
// request, or all of them could assume somebody else had.
//
// Assignment is ownership laid on top of visibility, never a second access
// rule: an unassigned request, or one assigned to a colleague, stays fully
// visible and actionable to every admin in the region. The name is there so
// the work has an owner, not to lock anyone out.
const OPEN_STATUSES = ["submitted", "info_requested", "payment_pending", "ready_for_scheduling"] as const;

// The admin in this region holding the fewest open requests. Ties break on
// who was assigned to the region first, so the choice is deterministic and a
// test can assert it.
//
// Returns null when the region has nobody assigned — a real state, not an
// error. A region with no admin must not block a contractor from submitting;
// the request simply arrives unowned and the queue says so.
export async function pickAdminForRegion(region: string | null): Promise<string | null> {
  if (!region) return null;

  const rows = (await db.execute(sql`
    select raa.admin_user_id
      from regional_admin_assignments raa
      join profiles p on p.user_id = raa.admin_user_id
     where raa.region = ${region}
       and p.role = 'platform_admin'
       and p.active
     order by (
       select count(*)::int
         from training_requests tr
        where tr.assigned_admin_user_id = raa.admin_user_id
          and tr.status in ('submitted', 'info_requested', 'payment_pending', 'ready_for_scheduling')
     ) asc,
     raa.assigned_at asc
     limit 1
  `)) as unknown as Array<{ admin_user_id: string }>;

  return rows[0]?.admin_user_id ?? null;
}

export const OPEN_REQUEST_STATUSES = OPEN_STATUSES;
