"use client";

import { useRef, useState } from "react";
import { read, utils } from "xlsx";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { importEmployeesAction } from "@/modules/employees/actions";
import type { ImportEmployeeRow } from "@/modules/employees/schema";

// Registration sheet.xlsx (Sheet1): header at row 3 (0-based), candidate
// rows starting at row 4. Columns are located by searching the header row's
// text rather than hardcoded indices — column positions have already
// drifted once between real-world copies of this form (see the validated
// prototype's ImportExcelDialog.tsx, ported from here).
const REG_START_ROW = 4;
const REG_END_ROW = 200;
const REG_COLUMNS: { key: keyof RowValues; keyword: string; fallback: number }[] = [
  { key: "fullName", keyword: "name", fallback: 1 },
  { key: "nationalId", keyword: "id", fallback: 2 },
  { key: "jobTitleText", keyword: "job", fallback: 3 },
  { key: "activity", keyword: "activity", fallback: 5 },
  { key: "contractorArea", keyword: "contractor's  area", fallback: 6 },
  { key: "contractorCity", keyword: "contractor's  city", fallback: 7 },
  { key: "phone", keyword: "phone", fallback: 8 },
  { key: "email", keyword: "email", fallback: 9 },
  { key: "nationality", keyword: "nationality", fallback: -1 },
];

// HRBL_0004_FO_001's candidate table (Sheet3): header at row 5 (0-based), 15
// candidate rows at 6-20. Only captures name/job/Iqama — the rest are filled
// in afterward via Edit Employee, same as the validated prototype.
const HRBL_START_ROW = 6;
const HRBL_END_ROW = 20;
const HRBL_COL_NAME = 1;
const HRBL_COL_JOB_TITLE = 3;
const HRBL_COL_IQAMA = 5;

interface RowValues {
  fullName: string;
  nationalId: string;
  jobTitleText: string;
  nationality: string;
  phone: string;
  email: string;
  activity: string;
  contractorArea: string;
  contractorCity: string;
}

function cell(row: unknown[], col: number): string {
  if (col < 0) return "";
  const v = String(row[col] ?? "").trim();
  return v.toLowerCase() === "droplist" ? "" : v;
}

function findColumns(headerRow: unknown[]) {
  const cells = headerRow.map((h) => String(h ?? "").toLowerCase());
  const result = {} as Record<keyof RowValues, number>;
  for (const { key, keyword, fallback } of REG_COLUMNS) {
    const idx = cells.findIndex((c) => c.includes(keyword));
    result[key] = idx >= 0 ? idx : fallback;
  }
  return result;
}

export function ImportEmployeesPanel({
  companyId,
  onImported,
  onClose,
}: {
  companyId: number;
  onImported: (created: { id: number; fullName: string }[]) => void;
  onClose: () => void;
}) {
  const t = useTranslations("contractor.requests.wizard.import");
  const [source, setSource] = useState<"registration" | "hrbl">("registration");
  const [parsedRows, setParsedRows] = useState<ImportEmployeeRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [stage, setStage] = useState<"idle" | "parsing" | "ready">("idle");
  const [skippedByParse, setSkippedByParse] = useState(0);
  const [importResult, setImportResult] = useState<{ created: number; skipped: { row: number; reason: string }[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setParsedRows([]);
    setFileName("");
    setStage("idle");
    setSkippedByParse(0);
    setImportResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function parseRegistrationSheet(rows: unknown[][]): ImportEmployeeRow[] {
    const headerRow = rows.find((r) => String(r[0] ?? "").trim() === "م") ?? rows[3] ?? [];
    const col = findColumns(headerRow);
    const values: ImportEmployeeRow[] = [];
    for (let i = REG_START_ROW; i <= REG_END_ROW; i++) {
      const row = rows[i];
      if (!row) continue;
      const fullName = cell(row, col.fullName);
      const nationalId = cell(row, col.nationalId);
      if (!fullName && !nationalId) continue;
      values.push({
        fullName,
        nationalId,
        jobTitleText: cell(row, col.jobTitleText),
        nationality: cell(row, col.nationality),
        phone: cell(row, col.phone),
        email: cell(row, col.email),
        activity: cell(row, col.activity),
        contractorArea: cell(row, col.contractorArea),
        contractorCity: cell(row, col.contractorCity),
      });
    }
    return values;
  }

  function parseHrblForm(rows: unknown[][]): ImportEmployeeRow[] {
    const values: ImportEmployeeRow[] = [];
    for (let i = HRBL_START_ROW; i <= HRBL_END_ROW; i++) {
      const row = rows[i];
      if (!row) continue;
      const fullName = String(row[HRBL_COL_NAME] ?? "").trim();
      const nationalId = String(row[HRBL_COL_IQAMA] ?? "").trim();
      if (!fullName && !nationalId) continue;
      values.push({ fullName, nationalId, jobTitleText: String(row[HRBL_COL_JOB_TITLE] ?? "").trim() });
    }
    return values;
  }

  function handleFile(file: File) {
    setFileName(file.name);
    setStage("parsing");
    file
      .arrayBuffer()
      .then((buffer) => {
        const wb = read(buffer, { type: "array" });
        const sheetName = source === "registration" ? "Sheet1" : "Sheet3";
        const sheet = wb.Sheets[sheetName] ?? wb.Sheets[wb.SheetNames[0]];
        const rows: unknown[][] = utils.sheet_to_json(sheet, { header: 1, defval: "" });
        const values = source === "registration" ? parseRegistrationSheet(rows) : parseHrblForm(rows);
        const withNationalId = values.filter((v) => v.nationalId);
        setSkippedByParse(values.length - withNationalId.length);
        setParsedRows(withNationalId);
        setStage("ready");
      })
      .catch(() => {
        setParsedRows([]);
        setStage("ready");
      });
  }

  async function handleImport() {
    setLoading(true);
    try {
      const result = await importEmployeesAction({ companyId, rows: parsedRows });
      setImportResult({ created: result.created.length, skipped: result.skipped });
      if (result.created.length > 0) onImported(result.created);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t("title")}</span>
        <Button type="button" size="sm" variant="outline" onClick={onClose}>
          {t("close")}
        </Button>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={source === "registration" ? "default" : "outline"}
          onClick={() => {
            setSource("registration");
            reset();
          }}
        >
          {t("tabRegistration")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={source === "hrbl" ? "default" : "outline"}
          onClick={() => {
            setSource("hrbl");
            reset();
          }}
        >
          {t("tabHrbl")}
        </Button>
      </div>

      <a
        href={source === "registration" ? "/documents/Registration-sheet.xlsx" : "/documents/HRBL_0004_FO_001.xlsx"}
        download
        className="self-start text-xs font-medium text-primary hover:underline"
      >
        {t("downloadTemplate")}
      </a>
      <p className="text-xs text-muted-foreground">{source === "registration" ? t("registrationHint") : t("hrblHint")}</p>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="text-sm"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {stage === "parsing" ? <p className="text-xs text-muted-foreground">{t("reading", { fileName })}</p> : null}

      {stage === "ready" && !importResult ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-2">
          <p className="text-xs">{t("readyCount", { count: parsedRows.length })}</p>
          {skippedByParse > 0 ? <p className="text-xs text-amber-600">{t("skippedNoId", { count: skippedByParse })}</p> : null}
          <Button type="button" size="sm" disabled={parsedRows.length === 0 || loading} onClick={handleImport}>
            {loading ? t("importing") : t("importButton", { count: parsedRows.length })}
          </Button>
        </div>
      ) : null}

      {importResult ? (
        <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 p-2 text-xs">
          <p className="font-medium text-emerald-600">{t("createdCount", { count: importResult.created })}</p>
          {importResult.skipped.length > 0 ? (
            <>
              <p className="text-amber-600">{t("skippedCount", { count: importResult.skipped.length })}</p>
              <ul className="list-inside list-disc text-muted-foreground">
                {importResult.skipped.slice(0, 10).map((s) => (
                  <li key={s.row}>
                    {t("rowLabel", { row: s.row })}: {s.reason}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
