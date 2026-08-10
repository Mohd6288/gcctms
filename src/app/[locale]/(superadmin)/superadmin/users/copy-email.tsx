"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";

// The email is here to be used — typed into a sign-in form when testing an
// account, or pasted into a message. Selecting it out of a table cell is
// fiddly enough that a copy button earns its place.
export function CopyEmail({ email }: { email: string }) {
  const t = useTranslations("superadmin.users");
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      title={t("copyEmail")}
      onClick={() => {
        navigator.clipboard.writeText(email);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      // Was link-coloured text, which read as a mailto and gave no hint a
      // click would copy. A bordered chip with an icon says "control".
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-muted"
    >
      <span className="truncate">{email}</span>
      {copied ? <Check className="size-3.5 shrink-0 text-success" aria-hidden /> : <Copy className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
      <span className="sr-only">{copied ? t("copied") : t("copyEmail")}</span>
    </button>
  );
}
