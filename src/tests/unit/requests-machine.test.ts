import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, REQUEST_STATUSES, type RequestStatus } from "../../modules/requests/machine";

// Transcribed independently from roles-and-workflows.md's Training request
// state machine, mirroring the same discipline as tests/unit/authorize.test.ts
// (an expected table separate from the map under test, so this catches
// transcription drift in either direction).
const LEGAL: ReadonlyArray<readonly [RequestStatus, RequestStatus]> = [
  ["draft", "submitted"],
  ["draft", "cancelled"],
  ["submitted", "approved"],
  ["submitted", "rejected"],
  ["submitted", "info_requested"],
  ["submitted", "cancelled"],
  ["info_requested", "submitted"],
  ["info_requested", "cancelled"],
  ["approved", "payment_pending"],
  ["payment_pending", "ready_for_scheduling"],
  ["ready_for_scheduling", "scheduled"],
  ["completed", "closed"],
];

describe("training request state machine", () => {
  it.each(LEGAL)("allows %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it("rejects every (from, to) pair not in the legal list", () => {
    const legalSet = new Set(LEGAL.map(([f, t]) => `${f}->${t}`));
    let checked = 0;
    for (const from of REQUEST_STATUSES) {
      for (const to of REQUEST_STATUSES) {
        if (from === to) continue;
        checked++;
        const expected = legalSet.has(`${from}->${to}`);
        expect(canTransition(from, to)).toBe(expected);
      }
    }
    expect(checked).toBe(REQUEST_STATUSES.length * (REQUEST_STATUSES.length - 1));
  });

  it("info_requested round-trips back to submitted (same-row resubmit, not a new request)", () => {
    expect(canTransition("info_requested", "submitted")).toBe(true);
  });

  it("closed is only reachable from completed, and is terminal", () => {
    expect(canTransition("completed", "closed")).toBe(true);
    for (const from of REQUEST_STATUSES) {
      if (from === "completed") continue;
      expect(canTransition(from, "closed")).toBe(false);
    }
    for (const to of REQUEST_STATUSES) {
      expect(canTransition("closed", to)).toBe(false);
    }
  });

  it("scheduled -> completed is deliberately NOT a direct transition (derived elsewhere)", () => {
    expect(canTransition("scheduled", "completed")).toBe(false);
  });

  it("rejected and cancelled are terminal (no outgoing transitions)", () => {
    for (const to of REQUEST_STATUSES) {
      expect(canTransition("rejected", to)).toBe(false);
      expect(canTransition("cancelled", to)).toBe(false);
    }
  });

  it("assertTransition throws a clear error for an illegal transition", () => {
    expect(() => assertTransition("draft", "approved")).toThrow("Illegal training_request transition: draft -> approved");
  });
});
