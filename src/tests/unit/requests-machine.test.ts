import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, REQUEST_STATUSES, type RequestStatus } from "../../modules/requests/machine";

// Transcribed independently from the validated prototype's useStore.ts
// (submitRequest/approveRequest/rejectRequest/requestInfo/scheduleClass),
// mirroring the same discipline as tests/unit/authorize.test.ts (an expected
// table separate from the map under test, so this catches transcription
// drift in either direction).
const LEGAL: ReadonlyArray<readonly [RequestStatus, RequestStatus]> = [
  ["draft", "submitted"],
  ["submitted", "info_requested"],
  ["submitted", "rejected"],
  ["submitted", "payment_pending"],
  ["info_requested", "submitted"],
  ["payment_pending", "ready_for_scheduling"],
  ["ready_for_scheduling", "scheduled"],
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

  it("submitted -> payment_pending is a single direct transition (no persisted 'approved' state)", () => {
    expect(canTransition("submitted", "payment_pending")).toBe(true);
  });

  it("scheduled -> completed is deliberately NOT a direct transition (derived elsewhere)", () => {
    expect(canTransition("scheduled", "completed")).toBe(false);
  });

  it("completed is terminal (closing a request just sets closed_at, not a status transition)", () => {
    for (const to of REQUEST_STATUSES) {
      expect(canTransition("completed", to)).toBe(false);
    }
  });

  it("rejected is terminal (no outgoing transitions, no request-cancellation concept exists)", () => {
    for (const to of REQUEST_STATUSES) {
      expect(canTransition("rejected", to)).toBe(false);
    }
  });

  it("assertTransition throws a clear error for an illegal transition", () => {
    expect(() => assertTransition("draft", "rejected")).toThrow("Illegal training_request transition: draft -> rejected");
  });
});
