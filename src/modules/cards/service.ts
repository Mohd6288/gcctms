// cards module — steps 9 and 10 of the workflow.
//
// GCC Lab does not print these cards. Its part is to tell the manufacturer who
// passed, record the numbers that come back, and record who physically
// collected each one. Everything here is that and nothing more.
import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  cardDispatches,
  classEnrollments,
  classes,
  companies,
  courses,
  employees,
  manufacturers,
  qualificationCards,
} from "@/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, type AuthContext } from "@/modules/platform/auth/shared";
import { writeAudit } from "@/modules/platform/audit/service";
import { GuardError } from "@/modules/platform/guard-error";
import { queueNotification } from "@/modules/platform/notifications/service";
import { decryptNationalId, maskNationalId } from "@/modules/platform/security/national-id";
import { listPriorAttempts } from "@/modules/assessment/queries";
import { renderPassListPdf } from "./pass-list";
import type { ConfirmSchedulingInput, RecordCardCollectionInput, RecordCardIssuanceInput } from "./schema";

const BUCKET = "card-dispatches";

/**
 * How long the manufacturer's download link lives.
 *
 * Long enough to survive a weekend and a chased email; short enough that a
 * forwarded link is dead before it can be filed somewhere. The list behind it
 * carries unmasked identity numbers, which is the whole reason it is not in
 * the message body.
 */
export const PASS_LIST_LINK_TTL_SECONDS = 72 * 60 * 60;

/**
 * Step 5 — the manufacturer agrees the date.
 *
 * Until this is recorded the schedule is GCC Lab's proposal. That distinction
 * is the whole reason the column exists: telling candidates to travel to a
 * date the manufacturer has not agreed is how a test day is wasted.
 */
export async function confirmManufacturerScheduling(context: AuthContext, input: ConfirmSchedulingInput) {
  if (!authorize("schedule_classes", context)) throw new Error("Not authorized");

  const [cls] = await db.select().from(classes).where(eq(classes.id, input.classId));
  if (!cls) throw new GuardError("That class no longer exists.");

  const [manufacturer] = await db.select().from(manufacturers).where(eq(manufacturers.id, input.manufacturerId));
  if (!manufacturer?.active) throw new GuardError("That manufacturer is not on the active list.");

  await db
    .update(classes)
    .set({
      manufacturerId: input.manufacturerId,
      manufacturerConfirmedAt: input.confirmed ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(classes.id, input.classId));

  await writeAudit({
    userId: context.userId,
    entityType: "class",
    entityId: input.classId,
    action: input.confirmed ? "manufacturer_confirmed" : "manufacturer_unconfirmed",
    note: manufacturer.name,
  });
}

/**
 * Step 6 — the attendance guidelines and the material list, to every candidate.
 *
 * Locked until the manufacturer has confirmed, and refused a second time: the
 * guidelines tell a technician where to be and what to bring, and a second
 * copy of a date that has not changed only invites doubt about which one is
 * right.
 */
export async function sendTestGuidelines(context: AuthContext, classId: number) {
  if (!authorize("schedule_classes", context)) throw new Error("Not authorized");

  const [cls] = await db.select().from(classes).where(eq(classes.id, classId));
  if (!cls) throw new GuardError("That class no longer exists.");
  if (cls.manufacturerConfirmedAt == null) {
    throw new GuardError(
      "The manufacturer has not confirmed this date yet. Until they do it is a proposal, and candidates should not be told to travel to it."
    );
  }
  if (cls.guidelinesSentAt != null) {
    throw new GuardError("The guidelines have already been sent for this class.");
  }

  const [course] = await db.select({ titleEn: courses.titleEn }).from(courses).where(eq(courses.id, cls.courseId));

  // One message per enrolled company, not per technician: the contractor
  // coordinates attendance, arranges the entry permit and brings the
  // materials. Emailing each candidate would send the same instructions to
  // people who cannot act on most of them.
  const enrolments = await db
    .select({ companyId: classEnrollments.companyId })
    .from(classEnrollments)
    .where(eq(classEnrollments.classId, classId));
  const companyIds = [...new Set(enrolments.map((e) => e.companyId))];
  if (companyIds.length === 0) throw new GuardError("Nobody is enrolled in this class yet.");

  for (const companyId of companyIds) {
    const [company] = await db.select({ contactEmail: companies.contactEmail }).from(companies).where(eq(companies.id, companyId));
    if (!company) continue;
    await queueNotification({
      type: "test.guidelines_sent",
      recipientEmail: company.contactEmail,
      data: {
        classId,
        courseTitle: course?.titleEn ?? "",
        testDate: cls.startDate,
        venue: cls.locationNote ?? cls.region,
        locationUrl: cls.locationUrl ?? "",
      },
    });
  }

  await db.update(classes).set({ guidelinesSentAt: new Date(), updatedAt: new Date() }).where(eq(classes.id, classId));
  await writeAudit({
    userId: context.userId,
    entityType: "class",
    entityId: classId,
    action: "send_guidelines",
    note: `${companyIds.length} contractor(s)`,
  });

  return { sentTo: companyIds.length };
}

export async function dispatchPassList(context: AuthContext, classId: number) {
  if (!authorize("approve_certificates", context)) throw new Error("Not authorized");

  const [cls] = await db.select().from(classes).where(eq(classes.id, classId));
  if (!cls) throw new GuardError("That class no longer exists.");

  const [course] = await db
    .select({ titleEn: courses.titleEn, titleAr: courses.titleAr, outcome: courses.outcome })
    .from(courses)
    .where(eq(courses.id, cls.courseId));
  if (course?.outcome !== "card") {
    throw new GuardError("This course awards a GCC Lab certificate, not a manufacturer card — there is no pass list to send.");
  }

  if (cls.manufacturerId == null) {
    throw new GuardError("No manufacturer is set on this class, so there is nobody to send the pass list to.");
  }
  const [manufacturer] = await db.select().from(manufacturers).where(eq(manufacturers.id, cls.manufacturerId));
  if (!manufacturer?.contactEmail) {
    throw new GuardError(
      `${manufacturer?.name ?? "That manufacturer"} has no contact email on file. Add one before sending the pass list.`
    );
  }

  // Only cards that have not gone out yet, and dispatched_at is what says so
  // — NOT the status, which stays 'awaiting_issuer' from the moment the gate
  // creates the card until the manufacturer reports a number. Filtering on
  // status alone let a second send pick up the same cards and ask for
  // duplicates of every card already being printed.
  const pending = await db
    .select()
    .from(qualificationCards)
    .where(
      and(
        eq(qualificationCards.classId, classId),
        eq(qualificationCards.status, "awaiting_issuer"),
        isNull(qualificationCards.dispatchedAt)
      )
    );
  if (pending.length === 0) {
    throw new GuardError("There are no cards awaiting the manufacturer for this class.");
  }

  // Sequential, not Promise.all — concurrent Drizzle calls stall against the
  // pooler (see catalog/queries.ts's getPlatformOverviewStats).
  const rows = [];
  for (const card of pending) {
    const [employee] = await db
      .select({ nameEn: employees.fullNameEn, nationalIdEnc: employees.nationalIdEnc })
      .from(employees)
      .where(eq(employees.id, card.employeeId));
    const [company] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, card.companyId));
    const prior = await listPriorAttempts(card.employeeId, cls.courseId, classId);
    rows.push({
      cardId: card.id,
      employeeId: card.employeeId,
      name: employee?.nameEn ?? "",
      // The one place an Iqama leaves GCC Lab in full. It cannot be masked
      // here: the manufacturer prints it on the card.
      iqama: employee ? decryptNationalId(employee.nationalIdEnc) : "",
      masked: maskNationalId(employee?.nationalIdEnc) ?? "",
      companyName: company?.name ?? "",
      isRetest: prior.length > 0,
    });
  }

  const pdf = await renderPassListPdf({
    courseTitleEn: course.titleEn,
    courseTitleAr: course.titleAr,
    testDate: cls.endDate,
    venue: cls.locationNote ?? cls.region,
    rows,
  });

  const objectKey = `${classId}/${randomUUID()}.pdf`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(objectKey, pdf, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw new GuardError("Could not prepare the pass list. Please try again.");

  const linkExpiresAt = new Date(Date.now() + PASS_LIST_LINK_TTL_SECONDS * 1000);

  // The snapshot, not a query. Who was on the list at the moment it was sent
  // is a different question from who would be on it now, and only the first
  // one can be answered later.
  const [dispatch] = await db
    .insert(cardDispatches)
    .values({
      classId,
      manufacturerId: manufacturer.id,
      recipientEmail: manufacturer.contactEmail,
      passCount: rows.length,
      bucket: BUCKET,
      objectKey,
      linkExpiresAt,
      snapshot: rows.map((r) => ({ employeeId: r.employeeId, name: r.name, masked: r.masked, companyName: r.companyName })),
      sentBy: context.userId,
    })
    .returning({ id: cardDispatches.id });

  await db
    .update(qualificationCards)
    .set({ dispatchedAt: new Date(), manufacturerId: manufacturer.id, updatedAt: new Date() })
    .where(inArray(qualificationCards.id, pending.map((c) => c.id)));

  await queueNotification({
    type: "card.pass_list_dispatched",
    recipientEmail: manufacturer.contactEmail,
    // Masked only. The email is the notification; the list is the link.
    data: {
      dispatchId: dispatch.id,
      classId,
      courseTitle: course.titleEn,
      testDate: cls.endDate,
      count: rows.length,
      names: rows.map((r) => `${r.name} ${r.masked}`),
    },
  });

  await writeAudit({
    userId: context.userId,
    entityType: "class",
    entityId: classId,
    action: "dispatch_pass_list",
    note: `${rows.length} card(s) to ${manufacturer.name}`,
  });

  return { dispatchId: dispatch.id, count: rows.length };
}

/** The signed link itself, issued on request rather than baked into the email. */
export async function getPassListUrl(context: AuthContext, dispatchId: number): Promise<string> {
  if (!authorize("approve_certificates", context)) throw new Error("Not authorized");
  const [dispatch] = await db.select().from(cardDispatches).where(eq(cardDispatches.id, dispatchId));
  if (!dispatch) throw new GuardError("That dispatch no longer exists.");

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(dispatch.bucket).createSignedUrl(dispatch.objectKey, PASS_LIST_LINK_TTL_SECONDS);
  if (error || !data) throw new GuardError("Could not generate the download link.");

  await writeAudit({ userId: context.userId, entityType: "card_dispatch", entityId: dispatchId, action: "download" });
  return data.signedUrl;
}

/**
 * The manufacturer has printed the card and reported its number.
 *
 * This is where the two-year clock finally starts — counted from the test
 * date, per ارشادات حضور الاختبارات, not from today. A card printed three weeks
 * late does not buy the technician three extra weeks.
 */
export async function recordCardIssuance(context: AuthContext, input: RecordCardIssuanceInput) {
  if (!authorize("approve_certificates", context)) throw new Error("Not authorized");

  const [card] = await db.select().from(qualificationCards).where(eq(qualificationCards.id, input.cardId));
  if (!card) throw new GuardError("That card record no longer exists.");
  if (card.status !== "awaiting_issuer") {
    throw new GuardError(`This card is already ${card.status.replace("_", " ")}.`);
  }

  const [course] = await db
    .select({ validityMonths: courses.validityMonths })
    .from(courses)
    .where(eq(courses.id, card.courseId));

  const expiresAt = new Date(card.testDate);
  expiresAt.setMonth(expiresAt.getMonth() + (course?.validityMonths ?? 24));

  await db
    .update(qualificationCards)
    .set({
      cardNumber: input.cardNumber,
      status: "issued",
      issuedAt: new Date(),
      expiresAt: expiresAt.toISOString().slice(0, 10),
      updatedAt: new Date(),
    })
    .where(eq(qualificationCards.id, input.cardId));

  await writeAudit({
    userId: context.userId,
    entityType: "qualification_card",
    entityId: input.cardId,
    action: "record_issuance",
    fromStatus: "awaiting_issuer",
    toStatus: "issued",
    note: input.cardNumber,
  });

  const [company] = await db.select({ contactEmail: companies.contactEmail }).from(companies).where(eq(companies.id, card.companyId));
  if (company) {
    await queueNotification({
      type: "card.ready_for_collection",
      recipientEmail: company.contactEmail,
      data: { cardId: input.cardId, cardNumber: input.cardNumber },
    });
  }
}

/**
 * Somebody has physically taken the card away — نموذج الغياب و استلام البطاقات.
 *
 * The collector is often the contractor's representative rather than the
 * technician, which is exactly why the paper form asks for their name and
 * mobile, and why this does too.
 */
export async function recordCardCollection(context: AuthContext, input: RecordCardCollectionInput) {
  if (!authorize("approve_certificates", context)) throw new Error("Not authorized");

  const [card] = await db.select().from(qualificationCards).where(eq(qualificationCards.id, input.cardId));
  if (!card) throw new GuardError("That card record no longer exists.");
  if (card.status !== "issued") {
    throw new GuardError(
      card.status === "awaiting_issuer"
        ? "The manufacturer has not reported this card issued yet, so there is nothing to hand over."
        : `This card is already ${card.status}.`
    );
  }

  await db
    .update(qualificationCards)
    .set({
      status: "collected",
      collectedAt: new Date(),
      collectedByName: input.collectedByName,
      collectedByMobile: input.collectedByMobile,
      receiptDocumentId: input.receiptDocumentId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(qualificationCards.id, input.cardId));

  await writeAudit({
    userId: context.userId,
    entityType: "qualification_card",
    entityId: input.cardId,
    action: "record_collection",
    fromStatus: "issued",
    toStatus: "collected",
    note: `${input.collectedByName} — ${input.collectedByMobile}`,
  });
}
