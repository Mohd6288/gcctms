import { authorize, getContext } from "@/modules/platform/auth/service";
import { listAuditActivityForExport } from "@/modules/audit/queries";

// The filtered trail, whole. The screen pages at 100; an investigation ends
// with somebody attaching the evidence to a report, and that has to be every
// matching row rather than the page they happened to stop on.
export const dynamic = "force-dynamic";

const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET(request: Request) {
  const context = await getContext();
  if (!authorize("view_audit_portal", context)) {
    return new Response("Not authorized", { status: 403 });
  }

  const p = new URL(request.url).searchParams;
  const rows = await listAuditActivityForExport({
    actorUserId: p.get("actor"),
    entityType: p.get("entity"),
    action: p.get("action"),
    from: p.get("from"),
    to: p.get("to"),
    q: p.get("q"),
  });

  const header = ["When (UTC)", "Actor", "Role", "Entity", "Entity id", "Action", "From", "To", "Note"];
  const body = [
    header.map(escape).join(","),
    ...rows.map((r) =>
      [
        new Date(r.createdAt).toISOString().replace("T", " ").slice(0, 19),
        r.actor,
        r.actorRole,
        r.entityType,
        r.entityId,
        r.action,
        r.fromStatus,
        r.toStatus,
        r.note,
      ]
        .map(escape)
        .join(",")
    ),
  ].join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${body}`, {
    headers: {
      // The BOM is why Excel reads the Arabic names instead of mojibake.
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="activity-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
