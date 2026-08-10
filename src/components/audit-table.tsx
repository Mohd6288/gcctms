"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export interface AuditColumn<T> {
  key: keyof T & string;
  label: string;
}

function toCsv<T extends Record<string, unknown>>(columns: AuditColumn<T>[], rows: T[]): string {
  // Quote everything and double embedded quotes: company names carry commas,
  // audit notes carry both commas and quotes, and a half-escaped export is
  // worse than none because it opens without complaint and is silently wrong.
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [columns.map((c) => escape(c.label)).join(","), ...rows.map((r) => columns.map((c) => escape(r[c.key])).join(","))].join("\r\n");
}

export function AuditTable<T extends Record<string, unknown>>({
  columns,
  rows,
  fileName,
}: {
  columns: AuditColumn<T>[];
  rows: T[];
  fileName: string;
}) {
  const t = useTranslations("auditor.common");

  function download() {
    // ﻿ so Excel reads it as UTF-8 — without it the Arabic company and
    // course names come out as mojibake, which is most of this data.
    const blob = new Blob(["﻿", toCsv(columns, rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("rowCount", { count: rows.length })}</p>
        <Button type="button" size="sm" variant="outline" disabled={rows.length === 0} onClick={download}>
          {t("downloadCsv")}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              {columns.map((c) => (
                <th key={c.key} className="p-3 text-start font-medium whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={columns.length}>
                  {t("empty")}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {columns.map((c) => (
                    <td key={c.key} className="p-3 whitespace-nowrap">
                      {String(row[c.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
