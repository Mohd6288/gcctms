import { readFileSync } from "node:fs";
import { read, utils } from "xlsx";
import { describe, expect, it } from "vitest";

// The templates in public/documents are what a contractor downloads, fills
// in and re-uploads, so the importer in
// dashboard/requests/[id]/import-employees-panel.tsx has to be able to read
// them back. A near-miss copy of the Registration Sheet shipped for a while
// with no Nationality column, which the importer resolved to -1 and
// silently imported as blank on every row — the kind of thing that only
// shows up as "why is nationality always empty".
function sheetRows(path: string, sheetIndex = 0): unknown[][] {
  const wb = read(readFileSync(path), { type: "buffer" });
  return utils.sheet_to_json(wb.Sheets[wb.SheetNames[sheetIndex]], { header: 1, defval: "" });
}

// Mirrors REG_COLUMNS/findColumns in import-employees-panel.tsx.
const REG_COLUMNS = [
  { key: "fullName", keyword: "name" },
  { key: "nationalId", keyword: "id" },
  { key: "jobTitleText", keyword: "job" },
  { key: "activity", keyword: "activity" },
  { key: "contractorArea", keyword: "contractor's  area" },
  { key: "contractorCity", keyword: "contractor's  city" },
  { key: "phone", keyword: "phone" },
  { key: "email", keyword: "email" },
  { key: "nationality", keyword: "nationality" },
] as const;

describe("downloadable document templates", () => {
  it("the Registration Sheet exposes every column the importer looks for", () => {
    const rows = sheetRows("public/documents/Registration-sheet.xlsx");

    const headerIndex = rows.findIndex((r) => String(r[0] ?? "").trim() === "م");
    expect(headerIndex).toBe(3); // REG_START_ROW = 4 is the first candidate row

    const cells = (rows[headerIndex] ?? []).map((h) => String(h ?? "").toLowerCase());
    for (const { key, keyword } of REG_COLUMNS) {
      const found = cells.findIndex((c) => c.includes(keyword));
      expect(found, `no header cell contains "${keyword}" (for ${key}) — wrong copy of the form?`).toBeGreaterThanOrEqual(0);
    }
  });

  it("the Registration Request form's candidate table is where the importer reads it", () => {
    // Sheet3, header at row 5 (0-based), candidates at 6-20.
    const rows = sheetRows("public/documents/HRBL_0004_FO_001.xlsx");
    expect(String(rows[5]?.[0] ?? "").trim()).toBe("مسلسل");
    expect(rows[6]?.[0]).toBe(1);
  });
});
