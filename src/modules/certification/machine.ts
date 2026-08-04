// certification module — no separate state machine file. The certificate
// lifecycle is 3 transitions total (pending_approval -> issued via
// approveCertificate, issued -> revoked via revokeCertificate, and the
// auto-draft pending_approval creation via evaluateClassEligibility), each
// with a single inline guard in service.ts — not worth a transition-table
// abstraction the way requests/machine.ts's 8-status graph is. See
// delivery/machine.ts for the same reasoning applied to that module.
export {};
