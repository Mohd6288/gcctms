// requests module — explicit state-machine transition map (see roles-and-workflows.md).
// Every transition writes audit_log and emits a domain event. Implemented from Phase 4 onward.
//
// Status set and transitions matched exactly to the validated prototype's
// RequestStatus (types/index.ts) and useStore.ts's submitRequest/approveRequest/
// rejectRequest/requestInfo/scheduleClass. Confirmed against the prototype's
// CompanyRequestDetail.tsx: EDITABLE_STATUSES = {'info_requested'} — only an
// info_requested request can be edited and resubmitted; a rejected request has
// no resubmit path (terminal), and there is no cancel concept for requests at
// all (only cancelClass, unrelated to requests).

export const REQUEST_STATUSES = [
  "draft",
  "submitted",
  "info_requested",
  "rejected",
  "payment_pending",
  "ready_for_scheduling",
  "scheduled",
  "completed",
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
// submitted -> payment_pending is a single direct transition: the prototype
// never persists a separate 'approved' state, it writes payment_pending
// straight away (see requests/service.ts's approveRequest()).
//
// scheduled -> completed is deliberately ABSENT: it's derived (true only
// once every billable employee's assigned class is itself completed — see
// roles-and-workflows.md), never a direct settable transition. Phase 6/7
// compute it separately; do not add it here.
//
// completed has no outgoing transition: "closing" a request is just setting
// closed_at while status stays 'completed', not its own status (see
// requests/service.ts's closeRequest()).
const TRANSITIONS: ReadonlyArray<readonly [RequestStatus, RequestStatus]> = [
  ["draft", "submitted"],
  ["submitted", "info_requested"],
  ["submitted", "rejected"],
  ["submitted", "payment_pending"],
  ["info_requested", "submitted"],
  ["payment_pending", "ready_for_scheduling"],
  ["ready_for_scheduling", "scheduled"],
];

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function assertTransition(from: RequestStatus, to: RequestStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal training_request transition: ${from} -> ${to}`);
  }
}
