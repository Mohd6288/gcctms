// cards module — read side for the admin handover screen.
import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cardDispatches, courses, employees, manufacturers, qualificationCards } from "@/db/schema";
import { maskNationalId } from "@/modules/platform/security/national-id";

export interface CardRow {
  id: number;
  employeeId: number;
  fullNameEn: string;
  /** Masked. The full number exists only in the printing list. */
  maskedId: string | null;
  status: string;
  issuanceType: string;
  cardNumber: string | null;
  testDate: string;
  expiresAt: string | null;
  dispatchedAt: string | null;
  collectedByName: string | null;
  collectedByMobile: string | null;
}

export async function listCardsForClass(classId: number): Promise<CardRow[]> {
  const rows = await db
    .select({
      id: qualificationCards.id,
      employeeId: qualificationCards.employeeId,
      fullNameEn: employees.fullNameEn,
      nationalIdEnc: employees.nationalIdEnc,
      status: qualificationCards.status,
      issuanceType: qualificationCards.issuanceType,
      cardNumber: qualificationCards.cardNumber,
      testDate: qualificationCards.testDate,
      expiresAt: qualificationCards.expiresAt,
      dispatchedAt: qualificationCards.dispatchedAt,
      collectedByName: qualificationCards.collectedByName,
      collectedByMobile: qualificationCards.collectedByMobile,
    })
    .from(qualificationCards)
    .innerJoin(employees, eq(employees.id, qualificationCards.employeeId))
    .where(eq(qualificationCards.classId, classId))
    .orderBy(employees.fullNameEn);

  // Masked at the query boundary rather than in the screen, so no caller can
  // accidentally render the full number by reaching for the wrong field.
  return rows.map(({ nationalIdEnc, dispatchedAt, ...row }) => ({
    ...row,
    maskedId: maskNationalId(nationalIdEnc),
    dispatchedAt: dispatchedAt ? dispatchedAt.toISOString() : null,
  }));
}

export interface DispatchRow {
  id: number;
  manufacturerName: string;
  recipientEmail: string;
  passCount: number;
  sentAt: string;
  linkExpiresAt: string;
}

export async function listDispatchesForClass(classId: number): Promise<DispatchRow[]> {
  const rows = await db
    .select({
      id: cardDispatches.id,
      manufacturerName: manufacturers.name,
      recipientEmail: cardDispatches.recipientEmail,
      passCount: cardDispatches.passCount,
      sentAt: cardDispatches.sentAt,
      linkExpiresAt: cardDispatches.linkExpiresAt,
    })
    .from(cardDispatches)
    .innerJoin(manufacturers, eq(manufacturers.id, cardDispatches.manufacturerId))
    .where(eq(cardDispatches.classId, classId))
    .orderBy(desc(cardDispatches.sentAt));

  return rows.map((row) => ({
    ...row,
    sentAt: row.sentAt.toISOString(),
    linkExpiresAt: row.linkExpiresAt.toISOString(),
  }));
}

export interface CompanyCardRow {
  id: number;
  employeeName: string;
  courseTitleEn: string;
  courseTitleAr: string;
  status: string;
  cardNumber: string | null;
  testDate: string;
  expiresAt: string | null;
  collectedByName: string | null;
  /** Negative once lapsed. Null while the card does not exist yet. */
  daysToExpiry: number | null;
}

/**
 * A contractor's cards, soonest to expire first.
 *
 * Expiry is what a contractor actually watches: a lapsed card stops a
 * technician working on SEC sites, and the first anyone usually hears of it is
 * being turned away at a gate. So the ordering is by expiry rather than by
 * name or date issued, and the ones with no expiry yet — still with the
 * manufacturer — sort last rather than first, because nothing can be done
 * about them.
 */
export async function listCardsForCompany(companyId: number): Promise<CompanyCardRow[]> {
  const rows = await db
    .select({
      id: qualificationCards.id,
      employeeName: employees.fullNameEn,
      courseTitleEn: courses.titleEn,
      courseTitleAr: courses.titleAr,
      status: qualificationCards.status,
      cardNumber: qualificationCards.cardNumber,
      testDate: qualificationCards.testDate,
      expiresAt: qualificationCards.expiresAt,
      collectedByName: qualificationCards.collectedByName,
    })
    .from(qualificationCards)
    .innerJoin(employees, eq(employees.id, qualificationCards.employeeId))
    .innerJoin(courses, eq(courses.id, qualificationCards.courseId))
    .where(eq(qualificationCards.companyId, companyId));

  const today = new Date().toISOString().slice(0, 10);
  return rows
    .map((row) => ({
      ...row,
      daysToExpiry: row.expiresAt ? daysBetween(today, row.expiresAt) : null,
    }))
    .sort((a, b) => (a.daysToExpiry ?? Number.MAX_SAFE_INTEGER) - (b.daysToExpiry ?? Number.MAX_SAFE_INTEGER));
}

// Date-only arithmetic on the "YYYY-MM-DD" strings the DB uses, so no
// timezone can shift a card's last valid day by one.
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}
