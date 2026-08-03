// payments module — explicit state-machine transition map (see roles-and-workflows.md).
// Every transition writes audit_log and emits a domain event. Implemented from Phase 5 onward.

export const PAYMENT_STATUSES = ["uploaded", "verified", "rejected"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// A payment row is created already in "uploaded" status at request-approval
// time (Phase 4), before any SADAD receipt is actually attached — that
// column tracks admin-review state, not "has a file been attached" (that's
// payments.document_id). So the contractor's FIRST receipt upload doesn't
// change status at all (stays "uploaded"); only re-uploading after a
// rejection is a real transition.
const TRANSITIONS: ReadonlyArray<readonly [PaymentStatus, PaymentStatus]> = [
  ["uploaded", "verified"],
  ["uploaded", "rejected"],
  ["rejected", "uploaded"],
];

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function assertTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal payment transition: ${from} -> ${to}`);
  }
}
