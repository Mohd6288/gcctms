"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

// Inline viewer for an uploaded document. Fetches the short-lived signed URL
// on demand (never on render — that would mint a URL and write an audit row
// for every document on the page, whether or not anyone looked at it) and
// renders it in place.
//
// Images and PDFs go straight into an <img>/<iframe>. Spreadsheets can't:
// no browser renders .xlsx natively, and those two forms — the Registration
// Sheet and the Registration Request — are exactly the documents an admin
// has to read before approving, so "download it first" was the wrong answer
// for the most-reviewed files in the system. They're parsed in the browser
// and rendered as a table instead.
const PREVIEWABLE_IMAGE = /^image\//;
const PDF = "application/pdf";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Enough for both real forms (the Registration Sheet's candidate table is
// 100 rows x 27 columns) without turning a pathological upload into a
// browser hang. Truncation is always stated, never silent.
const MAX_ROWS = 250;
const MAX_COLS = 40;

interface SheetData {
  names: string[];
  rows: string[][];
  truncatedRows: boolean;
  truncatedCols: boolean;
}

export function DocumentPreview({ documentId, mimeType, fileName }: { documentId: number; mimeType: string | null; fileName?: string | null }) {
  const t = useTranslations("documents.preview");
  const [url, setUrl] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const isImage = mimeType != null && PREVIEWABLE_IMAGE.test(mimeType);
  const isPdf = mimeType === PDF;
  const isSpreadsheet = mimeType === XLSX;
  const canPreview = isImage || isPdf || isSpreadsheet;

  async function signedUrl(): Promise<string> {
    if (url) return url;
    const res = await fetch(`/api/documents/${documentId}/download?url=1`);
    if (!res.ok) throw new Error("no url");
    const body = (await res.json()) as { url: string };
    setUrl(body.url);
    return body.url;
  }

  async function loadSheet(index: number) {
    const href = await signedUrl();
    const bytes = await (await fetch(href)).arrayBuffer();
    // Dynamic import: SheetJS is ~1MB and only the spreadsheet path needs
    // it, so it stays out of every page that merely renders this component.
    const { read, utils } = await import("xlsx");
    const wb = read(bytes, { type: "array" });
    const name = wb.SheetNames[index] ?? wb.SheetNames[0];
    const parsed = utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, blankrows: false, defval: "" });

    const truncatedRows = parsed.length > MAX_ROWS;
    const rows = parsed.slice(0, MAX_ROWS).map((row) => row.slice(0, MAX_COLS).map((c) => String(c ?? "")));
    const truncatedCols = parsed.some((row) => row.length > MAX_COLS);
    setSheet({ names: wb.SheetNames, rows, truncatedRows, truncatedCols });
  }

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (url && (!isSpreadsheet || sheet)) return;
    setLoading(true);
    setError(false);
    try {
      if (isSpreadsheet) await loadSheet(activeSheet);
      else await signedUrl();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function switchSheet(index: number) {
    setActiveSheet(index);
    setLoading(true);
    setError(false);
    try {
      await loadSheet(index);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        {canPreview ? (
          <button type="button" onClick={toggle} className="text-xs font-medium text-primary hover:underline">
            {open ? t("hide") : t("show")}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">{t("noPreview")}</span>
        )}
        <a href={`/api/documents/${documentId}/download`} className="text-xs text-primary hover:underline">
          {t("download")}
        </a>
        {fileName ? <span className="min-w-0 truncate text-xs text-muted-foreground">{fileName}</span> : null}
      </div>

      {open && canPreview ? (
        <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
          {loading ? <p className="p-3 text-xs text-muted-foreground">{t("loading")}</p> : null}
          {error ? <p className="p-3 text-xs text-destructive">{t("failed")}</p> : null}

          {url && isImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, expires in minutes; next/image would need it allow-listed as a remote pattern and would cache a URL that's about to 403.
            <img src={url} alt={fileName ?? t("show")} className="max-h-[28rem] w-full object-contain" />
          ) : null}

          {url && isPdf ? <iframe src={url} title={fileName ?? t("show")} className="h-[28rem] w-full" /> : null}

          {sheet && isSpreadsheet && !loading ? (
            <div className="flex flex-col gap-2 p-2">
              {sheet.names.length > 1 ? (
                <div className="flex flex-wrap gap-1">
                  {sheet.names.map((name, i) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => switchSheet(i)}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                        i === activeSheet ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              ) : null}

              {/* Cells are rendered as React text nodes, never as HTML — the
                  contents are contractor-supplied and SheetJS's own
                  sheet_to_html would hand us markup to trust. */}
              <div className="max-h-[28rem] overflow-auto rounded-md border border-border bg-background">
                <table className="w-max min-w-full border-collapse text-[11px]">
                  <tbody>
                    {sheet.rows.map((row, r) => (
                      <tr key={r} className={r === 0 ? "bg-muted/60 font-medium" : "even:bg-muted/20"}>
                        {row.map((cellValue, c) => (
                          <td key={c} className="max-w-[16rem] truncate border border-border/60 px-2 py-1 align-top" title={cellValue}>
                            {cellValue}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {sheet.truncatedRows || sheet.truncatedCols ? (
                <p className="text-[11px] text-muted-foreground">{t("truncated", { rows: MAX_ROWS, cols: MAX_COLS })}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
