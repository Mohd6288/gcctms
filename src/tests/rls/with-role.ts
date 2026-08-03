import { sql } from "drizzle-orm";
import { db } from "../../db";

// Shared by every tests/rls/*.test.ts file: runs `fn` as Postgres role
// "authenticated" with `claims` injected into request.jwt.claims (the same
// thing auth.jwt()/auth_role()/auth_company_id() read in every RLS policy),
// inside a transaction that always rolls back — so RLS-violating writes
// never need manual cleanup and can't corrupt state between tests.

export class Rollback extends Error {}

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function withRole<T>(claims: Record<string, unknown>, fn: (tx: Tx) => Promise<T>): Promise<T> {
  let captured: T | undefined;
  let capturedError: unknown;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local role authenticated`);
      await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`);
      try {
        captured = await fn(tx);
      } catch (e) {
        capturedError = e;
      }
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  if (capturedError) throw capturedError;
  return captured as T;
}
