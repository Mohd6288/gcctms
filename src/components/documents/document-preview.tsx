"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

// Inline viewer for an uploaded document. Fetches the short-lived signed URL
// on demand (never on render — that would mint a URL and write an audit row
// for every document on the page, whether or not anyone looked at it) and
// points an <img>/<iframe> straight at Storage.
//
// Deliberately only images and PDFs: the two request forms are .xlsx, which
// no browser renders natively, and the honest answer there is a download
// link rather than an embedded viewer that shows a blank box.
const PREVIEWABLE_IMAGE = /^image\//;
const PDF = "application/pdf";

export function DocumentPreview({ documentId, mimeType, fileName }: { documentId: number; mimeType: string | null; fileName?: string | null }) {
  const t = useTranslations("documents.preview");
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const isImage = mimeType != null && PREVIEWABLE_IMAGE.test(mimeType);
  const isPdf = mimeType === PDF;
  const canPreview = isImage || isPdf;

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (url) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/documents/${documentId}/download?url=1`);
      if (!res.ok) throw new Error("failed");
      const body = (await res.json()) as { url: string };
      setUrl(body.url);
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
        </div>
      ) : null}
    </div>
  );
}
