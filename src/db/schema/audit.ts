import { bigint, index, inet, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { timestamptz } from "./_helpers";

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id"),
    entityType: text("entity_type").notNull(),
    entityId: bigint("entity_id", { mode: "number" }).notNull(),
    action: text("action").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    note: text("note"),
    ip: inet("ip"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_user_id_idx").on(t.userId),
    index("audit_log_created_at_idx").on(t.createdAt),
    // The composite the filtered activity feed scans (0036).
    index("audit_log_action_created_idx").on(t.action, t.createdAt),
  ]
);
