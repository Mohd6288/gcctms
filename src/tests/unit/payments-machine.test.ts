import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, PAYMENT_STATUSES, type PaymentStatus } from "../../modules/payments/machine";

const LEGAL: ReadonlyArray<readonly [PaymentStatus, PaymentStatus]> = [
  ["uploaded", "verified"],
  ["uploaded", "rejected"],
  ["rejected", "uploaded"],
];

describe("payment state machine", () => {
  it.each(LEGAL)("allows %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it("rejects every (from, to) pair not in the legal list", () => {
    const legalSet = new Set(LEGAL.map(([f, t]) => `${f}->${t}`));
    for (const from of PAYMENT_STATUSES) {
      for (const to of PAYMENT_STATUSES) {
        if (from === to) continue;
        expect(canTransition(from, to)).toBe(legalSet.has(`${from}->${to}`));
      }
    }
  });

  it("verified is terminal", () => {
    for (const to of PAYMENT_STATUSES) {
      expect(canTransition("verified", to)).toBe(false);
    }
  });

  it("assertTransition throws a clear error for an illegal transition", () => {
    expect(() => assertTransition("verified", "uploaded")).toThrow("Illegal payment transition: verified -> uploaded");
  });
});
