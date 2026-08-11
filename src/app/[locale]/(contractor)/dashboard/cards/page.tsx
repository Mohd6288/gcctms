import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getContext } from "@/modules/platform/auth/service";
import { listCardsForCompany } from "@/modules/cards/queries";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Cards sit beside certificates rather than inside them. A certificate is
// issued by GCC Lab and verifiable on the public page; these are printed by
// the manufacturer, and folding them together would have the platform vouch
// for something it did not issue.
export default async function ContractorCardsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contractor.cards");

  const context = await getContext();
  if (!context?.companyId) {
    redirect({ href: "/dashboard", locale });
    return null;
  }

  const cards = await listCardsForCompany(context.companyId);
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", { dateStyle: "medium" });

  // 60 days is roughly the time it takes to raise a request, be invoiced, pay,
  // and be scheduled — so a warning any later is a warning too late.
  const EXPIRING_SOON_DAYS = 60;
  const expiringSoon = cards.filter((c) => c.daysToExpiry != null && c.daysToExpiry >= 0 && c.daysToExpiry <= EXPIRING_SOON_DAYS);
  const expired = cards.filter((c) => c.daysToExpiry != null && c.daysToExpiry < 0);

  function tone(card: (typeof cards)[number]) {
    if (card.daysToExpiry == null) return "bg-muted text-muted-foreground";
    if (card.daysToExpiry < 0) return "bg-destructive/15 text-destructive";
    if (card.daysToExpiry <= EXPIRING_SOON_DAYS) return "bg-warning/15 text-warning";
    return "bg-success/15 text-success";
  }

  function label(card: (typeof cards)[number]) {
    if (card.status === "awaiting_issuer") return t("withManufacturer");
    if (card.daysToExpiry == null) return t(`status.${card.status}`);
    if (card.daysToExpiry < 0) return t("expiredOn", { date: dateFmt.format(new Date(card.expiresAt!)) });
    if (card.daysToExpiry <= EXPIRING_SOON_DAYS) return t("expiresInDays", { days: card.daysToExpiry });
    return t("validTo", { date: dateFmt.format(new Date(card.expiresAt!)) });
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {/* Said once, at the top, rather than repeated on every row. A lapsed
          card is the kind of thing a contractor discovers at a site gate. */}
      {expired.length > 0 || expiringSoon.length > 0 ? (
        <div
          className={`max-w-3xl rounded-lg p-3 text-sm ${
            expired.length > 0 ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
          }`}
        >
          {expired.length > 0 ? <p className="font-medium">{t("expiredWarning", { count: expired.length })}</p> : null}
          {expiringSoon.length > 0 ? <p>{t("expiringWarning", { count: expiringSoon.length, days: EXPIRING_SOON_DAYS })}</p> : null}
        </div>
      ) : null}

      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="p-3 text-start font-medium">{t("tableEmployee")}</th>
                <th className="p-3 text-start font-medium">{t("tableQualification")}</th>
                <th className="p-3 text-start font-medium">{t("tableCardNumber")}</th>
                <th className="p-3 text-start font-medium">{t("tableTested")}</th>
                <th className="p-3 text-start font-medium">{t("tableValidity")}</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((card) => (
                <tr key={card.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-medium">{card.employeeName}</td>
                  <td className="p-3">{locale === "ar" ? card.courseTitleAr : card.courseTitleEn}</td>
                  <td className="p-3 font-mono text-xs">{card.cardNumber ?? "—"}</td>
                  <td className="p-3 tabular-nums">{dateFmt.format(new Date(card.testDate))}</td>
                  <td className="p-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone(card)}`}>{label(card)}</span>
                    {card.status === "collected" && card.collectedByName ? (
                      <span className="ms-2 text-xs text-muted-foreground">
                        {t("collectedBy", { name: card.collectedByName })}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="max-w-3xl text-xs text-muted-foreground">{t("footnote")}</p>
    </div>
  );
}
