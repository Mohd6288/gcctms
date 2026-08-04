// reporting module — no mutations, so no Zod schemas. Reports are read-only
// aggregation (queries.ts) + a client-side CSV export (no server action
// needed — built directly from already-fetched report data in the page).
export {};
