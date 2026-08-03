// requests module — explicit state-machine transition map (see roles-and-workflows.md).
// Every transition writes audit_log and emits a domain event. Implemented from Phase 4 onward.

export const REQUEST_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "info_requested",
  "payment_pending",
  "ready_for_scheduling",
  "scheduled",
  "completed",
  "closed",
  "cancelled",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

// Legal (from, to) pairs only — WHO may trigger a given transition and
// WHETHER its guards are satisfied (>=1 item + employee docs for submit;
// both request-level documents verified + per-employee decisions for
// approve; payment verified for ready_for_scheduling) are checked in
// requests/service.ts, not here. This map only answers "is this state
// change even legal," matching the note in database-schema.md's RLS
// section: "RLS enforces WHO, the state machine enforces WHAT."
//
// scheduled -> completed is deliberately ABSENT: it's derived (true only
// once every billable employee's assigned class is itself completed — see
// roles-and-workflows.md), never a direct settable transition. Phase 6/7
// compute it separately; do not add it here.
const TRANSITIONS: ReadonlyArray<readonly [RequestStatus, RequestStatus]> = [
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

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function assertTransition(from: RequestStatus, to: RequestStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal training_request transition: ${from} -> ${to}`);
  }
}
