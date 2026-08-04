import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getContext } from "@/modules/platform/auth/service";
import { listPaymentsForCompany } from "@/modules/payments/queries";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function ContractorPaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contractor.payments");

  const context = await getContext();
  if (!context?.companyId) {
    redirect({ href: "/dashboard", locale });
    return null;
  }

  const payments = await listPaymentsForCompany(context.companyId);

  const statusLabels: Record<string, string> = {
    uploaded: t("statusUploaded"),
    verified: t("statusVerified"),
    rejected: t("statusRejected"),
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="p-3 text-start font-medium">{t("tableCourse")}</th>
              <th className="p-3 text-start font-medium">{t("tableTotal")}</th>
              <th className="p-3 text-start font-medium">{t("tableDueDate")}</th>
              <th className="p-3 text-start font-medium">{t("tableStatus")}</th>
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
                  <td className="p-3">{locale === "ar" ? payment.courseTitleAr : payment.courseTitleEn}</td>
                  <td className="p-3">{payment.totalAmount ?? "—"} SAR</td>
                  <td className="p-3">{payment.dueDate ?? "—"}</td>
                  <td className="p-3">{statusLabels[payment.status] ?? payment.status}</td>
                  <td className="p-3">
                    <Link href={`/dashboard/requests/${payment.requestId}`} className="text-primary hover:underline">
                      {t("view")}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
