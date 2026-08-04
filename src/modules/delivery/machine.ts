// delivery module — no separate state machine here. Attendance/exam-result
// writes are gated inline in service.ts (class must be in_progress); class
// completion is a single explicit transition (in_progress -> completed) via
// submitResults(), not a multi-state machine worth formalizing separately —
// see requests/machine.ts and scheduling's inline class-status guards for
// the pattern this deliberately doesn't need here.
export {};
