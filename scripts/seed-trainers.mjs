#!/usr/bin/env node
// Seeds the trainer roster and each trainer's course competencies from
// scripts/trainers.json, extracted from files_TMS/tainers.xlsx (13 profile
// sheets, one per trainer).
//
// Records only — no Supabase auth accounts. trainers.user_id stays null
// until someone is actually onboarded through the superadmin screen, which
// is what provisions the login and the MFA enrolment trainers require.
//
// Idempotent, matched on email: re-running updates the name/phone and
// re-syncs competencies rather than duplicating anyone. Safe to run on every
// deploy alongside seed-catalog.mjs.
//
// Usage: DATABASE_URL=<pooler connection string> npx tsx scripts/seed-trainers.mjs
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import * as catalogSchema from "../src/db/schema/catalog.ts";
import * as authSchema from "../src/db/schema/auth.ts";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = postgres(DATABASE_URL, { prepare: false });
const db = drizzle(client, { schema: { ...catalogSchema, ...authSchema } });
const { courses } = catalogSchema;
const { trainers } = authSchema;

const ROSTER = JSON.parse(readFileSync(new URL("./trainers.json", import.meta.url), "utf8"));

async function main() {
  // Course codes are not unique on their own — several exist once per
  // contractor category (see 0018_courses_code_category_unique.sql). The
  // trainer roster isn't category-scoped, so a trainer listed for a code
  // that exists in both tracks is qualified for both.
  const courseRows = await db.select({ id: courses.id, code: courses.code }).from(courses);
  const idsByCode = new Map();
  for (const c of courseRows) idsByCode.set(c.code, [...(idsByCode.get(c.code) ?? []), c.id]);

  let inserted = 0;
  let updated = 0;
  let links = 0;
  const missingCodes = new Set();

  for (const t of ROSTER) {
    const email = t.email?.trim();
    if (!email) {
      console.warn(`skipping ${t.fullName}: no email to match on`);
      continue;
    }

    const [existing] = await db
      .select({ id: trainers.id })
      .from(trainers)
      .where(sql`lower(${trainers.email}) = ${email.toLowerCase()}`);

    let trainerId = existing?.id;
    if (trainerId) {
      await db.update(trainers).set({ fullName: t.fullName, phone: t.phone }).where(eq(trainers.id, trainerId));
      updated++;
    } else {
      const [row] = await db
        .insert(trainers)
        .values({ fullName: t.fullName, email, phone: t.phone, active: true })
        .returning({ id: trainers.id });
      trainerId = row.id;
      inserted++;
    }

    const courseIds = [];
    for (const code of t.courseCodes) {
      const ids = idsByCode.get(code);
      if (!ids) {
        missingCodes.add(code);
        continue;
      }
      courseIds.push(...ids);
    }

    // Re-sync rather than append: the workbook is the source of truth, so a
    // competency removed there should disappear here too.
    if (courseIds.length > 0) {
      await db.execute(
        sql`delete from trainer_courses where trainer_id = ${trainerId} and course_id not in ${sql`(${sql.join(courseIds.map((id) => sql`${id}`), sql`, `)})`}`
      );
      for (const courseId of courseIds) {
        await db.execute(
          sql`insert into trainer_courses (trainer_id, course_id) values (${trainerId}, ${courseId}) on conflict do nothing`
        );
      }
      links += courseIds.length;
    } else {
      await db.execute(sql`delete from trainer_courses where trainer_id = ${trainerId}`);
    }
  }

  console.log(`Trainers: ${inserted} inserted, ${updated} updated. Competency links: ${links}.`);
  if (missingCodes.size > 0) {
    console.warn(`Course codes not in the catalog (skipped): ${[...missingCodes].join(", ")}`);
  }
  await client.end();
}

await main();
