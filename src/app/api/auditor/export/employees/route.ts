import { authorize, getContext } from "@/modules/platform/auth/service";
import { listAllDirectoryEmployeesForExport } from "@/modules/directory/queries";

// The directory shows 50 people at a time; this hands over every row the
// current search matched. Building the CSV in the browser would have meant
// shipping all 3,000 rows into the page just so a button could re-serialise
// them — the page stays light and the export stays complete.
export const dynamic = "force-dynamic";

const COLUMNS = [
  ["name", "Name"],
  ["nameAr", "Name (Arabic)"],
  ["iqama", "Iqama"],
  ["company", "Company"],
  ["region", "Region"],
  ["jobRole", "Job role"],
  ["status", "Status"],
  ["validCertificates", "Valid certificates"],
] as const;

// Quote everything and double embedded quotes: company names carry commas and
// notes carry both. A half-escaped export opens without complaint and is
// silently wrong, which is worse than none.
const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET(request: Request) {
  const context = await getContext();
  if (!authorize("view_audit_portal", context)) {
    return new Response("Not authorized", { status: 403 });
  }

  const q = new URL(request.url).searchParams.get("q");
  const rows = await listAllDirectoryEmployeesForExport({ q });

  const body = [
    COLUMNS.map(([, label]) => escape(label)).join(","),
    ...rows.map((row) =>
      [
        row.fullNameEn,
        row.fullNameAr,
        // Masked here exactly as on screen. The export is the most-copied
        // artefact this portal produces, so it is the last place a full
        // identity number should appear.
        row.nationalIdMasked,
        row.companyName,
        row.companyRegion,
        row.jobRoleName,
        row.status,
        row.validCertificates,
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
      "Content-Disposition": `attachment; filename="employees-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
