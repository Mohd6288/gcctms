import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listPaymentsAwaitingVerification } from "@/modules/payments/queries";

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
  const payments = authorize("verify_payments", context) ? await listPaymentsAwaitingVerification() : [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
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
    </div>
  );
}
