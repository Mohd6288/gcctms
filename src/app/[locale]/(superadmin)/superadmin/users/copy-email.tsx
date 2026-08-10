"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

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
      className="max-w-[18rem] truncate text-start text-primary hover:underline"
    >
      {copied ? t("copied") : email}
    </button>
  );
}
