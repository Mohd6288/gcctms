import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listPaymentsAwaitingQuotation, listPaymentsAwaitingVerification } from "@/modules/payments/queries";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function AdminPaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.payments");

  const context = await getContext();
  const allowed = authorize("verify_payments", context);
  // Sequential, not Promise.all — concurrent Drizzle calls stall against the
  // Supabase pooler (see db/index.ts).
  const awaitingQuotation = allowed ? await listPaymentsAwaitingQuotation(context?.region) : [];
  const payments = allowed ? await listPaymentsAwaitingVerification(context?.region) : [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      {context?.region ? <p className="text-sm text-muted-foreground">{t("regionScopedNote", { region: context.region })}</p> : null}

      {/* Comes first: nothing moves in the queue below until the quotation
          for these has gone out. */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">{t("quotationQueueTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("quotationQueueHint")}</p>
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="p-3 text-start font-medium">{t("tableCompany")}</th>
                <th className="p-3 text-start font-medium">{t("tableCourse")}</th>
                <th className="p-3 text-start font-medium">{t("tableEstimate")}</th>
                <th className="p-3 text-start font-medium">{t("tableCreated")}</th>
                <th className="p-3 text-start font-medium" />
              </tr>
            </thead>
            <tbody>
              {awaitingQuotation.length === 0 ? (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={5}>
                    {t("quotationQueueEmpty")}
                  </td>
                </tr>
              ) : (
                awaitingQuotation.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="p-3">{row.companyName}</td>
                    <td className="p-3">{locale === "ar" ? row.courseTitleAr : row.courseTitleEn}</td>
                    <td className="p-3 text-muted-foreground">{row.totalAmount} SAR</td>
                    <td className="p-3">{new Date(row.createdAt).toLocaleDateString(locale)}</td>
                    <td className="p-3">
                      <Link href={`/admin/requests/${row.requestId}`} className="text-primary hover:underline">
                        {t("uploadQuotation")}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{t("verifyQueueTitle")}</h2>
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="p-3 text-start font-medium">{t("tableCompany")}</th>
              <th className="p-3 text-start font-medium">{t("tableCourse")}</th>
              <th className="p-3 text-start font-medium">{t("tableTotal")}</th>
              <th className="p-3 text-start font-medium">{t("tableCreated")}</th>
              <th className="p-3 text-start font-medium" />
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={5}>
                  {t("empty")}
                </td>
              </tr>
            ) : (
              payments.map((payment) => (
                <tr key={payment.id} className="border-b border-border last:border-0">
                  <td className="p-3">{payment.companyName}</td>
                  <td className="p-3">{locale === "ar" ? payment.courseTitleAr : payment.courseTitleEn}</td>
                  <td className="p-3">{payment.totalAmount} SAR</td>
                  <td className="p-3">{new Date(payment.createdAt).toLocaleDateString(locale)}</td>
                  <td className="p-3">
                    <Link href={`/admin/requests/${payment.requestId}`} className="text-primary hover:underline">
                      {t("review")}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </section>
    </div>
  );
}
