// cards module — read side for the admin handover screen.
import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cardDispatches, employees, manufacturers, qualificationCards } from "@/db/schema";
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
