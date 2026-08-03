// platform/audit — Append-only audit_log writer — every state transition and privileged action logs here.
import "server-only";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

export interface WriteAuditInput {
  userId: string | null;
  entityType: string;
  entityId: number;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
}

// audit_log has no INSERT policy for 'authenticated' at all (see
// 0014_audit_log.sql) — writes only ever happen through this server-only
// function using the Drizzle superuser connection.
export async function writeAudit(input: WriteAuditInput): Promise<void> {
  await db.insert(auditLog).values({
    userId: input.userId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    note: input.note ?? null,
  });
}
