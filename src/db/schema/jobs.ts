import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./_helpers";

export const jobs = pgTable(
  "jobs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAt: timestamptz("run_at").notNull().defaultNow(),
    lastError: text("last_error"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("jobs_status_run_at_idx").on(t.status, t.runAt),
    check("jobs_status_check", sql`${t.status} in ('pending', 'processing', 'completed', 'failed')`),
  ]
);
