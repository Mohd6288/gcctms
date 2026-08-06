import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getIssuedCertificateBySerial } from "@/modules/certification/queries";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// See admin/classes/[id]/page.tsx's comment — generateStaticParams only
// covers `locale`, so every real [serial] falls back to on-demand
// rendering; without this, the DB read below throws DYNAMIC_SERVER_USAGE in
// production (this is a public page, so it must also stay live/uncached —
// a stale-cached "valid" result for an expired/revoked certificate would be
// a real security problem, not just a bug).
export const dynamic = "force-dynamic";

// Deliberately not masked in the query layer's SELECT (name is fetched in
// full) but masked here at render time — keeps the masking rule visible
// and easy to audit in one place. Real-world verification pages show
// enough to confirm identity to someone who already knows the holder
// without exposing the full name to an anonymous scanner: first name in
// full, every other word reduced to an initial.
function maskName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  return [parts[0], ...parts.slice(1).map((p) => `${p[0]}.`)].join(" ");
}

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ locale: string; serial: string }>;
}) {
  const { locale, serial } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("verify");

  const cert = await getIssuedCertificateBySerial(serial);

  // Computed live against expires_at/status at request time — never a
  // stored "expired" status (roles-and-workflows.md's public verify spec).
  const now = new Date();
  const isExpired = cert?.expiresAt != null && new Date(cert.expiresAt) < now;
  const outcome: "valid" | "expired" | "revoked" | "not_found" = !cert
    ? "not_found"
    : cert.status === "revoked"
      ? "revoked"
      : isExpired
        ? "expired"
        : "valid";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-md rounded-2xl border border-border p-6">
        {outcome === "valid" ? (
          <div className="flex flex-col gap-3 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">✓</span>
            <h1 className="text-lg font-semibold">{t("validTitle")}</h1>
            <dl className="mt-2 flex flex-col gap-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("holder")}</dt>
                <dd className="font-medium">{maskName(cert!.employeeFullNameEn)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("course")}</dt>
                <dd className="font-medium">
                  {cert!.courseCode} — {locale === "ar" ? cert!.courseTitleAr : cert!.courseTitleEn}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("issued")}</dt>
                <dd className="font-medium">{cert!.issuedAt ? new Date(cert!.issuedAt).toLocaleDateString(locale) : "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("expires")}</dt>
                <dd className="font-medium">{cert!.expiresAt ? new Date(cert!.expiresAt).toLocaleDateString(locale) : "—"}</dd>
              </div>
            </dl>
          </div>
        ) : outcome === "expired" ? (
          <div className="flex flex-col gap-3 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl text-amber-700 dark:bg-amber-950 dark:text-amber-300">!</span>
            <h1 className="text-lg font-semibold">{t("expiredTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("expiredBody", { date: cert!.expiresAt ? new Date(cert!.expiresAt).toLocaleDateString(locale) : "" })}</p>
          </div>
        ) : outcome === "revoked" ? (
          <div className="flex flex-col gap-3 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl text-red-700 dark:bg-red-950 dark:text-red-300">✕</span>
            <h1 className="text-lg font-semibold">{t("revokedTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("revokedBody")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-2xl text-muted-foreground">?</span>
            <h1 className="text-lg font-semibold">{t("notFoundTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("notFoundBody")}</p>
          </div>
        )}
      </div>
      <Link href="/sign-in" className="text-sm text-muted-foreground hover:underline">
        {t("backToSite")}
      </Link>
    </div>
  );
}
